import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";

interface ScanQuantityModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  productName: string;
  productCode: string;
  multiplier: number;
  onMultiplierChange: (val: number) => void;
  accumulatedQty: number;
  onAdd: () => void;
  onSubtract: () => void;
}

export function ScanQuantityModal({
  open,
  onClose,
  onConfirm,
  productName,
  productCode,
  multiplier,
  onMultiplierChange,
  accumulatedQty,
  onAdd,
  onSubtract,
}: ScanQuantityModalProps) {
  const multiplierInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="scan-quantity-modal-overlay"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        className="relative bg-background rounded-2xl shadow-xl w-[320px] max-w-[90vw] p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200"
        data-testid="scan-quantity-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          onClick={onClose}
          data-testid="button-close-scan-modal"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center pr-6">
          <p className="font-semibold text-sm leading-tight" data-testid="text-scan-modal-product">
            {productCode} - {productName}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground text-center block">
            Diminuir / Somar
          </label>
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full shrink-0"
              onClick={onSubtract}
              data-testid="button-subtract-qty"
            >
              <Minus className="h-5 w-5" />
            </Button>
            <Input
              ref={multiplierInputRef}
              type="number"
              min={1}
              value={multiplier}
              onChange={(e) => onMultiplierChange(Math.max(1, parseInt(e.target.value) || 1))}
              onFocus={(e) => e.target.select()}
              className="h-11 w-24 text-center font-semibold text-lg border-2 border-green-500 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              data-testid="input-multiplier"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full shrink-0"
              onClick={onAdd}
              data-testid="button-add-qty"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground text-center block">
            Quantidade Total
          </label>
          <div className="relative">
            <Input
              readOnly
              value={accumulatedQty}
              className="h-11 text-center font-semibold text-lg bg-muted/30 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              data-testid="text-accumulated-qty"
            />
          </div>
        </div>

        <Button
          onClick={onConfirm}
          disabled={accumulatedQty <= 0}
          className="w-full h-12 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl text-base"
          data-testid="button-confirm-scan-modal"
        >
          Confirmar
        </Button>
      </div>
    </div>
  );
}
