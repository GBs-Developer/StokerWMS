import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
  status: string;
}

export interface PrintOptions {
  /** URL da página de impressão — aberta em nova aba para impressão via navegador */
  printUrl?: string;
  /** HTML completo para envio direto à impressora do servidor */
  html?: string | (() => string);
}

export function usePrint() {
  const [modalOpen, setModalOpen] = useState(false);
  const [options, setOptions] = useState<PrintOptions>({});

  function openPrintModal(opts: PrintOptions) {
    setOptions(opts);
    setModalOpen(true);
  }

  function closePrintModal() {
    setModalOpen(false);
  }

  /** Busca lista de impressoras disponíveis no servidor */
  async function fetchPrinters(): Promise<{ success: boolean; default_printer: string | null; printers: PrinterInfo[] }> {
    const res = await apiRequest("GET", "/api/print/printers");
    return res.json();
  }

  /** Envia trabalho de impressão direto para a impressora escolhida */
  async function submitPrintJob(html: string, printer: string, copies: number): Promise<{ success: boolean; error?: string }> {
    const res = await apiRequest("POST", "/api/print/job", { html, printer, copies });
    return res.json();
  }

  return {
    modalOpen,
    options,
    openPrintModal,
    closePrintModal,
    fetchPrinters,
    submitPrintJob,
  };
}
