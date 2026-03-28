import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRightLeft, MapPin, Loader2, Ban, Package, X, ArrowRight, Minus, Plus } from "lucide-react";
import { useLocation } from "wouter";
import { AddressPicker } from "@/components/wms/address-picker";
import { ProductStockInfo } from "@/components/wms/product-stock-info";
import { useProductStockBatch } from "@/hooks/use-product-stock";

export default function TransferenciaPage() {
  const [, navigate] = useLocation();
  const { user, companyId, companiesData } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [sourceAddressId, setSourceAddressId] = useState("");
  const [selectedPallet, setSelectedPallet] = useState<any>(null);
  const [palletDetail, setPalletDetail] = useState<any>(null);
  const [toAddressId, setToAddressId] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [transferMode, setTransferMode] = useState<"full" | "partial">("full");
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());

  const { data: allPallets = [] } = useQuery({
    queryKey: ["pallets-all", companyId],
    queryFn: async () => {
      const res = await fetch("/api/pallets", { credentials: "include" });
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

  const { data: allAddresses = [] } = useQuery({
    queryKey: ["all-addresses", companyId],
    queryFn: async () => {
      const res = await fetch("/api/wms-addresses", { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: !!companyId,
  });

  const palletsAtSource = sourceAddressId
    ? allPallets.filter((p: any) => p.addressId === sourceAddressId && p.status === "alocado")
    : [];

  const loadPalletDetail = async (pallet: any) => {
    setSelectedPallet(pallet);
    setShowCancel(false);
    setCancelReason("");
    setToAddressId("");
    setTransferMode("full");
    setSelectedItems(new Map());
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/pallets/${pallet.id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPalletDetail(data);
        const initMap = new Map<string, number>();
        data.items?.forEach((item: any) => {
          initMap.set(item.productId, item.quantity);
        });
        setSelectedItems(initMap);
      } else {
        setPalletDetail(null);
      }
    } catch {
      setPalletDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const detailProductIds = (palletDetail?.items || []).map((i: any) => i.productId || i.product?.id).filter(Boolean);
  const { data: stockInfoMap = {} } = useProductStockBatch(detailProductIds);

  const updateSelectedQty = (productId: string, delta: number, maxQty: number) => {
    setSelectedItems(prev => {
      const next = new Map(prev);
      const current = next.get(productId) || 0;
      const newQty = Math.max(0, Math.min(maxQty, current + delta));
      if (newQty === 0) next.delete(productId);
      else next.set(productId, newQty);
      return next;
    });
  };

  const setSelectedQty = (productId: string, qty: number, maxQty: number) => {
    setSelectedItems(prev => {
      const next = new Map(prev);
      const clamped = Math.max(0, Math.min(maxQty, qty));
      if (clamped === 0) next.delete(productId);
      else next.set(productId, clamped);
      return next;
    });
  };

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (transferMode === "full") {
        const res = await fetch(`/api/pallets/${selectedPallet.id}/transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toAddressId }),
          credentials: "include",
        });
        if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Erro"); }
        return res.json();
      } else {
        const items = Array.from(selectedItems.entries())
          .filter(([, qty]) => qty > 0)
          .map(([productId, quantity]) => ({ productId, quantity }));
        if (items.length === 0) throw new Error("Selecione ao menos um item");
        const res = await fetch(`/api/pallets/${selectedPallet.id}/partial-transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, toAddressId }),
          credentials: "include",
        });
        if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Erro"); }
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pallets"] });
      queryClient.invalidateQueries({ queryKey: ["available-addresses"] });
      queryClient.invalidateQueries({ queryKey: ["pallets-all"] });
      queryClient.invalidateQueries({ queryKey: ["all-addresses"] });
      toast({ title: "Transferencia realizada!" });
      setSelectedPallet(null);
      setPalletDetail(null);
      setToAddressId("");
      setSourceAddressId("");
      setShowTransferConfirm(false);
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setShowTransferConfirm(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pallets/${selectedPallet.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Erro ao cancelar" }));
        throw new Error(data.error || "Erro ao cancelar pallet");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pallets"] });
      queryClient.invalidateQueries({ queryKey: ["pallets-all"] });
      toast({ title: "Pallet cancelado" });
      setSelectedPallet(null);
      setPalletDetail(null);
      setShowCancel(false);
      setCancelReason("");
      setSourceAddressId("");
    },
    onError: (e: Error) => toast({ title: "Erro ao cancelar", description: e.message, variant: "destructive" }),
  });

  const isSupervisor = user?.role === "supervisor" || user?.role === "administrador";
  const statusLabels: Record<string, string> = {
    sem_endereco: "Sem Endereco", alocado: "Alocado",
    em_transferencia: "Em Transferencia", cancelado: "Cancelado",
  };
  const statusStyles: Record<string, string> = {
    sem_endereco: "border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:bg-amber-950/30",
    alocado: "border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:bg-emerald-950/30",
    em_transferencia: "border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:bg-blue-950/30",
    cancelado: "border-red-200 text-red-700 bg-red-50 dark:border-red-800 dark:text-red-400 dark:bg-red-950/30",
  };

  const destinationAddress = toAddressId ? availableAddresses.find((a: any) => a.id === toAddressId) : null;
  const sourceAddress = sourceAddressId ? allAddresses.find((a: any) => a.id === sourceAddressId) : null;
  const totalSelected = Array.from(selectedItems.values()).reduce((acc, v) => acc + v, 0);
  const canTransfer = !!toAddressId && (transferMode === "full" || totalSelected > 0);

  return (
    <div className="min-h-[100dvh] bg-background">
      <GradientHeader title="Transferencia" subtitle={companyId ? (companiesData?.find(c => c.id === companyId)?.name || "") : ""} compact>
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-white/70 hover:text-white hover:bg-white/10 h-9" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-3 safe-bottom">
        {!selectedPallet && (
          <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3 animate-fade-in">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Endereço de Origem</p>
            <AddressPicker
              availableAddresses={allAddresses}
              onAddressSelect={setSourceAddressId}
              onClear={() => setSourceAddressId("")}
              value={sourceAddressId}
            />

            {sourceAddressId && sourceAddress && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-semibold">Origem:</span>
                <span className="font-mono font-bold text-primary">{sourceAddress.code}</span>
              </div>
            )}

            {sourceAddressId && palletsAtSource.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum pallet alocado neste endereço</p>
            )}

            {sourceAddressId && palletsAtSource.length > 0 && (
              <div className="rounded-xl border border-border/50 overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 border-b border-border/30">
                  <span className="text-xs font-semibold text-muted-foreground">{palletsAtSource.length} pallet(s) neste endereço</span>
                </div>
                <div className="divide-y divide-border/30 max-h-[40vh] overflow-y-auto">
                  {palletsAtSource.map((p: any) => (
                    <button
                      key={p.id}
                      className="w-full flex items-center gap-3 px-4 py-3 active:bg-muted/50 transition-colors text-left"
                      onClick={() => loadPalletDetail(p)}
                      data-testid={`pallet-row-${p.id}`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono font-semibold text-sm truncate">{p.code}</p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {p.items?.length || 0} itens
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${statusStyles[p.status] || ""}`}>
                        {statusLabels[p.status] || p.status}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedPallet && (
          <div className="space-y-3 animate-slide-up">
            <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="font-mono font-bold text-sm">{selectedPallet.code}</span>
                </div>
                <Badge variant="outline" className={`text-[10px] ${statusStyles[selectedPallet.status] || ""}`}>
                  {statusLabels[selectedPallet.status] || selectedPallet.status}
                </Badge>
              </div>

              {sourceAddress && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-b border-border/30">
                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs text-muted-foreground">Origem:</span>
                  <span className="font-mono font-bold text-xs text-primary">{sourceAddress.code}</span>
                </div>
              )}

              {detailLoading ? (
                <div className="text-center py-8"><Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" /></div>
              ) : palletDetail?.items && palletDetail.items.length > 0 && selectedPallet.status === "alocado" && (
                <>
                  <div className="flex mx-3 mt-3 rounded-xl border bg-muted/30 p-1 gap-1">
                    <button
                      onClick={() => { setTransferMode("full"); setSelectedItems(new Map(palletDetail.items.map((i: any) => [i.productId, i.quantity]))); }}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${transferMode === "full" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
                      data-testid="tab-full-transfer"
                    >
                      Tudo
                    </button>
                    <button
                      onClick={() => { setTransferMode("partial"); setSelectedItems(new Map()); }}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${transferMode === "partial" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
                      data-testid="tab-partial-transfer"
                    >
                      Parcial
                    </button>
                  </div>

                  <div className="divide-y divide-border/30 mt-1">
                    {palletDetail.items.map((item: any, idx: number) => {
                      const maxQty = Number(item.quantity);
                      const selectedQty = selectedItems.get(item.productId) || 0;
                      const pid = item.productId || item.product?.id;
                      const si = pid ? stockInfoMap[pid] : null;
                      return (
                        <div key={idx} className="px-4 py-2.5 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.product?.name || "Produto"}</p>
                              <p className="text-[10px] text-muted-foreground font-mono truncate">
                                {item.product?.erpCode || ""} · {maxQty} {item.product?.unit || "UN"}
                                {item.lot && ` · L:${item.lot}`}
                              </p>
                            </div>
                            {transferMode === "partial" ? (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={() => updateSelectedQty(item.productId, -1, maxQty)} data-testid={`button-qty-minus-${idx}`}>
                                  <Minus className="h-3.5 w-3.5" />
                                </Button>
                                <Input
                                  value={selectedQty}
                                  onChange={e => setSelectedQty(item.productId, parseInt(e.target.value.replace(/\D/g, "")) || 0, maxQty)}
                                  className="h-8 w-12 text-center font-mono font-bold text-sm p-0 rounded-lg"
                                  data-testid={`input-qty-${idx}`}
                                />
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={() => updateSelectedQty(item.productId, 1, maxQty)} data-testid={`button-qty-plus-${idx}`}>
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                                <span className="text-[10px] text-muted-foreground w-7 text-right">/{maxQty}</span>
                              </div>
                            ) : (
                              <span className="font-mono font-bold text-sm shrink-0">{maxQty}</span>
                            )}
                          </div>
                          {si && (
                            <ProductStockInfo totalStock={si.totalStock} palletizedStock={si.palletizedStock} pickingStock={si.pickingStock} unit={si.unit} compact />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {transferMode === "partial" && totalSelected > 0 && (
                    <div className="px-4 py-2 bg-primary/5 border-t border-border/30">
                      <p className="text-xs text-primary font-semibold text-right">{totalSelected} un selecionadas</p>
                    </div>
                  )}
                </>
              )}

              {palletDetail?.items && palletDetail.items.length > 0 && selectedPallet.status !== "alocado" && (
                <div className="divide-y divide-border/30">
                  {palletDetail.items.map((item: any, idx: number) => {
                    const pid = item.productId || item.product?.id;
                    const si = pid ? stockInfoMap[pid] : null;
                    return (
                      <div key={idx} className="px-4 py-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.product?.name || "Produto"}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{item.product?.erpCode || ""}</p>
                          </div>
                          <span className="font-mono font-bold text-sm shrink-0">{item.quantity} {item.product?.unit || "UN"}</span>
                        </div>
                        {si && (
                          <ProductStockInfo totalStock={si.totalStock} palletizedStock={si.palletizedStock} pickingStock={si.pickingStock} unit={si.unit} compact />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedPallet.status === "alocado" && (
              <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Destino</p>
                <AddressPicker
                  availableAddresses={availableAddresses}
                  onAddressSelect={setToAddressId}
                  onClear={() => setToAddressId("")}
                />

                {toAddressId && destinationAddress && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40">
                    <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="text-sm text-blue-700 dark:text-blue-300">Transferir para</span>
                    <span className="font-mono font-bold text-blue-700 dark:text-blue-300">{destinationAddress.code}</span>
                  </div>
                )}

                <Button
                  className="w-full h-14 text-sm font-semibold rounded-xl shadow-lg shadow-primary/15 active:scale-[0.98] transition-all"
                  onClick={() => setShowTransferConfirm(true)}
                  disabled={!canTransfer || transferMutation.isPending}
                  data-testid="button-transfer"
                >
                  {transferMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                  {transferMode === "partial" ? `Transferir ${totalSelected} un` : "Transferir Pallet"}
                </Button>
              </div>
            )}

            {selectedPallet.status === "sem_endereco" && (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-sm text-amber-700 dark:text-amber-400">
                Este pallet nao foi alocado. Use o Check-in primeiro.
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={() => { setSelectedPallet(null); setPalletDetail(null); }} data-testid="button-back-list">
                Voltar
              </Button>
              {isSupervisor && selectedPallet.status !== "cancelado" && (
                <Button
                  variant="destructive"
                  className="h-12 rounded-xl px-4"
                  onClick={() => { setShowCancel(!showCancel); setCancelReason(""); }}
                  data-testid="button-show-cancel"
                >
                  <Ban className="h-4 w-4 mr-1.5" />
                  <span className="text-xs">Cancelar</span>
                </Button>
              )}
            </div>

            {showCancel && (
              <div className="space-y-2 p-4 rounded-2xl border border-destructive/20 bg-destructive/5">
                <p className="text-sm font-semibold text-destructive">Cancelar Pallet</p>
                <Input
                  placeholder="Motivo (min. 3 caracteres)"
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  className="h-11 rounded-xl"
                  data-testid="input-cancel-reason"
                />
                <Button
                  variant="destructive"
                  className="w-full h-11 rounded-xl"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending || cancelReason.trim().length < 3}
                  data-testid="button-confirm-cancel"
                >
                  {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
                  Confirmar Cancelamento
                </Button>
              </div>
            )}
          </div>
        )}
      </main>

      <Dialog open={showTransferConfirm} onOpenChange={setShowTransferConfirm}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar Transferencia</DialogTitle>
            <DialogDescription>
              {transferMode === "full"
                ? <>Transferir pallet <span className="font-mono font-semibold">{selectedPallet?.code}</span></>
                : <>Transferir <span className="font-semibold">{totalSelected} un</span> do pallet <span className="font-mono font-semibold">{selectedPallet?.code}</span></>
              }
              {sourceAddress && <> de <span className="font-mono font-semibold">{sourceAddress.code}</span></>}
              {destinationAddress && <> para <span className="font-mono font-semibold">{destinationAddress.code}</span></>}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowTransferConfirm(false)} className="rounded-xl" data-testid="button-cancel-transfer">Cancelar</Button>
            <Button onClick={() => transferMutation.mutate()} disabled={transferMutation.isPending} className="rounded-xl" data-testid="button-confirm-transfer">
              {transferMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
