import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Printer, RotateCcw, Save, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import {
  getPrintConfig,
  setPrintConfig,
  clearPrintConfig,
  PRINT_TYPE_LABELS,
  type PrintType,
} from "@/lib/print-config";

const PRINT_TYPES: PrintType[] = ["volume_label", "pallet_label"];

interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

export default function PrintSettingsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const { data: printersData, isLoading, refetch } = useQuery({
    queryKey: ["/api/print/printers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/print/printers");
      return res.json() as Promise<{ success: boolean; printers: PrinterInfo[]; default_printer: string | null }>;
    },
  });

  const printers = printersData?.printers ?? [];

  useEffect(() => {
    const loaded: Record<string, string> = {};
    for (const type of PRINT_TYPES) {
      const cfg = getPrintConfig(type);
      if (cfg) loaded[type] = cfg.printer;
    }
    setConfigs(loaded);
  }, []);

  function handleSave(type: PrintType) {
    const printer = configs[type];
    if (!printer) {
      clearPrintConfig(type);
    } else {
      setPrintConfig(type, { printer, copies: 1 });
    }
    setSaved((prev) => ({ ...prev, [type]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [type]: false })), 2000);
    toast({ title: "Configuração salva", description: `${PRINT_TYPE_LABELS[type]}: ${printer || "sem padrão"}` });
  }

  function handleClear(type: PrintType) {
    clearPrintConfig(type);
    setConfigs((prev) => { const n = { ...prev }; delete n[type]; return n; });
    toast({ title: "Configuração removida", description: `${PRINT_TYPE_LABELS[type]} usará seleção manual.` });
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <GradientHeader title="Configuração de Impressoras" subtitle="Defina a impressora padrão para cada tipo" compact>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/supervisor")}
          className="text-white/70 hover:text-white hover:bg-white/10 h-9"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
        </Button>
      </GradientHeader>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Printer className="h-5 w-5 animate-pulse" />
            Carregando impressoras...
          </div>
        )}

        {!isLoading && printers.length === 0 && (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
              <Printer className="h-8 w-8" />
              <p className="text-sm text-center">Nenhuma impressora encontrada no servidor.<br />Verifique se o sistema está rodando na máquina correta.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RotateCcw className="h-4 w-4 mr-1.5" /> Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && printers.length > 0 && PRINT_TYPES.map((type) => (
          <Card key={type}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Printer className="h-4 w-4 text-muted-foreground" />
                {PRINT_TYPE_LABELS[type]}
              </CardTitle>
              <CardDescription className="text-xs">
                {configs[type]
                  ? `Impressora configurada: ${configs[type]}`
                  : "Sem impressora padrão — usuário precisará selecionar a cada vez"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Impressora padrão</Label>
                <Select
                  value={configs[type] ?? "__none__"}
                  onValueChange={(v) => setConfigs((prev) => ({ ...prev, [type]: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger data-testid={`select-printer-${type}`}>
                    <SelectValue placeholder="Selecionar impressora..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">Sem padrão (selecionar manualmente)</span>
                    </SelectItem>
                    {printers.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name}{p.isDefault && <span className="ml-2 text-xs text-muted-foreground">(padrão do sistema)</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleSave(type)}
                  data-testid={`btn-save-printer-${type}`}
                >
                  {saved[type]
                    ? <><CheckCircle2 className="h-4 w-4 mr-1.5" />Salvo!</>
                    : <><Save className="h-4 w-4 mr-1.5" />Salvar</>
                  }
                </Button>
                {configs[type] && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleClear(type)}
                    data-testid={`btn-clear-printer-${type}`}
                  >
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    Remover padrão
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {!isLoading && printers.length > 0 && (
          <p className="text-xs text-muted-foreground text-center px-4">
            As configurações são salvas neste navegador. Cada dispositivo (computador, Zebra) pode ter sua própria configuração.
          </p>
        )}
      </main>
    </div>
  );
}
