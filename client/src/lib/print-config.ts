/**
 * Configuração de impressoras por tipo de impressão
 * Armazenado no localStorage do navegador
 */

export type PrintType =
  | "volume_label"
  | "pallet_label";

export interface PrintConfig {
  printer: string;
  copies: number;
}

const STORAGE_KEY = "stoker_print_config";

function loadAll(): Record<string, PrintConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, PrintConfig>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function getPrintConfig(type: PrintType): PrintConfig | null {
  const all = loadAll();
  return all[type] ?? null;
}

export function setPrintConfig(type: PrintType, config: PrintConfig) {
  const all = loadAll();
  all[type] = config;
  saveAll(all);
}

export function clearPrintConfig(type: PrintType) {
  const all = loadAll();
  delete all[type];
  saveAll(all);
}

export function getAllPrintConfigs(): Record<string, PrintConfig> {
  return loadAll();
}

export const PRINT_TYPE_LABELS: Record<PrintType, string> = {
  volume_label: "Etiqueta de Volume",
  pallet_label: "Etiqueta de Palete",
};
