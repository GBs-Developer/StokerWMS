import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, useSessionQueryKey } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { GradientHeader } from "@/components/ui/gradient-header";
import { SummaryPill } from "@/components/ui/summary-pill";
import { ActionTile } from "@/components/ui/action-tile";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  ClipboardCheck,
  Truck,
  AlertTriangle,
  FileText,
  Users,
  Settings,
  LogOut,
  RefreshCw,
  Route,
  SlidersHorizontal,
} from "lucide-react";
import type { Order } from "@shared/schema";
import { useSSE } from "@/hooks/use-sse";
import { useCallback } from "react";
import { format } from "date-fns";

export default function SupervisorDashboard() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "administrador";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const statsQueryKey = useSessionQueryKey(["/api/stats"]);
  const ordersQueryKey = useSessionQueryKey(["/api/orders"]);

  const { data: stats, isLoading: statsLoading } = useQuery<{
    pendentes: number;
    emSeparacao: number;
    separados: number;
    conferidos: number;
    excecoes: number;
  }>({
    queryKey: statsQueryKey,
  });

  const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ordersQueryKey,
  });



  const handleSSEMessage = useCallback((type: string, data: any) => {
    queryClient.invalidateQueries({ queryKey: statsQueryKey });
    queryClient.invalidateQueries({ queryKey: ordersQueryKey });
  }, [queryClient, statsQueryKey, ordersQueryKey]);

  useSSE('/api/sse', ['picking_update', 'lock_acquired', 'lock_released', 'exception_created', 'picking_started', 'picking_finished', 'conference_started', 'conference_finished', 'work_units_unlocked', 'orders_launched', 'orders_relaunched', 'orders_launch_cancelled', 'work_unit_created', 'item_picked'], handleSSEMessage);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sync");
      if (!res.ok) throw new Error("Falha na sincronização");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: statsQueryKey });
      queryClient.invalidateQueries({ queryKey: ordersQueryKey });
      toast({
        title: "Sincronizado",
        description: "Painel atualizado com dados do ERP.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao sincronizar com ERP.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader
        title="Painel do Supervisor"
        subtitle={`Olá, ${user?.name || "Supervisor"}`}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || ordersLoading}
          className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          data-testid="button-refresh"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Sincronizando..." : "Atualizar"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </GradientHeader>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {statsLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))
          ) : (
            <>
              <SummaryPill
                icon={Package}
                label="Pendentes"
                value={stats?.pendentes || 0}
              />
              <SummaryPill
                icon={ClipboardCheck}
                label="Separados"
                value={stats?.separados || 0}
              />
              <SummaryPill
                icon={FileText}
                label="Conferidos"
                value={stats?.conferidos || 0}
              />
              <SummaryPill
                icon={AlertTriangle}
                label="Exceções"
                value={stats?.excecoes || 0}
                className={stats?.excecoes ? "ring-2 ring-destructive/20" : ""}
              />
            </>
          )}
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ActionTile
            icon={Package}
            title="Pedidos"
            description="Gerenciar pedidos"
            href="/supervisor/orders"
            badge={stats?.pendentes}
          />
          <ActionTile
            icon={Route}
            title="Rotas"
            description="Cadastro de rotas"
            href="/supervisor/routes"
          />

          <ActionTile
            icon={Truck}
            title="Expedição"
            description="Atribuir pedidos a rotas"
            href="/supervisor/route-orders"
          />
          <ActionTile
            icon={AlertTriangle}
            title="Exceções"
            description="Ver exceções pendentes"
            href="/supervisor/exceptions"
            badge={stats?.excecoes}
          />
          <ActionTile
            icon={FileText}
            title="Relatórios"
            description="Gerar relatórios PDF"
            href="/supervisor/reports"
          />
          <ActionTile
            icon={Users}
            title="Usuários"
            description="Gerenciar operadores"
            href="/supervisor/users"
          />
          {isAdmin && (
            <ActionTile
              icon={SlidersHorizontal}
              title="Qtd. Manual"
              description="Regras de quantidade"
              href="/supervisor/manual-qty-rules"
            />
          )}
          {isAdmin && (
            <ActionTile
              icon={ClipboardCheck}
              title="Auditoria"
              description="Logs de operações"
              href="/supervisor/audit"
            />
          )}
          {isAdmin && (
            <ActionTile
              icon={Settings}
              title="Mapping Studio"
              description="Mapeamento DB2 → App"
              href="/supervisor/mapping-studio"
            />
          )}
        </section>

        <SectionCard
          title="Últimos Pedidos"
          icon={<Package className="h-4 w-4 text-primary" />}
          actions={
            <Button variant="ghost" size="sm" asChild>
              <a href="/supervisor/orders" data-testid="link-view-all-orders">Ver todos</a>
            </Button>
          }
        >
          {ordersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : orders && orders.length > 0 ? (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status Financeiro</TableHead>
                    <TableHead>Prioridade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.slice(0, 10).map((order) => (
                    <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                      <TableCell className="font-mono font-medium">
                        {order.erpOrderId}
                      </TableCell>
                      <TableCell>
                        {order.createdAt ? format(new Date(order.createdAt), "dd/MM/yyyy HH:mm") : '-'}
                      </TableCell>
                      <TableCell>{order.customerName}</TableCell>
                      <TableCell>
                        R$ {Number(order.totalValue).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                          ${order.financialStatus === 'faturado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {order.financialStatus === 'faturado' ? 'Liberado' : order.financialStatus}
                        </span>
                      </TableCell>
                      <TableCell>
                        {order.priority > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                            Alta
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">Normal</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>Nenhum pedido encontrado</p>
            </div>
          )}
        </SectionCard>
      </main>
    </div>
  );
}
