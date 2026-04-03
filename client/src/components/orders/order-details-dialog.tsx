import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import {
    Loader2, Package, CheckCircle2, ShoppingBag, Box, Archive, Tag,
    Clock, Scissors, ClipboardCheck, User, AlertCircle, Hourglass,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { OrderWithItems } from "@shared/schema";

interface OrderDetailsDialogProps {
    orderId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface OrderVolume {
    sacola: number; caixa: number; saco: number; avulso: number; totalVolumes: number;
}

interface WorkUnitInfo {
    id: string;
    type: "separacao" | "conferencia";
    section: string | null;
    pickupPoint: number;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    operatorName: string | null;
    duracaoMin: number | null;
}

function fmtMin(min: number | null): string {
    if (min === null) return "—";
    if (min < 1) return `${Math.round(min * 60)}s`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
}

function StatusDot({ status }: { status: string }) {
    const colors: Record<string, string> = {
        concluido:   "bg-green-500",
        em_andamento:"bg-blue-500 animate-pulse",
        pendente:    "bg-slate-300",
        excecao:     "bg-amber-500",
        recontagem:  "bg-purple-500",
    };
    return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${colors[status] || "bg-slate-300"}`} />;
}

export function OrderDetailsDialog({ orderId, open, onOpenChange }: OrderDetailsDialogProps) {
    const { data: order, isLoading } = useQuery<OrderWithItems>({
        queryKey: [`/api/orders/${orderId}`],
        enabled: !!orderId && open,
    });

    const { data: volume } = useQuery<OrderVolume | null>({
        queryKey: [`/api/order-volumes/${orderId}`],
        enabled: !!orderId && open,
    });

    const { data: workUnits } = useQuery<WorkUnitInfo[]>({
        queryKey: [`/api/orders/${orderId}/work-units`],
        enabled: !!orderId && open,
    });

    // Total time: from launchedAt to separatedAt (if available)
    const totalOrderTime = (() => {
        if (!order) return null;
        const start = (order as any).launchedAt;
        const end   = (order as any).separatedAt;
        if (!start || !end) return null;
        const ms = new Date(end).getTime() - new Date(start).getTime();
        if (ms <= 0) return null;
        return ms / 60000;
    })();

    // Aggregate work unit times per section
    const sectionMap = new Map<string, { sep: WorkUnitInfo[], conf: WorkUnitInfo[] }>();
    for (const wu of workUnits ?? []) {
        const key = wu.section ?? "Sem Seção";
        if (!sectionMap.has(key)) sectionMap.set(key, { sep: [], conf: [] });
        if (wu.type === "separacao") sectionMap.get(key)!.sep.push(wu);
        else sectionMap.get(key)!.conf.push(wu);
    }
    const sectionEntries = Array.from(sectionMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    // Max duration for bar widths
    const maxDuration = Math.max(
        0,
        ...(workUnits ?? []).map(wu => wu.duracaoMin ?? 0),
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Detalhes do Pedido {order?.erpOrderId}
                        {totalOrderTime !== null && (
                            <Badge variant="outline" className="ml-2 text-xs font-mono gap-1">
                                <Clock className="h-3 w-3" />
                                Total: {fmtMin(totalOrderTime)}
                            </Badge>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : order ? (
                    <div className="space-y-5">
                        {/* ── Info básica ──────────────────────────────────── */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="font-medium text-muted-foreground">Cliente</p>
                                <p>{order.customerName}</p>
                            </div>
                            <div>
                                <p className="font-medium text-muted-foreground">Valor Total</p>
                                <p>R$ {Number(order.totalValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                            </div>
                        </div>

                        {/* ── Timeline de execução por seção ───────────────── */}
                        {sectionEntries.length > 0 && (
                            <div className="border rounded-lg overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
                                    <Hourglass className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-semibold">Execução por Seção</span>
                                    {totalOrderTime !== null && (
                                        <span className="ml-auto text-xs text-muted-foreground font-mono">
                                            Tempo total: <span className="font-bold text-foreground">{fmtMin(totalOrderTime)}</span>
                                        </span>
                                    )}
                                </div>

                                <div className="divide-y">
                                    {sectionEntries.map(([section, { sep, conf }]) => {
                                        const sepDone    = sep.find(w => w.status === "concluido");
                                        const confDone   = conf.find(w => w.status === "concluido");
                                        const sepActive  = sep.find(w => w.status === "em_andamento");
                                        const confActive = conf.find(w => w.status === "em_andamento");

                                        const sepWu  = sepDone  || sepActive  || sep[0]  || null;
                                        const confWu = confDone || confActive || conf[0] || null;

                                        return (
                                            <div key={section} className="px-3 py-2.5 hover:bg-muted/20 transition-colors">
                                                {/* Section header */}
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground w-20 shrink-0">
                                                        Seção {section}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    {/* Separação */}
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                            <Scissors className="h-3 w-3" />
                                                            <span>Separação</span>
                                                            {sepWu && <StatusDot status={sepWu.status} />}
                                                        </div>
                                                        {sepWu ? (
                                                            <>
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`font-mono font-bold text-sm ${sepWu.duracaoMin !== null ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                                                                        {fmtMin(sepWu.duracaoMin)}
                                                                    </span>
                                                                    {sepWu.status === "em_andamento" && (
                                                                        <span className="text-[10px] text-blue-500 animate-pulse">em curso</span>
                                                                    )}
                                                                </div>
                                                                {maxDuration > 0 && sepWu.duracaoMin !== null && (
                                                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full">
                                                                        <div
                                                                            className="h-full bg-blue-500 rounded-full transition-all"
                                                                            style={{ width: `${Math.min(100, (sepWu.duracaoMin / maxDuration) * 100)}%` }}
                                                                        />
                                                                    </div>
                                                                )}
                                                                {sepWu.operatorName && (
                                                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                                        <User className="h-2.5 w-2.5" />
                                                                        {sepWu.operatorName}
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground italic">Pendente</span>
                                                        )}
                                                    </div>

                                                    {/* Conferência */}
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                            <ClipboardCheck className="h-3 w-3" />
                                                            <span>Conferência</span>
                                                            {confWu && <StatusDot status={confWu.status} />}
                                                        </div>
                                                        {confWu ? (
                                                            <>
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`font-mono font-bold text-sm ${confWu.duracaoMin !== null ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                                                                        {fmtMin(confWu.duracaoMin)}
                                                                    </span>
                                                                    {confWu.status === "em_andamento" && (
                                                                        <span className="text-[10px] text-green-500 animate-pulse">em curso</span>
                                                                    )}
                                                                </div>
                                                                {maxDuration > 0 && confWu.duracaoMin !== null && (
                                                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full">
                                                                        <div
                                                                            className="h-full bg-green-500 rounded-full transition-all"
                                                                            style={{ width: `${Math.min(100, (confWu.duracaoMin / maxDuration) * 100)}%` }}
                                                                        />
                                                                    </div>
                                                                )}
                                                                {confWu.operatorName && (
                                                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                                        <User className="h-2.5 w-2.5" />
                                                                        {confWu.operatorName}
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground italic">Pendente</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── Volumes Gerados ─────────────────────────────── */}
                        {volume ? (
                            <div className="border rounded-lg p-3 bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-semibold flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                                        <Package className="h-4 w-4" />Volumes Gerados
                                    </span>
                                    <Badge className="bg-blue-600 text-white text-xs">
                                        Total: {volume.totalVolumes}
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                                    {[
                                        { label: "Sacola", val: volume.sacola, icon: ShoppingBag },
                                        { label: "Caixa", val: volume.caixa, icon: Box },
                                        { label: "Saco", val: volume.saco, icon: Archive },
                                        { label: "Avulso", val: volume.avulso, icon: Tag },
                                    ].map(({ label, val, icon: Icon }) => (
                                        <div key={label} className="bg-white dark:bg-slate-900 rounded-md p-2 border border-blue-100 dark:border-blue-800">
                                            <Icon className="h-4 w-4 mx-auto mb-1 text-blue-500" />
                                            <div className="font-bold text-sm">{val}</div>
                                            <div className="text-muted-foreground">{label}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="border rounded-lg p-3 text-sm text-muted-foreground bg-muted/30 flex items-center gap-2">
                                <Package className="h-4 w-4 opacity-40" />
                                Nenhum volume gerado para este pedido.
                            </div>
                        )}

                        {/* ── Itens ────────────────────────────────────────── */}
                        <div className="border rounded-md bg-card p-2">
                            <ul className="space-y-3">
                                {order.items?.map((item: any) => (
                                    <li key={item.id} className="flex flex-col p-3 bg-muted/30 rounded-lg">
                                        <div className="flex justify-between items-start gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-sm truncate">
                                                        {item.product?.name || 'Produto não encontrado'}
                                                    </span>
                                                    {item.product?.isVip && (
                                                        <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase">VIP</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                                    <span>Cod: {item.product?.code || '-'}</span>
                                                    <span>•</span>
                                                    <span>EAN: {item.product?.barcode || '-'}</span>
                                                    <span>•</span>
                                                    <span>Caixa: {item.product?.boxBarcode || '-'}</span>
                                                </div>
                                                <div className="text-xs mt-1">
                                                    Sec: <span className="font-medium">{item.section}</span> | PV: <span className="font-medium">{item.pickupPoint}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 shrink-0">
                                                <span className="font-mono font-medium text-sm">
                                                    {item.separatedQty ?? item.qtyPicked ?? 0}/{item.quantity}
                                                </span>
                                                {(item.separatedQty ?? item.qtyPicked ?? 0) >= item.quantity && (
                                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                )}
                                                {item.exceptionQty > 0 && (
                                                    <span className="text-amber-600 text-[10px] px-1 py-0.5 bg-amber-50 rounded-full w-fit">
                                                        Com Exceção ({item.exceptionQty})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {item.exceptions && item.exceptions.length > 0 && (
                                            <div className="mt-2 text-xs border-t pt-2 border-border/50">
                                                <span className="font-semibold text-amber-600 mb-1 block">Detalhes da Exceção:</span>
                                                <ul className="space-y-1">
                                                    {item.exceptions.map((exc: any) => (
                                                        <li key={exc.id} className="text-muted-foreground bg-amber-50/50 p-1.5 rounded">
                                                            <span className="font-medium">{exc.type}</span>
                                                            {' - Qtd: '}{exc.quantity}
                                                            {' - '}{new Date(exc.createdAt).toLocaleString('pt-BR')}
                                                            {exc.observation && <span className="block mt-0.5 italic text-amber-700/70">"{exc.observation}"</span>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                ) : (
                    <div className="text-center p-4">Pedido não encontrado</div>
                )}
            </DialogContent>
        </Dialog>
    );
}
