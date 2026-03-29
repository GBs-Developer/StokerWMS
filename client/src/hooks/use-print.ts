import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getPrintConfig, type PrintType } from "@/lib/print-config";

/**
 * Hook de impressão sem modal.
 * - Usa a impressora salva em print-config (localStorage)
 * - Botão mostra spinner enquanto a requisição é enviada
 * - Toast de erro se falhar
 * - Se não houver impressora configurada, avisa e redireciona para configurações
 */
export function usePrint() {
  const [printing, setPrinting] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  async function print(html: string, printType: PrintType) {
    const config = getPrintConfig(printType);

    if (!config) {
      toast({
        title: "Impressora não configurada",
        description: "Acesse Configurações > Impressoras para definir a impressora padrão para este tipo de etiqueta.",
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
      copies: config.copies,
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
