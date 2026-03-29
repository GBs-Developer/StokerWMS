import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Printer, CheckCircle2, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type Status = "loading" | "idle" | "printing" | "success" | "error";

interface PrinterInfo {
  name: string;
  isDefault: boolean;
  status: string;
}

interface PrintModalProps {
  open: boolean;
  onClose: () => void;
  /** HTML completo para impressão direta no servidor */
  html: string | (() => string);
  title?: string;
  /** Quantidade padrão de cópias */
  defaultCopies?: number;
}

export function PrintModal({
  open,
  onClose,
  html,
  title = "Imprimir",
  defaultCopies = 1,
}: PrintModalProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [copies, setCopies] = useState<number>(defaultCopies);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (!open) {
      setStatus("loading");
      setErrorMsg("");
      setCopies(defaultCopies);
      return;
    }
    loadPrinters();
  }, [open]);

  async function loadPrinters() {
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await apiRequest("GET", "/api/print/printers");
      const data = await res.json() as {
        success: boolean;
        default_printer: string | null;
        printers: PrinterInfo[];
        error?: string;
      };
      if (!data.success) throw new Error(data.error ?? "Erro ao listar impressoras");
      setPrinters(data.printers);
      const def = data.default_printer ?? data.printers[0]?.name ?? "";
      setSelectedPrinter(def);
      setStatus("idle");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Não foi possível obter a lista de impressoras do servidor.");
      setStatus("error");
    }
  }

  async function handlePrint() {
    if (!selectedPrinter) return;
    setStatus("printing");
    setErrorMsg("");
    try {
      const htmlContent = typeof html === "function" ? html() : html;
      const res = await apiRequest("POST", "/api/print/job", {
        html: htmlContent,
        printer: selectedPrinter,
        copies,
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (data.success) {
        setStatus("success");
      } else {
        setErrorMsg(data.error ?? "Erro desconhecido ao imprimir.");
        setStatus("error");
      }
    } catch (e: any) {
      setErrorMsg(e.message ?? "Erro de conexão com o servidor.");
      setStatus("error");
    }
  }

  const isBusy = status === "loading" || status === "printing";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isBusy) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Selecione a impressora e confirme o envio do trabalho de impressão.
          </DialogDescription>
        </DialogHeader>

        {/* Carregando impressoras */}
        {status === "loading" && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando impressoras...
          </div>
        )}

        {/* Seleção de impressora */}
        {(status === "idle" || status === "error") && (
          <div className="flex flex-col gap-4 py-1">
            {status === "error" && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {errorMsg}
              </div>
            )}

            {printers.length === 0 && status !== "error" && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma impressora encontrada no servidor.
              </p>
            )}

            {printers.length > 0 && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="printer-select">Impressora</Label>
                  <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
                    <SelectTrigger id="printer-select" data-testid="select-printer">
                      <SelectValue placeholder="Selecione uma impressora" />
                    </SelectTrigger>
                    <SelectContent>
                      {printers.map((p) => (
                        <SelectItem
                          key={p.name}
                          value={p.name}
                          data-testid={`printer-option-${p.name}`}
                        >
                          <span>{p.name}</span>
                          {p.isDefault && (
                            <span className="ml-2 text-xs text-muted-foreground">(padrão)</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="copies-input">Cópias</Label>
                  <Input
                    id="copies-input"
                    type="number"
                    min={1}
                    max={99}
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24"
                    data-testid="input-copies"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Imprimindo */}
        {status === "printing" && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Enviando para {selectedPrinter}...
          </div>
        )}

        {/* Sucesso */}
        {status === "success" && (
          <div className="flex flex-col items-center gap-2 py-6 text-green-600">
            <CheckCircle2 className="h-10 w-10" />
            <p className="font-medium">Enviado para impressão!</p>
            <p className="text-sm text-muted-foreground">{selectedPrinter}</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {status === "error" && (
            <>
              <Button variant="ghost" onClick={onClose} data-testid="btn-print-cancel">
                Cancelar
              </Button>
              <Button onClick={loadPrinters} data-testid="btn-print-retry">
                Tentar novamente
              </Button>
            </>
          )}

          {status === "idle" && (
            <>
              <Button variant="ghost" onClick={onClose} data-testid="btn-print-cancel">
                Cancelar
              </Button>
              <Button
                onClick={handlePrint}
                disabled={!selectedPrinter || printers.length === 0}
                data-testid="btn-print-confirm"
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
            </>
          )}

          {status === "success" && (
            <Button onClick={onClose} data-testid="btn-print-close">
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
