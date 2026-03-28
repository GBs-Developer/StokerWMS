import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, Loader2, Package, Barcode, Hash, Type, X, MapPin, Clock, AlertTriangle, Info, Layers, ShoppingCart } from "lucide-react";
import { useLocation } from "wouter";

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

  const searchTypes = [
    { value: "all", label: "Tudo", icon: Search },
    { value: "code", label: "Codigo", icon: Hash },
    { value: "description", label: "Descricao", icon: Type },
  ];

  return (
    <div className="min-h-[100dvh] bg-background">
      <GradientHeader title="Produtos" subtitle={companyId ? (companiesData?.find(c => c.id === companyId)?.name || "") : ""} compact>
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-white/70 hover:text-white hover:bg-white/10 h-9" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-3 safe-bottom">
        <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3 animate-fade-in">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              ref={inputRef}
              placeholder={
                searchType === "code" ? "Codigo ERP exato..." :
                searchType === "description" ? "Buscar por descricao..." :
                "Nome, codigo ou barras..."
              }
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-10 pr-10 h-12 rounded-xl text-sm"
              autoFocus
              data-testid="input-product-search"
            />
            {searchQuery && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={clearSearch} data-testid="button-clear-search">
                {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <X className="h-4 w-4 text-muted-foreground" />}
              </button>
            )}
          </div>

          <div className="flex rounded-xl border bg-muted/30 p-1 gap-1">
            {searchTypes.map(st => {
              const Icon = st.icon;
              return (
                <button
                  key={st.value}
                  onClick={() => { setSearchType(st.value); setSearchQuery(""); setDebouncedQuery(""); inputRef.current?.focus(); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    searchType === st.value ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                  }`}
                  data-testid={`tab-search-${st.value}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {st.label}
                </button>
              );
            })}
          </div>

          {searchType === "code" && (
            <p className="text-[11px] text-muted-foreground text-center bg-blue-50 dark:bg-blue-950/30 rounded-xl px-3 py-2">
              Busca pelo codigo ERP <strong>exato</strong>
            </p>
          )}
        </div>

        {searchQuery.length > 0 && searchQuery.length < minLength && (
          <p className="text-xs text-muted-foreground text-center py-2">
            {searchType === "code" ? "Digite o codigo ERP" : "Min. 2 caracteres"}
          </p>
        )}

        {!isLoading && debouncedQuery.length >= minLength && products.length === 0 && (
          <div className="text-center py-12 text-muted-foreground animate-fade-in">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-muted flex items-center justify-center">
              <Package className="h-7 w-7 opacity-30" />
            </div>
            <p className="text-sm font-medium">Nenhum produto</p>
            <p className="text-xs mt-0.5 opacity-70">"{debouncedQuery}"</p>
          </div>
        )}

        {products.length > 0 && (
          <div className="space-y-2 animate-slide-up">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-muted-foreground">
                {products.length} resultado{products.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-bold px-1 rounded text-[9px] leading-[14px]">PAL</span>
                  Paletizado
                </span>
                <span className="flex items-center gap-1">
                  <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 font-bold px-1 rounded text-[9px] leading-[14px]">PICK</span>
                  Gôndola
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card overflow-hidden divide-y divide-border/30">
              {products.map((p: any) => (
                <div key={p.id} className={`px-4 py-3 ${p.hasNoAddress ? "border-l-[3px] border-l-amber-400" : ""}`} data-testid={`row-product-${p.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight">{p.name}</h3>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5 text-primary font-semibold">
                          <Package className="h-2.5 w-2.5" />
                          <span className="font-mono">{p.erpCode}</span>
                        </span>
                        {p.barcode && (
                          <span className="flex items-center gap-0.5">
                            <Barcode className="h-2.5 w-2.5" />
                            <span className="font-mono">{p.barcode}</span>
                          </span>
                        )}
                        <span>S: {p.section}</span>
                        {p.manufacturer && <span>F: {p.manufacturer}</span>}
                        {p.lastMovementDate && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {formatDate(p.lastMovementDate)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right space-y-1.5">
                      <Badge variant="outline" className="font-mono font-bold text-xs px-1.5 py-0.5 bg-primary/5 border-primary/20 text-primary">
                        {Number(p.totalStock || 0).toLocaleString("pt-BR")} {p.unit}
                      </Badge>
                      <div className="flex flex-col items-end gap-0.5 text-[10px]">
                        <span className="flex items-center gap-1">
                          <span className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-bold px-1 rounded text-[9px] leading-[14px]">PAL</span>
                          <span className="font-mono font-bold text-violet-600 dark:text-violet-400">{Number(p.palletizedStock || 0).toLocaleString("pt-BR")}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 font-bold px-1 rounded text-[9px] leading-[14px]">PICK</span>
                          <span className="font-mono font-bold text-orange-600 dark:text-orange-400">{Number(p.pickingStock || 0).toLocaleString("pt-BR")}</span>
                        </span>
                      </div>
                      {p.hasNoAddress && (
                        <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-2 w-2 mr-0.5" />Sem end.
                        </Badge>
                      )}
                    </div>
                  </div>

                  {p.addresses && p.addresses.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-dashed border-border/30">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1.5 flex items-center gap-0.5">
                        <MapPin className="h-2.5 w-2.5" /> Enderecos
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {p.addresses.map((addr: any, i: number) => (
                          <div key={i} className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1 text-[11px] border border-border/30">
                            <span className="font-bold">{addr.code}</span>
                            <span className="text-border">|</span>
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
          <div className="text-center py-16 text-muted-foreground animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
              <Search className="h-8 w-8 opacity-20" />
            </div>
            <p className="text-sm font-medium">Buscar Produtos</p>
            <p className="text-xs mt-1 opacity-70">
              {searchType === "code" ? "Digite o codigo ERP exato" : "Nome, codigo ou barras"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
