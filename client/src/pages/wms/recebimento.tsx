import { useState, useRef, useEffect, useCallback } from "react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Search, Plus, Package, Loader2, Trash2, Printer, QrCode,
  ScanBarcode, CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  FileText, ArrowRight, Hash, Calendar, Tag, Box, Minus,
} from "lucide-react";
import { useLocation } from "wouter";

interface PalletItemDraft {
  productId: string;
  productName: string;
  erpCode: string;
  barcode: string;
  erpNfId?: string;
  quantity: number;
  lot?: string;
  expiryDate?: string;
  unit: string;
}

type ActiveTab = "scan" | "nf";

export default function RecebimentoPage() {
  const [, navigate] = useLocation();
  const { user, companyId, companiesData } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ActiveTab>("scan");
  const [palletItems, setPalletItems] = useState<PalletItemDraft[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lotInput, setLotInput] = useState("");
  const [expiryInput, setExpiryInput] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [lastScanned, setLastScanned] = useState<{ product: any; qty: number; isBox: boolean } | null>(null);
  const [scanError, setScanError] = useState("");
  const [showItemList, setShowItemList] = useState(true);

  const [nfSearch, setNfSearch] = useState("");
  const [nfNumber, setNfNumber] = useState("");
  const [nfData, setNfData] = useState<any>(null);
  const [nfLoading, setNfLoading] = useState(false);
  const [selectedNfItems, setSelectedNfItems] = useState<Set<number>>(new Set());
  const [nfList, setNfList] = useState<any[]>([]);
  const [nfListLoading, setNfListLoading] = useState(false);

  const [labelDialog, setLabelDialog] = useState<any>(null);
  const [labelLoading, setLabelLoading] = useState(false);

  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === "scan") {
      setTimeout(() => scanInputRef.current?.focus(), 100);
    }
  }, [activeTab]);

  useEffect(() => {
    if (lastScanned) {
      const timer = setTimeout(() => setLastScanned(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [lastScanned]);

  useEffect(() => {
    if (scanError) {
      const timer = setTimeout(() => setScanError(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [scanError]);

  const { data: pallets = [], isLoading: palletsLoading } = useQuery({
    queryKey: ["pallets", companyId, "sem_endereco"],
    queryFn: async () => {
      const res = await fetch("/api/pallets?status=sem_endereco", { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: !!companyId,
  });

  const addItemToPallet = useCallback((product: any, qty: number, isBox: boolean) => {
    const existing = palletItems.find(i => i.productId === product.id);
    if (existing) {
      setPalletItems(prev => prev.map(i =>
        i.productId === product.id ? { ...i, quantity: i.quantity + qty } : i
      ));
    } else {
      setPalletItems(prev => [...prev, {
        productId: product.id,
        productName: product.name,
        erpCode: product.erpCode,
        barcode: product.barcode || "",
        erpNfId: nfData?.nfNumber || undefined,
        quantity: qty,
        lot: lotInput || undefined,
        expiryDate: expiryInput || undefined,
        unit: product.unit || "UN",
      }]);
    }
    setLastScanned({ product, qty, isBox });
    setScanError("");
  }, [palletItems, lotInput, expiryInput, nfData]);

  const handleScan = async () => {
    const code = barcodeInput.trim();
    if (!code) return;
    setScanLoading(true);
    setScanError("");
    try {
      const res = await fetch(`/api/products/by-barcode/${encodeURIComponent(code)}`, { credentials: "include" });
      if (res.ok) {
        const product = await res.json();
        const qty = product.boxQty || 1;
        const isBox = !!product.boxQty;
        addItemToPallet(product, qty, isBox);
        setBarcodeInput("");
        setTimeout(() => scanInputRef.current?.focus(), 50);
      } else {
        setScanError("Produto não encontrado para este código");
      }
    } catch {
      setScanError("Erro de conexão ao buscar produto");
    } finally {
      setScanLoading(false);
    }
  };

  const updateItemQty = (idx: number, delta: number) => {
    setPalletItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newQty = Math.max(1, item.quantity + delta);
      return { ...item, quantity: newQty };
    }));
  };

  const removeItem = (idx: number) => {
    setPalletItems(prev => prev.filter((_, i) => i !== idx));
  };

  const searchNfList = async () => {
    setNfListLoading(true);
    try {
      const q = nfSearch.trim();
      const res = await fetch(`/api/nf/list${q ? `?q=${encodeURIComponent(q)}` : ""}`, { credentials: "include" });
      if (res.ok) {
        setNfList(await res.json());
      }
    } catch {
      toast({ title: "Erro", description: "Falha ao listar NFs", variant: "destructive" });
    } finally {
      setNfListLoading(false);
    }
  };

  const loadNfDetail = async (nfNumber: string) => {
    setNfLoading(true);
    try {
      const res = await fetch(`/api/nf/${nfNumber}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNfData(data);
        setNfNumber(nfNumber);
        setSelectedNfItems(new Set());
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

  useEffect(() => {
    if (activeTab === "nf" && nfList.length === 0) {
      searchNfList();
    }
  }, [activeTab]);

  const toggleNfItem = (idx: number) => {
    setSelectedNfItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const mergeNfItemsIntoPallet = (itemsToAdd: any[]) => {
    setPalletItems(prev => {
      const merged = [...prev];
      itemsToAdd.forEach(nfItem => {
        const pid = nfItem.productId || nfItem.id;
        const existingIdx = merged.findIndex(i => i.productId === pid);
        if (existingIdx >= 0) {
          merged[existingIdx] = { ...merged[existingIdx], quantity: merged[existingIdx].quantity + (nfItem.quantity || 1) };
        } else {
          merged.push({
            productId: pid,
            productName: nfItem.productName || nfItem.name || "Produto",
            erpCode: nfItem.erpCode || "",
            barcode: nfItem.barcode || "",
            erpNfId: nfData.nfNumber,
            quantity: nfItem.quantity || 1,
            lot: nfItem.lot || undefined,
            expiryDate: nfItem.expiryDate || undefined,
            unit: nfItem.unit || "UN",
          });
        }
      });
      return merged;
    });
  };

  const addSelectedNfItems = () => {
    if (!nfData?.items || selectedNfItems.size === 0) return;
    const items = Array.from(selectedNfItems).map(idx => nfData.items[idx]).filter(Boolean);
    mergeNfItemsIntoPallet(items);
    setSelectedNfItems(new Set());
    toast({ title: `${items.length} item(ns) adicionado(s) da NF` });
  };

  const addAllNfItems = () => {
    if (!nfData?.items || nfData.items.length === 0) return;
    mergeNfItemsIntoPallet(nfData.items);
    toast({ title: `${nfData.items.length} itens adicionados da NF` });
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
      setLastScanned(null);
      toast({ title: "Pallet criado!", description: `Código: ${data.code}` });
      fetchLabel(data.id);
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const fetchLabel = async (palletId: string) => {
    setLabelLoading(true);
    try {
      const res = await fetch(`/api/pallets/${palletId}/print-label`, { credentials: "include" });
      if (res.ok) {
        setLabelDialog(await res.json());
      }
    } catch {
      toast({ title: "Erro ao carregar etiqueta", variant: "destructive" });
    } finally {
      setLabelLoading(false);
    }
  };

  const esc = (str: string) => {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  };

  const printLabel = () => {
    if (!labelDialog) return;
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`
      <html><head><title>Etiqueta Pallet ${esc(labelDialog.palletCode)}</title>
      <style>
        body { font-family: monospace; padding: 10mm; margin: 0; font-size: 12px; }
        .code { font-size: 28px; font-weight: bold; text-align: center; border: 2px solid #000; padding: 8px; margin-bottom: 8px; }
        .addr { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 8px; }
        .meta { font-size: 10px; color: #555; margin-bottom: 8px; }
        .items { border-top: 1px solid #000; padding-top: 6px; }
        .item { border-bottom: 1px dashed #ccc; padding: 4px 0; }
        .item-name { font-weight: bold; }
        .nf { font-size: 10px; margin-top: 6px; }
        @media print { body { padding: 5mm; } }
      </style></head><body>
        <div class="code">${esc(labelDialog.palletCode)}</div>
        <div class="addr">${esc(labelDialog.address)}</div>
        <div class="meta">Criado: ${esc(new Date(labelDialog.createdAt).toLocaleString("pt-BR"))} | Por: ${esc(labelDialog.createdBy || "—")}</div>
        <div class="items">
          ${labelDialog.items.map((i: any) => `
            <div class="item">
              <div class="item-name">${esc(i.product)}</div>
              <div>${esc(i.erpCode)} | ${esc(String(i.quantity))} ${esc(i.unit)}${i.lot ? ` | Lote: ${esc(i.lot)}` : ""}${i.expiryDate ? ` | Val: ${esc(i.expiryDate)}` : ""}</div>
            </div>
          `).join("")}
        </div>
        ${labelDialog.nfIds?.length ? `<div class="nf">NF: ${esc(labelDialog.nfIds.join(", "))}</div>` : ""}
      </body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const totalItems = palletItems.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Recebimento" subtitle={companyId ? (companiesData?.find(c => c.id === companyId)?.name || "") : ""}>
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="bg-white/10 border-white/20 text-white hover:bg-white/20" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex rounded-lg border bg-muted/30 p-1 gap-1">
          <button
            onClick={() => setActiveTab("scan")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${activeTab === "scan" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="tab-scan"
          >
            <ScanBarcode className="h-4 w-4" />
            Leitura de Código
          </button>
          <button
            onClick={() => setActiveTab("nf")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${activeTab === "nf" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="tab-nf"
          >
            <FileText className="h-4 w-4" />
            Importar da NF
          </button>
        </div>

        {activeTab === "scan" && (
          <Card className="border-2 border-primary/20">
            <CardContent className="pt-6 space-y-4">
              <div className="relative">
                <ScanBarcode className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input
                  ref={scanInputRef}
                  placeholder="Bipe o código de barras ou digite o código ERP..."
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleScan()}
                  className="pl-10 h-12 text-lg font-mono"
                  autoFocus
                  disabled={scanLoading}
                  data-testid="input-barcode-scan"
                />
                {scanLoading && (
                  <Loader2 className="absolute right-3 top-3.5 h-5 w-5 animate-spin text-primary" />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    <Tag className="h-3 w-3 inline mr-1" />Lote (opcional)
                  </label>
                  <Input placeholder="Lote" value={lotInput} onChange={e => setLotInput(e.target.value)}
                    className="h-9" data-testid="input-lot" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    <Calendar className="h-3 w-3 inline mr-1" />Validade (opcional)
                  </label>
                  <Input type="date" value={expiryInput} onChange={e => setExpiryInput(e.target.value)}
                    className="h-9" data-testid="input-expiry" />
                </div>
              </div>

              {lastScanned && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 animate-in fade-in slide-in-from-top-2 duration-300" data-testid="scan-success-feedback">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-green-800 dark:text-green-200 truncate">{lastScanned.product.name}</p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {lastScanned.product.erpCode}
                      {lastScanned.isBox && <span className="ml-2 font-semibold">📦 Caixa: +{lastScanned.qty} un</span>}
                      {!lastScanned.isBox && <span className="ml-2">+{lastScanned.qty} {lastScanned.product.unit || "UN"}</span>}
                    </p>
                  </div>
                </div>
              )}

              {scanError && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 animate-in fade-in slide-in-from-top-2 duration-300" data-testid="scan-error-feedback">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">{scanError}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "nf" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Notas Fiscais de Recebimento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por número da NF ou fornecedor..."
                      value={nfSearch}
                      onChange={e => setNfSearch(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && searchNfList()}
                      className="pl-9"
                      data-testid="input-nf-search"
                    />
                  </div>
                  <Button onClick={searchNfList} disabled={nfListLoading} data-testid="button-search-nf-list">
                    {nfListLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                  </Button>
                </div>

                {nfListLoading ? (
                  <div className="text-center py-6"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>
                ) : nfList.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhuma NF encontrada. As notas são sincronizadas do ERP automaticamente.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {nfList.map((nf: any) => (
                      <div
                        key={nf.id}
                        onClick={() => loadNfDetail(nf.nfNumber)}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${nfData?.nfNumber === nf.nfNumber ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
                        data-testid={`nf-list-${nf.id}`}
                      >
                        <div>
                          <span className="font-mono font-semibold text-sm">NF {nf.nfNumber}</span>
                          {nf.nfSeries && <span className="text-xs text-muted-foreground ml-1">Série {nf.nfSeries}</span>}
                          {nf.supplierName && (
                            <p className="text-xs text-muted-foreground mt-0.5">Fornecedor: {nf.supplierName}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={nf.status === "pendente" ? "secondary" : nf.status === "recebida" ? "default" : "outline"}>
                            {nf.status}
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {nfLoading && (
              <div className="text-center py-6"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>
            )}

            {nfData && !nfLoading && (
              <Card className="border-2 border-blue-200 dark:border-blue-900">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      <span className="font-mono">NF {nfData.nfNumber}</span>
                      {nfData.supplierName && (
                        <span className="text-sm text-muted-foreground font-normal ml-2">— {nfData.supplierName}</span>
                      )}
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => { setNfData(null); setSelectedNfItems(new Set()); }}>
                      Fechar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {nfData.items?.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          {selectedNfItems.size > 0 ? `${selectedNfItems.size} selecionado(s)` : `${nfData.items.length} itens — selecione para adicionar ao pallet`}
                        </p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={addAllNfItems} data-testid="button-add-all-nf">
                            Adicionar Todos
                          </Button>
                          {selectedNfItems.size > 0 && (
                            <Button size="sm" onClick={addSelectedNfItems} data-testid="button-add-selected-nf">
                              <Plus className="h-4 w-4 mr-1" />
                              Adicionar {selectedNfItems.size}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 max-h-80 overflow-y-auto">
                        {nfData.items.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            onClick={() => toggleNfItem(idx)}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedNfItems.has(idx) ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
                            data-testid={`nf-item-${idx}`}
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selectedNfItems.has(idx) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                              {selectedNfItems.has(idx) && <CheckCircle className="h-3 w-3" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.productName || item.name || "Produto"}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.erpCode && <span className="font-mono mr-3">{item.erpCode}</span>}
                                {item.quantity && <span>{item.quantity} {item.unit || "UN"}</span>}
                                {item.lot && <span className="ml-2">Lote: {item.lot}</span>}
                              </p>
                            </div>
                            <Badge variant="outline" className="font-mono flex-shrink-0">
                              {item.quantity || 1} {item.unit || "UN"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      NF encontrada mas sem itens detalhados. Use a leitura de código para adicionar os produtos.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-5 w-5" />
                Itens do Pallet
                {palletItems.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{palletItems.length} produto{palletItems.length !== 1 ? "s" : ""} · {totalItems} un</Badge>
                )}
              </CardTitle>
              {palletItems.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setShowItemList(!showItemList)} data-testid="button-toggle-items">
                  {showItemList ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {palletItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Box className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum item adicionado</p>
                <p className="text-xs mt-1">Use a leitura de código ou importe da NF</p>
              </div>
            ) : (
              <>
                {showItemList && (
                  <div className="space-y-2 mb-4">
                    {palletItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border bg-card group" data-testid={`pallet-item-${idx}`}>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.productName}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                            <span className="font-mono">{item.erpCode}</span>
                            {item.erpNfId && <span>NF: {item.erpNfId}</span>}
                            {item.lot && <span>Lote: {item.lot}</span>}
                            {item.expiryDate && <span>Val: {item.expiryDate}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateItemQty(idx, -1)} data-testid={`button-dec-${idx}`}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="font-mono font-bold text-sm w-10 text-center">{item.quantity}</span>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateItemQty(idx, 1)} data-testid={`button-inc-${idx}`}>
                            <Plus className="h-3 w-3" />
                          </Button>
                          <span className="text-xs text-muted-foreground w-6">{item.unit}</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeItem(idx)} data-testid={`button-remove-${idx}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-bold ml-2">{palletItems.length} produto{palletItems.length !== 1 ? "s" : ""}</span>
                    <span className="mx-1 text-muted-foreground">·</span>
                    <span className="font-bold">{totalItems} unidades</span>
                  </div>
                  <Button
                    onClick={() => createPalletMutation.mutate()}
                    disabled={createPalletMutation.isPending || palletItems.length === 0}
                    className="gap-2"
                    data-testid="button-create-pallet"
                  >
                    {createPalletMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Package className="h-4 w-4" />
                    )}
                    Gerar Pallet
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Pallets Aguardando Endereço
              {pallets.length > 0 && <Badge variant="secondary">{pallets.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {palletsLoading ? (
              <div className="text-center py-6"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>
            ) : pallets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum pallet pendente</p>
            ) : (
              <div className="space-y-2">
                {pallets.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors" data-testid={`pallet-row-${p.id}`}>
                    <div className="flex items-center gap-3">
                      <QrCode className="h-5 w-5 text-primary" />
                      <div>
                        <span className="font-mono font-semibold">{p.code}</span>
                        <div className="text-xs text-muted-foreground">{p.items?.length || 0} itens · {new Date(p.createdAt).toLocaleString("pt-BR")}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Sem endereço</Badge>
                      <Button variant="outline" size="sm" onClick={() => fetchLabel(p.id)} disabled={labelLoading} data-testid={`button-print-${p.id}`}>
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!labelDialog} onOpenChange={(open) => !open && setLabelDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Etiqueta do Pallet
            </DialogTitle>
          </DialogHeader>
          {labelDialog && (
            <div className="space-y-3">
              <div className="text-center p-4 border-2 border-dashed rounded-lg bg-muted/30">
                <p className="font-mono text-2xl font-bold">{labelDialog.palletCode}</p>
                <p className="font-semibold text-lg mt-1">{labelDialog.address}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(labelDialog.createdAt).toLocaleString("pt-BR")}
                  {labelDialog.createdBy && ` · ${labelDialog.createdBy}`}
                </p>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto text-sm">
                {labelDialog.items?.map((i: any, idx: number) => (
                  <div key={idx} className="flex justify-between py-1 border-b border-dashed last:border-0">
                    <span className="truncate mr-2">{i.product}</span>
                    <span className="font-mono flex-shrink-0">{i.quantity} {i.unit}</span>
                  </div>
                ))}
              </div>
              {labelDialog.nfIds?.length > 0 && (
                <p className="text-xs text-muted-foreground">NF: {labelDialog.nfIds.join(", ")}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelDialog(null)}>Fechar</Button>
            <Button onClick={printLabel} data-testid="button-print-label">
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
