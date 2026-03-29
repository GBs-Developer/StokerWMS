import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { getPrintConfig, type PrintType } from "@/lib/print-config";

/**
 * Hook de impressão sem modal.
 * - Busca a impressora configurada para o usuário logado (por userId)
 * - Botão mostra spinner enquanto a requisição é enviada
 * - Toast de erro se falhar ou se impressora não estiver configurada
 */
export function usePrint() {
  const [printing, setPrinting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  async function print(html: string, printType: PrintType) {
    const config = getPrintConfig(printType, user?.id);

    if (!config) {
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
