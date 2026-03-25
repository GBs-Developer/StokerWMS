import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, QrCode, MapPin, Loader2, Package, CheckCircle, Trash2, Ban, Search, X, Clock, Minus, Plus, Save } from "lucide-react";
import { useLocation } from "wouter";
import { AddressPicker } from "@/components/wms/address-picker";

export default function CheckinPage() {
  const [, navigate] = useLocation();
  const { companyId, companiesData } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scanInput, setScanInput] = useState("");
  const [selectedPallet, setSelectedPallet] = useState<any>(null);
  const [editableItems, setEditableItems] = useState<any[]>([]);
  const [itemsChanged, setItemsChanged] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [filterText, setFilterText] = useState("");
  const [showAllocateConfirm, setShowAllocateConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState<string | null>(null);

  const { data: palletsWithoutAddress = [] } = useQuery({
    queryKey: ["pallets-no-address", companyId],
    queryFn: async () => {
      const res = await fetch("/api/pallets?status=sem_endereco", { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: availableAddresses = [] } = useQuery({
    queryKey: ["available-addresses", companyId],
    queryFn: async () => {
      const res = await fetch("/api/wms-addresses/available", { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: !!companyId,
  });

  const loadPallet = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const pallet = palletsWithoutAddress.find((p: any) => p.code === trimmed || p.id === trimmed);
    if (pallet) {
      const res = await fetch(`/api/pallets/${pallet.id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSelectedPallet(data);
        setEditableItems(data.items?.map((i: any) => ({ ...i })) || []);
        setItemsChanged(false);
        setScanInput("");
        setSelectedAddress("");
      }
    } else {
      toast({ title: "Pallet não encontrado", description: "Verifique se o pallet está pendente de endereçamento", variant: "destructive" });
    }
  };

  const updateItemQty = (idx: number, delta: number) => {
    setEditableItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item));
    setItemsChanged(true);
  };

  const removeItemFromPallet = (idx: number) => {
    setEditableItems(prev => prev.filter((_, i) => i !== idx));
    setItemsChanged(true);
  };

  const saveItemsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pallets/${selectedPallet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: editableItems.map(i => ({
            productId: i.productId || i.product?.id,
            quantity: i.quantity,
            lot: i.lot,
            expiryDate: i.expiryDate,
          })),
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao salvar");
      }
      return res.json();
    },
    onSuccess: async () => {
      setItemsChanged(false);
      const res = await fetch(`/api/pallets/${selectedPallet.id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSelectedPallet(data);
        setEditableItems(data.items?.map((i: any) => ({ ...i })) || []);
      }
      queryClient.invalidateQueries({ queryKey: ["pallets"] });
      toast({ title: "Itens atualizados" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const allocateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPallet || !selectedAddress) throw new Error("Selecione pallet e endereço");
      const res = await fetch(`/api/pallets/${selectedPallet.id}/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressId: selectedAddress }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao alocar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pallets"] });
      queryClient.invalidateQueries({ queryKey: ["available-addresses"] });
      queryClient.invalidateQueries({ queryKey: ["pallets-no-address"] });
      toast({ title: "Pallet alocado com sucesso!" });
      setSelectedPallet(null);
      setEditableItems([]);
      setSelectedAddress("");
      setShowAllocateConfirm(false);
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setShowAllocateConfirm(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (palletId: string) => {
      const res = await fetch(`/api/pallets/${palletId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Cancelado pelo operador no Check-in" }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao cancelar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pallets-no-address"] });
      toast({ title: "Pallet cancelado com sucesso!" });
      setSelectedPallet(null);
      setEditableItems([]);
      setShowCancelConfirm(null);
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setShowCancelConfirm(null);
    },
  });

  const selectedAddressObj = selectedAddress ? availableAddresses.find((a: any) => a.id === selectedAddress) : null;
  const filteredPallets = filterText
    ? palletsWithoutAddress.filter((p: any) => p.code?.toLowerCase().includes(filterText.toLowerCase()))
    : palletsWithoutAddress;

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Check-in / Alocação" subtitle={companyId ? (companiesData?.find(c => c.id === companyId)?.name || "") : ""}>
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="bg-white/10 border-white/20 text-white hover:bg-white/20" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-4xl mx-auto px-3 py-4 space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Escanear Pallet</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Escaneie ou digite o código do pallet"
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadPallet(scanInput)}
                autoFocus
                data-testid="input-scan-checkin"
              />
              <Button onClick={() => loadPallet(scanInput)} disabled={!scanInput.trim()} data-testid="button-search-checkin">
                <QrCode className="h-4 w-4 mr-2" /> Buscar
              </Button>
            </div>
          </CardContent>
        </Card>

        {!selectedPallet && palletsWithoutAddress.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Pallets Pendentes ({palletsWithoutAddress.length})</CardTitle>
                {palletsWithoutAddress.length > 5 && (
                  <div className="relative w-40">
                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Filtrar..." value={filterText} onChange={e => setFilterText(e.target.value)} className="pl-8 h-8 text-sm" data-testid="input-filter-checkin" />
                    {filterText && (
                      <Button variant="ghost" size="sm" className="absolute right-0.5 top-0.5 h-7 w-7 p-0" onClick={() => setFilterText("")}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredPallets.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => loadPallet(p.code)} data-testid={`checkin-pallet-${p.id}`}>
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-mono font-semibold">{p.code}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{p.items?.length || 0} itens</span>
                          <Clock className="h-3 w-3" />
                          <span>{new Date(p.createdAt).toLocaleString("pt-BR")}</span>
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">Aguardando</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {selectedPallet && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Pallet: {selectedPallet.code}</CardTitle>
                <Badge variant="outline">Sem Endereço</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-muted-foreground uppercase">Itens ({editableItems.length})</p>
                  {itemsChanged && (
                    <Button size="sm" variant="outline" onClick={() => saveItemsMutation.mutate()} disabled={saveItemsMutation.isPending} data-testid="button-save-items">
                      {saveItemsMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                      Salvar alterações
                    </Button>
                  )}
                </div>
                {editableItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 p-2.5 rounded-lg border text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.product?.name || "Produto"}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {item.product?.erpCode || ""}
                        {item.lot && ` · L: ${item.lot}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateItemQty(idx, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="font-mono font-bold text-sm w-10 text-center">{item.quantity}</span>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateItemQty(idx, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="text-xs text-muted-foreground w-5">{item.product?.unit || "UN"}</span>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => removeItemFromPallet(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {editableItems.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-3">Nenhum item no pallet</p>
                )}
              </div>

              <AddressPicker
                availableAddresses={availableAddresses}
                onAddressSelect={setSelectedAddress}
                onClear={() => setSelectedAddress("")}
              />

              {selectedAddress && selectedAddressObj && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
                  <MapPin className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Alocar em:</span>
                  <span className="font-mono font-bold text-green-700 dark:text-green-400">{selectedAddressObj.code}</span>
                </div>
              )}

              <Button className="w-full" onClick={() => setShowAllocateConfirm(true)}
                disabled={!selectedAddress || allocateMutation.isPending || itemsChanged} data-testid="button-allocate">
                {allocateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                {itemsChanged ? "Salve as alterações primeiro" : "Alocar Pallet"}
              </Button>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setSelectedPallet(null); setEditableItems([]); }} data-testid="button-back-checkin">
                  Voltar
                </Button>
                <Button variant="destructive" onClick={() => setShowCancelConfirm(selectedPallet.id)} disabled={cancelMutation.isPending} data-testid="button-cancel-pallet">
                  <Ban className="h-4 w-4 mr-2" /> Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={showAllocateConfirm} onOpenChange={setShowAllocateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Alocação</DialogTitle>
            <DialogDescription>
              Alocar <span className="font-mono font-semibold">{selectedPallet?.code}</span>
              {selectedAddressObj && <> em <span className="font-mono font-semibold">{selectedAddressObj.code}</span></>}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAllocateConfirm(false)}>Cancelar</Button>
            <Button onClick={() => allocateMutation.mutate()} disabled={allocateMutation.isPending} data-testid="button-confirm-allocate">
              {allocateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showCancelConfirm} onOpenChange={open => !open && setShowCancelConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Pallet</DialogTitle>
            <DialogDescription>Tem certeza que deseja cancelar este pallet?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelConfirm(null)}>Voltar</Button>
            <Button variant="destructive" onClick={() => showCancelConfirm && cancelMutation.mutate(showCancelConfirm)} disabled={cancelMutation.isPending} data-testid="button-confirm-cancel-pallet">
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
