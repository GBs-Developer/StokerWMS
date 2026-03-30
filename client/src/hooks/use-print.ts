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
 * Proteção anti-spam: guarda o timestamp da última impressão enviada por tipo.
 * Intervalo mínimo de 4s por tipo — ignora cliques repetidos silenciosamente.
 */
const lastPrintTime: Record<string, number> = {};
const PRINT_COOLDOWN_MS = 4000;

/**
 * Hook de impressão sem modal — fire-and-forget verdadeiro.
 * - O servidor responde imediatamente (202) e processa a impressão em background.
 * - Cliques repetidos dentro do cooldown são ignorados silenciosamente.
 * - Erros de rede/timeout não geram toast (o trabalho já chegou ao servidor).
 * - Somente erros de validação (impressora não configurada) geram toast.
 */
export function usePrint() {
  const [printing, setPrinting] = useState(false);
  const { toast } = useToast();

  async function print(html: string, printType: PrintType) {
    // Anti-spam: ignora se já foi enviado recentemente para este tipo
    const now = Date.now();
    const last = lastPrintTime[printType] ?? 0;
    if (now - last < PRINT_COOLDOWN_MS) return;

    // Busca a config do usuário no banco de dados (cacheada em memória)
    let config: PrintConfig | undefined;
    try {
      const allConfigs = await loadPrintConfig();
      config = allConfigs[printType];
    } catch {
      // Falha silenciosa ao carregar config — não bloqueia o usuário
    }

    if (!config?.printer) {
      toast({
        title: "Impressora não configurada",
        description: "Solicite ao administrador que configure a impressora padrão para o seu usuário.",
        variant: "destructive",
      });
      return;
    }

    // Registra o envio ANTES de chamar a API para bloquear spam imediato
    lastPrintTime[printType] = now;
    setPrinting(true);

    // Fire-and-forget: o servidor responde 202 imediatamente.
    // Não esperamos o Chrome gerar o PDF — erros de rede são silenciosos.
    apiRequest("POST", "/api/print/job", {
      html,
      printer: config.printer,
      copies: config.copies ?? 1,
    }).catch(() => {
      // Ignora erros de rede/timeout — o trabalho já entrou na fila do servidor
    });

    // Spinner visual mínimo para feedback do clique
    setTimeout(() => setPrinting(false), 400);
  }

  return { printing, print };
}
