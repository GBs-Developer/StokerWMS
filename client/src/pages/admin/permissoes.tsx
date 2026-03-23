import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionQueryKey } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ShieldCheck, Save, Loader2 } from "lucide-react";
import { Link } from "wouter";

interface UserPermission {
  id: string;
  username: string;
  name: string;
  role: string;
  allowedModules: string[] | null;
}

const ALL_MODULES = [
  { id: "/wms/recebimento", label: "Recebimento", section: "Operação" },
  { id: "/wms/checkin", label: "Endereçamento", section: "Operação" },
  { id: "/wms/transferencia", label: "Transferência", section: "Operação" },
  { id: "/wms/contagem", label: "Contagem", section: "Operação" },
  { id: "/wms/enderecos", label: "Endereços", section: "Operação" },
  { id: "/wms/produtos", label: "Buscar Produtos", section: "Operação" },
  { id: "/fila-pedidos", label: "Fila de Pedidos", section: "Logística" },
  { id: "/supervisor/orders", label: "Pedidos", section: "Logística" },
  { id: "/supervisor/routes", label: "Rotas", section: "Logística" },
  { id: "/supervisor/route-orders", label: "Expedição", section: "Logística" },
  { id: "/supervisor/exceptions", label: "Exceções", section: "Logística" },
  { id: "/supervisor/users", label: "Usuários", section: "Administração" },
  { id: "/supervisor/manual-qty-rules", label: "Regras de Qtd. Manual", section: "Administração" },
  { id: "/supervisor/mapping-studio", label: "Mapping Studio", section: "Administração" },
  { id: "/supervisor/reports", label: "Relatórios", section: "Administração" },
  { id: "/supervisor/audit", label: "Auditoria", section: "Administração" },
  { id: "/admin/permissoes", label: "Permissões de Acesso", section: "Administração" },
];

const SECTIONS = ["Operação", "Logística", "Administração"];

const roleLabels: Record<string, string> = {
  administrador: "Administrador",
  supervisor: "Supervisor",
  separacao: "Separador",
  conferencia: "Conferente",
  balcao: "Balcão",
  fila_pedidos: "Fila de Pedidos",
  recebedor: "Recebedor",
  empilhador: "Empilhador",
  conferente_wms: "Conferente WMS",
};

export default function PermissoesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const usersQueryKey = useSessionQueryKey(["/api/admin/permissions"]);

  const [editingUser, setEditingUser] = useState<UserPermission | null>(null);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);

  const { data: users, isLoading } = useQuery<UserPermission[]>({
    queryKey: usersQueryKey,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ userId, modules }: { userId: string; modules: string[] | null }) => {
      const res = await apiRequest("PUT", `/api/admin/permissions/${userId}`, { allowedModules: modules });
      if (!res.ok) throw new Error("Falha ao salvar permissões");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersQueryKey });
      setEditingUser(null);
      toast({ title: "Permissões salvas", description: "As permissões do usuário foram atualizadas." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível salvar as permissões.", variant: "destructive" });
    },
  });

  const openEditor = (user: UserPermission) => {
    setEditingUser(user);
    setSelectedModules(user.allowedModules || []);
  };

  const toggleModule = (moduleId: string) => {
    setSelectedModules((prev) =>
      prev.includes(moduleId) ? prev.filter((m) => m !== moduleId) : [...prev, moduleId]
    );
  };

  const toggleSection = (section: string) => {
    const sectionModuleIds = ALL_MODULES.filter((m) => m.section === section).map((m) => m.id);
    const allSelected = sectionModuleIds.every((id) => selectedModules.includes(id));
    if (allSelected) {
      setSelectedModules((prev) => prev.filter((id) => !sectionModuleIds.includes(id)));
    } else {
      setSelectedModules((prev) => [...new Set([...prev, ...sectionModuleIds])]);
    }
  };

  const selectAll = () => {
    setSelectedModules(ALL_MODULES.map((m) => m.id));
  };

  const clearAll = () => {
    setSelectedModules([]);
  };

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Permissões de Acesso" subtitle="Definir módulos visíveis por usuário">
        <Link href="/">
          <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20" data-testid="button-back-home">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
      </GradientHeader>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Usuários e Permissões</h2>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Módulos</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((u) => (
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell className="font-mono text-sm">{u.username}</TableCell>
                      <TableCell>{u.name}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                          {roleLabels[u.role] || u.role}
                        </span>
                      </TableCell>
                      <TableCell>
                        {u.allowedModules ? (
                          <span className="text-sm text-muted-foreground">
                            {u.allowedModules.length} módulo{u.allowedModules.length !== 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">Padrão do cargo</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openEditor(u)} data-testid={`button-edit-permissions-${u.id}`}>
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </main>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Permissões — {editingUser?.name}
            </DialogTitle>
            <DialogDescription>
              Selecione os módulos que este usuário pode acessar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 mb-4">
            <p className="text-sm text-muted-foreground">
              Cargo: <span className="font-medium text-foreground">{editingUser?.role ? roleLabels[editingUser.role] || editingUser.role : ""}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll} data-testid="button-select-all">
                Marcar todos
              </Button>
              <Button variant="outline" size="sm" onClick={clearAll} data-testid="button-clear-all">
                Desmarcar todos
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {SECTIONS.map((section) => {
              const sectionModules = ALL_MODULES.filter((m) => m.section === section);
              const allSelected = sectionModules.every((m) => selectedModules.includes(m.id));
              const someSelected = sectionModules.some((m) => selectedModules.includes(m.id));

              return (
                <div key={section} className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox
                      checked={allSelected}
                      ref={undefined}
                      onCheckedChange={() => toggleSection(section)}
                      data-testid={`checkbox-section-${section.toLowerCase()}`}
                    />
                    <span className="font-semibold text-sm">{section}</span>
                    {someSelected && !allSelected && (
                      <span className="text-xs text-muted-foreground">(parcial)</span>
                    )}
                  </div>
                  <div className="space-y-1.5 ml-6">
                    {sectionModules.map((mod) => (
                      <label key={mod.id} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={selectedModules.includes(mod.id)}
                          onCheckedChange={() => toggleModule(mod.id)}
                          data-testid={`checkbox-module-${mod.id.replace(/\//g, "-")}`}
                        />
                        <span className="text-sm">{mod.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between gap-2 pt-4 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => editingUser && saveMutation.mutate({ userId: editingUser.id, modules: null })}
              disabled={saveMutation.isPending}
              data-testid="button-reset-permissions"
            >
              Resetar para padrão do cargo
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingUser(null)} data-testid="button-cancel-permissions">
                Cancelar
              </Button>
              <Button
                onClick={() => editingUser && saveMutation.mutate({ userId: editingUser.id, modules: selectedModules })}
                disabled={saveMutation.isPending}
                data-testid="button-save-permissions"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
