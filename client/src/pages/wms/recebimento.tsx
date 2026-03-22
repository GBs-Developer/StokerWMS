import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, getCompanyLabel } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Search, Plus, Package, Loader2, Trash2, Printer, QrCode } from "lucide-react";
import { useLocation } from "wouter";

interface PalletItemDraft {
  productId: string;
  productName: string;
  erpCode: string;
  erpNfId?: string;
  quantity: number;
  lot?: string;
  expiryDate?: string;
  unit: string;
}

export default function RecebimentoPage() {
  const [, navigate] = useLocation();
  const { companyId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [nfNumber, setNfNumber] = useState("");
  const [nfData, setNfData] = useState<any>(null);
  const [nfLoading, setNfLoading] = useState(false);
  const [palletItems, setPalletItems] = useState<PalletItemDraft[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [qtyInput, setQtyInput] = useState("1");
  const [lotInput, setLotInput] = useState("");
  const [expiryInput, setExpiryInput] = useState("");

  const { data: pallets = [], isLoading: palletsLoading } = useQuery({
    queryKey: ["pallets", companyId],
    queryFn: async () => {
      const res = await fetch("/api/pallets?status=sem_endereco", { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: !!companyId,
  });

  const searchNf = async () => {
    if (!nfNumber.trim()) return;
    setNfLoading(true);
    try {
      const res = await fetch(`/api/nf/${nfNumber}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNfData(data);
      } else {
        const err = await res.json();
        toast({ title: "NF não encontrada", description: err.error, variant: "destructive" });
        setNfData(null);
      }
    } catch {
      toast({ title: "Erro", description: "Falha na busca", variant: "destructive" });
    } finally {
      setNfLoading(false);
    }
  };

  const addItemByBarcode = async () => {
    if (!barcodeInput.trim()) return;
    try {
      const res = await fetch(`/api/products/by-barcode/${barcodeInput}`, { credentials: "include" });
      if (res.ok) {
        const product = await res.json();
        const existing = palletItems.find(i => i.productId === product.id);
        if (existing) {
          setPalletItems(palletItems.map(i =>
            i.productId === product.id ? { ...i, quantity: i.quantity + Number(qtyInput) } : i
          ));
        } else {
          setPalletItems([...palletItems, {
            productId: product.id,
            productName: product.name,
            erpCode: product.erpCode,
            erpNfId: nfData?.nfNumber || undefined,
            quantity: Number(qtyInput),
            lot: lotInput || undefined,
            expiryDate: expiryInput || undefined,
            unit: product.unit || "UN",
          }]);
        }
        setBarcodeInput("");
        setQtyInput("1");
        toast({ title: "Item adicionado", description: product.name });
      } else {
        toast({ title: "Produto não encontrado", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro na busca", variant: "destructive" });
    }
  };

  const createPalletMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/pallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: palletItems.map(i => ({
            productId: i.productId,
            erpNfId: i.erpNfId,
            quantity: i.quantity,
            lot: i.lot,
            expiryDate: i.expiryDate,
          })),
          nfIds: nfData ? [nfData.nfNumber] : [],
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao criar pallet");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pallets"] });
      setPalletItems([]);
      setNfData(null);
      setNfNumber("");
      toast({ title: "Pallet criado!", description: `Código: ${data.code}` });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const removeItem = (idx: number) => {
    setPalletItems(palletItems.filter((_, i) => i !== idx));
  };

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Recebimento" subtitle={companyId ? getCompanyLabel(companyId) : ""}>
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Buscar NF</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input placeholder="Número da NF" value={nfNumber} onChange={e => setNfNumber(e.target.value)}
                onKeyDown={e => e.key === "Enter" && searchNf()} />
              <Button onClick={searchNf} disabled={nfLoading}>
                {nfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="h-4 w-4 mr-2" />Buscar</>}
              </Button>
            </div>
            {nfData && (
              <div className="mt-3 p-3 rounded-lg bg-muted/50">
                <div className="font-semibold">NF {nfData.nfNumber}</div>
                <div className="text-sm text-muted-foreground">
                  {nfData.supplierName} - {nfData.items?.length || 0} itens
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Adicionar Itens ao Pallet</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Código de barras / ERP" value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addItemByBarcode()} className="flex-1" autoFocus />
              <Input placeholder="Qtd" type="number" value={qtyInput} onChange={e => setQtyInput(e.target.value)} className="w-20" />
              <Button onClick={addItemByBarcode}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex gap-2">
              <Input placeholder="Lote (opcional)" value={lotInput} onChange={e => setLotInput(e.target.value)} className="flex-1" />
              <Input placeholder="Validade (opcional)" type="date" value={expiryInput} onChange={e => setExpiryInput(e.target.value)} className="flex-1" />
            </div>

            {palletItems.length > 0 && (
              <div className="space-y-2 mt-4">
                {palletItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded border bg-card">
                    <div>
                      <div className="font-medium text-sm">{item.productName}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.erpCode} | {item.quantity} {item.unit}
                        {item.lot && ` | Lote: ${item.lot}`}
                        {item.expiryDate && ` | Val: ${item.expiryDate}`}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2">
                  <span className="text-sm text-muted-foreground">{palletItems.length} itens</span>
                  <Button onClick={() => createPalletMutation.mutate()} disabled={createPalletMutation.isPending}>
                    {createPalletMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Package className="h-4 w-4 mr-2" />}
                    Gerar Pallet
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Pallets Aguardando Endereço</CardTitle></CardHeader>
          <CardContent>
            {palletsLoading ? (
              <div className="text-center py-4"><Loader2 className="h-6 w-6 mx-auto animate-spin" /></div>
            ) : pallets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum pallet pendente</p>
            ) : (
              <div className="space-y-2">
                {pallets.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <QrCode className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-mono font-semibold">{p.code}</div>
                        <div className="text-xs text-muted-foreground">{p.items?.length || 0} itens</div>
                      </div>
                    </div>
                    <Badge variant="secondary">Sem endereço</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
