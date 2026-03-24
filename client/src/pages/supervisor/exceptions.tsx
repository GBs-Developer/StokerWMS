import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, useSessionQueryKey } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { GradientHeader } from "@/components/ui/gradient-header";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { Link } from "wouter";
import { ArrowLeft, AlertTriangle, FileWarning, Search, Calendar, Printer, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import type { Exception, OrderItem, Product, User, WorkUnit, Order } from "@shared/schema";

type ExceptionWithDetails = Exception & {
  orderItem: OrderItem & {
    product: Product;
    order: Order;
  };
  reportedByUser: User;
  workUnit: WorkUnit;
};

const exceptionTypeLabels: Record<string, { label: string; color: string }> = {
  nao_encontrado: { label: "Não Encontrado", color: "bg-yellow-100 text-yellow-700" },
  avariado: { label: "Avariado", color: "bg-red-100 text-red-700" },
  vencido: { label: "Vencido", color: "bg-orange-100 text-orange-700" },
};

export default function ExceptionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "administrador";
  const exceptionsQueryKey = useSessionQueryKey(["/api/exceptions"]);

  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>();
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>();
  const [searchOrderQuery, setSearchOrderQuery] = useState("");
  const [selectedExceptionType, setSelectedExceptionType] = useState<string>("all");

  const { data: exceptions, isLoading } = useQuery<ExceptionWithDetails[]>({
    queryKey: exceptionsQueryKey,
  });

  // Lógica de filtro
  const processMultipleOrderSearch = (searchValue: string, orderCode: string): boolean => {
    if (!searchValue.trim()) return true;
    if (searchValue.includes(',')) {
      const terms = searchValue.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
      return terms.some(term => orderCode.toLowerCase().includes(term));
    }
    return orderCode.toLowerCase().includes(searchValue.toLowerCase());
  };

  const filteredExceptions = exceptions?.filter((exception) => {
    // Filtro de Data
    if (filterDateRange?.from) {
      const exceptionDate = new Date(exception.createdAt);
      if (exceptionDate < filterDateRange.from) return false;
      if (filterDateRange.to) {
        const endOfDay = new Date(filterDateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        if (exceptionDate > endOfDay) return false;
      }
    }

    // Filtro de Pedido (Múltiplos pedidos com vírgula)
    if (searchOrderQuery) {
      const orderMatch = processMultipleOrderSearch(searchOrderQuery, exception.orderItem?.order?.erpOrderId || '');
      if (!orderMatch) return false;
    }

    // Filtro de Motivo/Tipo
    if (selectedExceptionType !== "all") {
      if (exception.type !== selectedExceptionType) return false;
    }

    return true;
  }) || [];

  const handlePrint = async () => {
    try {
      await apiRequest("POST", "/api/audit-logs", {
        action: "print_report",
        entityType: "exceptions_report",
        details: `Imprimiu relatório de exceções com filtros aplicados.`,
      });
    } catch (e) {
      console.error("Failed to log print action");
    }

    const now = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });
    const toprint = filteredExceptions;

    let bodyHtml = "";
    for (const exc of toprint) {
      const typeInfo = exceptionTypeLabels[exc.type] ?? { label: exc.type, color: "" };
      const date = exc.createdAt ? format(new Date(exc.createdAt), "dd/MM HH:mm") : "-";
      const authDate = exc.authorizedAt ? format(new Date(exc.authorizedAt), "dd/MM HH:mm") : "-";
      const erpOrderId = exc.orderItem?.order?.erpOrderId || "-";
      const productName = exc.orderItem?.product?.name || "-";
      const productCode = exc.orderItem?.product?.erpCode || "-";
      const operator = exc.reportedByUser?.name || "-";
      const authorizedBy = exc.authorizedByName || (exc.authorizedBy ? "Sim" : "Aguardando");
      const obs = exc.observation || "-";

      bodyHtml += `<tr>
        <td class="mono bold">${erpOrderId}</td>
        <td class="mono">${productCode}</td>
        <td>${productName}</td>
        <td class="center">${exc.quantity}</td>
        <td class="center"><strong>${typeInfo.label}</strong></td>
        <td>${obs}</td>
        <td>${operator}</td>
        <td>${authorizedBy}</td>
        <td class="center nowrap">${date}</td>
        <td class="center nowrap">${authDate}</td>
      </tr>`;
    }

    const filtersLine = [
      filterDateRange?.from && `Período: ${format(filterDateRange.from, "dd/MM/yyyy")} a ${filterDateRange.to ? format(filterDateRange.to, "dd/MM/yyyy") : format(new Date(), "dd/MM/yyyy")}`,
      searchOrderQuery && `Busca: ${searchOrderQuery}`,
      selectedExceptionType !== "all" && `Tipo: ${exceptionTypeLabels[selectedExceptionType]?.label || selectedExceptionType}`,
    ].filter(Boolean).join(" | ");

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Relatório de Exceções</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; margin: 10px 15px; font-size: 9px; color: #000; }
.header { margin-bottom: 6px; }
.header h1 { font-size: 14px; font-weight: bold; }
.header .meta { font-size: 8px; color: #555; margin-top: 2px; }
.filters { font-size: 8px; color: #333; background: #fff8e8; padding: 3px 6px; border-radius: 2px; margin: 4px 0 6px; border-left: 3px solid #f59e0b; }
table { width: 100%; border-collapse: collapse; }
th { background: #fff3cd; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 3px 4px; font-size: 9px; font-weight: bold; }
td { padding: 2px 4px; font-size: 9px; border-bottom: 1px solid #eee; vertical-align: top; }
td.mono { font-family: monospace; }
td.bold { font-weight: bold; }
td.center { text-align: center; }
td.nowrap { white-space: nowrap; }
@media print { body { margin: 5mm 6mm; } @page { size: landscape; margin: 5mm; } tr { page-break-inside: avoid; } }
</style>
<script>window.onload = function() { window.print(); }</script>
</head><body>
<div class="header">
  <h1>⚠ Relatório de Exceções</h1>
  <div class="meta">Gerado em: ${now} &nbsp;|&nbsp; Total: ${toprint.length} exceções</div>
</div>
<div class="filters"><strong>Filtros:</strong> ${filtersLine || "Nenhum filtro ativo"}</div>
<table>
  <thead><tr>
    <th>Nº Pedido</th><th>Cód.</th><th>Produto</th>
    <th style="text-align:center">Qtd</th><th style="text-align:center">Motivo</th>
    <th>Observação</th><th>Operador</th><th>Autorizado Por</th>
    <th style="text-align:center">Data Exc.</th><th style="text-align:center">Data Aut.</th>
  </tr></thead>
  <tbody>${bodyHtml}</tbody>
</table>
</body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="min-h-screen bg-background print:bg-white">
      <div className="print:hidden">
        <GradientHeader title="Exceções" subtitle="Itens com problemas reportados">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
            <Link href="/">
              <Button
                variant="outline"
                size="sm"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
            </Link>
          </div>
        </GradientHeader>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4 print:py-0 print:px-0">

        {/* Printable Header - Only visible when printing */}
        <div className="hidden print:block mb-4 pt-4">
          <h1 className="text-2xl font-bold">Relatório de Exceções</h1>
          <p className="text-sm text-gray-500">Impresso em: {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
          {(filterDateRange?.from || searchOrderQuery || selectedExceptionType !== 'all') && (
            <div className="text-xs text-gray-500 mt-1">Filtros aplicados. Total: {filteredExceptions.length} registro(s)</div>
          )}
        </div>

        {/* Filtros */}
        <div className="bg-card p-4 rounded-lg border shadow-sm space-y-4 print:hidden">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Filtro de Data */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <DatePickerWithRange date={tempDateRange} onDateChange={setTempDateRange} />
              <Button variant="secondary" onClick={() => setFilterDateRange(tempDateRange)}>
                Buscar
              </Button>
            </div>

            {/* Filtro de Pedido */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar Pedido (separe múltiplos por vírgula)"
                value={searchOrderQuery}
                onChange={(e) => setSearchOrderQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filtro de Motivo */}
            <Select value={selectedExceptionType} onValueChange={setSelectedExceptionType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Motivos</SelectItem>
                <SelectItem value="nao_encontrado">Não Encontrado</SelectItem>
                <SelectItem value="avariado">Avariado</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <SectionCard
          title={`Exceções Pendentes (${filteredExceptions.length})`}
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
        >
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredExceptions && filteredExceptions.length > 0 ? (
            <div className="overflow-x-auto -mx-6 print:overflow-visible print:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Reportado Por</TableHead>
                    <TableHead>Observação</TableHead>
                    <TableHead>Autorizado Por</TableHead>
                    {isAdmin && <TableHead className="w-[60px]"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExceptions.map((exception) => {
                    const typeConfig = exceptionTypeLabels[exception.type] || {
                      label: exception.type,
                      color: "bg-gray-100 text-gray-700",
                    };
                    return (
                      <TableRow key={exception.id} data-testid={`row-exception-${exception.id}`}>
                        {/* Pedido */}
                        <TableCell className="font-mono font-medium">
                          {exception.orderItem?.order?.erpOrderId || "-"}
                        </TableCell>

                        {/* Data/Hora */}
                        <TableCell className="text-sm whitespace-nowrap">
                          {format(new Date(exception.createdAt), "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </TableCell>

                        {/* Código (Barcode) */}
                        <TableCell className="font-mono text-xs">
                          {exception.orderItem?.product?.barcode || "-"}
                        </TableCell>

                        {/* Descrição */}
                        <TableCell className="max-w-[250px]">
                          <p className="font-medium truncate" title={exception.orderItem?.product?.name || "-"}>
                            {exception.orderItem?.product?.name || "-"}
                          </p>
                        </TableCell>

                        {/* Quantidade */}
                        <TableCell className="font-medium">
                          {Number(exception.quantity)} {exception.orderItem?.product?.unit || "UN"}
                        </TableCell>

                        {/* Motivo */}
                        <TableCell>
                          <Badge variant="outline" className={`${typeConfig.color} border-0`}>
                            {typeConfig.label}
                          </Badge>
                        </TableCell>

                        {/* Reportado Por */}
                        <TableCell>{exception.reportedByUser?.name || "-"}</TableCell>

                        {/* Observação */}
                        <TableCell className="max-w-[200px]">
                          <p className="text-sm text-muted-foreground truncate">
                            {exception.observation || "-"}
                          </p>
                        </TableCell>

                        {/* Autorizado Por */}
                        <TableCell>
                          {exception.authorizedByName ? (
                            <div className="flex items-center gap-1 text-sm">
                              <span className="text-green-600">✓</span>
                              <span>{exception.authorizedByName}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Pendente</span>
                          )}
                        </TableCell>

                        {/* Delete — Admin only */}
                        {isAdmin && (
                          <TableCell>
                            <DeleteExceptionButton
                              exceptionId={exception.id}
                              productName={exception.orderItem?.product?.name || "item"}
                              onDeleted={() => queryClient.invalidateQueries({ queryKey: exceptionsQueryKey })}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileWarning className="h-16 w-16 mx-auto mb-4 opacity-40" />
              <p className="text-lg font-medium">Nenhuma exceção registrada</p>
              <p className="text-sm">
                {exceptions && exceptions.length > 0
                  ? "Nenhuma exceção encontrada com os filtros aplicados"
                  : "Todas as operações estão normais"}
              </p>
            </div>
          )}
        </SectionCard>
      </main>
    </div>
  );
}

function DeleteExceptionButton({
  exceptionId,
  productName,
  onDeleted,
}: {
  exceptionId: string;
  productName: string;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/exceptions/${exceptionId}`),
    onSuccess: () => {
      toast({ title: "Exceção removida", description: `A exceção de "${productName}" foi apagada e o item foi resetado.` });
      onDeleted();
    },
    onError: () => {
      toast({ title: "Erro ao apagar", description: "Não foi possível remover a exceção.", variant: "destructive" });
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar Exceção?</AlertDialogTitle>
          <AlertDialogDescription>
            A exceção de <strong>"{productName}"</strong> será removida e o item retornará ao status pendente para recoleta.
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Apagando..." : "Apagar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
