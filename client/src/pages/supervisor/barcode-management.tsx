import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Search, Loader2, Barcode, Plus, Pencil, Power, PowerOff,
  History, ChevronLeft, ChevronRight, X, Package, Filter,
} from "lucide-react";
import { useLocation } from "wouter";

interface BarcodeRecord {
  id: string;
  companyId: number | null;
  productId: string;
  barcode: string;
  type: "UNITARIO" | "EMBALAGEM";
  packagingQty: number;
  packagingType: string | null;
  active: boolean;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  deactivatedAt: string | null;
  deactivatedBy: string | null;
  productName: string | null;
  erpCode: string | null;
  productSection: string | null;
}

interface HistoryRecord {
  id: number;
  barcodeId: string | null;
  productId: string;
  operation: string;
  oldBarcode: string | null;
  newBarcode: string | null;
  barcodeType: string | null;
  oldQty: number | null;
  newQty: number | null;
  userId: string | null;
  userName: string | null;
  notes: string | null;
  createdAt: string;
}

interface ProductSearchResult {
  id: string;
  erpCode: string;
  name: string;
  barcode: string | null;
  section: string;
}

const OPERATION_LABELS: Record<string, string> = {
  criacao: "Criação",
  edicao: "Edição",
  substituicao: "Substituição",
  desativacao: "Desativação",
  ativacao: "Ativação",
};

function formatDate(d: string | null) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return d; }
}

export default function BarcodeManagementPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const [editDialog, setEditDialog] = useState<BarcodeRecord | null>(null);
  const [createDialog, setCreateDialog] = useState(false);
  const [historyDialog, setHistoryDialog] = useState<string | null>(null);
  const [deactivateDialog, setDeactivateDialog] = useState<BarcodeRecord | null>(null);
  const [deactivateNotes, setDeactivateNotes] = useState("");

  const [formBarcode, setFormBarcode] = useState("");
  const [formType, setFormType] = useState<"UNITARIO" | "EMBALAGEM">("UNITARIO");
  const [formQty, setFormQty] = useState("1");
  const [formPkgType, setFormPkgType] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formProductId, setFormProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
  const productDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (productDebounceRef.current) clearTimeout(productDebounceRef.current);
    };
  }, []);

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebouncedSearch(v); setPage(1); }, 350);
  }, []);

  const handleProductSearch = useCallback((v: string) => {
    setProductSearch(v);
    if (productDebounceRef.current) clearTimeout(productDebounceRef.current);
    productDebounceRef.current = setTimeout(() => setDebouncedProductSearch(v), 350);
  }, []);

  const queryParams = new URLSearchParams();
  if (debouncedSearch) queryParams.set("search", debouncedSearch);
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  if (activeFilter !== "all") queryParams.set("active", activeFilter);
  queryParams.set("page", String(page));
  queryParams.set("limit", "30");

  const { data, isLoading } = useQuery<{ data: BarcodeRecord[]; total: number; page: number; pageSize: number }>({
    queryKey: ["/api/barcodes", debouncedSearch, typeFilter, activeFilter, page],
    queryFn: async () => {
      const res = await fetch(`/api/barcodes?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao carregar");
      return res.json();
    },
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<HistoryRecord[]>({
    queryKey: ["/api/barcodes/history", historyDialog],
    queryFn: async () => {
      const res = await fetch(`/api/barcodes/history/${historyDialog}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: !!historyDialog,
  });

  const { data: productResults = [] } = useQuery<ProductSearchResult[]>({
    queryKey: ["/api/products/search-for-barcode", debouncedProductSearch],
    queryFn: async () => {
      const res = await fetch(`/api/products/search-for-barcode?q=${encodeURIComponent(debouncedProductSearch)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: debouncedProductSearch.length >= 2,
  });

  const createMutation = useMutation({
    mutationFn: async (body: any) => apiRequest("POST", "/api/barcodes", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/barcodes"] });
      setCreateDialog(false);
      resetForm();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Erro", description: e.message || "Erro ao cadastrar" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) => apiRequest("PUT", `/api/barcodes/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/barcodes"] });
      setEditDialog(null);
      resetForm();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Erro", description: e.message || "Erro ao atualizar" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => apiRequest("PATCH", `/api/barcodes/${id}/deactivate`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/barcodes"] });
      setDeactivateDialog(null);
      setDeactivateNotes("");
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Erro", description: e.message || "Erro ao desativar" }),
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/barcodes/${id}/activate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/barcodes"] }),
    onError: (e: Error) => toast({ variant: "destructive", title: "Erro", description: e.message || "Erro ao ativar" }),
  });

  function resetForm() {
    setFormBarcode(""); setFormType("UNITARIO"); setFormQty("1");
    setFormPkgType(""); setFormNotes(""); setFormProductId("");
    setProductSearch(""); setDebouncedProductSearch("");
  }

  function openCreate() {
    resetForm();
    setCreateDialog(true);
  }

  function openEdit(rec: BarcodeRecord) {
    setFormBarcode(rec.barcode);
    setFormType(rec.type);
    setFormQty(String(rec.packagingQty));
    setFormPkgType(rec.packagingType || "");
    setFormNotes(rec.notes || "");
    setFormProductId(rec.productId);
    setEditDialog(rec);
  }

  function handleCreate() {
    if (!formProductId || !formBarcode) return;
    createMutation.mutate({
      productId: formProductId,
      barcode: formBarcode.trim(),
      type: formType,
      packagingQty: Number(formQty) || 1,
      packagingType: formPkgType || null,
      notes: formNotes || null,
    });
  }

  function handleUpdate() {
    if (!editDialog || !formBarcode) return;
    updateMutation.mutate({
      id: editDialog.id,
      body: {
        barcode: formBarcode.trim(),
        packagingQty: Number(formQty) || 1,
        packagingType: formPkgType || null,
        notes: formNotes || null,
      },
    });
  }

  const barcodes = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 30);

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader compact>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Barcode className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Gestão de Códigos de Barras</h1>
          </div>
        </div>
      </GradientHeader>

      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="input-barcode-search"
              placeholder="Buscar por código, produto ou código interno..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="pl-10 rounded-xl"
            />
            {search && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => { setSearch(""); setDebouncedSearch(""); }}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" className="rounded-xl" onClick={() => setShowFilters(!showFilters)} data-testid="button-toggle-filters">
              <Filter className="h-4 w-4" />
            </Button>
            <Button className="rounded-xl gap-2" onClick={openCreate} data-testid="button-create-barcode">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Cadastrar</span>
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-muted/50 border border-border/50">
            <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px] rounded-xl" data-testid="select-type-filter">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos tipos</SelectItem>
                <SelectItem value="UNITARIO">Unitário</SelectItem>
                <SelectItem value="EMBALAGEM">Embalagem</SelectItem>
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={v => { setActiveFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px] rounded-xl" data-testid="select-active-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="true">Ativos</SelectItem>
                <SelectItem value="false">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : barcodes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Barcode className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum código de barras encontrado</p>
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">{total} registro(s)</div>
            <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30 bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium">Produto</th>
                      <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Cód. Interno</th>
                      <th className="text-left px-4 py-3 font-medium">Código de Barras</th>
                      <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Tipo</th>
                      <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Qtd Emb.</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Alteração</th>
                      <th className="text-right px-4 py-3 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {barcodes.map(b => (
                      <tr key={b.id} className={`hover:bg-muted/20 ${!b.active ? "opacity-60" : ""}`} data-testid={`row-barcode-${b.id}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium truncate max-w-[200px]">{b.productName || "-"}</div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs">{b.erpCode || "-"}</td>
                        <td className="px-4 py-3 font-mono text-xs">{b.barcode}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <Badge variant="outline" className={b.type === "UNITARIO" ? "border-blue-400/50 text-blue-400" : "border-amber-400/50 text-amber-400"}>
                            {b.type === "UNITARIO" ? "Unit." : "Emb."}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {b.type === "EMBALAGEM" ? (
                            <span>{b.packagingQty} un{b.packagingType ? ` (${b.packagingType})` : ""}</span>
                          ) : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={b.active
                            ? "border-green-400/50 text-green-400 bg-green-500/10"
                            : "border-red-400/50 text-red-400 bg-red-500/10"
                          }>
                            {b.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">{formatDate(b.updatedAt || b.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(b)} title="Editar" data-testid={`button-edit-${b.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {b.active ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-red-400" onClick={() => { setDeactivateDialog(b); setDeactivateNotes(""); }} title="Desativar" data-testid={`button-deactivate-${b.id}`}>
                                <PowerOff className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-green-400" onClick={() => activateMutation.mutate(b.id)} title="Ativar" data-testid={`button-activate-${b.id}`}>
                                <Power className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setHistoryDialog(b.productId)} title="Histórico" data-testid={`button-history-${b.id}`}>
                              <History className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" size="icon" className="rounded-xl" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
                <Button variant="outline" size="icon" className="rounded-xl" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={createDialog} onOpenChange={v => { if (!v) { setCreateDialog(false); resetForm(); } }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Cadastrar Código de Barras</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Produto</label>
              <Input
                data-testid="input-product-search-create"
                placeholder="Buscar produto..."
                value={productSearch}
                onChange={e => handleProductSearch(e.target.value)}
                className="rounded-xl"
              />
              {debouncedProductSearch.length >= 2 && productResults.length > 0 && !formProductId && (
                <div className="mt-1 rounded-xl border border-border/50 bg-card max-h-40 overflow-y-auto">
                  {productResults.map(p => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                      data-testid={`button-select-product-${p.id}`}
                      onClick={() => { setFormProductId(p.id); setProductSearch(`${p.erpCode} - ${p.name}`); setDebouncedProductSearch(""); }}
                    >
                      <span className="font-mono text-xs text-muted-foreground">{p.erpCode}</span>
                      <span className="ml-2">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {formProductId && (
                <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => { setFormProductId(""); setProductSearch(""); }}>
                  Alterar produto
                </Button>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Código de Barras</label>
              <Input data-testid="input-barcode-create" value={formBarcode} onChange={e => setFormBarcode(e.target.value)} placeholder="Bipe ou digite o código" className="rounded-xl font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Tipo</label>
                <Select value={formType} onValueChange={v => setFormType(v as "UNITARIO" | "EMBALAGEM")}>
                  <SelectTrigger className="rounded-xl" data-testid="select-type-create">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNITARIO">Unitário</SelectItem>
                    <SelectItem value="EMBALAGEM">Embalagem</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Qtd Embalagem</label>
                <Input
                  data-testid="input-qty-create"
                  type="number"
                  min="1"
                  value={formQty}
                  onChange={e => setFormQty(e.target.value)}
                  className="rounded-xl"
                  disabled={formType === "UNITARIO"}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Tipo Embalagem</label>
              <Input data-testid="input-pkg-type-create" value={formPkgType} onChange={e => setFormPkgType(e.target.value)} placeholder="Ex: caixa, fardo, display..." className="rounded-xl" disabled={formType === "UNITARIO"} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Observação</label>
              <Textarea data-testid="input-notes-create" value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Opcional" className="rounded-xl" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => { setCreateDialog(false); resetForm(); }}>Cancelar</Button>
            <Button className="rounded-xl" onClick={handleCreate} disabled={!formProductId || !formBarcode.trim() || createMutation.isPending} data-testid="button-confirm-create">
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDialog} onOpenChange={v => { if (!v) { setEditDialog(null); resetForm(); } }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Editar Código de Barras</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-muted/50 border border-border/50">
              <div className="text-sm font-medium">{editDialog?.productName}</div>
              <div className="text-xs text-muted-foreground font-mono">{editDialog?.erpCode}</div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Código de Barras</label>
              <Input data-testid="input-barcode-edit" value={formBarcode} onChange={e => setFormBarcode(e.target.value)} className="rounded-xl font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Qtd Embalagem</label>
                <Input
                  data-testid="input-qty-edit"
                  type="number"
                  min="1"
                  value={formQty}
                  onChange={e => setFormQty(e.target.value)}
                  className="rounded-xl"
                  disabled={editDialog?.type === "UNITARIO"}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Tipo Embalagem</label>
                <Input data-testid="input-pkg-type-edit" value={formPkgType} onChange={e => setFormPkgType(e.target.value)} className="rounded-xl" disabled={editDialog?.type === "UNITARIO"} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Observação</label>
              <Textarea data-testid="input-notes-edit" value={formNotes} onChange={e => setFormNotes(e.target.value)} className="rounded-xl" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => { setEditDialog(null); resetForm(); }}>Cancelar</Button>
            <Button className="rounded-xl" onClick={handleUpdate} disabled={!formBarcode.trim() || updateMutation.isPending} data-testid="button-confirm-edit">
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deactivateDialog} onOpenChange={v => { if (!v) { setDeactivateDialog(null); setDeactivateNotes(""); } }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>Desativar Código</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Desativar o código <span className="font-mono font-medium text-foreground">{deactivateDialog?.barcode}</span> do produto{" "}
              <span className="font-medium text-foreground">{deactivateDialog?.productName}</span>?
            </p>
            <Textarea
              data-testid="input-deactivate-notes"
              value={deactivateNotes}
              onChange={e => setDeactivateNotes(e.target.value)}
              placeholder="Motivo (opcional)"
              className="rounded-xl"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDeactivateDialog(null)}>Cancelar</Button>
            <Button variant="destructive" className="rounded-xl" onClick={() => deactivateDialog && deactivateMutation.mutate({ id: deactivateDialog.id, notes: deactivateNotes })} disabled={deactivateMutation.isPending} data-testid="button-confirm-deactivate">
              {deactivateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Desativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyDialog} onOpenChange={v => { if (!v) setHistoryDialog(null); }}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Histórico de Alterações</DialogTitle></DialogHeader>
          {historyLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !historyData || historyData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum registro encontrado</p>
          ) : (
            <div className="space-y-3">
              {historyData.map(h => (
                <div key={h.id} className="p-3 rounded-xl border border-border/50 bg-muted/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      {OPERATION_LABELS[h.operation] || h.operation}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(h.createdAt)}</span>
                  </div>
                  <div className="text-sm">
                    {h.oldBarcode && <span className="font-mono text-xs text-red-400 line-through mr-2">{h.oldBarcode}</span>}
                    {h.newBarcode && <span className="font-mono text-xs text-green-400">{h.newBarcode}</span>}
                    {h.barcodeType && <span className="ml-2 text-xs text-muted-foreground">({h.barcodeType})</span>}
                  </div>
                  {(h.oldQty || h.newQty) && (
                    <div className="text-xs text-muted-foreground">
                      Qtd: {h.oldQty ?? "-"} → {h.newQty ?? "-"}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Por: {h.userName || h.userId || "-"}
                  </div>
                  {h.notes && <div className="text-xs text-muted-foreground italic">{h.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
