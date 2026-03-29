import { useQuery } from "@tanstack/react-query";

interface StockInfo {
  totalStock: number;
  palletizedStock: number;
  pickingStock: number;
  difference: number;
  unit: string;
}

export function useProductStockBatch(productIds: string[]) {
  const ids = [...new Set(productIds.filter(Boolean))];

  return useQuery<Record<string, StockInfo>>({
    queryKey: ["product-stock-batch", ...ids.sort()],
    queryFn: async () => {
      if (ids.length === 0) return {};
      const res = await fetch("/api/products/stock-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: ids }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: ids.length > 0,
    staleTime: 30000,
  });
}

export interface ProductAddress {
  code: string;
  type: string | null;
  quantity: number;
  addressId?: string;
}

export function useProductAddressesBatch(productIds: string[]) {
  const ids = [...new Set(productIds.filter(Boolean))];

  return useQuery<Record<string, ProductAddress[]>>({
    queryKey: ["product-addresses-batch", ...ids.sort()],
    queryFn: async () => {
      if (ids.length === 0) return {};
      const res = await fetch("/api/products/addresses-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: ids }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    enabled: ids.length > 0,
    staleTime: 30000,
  });
}
