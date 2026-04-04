import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Barcode, Check, Loader2, Package, ScanLine, Hash, AlertCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

type Step = "unit" | "package" | "qty" | "confirm";

interface LookupResult {
  found: boolean;
  source?: string;
  product?: { id: string; name: string; erpCode: string };
  type?: string;
  packagingQty?: number;
}

export default function CodigosBarrasPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("unit");
  const [unitBarcode, setUnitBarcode] = useState("");
  const [packageBarcode, setPackageBarcode] = useState("");
  const [qty, setQty] = useState("");
  const [pkgType, setPkgType] = useState("");
  const [productInfo, setProductInfo] = useState<{ id: string; name: string; erpCode: string } | null>(null);
  const [success, setSuccess] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ name: string; erpCode: string; pkg: string; qty: number } | null>(null);

  const unitRef = useRef<HTMLInputElement>(null);
  const pkgRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "unit") unitRef.current?.focus();
    else if (step === "package") pkgRef.current?.focus();
    else if (step === "qty") qtyRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => {
        setSuccess(false);
        setSuccessInfo(null);
        resetAll();
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [success]);

  const lookupMutation = useMutation({
    mutationFn: async (barcode: string) => {
      const res = await fetch(`/api/barcodes/lookup/${encodeURIComponent(barcode)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro na consulta");
      return res.json() as Promise<LookupResult>;
    },
    onSuccess: (data) => {
      if (!data.found) {
        toast({ variant: "destructive", title: "Código não encontrado", description: "Nenhum produto com esse código" });
        return;
      }
      if (data.product) {
        setProductInfo(data.product);
        setStep("package");
      }
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erro", description: "Falha ao consultar código" });
    },
  });

  const quickLinkMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/barcodes/quick-link", body);
      return res.json();
    },
    onSuccess: (data) => {
      setSuccessInfo({
        name: data.productName || productInfo?.name || "",
        erpCode: data.erpCode || productInfo?.erpCode || "",
        pkg: packageBarcode,
        qty: Number(qty),
      });
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["/api/barcodes"] });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Erro ao salvar", description: e.message || "Falha ao vincular código" });
    },
  });

  function resetAll() {
    setStep("unit");
    setUnitBarcode("");
    setPackageBarcode("");
    setQty("");
    setPkgType("");
    setProductInfo(null);
    setTimeout(() => unitRef.current?.focus(), 100);
  }

  function handleUnitSubmit() {
    const code = unitBarcode.trim();
    if (!code) return;
    lookupMutation.mutate(code);
  }

  function handlePackageSubmit() {
    const code = packageBarcode.trim();
    if (!code) return;
    if (code === unitBarcode.trim()) {
      toast({ variant: "destructive", title: "Código inválido", description: "Embalagem não pode ser igual ao unitário" });
      return;
    }
    setStep("qty");
  }

  function handleQtySubmit() {
    const q = Number(qty);
    if (!q || q < 1 || !Number.isInteger(q)) {
      toast({ variant: "destructive", title: "Quantidade inválida", description: "Informe um número inteiro maior que zero" });
      return;
    }
    setStep("confirm");
  }

  function handleConfirm() {
    if (quickLinkMutation.isPending) return;
    quickLinkMutation.mutate({
      productBarcode: unitBarcode.trim(),
      packageBarcode: packageBarcode.trim(),
      packagingQty: Number(qty),
      packagingType: pkgType.trim() || null,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent, action: () => void) {
    if (e.key === "Enter") {
      e.preventDefault();
      action();
    }
  }

  const { data: recentBarcodes = [] } = useQuery<any[]>({
    queryKey: ["/api/barcodes", "recent"],
    queryFn: async () => {
      const res = await fetch(`/api/barcodes?limit=5&active=true`, { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      const json = await res.json();
      return json.data || [];
    },
  });

  if (success && successInfo) {
    return (
      <div className="min-h-screen bg-background">
        <GradientHeader compact>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold text-foreground">Vínculo Rápido</h1>
            </div>
          </div>
        </GradientHeader>
        <div className="max-w-lg mx-auto px-4 py-8">
          <div className="rounded-2xl border-2 border-green-500/50 bg-green-500/10 p-8 text-center space-y-4 animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
              <Check className="h-8 w-8 text-green-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-green-400">Vínculo salvo!</p>
              <p className="text-sm text-muted-foreground mt-1">{successInfo.erpCode} - {successInfo.name}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Embalagem <span className="font-mono font-medium text-foreground">{successInfo.pkg}</span> = <span className="font-bold text-foreground">{successInfo.qty}</span> unidades
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GradientHeader compact>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Vínculo Rápido</h1>
          </div>
        </div>
      </GradientHeader>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3 safe-bottom">
        <div className="flex items-center gap-2 mb-2">
          {(["unit", "package", "qty", "confirm"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                step === s ? "bg-primary text-primary-foreground" :
                  (["unit", "package", "qty", "confirm"].indexOf(step) > i) ? "bg-green-500/20 text-green-400 border border-green-500/50" :
                    "bg-muted text-muted-foreground"
              )}>
                {["unit", "package", "qty", "confirm"].indexOf(step) > i ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < 3 && <div className={cn("w-6 h-0.5", ["unit", "package", "qty", "confirm"].indexOf(step) > i ? "bg-green-500/50" : "bg-border")} />}
            </div>
          ))}
        </div>

        {step === "unit" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                  <Barcode className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold">Código Unitário</p>
                  <p className="text-xs text-muted-foreground">Bipe ou digite o código de barras do produto</p>
                </div>
              </div>
              <Input
                ref={unitRef}
                data-testid="input-unit-barcode"
                value={unitBarcode}
                onChange={e => setUnitBarcode(e.target.value)}
                onKeyDown={e => handleKeyDown(e, handleUnitSubmit)}
                placeholder="Bipar código unitário..."
                className="h-14 text-lg font-mono rounded-xl text-center"
                autoFocus
                inputMode="numeric"
              />
              <Button
                className="w-full h-14 rounded-xl font-semibold shadow-lg shadow-primary/15 active:scale-[0.98]"
                onClick={handleUnitSubmit}
                disabled={!unitBarcode.trim() || lookupMutation.isPending}
                data-testid="button-submit-unit"
              >
                {lookupMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <ScanLine className="h-5 w-5 mr-2" />}
                Consultar Produto
              </Button>
            </div>
          </div>
        )}

        {step === "package" && productInfo && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-green-400" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{productInfo.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{productInfo.erpCode}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <Barcode className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold">Código da Embalagem</p>
                  <p className="text-xs text-muted-foreground">Bipe ou digite o código da caixa/fardo/embalagem</p>
                </div>
              </div>
              <Input
                ref={pkgRef}
                data-testid="input-package-barcode"
                value={packageBarcode}
                onChange={e => setPackageBarcode(e.target.value)}
                onKeyDown={e => handleKeyDown(e, handlePackageSubmit)}
                placeholder="Bipar código da embalagem..."
                className="h-14 text-lg font-mono rounded-xl text-center"
                autoFocus
                inputMode="numeric"
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={resetAll} data-testid="button-back-to-unit">
                  Voltar
                </Button>
                <Button
                  className="flex-1 h-12 rounded-xl font-semibold"
                  onClick={handlePackageSubmit}
                  disabled={!packageBarcode.trim()}
                  data-testid="button-submit-package"
                >
                  Avançar
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "qty" && productInfo && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-green-400" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{productInfo.name}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-xs font-mono">{unitBarcode}</Badge>
                    <span className="text-xs text-muted-foreground">→</span>
                    <Badge variant="outline" className="text-xs font-mono border-amber-400/50 text-amber-400">{packageBarcode}</Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
                  <Hash className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <p className="font-semibold">Quantidade por Embalagem</p>
                  <p className="text-xs text-muted-foreground">Quantas unidades dentro dessa embalagem?</p>
                </div>
              </div>
              <Input
                ref={qtyRef}
                data-testid="input-packaging-qty"
                type="number"
                min="1"
                value={qty}
                onChange={e => setQty(e.target.value)}
                onKeyDown={e => handleKeyDown(e, handleQtySubmit)}
                placeholder="Ex: 6, 12, 24..."
                className="h-14 text-2xl font-bold rounded-xl text-center"
                autoFocus
                inputMode="numeric"
              />
              <Input
                data-testid="input-pkg-type"
                value={pkgType}
                onChange={e => setPkgType(e.target.value)}
                placeholder="Tipo: caixa, fardo, display (opcional)"
                className="h-12 rounded-xl text-center"
                onKeyDown={e => handleKeyDown(e, handleQtySubmit)}
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={() => setStep("package")} data-testid="button-back-to-package">
                  Voltar
                </Button>
                <Button
                  className="flex-1 h-12 rounded-xl font-semibold"
                  onClick={handleQtySubmit}
                  disabled={!qty || Number(qty) < 1}
                  data-testid="button-submit-qty"
                >
                  Avançar
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "confirm" && productInfo && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
              <p className="font-semibold text-center">Confirmar Vínculo</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Produto</span>
                  <span className="font-medium text-right max-w-[60%] truncate">{productInfo.name}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Código Interno</span>
                  <span className="font-mono text-xs">{productInfo.erpCode}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Cód. Unitário</span>
                  <span className="font-mono text-xs">{unitBarcode}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Cód. Embalagem</span>
                  <span className="font-mono text-xs text-amber-400">{packageBarcode}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Qtd Embalagem</span>
                  <span className="font-bold text-lg">{qty} un</span>
                </div>
                {pkgType && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Tipo</span>
                    <span>{pkgType}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>Se já existir vínculo ativo para esse código, ele será substituído automaticamente.</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={() => setStep("qty")} data-testid="button-back-to-qty">
                  Voltar
                </Button>
                <Button
                  className="flex-1 h-14 rounded-xl font-semibold shadow-lg shadow-primary/15 active:scale-[0.98]"
                  onClick={handleConfirm}
                  disabled={quickLinkMutation.isPending}
                  data-testid="button-confirm-link"
                >
                  {quickLinkMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Check className="h-5 w-5 mr-2" />}
                  Salvar Vínculo
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "unit" && recentBarcodes.length > 0 && (
          <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Últimos cadastros</p>
            {recentBarcodes.slice(0, 5).map((b: any) => (
              <div key={b.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/20 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className={cn("text-[10px]", b.type === "UNITARIO" ? "border-blue-400/50 text-blue-400" : "border-amber-400/50 text-amber-400")}>
                    {b.type === "UNITARIO" ? "UN" : "EMB"}
                  </Badge>
                  <span className="font-mono truncate">{b.barcode}</span>
                </div>
                <span className="text-muted-foreground truncate ml-2">{b.productName || "-"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
