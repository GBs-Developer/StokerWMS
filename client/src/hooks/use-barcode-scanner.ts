import { useEffect, useRef, useCallback } from "react";

export function useBarcodeScanner(
  onScan: (barcode: string) => void,
  enabled: boolean = true
) {
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInScanInput = target.getAttribute("data-testid") === "input-scan";

      if (isInScanInput) {
        return;
      }

      const now = Date.now();

      if (now - lastKeyTimeRef.current > 100) {
        bufferRef.current = "";
      }
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        if (bufferRef.current.length > 2) {
          e.preventDefault();
          e.stopPropagation();
          const barcode = bufferRef.current;
          bufferRef.current = "";

          const isInEditableField =
            (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "hidden") ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable;

          if (isInEditableField) {
            (target as HTMLInputElement).value = "";
            target.dispatchEvent(new Event("input", { bubbles: true }));
          }

          onScanRef.current(barcode);
        }
      } else if (e.key && e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled]);
}
