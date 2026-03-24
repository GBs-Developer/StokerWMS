import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, Loader2, Package, Barcode } from "lucide-react";
import { useLocation } from "wouter";

export default function ProdutosPage() {
  const [, navigate] = useLocation();
  const { companyId, companiesData } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => setDebouncedQuery(value), 400);
    setDebounceTimer(timer);
  };

  const { data: products = [], isLoading, isFetching } = useQuery({
    queryKey: ["products-search", debouncedQuery, companyId],
    queryFn: async () => {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(debouncedQuery)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao buscar");
      return res.json();
    },
    enabled: !!companyId && debouncedQuery.length >= 2,
  });

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Buscar Produtos" subtitle={companyId ? (companiesData?.find(c => c.id === companyId)?.name || "") : ""}>
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="bg-white/10 border-white/20 text-white hover:bg-white/20" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, código ERP ou código de barras..."
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            className="pl-10 h-12 text-base"
            autoFocus
            data-testid="input-product-search"
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-3 h-5 w-5 animate-spin text-muted-foreground" />
          )}
        </div>

        {searchQuery.length > 0 && searchQuery.length < 2 && (
          <p className="text-sm text-muted-foreground text-center">Digite pelo menos 2 caracteres para buscar</p>
        )}

        {!isLoading && debouncedQuery.length >= 2 && products.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p>Nenhum produto encontrado para "{debouncedQuery}"</p>
          </div>
        )}

        {products.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{products.length} produto{products.length !== 1 ? "s" : ""} encontrado{products.length !== 1 ? "s" : ""}</p>
            {products.map((p: any) => (
              <div key={p.id} className="p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors" data-testid={`row-product-${p.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{p.name}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">ERP: {p.erpCode}</span>
                      {p.barcode && (
                        <span className="flex items-center gap-1">
                          <Barcode className="h-3 w-3" />
                          {p.barcode}
                        </span>
                      )}
                      <span>Seção: {p.section}</span>
                      <span>Unidade: {p.unit}</span>
                      {p.manufacturer && <span>Fabricante: {p.manufacturer}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge variant="secondary" className="font-mono">
                      Estoque: {Number(p.companyStockQty || 0).toLocaleString("pt-BR")}
                    </Badge>
                    {p.price > 0 && (
                      <span className="text-xs text-muted-foreground">
                        R$ {Number(p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>
                {p.boxBarcodes && Array.isArray(p.boxBarcodes) && p.boxBarcodes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.boxBarcodes.map((bb: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs font-mono">
                        {bb.code} (×{bb.qty})
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {debouncedQuery.length < 2 && products.length === 0 && !isLoading && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Buscar Produtos</p>
            <p className="text-sm mt-1">Digite o nome, código ERP ou código de barras do produto</p>
          </div>
        )}
      </main>
    </div>
  );
}
