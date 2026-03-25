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
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
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

  const minLength = searchType === "code" ? 1 : 2;

  const { data: products = [], isLoading, isFetching } = useQuery({
    queryKey: ["products-search", debouncedQuery, companyId, searchType],
    queryFn: async () => {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(debouncedQuery)}&type=${searchType}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao buscar");
      return res.json();
    },
    enabled: !!companyId && debouncedQuery.length >= minLength,
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

      <main className="max-w-4xl mx-auto px-3 py-4 space-y-4">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder={
                searchType === "code" ? "Código ERP exato..." :
                searchType === "description" ? "Buscar por descrição..." :
                "Nome, código ERP ou código de barras..."
              }
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-10 pr-10 h-12 text-base"
              autoFocus
              data-testid="input-product-search"
            />
            {searchQuery && (
              <Button variant="ghost" size="sm" className="absolute right-2 top-2 h-8 w-8 p-0" onClick={clearSearch} data-testid="button-clear-search">
                {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              </Button>
            )}
          </div>

          <Tabs value={searchType} onValueChange={v => { setSearchType(v); setSearchQuery(""); setDebouncedQuery(""); inputRef.current?.focus(); }} className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-11">
              <TabsTrigger value="all" className="text-sm gap-1.5" data-testid="tab-search-all">
                <Search className="h-4 w-4" /> Tudo
              </TabsTrigger>
              <TabsTrigger value="code" className="text-sm gap-1.5" data-testid="tab-search-code">
                <Hash className="h-4 w-4" /> Código Exato
              </TabsTrigger>
              <TabsTrigger value="description" className="text-sm gap-1.5" data-testid="tab-search-description">
                <Type className="h-4 w-4" /> Descrição
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {searchType === "code" && (
            <p className="text-xs text-muted-foreground text-center bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2">
              Busca pelo código ERP <strong>exato</strong> — precisa corresponder exatamente ao código cadastrado
            </p>
          )}
        </div>

        {searchQuery.length > 0 && searchQuery.length < minLength && (
          <p className="text-sm text-muted-foreground text-center">
            {searchType === "code" ? "Digite o código ERP exato" : "Digite pelo menos 2 caracteres"}
          </p>
        )}

        {!isLoading && debouncedQuery.length >= minLength && products.length === 0 && (
          <div className="text-center py-12 text-muted-foreground border rounded-xl bg-muted/10">
            <Package className="h-14 w-14 mx-auto mb-4 opacity-30" />
            <p className="text-base font-medium">Nenhum produto encontrado</p>
            <p className="text-sm mt-1 opacity-70">"{debouncedQuery}"</p>
          </div>
        )}

        {products.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground px-1">
              {products.length} produto{products.length !== 1 ? "s" : ""} encontrado{products.length !== 1 ? "s" : ""}
            </p>
            <div className="border rounded-xl overflow-hidden divide-y bg-card">
              {products.map((p: any) => (
                <div key={p.id} className={`p-4 hover:bg-muted/30 transition-colors ${p.hasNoAddress ? 'border-l-4 border-l-amber-500' : ''}`} data-testid={`row-product-${p.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base leading-tight mb-1.5">{p.name}</h3>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div className="flex items-center gap-1.5 text-primary font-semibold">
                          <Package className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="font-mono">{p.erpCode}</span>
                        </div>
                        {p.barcode && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Barcode className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="font-mono text-xs">{p.barcode}</span>
                          </div>
                        )}
                        <div className="text-muted-foreground text-xs">Seção: <span className="font-semibold">{p.section}</span></div>
                        <div className="text-muted-foreground text-xs">Fabricante: <span className="font-semibold">{p.manufacturer || "N/A"}</span></div>
                        {p.lastMovementDate && (
                          <div className="flex items-center gap-1 text-muted-foreground text-xs col-span-2">
                            <Clock className="h-3 w-3" />
                            Último mov: {formatDate(p.lastMovementDate)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-right space-y-1.5">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase font-bold mb-0.5">Total</div>
                        <Badge variant="outline" className="font-mono font-bold text-sm px-2 py-0.5 bg-primary/5 border-primary/30 text-primary">
                          {Number(p.totalStock || 0).toLocaleString("pt-BR")} {p.unit}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-end gap-3 text-xs">
                        <div className="text-center">
                          <div className="text-[10px] text-muted-foreground">Pick</div>
                          <span className="font-mono font-bold text-orange-600">{Number(p.pickingStock || 0).toLocaleString("pt-BR")}</span>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] text-muted-foreground">End.</div>
                          <span className="font-mono font-bold text-blue-600">{p.addressCount || 0}</span>
                        </div>
                      </div>
                      {p.hasNoAddress && (
                        <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">
                          <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Sem end.
                        </Badge>
                      )}
                    </div>
                  </div>

                  {p.addresses && p.addresses.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-dashed">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Endereços Alocados:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {p.addresses.map((addr: any, i: number) => (
                          <div key={i} className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2.5 py-1.5 text-sm border">
                            <span className="font-bold tracking-tight">{addr.code}</span>
                            <span className="w-px h-3 bg-muted-foreground/30" />
                            <span className="font-mono font-bold text-primary">{Number(addr.quantity).toLocaleString("pt-BR")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {debouncedQuery.length < minLength && products.length === 0 && !isLoading && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-semibold">Buscar Produtos</p>
            <p className="text-sm mt-2 opacity-70">
              {searchType === "code"
                ? "Digite o código ERP exato do produto"
                : "Digite o nome, código ERP ou código de barras"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
