import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, Loader2, Package, Barcode, Hash, Type, X, MapPin, Clock, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ProdutosPage() {
  const [, navigate] = useLocation();
  const { companyId, companiesData } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchType, setSearchType] = useState("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 350);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const clearSearch = () => {
    setSearchQuery("");
    setDebouncedQuery("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setDebouncedQuery(searchQuery);
    }
  };

  const { data: products = [], isLoading, isFetching } = useQuery({
    queryKey: ["products-search", debouncedQuery, companyId, searchType],
    queryFn: async () => {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(debouncedQuery)}&type=${searchType}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao buscar");
      return res.json();
    },
    enabled: !!companyId && debouncedQuery.length >= 2,
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
    } catch { return null; }
  };

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader title="Buscar Produtos" subtitle={companyId ? (companiesData?.find(c => c.id === companyId)?.name || "") : ""}>
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="bg-white/10 border-white/20 text-white hover:bg-white/20" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder={
                searchType === "code" ? "Buscar por código ERP ou Barras..." :
                searchType === "description" ? "Buscar por descrição (use espaço para abreviar)..." :
                "Buscar por nome, código ERP ou barras..."
              }
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-10 pr-20 h-12 text-base"
              autoFocus
              data-testid="input-product-search"
            />
            <div className="absolute right-3 top-2.5 flex items-center gap-1">
              {searchQuery && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={clearSearch} data-testid="button-clear-search">
                  <X className="h-4 w-4" />
                </Button>
              )}
              {isFetching && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          <Tabs value={searchType} onValueChange={v => { setSearchType(v); inputRef.current?.focus(); }} className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-10">
              <TabsTrigger value="all" className="text-xs" data-testid="tab-search-all">
                <Search className="h-3 w-3 mr-2" /> Tudo
              </TabsTrigger>
              <TabsTrigger value="code" className="text-xs" data-testid="tab-search-code">
                <Hash className="h-3 w-3 mr-2" /> Código
              </TabsTrigger>
              <TabsTrigger value="description" className="text-xs" data-testid="tab-search-description">
                <Type className="h-3 w-3 mr-2" /> Descrição
              </TabsTrigger>
            </TabsList>
          </Tabs>
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
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{products.length} produto{products.length !== 1 ? "s" : ""} encontrado{products.length !== 1 ? "s" : ""}</p>
            {products.map((p: any) => (
              <div key={p.id} className={`p-4 rounded-xl border bg-card hover:shadow-md transition-all border-l-4 ${p.hasNoAddress ? 'border-l-amber-500' : 'border-l-primary/50'}`} data-testid={`row-product-${p.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-base text-foreground leading-tight">{p.name}</h3>
                      {p.hasNoAddress && (
                        <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-600 flex items-center gap-1 flex-shrink-0">
                          <AlertTriangle className="h-2.5 w-2.5" /> Sem endereço
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                      <span className="flex items-center gap-1.5 text-primary">
                        <Package className="h-3 w-3" />
                        ERP: <span className="font-mono font-bold">{p.erpCode}</span>
                      </span>
                      {p.barcode && (
                        <span className="flex items-center gap-1.5">
                          <Barcode className="h-3 w-3" />
                          <span className="font-mono">{p.barcode}</span>
                        </span>
                      )}
                      <span>Sec: {p.section}</span>
                      <span>Fabr: {p.manufacturer || "N/A"}</span>
                      {p.lastMovementDate && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Últ. mov: {formatDate(p.lastMovementDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-bold text-muted-foreground leading-none mb-1 uppercase tracking-tighter">Estoque Total</span>
                      <Badge variant="outline" className="font-mono text-sm px-3 py-1 bg-primary/5 border-primary/20 text-primary">
                        {Number(p.totalStock || 0).toLocaleString("pt-BR")} {p.unit}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] font-semibold text-muted-foreground">{p.addressCount || 0} end.</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground">Picking:</span>
                        <span className="font-mono text-xs font-bold text-orange-600">
                          {Number(p.pickingStock || 0).toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {p.addresses && p.addresses.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-dashed">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2 flex items-center gap-2">
                       Endereços Alocados:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {p.addresses.map((addr: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-1.5 text-xs border hover:bg-muted/60 transition-colors shadow-sm">
                          <span className="font-black text-foreground tracking-tight">{addr.code}</span>
                          <span className="w-px h-3 bg-muted-foreground/30" />
                          <span className="font-mono font-bold text-primary">{Number(addr.quantity).toLocaleString("pt-BR")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {p.boxBarcodes && Array.isArray(p.boxBarcodes) && p.boxBarcodes.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.boxBarcodes.map((bb: any, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[9px] font-mono opacity-60 px-1.5 py-0">
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
            <p className="text-xs mt-2 opacity-60">Dica: use espaços para abreviar (ex: "tubo sold 100")</p>
          </div>
        )}
      </main>
    </div>
  );
}
