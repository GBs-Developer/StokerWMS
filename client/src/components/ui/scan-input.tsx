import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScanLine, Check, X, AlertTriangle, Keyboard, ArrowRight } from "lucide-react";

interface ScanInputProps {
  placeholder?: string;
  onScan: (value: string) => void;
  status?: "idle" | "success" | "error" | "warning";
  statusMessage?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}

export function ScanInput({
  placeholder = "Aguardando leitura...",
  onScan,
  status = "idle",
  statusMessage,
  disabled = false,
  autoFocus = true,
  className,
  value: controlledValue,
  onChange: controlledOnChange,
  readOnly = false,
  inputMode = "none",
}: ScanInputProps) {
  // Buffer interno — acumula teclas do leitor via onKeyDown
  const bufferRef = useRef("");
  const [displayValue, setDisplayValue] = useState("");

  // Se controlado externamente, repassa; senão usa estado interno
  const setValue = useCallback((newValue: string) => {
    setDisplayValue(newValue);
    bufferRef.current = newValue;
    if (controlledOnChange) controlledOnChange(newValue);
  }, [controlledOnChange]);

  const externalValue = controlledValue !== undefined ? controlledValue : undefined;
  const shownValue = externalValue !== undefined ? externalValue : displayValue;

  const inputRef = useRef<HTMLInputElement>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const manualInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current && !disabled) {
      inputRef.current.focus();
    }
  }, [autoFocus, disabled]);

  useEffect(() => {
    if (manualOpen && manualInputRef.current) {
      setTimeout(() => manualInputRef.current?.focus(), 50);
    }
  }, [manualOpen]);

  /**
   * Captura teclas do leitor mesmo com inputMode="none".
   * Browsers com inputMode="none" não atualizam e.target.value, mas
   * continuam disparando keydown — acumulamos aqui manualmente.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const scanned = bufferRef.current.trim();
      if (scanned) {
        setValue("");
        onScan(scanned);
      }
      return;
    }

    // Ignora teclas de controle (Backspace, Tab, F-keys, etc.)
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = bufferRef.current.slice(0, -1);
      setValue(next);
      return;
    }

    // Apenas caracteres imprimíveis (length === 1)
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const next = bufferRef.current + e.key;
      setValue(next);
    }
  };

  // Confirmar digitação manual
  const handleManualConfirm = () => {
    const v = manualValue.trim();
    if (!v) return;
    setManualValue("");
    setManualOpen(false);
    onScan(v);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleManualKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); handleManualConfirm(); }
    if (e.key === "Escape") {
      setManualOpen(false);
      setManualValue("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const statusColors = {
    idle: "border-input focus:ring-primary",
    success: "border-green-500 bg-green-50 dark:bg-green-950/30 ring-2 ring-green-500",
    error: "border-red-500 bg-red-50 dark:bg-red-950/30 ring-2 ring-red-500",
    warning: "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 ring-2 ring-yellow-500",
  };

  const StatusIcon = {
    idle: ScanLine,
    success: Check,
    error: X,
    warning: AlertTriangle,
  }[status];

  const iconColors = {
    idle: "text-muted-foreground",
    success: "text-green-600 dark:text-green-400",
    error: "text-red-600 dark:text-red-400",
    warning: "text-yellow-600 dark:text-yellow-400",
  };

  return (
    <div className={cn("relative", className)}>
      <div className="relative flex items-center gap-1.5">
        <div className="relative flex-1">
          <StatusIcon
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors pointer-events-none",
              iconColors[status]
            )}
          />
          {/* Campo do leitor: inputMode="none" evita teclado virtual;
              onKeyDown acumula caracteres manualmente (funciona mesmo quando
              o browser não atualiza o value via onChange com inputMode=none) */}
          <Input
            ref={inputRef}
            type="text"
            value={shownValue}
            onChange={() => {/* controlado via onKeyDown */}}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            inputMode={inputMode}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className={cn(
              "pl-11 pr-3 h-14 text-lg font-mono transition-all",
              statusColors[status]
            )}
            data-testid="input-scan"
          />
        </div>

        {/* Botão para digitar manualmente com teclado */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-14 w-11 shrink-0 border-border"
          onClick={() => { setManualValue(""); setManualOpen(true); }}
          disabled={disabled}
          title="Digitar manualmente"
          data-testid="button-scan-keyboard"
        >
          <Keyboard className="h-5 w-5 text-muted-foreground" />
        </Button>
      </div>

      {/* Overlay de digitação manual (este input abre teclado normalmente) */}
      {manualOpen && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-background border border-primary rounded-lg shadow-lg p-2 flex gap-2 items-center">
          <Input
            ref={manualInputRef}
            type="text"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            onKeyDown={handleManualKeyDown}
            placeholder="Digite o código..."
            className="flex-1 h-10 font-mono text-sm"
            autoComplete="off"
            data-testid="input-scan-manual"
          />
          <Button
            type="button"
            size="sm"
            className="h-10 px-3 shrink-0"
            onClick={handleManualConfirm}
            disabled={!manualValue.trim()}
            data-testid="button-scan-manual-confirm"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 px-2 shrink-0"
            onClick={() => {
              setManualOpen(false);
              setManualValue("");
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            data-testid="button-scan-manual-cancel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="h-6 mt-1 flex items-center">
        {statusMessage && (
          <p
            className={cn(
              "text-sm font-medium truncate",
              {
                "text-green-600 dark:text-green-400": status === "success",
                "text-red-600 dark:text-red-400": status === "error",
                "text-yellow-600 dark:text-yellow-400": status === "warning",
              }
            )}
          >
            {statusMessage}
          </p>
        )}
      </div>
    </div>
  );
}
