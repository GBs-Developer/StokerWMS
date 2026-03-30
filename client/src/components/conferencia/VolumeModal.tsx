import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
    Package, ShoppingBag, Archive, Box, Tag,
    Loader2, CheckCircle2, PackageOpen, Search, X, ArrowLeft, Trash2, Printer,
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
    { key: "sacola", label: "Sacola",  icon: ShoppingBag, color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-950/30"   },
    { key: "caixa",  label: "Caixa",   icon: Box,          color: "text-amber-600",  bg: "bg-amber-50 dark:bg-amber-950/30" },
    { key: "saco",   label: "Saco",    icon: Archive,      color: "text-green-600",  bg: "bg-green-50 dark:bg-green-950/30" },
    { key: "avulso", label: "Avulso",  icon: Tag,          color: "text-slate-600",  bg: "bg-slate-50 dark:bg-slate-900/30" },
] as const;

const ALLOWED_STATUSES = ["separado", "em_conferencia", "conferido", "com_excecao"];

const STATUS_LABELS: Record<string, string> = {
    separado:       "Separado",
    em_conferencia: "Em Conferência",
    conferido:      "Conferido",
    com_excecao:    "Com Exceção",
};

const STATUS_COLORS: Record<string, string> = {
    separado:       "bg-slate-100 text-slate-700 border-slate-300",
    em_conferencia: "bg-blue-100 text-blue-700 border-blue-300",
    conferido:      "bg-green-100 text-green-700 border-green-300",
    com_excecao:    "bg-orange-100 text-orange-700 border-orange-300",
};

type Screen = "search" | "form";

export function VolumeModal({ open, onClose, defaultErpOrderId }: VolumeModalProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { user } = useAuth();

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

    useEffect(() => {
        if (!open) {
            setScreen("search"); setSearch(""); setOrder(null);
            setOrderList(null); setSearchError("");
            setCounts({ sacola: 0, caixa: 0, saco: 0, avulso: 0 });
            setDateRange({ from: subDays(new Date(), 6), to: new Date() });
        }
    }, [open]);

    useEffect(() => {
        if (open && defaultErpOrderId) {
            setSearch(defaultErpOrderId);
            doSearch(defaultErpOrderId);
        }
    }, [open, defaultErpOrderId]);

    const { data: savedVolume, isLoading: loadingVolume } = useQuery<OrderVolume | null>({
        queryKey: [`/api/order-volumes/${order?.id}`],
        enabled: !!order?.id && screen === "form",
    });

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
            toast({ title: "Volumes salvos!", description: `${total} volume(s) para o pedido ${order?.erpOrderId}.` });
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
            toast({ title: "Volumes apagados", description: `Volumes do pedido ${order?.erpOrderId} removidos.` });
        },
        onError: (err: any) => {
            toast({ title: "Erro ao apagar", description: err?.message || "Tente novamente.", variant: "destructive" });
        },
    });

    const adjust = (key: keyof typeof counts, delta: number) =>
        setCounts(prev => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));

    const buildVolumesHtml = (): string => {
        if (total === 0 || !order) return "";
        const operatorName = user?.name || user?.username || "—";
        const dateStr = new Date().toLocaleDateString("pt-BR");
        const timeStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const packSummary = [
            counts.sacola > 0 ? `${counts.sacola} Sacola${counts.sacola > 1 ? "s" : ""}` : "",
            counts.caixa  > 0 ? `${counts.caixa} Cx`   : "",
            counts.saco   > 0 ? `${counts.saco} Saco${counts.saco > 1 ? "s" : ""}`   : "",
            counts.avulso > 0 ? `${counts.avulso} Avul.` : "",
        ].filter(Boolean).join(" | ");
        const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        const labels = Array.from({ length: total }, (_, i) => `
<div class="label">
  <div class="hdr">
    <div class="hdr-left"><div class="hdr-tag">PEDIDO</div><div class="hdr-os">${esc(order.erpOrderId)}</div></div>
    <div class="hdr-right"><div class="hdr-tag" style="text-align:right">VOLUME</div><div class="hdr-vol">${i + 1}<span class="hdr-vol-total"> / ${total}</span></div></div>
  </div>
  <div class="section customer-section">
    <div class="field-label">DESTINATÁRIO</div>
    <div class="customer-name">${esc(order.customerName || "—")}</div>
  </div>
  ${packSummary ? `<div class="section pack-section"><div class="field-label">EMBALAGENS</div><div class="pack-detail">${esc(packSummary)}</div></div>` : ""}
  <div class="barcode-area">
    <div class="barcode">${esc(order.erpOrderId)}</div>
    <div class="barcode-num">${esc(order.erpOrderId)}</div>
  </div>
  <div class="footer">
    <div class="footer-row">
      <div class="footer-item"><span class="footer-label">Conf.</span><span class="footer-val">${esc(operatorName)}</span></div>
      <div class="footer-item footer-right"><span class="footer-label">Data</span><span class="footer-val">${esc(dateStr)} ${esc(timeStr)}</span></div>
    </div>
    <div class="pedido-row"><span class="pedido-label">PEDIDO.&nbsp;</span><span class="pedido-num">${esc(order.erpOrderId)}</span></div>
  </div>
</div>`).join("");
        return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128+Text&display=swap" rel="stylesheet">
<style>
@page{size:10cm 15cm;margin:0}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;background:#fff;font-size:11px;color:#000}
.label{width:10cm;height:15cm;border:1.5px solid #000;page-break-after:always;display:flex;flex-direction:column;overflow:hidden}
.label:last-child{page-break-after:avoid}
.hdr{background:#162d4a;color:#fff;display:flex;justify-content:space-between;align-items:flex-end;padding:5px 8px;border-bottom:2px solid #000}
.hdr-left,.hdr-right{display:flex;flex-direction:column}.hdr-right{align-items:flex-end}
.hdr-tag{font-size:8px;color:#aac6e8;letter-spacing:.5px;text-transform:uppercase}
.hdr-os{font-size:18px;font-weight:bold;letter-spacing:.5px;line-height:1}
.hdr-vol{font-size:36px;font-weight:900;line-height:1}.hdr-vol-total{font-size:18px;font-weight:400;color:#aac6e8}
.section{padding:5px 8px;border-bottom:1px solid #ccc}
.field-label{font-size:7.5px;color:#777;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
.customer-section{background:#f7faff}.customer-name{font-size:14px;font-weight:bold;line-height:1.2}
.pack-section{background:#fffbe6}.pack-detail{font-size:11px;font-weight:600;color:#555}
.barcode-area{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px 8px 2px;border-bottom:1px solid #ccc}
.barcode{font-family:'Libre Barcode 128 Text',monospace;font-size:56px;line-height:1;letter-spacing:0;white-space:nowrap;max-width:100%;overflow:hidden}
.barcode-num{font-size:9px;color:#333;margin-top:1px;letter-spacing:1px;font-family:monospace}
.footer{padding:5px 8px 4px;background:#f0f4f8}
.footer-row{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px dashed #bbb;padding-bottom:4px;margin-bottom:4px}
.footer-item{display:flex;flex-direction:column}.footer-right{align-items:flex-end}
.footer-label{font-size:7.5px;color:#888;text-transform:uppercase}.footer-val{font-size:10px;font-weight:bold;color:#111}
.pedido-row{display:flex;align-items:baseline}.pedido-label{font-size:10px;color:#555;font-weight:600}
.pedido-num{font-size:20px;font-weight:900;color:#000;letter-spacing:.5px}
</style></head><body>${labels}</body></html>`;
    };

    return (
        <Sheet open={open} onOpenChange={v => !v && onClose()}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-[400px] p-0 flex flex-col gap-0"
                data-testid="sheet-volume"
            >
                {/* ── CABEÇALHO ─────────────────────────────────── */}
                <SheetHeader className="px-4 py-3 bg-slate-900 text-white shrink-0 space-y-0">
                    <div className="flex items-center gap-3">
                        {screen === "form" && (
                            <button
                                onClick={goBack}
                                className="text-white/60 hover:text-white transition-colors shrink-0"
                                data-testid="btn-volume-back"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </button>
                        )}
                        <PackageOpen className="h-4 w-4 text-blue-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <SheetTitle className="text-white text-sm font-semibold leading-tight">
                                Gerar Volume
                            </SheetTitle>
                            <SheetDescription className="text-slate-400 text-xs truncate mt-0.5">
                                {screen === "search"
                                    ? "Busque ou liste os pedidos disponíveis"
                                    : order
                                        ? `Ped. ${order.erpOrderId} · ${order.customerName || ""}`
                                        : ""}
                            </SheetDescription>
                        </div>
                        {screen === "form" && savedVolume && (
                            <Badge className="shrink-0 bg-green-600/90 text-white text-[10px] px-2 py-0.5 gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Salvo
                            </Badge>
                        )}
                    </div>
                </SheetHeader>

                {/* ── TELA: BUSCA ───────────────────────────────── */}
                {screen === "search" && (
                    <div className="flex flex-col flex-1 overflow-hidden">
                        {/* Filtros fixos */}
                        <div className="px-4 pt-4 pb-3 space-y-3 border-b border-border shrink-0">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Input
                                        placeholder="Nº do pedido (vazio = listar todos)"
                                        value={search}
                                        onChange={e => { setSearch(e.target.value); setSearchError(""); setOrderList(null); }}
                                        onKeyDown={e => e.key === "Enter" && handleSearch()}
                                        className="pr-8 text-sm font-mono h-10"
                                        inputMode="numeric"
                                        autoFocus
                                        data-testid="input-volume-search"
                                    />
                                    {search && (
                                        <button
                                            onClick={() => { setSearch(""); setSearchError(""); setOrderList(null); }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                                <Button
                                    size="sm"
                                    className="h-10 w-10 p-0 shrink-0"
                                    onClick={handleSearch}
                                    disabled={searching}
                                    data-testid="btn-volume-search"
                                >
                                    {searching
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Search className="h-4 w-4" />}
                                </Button>
                            </div>

                            <div>
                                <p className="text-[11px] text-muted-foreground font-medium mb-1.5">Filtrar por período</p>
                                <DatePickerWithRange date={dateRange} onDateChange={setDateRange} className="w-full" />
                            </div>

                            {searchError && (
                                <p className="text-xs text-destructive font-medium">{searchError}</p>
                            )}

                            {orderList !== null && (
                                <p className="text-xs text-muted-foreground">
                                    {orderList.length === 0
                                        ? "Nenhum pedido no período."
                                        : `${orderList.length} pedido(s) encontrado(s)`}
                                </p>
                            )}
                        </div>

                        {/* Lista / Estado vazio */}
                        <div className="flex-1 overflow-y-auto">
                            {orderList === null && !searching && (
                                <div className="flex flex-col items-center justify-center h-full px-6 py-10 text-center gap-3">
                                    <Package className="h-10 w-10 text-muted-foreground/20" />
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Digite o número e toque em <Search className="h-3 w-3 inline" />, ou toque em <Search className="h-3 w-3 inline" /> <strong>sem número</strong> para listar todos no período.
                                    </p>
                                </div>
                            )}

                            {orderList !== null && orderList.length > 0 && (
                                <div className="divide-y divide-border/60">
                                    {orderList.map(row => (
                                        <button
                                            key={row.id}
                                            className="w-full text-left px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors"
                                            onClick={() => selectOrder(row)}
                                            data-testid={`btn-volume-order-${row.id}`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="font-mono font-bold text-sm">{row.erpOrderId}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{row.customerName}</p>
                                                    {row.createdAt && (
                                                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                                            {format(new Date(row.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border ${STATUS_COLORS[row.status] ?? ""}`}>
                                                    {STATUS_LABELS[row.status] ?? row.status}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── TELA: FORMULÁRIO ──────────────────────────── */}
                {screen === "form" && order && (
                    <div className="flex flex-col flex-1 overflow-hidden">
                        {/* Faixa do pedido */}
                        <div className="px-4 py-2.5 bg-muted/40 border-b border-border shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-sm">{order.erpOrderId}</span>
                                <span className="truncate text-xs text-muted-foreground flex-1">{order.customerName}</span>
                                <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border ${STATUS_COLORS[order.status] ?? ""}`}>
                                    {STATUS_LABELS[order.status] ?? order.status}
                                </span>
                            </div>
                        </div>

                        {/* Contadores */}
                        <div className="flex-1 overflow-y-auto">
                            {loadingVolume ? (
                                <div className="flex justify-center py-10">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <div className="px-4 py-4 space-y-2.5">
                                    {CATEGORIES.map(({ key, label, icon: Icon, color, bg }) => (
                                        <div
                                            key={key}
                                            className={`flex items-center justify-between rounded-xl border border-border px-3 py-3 ${bg}`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <Icon className={`h-5 w-5 shrink-0 ${color}`} />
                                                <span className="font-medium text-sm">{label}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => adjust(key, -1)}
                                                    className="w-10 h-10 rounded-lg border bg-background/80 flex items-center justify-center text-xl font-bold hover:bg-muted active:scale-95 transition-transform select-none"
                                                    data-testid={`btn-volume-${key}-minus`}
                                                >−</button>
                                                <span className="w-9 text-center font-extrabold text-lg tabular-nums">{counts[key]}</span>
                                                <button
                                                    onClick={() => adjust(key, 1)}
                                                    className="w-10 h-10 rounded-lg border bg-background/80 flex items-center justify-center text-xl font-bold hover:bg-muted active:scale-95 transition-transform select-none"
                                                    data-testid={`btn-volume-${key}-plus`}
                                                >+</button>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Total */}
                                    <div className="flex items-center justify-between rounded-xl px-3 py-3 bg-blue-600 dark:bg-blue-700">
                                        <div className="flex items-center gap-2">
                                            <Package className="h-5 w-5 text-white/80" />
                                            <span className="font-semibold text-sm text-white">Total de Volumes</span>
                                        </div>
                                        <span className="text-2xl font-extrabold text-white tabular-nums" data-testid="text-volume-total">{total}</span>
                                    </div>

                                    {total > 0 && (
                                        <p className="text-[11px] text-muted-foreground px-1">
                                            {Array.from({ length: Math.min(total, 5) }, (_, i) => `${i + 1}/${total}`).join(" · ")}
                                            {total > 5 ? ` · … · ${total}/${total}` : ""}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Ações */}
                        <div className="px-4 pb-4 pt-3 border-t border-border flex gap-2 shrink-0 bg-background">
                            {savedVolume && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 h-10 w-10 p-0 text-destructive border-destructive/40 hover:bg-destructive hover:text-white hover:border-destructive"
                                    onClick={() => {
                                        if (confirm(`Apagar volumes do pedido ${order.erpOrderId}?`)) {
                                            deleteMutation.mutate();
                                        }
                                    }}
                                    disabled={deleteMutation.isPending || saveMutation.isPending}
                                    title="Apagar volumes"
                                    data-testid="btn-volume-delete"
                                >
                                    {deleteMutation.isPending
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Trash2 className="h-4 w-4" />}
                                </Button>
                            )}

                            {total > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 h-10 px-3 gap-1.5"
                                    onClick={() => printVolume(buildVolumesHtml(), "volume_label")}
                                    disabled={saveMutation.isPending || printing || cooldownSeconds > 0}
                                    title={cooldownSeconds > 0 ? `Aguarde ${cooldownSeconds}s` : "Imprimir etiquetas"}
                                    data-testid="btn-volume-print"
                                >
                                    {printing
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : cooldownSeconds > 0
                                            ? <><Printer className="h-4 w-4 opacity-50" /><span className="text-xs font-mono">{cooldownSeconds}s</span></>
                                            : <Printer className="h-4 w-4" />}
                                </Button>
                            )}

                            <Button
                                className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white gap-2"
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