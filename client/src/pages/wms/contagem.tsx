import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, getCompanyLabel } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Loader2, Eye, EyeOff, CheckCircle, XCircle, BarChart3, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function ContagemPage() {
  const [, navigate] = useLocation();
  const { user, companyId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCycle, setSelectedCycle] = useState<any>(null);
  const [showNew, setShowNew] = useState(false);
  const [newNotes, setNewNotes] = useState("");
  const [revealedItems, setRevealedItems] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const isSupervisor = user?.role === "supervisor" || user?.role === "administrador";

  const { data: cycles = [], isLoading } = useQuery({
    queryKey: ["counting-cycles", companyId],
    queryFn: async () => {
      const res = await fetch("/api/counting-cycles", { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/counting-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "por_endereco", notes: newNotes, items: [] }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counting-cycles"] });
      setShowNew(false);
      setNewNotes("");
      toast({ title: "Ciclo criado" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/counting-cycles/${id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao apagar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counting-cycles"] });
      setDeleteTarget(null);
      if (selectedCycle && selectedCycle.id === deleteTarget?.id) {
        setSelectedCycle(null);
      }
      toast({ title: "Ciclo apagado" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const loadCycle = async (id: string) => {
    const res = await fetch(`/api/counting-cycles/${id}`, { credentials: "include" });
    if (res.ok) {
      setSelectedCycle(await res.json());
    }
  };

  const countItemMutation = useMutation({
    mutationFn: async ({ itemId, countedQty }: { itemId: string; countedQty: number }) => {
      const res = await fetch(`/api/counting-cycles/${selectedCycle.id}/item`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, countedQty }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    onSuccess: () => {
      loadCycle(selectedCycle.id);
      toast({ title: "Contagem registrada" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/counting-cycles/${selectedCycle.id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counting-cycles"] });
      loadCycle(selectedCycle.id);
      toast({ title: "Ciclo aprovado!" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/counting-cycles/${selectedCycle.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Rejeitado pelo supervisor" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counting-cycles"] });
      loadCycle(selectedCycle.id);
      toast({ title: "Ciclo rejeitado" });
    },
  });

  const toggleReveal = (itemId: string) => {
    if (!isSupervisor) return;
    setRevealedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const statusColors: Record<string, string> = {
    pendente: "bg-yellow-100 text-yellow-800",
    em_andamento: "bg-blue-100 text-blue-800",
    concluido: "bg-green-100 text-green-800",
    aprovado: "bg-emerald-100 text-emerald-800",
    rejeitado: "bg-red-100 text-red-800",
  };

  const statusLabels: Record<string, string> = {
    pendente: "Pendente",
    em_andamento: "Em Andamento",
    concluido: "Concluído",
    aprovado: "Aprovado",
    rejeitado: "Rejeitado",
  };

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Ciclo de Contagem" subtitle={companyId ? getCompanyLabel(companyId) : ""}>
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {!selectedCycle && (
          <>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Ciclos de Contagem</h2>
              <Button onClick={() => setShowNew(!showNew)} size="sm" data-testid="button-new-cycle">
                <Plus className="h-4 w-4 mr-2" /> Novo Ciclo
              </Button>
            </div>

            {showNew && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <Textarea placeholder="Observações do ciclo..." value={newNotes} onChange={e => setNewNotes(e.target.value)} data-testid="input-cycle-notes" />
                  <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-create-cycle">
                    {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Criar Ciclo
                  </Button>
                </CardContent>
              </Card>
            )}

            {isLoading ? (
              <div className="text-center py-12"><Loader2 className="h-8 w-8 mx-auto animate-spin" /></div>
            ) : cycles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <p>Nenhum ciclo de contagem</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cycles.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 group" data-testid={`row-cycle-${c.id}`}>
                    <div className="flex-1 cursor-pointer" onClick={() => loadCycle(c.id)}>
                      <div className="font-semibold text-sm">Ciclo {c.type === "por_endereco" ? "por Endereço" : "por Produto"}</div>
                      <div className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("pt-BR")}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColors[c.status] || ""}>{statusLabels[c.status] || c.status}</Badge>
                      {isSupervisor && c.status !== "em_andamento" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                          data-testid={`button-delete-cycle-${c.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {selectedCycle && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Ciclo de Contagem</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className={statusColors[selectedCycle.status] || ""}>{statusLabels[selectedCycle.status] || selectedCycle.status}</Badge>
                  {isSupervisor && selectedCycle.status === "concluido" && (
                    <>
                      <Button size="sm" variant="default" onClick={() => approveMutation.mutate()}
                        disabled={approveMutation.isPending} data-testid="button-approve-cycle">
                        <CheckCircle className="h-4 w-4 mr-1" /> Aprovar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate()}
                        disabled={rejectMutation.isPending} data-testid="button-reject-cycle">
                        <XCircle className="h-4 w-4 mr-1" /> Rejeitar
                      </Button>
                    </>
                  )}
                  {isSupervisor && selectedCycle.status !== "em_andamento" && (
                    <Button size="sm" variant="ghost" className="text-destructive"
                      onClick={() => setDeleteTarget(selectedCycle)} data-testid="button-delete-cycle-detail">
                      <Trash2 className="h-4 w-4 mr-1" /> Apagar
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedCycle.notes && (
                <p className="text-sm text-muted-foreground">{selectedCycle.notes}</p>
              )}

              {selectedCycle.items?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum item neste ciclo. Adicione itens via API ou importe.
                </p>
              )}

              {selectedCycle.items?.map((item: any) => (
                <div key={item.id} className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {item.addressId ? `Endereço: ${item.addressId.slice(0, 8)}` : ""}
                      {item.productId ? ` Produto: ${item.productId.slice(0, 8)}` : ""}
                    </span>
                    <Badge variant={item.status === "contado" ? "default" : item.status === "divergente" ? "destructive" : "secondary"}>
                      {item.status}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Esperado:</span>
                    {revealedItems.has(item.id) || item.status === "aprovado" ? (
                      <span className="font-mono">{item.expectedQty ?? "—"}</span>
                    ) : (
                      <span className="font-mono">***</span>
                    )}
                    {isSupervisor && item.status !== "aprovado" && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleReveal(item.id)}>
                        {revealedItems.has(item.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>

                  {item.status === "pendente" && selectedCycle.status !== "aprovado" && (
                    <div className="flex gap-2 items-center">
                      <Input type="number" placeholder="Quantidade contada" className="w-40"
                        data-testid={`input-count-${item.id}`}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            const input = e.currentTarget;
                            countItemMutation.mutate({ itemId: item.id, countedQty: Number(input.value) });
                          }
                        }} />
                    </div>
                  )}

                  {item.countedQty !== null && (
                    <div className="text-sm">
                      Contado: <span className="font-mono font-semibold">{item.countedQty}</span>
                      {item.divergencePct !== null && item.divergencePct > 0 && (
                        <span className="text-destructive ml-2">({item.divergencePct.toFixed(1)}% divergência)</span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <Button variant="outline" className="w-full" onClick={() => setSelectedCycle(null)} data-testid="button-back-to-list">
                Voltar à lista
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar Ciclo de Contagem</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja apagar este ciclo? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
