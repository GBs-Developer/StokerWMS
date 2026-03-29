import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
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
import { Loader2, Monitor, Printer, CheckCircle2, XCircle } from "lucide-react";
import { type PrinterInfo } from "@/hooks/use-print";
import { apiRequest } from "@/lib/queryClient";

type Mode = "choose" | "browser" | "direct";
type Status = "idle" | "loading" | "printing" | "success" | "error";

interface PrintModalProps {
  open: boolean;
  onClose: () => void;
  /** URL da página de impressão para abrir no navegador */
  printUrl?: string;
  /** HTML completo para impressão direta no servidor */
  html?: string | (() => string);
  title?: string;
}

export function PrintModal({ open, onClose, printUrl, html, title = "Imprimir" }: PrintModalProps) {
  const [mode, setMode] = useState<Mode>("choose");
  const [status, setStatus] = useState<Status>("idle");
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [copies, setCopies] = useState<number>(1);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (!open) {
      setMode("choose");
      setStatus("idle");
      setErrorMsg("");
    }
  }, [open]);

  async function handleBrowserPrint() {
    if (printUrl) {
      window.open(printUrl, "_blank");
    }
    onClose();
  }

  async function handleDirectMode() {
    setMode("direct");
    setStatus("loading");
    try {
      const res = await apiRequest("GET", "/api/print/printers");
      const data = await res.json() as { success: boolean; default_printer: string | null; printers: PrinterInfo[] };
      if (data.success) {
        setPrinters(data.printers);
        const def = data.default_printer ?? data.printers[0]?.name ?? "";
        setSelectedPrinter(def);
      }
    } catch {
      setErrorMsg("Não foi possível obter a lista de impressoras do servidor.");
      setStatus("error");
      return;
    }
    setStatus("idle");
  }

  async function handlePrint() {
    if (!selectedPrinter) return;
    setStatus("printing");
    setErrorMsg("");
    try {
      const htmlContent = typeof html === "function" ? html() : (html ?? "");
      const res = await apiRequest("POST", "/api/print/job", {
        html: htmlContent,
        printer: selectedPrinter,
        copies,
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (data.success) {
        setStatus("success");
      } else {
        setErrorMsg(data.error ?? "Erro desconhecido na impressão.");
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* ── Escolha inicial ── */}
        {mode === "choose" && (
          <div className="flex flex-col gap-3 py-2">
            {printUrl && (
              <Button
                variant="outline"
                className="h-16 flex-col gap-1"
                onClick={handleBrowserPrint}
                data-testid="btn-print-browser"
              >
                <Monitor className="h-5 w-5" />
                <span className="text-sm">Abrir no navegador para imprimir</span>
              </Button>
            )}
            <Button
              variant="outline"
              className="h-16 flex-col gap-1"
              onClick={handleDirectMode}
              data-testid="btn-print-direct"
            >
              <Printer className="h-5 w-5" />
              <span className="text-sm">Enviar direto para impressora do servidor</span>
            </Button>
          </div>
        )}

        {/* ── Impressão direta ── */}
        {mode === "direct" && status === "loading" && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando impressoras...
          </div>
        )}

        {mode === "direct" && status !== "loading" && status !== "success" && (
          <div className="flex flex-col gap-4 py-2">
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
                        <SelectItem key={p.name} value={p.name} data-testid={`printer-option-${p.name}`}>
                          {p.name}
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

        {/* ── Sucesso ── */}
        {status === "success" && (
          <div className="flex flex-col items-center gap-2 py-6 text-green-600">
            <CheckCircle2 className="h-10 w-10" />
            <p className="font-medium">Enviado para impressão!</p>
            <p className="text-sm text-muted-foreground">Impressora: {selectedPrinter}</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {mode === "choose" && (
            <Button variant="ghost" onClick={onClose} data-testid="btn-print-cancel">
              Cancelar
            </Button>
          )}

          {mode === "direct" && status !== "success" && (
            <>
              <Button
                variant="ghost"
                onClick={() => setMode("choose")}
                disabled={isBusy}
                data-testid="btn-print-back"
              >
                Voltar
              </Button>
              <Button
                onClick={handlePrint}
                disabled={isBusy || !selectedPrinter || printers.length === 0}
                data-testid="btn-print-confirm"
              >
                {status === "printing" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {status === "error" ? "Tentar novamente" : "Imprimir"}
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
