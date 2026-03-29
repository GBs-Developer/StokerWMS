import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { PrintType } from "@/lib/print-config";

interface PrintConfig {
  printer: string;
  copies: number;
}

/**
 * Cache em memória das configs de impressão do usuário logado.
 * Carregado da API na primeira impressão e invalidado após salvar novas configs.
 */
let configCache: Record<string, PrintConfig> | null = null;

export function invalidatePrintConfigCache() {
  configCache = null;
}

async function loadPrintConfig(): Promise<Record<string, PrintConfig>> {
  if (configCache) return configCache;
  const res = await apiRequest("GET", "/api/print/config");
  const data = await res.json() as { success: boolean; printConfig: Record<string, PrintConfig> };
  configCache = data.printConfig ?? {};
  return configCache;
}

/**
 * Hook de impressão sem modal.
 * - Busca a impressora configurada para o usuário logado no banco de dados
 * - Botão mostra spinner enquanto a requisição é enviada
 * - Toast de erro se falhar ou se impressora não estiver configurada
 */
export function usePrint() {
  const [printing, setPrinting] = useState(false);
  const { toast } = useToast();

  async function print(html: string, printType: PrintType) {
    // Busca a config do usuário no banco de dados (cacheada em memória)
    let config: PrintConfig | undefined;
    try {
      const allConfigs = await loadPrintConfig();
      config = allConfigs[printType];
    } catch {
      // falha ao carregar config
    }

    if (!config?.printer) {
      toast({
        title: "Impressora não configurada",
        description: "Solicite ao administrador que configure a impressora padrão para o seu usuário.",
        variant: "destructive",
      });
      return;
    }

    setPrinting(true);

    // Fire-and-forget: não bloqueia o botão esperando o Chrome gerar o PDF.
    // A requisição é enviada; o botão volta ao normal em ~400ms.
    // Se houver erro, um toast aparece quando o servidor responder.
    apiRequest("POST", "/api/print/job", {
      html,
      printer: config.printer,
      copies: config.copies ?? 1,
    })
      .then((res) => res.json())
      .then((data: { success: boolean; error?: string }) => {
        if (!data.success) {
          toast({
            title: "Erro na impressão",
            description: data.error ?? "Erro desconhecido.",
            variant: "destructive",
          });
        }
      })
      .catch((e: Error) => {
        toast({
          title: "Erro na impressão",
          description: e.message ?? "Erro de conexão com o servidor.",
          variant: "destructive",
        });
      });

    // Pequeno delay visual para o usuário perceber que clicou
    setTimeout(() => setPrinting(false), 400);
  }

  return { printing, print };
}
