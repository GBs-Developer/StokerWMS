import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ShieldAlert,
  CheckCircle,
  Package,
  Users,
  Warehouse,
  BarChart3,
  PackagePlus,
  ScrollText,
  ClipboardList,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface ModuleGroup {
  id: string;
  label: string;
  description: string;
  icon: any;
  iconColor: string;
  tables: { name: string; label: string }[];
  dependsOn?: string[];
  includesModules?: string[];
  danger?: boolean;
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: "pedidos",
    label: "Pedidos & Separação",
    description: "Remove todos os pedidos importados, work units, sessões de picking, exceções e volumes.",
    icon: Package,
    iconColor: "text-blue-500",
    tables: [
      { name: "orders", label: "Pedidos" },
      { name: "order_items", label: "Itens de pedido" },
      { name: "work_units", label: "Work units (separação/conferência)" },
      { name: "exceptions", label: "Exceções registradas" },
      { name: "picking_sessions", label: "Sessões de separação" },
      { name: "order_volumes", label: "Volumes de pedidos" },
      { name: "cache_orcamentos", label: "Cache de importação (orçamentos)" },
    ],
  },
  {
    id: "usuarios",
    label: "Usuários sem movimentações",
    description: "Remove apenas usuários que não possuem nenhum registro vinculado a pedidos, separação, conferência, pallets ou contagens. Usuários com histórico de operações são preservados.",
    icon: Users,
    iconColor: "text-cyan-500",
    tables: [
      { name: "users", label: "Usuários sem registros atribuídos" },
    ],
    danger: false,
  },
  {
    id: "recebimento",
    label: "Recebimento & NFs",
    description: "Remove o cache de notas fiscais e todos os dados de recebimento importados.",
    icon: PackagePlus,
    iconColor: "text-violet-500",
    tables: [
      { name: "nf_cache", label: "Notas fiscais (cache)" },
      { name: "nf_items", label: "Itens das NFs" },
    ],
  },
  {
    id: "pallets",
    label: "Pallets & Movimentações",
    description: "Remove pallets criados, seus itens e o histórico completo de movimentações.",
    icon: ScrollText,
    iconColor: "text-orange-500",
    tables: [
      { name: "pallets", label: "Pallets" },
      { name: "pallet_items", label: "Itens dos pallets" },
      { name: "pallet_movements", label: "Movimentações de pallets" },
    ],
  },
  {
    id: "contagens",
    label: "Ciclos de Contagem",
    description: "Remove todos os ciclos de inventário e seus itens.",
    icon: BarChart3,
    iconColor: "text-amber-500",
    tables: [
      { name: "counting_cycles", label: "Ciclos de contagem" },
      { name: "counting_cycle_items", label: "Itens dos ciclos" },
    ],
  },
  {
    id: "enderecos",
    label: "Endereços WMS",
    description: "Remove todos os endereços de armazenagem. Inclui automaticamente pallets, contagens e estoque.",
    icon: Warehouse,
    iconColor: "text-red-500",
    tables: [
      { name: "wms_addresses", label: "Endereços WMS" },
      { name: "product_company_stock", label: "Estoque por endereço" },
    ],
    includesModules: ["pallets", "contagens"],
    danger: true,
  },
  {
    id: "logs",
    label: "Logs & Auditoria",
    description: "Remove o histórico de operações e logs de auditoria do sistema.",
    icon: ClipboardList,
    iconColor: "text-slate-500",
    tables: [
      { name: "audit_logs", label: "Logs de auditoria" },
    ],
  },
];

type CountsData = {
  pedidos: Record<string, number>;
  rotas: Record<string, number>;
  recebimento: Record<string, number>;
  pallets: Record<string, number>;
  contagens: Record<string, number>;
  enderecos: Record<string, number>;
  logs: Record<string, number>;
};

function sumModule(counts: CountsData, moduleId: string): number {
  const moduleData = (counts as any)[moduleId];
  if (!moduleData) return 0;
  return Object.values(moduleData).reduce((sum: number, v: any) => sum + Number(v), 0);
}

function totalForSelection(counts: CountsData, selected: string[]): number {
  const effModules = new Set(selected);
  selected.forEach(m => {
    const grp = MODULE_GROUPS.find(g => g.id === m);
    grp?.includesModules?.forEach(im => effModules.add(im));
  });
  let total = 0;
  effModules.forEach(m => { total += sumModule(counts, m); });
  return total;
}

export default function LimpezaPage() {
  const { companyId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [lastResult, setLastResult] = useState<{ deleted: Record<string, number>; modulesProcessed: string[] } | null>(null);

  const { data: counts, isLoading: countsLoading, refetch: refetchCounts } = useQuery<CountsData>({
    queryKey: ["/api/admin/cleanup/counts", companyId],
    queryFn: async () => {
      const res = await fetch("/api/admin/cleanup/counts", { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 10_000,
  });

  const cleanupMutation = useMutation({
    mutationFn: async (modules: string[]) => {
      const res = await apiRequest("POST", "/api/admin/cleanup", {
        modules,
        confirmation: "LIMPAR DADOS",
      });
      return res.json();
    },
    onSuccess: (data) => {
      setLastResult(data);
      setConfirmOpen(false);
      setConfirmText("");
      setSelected(new Set());
      refetchCounts();
      toast({ title: "Limpeza concluída", description: "Os dados selecionados foram removidos com sucesso." });
    },
    onError: (err: any) => {
      toast({ title: "Erro na limpeza", description: err?.message || "Tente novamente.", variant: "destructive" });
    },
  });

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalSelected = selected.size;

  const effectiveModules = () => {
    const eff = new Set(selected);
    selected.forEach(m => {
      const grp = MODULE_GROUPS.find(g => g.id === m);
      grp?.includesModules?.forEach(im => eff.add(im));
    });
    return Array.from(eff);
  };

  const totalRecords = counts ? totalForSelection(counts, Array.from(selected)) : 0;

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Limpeza de Dados" subtitle="Remover dados de teste ou resetar módulos">
        <Link href="/">
          <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        </Link>
      </GradientHeader>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Warning banner */}
        <div className="flex gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30">
          <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">Ação irreversível</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Os dados removidos não poderão ser recuperados. Use este recurso apenas em ambientes de teste.
              A limpeza aplica-se apenas à empresa atual e respeita as dependências entre tabelas.
            </p>
          </div>
        </div>

        {/* Last result */}
        {lastResult && (
          <div className="flex gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-green-800 dark:text-green-400">Limpeza realizada com sucesso</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(lastResult.deleted).filter(([, v]) => v > 0).map(([table, count]) => (
                  <Badge key={table} variant="outline" className="text-[10px] text-green-700 border-green-300">
                    {table}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Header actions */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Selecione os módulos que deseja limpar
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchCounts()}
            disabled={countsLoading}
            data-testid="button-refresh-counts"
          >
            {countsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Atualizar contagens</span>
          </Button>
        </div>

        {/* Module cards */}
        <div className="space-y-3">
          {MODULE_GROUPS.map((group) => {
            const Icon = group.icon;
            const isSelected = selected.has(group.id);
            const moduleTotal = counts ? sumModule(counts, group.id) : null;
            const includedTotal = counts && group.includesModules
              ? group.includesModules.reduce((s, im) => s + sumModule(counts, im), 0)
              : 0;
            const displayTotal = moduleTotal !== null ? moduleTotal + includedTotal : null;

            return (
              <div
                key={group.id}
                className={`rounded-xl border p-4 transition-all cursor-pointer ${
                  isSelected
                    ? "border-destructive/50 bg-destructive/5"
                    : "border-border bg-card hover:border-border/80"
                }`}
                onClick={() => toggle(group.id)}
                data-testid={`module-card-${group.id}`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggle(group.id)}
                    className="mt-0.5 shrink-0"
                    data-testid={`checkbox-${group.id}`}
                  />
                  <div className={`w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0`}>
                    <Icon className={`h-[18px] w-[18px] ${group.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold">{group.label}</h3>
                      {group.danger && (
                        <Badge className="bg-red-100 text-red-700 text-[10px]">
                          <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Alto impacto
                        </Badge>
                      )}
                      {group.includesModules && (
                        <Badge variant="outline" className="text-[10px]">
                          Inclui: {group.includesModules.map(im => MODULE_GROUPS.find(g => g.id === im)?.label).join(", ")}
                        </Badge>
                      )}
                      {displayTotal !== null && (
                        <Badge
                          variant="secondary"
                          className={`ml-auto text-[11px] ${displayTotal > 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" : "text-muted-foreground"}`}
                          data-testid={`count-${group.id}`}
                        >
                          {countsLoading ? "..." : `${displayTotal.toLocaleString("pt-BR")} reg.`}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{group.description}</p>
                    {isSelected && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {group.tables.map(t => (
                          <Badge key={t.name} variant="outline" className="text-[10px] text-destructive/70 border-destructive/30">
                            {t.label}
                          </Badge>
                        ))}
                        {group.includesModules?.map(im => {
                          const dep = MODULE_GROUPS.find(g => g.id === im);
                          return dep?.tables.map(t => (
                            <Badge key={`${im}-${t.name}`} variant="outline" className="text-[10px] text-destructive/50 border-destructive/20">
                              {t.label}
                            </Badge>
                          ));
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Execute button */}
        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            {totalSelected === 0
              ? "Nenhum módulo selecionado"
              : `${totalSelected} módulo${totalSelected !== 1 ? "s" : ""} selecionado${totalSelected !== 1 ? "s" : ""} — ${totalRecords.toLocaleString("pt-BR")} registros a remover`}
          </p>
          <Button
            variant="destructive"
            disabled={totalSelected === 0}
            onClick={() => { setConfirmText(""); setConfirmOpen(true); }}
            data-testid="button-open-confirm"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Limpar selecionados
          </Button>
        </div>
      </main>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!cleanupMutation.isPending) setConfirmOpen(open); }}>
        <DialogContent className="max-w-md" data-testid="dialog-confirm-cleanup">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmar limpeza de dados
            </DialogTitle>
            <DialogDescription>
              Esta ação é permanente e não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-lg bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Módulos a limpar</p>
              <div className="flex flex-wrap gap-1">
                {effectiveModules().map(m => {
                  const grp = MODULE_GROUPS.find(g => g.id === m);
                  return (
                    <Badge key={m} variant="outline" className="text-xs text-destructive border-destructive/40">
                      {grp?.label || m}
                    </Badge>
                  );
                })}
              </div>
              {counts && (
                <p className="text-sm font-semibold text-destructive">
                  Total: {totalRecords.toLocaleString("pt-BR")} registros serão excluídos
                </p>
              )}
            </div>

            {/* Confirmation input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Digite <span className="font-mono font-bold">LIMPAR DADOS</span> para confirmar
              </label>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="LIMPAR DADOS"
                className="font-mono"
                data-testid="input-confirm-text"
                autoComplete="off"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmOpen(false)}
                disabled={cleanupMutation.isPending}
                data-testid="button-cancel-cleanup"
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={confirmText !== "LIMPAR DADOS" || cleanupMutation.isPending}
                onClick={() => cleanupMutation.mutate(effectiveModules())}
                data-testid="button-execute-cleanup"
              >
                {cleanupMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Limpando...</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-2" /> Confirmar limpeza</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
