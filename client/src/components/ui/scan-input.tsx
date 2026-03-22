import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ScanLine, Check, X, AlertTriangle } from "lucide-react";

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
  inputMode = "none", // Desabilita teclado virtual por padrão (apenas scanner/paste)
}: ScanInputProps) {
  const [internalValue, setInternalValue] = useState("");

  const value = controlledValue !== undefined ? controlledValue : internalValue;
  const setValue = useCallback((newValue: string) => {
    if (controlledOnChange) {
      controlledOnChange(newValue);
    } else {
      setInternalValue(newValue);
    }
  }, [controlledOnChange]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current && !disabled) {
      inputRef.current.focus();
    }
  }, [autoFocus, disabled]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) {
      e.preventDefault();
      const scannedValue = value.trim();
      setValue("");
      onScan(scannedValue);
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
      <div className="relative">
        <StatusIcon
          className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors",
            iconColors[status]
          )}
        />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          inputMode={inputMode}
          className={cn(
            "pl-11 h-14 text-lg font-mono transition-all",
            statusColors[status]
          )}
          data-testid="input-scan"
        />
      </div>
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
