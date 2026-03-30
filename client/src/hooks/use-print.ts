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
 * Proteção anti-spam: timestamp da última impressão por tipo.
 * Intervalo mínimo de 5s por tipo.
 */
const lastPrintTime: Record<string, number> = {};
const PRINT_COOLDOWN_MS = 5000;

/**
 * Hook de impressão sem modal — fire-and-forget verdadeiro.
 *
 * Retorna:
 *   - printing: true por ~400ms (feedback visual do clique)
 *   - cooldownSeconds: contagem regressiva visível após imprimir (5→4→3→2→1→0)
 */
export function usePrint() {
  const [printing, setPrinting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
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
      // Falha silenciosa ao carregar config
    }

    if (!config?.printer) {
      toast({
        title: "Impressora não configurada",
        description: "Solicite ao administrador que configure a impressora padrão para o seu usuário.",
        variant: "destructive",
      });
      return;
    }

    // Registra antes de chamar API para bloquear spam imediato
    lastPrintTime[printType] = now;
    setPrinting(true);

    // Fire-and-forget: servidor responde 202 imediatamente
    apiRequest("POST", "/api/print/job", {
      html,
      printer: config.printer,
      copies: config.copies ?? 1,
    }).catch(() => {
      // Ignora erros de rede — o trabalho já entrou na fila do servidor
    });

    // Spinner visual por 400ms
    setTimeout(() => setPrinting(false), 400);

    // Contagem regressiva visível no botão
    const totalSeconds = Math.ceil(PRINT_COOLDOWN_MS / 1000);
    setCooldownSeconds(totalSeconds);
    let remaining = totalSeconds;
    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(interval);
        setCooldownSeconds(0);
      } else {
        setCooldownSeconds(remaining);
      }
    }, 1000);
  }

  return { printing, cooldownSeconds, print };
}
