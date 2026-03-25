import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
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
import { ArrowLeft, Plus, Loader2, CheckCircle, XCircle, BarChart3, Trash2, ScanBarcode, Tag, Calendar, Package, Factory, Barcode } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

const cycleTypeOptions = [
  { value: "por_produto", label: "Por Produto", desc: "Conta por produto específico" },
  { value: "por_pallet", label: "Por Pallet", desc: "Conta por pallet" },
  { value: "por_endereco", label: "Por Endereço", desc: "Conta por endereço de armazenagem" },
];

export default function ContagemPage() {
  const [, navigate] = useLocation();
  const { user, companyId, companiesData } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCycle, setSelectedCycle] = useState<any>(null);
  const [showNew, setShowNew] = useState(false);
  const [newNotes, setNewNotes] = useState("");
  const [newType, setNewType] = useState("por_produto");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const [scanInput, setScanInput] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({ type: newType, notes: newNotes, items: [] }),
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
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
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
      if (selectedCycle && selectedCycle.id === deleteTarget?.id) setSelectedCycle(null);
      toast({ title: "Ciclo apagado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const loadCycle = async (id: string) => {
    const res = await fetch(`/api/counting-cycles/${id}`, { credentials: "include" });
    if (res.ok) {
      setSelectedCycle(await res.json());
      setTimeout(() => scanRef.current?.focus(), 200);
    }
  };

  const addItemByScan = async () => {
    const code = scanInput.trim();
    if (!code || !selectedCycle) return;
    setScanLoading(true);
    try {
      const res = await fetch(`/api/counting-cycles/${selectedCycle.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: code }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Produto não encontrado", description: err.error, variant: "destructive" });
      } else {
        const newItem = await res.json();
        setSelectedCycle((prev: any) => ({
          ...prev,
          items: [...(prev.items || []), newItem],
        }));
        setScanInput("");
        toast({ title: `Produto adicionado: ${newItem.product?.name || newItem.productId}` });
        setTimeout(() => scanRef.current?.focus(), 50);
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setScanLoading(false);
    }
  };

  const countItemMutation = useMutation({
    mutationFn: async ({ itemId, countedQty, lot, expiryDate }: { itemId: string; countedQty: number; lot?: string; expiryDate?: string }) => {
      const res = await fetch(`/api/counting-cycles/${selectedCycle.id}/item`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, countedQty, lot, expiryDate }),
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
      const res = await fetch(`/api/counting-cycles/${selectedCycle.id}/approve`, { method: "POST", credentials: "include" });
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
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
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

  const statusColors: Record<string, string> = {
    pendente: "bg-yellow-100 text-yellow-800",
    em_andamento: "bg-blue-100 text-blue-800",
    concluido: "bg-green-100 text-green-800",
    aprovado: "bg-emerald-100 text-emerald-800",
    rejeitado: "bg-red-100 text-red-800",
  };

  const statusLabels: Record<string, string> = {
    pendente: "Pendente", em_andamento: "Em Andamento", concluido: "Concluído",
    aprovado: "Aprovado", rejeitado: "Rejeitado",
  };

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Ciclo de Contagem" subtitle={companyId ? (companiesData?.find(c => c.id === companyId)?.name || "") : ""}>
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-4xl mx-auto px-3 py-4 space-y-4">
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
                <CardContent className="pt-4 space-y-4">
                  <div>
                    <p className="text-sm font-semibold mb-2">Tipo de Auditoria</p>
                    <div className="grid gap-2">
                      {cycleTypeOptions.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setNewType(opt.value)}
                          className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${newType === opt.value ? "bg-primary/5 border-primary/40 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
                          data-testid={`cycle-type-${opt.value}`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${newType === opt.value ? "border-primary bg-primary" : "border-muted-foreground/30"}`} />
                          <div>
                            <p className="font-semibold text-sm">{opt.label}</p>
                            <p className="text-xs text-muted-foreground">{opt.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea placeholder="Observações do ciclo (opcional)..." value={newNotes} onChange={e => setNewNotes(e.target.value)} data-testid="input-cycle-notes" />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setShowNew(false)}>Cancelar</Button>
                    <Button className="flex-1" onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-create-cycle">
                      {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Criar Ciclo
                    </Button>
                  </div>
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
                      <div className="font-semibold text-sm">
                        {cycleTypeOptions.find(o => o.value === c.type)?.label || c.type}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                        {c.notes && ` · ${c.notes}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColors[c.status] || ""}>{statusLabels[c.status] || c.status}</Badge>
                      {isSupervisor && c.status !== "em_andamento" && (
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
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
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base">{cycleTypeOptions.find(o => o.value === selectedCycle.type)?.label || selectedCycle.type}</CardTitle>
                    {selectedCycle.notes && <p className="text-xs text-muted-foreground mt-0.5">{selectedCycle.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={statusColors[selectedCycle.status] || ""}>{statusLabels[selectedCycle.status] || selectedCycle.status}</Badge>
                    {isSupervisor && selectedCycle.status === "concluido" && (
                      <>
                        <Button size="sm" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} data-testid="button-approve-cycle">
                          <CheckCircle className="h-4 w-4 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending} data-testid="button-reject-cycle">
                          <XCircle className="h-4 w-4 mr-1" /> Rejeitar
                        </Button>
                      </>
                    )}
                    {isSupervisor && selectedCycle.status !== "em_andamento" && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget(selectedCycle)} data-testid="button-delete-cycle-detail">
                        <Trash2 className="h-4 w-4 mr-1" /> Apagar
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {selectedCycle.status !== "aprovado" && (
                  <div className="flex gap-2 mb-4">
                    <div className="relative flex-1">
                      <ScanBarcode className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                      <Input
                        ref={scanRef}
                        placeholder="Bipe ou digite o código do produto..."
                        value={scanInput}
                        onChange={e => setScanInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addItemByScan()}
                        className="pl-10 h-11"
                        data-testid="input-scan-count"
                      />
                    </div>
                    <Button onClick={addItemByScan} disabled={!scanInput.trim() || scanLoading} data-testid="button-add-scan-item">
                      {scanLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                )}

                {selectedCycle.items?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Bipe um produto para adicionar ao ciclo
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedCycle.items?.map((item: any) => (
                      <CountingItemCard
                        key={item.id}
                        item={item}
                        cycleStatus={selectedCycle.status}
                        onCount={(countedQty, lot, expiryDate) => countItemMutation.mutate({ itemId: item.id, countedQty, lot, expiryDate })}
                        isPending={countItemMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Button variant="outline" className="w-full" onClick={() => setSelectedCycle(null)} data-testid="button-back-to-list">
              Voltar à lista
            </Button>
          </div>
        )}
      </main>

      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar Ciclo de Contagem</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete">Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending} data-testid="button-confirm-delete">
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CountingItemCard({ item, cycleStatus, onCount, isPending }: {
  item: any;
  cycleStatus: string;
  onCount: (qty: number, lot?: string, expiry?: string) => void;
  isPending: boolean;
}) {
  const [countInput, setCountInput] = useState("");
  const [lotInput, setLotInput] = useState(item.lot || "");
  const [expiryInput, setExpiryInput] = useState(item.expiryDate || "");

  const product = item.product;
  const isPending2 = item.status === "pendente";
  const isCounted = item.status !== "pendente";

  const handleSubmit = () => {
    const qty = parseFloat(countInput);
    if (isNaN(qty) || qty < 0) return;
    onCount(qty, lotInput || undefined, expiryInput || undefined);
  };

  const statusBadge: Record<string, string> = {
    pendente: "bg-yellow-100 text-yellow-800",
    contado: "bg-green-100 text-green-800",
    divergente: "bg-red-100 text-red-800",
  };

  return (
    <div className={`p-4 rounded-xl border space-y-3 ${isCounted ? "bg-muted/20" : "bg-card"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {product ? (
            <>
              <p className="font-bold text-sm leading-tight">{product.name}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Package className="h-3 w-3" /><span className="font-mono font-semibold text-foreground">{product.erpCode}</span>
                </span>
                {product.manufacturer && (
                  <span className="flex items-center gap-1">
                    <Factory className="h-3 w-3" />{product.manufacturer}
                  </span>
                )}
                {product.barcode && (
                  <span className="flex items-center gap-1">
                    <Barcode className="h-3 w-3" /><span className="font-mono">{product.barcode}</span>
                  </span>
                )}
                <span>Seção: {product.section}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Produto {item.productId?.slice(0, 12) || "—"}</p>
          )}
        </div>
        <Badge className={statusBadge[item.status] || "bg-gray-100 text-gray-800"} data-testid={`status-${item.id}`}>
          {item.status === "pendente" ? "Pendente" : item.status === "contado" ? "Contado" : "Divergente"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1 mb-1">
            <Tag className="h-3 w-3" />Lote
          </label>
          <Input
            placeholder="Lote"
            value={lotInput}
            onChange={e => setLotInput(e.target.value)}
            className="h-9 text-sm"
            data-testid={`input-lot-${item.id}`}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1 mb-1">
            <Calendar className="h-3 w-3" />Validade
          </label>
          <Input
            type="date"
            value={expiryInput}
            onChange={e => setExpiryInput(e.target.value)}
            className="h-9 text-sm"
            data-testid={`input-expiry-${item.id}`}
          />
        </div>
      </div>

      {isCounted ? (
        <div className="flex items-center justify-between text-sm p-2.5 rounded-lg bg-muted/30 border">
          <span className="text-muted-foreground">Contado:</span>
          <span className="font-mono font-bold text-lg">{item.countedQty}</span>
          {item.divergencePct !== null && item.divergencePct !== undefined && item.divergencePct > 0 && (
            <span className="text-destructive text-xs font-semibold">{item.divergencePct.toFixed(1)}% diverg.</span>
          )}
        </div>
      ) : cycleStatus !== "aprovado" ? (
        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Qtd contada"
            value={countInput}
            onChange={e => setCountInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            className="flex-1 h-10 text-base font-mono"
            data-testid={`input-count-${item.id}`}
          />
          <Button onClick={handleSubmit} disabled={!countInput || isPending} className="h-10" data-testid={`button-submit-count-${item.id}`}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
