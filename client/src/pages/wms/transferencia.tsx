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
import { ArrowLeft, ArrowRightLeft, MapPin, Loader2, Ban, QrCode, Package, Search, X, Clock, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { AddressPicker } from "@/components/wms/address-picker";

export default function TransferenciaPage() {
  const [, navigate] = useLocation();
  const { user, companyId, companiesData } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scanInput, setScanInput] = useState("");
  const [selectedPallet, setSelectedPallet] = useState<any>(null);
  const [palletDetail, setPalletDetail] = useState<any>(null);
  const [toAddressId, setToAddressId] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

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

  const loadPalletDetail = async (pallet: any) => {
    setSelectedPallet(pallet);
    setShowCancel(false);
    setToAddressId("");
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/pallets/${pallet.id}`, { credentials: "include" });
      if (res.ok) {
        setPalletDetail(await res.json());
      } else {
        setPalletDetail(null);
      }
    } catch {
      setPalletDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadPallet = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const pallet = allPallets.find((p: any) => p.code === trimmed || p.id === trimmed);
    if (pallet) {
      loadPalletDetail(pallet);
      setScanInput("");
    } else {
      toast({ title: "Pallet não encontrado", description: "Verifique o código e tente novamente", variant: "destructive" });
    }
  };

  const transferMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pallets/${selectedPallet.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toAddressId }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pallets"] });
      queryClient.invalidateQueries({ queryKey: ["available-addresses"] });
      queryClient.invalidateQueries({ queryKey: ["pallets-all"] });
      toast({ title: "Transferência realizada com sucesso!" });
      setSelectedPallet(null);
      setPalletDetail(null);
      setToAddressId("");
      setShowTransferConfirm(false);
    },
    onError: (e: Error) => {
      toast({ title: "Erro na transferência", description: e.message, variant: "destructive" });
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
        const data = await res.json();
        throw new Error(data.error || "Erro");
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
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const isSupervisor = user?.role === "supervisor" || user?.role === "administrador";
  const statusLabels: Record<string, string> = {
    sem_endereco: "Sem Endereço",
    alocado: "Alocado",
    em_transferencia: "Em Transferência",
    cancelado: "Cancelado",
  };
  const statusColors: Record<string, string> = {
    sem_endereco: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    alocado: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    em_transferencia: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    cancelado: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  const activePallets = allPallets.filter((p: any) => p.status !== "cancelado");
  const filteredPallets = filterText
    ? activePallets.filter((p: any) =>
        p.code?.toLowerCase().includes(filterText.toLowerCase()) ||
        p.address?.code?.toLowerCase().includes(filterText.toLowerCase())
      )
    : activePallets;

  const destinationAddress = toAddressId ? availableAddresses.find((a: any) => a.id === toAddressId) : null;

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Transferência" subtitle={companyId ? (companiesData?.find(c => c.id === companyId)?.name || "") : ""}>
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="bg-white/10 border-white/20 text-white hover:bg-white/20" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Buscar Pallet</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input placeholder="Escaneie ou digite o código do pallet" value={scanInput} onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadPallet(scanInput)} autoFocus data-testid="input-scan-pallet" />
              <Button onClick={() => loadPallet(scanInput)} disabled={!scanInput.trim()} data-testid="button-search-pallet">
                <QrCode className="h-4 w-4 mr-2" /> Buscar
              </Button>
            </div>
          </CardContent>
        </Card>

        {!selectedPallet && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Pallets Ativos ({activePallets.length})</CardTitle>
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Filtrar..." value={filterText} onChange={e => setFilterText(e.target.value)} className="pl-8 h-8 text-sm" data-testid="input-filter-pallets" />
                  {filterText && (
                    <Button variant="ghost" size="sm" className="absolute right-0.5 top-0.5 h-7 w-7 p-0" onClick={() => setFilterText("")}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredPallets.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhum pallet encontrado</p>
                ) : filteredPallets.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => loadPalletDetail(p)} data-testid={`pallet-row-${p.id}`}>
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-mono font-semibold">{p.code}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.address?.code || "Sem endereço"} · {p.items?.length || 0} itens
                        </div>
                      </div>
                    </div>
                    <Badge className={statusColors[p.status] || ""}>{statusLabels[p.status] || p.status}</Badge>
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
                <Badge className={statusColors[selectedPallet.status] || ""}>{statusLabels[selectedPallet.status] || selectedPallet.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedPallet.address && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm">Endereço atual:</span>
                  <span className="font-mono font-bold text-primary">{selectedPallet.address.code}</span>
                </div>
              )}

              {detailLoading ? (
                <div className="text-center py-4"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>
              ) : palletDetail?.items && palletDetail.items.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase">Itens do Pallet ({palletDetail.items.length})</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {palletDetail.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center p-2.5 rounded-lg border text-sm">
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="font-medium truncate">{item.product?.name || "Produto"}</p>
                          <p className="text-xs text-muted-foreground font-mono">{item.product?.erpCode || ""}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-mono font-bold">{item.quantity}</span>
                          <span className="text-xs text-muted-foreground">{item.product?.unit || "UN"}</span>
                          {item.lot && <Badge variant="outline" className="text-[9px]">L: {item.lot}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {palletDetail?.movements && palletDetail.movements.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Histórico de Movimentações
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {palletDetail.movements.slice(0, 5).map((m: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground p-1.5 rounded bg-muted/20">
                        <Badge variant="outline" className="text-[9px]">{m.movementType}</Badge>
                        <span>{new Date(m.createdAt).toLocaleString("pt-BR")}</span>
                        {m.notes && <span className="truncate">— {m.notes}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedPallet.status === "alocado" && (
                <>
                  <div className="space-y-3 pt-2">
                    <AddressPicker
                      availableAddresses={availableAddresses}
                      onAddressSelect={setToAddressId}
                      onClear={() => setToAddressId("")}
                    />
                  </div>

                  {toAddressId && destinationAddress && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                      <ArrowRight className="h-4 w-4 text-blue-600" />
                      <span className="text-sm">Transferir para:</span>
                      <span className="font-mono font-bold text-blue-700 dark:text-blue-400">{destinationAddress.code}</span>
                    </div>
                  )}

                  <Button className="w-full" onClick={() => setShowTransferConfirm(true)}
                    disabled={!toAddressId || transferMutation.isPending} data-testid="button-transfer">
                    {transferMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                    Transferir Pallet
                  </Button>
                </>
              )}

              {selectedPallet.status === "sem_endereco" && (
                <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 text-sm text-yellow-800 dark:text-yellow-400">
                  Este pallet ainda não foi alocado. Use o módulo de Check-in para alocá-lo primeiro.
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setSelectedPallet(null); setPalletDetail(null); }} data-testid="button-back-list">
                  Voltar à lista
                </Button>
                {isSupervisor && selectedPallet.status !== "cancelado" && (
                  <Button variant="destructive" onClick={() => setShowCancel(!showCancel)} data-testid="button-show-cancel">
                    <Ban className="h-4 w-4 mr-2" /> Cancelar
                  </Button>
                )}
              </div>

              {showCancel && (
                <div className="space-y-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                  <p className="text-sm font-medium text-destructive">Cancelar Pallet</p>
                  <Input placeholder="Motivo do cancelamento (obrigatório)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} data-testid="input-cancel-reason" />
                  <Button variant="destructive" className="w-full" onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending || cancelReason.trim().length < 3} data-testid="button-confirm-cancel">
                    {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Confirmar Cancelamento
                  </Button>
                  {cancelReason.length > 0 && cancelReason.trim().length < 3 && (
                    <p className="text-xs text-destructive">Mínimo 3 caracteres</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={showTransferConfirm} onOpenChange={setShowTransferConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Transferência</DialogTitle>
            <DialogDescription>
              Confirma a transferência do pallet <span className="font-mono font-semibold">{selectedPallet?.code}</span>
              {selectedPallet?.address?.code && <> de <span className="font-mono font-semibold">{selectedPallet.address.code}</span></>}
              {destinationAddress && <> para <span className="font-mono font-semibold">{destinationAddress.code}</span></>}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferConfirm(false)} data-testid="button-cancel-transfer">
              Cancelar
            </Button>
            <Button onClick={() => transferMutation.mutate()} disabled={transferMutation.isPending} data-testid="button-confirm-transfer">
              {transferMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
