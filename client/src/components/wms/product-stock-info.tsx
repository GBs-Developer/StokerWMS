import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

interface ProductStockInfoProps {
  totalStock: number;
  palletizedStock: number;
  pickingStock: number;
  unit?: string;
  compact?: boolean;
}

export function ProductStockInfo({ totalStock, palletizedStock, pickingStock, unit = "un", compact = false }: ProductStockInfoProps) {
  const wmsTotal = palletizedStock + pickingStock;
  const difference = wmsTotal - totalStock;
  const hasDifference = difference !== 0;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground">Real:</span>
          <span className="font-mono font-bold">{totalStock.toLocaleString("pt-BR")}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-bold px-1 rounded text-[9px] leading-[14px]">PALETT</span>
          <span className="font-mono font-bold text-violet-600 dark:text-violet-400">{palletizedStock.toLocaleString("pt-BR")}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 font-bold px-1 rounded text-[9px] leading-[14px]">PICK</span>
          <span className="font-mono font-bold text-orange-600 dark:text-orange-400">{pickingStock.toLocaleString("pt-BR")}</span>
        </span>
        {hasDifference && (
          <span className={`flex items-center gap-0.5 font-mono font-bold ${difference > 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
            {difference > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {difference > 0 ? "+" : ""}{difference.toLocaleString("pt-BR")}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-2 space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground font-semibold uppercase tracking-wider">Estoque</span>
        <span className="font-mono font-bold text-xs">{totalStock.toLocaleString("pt-BR")} {unit}</span>
      </div>
      <div className="flex items-center gap-3 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-bold px-1 rounded text-[9px] leading-[14px]">PALETT</span>
          <span className="font-mono font-bold text-violet-600 dark:text-violet-400">{palletizedStock.toLocaleString("pt-BR")}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 font-bold px-1 rounded text-[9px] leading-[14px]">PICK</span>
          <span className="font-mono font-bold text-orange-600 dark:text-orange-400">{pickingStock.toLocaleString("pt-BR")}</span>
        </span>
      </div>
      {hasDifference && (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold ${
          difference > 0
            ? "bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40 text-red-700 dark:text-red-400"
            : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-amber-700 dark:text-amber-400"
        }`}>
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>
            {difference > 0
              ? `Excesso: +${difference.toLocaleString("pt-BR")} ${unit} (WMS > Real)`
              : `Falta: ${difference.toLocaleString("pt-BR")} ${unit} (WMS < Real)`
            }
          </span>
        </div>
      )}
    </div>
  );
}

export function StockLegend() {
  return (
    <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-bold px-1 rounded text-[9px] leading-[14px]">PALETT</span>
        Unidades em pallets
      </span>
      <span className="flex items-center gap-1">
        <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 font-bold px-1 rounded text-[9px] leading-[14px]">PICK</span>
        Unidades em gôndola/picking
      </span>
    </div>
  );
}
