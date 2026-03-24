import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRightLeft, MapPin, Loader2, Ban, QrCode, Package } from "lucide-react";
import { useLocation } from "wouter";

export default function TransferenciaPage() {
  const [, navigate] = useLocation();
  const { user, companyId, companiesData } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scanInput, setScanInput] = useState("");
  const [selectedPallet, setSelectedPallet] = useState<any>(null);
  const [toAddressId, setToAddressId] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);

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

  const loadPallet = (code: string) => {
    const pallet = allPallets.find((p: any) => p.code === code || p.id === code);
    if (pallet) {
      setSelectedPallet(pallet);
      setScanInput("");
      setShowCancel(false);
    } else {
      toast({ title: "Pallet não encontrado", variant: "destructive" });
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
      toast({ title: "Transferência realizada!" });
      setSelectedPallet(null);
      setToAddressId("");
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
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
      setShowCancel(false);
      setCancelReason("");
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const isSupervisor = user?.role === "supervisor" || user?.role === "administrador";
  const statusColors: Record<string, string> = {
    sem_endereco: "bg-yellow-100 text-yellow-800",
    alocado: "bg-green-100 text-green-800",
    em_transferencia: "bg-blue-100 text-blue-800",
    cancelado: "bg-red-100 text-red-800",
  };

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Transferência" subtitle={companyId ? (companiesData?.find(c => c.id === companyId)?.name || "") : ""}>
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Buscar Pallet</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input placeholder="Código do pallet" value={scanInput} onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadPallet(scanInput)} autoFocus />
              <Button onClick={() => loadPallet(scanInput)}>
                <QrCode className="h-4 w-4 mr-2" /> Buscar
              </Button>
            </div>
          </CardContent>
        </Card>

        {!selectedPallet && (
          <Card>
            <CardHeader><CardTitle className="text-base">Pallets Ativos ({allPallets.filter((p: any) => p.status !== 'cancelado').length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {allPallets.filter((p: any) => p.status !== 'cancelado').map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50"
                    onClick={() => { setSelectedPallet(p); setShowCancel(false); }}>
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-mono font-semibold">{p.code}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.address?.code || "Sem endereço"} | {p.items?.length || 0} itens
                        </div>
                      </div>
                    </div>
                    <Badge className={statusColors[p.status] || ""}>{p.status}</Badge>
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
                <Badge className={statusColors[selectedPallet.status] || ""}>{selectedPallet.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedPallet.address && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4" />
                  <span>Endereço atual: <strong>{selectedPallet.address.code}</strong></span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Transferir para</label>
                <Select value={toAddressId} onValueChange={setToAddressId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o endereço destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAddresses.map((addr: any) => (
                      <SelectItem key={addr.id} value={addr.id}>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          {addr.code}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => transferMutation.mutate()}
                  disabled={!toAddressId || transferMutation.isPending}>
                  {transferMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                  Transferir
                </Button>
                {isSupervisor && (
                  <Button variant="destructive" onClick={() => setShowCancel(!showCancel)}>
                    <Ban className="h-4 w-4 mr-2" /> Cancelar
                  </Button>
                )}
              </div>

              {showCancel && (
                <div className="space-y-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                  <Input placeholder="Motivo do cancelamento" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
                  <Button variant="destructive" className="w-full" onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}>
                    {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Confirmar Cancelamento
                  </Button>
                </div>
              )}

              <Button variant="outline" className="w-full" onClick={() => setSelectedPallet(null)}>
                Voltar à lista
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
