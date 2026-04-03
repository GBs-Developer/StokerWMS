import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { GradientHeader } from "@/components/ui/gradient-header";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, Route as RouteIcon, Search, Calendar, Filter, Printer, Package, Loader2 } from "lucide-react";
import type { Order, Route } from "@shared/schema";
import { getCurrentWeekRange, isDateInRange } from "@/lib/date-utils";
import { format } from "date-fns";

export default function RouteOrdersPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(getCurrentWeekRange());
    const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(getCurrentWeekRange());
    const [selectedRouteFilter, setSelectedRouteFilter] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedPickupPoint, setSelectedPickupPoint] = useState<string>("all");
    const [searchPackageCode, setSearchPackageCode] = useState("");
    const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
    const [showAssignDialog, setShowAssignDialog] = useState(false);
    const [targetRouteId, setTargetRouteId] = useState<string>("");
    const [isPrinting, setIsPrinting] = useState(false);

    const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
        queryKey: ["/api/orders"],
    });

    const { data: routes } = useQuery<Route[]>({
        queryKey: ["/api/routes"],
    });

    const assignRouteMutation = useMutation({
        mutationFn: async ({ orderIds, routeId }: { orderIds: string[]; routeId: string }) => {
            const res = await apiRequest("POST", "/api/orders/assign-route", { orderIds, routeId });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
            queryClient.invalidateQueries({ queryKey: ["/api/routes"] });
            setShowAssignDialog(false);
            toast({
                title: "Rotas atualizadas",
                description: `${selectedOrders.length} pedido(s) atribuído(s) à rota.`,
            });
        },
        onError: () => {
            toast({
                title: "Erro",
                description: "Falha ao atribuir rota",
                variant: "destructive",
            });
        },
    });

    // Filter Logic
    const filteredOrders = orders?.filter((order) => {
        // Date Filter
        if (!isDateInRange(order.createdAt, filterDateRange)) return false;

        // Route Filter
        if (selectedRouteFilter !== "all") {
            if (selectedRouteFilter === "unassigned") {
                if (order.routeId) return false;
            } else {
                if (String(order.routeId) !== selectedRouteFilter) return false;
            }
        }

        // Helper para busca múltipla
        const processMultipleOrderSearch = (searchValue: string, orderCode: string): boolean => {
            if (!searchValue.trim()) return true;
            if (searchValue.includes(',')) {
                const terms = searchValue.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
                return terms.some(term => orderCode.toLowerCase().includes(term));
            }
            return orderCode.toLowerCase().includes(searchValue.toLowerCase());
        };

        // Search Filter (Multiple Order IDs with comma)
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchesId = processMultipleOrderSearch(searchQuery, order.erpOrderId);
            const matchesCustomer = order.customerName.toLowerCase().includes(query);
            if (!matchesId && !matchesCustomer) return false;
        }

        // Package/Load Code Filter
        if (searchPackageCode.trim() && (order as any).loadCode !== searchPackageCode.trim()) return false;

        // Pickup Point Filter
        if (selectedPickupPoint !== "all") {
            const pp = String((order as any).pickupPoints || "");
            if (!pp.includes(selectedPickupPoint)) return false;
        }

        return true;
    }) || [];

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedOrders(filteredOrders.map(o => o.id));
        } else {
            setSelectedOrders([]);
        }
    };

    const handleSelectOrder = (orderId: string, checked: boolean) => {
        if (checked) {
            setSelectedOrders(prev => [...prev, orderId]);
        } else {
            setSelectedOrders(prev => prev.filter(id => id !== orderId));
        }
    };

    const activeRoutes = routes?.filter(r => r.active) || [];

    const isAssignmentRedundant = targetRouteId && selectedOrders.length > 0 && selectedOrders.every(id => {
        const o = orders?.find(order => order.id === id);
        return o && String(o.routeId) === targetRouteId;
    });

    const handlePrint = async () => {
        setIsPrinting(true);
        try {
            const now = new Date().toLocaleString("pt-BR");
            const idsToPrint = filteredOrders.map(o => o.id);
            if (idsToPrint.length === 0) return;

            const res = await apiRequest("POST", "/api/reports/route-orders-print", { orderIds: idsToPrint });
            const populatedOrders = await res.json();

            let bodyHtml = "";
            for (const order of populatedOrders) {
                const route = routes?.find(r => r.id === order.routeId);
                const routeLabel = route ? `${route.code} - ${route.name}` : "Sem Rota";
                const dateStr = format(new Date(order.createdAt), "dd/MM HH:mm");
                const finStatus = order.financialStatus === "faturado" ? "Liberado" : (order.financialStatus || "-");
                const value = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(order.totalValue || 0);
                const loadCode = order.loadCode || "-";

                bodyHtml += `<tr class="order-header">
                    <td class="mono">${order.erpOrderId}</td>
                    <td>${dateStr}</td>
                    <td>${order.customerName}<br><small>${order.customerCode || ""}</small></td>
                    <td class="right">${value}</td>
                    <td>${finStatus}</td>
                    <td>${order.status}</td>
                    <td>${routeLabel}</td>
                    <td>${loadCode}</td>
                </tr>`;

                if (order.items && order.items.length > 0) {
                    bodyHtml += `<tr><td colspan="8" class="items-cell">
                        <table class="inner-table">
                            <thead>
                                <tr>
                                    <th style="width: 15%">Cód. Protudo</th>
                                    <th style="width: 15%">Cód. Barras</th>
                                    <th style="width: 35%">Descrição</th>
                                    <th style="width: 15%" class="right">Qtd. Alvo</th>
                                    <th style="width: 20%" class="right">Status Item</th>
                                </tr>
                            </thead>
                            <tbody>`;

                    const sortedItems = [...order.items].sort((a, b) => {
                        const nameA = a.product?.name || "";
                        const nameB = b.product?.name || "";
                        return nameA.localeCompare(nameB);
                    });

                    for (const item of sortedItems) {
                        const pName = item.product ? item.product.name : "Produto Desconhecido";
                        const pCode = item.product ? item.product.erpCode : "-";
                        const pBarcode = item.product && item.product.barcode ? item.product.barcode : "-";
                        bodyHtml += `<tr>
                            <td class="mono">${pCode}</td>
                            <td class="mono">${pBarcode}</td>
                            <td>${pName}</td>
                            <td class="right">${item.quantity}</td>
                            <td class="right">${item.status || "pendente"}</td>
                        </tr>`;
                    }
                    bodyHtml += `</tbody></table></td></tr>`;
                }
            }

            const filtersLine = [
                searchQuery && `Busca: ${searchQuery}`,
                searchPackageCode && `Pacote: ${searchPackageCode}`,
                selectedRouteFilter !== "all" && `Rota: ${selectedRouteFilter}`,
            ].filter(Boolean).join(" | ") || "Sem filtros ativos";

            const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Gestão de Rotas — Relatório</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; margin: 10px 18px; font-size: 10px; color: #000; }
.header h1 { font-size: 15px; font-weight: bold; margin-bottom: 2px; }
.header .meta { font-size: 9px; color: #555; margin-bottom: 6px; }
.spacer { border-bottom: 2px solid #000; margin-bottom: 4px; }
table { width: 100%; border-collapse: collapse; }
th { background: #f0f0f0; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 3px 5px; text-align: left; font-size: 10px; }
td { padding: 2px 5px; font-size: 10px; border-bottom: 1px dashed #ddd; vertical-align: top; }
td.mono { font-family: monospace; font-weight: bold; }
td.right { text-align: right; text-transform: capitalize; }
.order-header td { background: #f9f9f9; font-size: 11px; padding-top: 6px; padding-bottom: 4px; border-bottom: 1px solid #ccc; font-weight: bold; }
.items-cell { padding: 0 !important; border-bottom: 2px solid #444 !important; }
.inner-table { margin: 0; width: 100%; border-left: 10px solid #fff; }
.inner-table th { background: transparent; border: none; border-bottom: 1px solid #eee; padding: 2px 5px; font-size: 9px; color: #666; }
.inner-table td { border-bottom: 1px dashed #f0f0f0; padding: 2px 5px; font-size: 9px; color: #333; }
@media print { body { margin: 5mm 8mm; } @page { size: portrait; margin: 5mm; } }
</style>
<script>window.onload = function() { window.print(); }</script>
</head><body>
<div class="header">
  <h1>Gestão de Rotas — Lista de Pedidos & Produtos</h1>
  <div class="meta">Gerado em: ${now} &nbsp;|&nbsp; ${filtersLine} &nbsp;|&nbsp; Total: ${filteredOrders.length} pedidos</div>
</div>
<div class="spacer"></div>
<table>
  <thead><tr>
    <th>Nº Pedido</th><th>Data</th><th>Cliente</th><th style="text-align:right">Valor</th>
    <th>Fin.</th><th>Status</th><th>Rota</th><th>Pacote</th>
  </tr></thead>
  <tbody>${bodyHtml}</tbody>
</table>
</body></html>`;

            const w = window.open("", "_blank");
            if (w) { w.document.write(html); w.document.close(); }
        } finally {
            setIsPrinting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <GradientHeader title="Gestão de Rotas (Pedidos)" subtitle="Visualize e atribua rotas aos pedidos">
                <Link href="/">
                    <Button
                        variant="outline"
                        size="sm"
                        className=""
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Button>
                </Link>
            </GradientHeader>

            <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
                {/* Filters */}
                <div className="flex flex-col gap-4 bg-card p-4 rounded-lg border shadow-sm">
                    <div className="flex flex-wrap gap-4 items-end">
                        {/* Order/Customer Search */}
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar Pedido ou Cliente..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        {/* Package/Load Code Filter */}
                        <div className="w-full sm:w-36 space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Pacote/Carga</label>
                            <div className="relative">
                                <Package className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Cód. 4 dígitos"
                                    value={searchPackageCode}
                                    onChange={(e) => setSearchPackageCode(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>

                        {/* Date Range */}
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                                <DatePickerWithRange date={tempDateRange} onDateChange={setTempDateRange} className="w-full" />
                            </div>
                            <Button variant="secondary" className="shrink-0" onClick={() => setFilterDateRange(tempDateRange)}>
                                Buscar
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3 items-center justify-between border-t pt-3">
                        <div className="flex flex-wrap gap-2">
                            <Select value={selectedRouteFilter} onValueChange={setSelectedRouteFilter}>
                                <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs">
                                    <SelectValue placeholder="Rota" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas as Rotas</SelectItem>
                                    <SelectItem value="unassigned">Sem Rota</SelectItem>
                                    {activeRoutes.map(route => (
                                        <SelectItem key={route.id} value={String(route.id)}>
                                            {route.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={selectedPickupPoint} onValueChange={setSelectedPickupPoint}>
                                <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs">
                                    <SelectValue placeholder="Ponto de Retirada" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos Pontos</SelectItem>
                                    {Array.from({ length: 15 }, (_, i) => i + 1).map(point => (
                                        <SelectItem key={point} value={String(point)}>
                                            Ponto {point}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" onClick={handlePrint} disabled={isPrinting || filteredOrders.length === 0}>
                                {isPrinting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
                                Imprimir Lista
                            </Button>
                            <Button
                                onClick={() => setShowAssignDialog(true)}
                                disabled={selectedOrders.length === 0}
                            >
                                <RouteIcon className="h-4 w-4 mr-2" />
                                Atribuir Rota ({selectedOrders.length})
                            </Button>
                        </div>
                    </div>
                </div>

                <SectionCard title={`Pedidos Encontrados (${filteredOrders.length})`} icon={<Search className="h-4 w-4 text-primary" />}>
                    {ordersLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : filteredOrders.length > 0 ? (
                        <div className="overflow-x-auto -mx-6">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">
                                            <Checkbox
                                                checked={filteredOrders.length > 0 && selectedOrders.length === filteredOrders.length}
                                                onCheckedChange={handleSelectAll}
                                            />
                                        </TableHead>
                                        <TableHead>Pedido</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead className="hidden md:table-cell">Data</TableHead>
                                        <TableHead className="hidden lg:table-cell">Rota Atual</TableHead>
                                        <TableHead className="hidden lg:table-cell">Valor</TableHead>
                                        <TableHead className="hidden md:table-cell">Status Fin.</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredOrders.map((order) => {
                                        const route = routes?.find(r => r.id === order.routeId);
                                        return (
                                            <TableRow
                                                key={order.id}
                                                className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedOrders.includes(order.id) ? "bg-muted" : ""}`}
                                                onClick={() => handleSelectOrder(order.id, !selectedOrders.includes(order.id))}
                                            >
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    <Checkbox
                                                        checked={selectedOrders.includes(order.id)}
                                                        onCheckedChange={(checked) => handleSelectOrder(order.id, checked as boolean)}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-mono">{order.erpOrderId}</TableCell>
                                                <TableCell className="max-w-[200px] truncate" title={order.customerName}>
                                                    {order.customerName}
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell">{format(new Date(order.createdAt), "dd/MM/yyyy HH:mm")}</TableCell>
                                                <TableCell className="hidden lg:table-cell">
                                                    {route ? (
                                                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                            {route.name}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm italic">Sem rota</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell">
                                                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(order.totalValue)}
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell">
                                                    {order.financialStatus === "faturado" ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                                            Liberado
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                                                            Pendente
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary">{order.status}</Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <p className="text-lg font-medium">Nenhum pedido encontrado</p>
                            <p className="text-sm">Tente ajustar os filtros de data ou rota</p>
                        </div>
                    )}
                </SectionCard>
            </main>

            {/* Assign Route Dialog */}
            <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Atribuir Rota em Lote</DialogTitle>
                        <DialogDescription>
                            Selecione a rota para aplicar aos {selectedOrders.length} pedidos selecionados.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Rota de Destino</label>
                            <Select value={targetRouteId} onValueChange={setTargetRouteId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione uma rota" />
                                </SelectTrigger>
                                <SelectContent>
                                    {activeRoutes.map(route => (
                                        <SelectItem key={route.id} value={String(route.id)}>
                                            {route.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => assignRouteMutation.mutate({ orderIds: selectedOrders, routeId: targetRouteId })}
                            disabled={!targetRouteId || assignRouteMutation.isPending || !!isAssignmentRedundant}
                            title={isAssignmentRedundant ? "Os pedidos selecionados já estão nesta rota" : ""}
                        >
                            Confirmar Atribuição
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
