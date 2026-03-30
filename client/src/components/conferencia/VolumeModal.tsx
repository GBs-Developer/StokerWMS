import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Sheet, SheetContent, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
    Package, ShoppingBag, Archive, Box, Tag,
    Loader2, CheckCircle2, PackageOpen, Search, X, ArrowLeft, Trash2, Printer, ChevronRight,
} from "lucide-react";
import { usePrint } from "@/hooks/use-print";
import { useAuth } from "@/lib/auth";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import type { DateRange } from "react-day-picker";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface VolumeModalProps {
    open: boolean;
    onClose: () => void;
    defaultErpOrderId?: string | null;
}

interface OrderRow {
    id: string;
    erpOrderId: string;
    customerName: string;
    status: string;
    createdAt: string;
    address?: string;
    addressNumber?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    routeId?: string;
}

interface RouteRow {
    id: string;
    code: string;
    name: string;
}

interface OrderVolume {
    id: string;
    orderId: string;
    sacola: number;
    caixa: number;
    saco: number;
    avulso: number;
    totalVolumes: number;
}

const CATEGORIES = [
    { key: "sacola", label: "Sacola", icon: ShoppingBag, accent: "text-blue-500",  ring: "ring-blue-200 dark:ring-blue-800" },
    { key: "caixa",  label: "Caixa",  icon: Box,         accent: "text-amber-500", ring: "ring-amber-200 dark:ring-amber-800" },
    { key: "saco",   label: "Saco",   icon: Archive,     accent: "text-green-500", ring: "ring-green-200 dark:ring-green-800" },
    { key: "avulso", label: "Avulso", icon: Tag,         accent: "text-slate-500", ring: "ring-slate-200 dark:ring-slate-700" },
] as const;

const ALLOWED_STATUSES = ["separado", "em_conferencia", "conferido", "com_excecao"];

const STATUS_LABELS: Record<string, string> = {
    separado:       "Separado",
    em_conferencia: "Em Conferência",
    conferido:      "Conferido",
    com_excecao:    "Com Exceção",
};

const STATUS_COLORS: Record<string, string> = {
    separado:       "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    em_conferencia: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    conferido:      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    com_excecao:    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

type Screen = "search" | "form";

export function VolumeModal({ open, onClose, defaultErpOrderId }: VolumeModalProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const searchRef = useRef<HTMLInputElement>(null);

    const [screen, setScreen] = useState<Screen>("search");
    const [search, setSearch] = useState("");
    const [order, setOrder] = useState<OrderRow | null>(null);
    const [orderList, setOrderList] = useState<OrderRow[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState("");
    const [counts, setCounts] = useState({ sacola: 0, caixa: 0, saco: 0, avulso: 0 });
    const { printing, cooldownSeconds, print: printVolume } = usePrint();

    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: subDays(new Date(), 6),
        to: new Date(),
    });

    const total = counts.sacola + counts.caixa + counts.saco + counts.avulso;

    // Reset ao fechar
    useEffect(() => {
        if (!open) {
            setScreen("search"); setSearch(""); setOrder(null);
            setOrderList(null); setSearchError("");
            setCounts({ sacola: 0, caixa: 0, saco: 0, avulso: 0 });
            setDateRange({ from: subDays(new Date(), 6), to: new Date() });
        }
    }, [open]);

    // Pré-preenche quando há pedido ativo
    useEffect(() => {
        if (open && defaultErpOrderId) {
            setSearch(defaultErpOrderId);
            doSearch(defaultErpOrderId);
        }
    }, [open, defaultErpOrderId]);

    // Foco no input ao abrir tela de busca
    useEffect(() => {
        if (open && screen === "search") {
            const t = setTimeout(() => searchRef.current?.focus(), 300);
            return () => clearTimeout(t);
        }
    }, [open, screen]);

    const { data: savedVolume, isLoading: loadingVolume } = useQuery<OrderVolume | null>({
        queryKey: [`/api/order-volumes/${order?.id}`],
        enabled: !!order?.id && screen === "form",
    });

    const { data: routesList } = useQuery<RouteRow[]>({
        queryKey: ["/api/routes"],
    });

    const routeCode = order?.routeId
        ? (routesList?.find(r => r.id === order.routeId)?.code ?? null)
        : null;

    useEffect(() => {
        if (savedVolume) {
            setCounts({ sacola: savedVolume.sacola, caixa: savedVolume.caixa, saco: savedVolume.saco, avulso: savedVolume.avulso });
        } else if (order) {
            setCounts({ sacola: 0, caixa: 0, saco: 0, avulso: 0 });
        }
    }, [savedVolume, order?.id]);

    const doSearch = async (term: string) => {
        setSearching(true); setSearchError(""); setOrderList(null);
        try {
            const res = await fetch(`/api/orders/by-erp/${encodeURIComponent(term.trim())}`, { credentials: "include" });
            if (res.status === 404) { setSearchError("Pedido não encontrado."); return; }
            if (!res.ok) { const e = await res.json().catch(() => ({})); setSearchError(e.error || "Erro ao buscar pedido."); return; }
            const found: OrderRow = await res.json();
            if (!ALLOWED_STATUSES.includes(found.status)) {
                setSearchError(`Status "${STATUS_LABELS[found.status] ?? found.status}" não permite gerar volumes.`);
                return;
            }
            setOrder(found);
            setScreen("form");
        } catch {
            setSearchError("Erro de conexão ao buscar pedido.");
        } finally {
            setSearching(false);
        }
    };

    const loadList = async () => {
        setSearching(true); setSearchError("");
        try {
            const res = await fetch("/api/orders", { credentials: "include" });
            if (!res.ok) { setSearchError("Erro ao carregar pedidos."); return; }
            const all: OrderRow[] = await res.json();
            const fromMs = dateRange?.from ? new Date(dateRange.from).setHours(0, 0, 0, 0) : null;
            const toMs   = dateRange?.to   ? new Date(dateRange.to).setHours(23, 59, 59, 999) : null;
            const filtered = all.filter(o => {
                if (!ALLOWED_STATUSES.includes(o.status)) return false;
                if (o.createdAt) {
                    const t = new Date(o.createdAt).getTime();
                    if (fromMs && t < fromMs) return false;
                    if (toMs   && t > toMs)   return false;
                }
                return true;
            });
            setOrderList(filtered);
        } catch {
            setSearchError("Erro de conexão ao carregar pedidos.");
        } finally {
            setSearching(false);
        }
    };

    const handleSearch = () => { search.trim() ? doSearch(search.trim()) : loadList(); };

    const selectOrder = (row: OrderRow) => {
        setOrder(row); setSearch(row.erpOrderId);
        setOrderList(null); setScreen("form");
    };

    const goBack = () => {
        setScreen("search"); setOrder(null); setOrderList(null);
        setCounts({ sacola: 0, caixa: 0, saco: 0, avulso: 0 });
    };

    const saveMutation = useMutation({
        mutationFn: () =>
            apiRequest("POST", "/api/order-volumes", {
                orderId: order!.id, erpOrderId: order!.erpOrderId, ...counts,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/order-volumes/${order?.id}`] });
            queryClient.invalidateQueries({ queryKey: ["/api/order-volumes"] });
            toast({ title: "Volumes salvos!", description: `${total} volume(s) · Pedido ${order?.erpOrderId}.` });
        },
        onError: (err: any) => {
            toast({ title: "Erro ao salvar", description: err?.message || "Tente novamente.", variant: "destructive" });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => apiRequest("DELETE", `/api/order-volumes/${order?.id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/order-volumes/${order?.id}`] });
            queryClient.invalidateQueries({ queryKey: ["/api/order-volumes"] });
            setCounts({ sacola: 0, caixa: 0, saco: 0, avulso: 0 });
            toast({ title: "Volumes apagados", description: `Pedido ${order?.erpOrderId}.` });
        },
        onError: (err: any) => {
            toast({ title: "Erro ao apagar", description: err?.message || "Tente novamente.", variant: "destructive" });
        },
    });

    const adjust = (key: keyof typeof counts, delta: number) =>
        setCounts(prev => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));

    const buildVolumesHtml = (): string => {
        if (total === 0 || !order) return "";
        const op  = user?.name || user?.username || "—";
        const now = new Date();
        const dStr = now.toLocaleDateString("pt-BR");
        const tStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const esc = (s?: string | null) => (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const addressLine = [order.address, order.addressNumber ? `nº ${order.addressNumber}` : ""].filter(Boolean).join(", ");
        const cityLine = [order.city, order.state].filter(Boolean).join(" - ");
        const labels = Array.from({ length: total }, (_, i) => {
            const volNum = i + 1;
            const barcode = `${order.erpOrderId}${String(volNum).padStart(3, "0")}`;
            return `
<div class="label">
  <div class="hdr">
    <div class="hdr-left"><div class="hdr-tag">PEDIDO</div><div class="hdr-os">${esc(order.erpOrderId)}</div></div>
    <div class="hdr-right"><div class="hdr-tag" style="text-align:right">VOLUME</div><div class="hdr-vol">${volNum}<span class="hdr-vol-total"> / ${total}</span></div></div>
  </div>
  <div class="two-col">
    <div class="col-cell"><div class="field-label">ROTA ID</div><div class="col-val">${esc(routeCode) || "—"}</div></div>
    <div class="col-cell col-right"><div class="field-label" style="text-align:right">PACOTE ID</div><div class="col-val" style="text-align:right">${volNum}</div></div>
  </div>
  <div class="section customer-section">
    <div class="field-label">DESTINATÁRIO</div>
    <div class="customer-name">${esc(order.customerName || "—")}</div>
    ${addressLine ? `<div class="address-line">${esc(addressLine)}</div>` : ""}
    ${order.neighborhood ? `<div class="address-line">${esc(order.neighborhood)}</div>` : ""}
    ${cityLine ? `<div class="address-line city-line">${esc(cityLine)}</div>` : ""}
  </div>
  <div class="volume-center">
    <div class="vol-label">VOLUME</div>
    <div class="vol-num">${volNum}<span class="vol-total"> / ${total}</span></div>
  </div>
  <div class="footer">
    <div class="footer-row">
      <div class="footer-item"><span class="footer-label">CONFERIDO POR</span><span class="footer-val">${esc(op)}</span></div>
      <div class="footer-item footer-right"><span class="footer-label">DATA/HORA</span><span class="footer-val">${esc(dStr)} ${esc(tStr)}</span></div>
    </div>
  </div>
  <div class="barcode-area">
    <div class="barcode">${esc(barcode)}</div>
    <div class="barcode-num">${esc(barcode)}</div>
  </div>
</div>`;
        }).join("");
        return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128+Text&display=swap" rel="stylesheet">
<style>
@page{size:10cm 15cm;margin:0}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;background:#fff;font-size:11px;color:#000}
.label{width:10cm;height:15cm;border:1.5px solid #000;page-break-after:always;display:flex;flex-direction:column;overflow:hidden}.label:last-child{page-break-after:avoid}
.hdr{background:#111;color:#fff;display:flex;justify-content:space-between;align-items:flex-end;padding:5px 8px;border-bottom:2px solid #000}
.hdr-left,.hdr-right{display:flex;flex-direction:column}.hdr-right{align-items:flex-end}
.hdr-tag{font-size:8px;color:#aaa;letter-spacing:.5px;text-transform:uppercase}.hdr-os{font-size:18px;font-weight:bold;line-height:1}
.hdr-vol{font-size:32px;font-weight:900;line-height:1}.hdr-vol-total{font-size:16px;font-weight:400;color:#aaa}
.two-col{display:flex;border-bottom:1px solid #ccc}.col-cell{flex:1;padding:4px 8px}.col-right{border-left:1px solid #ccc}
.field-label{font-size:7.5px;color:#777;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px}.col-val{font-size:13px;font-weight:bold}
.section{padding:5px 8px;border-bottom:1px solid #ccc}.customer-section{background:#f7faff}
.customer-name{font-size:13px;font-weight:bold;line-height:1.2;margin-bottom:2px}.address-line{font-size:10px;color:#333;line-height:1.3}.city-line{font-weight:600}
.volume-center{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-bottom:1px solid #ccc;padding:4px}
.vol-label{font-size:9px;color:#777;text-transform:uppercase;letter-spacing:1px}.vol-num{font-size:52px;font-weight:900;line-height:1;color:#111}.vol-total{font-size:26px;font-weight:400;color:#555}
.footer{padding:5px 8px;background:#f0f4f8;border-bottom:1px solid #ccc}
.footer-row{display:flex;justify-content:space-between;align-items:flex-start}
.footer-item{display:flex;flex-direction:column}.footer-right{align-items:flex-end}
.footer-label{font-size:7.5px;color:#888;text-transform:uppercase}.footer-val{font-size:10px;font-weight:bold;color:#111}
.barcode-area{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 8px 3px}
.barcode{font-family:'Libre Barcode 128 Text',monospace;font-size:48px;line-height:1;white-space:nowrap;max-width:100%;overflow:hidden}
.barcode-num{font-size:9px;color:#333;letter-spacing:1px;font-family:monospace}
</style>
<script>window.onload=function(){window.print();}</script>
</head><body>${labels}</body></html>`;
    };

    const headerGradient = "bg-gradient-to-br from-[hsl(222,47%,14%)] via-[hsl(217,60%,28%)] to-[hsl(199,89%,30%)]";

    return (
        <Sheet open={open} onOpenChange={v => !v && onClose()}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-[400px] p-0 flex flex-col gap-0 [&>button]:hidden"
                data-testid="sheet-volume"
            >
                {/* Acessibilidade — títulos ocultos visualmente */}
                <SheetTitle className="sr-only">Gerar Volume</SheetTitle>
                <SheetDescription className="sr-only">
                    {screen === "search" ? "Buscar pedido para gerar volumes" : order ? `Volumes do pedido ${order.erpOrderId}` : ""}
                </SheetDescription>

                {/* ── GRADIENT HEADER (padrão do app) ─────────────── */}
                <div className={`${headerGradient} relative overflow-hidden px-4 py-4 shrink-0`}>
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,179,237,0.15),_transparent_60%)]" />
                    <div className="relative flex items-center gap-3">
                        {screen === "form" ? (
                            <button
                                onClick={goBack}
                                className="text-white/70 hover:text-white transition-colors shrink-0 -ml-1 p-1"
                                data-testid="btn-volume-back"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                        ) : (
                            <PackageOpen className="h-5 w-5 text-blue-300 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                            <h2 className="text-white font-bold text-base leading-tight tracking-tight">
                                {screen === "search" ? "Gerar Volume" : `Pedido ${order?.erpOrderId}`}
                            </h2>
                            <p className="text-white/60 text-xs truncate mt-0.5">
                                {screen === "search"
                                    ? "Busque ou liste os pedidos disponíveis"
                                    : order?.customerName || ""}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {screen === "form" && savedVolume && (
                                <Badge className="bg-green-500/20 text-green-200 border border-green-400/30 text-[10px] gap-1 px-2">
                                    <CheckCircle2 className="h-3 w-3" /> Salvo
                                </Badge>
                            )}
                            <button
                                onClick={onClose}
                                className="text-white/60 hover:text-white transition-colors p-1"
                                data-testid="btn-volume-close"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── TELA BUSCA ──────────────────────────────────── */}
                {screen === "search" && (
                    <div className="flex flex-col flex-1 overflow-hidden bg-background">
                        <div className="px-4 pt-4 pb-3 space-y-3 border-b border-border/50 shrink-0">
                            {/* Campo de busca */}
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                                    <Input
                                        ref={searchRef}
                                        placeholder="Nº do pedido (vazio = listar todos)"
                                        value={search}
                                        onChange={e => { setSearch(e.target.value); setSearchError(""); setOrderList(null); }}
                                        onKeyDown={e => e.key === "Enter" && handleSearch()}
                                        className="pl-9 pr-8 h-12 rounded-xl text-sm font-mono"
                                        inputMode="numeric"
                                        data-testid="input-volume-search"
                                    />
                                    {search && (
                                        <button
                                            onClick={() => { setSearch(""); setSearchError(""); setOrderList(null); }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                                <Button
                                    className="h-12 w-12 rounded-xl p-0 shrink-0"
                                    onClick={handleSearch}
                                    disabled={searching}
                                    data-testid="btn-volume-search"
                                >
                                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                </Button>
                            </div>

                            {/* Filtro de período */}
                            <div className="rounded-xl border border-border/50 bg-card p-3 space-y-1.5">
                                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Período</p>
                                <DatePickerWithRange date={dateRange} onDateChange={setDateRange} className="w-full" />
                            </div>

                            {searchError && (
                                <p className="text-sm text-destructive font-medium px-1">{searchError}</p>
                            )}
                            {orderList !== null && (
                                <p className="text-xs text-muted-foreground px-1">
                                    {orderList.length === 0 ? "Nenhum pedido no período." : `${orderList.length} pedido(s) encontrado(s)`}
                                </p>
                            )}
                        </div>

                        {/* Lista / vazio */}
                        <div className="flex-1 overflow-y-auto">
                            {orderList === null && !searching && (
                                <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center py-12">
                                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                                        <Package className="h-7 w-7 text-muted-foreground/30" />
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Digite o número do pedido ou toque em <strong>Buscar</strong> sem número para listar todos no período.
                                    </p>
                                </div>
                            )}

                            {orderList !== null && orderList.length > 0 && (
                                <div className="px-4 py-3 space-y-2">
                                    {orderList.map(row => (
                                        <button
                                            key={row.id}
                                            className="w-full text-left rounded-2xl border border-border/50 bg-card px-4 py-3 hover:bg-muted/50 active:scale-[0.99] transition-all flex items-center gap-3"
                                            onClick={() => selectOrder(row)}
                                            data-testid={`btn-volume-order-${row.id}`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="font-mono font-bold text-sm">{row.erpOrderId}</p>
                                                <p className="text-xs text-muted-foreground truncate mt-0.5">{row.customerName}</p>
                                                {row.createdAt && (
                                                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                                        {format(new Date(row.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-lg ${STATUS_COLORS[row.status] ?? ""}`}>
                                                    {STATUS_LABELS[row.status] ?? row.status}
                                                </span>
                                                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── TELA FORMULÁRIO ─────────────────────────────── */}
                {screen === "form" && order && (
                    <div className="flex flex-col flex-1 overflow-hidden bg-background">
                        {/* Faixa de status do pedido */}
                        <div className="px-4 py-2.5 border-b border-border/50 bg-muted/30 shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground flex-1 truncate">{order.customerName}</span>
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-lg ${STATUS_COLORS[order.status] ?? ""}`}>
                                    {STATUS_LABELS[order.status] ?? order.status}
                                </span>
                            </div>
                        </div>

                        {/* Contadores */}
                        <div className="flex-1 overflow-y-auto">
                            {loadingVolume ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
                                </div>
                            ) : (
                                <div className="px-4 py-4 space-y-2.5">
                                    {CATEGORIES.map(({ key, label, icon: Icon, accent }) => (
                                        <div
                                            key={key}
                                            className="flex items-center justify-between rounded-2xl border border-border/50 bg-card px-4 py-3"
                                            data-testid={`row-volume-${key}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Icon className={`h-5 w-5 shrink-0 ${accent}`} />
                                                <span className="font-semibold text-sm">{label}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => adjust(key, -1)}
                                                    className="w-11 h-11 rounded-xl border border-border bg-background flex items-center justify-center text-xl font-bold hover:bg-muted active:scale-95 transition-transform select-none touch-manipulation"
                                                    data-testid={`btn-volume-${key}-minus`}
                                                >−</button>
                                                <span className="w-10 text-center font-extrabold text-xl tabular-nums" data-testid={`count-volume-${key}`}>
                                                    {counts[key]}
                                                </span>
                                                <button
                                                    onClick={() => adjust(key, 1)}
                                                    className="w-11 h-11 rounded-xl border border-border bg-background flex items-center justify-center text-xl font-bold hover:bg-muted active:scale-95 transition-transform select-none touch-manipulation"
                                                    data-testid={`btn-volume-${key}-plus`}
                                                >+</button>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Total */}
                                    <div className="rounded-2xl overflow-hidden border border-blue-200/60 dark:border-blue-800/40">
                                        <div className="bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-700 dark:to-blue-600 px-4 py-4 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Package className="h-5 w-5 text-white/80" />
                                                <span className="font-semibold text-white text-sm">Total de Volumes</span>
                                            </div>
                                            <span className="text-3xl font-extrabold text-white tabular-nums" data-testid="text-volume-total">
                                                {total}
                                            </span>
                                        </div>
                                        {total > 0 && (
                                            <div className="bg-blue-50 dark:bg-blue-950/30 px-4 py-2">
                                                <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80">
                                                    {Array.from({ length: Math.min(total, 4) }, (_, i) => `${i+1}/${total}`).join(" · ")}
                                                    {total > 4 ? ` · … · ${total}/${total}` : ""}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Barra de ações */}
                        <div className="px-4 pb-safe-4 pt-3 border-t border-border/50 bg-background flex gap-2 shrink-0 safe-bottom">
                            {savedVolume && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-12 w-12 p-0 shrink-0 text-destructive border-destructive/30 hover:bg-destructive hover:text-white hover:border-destructive rounded-xl"
                                    onClick={() => { if (confirm(`Apagar volumes do pedido ${order.erpOrderId}?`)) deleteMutation.mutate(); }}
                                    disabled={deleteMutation.isPending || saveMutation.isPending}
                                    title="Apagar volumes"
                                    data-testid="btn-volume-delete"
                                >
                                    {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </Button>
                            )}

                            {total > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-12 px-4 shrink-0 gap-2 rounded-xl"
                                    onClick={() => printVolume(buildVolumesHtml(), "volume_label")}
                                    disabled={saveMutation.isPending || printing || cooldownSeconds > 0}
                                    title={cooldownSeconds > 0 ? `Aguarde ${cooldownSeconds}s` : "Imprimir etiquetas"}
                                    data-testid="btn-volume-print"
                                >
                                    {printing
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : cooldownSeconds > 0
                                            ? <><Printer className="h-4 w-4 opacity-50" /><span className="text-xs font-mono tabular-nums">{cooldownSeconds}s</span></>
                                            : <Printer className="h-4 w-4" />}
                                </Button>
                            )}

                            <Button
                                className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-2"
                                onClick={() => saveMutation.mutate()}
                                disabled={total === 0 || saveMutation.isPending}
                                data-testid="btn-volume-save"
                            >
                                {saveMutation.isPending
                                    ? <><Loader2 className="h-4 w-4 shrink-0 animate-spin" /> Salvando...</>
                                    : <><CheckCircle2 className="h-4 w-4 shrink-0" /> Salvar</>}
                            </Button>
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}