import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, getCompanyLabel } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, QrCode, MapPin, Loader2, Package, CheckCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function CheckinPage() {
  const [, navigate] = useLocation();
  const { companyId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scanInput, setScanInput] = useState("");
  const [selectedPallet, setSelectedPallet] = useState<any>(null);
  const [selectedAddress, setSelectedAddress] = useState("");

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
    const pallet = palletsWithoutAddress.find((p: any) => p.code === code || p.id === code);
    if (pallet) {
      const res = await fetch(`/api/pallets/${pallet.id}`, { credentials: "include" });
      if (res.ok) {
        setSelectedPallet(await res.json());
        setScanInput("");
      }
    } else {
      toast({ title: "Pallet não encontrado", variant: "destructive" });
    }
  };

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
      setSelectedAddress("");
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Check-in / Alocação" subtitle={companyId ? getCompanyLabel(companyId) : ""}>
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Escanear Pallet</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input placeholder="Escaneie ou digite o código do pallet" value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadPallet(scanInput)}
                autoFocus />
              <Button onClick={() => loadPallet(scanInput)}>
                <QrCode className="h-4 w-4 mr-2" /> Buscar
              </Button>
            </div>
          </CardContent>
        </Card>

        {!selectedPallet && palletsWithoutAddress.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Pallets Pendentes ({palletsWithoutAddress.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {palletsWithoutAddress.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50"
                    onClick={() => loadPallet(p.code)}>
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-mono font-semibold">{p.code}</div>
                        <div className="text-xs text-muted-foreground">{p.items?.length || 0} itens</div>
                      </div>
                    </div>
                    <Badge variant="outline">Sem endereço</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {selectedPallet && (
          <Card>
            <CardHeader><CardTitle className="text-base">Pallet: {selectedPallet.code}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {selectedPallet.items?.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between p-2 rounded border text-sm">
                    <span>{item.product?.name || "Produto"}</span>
                    <span className="font-mono">{item.quantity} {item.product?.unit || "UN"}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Endereço de destino</label>
                <Select value={selectedAddress} onValueChange={setSelectedAddress}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um endereço disponível" />
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

              <Button className="w-full" onClick={() => allocateMutation.mutate()}
                disabled={!selectedAddress || allocateMutation.isPending}>
                {allocateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Alocar Pallet
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
