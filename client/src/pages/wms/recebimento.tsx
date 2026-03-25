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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Search, Plus, Package, Loader2, Trash2, Printer, QrCode,
  ScanBarcode, CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  FileText, ArrowRight, Hash, Calendar, Tag, Box, Minus, Keyboard,
  Pencil, X,
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
  const [keyboardEnabled, setKeyboardEnabled] = useState(false);

  const [nfSearch, setNfSearch] = useState("");
  const [nfData, setNfData] = useState<any>(null);
  const [nfLoading, setNfLoading] = useState(false);
  const [selectedNfItems, setSelectedNfItems] = useState<Set<number>>(new Set());
  const [nfList, setNfList] = useState<any[]>([]);
  const [nfListLoading, setNfListLoading] = useState(false);
  const [nfImportProgress, setNfImportProgress] = useState<{ current: number; total: number } | null>(null);

  const [labelDialog, setLabelDialog] = useState<any>(null);
  const [labelLoading, setLabelLoading] = useState(false);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const [editingQtyIdx, setEditingQtyIdx] = useState<number | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState("");

  const [editPalletDialog, setEditPalletDialog] = useState<any>(null);
  const [editPalletItems, setEditPalletItems] = useState<any[]>([]);
  const [editPalletLoading, setEditPalletLoading] = useState(false);
  const [cancelPalletTarget, setCancelPalletTarget] = useState<any>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === "scan" && keyboardEnabled) {
      setTimeout(() => scanInputRef.current?.focus(), 100);
    }
  }, [activeTab, keyboardEnabled]);

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

  const { data: pallets = [], isLoading: palletsLoading, refetch: refetchPallets } = useQuery({
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
        if (keyboardEnabled) setTimeout(() => scanInputRef.current?.focus(), 50);
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
      return { ...item, quantity: Math.max(1, item.quantity + delta) };
    }));
  };

  const startEditQty = (idx: number) => {
    setEditingQtyIdx(idx);
    setEditingQtyValue(String(palletItems[idx].quantity));
  };

  const commitEditQty = () => {
    if (editingQtyIdx === null) return;
    const val = parseInt(editingQtyValue, 10);
    if (!isNaN(val) && val > 0) {
      setPalletItems(prev => prev.map((item, i) =>
        i === editingQtyIdx ? { ...item, quantity: val } : item
      ));
    }
    setEditingQtyIdx(null);
    setEditingQtyValue("");
  };

  const removeItem = (idx: number) => {
    setPalletItems(prev => prev.filter((_, i) => i !== idx));
  };

  const searchNfList = async () => {
    setNfListLoading(true);
    try {
      const q = nfSearch.trim();
      const res = await fetch(`/api/nf/list${q ? `?q=${encodeURIComponent(q)}` : ""}`, { credentials: "include" });
      if (res.ok) setNfList(await res.json());
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
    if (activeTab === "nf" && nfList.length === 0) searchNfList();
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
    setNfImportProgress({ current: 0, total: itemsToAdd.length });
    setPalletItems(prev => {
      const merged = [...prev];
      itemsToAdd.forEach((nfItem, i) => {
        const pid = nfItem.productId || nfItem.id;
        const existingIdx = merged.findIndex(it => it.productId === pid);
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
        setNfImportProgress({ current: i + 1, total: itemsToAdd.length });
      });
      return merged;
    });
    setTimeout(() => setNfImportProgress(null), 1500);
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
      setLastScanned(null);
      setShowCreateConfirm(false);
      toast({ title: "Pallet criado!", description: `Código: ${data.code}` });
      fetchLabel(data.id);
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setShowCreateConfirm(false);
    },
  });

  const cancelPalletMutation = useMutation({
    mutationFn: async (palletId: string) => {
      const res = await fetch(`/api/pallets/${palletId}/cancel-unaddressed`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao cancelar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pallets"] });
      setCancelPalletTarget(null);
      toast({ title: "Pallet cancelado com sucesso" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setCancelPalletTarget(null);
    },
  });

  const openEditPallet = async (pallet: any) => {
    setEditPalletLoading(true);
    setEditPalletDialog(pallet);
    try {
      const res = await fetch(`/api/pallets/${pallet.id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setEditPalletItems(data.items?.map((item: any) => ({
          ...item,
          quantity: item.quantity,
        })) || []);
      }
    } catch {
      toast({ title: "Erro ao carregar pallet", variant: "destructive" });
    } finally {
      setEditPalletLoading(false);
    }
  };

  const savePalletEdit = async () => {
    if (!editPalletDialog) return;
    setEditPalletLoading(true);
    try {
      const res = await fetch(`/api/pallets/${editPalletDialog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: editPalletItems.map(i => ({
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
      queryClient.invalidateQueries({ queryKey: ["pallets"] });
      setEditPalletDialog(null);
      toast({ title: "Pallet atualizado com sucesso" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setEditPalletLoading(false);
    }
  };

  const fetchLabel = async (palletId: string) => {
    setLabelLoading(true);
    try {
      const res = await fetch(`/api/pallets/${palletId}/print-label`, { credentials: "include" });
      if (res.ok) setLabelDialog(await res.json());
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
        ${labelDialog.nfIds?.length ? `<div style="font-size:10px;margin-top:6px">NF: ${esc(labelDialog.nfIds.join(", "))}</div>` : ""}
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

      <main className="max-w-4xl mx-auto px-3 py-4 space-y-4">
        <div className="flex rounded-lg border bg-muted/30 p-1 gap-1">
          <button
            onClick={() => setActiveTab("scan")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-md text-sm font-medium transition-all min-h-[48px] ${activeTab === "scan" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="tab-scan"
          >
            <ScanBarcode className="h-4 w-4 shrink-0" />
            <span className="truncate">Leitura de Código</span>
          </button>
          <button
            onClick={() => setActiveTab("nf")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-md text-sm font-medium transition-all min-h-[48px] ${activeTab === "nf" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="tab-nf"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">Importar da NF</span>
          </button>
        </div>

        {activeTab === "scan" && (
          <Card className="border-2 border-primary/20">
            <CardContent className="pt-4 space-y-3">
              <div className="relative">
                <ScanBarcode className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input
                  ref={scanInputRef}
                  placeholder="Bipe o código de barras ou ERP..."
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleScan()}
                  className="pl-10 pr-24 h-12 text-base font-mono"
                  inputMode={keyboardEnabled ? "text" : "none"}
                  disabled={scanLoading}
                  data-testid="input-barcode-scan"
                />
                <div className="absolute right-2 top-2 flex items-center gap-1">
                  {scanLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                  <Button
                    variant={keyboardEnabled ? "default" : "outline"}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      setKeyboardEnabled(v => !v);
                      setTimeout(() => scanInputRef.current?.focus(), 50);
                    }}
                    title={keyboardEnabled ? "Desativar teclado" : "Ativar teclado para digitar"}
                    data-testid="button-toggle-keyboard-scan"
                  >
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {!keyboardEnabled && (
                <p className="text-xs text-muted-foreground text-center">
                  Bipe o código ou toque em <Keyboard className="h-3 w-3 inline" /> para digitar
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    <Tag className="h-3 w-3 inline mr-1" />Lote (opcional)
                  </label>
                  <Input placeholder="Lote" value={lotInput} onChange={e => setLotInput(e.target.value)} className="h-10" data-testid="input-lot" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    <Calendar className="h-3 w-3 inline mr-1" />Validade (opcional)
                  </label>
                  <Input type="date" value={expiryInput} onChange={e => setExpiryInput(e.target.value)} className="h-10" data-testid="input-expiry" />
                </div>
              </div>

              {lastScanned && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 animate-in fade-in slide-in-from-top-2 duration-300" data-testid="scan-success-feedback">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-green-800 dark:text-green-200 truncate">{lastScanned.product.name}</p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {lastScanned.product.erpCode}
                      {lastScanned.isBox ? <span className="ml-2 font-semibold">Caixa: +{lastScanned.qty} un</span> : <span className="ml-2">+{lastScanned.qty} {lastScanned.product.unit || "UN"}</span>}
                    </p>
                  </div>
                </div>
              )}

              {scanError && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900" data-testid="scan-error-feedback">
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
                  <FileText className="h-5 w-5" /> Notas Fiscais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar NF ou fornecedor..."
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
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhuma NF encontrada.</p>
                ) : (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {nfList.map((nf: any) => (
                      <div
                        key={nf.id}
                        onClick={() => loadNfDetail(nf.nfNumber)}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${nfData?.nfNumber === nf.nfNumber ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
                        data-testid={`nf-list-${nf.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-mono font-semibold text-sm">NF {nf.nfNumber}</span>
                          {nf.nfSeries && <span className="text-xs text-muted-foreground ml-1">Série {nf.nfSeries}</span>}
                          {nf.supplierName && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">Fornecedor: {nf.supplierName}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
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

            {nfLoading && <div className="text-center py-6"><Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" /></div>}

            {nfData && !nfLoading && (
              <Card className="border-2 border-blue-200 dark:border-blue-900">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base min-w-0">
                      <span className="font-mono">NF {nfData.nfNumber}</span>
                      {nfData.supplierName && (
                        <span className="text-sm text-muted-foreground font-normal ml-2 truncate">— {nfData.supplierName}</span>
                      )}
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="shrink-0 h-10" onClick={() => { setNfData(null); setSelectedNfItems(new Set()); }}>
                      Fechar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {nfImportProgress && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Importando...</span><span>{nfImportProgress.current}/{nfImportProgress.total}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${(nfImportProgress.current / nfImportProgress.total) * 100}%` }} />
                      </div>
                    </div>
                  )}

                  {nfData.items?.length > 0 ? (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <p className="text-sm text-muted-foreground">
                          {selectedNfItems.size > 0 ? `${selectedNfItems.size} selecionado(s)` : `${nfData.items.length} itens`}
                        </p>
                        <div className="flex gap-2 shrink-0">
                          <Button variant="outline" size="sm" className="h-10 flex-1 sm:flex-none" onClick={addAllNfItems} disabled={!!nfImportProgress} data-testid="button-add-all-nf">
                            Adicionar Todos
                          </Button>
                          {selectedNfItems.size > 0 && (
                            <Button size="sm" className="h-10 flex-1 sm:flex-none" onClick={addSelectedNfItems} disabled={!!nfImportProgress} data-testid="button-add-selected-nf">
                              <Plus className="h-4 w-4 mr-1" />
                              Adicionar {selectedNfItems.size}
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1 max-h-72 overflow-y-auto">
                        {nfData.items.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            onClick={() => toggleNfItem(idx)}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedNfItems.has(idx) ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
                            data-testid={`nf-item-${idx}`}
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${selectedNfItems.has(idx) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                              {selectedNfItems.has(idx) && <CheckCircle className="h-3 w-3" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.productName || item.name || "Produto"}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.erpCode && <span className="font-mono mr-2">{item.erpCode}</span>}
                                {item.lot && <span>Lote: {item.lot}</span>}
                              </p>
                            </div>
                            <Badge variant="outline" className="font-mono flex-shrink-0">{item.quantity || 1} {item.unit || "UN"}</Badge>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">NF sem itens detalhados. Use leitura de código.</p>
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
                <Package className="h-5 w-5" />Itens do Pallet
                {palletItems.length > 0 && (
                  <Badge variant="secondary">{palletItems.length} prod · {totalItems} un</Badge>
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
              </div>
            ) : (
              <>
                {showItemList && (
                  <div className="space-y-2 mb-4">
                    {palletItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-3 rounded-lg border bg-card" data-testid={`pallet-item-${idx}`}>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.productName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{item.erpCode}{item.lot && ` · L:${item.lot}`}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateItemQty(idx, -1)} data-testid={`button-dec-${idx}`}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          {editingQtyIdx === idx ? (
                            <Input
                              value={editingQtyValue}
                              onChange={e => setEditingQtyValue(e.target.value.replace(/\D/g, ""))}
                              onBlur={commitEditQty}
                              onKeyDown={e => e.key === "Enter" && commitEditQty()}
                              className="h-7 w-14 text-center font-mono font-bold text-sm p-0"
                              autoFocus
                              data-testid={`input-qty-${idx}`}
                            />
                          ) : (
                            <span
                              className="font-mono font-bold text-sm w-10 text-center cursor-pointer hover:bg-muted rounded px-1 py-0.5"
                              onClick={() => startEditQty(idx)}
                              data-testid={`qty-display-${idx}`}
                            >
                              {item.quantity}
                            </span>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateItemQty(idx, 1)} data-testid={`button-inc-${idx}`}>
                            <Plus className="h-3 w-3" />
                          </Button>
                          <span className="text-xs text-muted-foreground w-5">{item.unit}</span>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeItem(idx)} data-testid={`button-remove-${idx}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-bold ml-2">{palletItems.length} prod · {totalItems} un</span>
                  </div>
                  <Button
                    onClick={() => setShowCreateConfirm(true)}
                    disabled={createPalletMutation.isPending || palletItems.length === 0}
                    className="gap-2 h-12 shrink-0"
                    data-testid="button-create-pallet"
                  >
                    {createPalletMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
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
              <QrCode className="h-5 w-5" />Pallets Aguardando Endereço
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
                  <div key={p.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border hover:bg-muted/30 transition-colors" data-testid={`pallet-row-${p.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <QrCode className="h-5 w-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <span className="font-mono font-semibold truncate block">{p.code}</span>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.items?.length || 0} itens · {new Date(p.createdAt).toLocaleString("pt-BR")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="hidden sm:inline-flex">Sem endereço</Badge>
                      <Button variant="outline" size="sm" className="h-10 w-10 p-0" onClick={() => openEditPallet(p)} title="Editar pallet" data-testid={`button-edit-${p.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-10 w-10 p-0" onClick={() => fetchLabel(p.id)} disabled={labelLoading} title="Imprimir etiqueta" data-testid={`button-print-${p.id}`}>
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-10 w-10 p-0 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setCancelPalletTarget(p)} title="Cancelar pallet" data-testid={`button-cancel-${p.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={showCreateConfirm} onOpenChange={setShowCreateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Criação do Pallet</DialogTitle>
            <DialogDescription>
              {palletItems.length} produto{palletItems.length !== 1 ? "s" : ""} · {totalItems} unidade{totalItems !== 1 ? "s" : ""}
              {nfData && <span className="block mt-1">NF: {nfData.nfNumber}</span>}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {palletItems.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm py-1 border-b border-dashed last:border-0">
                <span className="truncate mr-2">{item.productName}</span>
                <span className="font-mono flex-shrink-0">{item.quantity} {item.unit}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateConfirm(false)}>Cancelar</Button>
            <Button onClick={() => createPalletMutation.mutate()} disabled={createPalletMutation.isPending} data-testid="button-confirm-create-pallet">
              {createPalletMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Package className="h-4 w-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelPalletTarget} onOpenChange={open => !open && setCancelPalletTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Pallet</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar o pallet <span className="font-mono font-semibold">{cancelPalletTarget?.code}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelPalletTarget(null)}>Voltar</Button>
            <Button variant="destructive" onClick={() => cancelPalletTarget && cancelPalletMutation.mutate(cancelPalletTarget.id)} disabled={cancelPalletMutation.isPending} data-testid="button-confirm-cancel-pallet">
              {cancelPalletMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Cancelar Pallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editPalletDialog} onOpenChange={open => !open && setEditPalletDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Pallet: {editPalletDialog?.code}</DialogTitle>
          </DialogHeader>
          {editPalletLoading ? (
            <div className="text-center py-8"><Loader2 className="h-6 w-6 mx-auto animate-spin" /></div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {editPalletItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2.5 rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.product?.name || "Produto"}</p>
                    <p className="text-xs text-muted-foreground font-mono">{item.product?.erpCode || ""}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                      setEditPalletItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, it.quantity - 1) } : it));
                    }}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      value={item.quantity}
                      onChange={e => {
                        const v = parseInt(e.target.value.replace(/\D/g, "")) || 1;
                        setEditPalletItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: v } : it));
                      }}
                      className="h-7 w-14 text-center font-mono font-bold text-sm p-0"
                    />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                      setEditPalletItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: it.quantity + 1 } : it));
                    }}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => {
                      setEditPalletItems(prev => prev.filter((_, i) => i !== idx));
                    }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {editPalletItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum item. O pallet será cancelado ao salvar.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPalletDialog(null)}>Cancelar</Button>
            <Button onClick={savePalletEdit} disabled={editPalletLoading} data-testid="button-save-pallet-edit">
              {editPalletLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!labelDialog} onOpenChange={open => !open && setLabelDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Printer className="h-5 w-5" />Etiqueta do Pallet</DialogTitle>
          </DialogHeader>
          {labelDialog && (
            <div className="space-y-3">
              <div className="text-center p-4 border-2 border-dashed rounded-lg bg-muted/30">
                <p className="font-mono text-2xl font-bold">{labelDialog.palletCode}</p>
                <p className="font-semibold text-lg mt-1">{labelDialog.address}</p>
                <p className="text-xs text-muted-foreground mt-2">{new Date(labelDialog.createdAt).toLocaleString("pt-BR")}</p>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto text-sm">
                {labelDialog.items?.map((i: any, idx: number) => (
                  <div key={idx} className="flex justify-between py-1 border-b border-dashed last:border-0">
                    <span className="truncate mr-2">{i.product}</span>
                    <span className="font-mono flex-shrink-0">{i.quantity} {i.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelDialog(null)}>Fechar</Button>
            <Button onClick={printLabel} data-testid="button-print-label"><Printer className="h-4 w-4 mr-2" />Imprimir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
