import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
    Package, ShoppingBag, Archive, Box, Tag,
    Loader2, CheckCircle2, PackageOpen, Search, X, ArrowLeft, Trash2,
} from "lucide-react";
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
    { key: "sacola", label: "Sacola", icon: ShoppingBag, color: "text-blue-500" },
    { key: "caixa", label: "Caixa", icon: Box, color: "text-amber-600" },
    { key: "saco", label: "Saco", icon: Archive, color: "text-green-600" },
    { key: "avulso", label: "Avulso", icon: Tag, color: "text-slate-600" },
] as const;

const ALLOWED_STATUSES = ["separado", "em_conferencia", "conferido", "com_excecao"];

const STATUS_LABELS: Record<string, string> = {
    separado: "Separado",
    em_conferencia: "Em Conferência",
    conferido: "Conferido",
    com_excecao: "Com Exceção",
};

const STATUS_COLORS: Record<string, string> = {
    separado: "bg-slate-100 text-slate-700 border-slate-300",
    em_conferencia: "bg-blue-100 text-blue-700 border-blue-300",
    conferido: "bg-green-100 text-green-700 border-green-300",
    com_excecao: "bg-orange-100 text-orange-700 border-orange-300",
};

type Screen = "search" | "form";

export function VolumeModal({ open, onClose, defaultErpOrderId }: VolumeModalProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [screen, setScreen] = useState<Screen>("search");
    const [search, setSearch] = useState("");
    const [order, setOrder] = useState<OrderRow | null>(null);
    const [orderList, setOrderList] = useState<OrderRow[] | null>(null); // null = não buscou ainda
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState("");
    const [counts, setCounts] = useState({ sacola: 0, caixa: 0, saco: 0, avulso: 0 });

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

    // Volumes salvos do pedido selecionado
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
            const toMs = dateRange?.to ? new Date(dateRange.to).setHours(23, 59, 59, 999) : null;
            const filtered = all.filter(o => {
                if (!ALLOWED_STATUSES.includes(o.status)) return false;
                if (o.createdAt) {
                    const t = new Date(o.createdAt).getTime();
                    if (fromMs && t < fromMs) return false;
                    if (toMs && t > toMs) return false;
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

    const handleSearch = () => {
        if (search.trim()) doSearch(search.trim());
        else loadList();
    };

    const selectOrder = (row: OrderRow) => {
        setOrder(row);
        setSearch(row.erpOrderId);
        setOrderList(null);
        setScreen("form");
    };

    const goBack = () => {
        setScreen("search");
        setOrder(null);
        setOrderList(null);
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

    const adjust = (key: keyof typeof counts, delta: number) =>
        setCounts(prev => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));

    const handlePrint = () => {
        if (total === 0 || !order) return;

        const labels = Array.from({ length: total }, (_, i) => `
            <div class="label">
                <div class="label-header">
                    <span class="label-title">Etiqueta de Volume</span>
                    <span class="label-num">${i + 1} / ${total}</span>
                </div>
                <div class="label-order">Pedido: <strong>${order.erpOrderId}</strong></div>
                <div class="label-customer">${order.customerName || ""}</div>
                <div class="label-detail">
                    ${counts.sacola > 0 ? `<span>Sacola: ${counts.sacola}</span>` : ""}
                    ${counts.caixa > 0 ? `<span>Caixa: ${counts.caixa}</span>` : ""}
                    ${counts.saco > 0 ? `<span>Saco: ${counts.saco}</span>` : ""}
                    ${counts.avulso > 0 ? `<span>Avulso: ${counts.avulso}</span>` : ""}
                </div>
            </div>
        `).join("");

        const html = `<!DOCTYPE html><html><head>
            <meta charset="UTF-8">
            <style>
                /* Tamanho da página = tamanho da etiqueta: 10cm x 15cm */
                @page {
                    size: 10cm 15cm;
                    margin: 0;
                }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: Arial, sans-serif; background: #fff; }
                .label {
                    width: 10cm;
                    height: 15cm;
                    padding: 0.5cm;
                    border: 1px solid #000;
                    page-break-after: always;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                }
                .label:last-child { page-break-after: avoid; }
                .label-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px dashed #999;
                    padding-bottom: 0.3cm;
                }
                .label-title { font-size: 11pt; color: #555; }
                .label-num   { font-size: 28pt; font-weight: bold; }
                .label-order   { font-size: 12pt; margin-top: 0.3cm; }
                .label-customer{ font-size: 10pt; color: #333; margin-top: 0.15cm; }
                .label-detail  {
                    font-size: 10pt; color: #444;
                    border-top: 1px dashed #ccc;
                    padding-top: 0.2cm;
                    display: flex; flex-wrap: wrap; gap: 0.2cm;
                }
            </style>
        </head><body>${labels}</body></html>`;

        // Cria iframe oculto — não abre nova aba, não navega
        const iframe = document.createElement("iframe");
        iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;visibility:hidden;";
        document.body.appendChild(iframe);

        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) { document.body.removeChild(iframe); return; }

        doc.open(); doc.write(html); doc.close();

        iframe.contentWindow?.focus();
        setTimeout(() => {
            iframe.contentWindow?.print();
            setTimeout(() => {
                if (document.body.contains(iframe)) document.body.removeChild(iframe);
            }, 2000);
        }, 400);
    };


    const handleSaveAndPrint = async () => {
        saveMutation.mutate(undefined, {
            onSuccess: () => handlePrint(),
        });
    };

    const deleteMutation = useMutation({
        mutationFn: () => apiRequest("DELETE", `/api/order-volumes/${order?.id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/order-volumes/${order?.id}`] });
            queryClient.invalidateQueries({ queryKey: ["/api/order-volumes"] });
            setCounts({ sacola: 0, caixa: 0, saco: 0, avulso: 0 });
            toast({ title: "Volume apagado", description: `Volumes do pedido ${order?.erpOrderId} removidos.` });
        },
        onError: (err: any) => {
            toast({ title: "Erro ao apagar", description: err?.message || "Tente novamente.", variant: "destructive" });
        },
    });

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-sm w-[95vw] p-0 gap-0 rounded-xl overflow-hidden flex flex-col" style={{ maxHeight: "88vh" }}>

                {/* HEADER */}
                <DialogHeader className="px-4 pt-4 pb-3 bg-slate-900 text-white rounded-t-xl shrink-0">
                    <div className="flex items-center gap-2">
                        {screen === "form" && (
                            <button onClick={goBack} className="mr-1 text-white/70 hover:text-white">
                                <ArrowLeft className="h-4 w-4" />
                            </button>
                        )}
                        <PackageOpen className="h-5 w-5 text-blue-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-white text-base leading-tight">Gerar Volume</DialogTitle>
                            <p className="text-xs text-slate-300 truncate">
                                {screen === "search" && "Busque um pedido ou liste todos"}
                                {screen === "form" && order && `Ped. ${order.erpOrderId} · ${order.customerName || ""}`}
                            </p>
                        </div>
                        {screen === "form" && savedVolume && (
                            <Badge className="ml-auto shrink-0 bg-green-600 text-white text-xs px-2 py-0.5">
                                <CheckCircle2 className="h-3 w-3 mr-1" />Salvo
                            </Badge>
                        )}
                    </div>
                </DialogHeader>

                {/* ── TELA SEARCH ──────────────────────────────────────── */}
                {screen === "search" && (
                    <div className="flex flex-col flex-1 overflow-hidden bg-background">

                        {/* Controles fixos no topo */}
                        <div className="px-4 pt-3 pb-2 space-y-2 border-b border-border shrink-0">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Input
                                        placeholder="Nº do pedido ou deixe vazio para listar"
                                        value={search}
                                        onChange={e => { setSearch(e.target.value); setSearchError(""); setOrderList(null); }}
                                        onKeyDown={e => e.key === "Enter" && handleSearch()}
                                        className="pr-8 text-sm font-mono"
                                        inputMode="numeric"
                                        autoFocus
                                    />
                                    {search && (
                                        <button onClick={() => { setSearch(""); setSearchError(""); setOrderList(null); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                                <Button size="sm" onClick={handleSearch} disabled={searching} className="shrink-0">
                                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                </Button>
                            </div>

                            <div className="space-y-1">
                                <p className="text-xs text-muted-foreground font-medium">Filtrar por período</p>
                                <DatePickerWithRange date={dateRange} onDateChange={setDateRange} className="w-full" />
                            </div>

                            {searchError && <p className="text-xs text-destructive">{searchError}</p>}

                            {/* Contador quando há lista */}
                            {orderList !== null && (
                                <p className="text-xs text-muted-foreground">
                                    {orderList.length === 0
                                        ? "Nenhum pedido encontrado no período."
                                        : `${orderList.length} pedido(s) encontrado(s)`}
                                </p>
                            )}
                        </div>

                        {/* Área rolável: lista OU estado vazio */}
                        <div className="flex-1 overflow-y-auto">
                            {orderList === null && (
                                <div className="flex flex-col items-center justify-center h-full px-4 py-8 text-center gap-2">
                                    <Package className="h-10 w-10 text-muted-foreground opacity-20" />
                                    <p className="text-sm text-muted-foreground">
                                        Digite o número e toque em 🔍 para buscar,<br />
                                        ou toque em 🔍 <strong>sem número</strong> para listar todos no período.
                                    </p>
                                </div>
                            )}

                            {orderList !== null && orderList.length > 0 && (
                                <div className="divide-y divide-border">
                                    {orderList.map(row => (
                                        <button
                                            key={row.id}
                                            className="w-full text-left px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors"
                                            onClick={() => selectOrder(row)}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <span className="font-mono font-bold text-sm">{row.erpOrderId}</span>
                                                    <p className="text-xs text-muted-foreground truncate">{row.customerName}</p>
                                                    {row.createdAt && (
                                                        <p className="text-[10px] text-muted-foreground/70">
                                                            {format(new Date(row.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_COLORS[row.status] ?? ""}`}>
                                                    {STATUS_LABELS[row.status] ?? row.status}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="px-4 pb-4 pt-2 border-t border-border shrink-0">
                            <Button variant="outline" className="w-full" onClick={onClose}>Fechar</Button>
                        </div>
                    </div>
                )}

                {/* ── TELA FORM ────────────────────────────────────────── */}
                {screen === "form" && order && (
                    <div className="flex flex-col flex-1 overflow-hidden bg-background">

                        {/* Info do pedido */}
                        <div className="px-4 py-2 bg-muted/40 border-b border-border shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-sm">{order.erpOrderId}</span>
                                <span className="truncate text-xs text-muted-foreground flex-1">{order.customerName}</span>
                                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_COLORS[order.status] ?? ""}`}>
                                    {STATUS_LABELS[order.status] ?? order.status}
                                </span>
                            </div>
                        </div>

                        {/* Controles rolável */}
                        <div className="flex-1 overflow-y-auto">
                            {loadingVolume ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <div className="px-4 py-4 space-y-3">
                                    {CATEGORIES.map(({ key, label, icon: Icon, color }) => (
                                        <div key={key} className="flex items-center justify-between bg-muted/40 border border-border rounded-lg px-3 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <Icon className={`h-5 w-5 shrink-0 ${color}`} />
                                                <span className="font-medium text-sm">{label}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => adjust(key, -1)} className="w-9 h-9 rounded-lg border bg-background flex items-center justify-center text-lg font-bold hover:bg-muted active:scale-95 transition-transform">−</button>
                                                <span className="w-8 text-center font-bold text-base tabular-nums">{counts[key]}</span>
                                                <button onClick={() => adjust(key, 1)} className="w-9 h-9 rounded-lg border bg-background flex items-center justify-center text-lg font-bold hover:bg-muted active:scale-95 transition-transform">+</button>
                                            </div>
                                        </div>
                                    ))}

                                    <div className="flex items-center justify-between px-3 py-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <Package className="h-5 w-5 text-blue-600" />
                                            <span className="font-semibold text-sm text-blue-700 dark:text-blue-300">Total de Volumes</span>
                                        </div>
                                        <span className="text-2xl font-extrabold text-blue-700 dark:text-blue-300 tabular-nums">{total}</span>
                                    </div>

                                    {total > 0 && (
                                        <p className="text-xs text-muted-foreground px-1">
                                            Etiquetas: {Array.from({ length: Math.min(total, 5) }, (_, i) => `${i + 1}/${total}`).join(", ")}
                                            {total > 5 ? ` ... ${total}/${total}` : ""}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="px-4 pb-4 pt-2 bg-background border-t border-border flex gap-2 shrink-0">
                            <Button variant="outline" className="shrink-0" onClick={goBack}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            {/* Apagar — só visível quando já há volumes salvos */}
                            {savedVolume && (
                                <Button
                                    variant="outline"
                                    className="shrink-0 text-destructive border-destructive/40 hover:bg-destructive hover:text-white"
                                    onClick={() => {
                                        if (confirm(`Apagar volumes do pedido ${order.erpOrderId}?`)) {
                                            deleteMutation.mutate();
                                        }
                                    }}
                                    disabled={deleteMutation.isPending || saveMutation.isPending}
                                    title="Apagar volumes deste pedido"
                                >
                                    {deleteMutation.isPending
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Trash2 className="h-4 w-4" />
                                    }
                                </Button>
                            )}
                            {/* Botão Imprimir — ocultado temporariamente */}
                            {/* <Button variant="outline" className="flex-1" onClick={handlePrint} disabled={total === 0}> */}
                            {/*     <Printer className="h-4 w-4 mr-2" />Imprimir                                      */}
                            {/* </Button>                                                                             */}
                            <Button
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={() => saveMutation.mutate()}
                                disabled={total === 0 || saveMutation.isPending}
                            >
                                {saveMutation.isPending
                                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                                    : <><CheckCircle2 className="h-4 w-4 mr-2" />Salvar Volumes</>
                                }
                            </Button>
                        </div>
                    </div>
                )}

            </DialogContent>
        </Dialog>
    );
}
