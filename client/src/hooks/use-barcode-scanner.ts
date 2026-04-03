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
      const now = Date.now();
      const gap = now - lastKeyTimeRef.current;
      const isFastInput = gap <= 80;

      if (gap > 80) {
        bufferRef.current = "";
      }
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        if (bufferRef.current.length > 2) {
          e.preventDefault();
          e.stopPropagation();
          const barcode = bufferRef.current;
          bufferRef.current = "";

          const target = e.target as HTMLElement;
          try {
            if (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "hidden") {
              const nativeSetter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype, "value"
              )?.set;
              if (nativeSetter) {
                nativeSetter.call(target, "");
                target.dispatchEvent(new Event("input", { bubbles: true }));
              }
            } else if (target.tagName === "TEXTAREA") {
              const nativeSetter = Object.getOwnPropertyDescriptor(
                HTMLTextAreaElement.prototype, "value"
              )?.set;
              if (nativeSetter) {
                nativeSetter.call(target, "");
                target.dispatchEvent(new Event("input", { bubbles: true }));
              }
            } else if (target.isContentEditable) {
              target.textContent = "";
            }
          } catch (_) {}

          onScanRef.current(barcode);
        }
      } else if (e.key && e.key.length === 1) {
        bufferRef.current += e.key;
        if (isFastInput && bufferRef.current.length >= 2) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled]);
}
