import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, useSessionQueryKey } from "@/lib/auth";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { ScanInput } from "@/components/ui/scan-input";
import { ResultDialog } from "@/components/ui/result-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useSSE } from "@/hooks/use-sse";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import {
  ClipboardCheck,
  Package,
  List,
  LogOut,
  Check,
  AlertTriangle,
  Search,
  Plus,
  ArrowRight,
  Calendar,
  Truck,
  Lock,
  PackageOpen,
} from "lucide-react";
import { VolumeModal } from "@/components/conferencia/VolumeModal";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WorkUnitWithDetails, OrderItem, Product, ExceptionType, UserSettings, Exception } from "@shared/schema";
import { ExceptionDialog } from "@/components/orders/exception-dialog";
import { ExceptionAuthorizationModal } from "@/components/orders/exception-authorization-modal";
import { getCurrentWeekRange, isDateInRange } from "@/lib/date-utils";
import { format } from "date-fns";
import { usePendingDeltaStore } from "@/lib/pendingDeltaStore";
import { useProductAddressesBatch, type ProductAddress } from "@/hooks/use-product-stock";
import { MapPin } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

type ConferenciaStep = "select" | "checking";
type CheckingTab = "product" | "list";

const STORAGE_KEY = "wms:conferencia-session";

interface SessionData {
  tab: CheckingTab;
  productIndex: number;
  workUnitIds: string[];
}

interface ItemWithProduct extends OrderItem {
  product: Product;
  exceptionQty?: number;
  exceptions?: Exception[];
}

interface AggregatedProduct {
  product: Product;
  totalQty: number;          // Original requested quantity (sum of item.quantity)
  totalSeparatedQty: number; // Target quantity for conference (totalQty - exceptions)
  checkedQty: number;        // What was actually checked in conference
  exceptionQty: number;
  items: ItemWithProduct[];
  orderCodes: string[];
  sections: string[];
}

function saveSession(data: SessionData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { }
}

function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { }
  return null;
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { }
}

export default function ConferenciaPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<ConferenciaStep>("select");
  const [selectedWorkUnits, setSelectedWorkUnits] = useState<string[]>([]);
  const [checkingTab, setCheckingTab] = useState<CheckingTab>("list");
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [sessionVersion, setSessionVersion] = useState(0);

  const [scanStatus, setScanStatus] = useState<"idle" | "success" | "error" | "warning">("idle");
  const [scanMessage, setScanMessage] = useState("");
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [resultDialogConfig, setResultDialogConfig] = useState({
    type: "success" as "success" | "error" | "warning",
    title: "",
    message: "",
  });

  useEffect(() => {
    if (scanStatus !== "idle") {
      const timer = setTimeout(() => {
        setScanStatus("idle");
        setScanMessage("");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [scanStatus]);

  const [showExceptionDialog, setShowExceptionDialog] = useState(false);
  const [exceptionItem, setExceptionItem] = useState<ItemWithProduct | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingExceptions, setPendingExceptions] = useState<any[]>([]);

  const [filterOrderId, setFilterOrderId] = useState("");
  const [filterRoute, setFilterRoute] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(getCurrentWeekRange());

  const [sessionRestored, setSessionRestored] = useState(false);
  const [multiplierValue, setMultiplierValue] = useState(1);
  const [manualQtyAllowed, setManualQtyAllowed] = useState<Record<string, boolean>>({});
  const [volumeModalOpen, setVolumeModalOpen] = useState(false);

  const userSettings = (user?.settings as UserSettings) || {};
  const hasManualQtyPermission = !!userSettings.allowManualQty;

  const scanQueueRef = useRef<string[]>([]);
  const scanWorkerRunningRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overQtyModalOpen, setOverQtyModalOpen] = useState(false);
  const overQtyModalOpenRef = useRef(false);
  // Substituindo overQtyProductName por overQtyContext completo
  const [overQtyContext, setOverQtyContext] = useState<{
    productName: string;
    itemIds: string[];
    workUnitId: string;
    barcode: string;
    targetQty: number;
    message: string;
    serverAlreadyReset: boolean;
  } | null>(null);

  const workUnitsQueryKey = useSessionQueryKey(["/api/work-units?type=conferencia"]);
  const routesQueryKey = useSessionQueryKey(["/api/routes"]);

  const { data: workUnits, isLoading } = useQuery<WorkUnitWithDetails[]>({
    queryKey: workUnitsQueryKey,
    refetchInterval: () =>
      scanWorkerRunningRef.current || scanQueueRef.current.length > 0 ? false : 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // useEffect moved down to fix initialization order

  const activeSessionTokenRef = useRef("");

  useEffect(() => {
    activeSessionTokenRef.current = selectedWorkUnits.join(",") + "|" + step + "|" + checkingTab + "|" + sessionVersion;
  }, [selectedWorkUnits, step, checkingTab, sessionVersion]);

  const { data: routes } = useQuery<{ id: string; code: string; name: string }[]>({
    queryKey: routesQueryKey,
  });

  const pendingInvalidateRef = useRef(false);

  useEffect(() => {
    const handleOnline = () => {
      queryClient.invalidateQueries({ queryKey: workUnitsQueryKey });
    };
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      scanWorkerRunningRef.current = false;
      overQtyModalOpenRef.current = false;
      scanQueueRef.current = [];
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [queryClient, workUnitsQueryKey]);

  const handleSSEMessage = useCallback((type: string, _data: any) => {
    if (scanWorkerRunningRef.current || scanQueueRef.current.length > 0) {
      pendingInvalidateRef.current = true;
      return;
    }
    queryClient.invalidateQueries({ queryKey: workUnitsQueryKey });
    if (type === "exception_created") {
      toast({
        title: "Novo Problema Relatado",
        description: "Um problema foi registrado",
        variant: "destructive",
      });
    }
  }, [queryClient, workUnitsQueryKey, toast]);

  useSSE("/api/sse", [
    "picking_update", "lock_acquired", "lock_released", "picking_finished",
    "conference_started", "conference_finished", "exception_created",
    "work_unit_created", "orders_launched", "orders_relaunched",
    "work_units_unlocked", "orders_launch_cancelled",
  ], handleSSEMessage);

  const myLockedUnits = useMemo(() => {
    if (!workUnits || !user) return [];
    return workUnits.filter(wu => wu.lockedBy === user.id && wu.status !== "concluido");
  }, [workUnits, user]);

  const allMyUnits = useMemo(() => {
    if (!workUnits || !user) return [];
    // BUGFIX: Filter out 'concluido' units from allMyUnits so that their 
    // products don't leak into the next order's view.
    let units = workUnits.filter(wu => wu.lockedBy === user.id && wu.status !== "concluido");

    // ISOLAMENTO DE CONTEXTO: Se estamos na tela de conferência, 
    // exija TERMINANTEMENTE que apenas as unidades *selecionadas* para esta rodada apareçam.
    if (step === "checking" && selectedWorkUnits.length > 0) {
      units = units.filter(wu => selectedWorkUnits.includes(wu.id));
    }
    
    return units;
  }, [workUnits, user, step, selectedWorkUnits]);

  useEffect(() => {
    if (allMyUnits.length === 0) return;
    const serverValues: Record<string, number> = {};
    for (const wu of allMyUnits) {
      for (const item of (wu.items as ItemWithProduct[])) {
        if (!serverValues[item.id]) {
          serverValues[item.id] = Number(item.checkedQty);
        }
      }
    }
    usePendingDeltaStore.getState().reconcile("conferencia", serverValues);
  }, [allMyUnits]);

  // Safety: se não houver unidades travadas, voltar para seleção
  useEffect(() => {
    if (step === "checking" && allMyUnits.length === 0 && !isLoading) {
      setStep("select");
      setSelectedWorkUnits([]);
    }
  }, [step, allMyUnits.length, isLoading]);

  const pendingConferencia = usePendingDeltaStore((s) => s.conferencia);

  const aggregatedProducts = useMemo((): AggregatedProduct[] => {
    const units = allMyUnits.length > 0 ? allMyUnits : [];
    const allItems: ItemWithProduct[] = units.flatMap(wu => (wu.items as ItemWithProduct[]) || [])
      .filter(item => Number(item.separatedQty) > 0 || Number(item.quantity) > 0);

    const seenItemIds = new Set<string>();
    const map: Record<string, AggregatedProduct> = {};
    allItems.forEach(item => {
      if (seenItemIds.has(item.id)) return;
      seenItemIds.add(item.id);
      const pid = item.productId;
      if (!map[pid]) {
        map[pid] = {
          product: item.product,
          totalQty: 0,
          totalSeparatedQty: 0,
          checkedQty: 0,
          exceptionQty: 0,
          items: [],
          orderCodes: [],
          sections: [],
        };
      }
      // targetQty is always what was fundamentally requested minus what was marked as an exception.
      // This handles normal flows (where separatedQty equals quantity - exceptionQty)
      // and "Separar Total" flows.
      const itemExcQty = Number(item.exceptionQty || 0);
      const targetQty = Number(item.quantity) - itemExcQty;
      map[pid].totalQty += Number(item.quantity);
      map[pid].totalSeparatedQty += targetQty;
      map[pid].checkedQty += Number(item.checkedQty) + (pendingConferencia[item.id] || 0);
      map[pid].exceptionQty += Number(item.exceptionQty || 0);
      map[pid].items.push(item);

      const wu = units.find(w => w.items.some(i => i.id === item.id));
      if (wu && !map[pid].orderCodes.includes(wu.order.erpOrderId)) {
        map[pid].orderCodes.push(wu.order.erpOrderId);
      }
      if (item.section && !map[pid].sections.includes(item.section)) {
        map[pid].sections.push(item.section);
      }
    });

    return Object.values(map).sort((a, b) =>
      a.product.name.localeCompare(b.product.name, "pt-BR", { sensitivity: "base" })
    );
  }, [allMyUnits, user, pendingConferencia]);

  const currentProduct = aggregatedProducts[currentProductIndex] || aggregatedProducts[0] || null;

  const confProductIds = useMemo(() => aggregatedProducts.map(ap => ap.product.id), [aggregatedProducts]);
  const { data: addressesMap } = useProductAddressesBatch(confProductIds);

  useEffect(() => {
    if (aggregatedProducts.length > 0 && currentProductIndex >= aggregatedProducts.length) {
      setCurrentProductIndex(0);
    }
  }, [aggregatedProducts.length, currentProductIndex]);

  const manualQtyProductIdsKey = useMemo(() => {
    return aggregatedProducts.map(ap => ap.product.id).sort().join(",");
  }, [aggregatedProducts]);

  useEffect(() => {
    if (!hasManualQtyPermission) return;
    if (!manualQtyProductIdsKey) return;

    const allIds = manualQtyProductIdsKey.split(",").filter(Boolean);
    const productIds = allIds.filter(id => !(id in manualQtyAllowed));
    if (productIds.length === 0) return;

    apiRequest("POST", "/api/manual-qty-rules/check", { productIds })
      .then(res => res.json())
      .then((results: Record<string, boolean>) => {
        setManualQtyAllowed(prev => ({ ...prev, ...results }));
      })
      .catch(() => {
        const fallback: Record<string, boolean> = {};
        productIds.forEach(id => { fallback[id] = false; });
        setManualQtyAllowed(prev => ({ ...prev, ...fallback }));
      });
  }, [manualQtyProductIdsKey, hasManualQtyPermission]);

  useEffect(() => {
    if (workUnits && user && !sessionRestored) {
      setSessionRestored(true);
      const saved = loadSession();
      if (saved && saved.workUnitIds.length > 0) {
        const stillLockedIds = saved.workUnitIds.filter(id =>
          workUnits.some(wu => wu.id === id && wu.lockedBy === user.id)
        );
        if (stillLockedIds.length > 0) {
          setStep("checking");
          setCheckingTab(saved.tab);
          setCurrentProductIndex(0);
          setSelectedWorkUnits(stillLockedIds);
          toast({ title: "Sessão Restaurada", description: "Retomando conferência anterior" });
          return;
        } else {
          clearSession();
        }
      }

      const myUnit = workUnits.find(wu => wu.lockedBy === user.id && wu.status !== "concluido");
      if (myUnit) {
        const myIds = workUnits.filter(wu => wu.lockedBy === user.id).map(wu => wu.id);
        setStep("checking");
        setSelectedWorkUnits(myIds);
        toast({ title: "Sessão Restaurada", description: `Retomando pedido ${myUnit.order.erpOrderId}` });
      }
    }
  }, [workUnits, user, sessionRestored, toast]);

  useEffect(() => {
    if (step === "checking" && allMyUnits.length > 0) {
      saveSession({
        tab: checkingTab,
        productIndex: currentProductIndex,
        workUnitIds: allMyUnits.map(wu => wu.id),
      });
    }
  }, [step, checkingTab, currentProductIndex, allMyUnits]);

  const lockMutation = useMutation({
    mutationFn: async (workUnitIds: string[]) => {
      const res = await apiRequest("POST", "/api/work-units/lock", { workUnitIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workUnitsQueryKey });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: async (data: string[] | { ids: string[], reset: boolean }) => {
      const body = Array.isArray(data)
        ? { workUnitIds: data }
        : { workUnitIds: data.ids, reset: data.reset };
      const res = await apiRequest("POST", "/api/work-units/unlock", body);
      if (!res.ok) throw new Error("Erro ao desbloquear unidades");
      return res.json();
    },
    onMutate: async (data) => {
      // Optimistically unlock the selected work units in the cache to prevent double-clicks
      const unlockedIds = Array.isArray(data) ? data : data.ids;
      queryClient.setQueryData(workUnitsQueryKey, (old: any) => {
        if (!old) return old;
        return old.map((wu: any) =>
          unlockedIds.includes(wu.id)
            ? { ...wu, lockedBy: null }
            : wu
        );
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workUnitsQueryKey });
      clearSession();
      setSelectedWorkUnits([]);
      setStep("select");
      setCurrentProductIndex(0);
      setCheckingTab("product");
    },
  });

  const scanItemMutation = useMutation({
    mutationFn: async ({ workUnitId, barcode, quantity = 1 }: { workUnitId: string; barcode: string; quantity?: number }) => {
      const res = await apiRequest("POST", `/api/work-units/${workUnitId}/check-item`, { barcode, quantity });
      return res.json();
    },
  });

  const createExceptionMutation = useMutation({
    mutationFn: async (data: {
      workUnitId: string;
      orderItemId: string;
      type: ExceptionType;
      quantity: number;
      observation: string;
    }) => {
      const res = await apiRequest("POST", "/api/exceptions", data);
      return { ...(await res.json()), _orderItemId: data.orderItemId };
    },
    onSuccess: async (data) => {
      usePendingDeltaStore.getState().clearItem("conferencia", data._orderItemId);
      usePendingDeltaStore.getState().resetBaseline("conferencia", data._orderItemId);
      await queryClient.refetchQueries({ queryKey: workUnitsQueryKey });
      toast({ title: "Problema Registrado", description: "O problema foi reportado com sucesso" });
      setShowExceptionDialog(false);
      setExceptionItem(null);
    },
    onError: (error: Error) => {
      let message = "Falha ao registrar problema";
      try {
        const errorData = JSON.parse(error.message);
        if (errorData.error) message = errorData.error;
      } catch { }
      toast({ title: "Erro", description: message, variant: "destructive" });
    },
  });

  const completeWorkUnitMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/work-units/${id}/complete-conference`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao concluir unidade");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workUnitsQueryKey });
    },
  });

  const clearExceptionsMutation = useMutation({
    mutationFn: async (orderItemId: string) => {
      const res = await apiRequest("DELETE", `/api/exceptions/item/${orderItemId}`);
      return { ...(await res.json()), _orderItemId: orderItemId };
    },
    onSuccess: async (data) => {
      usePendingDeltaStore.getState().clearItem("conferencia", data._orderItemId);
      usePendingDeltaStore.getState().resetBaseline("conferencia", data._orderItemId);
      await queryClient.refetchQueries({ queryKey: workUnitsQueryKey });
      toast({ title: "Exceções Limpas", description: "As exceções foram removidas com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao limpar exceções", variant: "destructive" });
    },
  });

  // Helper para busca múltipla por vírgula
  const processMultipleOrderSearch = (searchValue: string, orderCode: string): boolean => {
    if (!searchValue.trim()) return true;
    if (searchValue.includes(',')) {
      const terms = searchValue.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
      return terms.some(term => orderCode.toLowerCase().includes(term));
    }
    return orderCode.toLowerCase().includes(searchValue.toLowerCase());
  };

  const availableWorkUnits = useMemo(() => {
    return workUnits?.filter((wu) => {
      const orderStatus = wu.order.status;
      if (orderStatus !== "separado" && orderStatus !== "em_conferencia") return false;
      if (!wu.order.isLaunched) return false;
      if (wu.status === "concluido") return false;

      if (filterOrderId && !processMultipleOrderSearch(filterOrderId, wu.order.erpOrderId)) return false;

      if (filterRoute && wu.order.routeId !== filterRoute) return false;

      if (!isDateInRange(wu.order.launchedAt || wu.order.createdAt, dateRange)) return false;

      return true;
    }) || [];
  }, [workUnits, user, filterOrderId, filterRoute, dateRange]);

  const groupedWorkUnits = useMemo(() => {
    const groups: Record<string, typeof availableWorkUnits> = {};
    availableWorkUnits.forEach((wu) => {
      if (!groups[wu.orderId]) groups[wu.orderId] = [];
      groups[wu.orderId].push(wu);
    });
    return Object.values(groups);
  }, [availableWorkUnits]);

  const handleSelectGroup = (wus: typeof availableWorkUnits, checked: boolean) => {
    const safeWus = wus.filter(wu => !wu.lockedBy || wu.lockedBy === user?.id);
    const ids = safeWus.map((wu) => wu.id);
    if (ids.length === 0) return;
    if (checked) {
      setSelectedWorkUnits((prev) => Array.from(new Set([...prev, ...ids])));
    } else {
      setSelectedWorkUnits((prev) => prev.filter((id) => !ids.includes(id)));
    }
  };

  const handleStartConferencia = async () => {
    if (selectedWorkUnits.length === 0) {
      toast({ title: "Atenção", description: "Selecione pelo menos um pedido", variant: "destructive" });
      return;
    }
    try {
      await lockMutation.mutateAsync(selectedWorkUnits);
      const selectedSet = new Set(selectedWorkUnits);
      queryClient.setQueryData<WorkUnitWithDetails[]>(workUnitsQueryKey, (old) => {
        if (!old) return old;
        return old.map(wu =>
          selectedSet.has(wu.id)
            ? { ...wu, lockedBy: user!.id, status: (wu as any).status === "separado" ? "em_conferencia" : wu.status } as WorkUnitWithDetails
            : wu
        );
      });
      setStep("checking");
      setCheckingTab("list");
      setCurrentProductIndex(0);
      setScanStatus("idle");
      setScanMessage("");
      queryClient.invalidateQueries({ queryKey: workUnitsQueryKey });
    } catch {
      toast({ title: "Erro", description: "Falha ao bloquear unidades de trabalho", variant: "destructive" });
    }
  };

  const handleCompleteAll = async () => {
    // Verificar se há exceções não autorizadas
    const allExceptions: Exception[] = [];
    allMyUnits.forEach(wu => {
      wu.items.forEach((item: ItemWithProduct) => {
        if (item.exceptions && item.exceptions.length > 0) {
          item.exceptions.forEach((exc: Exception) => {
            if (!exc.authorizedBy) {
              allExceptions.push({
                ...exc,
                orderItem: {
                  ...item,
                  order: wu.order,
                },
              } as any);
            }
          });
        }
      });
    });

    if (allExceptions.length > 0) {
      const userSettings = user?.settings as UserSettings;
      if (userSettings?.canAuthorizeOwnExceptions) {
        try {
          await apiRequest("POST", "/api/exceptions/auto-authorize", {
            exceptionIds: allExceptions.map(e => e.id),
          });
          toast({ title: "Auto-autorização", description: "Exceções autorizadas automaticamente." });
        } catch (error) {
          toast({ title: "Erro", description: "Falha ao auto-autorizar exceções", variant: "destructive" });
          return;
        }
      } else {
        setPendingExceptions(allExceptions);
        setShowAuthModal(true);
        return;
      }
    }

    // Continuar com finalização normal
    await finalizeWorkUnits();
  };

  const finalizeWorkUnits = async () => {
    usePendingDeltaStore.getState().clear("conferencia");
    try {
      let anyUnlock = false;
      const completedIds: string[] = []; // Track successfully completed units

      for (const wu of allMyUnits) {
        try {
          await completeWorkUnitMutation.mutateAsync(wu.id);
          completedIds.push(wu.id);
        } catch (error: any) {
          if (error.message === "Existem itens pendentes" || error.message?.includes("pendentes")) {
            await unlockMutation.mutateAsync({ ids: [wu.id], reset: false });
            anyUnlock = true;
          } else {
            throw error;
          }
        }
      }

      // BUGFIX: HARD PURGE from the cache optimistically
      queryClient.setQueryData(workUnitsQueryKey, (old: any) => {
        if (!old) return old;
        return old.filter((wu: any) => !completedIds.includes(wu.id));
      });

      // Isolamento transacional
      usePendingDeltaStore.getState().clear("conferencia");
      clearSession();
      setExceptionItem(null);
      setOverQtyContext(null);
      scanQueueRef.current = [];
      
      setStep("select");
      setSelectedWorkUnits([]);
      setCurrentProductIndex(0); 
      setCheckingTab("list");    
      setSessionVersion(v => v + 1);
      
      if (anyUnlock) {
        toast({ title: "Salvo", description: "Sua parte foi concluída. Pedido liberado para outras seções.", variant: "default" });
      } else {
        toast({ title: "Concluído", description: "Conferência finalizada com sucesso", variant: "default" });
      }
    } catch (error) {
      console.error("Error completing work units:", error);
      toast({ title: "Erro", description: "Falha ao finalizar conferência", variant: "destructive" });
    }
  };

  const handleExceptionAuthorized = async () => {
    await queryClient.invalidateQueries({ queryKey: workUnitsQueryKey });
    await finalizeWorkUnits();
  };

  const processScanQueue = useCallback(async () => {
    if (scanWorkerRunningRef.current) return;
    scanWorkerRunningRef.current = true;

    try {
      while (scanQueueRef.current.length > 0) {
        if (overQtyModalOpenRef.current) break;
        const barcode = scanQueueRef.current.shift()!;

        const currentCache = queryClient.getQueryData<any[]>(workUnitsQueryKey) || [];
        const units = currentCache.filter((wu: any) =>
          wu.lockedBy === user?.id && wu.status !== "concluido"
        );
        if (units.length === 0) continue;

        const unitsWithProduct = units.filter((wu: any) =>
          (wu.items as ItemWithProduct[]).some(item =>
            item.product?.barcode === barcode || item.product?.boxBarcode === barcode || (Array.isArray(item.product?.boxBarcodes) && item.product.boxBarcodes.some((bx: any) => bx.code === barcode))
          )
        );

        if (unitsWithProduct.length === 0) {
          setScanStatus("warning");
          setScanMessage("Produto não encontrado nos seus pedidos em aberto");
          continue;
        }

        const { get: getDelta } = usePendingDeltaStore.getState();

        let targetUnit = unitsWithProduct.find((wu: any) => {
          const item = (wu.items as ItemWithProduct[]).find((i: ItemWithProduct) =>
            i.product?.barcode === barcode || i.product?.boxBarcode === barcode || (Array.isArray(i.product?.boxBarcodes) && i.product.boxBarcodes.some((bx: any) => bx.code === barcode))
          );
          if (!item) return false;
          const serverChecked = Number(item.checkedQty);
          const delta = getDelta("conferencia", item.id);
          const iSep = Number(item.separatedQty);
          const iExc = Number(item.exceptionQty || 0);
          const iTarget = iSep > 0 ? iSep : (iExc > 0 ? 0 : Number(item.quantity));
          return serverChecked + delta + iExc < iTarget;
        });

        const finalUnit = targetUnit || unitsWithProduct[0];
        if (!finalUnit) continue;

        const matchedItem = (finalUnit.items as ItemWithProduct[]).find(i =>
          i.product?.barcode === barcode || i.product?.boxBarcode === barcode || (Array.isArray(i.product?.boxBarcodes) && i.product.boxBarcodes.some((bx: any) => bx.code === barcode))
        );
        if (!matchedItem) continue;

        const serverChecked = Number(matchedItem.checkedQty);
        const itemDelta = getDelta("conferencia", matchedItem.id);
        const exceptionQty = Number(matchedItem.exceptionQty || 0);
        const mSep = Number(matchedItem.separatedQty);
        const effectiveTarget = mSep > 0 ? mSep : (exceptionQty > 0 ? 0 : Number(matchedItem.quantity));
        // COMMENTED OUT TO FORCE SERVER SIDE CHECK
        // if (serverChecked + itemDelta + exceptionQty >= effectiveTarget) {
        //   setOverQtyContext({
        //     productName: matchedItem.product.name,
        //     itemIds: [matchedItem.id],
        //     workUnitId: finalUnit.id,
        //     barcode: barcode,
        //     targetQty: effectiveTarget - exceptionQty,
        //     message: `Conferência de "${matchedItem.product.name}" excedeu a quantidade separada.`,
        //     serverAlreadyReset: false,
        //   });
        //   setOverQtyModalOpen(true);
        //   overQtyModalOpenRef.current = true;
        //   break;
        // }

        let multiplier = 1;
        if (matchedItem.product.barcode !== barcode && matchedItem.product.boxBarcodes && Array.isArray(matchedItem.product.boxBarcodes)) {
          const bx = matchedItem.product.boxBarcodes.find((b: any) => b.code === barcode);
          if (bx && bx.qty) multiplier = bx.qty;
        }

        usePendingDeltaStore.getState().inc("conferencia", matchedItem.id, multiplier);

        setScanStatus("idle");
        setScanMessage("");

        const productId = matchedItem.product.id;
        const idx = aggregatedProducts.findIndex(ap => ap.product.id === productId);
        if (idx >= 0) setCurrentProductIndex(idx);
        setCheckingTab("product");

        try {
          const currentToken = activeSessionTokenRef.current;
          const res = await apiRequest("POST", `/api/work-units/${finalUnit.id}/check-item`, { barcode });
          const result = await res.json();

          if (activeSessionTokenRef.current !== currentToken) {
            console.warn("Stale response descartada (contexto alterado).");
            break; // Stop queue processing if context changed
          }

          if (result.status === "success") {
            // No dec — pending is consumed by reconcile when server data arrives
          } else if (result.status === "over_quantity_with_exception" || result.status === "over_quantity") {
            // Reverter incremento otimista
            usePendingDeltaStore.getState().dec("conferencia", matchedItem.id, multiplier);
            // Limpar estado pendente para este item pois o servidor rejeitou ou resetou
            usePendingDeltaStore.getState().clearItem("conferencia", matchedItem.id);
            usePendingDeltaStore.getState().resetBaseline("conferencia", matchedItem.id);

            const targetQty = Number(matchedItem.separatedQty) - Number(matchedItem.exceptionQty ?? 0);

            setOverQtyContext({
              productName: matchedItem.product.name,
              itemIds: [matchedItem.id],
              workUnitId: finalUnit.id,
              barcode: barcode,
              targetQty: Number(targetQty),
              message: result.message || `Conferência de "${matchedItem.product.name}" excedeu a quantidade separada.`,
              serverAlreadyReset: true,
            });
            setOverQtyModalOpen(true);
            overQtyModalOpenRef.current = true;
            break;
          } else if (result.status === "not_found") {
            usePendingDeltaStore.getState().dec("conferencia", matchedItem.id, multiplier);
            setScanStatus("warning");
            setScanMessage("Produto não encontrado neste pedido");
          }
        } catch {
          usePendingDeltaStore.getState().dec("conferencia", matchedItem.id, multiplier);
          setScanStatus("error");
          setScanMessage("Erro ao processar leitura");
        }
      }
    } finally {
      scanWorkerRunningRef.current = false;
    }

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (scanQueueRef.current.length === 0 && !scanWorkerRunningRef.current) {
        queryClient.invalidateQueries({ queryKey: workUnitsQueryKey });
        pendingInvalidateRef.current = false;
      }
    }, 300);
  }, [queryClient, workUnitsQueryKey, user, aggregatedProducts]);

  const handleScanItem = useCallback((barcode: string) => {
    if (overQtyModalOpenRef.current) return;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    scanQueueRef.current.push(barcode);
    processScanQueue();
  }, [processScanQueue]);

  const globalScanHandler = useCallback((barcode: string) => {
    if (step === "checking") {
      handleScanItem(barcode);
    }
  }, [step, handleScanItem]);

  useBarcodeScanner(globalScanHandler, step === "checking");

  const handleIncrementProduct = async (ap: AggregatedProduct, qty: number = 1) => {
    if (overQtyModalOpenRef.current) return;
    const remaining = ap.totalSeparatedQty - ap.checkedQty - ap.exceptionQty;
    if (remaining <= 0) return;

    // Verificar permissão para quantidade manual
    if (!hasManualQtyPermission) {
      toast({
        title: "Permissão Negada",
        description: "Você não tem permissão para alterar quantidade manual",
        variant: "destructive"
      });
      return;
    }

    const barcode = ap.product.barcode;
    if (!barcode) return;

    try {
      const incompleteItem = ap.items.find(it => {
        const iExc = Number(it.exceptionQty || 0);
        const iTarget = Number(it.quantity) - iExc;
        return Number(it.checkedQty) + iExc < iTarget;
      });
      if (!incompleteItem) return;

      const wu = allMyUnits.find(w => w.items.some(it => it.id === incompleteItem.id));
      if (!wu) return;

      const currentToken = activeSessionTokenRef.current;
      const result = await scanItemMutation.mutateAsync({
        workUnitId: wu.id,
        barcode,
        quantity: qty
      });

      if (activeSessionTokenRef.current !== currentToken) {
        console.warn("Stale response descartada na contagem manual.");
        return;
      }

      if (result.status === "success") {
        setScanStatus("idle");
        setScanMessage("");
        setMultiplierValue(1);
      } else if (result.status === "over_quantity" || result.status === "over_quantity_with_exception") {
        ap.items.forEach(item => {
          usePendingDeltaStore.getState().clearItem("conferencia", item.id);
          usePendingDeltaStore.getState().resetBaseline("conferencia", item.id);
        });
        setMultiplierValue(1);
        queryClient.invalidateQueries({ queryKey: workUnitsQueryKey });
        
        const targetQty = ap.totalSeparatedQty - ap.exceptionQty;
        setOverQtyContext({
          productName: ap.product.name,
          itemIds: ap.items.map(i => i.id),
          workUnitId: wu.id,
          barcode: ap.product.barcode || "",
          targetQty,
          message: result.message || `Conferência de "${ap.product.name}" excedeu a quantidade solicitada (${targetQty}).`,
          serverAlreadyReset: true,
        });
        setOverQtyModalOpen(true);
        overQtyModalOpenRef.current = true;
      } else {
        setScanStatus("error");
        setScanMessage("Erro ao incrementar");
      }
    } catch {
      setScanStatus("error");
      setScanMessage("Erro ao incrementar");
    }
  };

  const handleOverQtyRecount = async () => {
    if (!overQtyContext) return;
    const ctx = overQtyContext;

    ctx.itemIds.forEach(id => {
      usePendingDeltaStore.getState().clearItem("conferencia", id);
      usePendingDeltaStore.getState().resetBaseline("conferencia", id);
    });

    setOverQtyModalOpen(false);
    overQtyModalOpenRef.current = false;

    // Dispara o reset real de forma explícita e segura usando os IDs dos itens afetados
    try {
      await apiRequest("POST", `/api/work-units/${ctx.workUnitId}/reset-item-check`, { 
        itemIds: ctx.itemIds
      });
    } catch (err) {
      console.error("Erro ao resetar quantidade do item:", err);
    }

    setOverQtyContext(null);
    setScanStatus("idle");
    setScanMessage("");
    
    // Limpa a fila pendente blindando contra reprocessamento ou loop do mesmo barcode
    scanQueueRef.current = [];
    setTimeout(() => processScanQueue(), 0);

    queryClient.invalidateQueries({ queryKey: workUnitsQueryKey });
  };

  const handleCancelChecking = () => {
    usePendingDeltaStore.getState().clear("conferencia");
    const ids = allMyUnits.map(wu => wu.id);
    if (ids.length > 0) {
      unlockMutation.mutate({ ids, reset: true });
    } else {
      clearSession();
      scanQueueRef.current = [];
      setExceptionItem(null);
      setOverQtyContext(null);
      setStep("select");
      setSelectedWorkUnits([]);
      setCurrentProductIndex(0); // BUGFIX: Reset state on cancel
      setCheckingTab("list");    // BUGFIX: Reset tab on cancel
      setSessionVersion(v => v + 1);
    }
  };


  const handleNextProduct = () => {
    const total = aggregatedProducts.length;
    if (total === 0) return;
    const nextIncompleteIdx = aggregatedProducts.findIndex((ap, idx) => {
      if (idx <= currentProductIndex) return false;
      return ap.totalSeparatedQty - ap.checkedQty - ap.exceptionQty > 0;
    });

    if (nextIncompleteIdx >= 0) {
      setCurrentProductIndex(nextIncompleteIdx);
      return;
    }

    const wrapIncompleteIdx = aggregatedProducts.findIndex((ap, idx) => {
      if (idx === currentProductIndex) return false;
      return ap.totalSeparatedQty - ap.checkedQty - ap.exceptionQty > 0;
    });

    if (wrapIncompleteIdx >= 0) {
      setCurrentProductIndex(wrapIncompleteIdx);
      return;
    }

    // Todos completos: avança linearmente
    const nextIdx = (currentProductIndex + 1) % total;
    setCurrentProductIndex(nextIdx);
  };

  const getProgress = () => {
    if (aggregatedProducts.length === 0) return 0;
    const total = aggregatedProducts.reduce((s, ap) => s + ap.totalSeparatedQty, 0);
    const done = aggregatedProducts.reduce((s, ap) => s + ap.checkedQty + ap.exceptionQty, 0);
    return total > 0 ? (done / total) * 100 : 0;
  };

  const allItemsComplete = aggregatedProducts.length > 0 && aggregatedProducts.every(ap =>
    ap.checkedQty + ap.exceptionQty >= ap.totalSeparatedQty
  );

  const handleApplyDateFilter = () => {
    setDateRange(tempDateRange);
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden" data-module="conferencia">
      <header className="flex items-center justify-between px-3 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">{user?.name} — Conferente</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVolumeModalOpen(true)}
            className="h-8 px-2 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300"
            title="Gerar Volume"
          >
            <PackageOpen className="h-3.5 w-3.5 mr-1" />
            Volume
          </Button>
          <Button variant="ghost" size="sm" onClick={logout} className="h-8 px-2 text-xs" data-testid="button-logout">
            <LogOut className="h-3.5 w-3.5 mr-1" />
            Sair
          </Button>
        </div>
      </header>

      {step === "select" && (
        <div className="flex-1 flex flex-col min-h-0 px-3 py-3 gap-3 overflow-hidden">
          <div className="space-y-2 p-2.5 bg-muted/30 rounded-lg border border-border shrink-0">
            <div className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                placeholder="N° Pedido (separe múltiplos por vírgula)"
                value={filterOrderId}
                onChange={(e) => setFilterOrderId(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <DatePickerWithRange
                  date={tempDateRange}
                  onDateChange={setTempDateRange}
                  className="text-xs h-8"
                />
              </div>
              <Button size="sm" className="h-8 px-3 text-xs" onClick={handleApplyDateFilter}>
                Buscar
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Select value={filterRoute} onValueChange={(val) => setFilterRoute(val === "__all__" ? "" : val)}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Todas as rotas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as rotas</SelectItem>
                  {routes?.map(route => (
                    <SelectItem key={route.id} value={route.id}>{route.code} - {route.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : groupedWorkUnits.length > 0 ? (
            <>
              <div className="flex-1 overflow-y-scroll border rounded-lg min-h-0 touch-pan-y overscroll-contain">
                <div className="space-y-1.5 p-2">
                  {groupedWorkUnits.map((group) => {
                    const firstWU = group[0];
                    const groupIds = group.map(g => g.id);
                    const isSelected = groupIds.every(id => selectedWorkUnits.includes(id));
                    const lockedByOther = group.some(wu => wu.lockedBy && wu.lockedBy !== user?.id);
                    const lockerName = group.find(wu => wu.lockedBy && wu.lockedBy !== user?.id)?.lockedByName;

                    const distinctProductCount = group.reduce((acc, wu) => {
                      const items = wu.items || [];
                      const productIds = new Set(items.map(item => item.productId));
                      return new Set([...acc, ...productIds]);
                    }, new Set<string>()).size;

                    let createdAt = "";
                    try {
                      createdAt = format(new Date(firstWU.order.launchedAt || firstWU.order.createdAt), "dd/MM HH:mm");
                    } catch { }

                    const routeName = routes?.find(r => r.id === firstWU.order.routeId)?.name;

                    return (
                      <div
                        key={firstWU.orderId}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors ${lockedByOther
                          ? "opacity-50 cursor-not-allowed border-border"
                          : isSelected ? "border-indigo-500 bg-indigo-500/5" : "border-border"
                          }`}
                        onClick={() => !lockedByOther && handleSelectGroup(group, !isSelected)}
                        data-testid={`order-group-${firstWU.orderId}`}
                      >
                        {lockedByOther ? (
                          <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectGroup(group, !!checked)}
                            className="shrink-0"
                            data-testid={`checkbox-order-${firstWU.orderId}`}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-sm font-semibold">{firstWU.order.erpOrderId}</span>
                            {routeName && <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-medium">Rota: {routeName}</span>}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{firstWU.order.customerName}</p>
                          {lockedByOther && (
                            <p className="text-[10px] text-orange-600 font-medium flex items-center gap-1 mt-0.5">
                              <Lock className="h-3 w-3" />
                              Em conferência por: {lockerName || "outro usuário"}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-medium">{distinctProductCount} produtos</p>
                          <p className="text-[10px] text-muted-foreground">{createdAt}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button
                className="w-full h-11 text-sm bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
                onClick={handleStartConferencia}
                disabled={selectedWorkUnits.length === 0 || lockMutation.isPending}
                data-testid="button-start-conferencia"
              >
                <ClipboardCheck className="h-4 w-4 mr-1.5" />
                Conferir
                {selectedWorkUnits.length > 0 && ` (${new Set(
                  workUnits?.filter(wu => selectedWorkUnits.includes(wu.id)).map(wu => wu.orderId)
                ).size})`}
              </Button>
            </>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Nenhum pedido para conferir</p>
              <p className="text-xs">Aguarde a conclusão das separações</p>
            </div>
          )}
        </div>
      )}

      {step === "checking" && (
        <>
          <div className="px-3 pt-2 pb-1 space-y-1.5 border-b border-border bg-card">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground truncate">
                {allMyUnits.map(wu => wu.order.erpOrderId).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
              </span>
            </div>
            <ScanInput
              placeholder="Leia o código de barras..."
              onScan={handleScanItem}
              status={scanStatus}
              statusMessage={scanMessage}
              autoFocus
              className="[&_input]:h-10 [&_input]:text-sm"
            />
          </div>

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {checkingTab === "product" && currentProduct && (
              <div className="flex flex-col h-full min-h-0">
                <div className="flex-1 overflow-y-scroll px-3 py-3 space-y-3 touch-pan-y overscroll-contain">
                  <div className="bg-card border border-border rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {currentProduct.orderCodes.map(code => (
                        <span key={code} className="text-[10px] bg-indigo-500/10 text-indigo-600 px-1.5 py-0.5 rounded font-mono">{code}</span>
                      ))}
                    </div>

                    <p className="text-sm font-medium leading-tight">{currentProduct.product.name}</p>
                    {currentProduct.product.manufacturer && (
                      <p className="text-xs text-muted-foreground mt-0.5">Fabricante: {currentProduct.product.manufacturer}</p>
                    )}

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div>
                        <span className="text-muted-foreground">Código:</span>
                        <span className="ml-1 font-mono font-medium">{currentProduct.product.erpCode}</span>
                      </div>

                      <div>
                        <span className="text-muted-foreground">Cód. Barras:</span>
                        <span className="ml-1 font-mono">{currentProduct.product.barcode || "—"}</span>
                      </div>
                    </div>

                    {addressesMap?.[currentProduct.product.id] && addressesMap[currentProduct.product.id].length > 0 && (
                      <div className="flex items-start gap-1.5 text-xs" data-testid="product-addresses">
                        <MapPin className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                        <div className="flex flex-wrap gap-1">
                          {addressesMap[currentProduct.product.id].map((addr: ProductAddress) => (
                            <span key={addr.code} className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-mono text-[10px]">
                              {addr.code} ({addr.quantity})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <div>
                        <span className="text-xs text-muted-foreground">Conferido</span>
                        <p className="text-lg font-bold">
                          {currentProduct.checkedQty}
                          <span className="text-muted-foreground font-normal text-sm">/{currentProduct.totalQty}</span>
                          {currentProduct.exceptionQty > 0 && (
                            <span className="text-orange-500 text-xs ml-1">(-{currentProduct.exceptionQty} exc)</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasManualQtyPermission && (
                          <>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">Qtd:</span>
                              <Input
                                type="number"
                                min={1}
                                max={currentProduct.totalSeparatedQty - currentProduct.checkedQty - currentProduct.exceptionQty}
                                value={multiplierValue}
                                onChange={(e) => setMultiplierValue(Math.max(1, parseInt(e.target.value) || 1))}
                                onFocus={(e) => e.target.select()}
                                className="h-10 w-20 text-center text-sm font-bold"
                              />
                            </div>
                            <Button
                              size="sm"
                              className="h-10 px-3"
                              onClick={() => handleIncrementProduct(currentProduct, multiplierValue)}
                              disabled={
                                scanItemMutation.isPending ||
                                (currentProduct.checkedQty + currentProduct.exceptionQty >= currentProduct.totalSeparatedQty) ||
                                !currentProduct.product.barcode
                              }
                            >
                              <Plus className="h-5 w-5 mr-1" />
                              Conferir
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                </div>

                <div className="p-3 border-t bg-background mt-auto space-y-2">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 h-9 text-xs"
                      onClick={handleNextProduct}
                    >
                      Próximo
                      <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-9 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={handleCancelChecking}
                      disabled={unlockMutation.isPending}
                      data-testid="button-cancel-checking"
                    >
                      Abandonar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-9 text-xs bg-green-600 hover:bg-green-700"
                      onClick={handleCompleteAll}
                      disabled={!allItemsComplete || completeWorkUnitMutation.isPending}
                      data-testid="button-complete-checking"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Concluir
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {checkingTab === "product" && !currentProduct && aggregatedProducts.length === 0 && (
              <div className="flex-1 flex items-center justify-center p-4 text-muted-foreground text-sm">
                Nenhum produto para conferir
              </div>
            )}

            {checkingTab === "list" && (
              <div className="flex flex-col h-full min-h-0">
                <div className="flex-1 overflow-y-scroll px-3 py-3 space-y-2 touch-pan-y overscroll-contain">
                  {aggregatedProducts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      Nenhum produto encontrado
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {aggregatedProducts.map((ap, idx) => {
                        const remaining = ap.totalSeparatedQty - ap.checkedQty - ap.exceptionQty;
                        const isComplete = remaining <= 0;
                        const hasException = ap.exceptionQty > 0;

                        return (
                          <div
                            key={ap.product.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${isComplete
                              ? hasException
                                ? "bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50"
                                : "bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-900/50"
                              : "border-border hover:bg-muted/50"
                              }`}
                            onClick={() => {
                              setCurrentProductIndex(idx);
                              setCheckingTab("product");
                            }}
                          >
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isComplete
                              ? hasException ? "bg-amber-500 text-white" : "bg-green-500 text-white"
                              : "bg-muted"
                              }`}>
                              {isComplete ? (
                                hasException ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />
                              ) : (
                                <span className="text-[10px] font-medium">{remaining}</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{ap.product.name}</p>
                              {ap.product.manufacturer && (
                                <p className="text-[10px] text-muted-foreground truncate">Fabricante: {ap.product.manufacturer}</p>
                              )}
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                <span className="font-mono">{ap.product.erpCode}</span>
                                <span>•</span>
                                <span className="font-mono">{ap.product.barcode || "—"}</span>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                {ap.orderCodes.map(code => (
                                  <span key={code} className="text-[9px] bg-muted px-1 py-0.5 rounded font-mono">{code}</span>
                                ))}
                              </div>
                              {addressesMap?.[ap.product.id] && addressesMap[ap.product.id].length > 0 && (
                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                  <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
                                  {addressesMap[ap.product.id].map((addr: ProductAddress) => (
                                    <span key={addr.code} className="text-[9px] bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded font-mono">
                                      {addr.code}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-medium">
                                {ap.checkedQty}/{ap.totalQty}
                              </p>
                              {ap.exceptionQty > 0 && (
                                <span className="text-[10px] text-orange-500">-{ap.exceptionQty}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="p-3 border-t bg-background mt-auto">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-9 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={handleCancelChecking}
                      disabled={unlockMutation.isPending}
                    >
                      Abandonar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 h-9 text-xs bg-green-600 hover:bg-green-700"
                      onClick={handleCompleteAll}
                      disabled={!allItemsComplete || completeWorkUnitMutation.isPending}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Concluir
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <nav className="flex border-t border-border bg-card shrink-0">
            <button
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${checkingTab === "product" ? "text-indigo-600 bg-indigo-500/5" : "text-muted-foreground"
                }`}
              onClick={() => setCheckingTab("product")}
            >
              <Package className="h-5 w-5" />
              <span className="text-[10px] font-medium">Produto</span>
            </button>
            <button
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${checkingTab === "list" ? "text-indigo-600 bg-indigo-500/5" : "text-muted-foreground"
                }`}
              onClick={() => setCheckingTab("list")}
            >
              <List className="h-5 w-5" />
              <span className="text-[10px] font-medium">Lista</span>
            </button>
          </nav>
        </>
      )}

      <ResultDialog
        open={showResultDialog}
        onOpenChange={setShowResultDialog}
        type={resultDialogConfig.type}
        title={resultDialogConfig.title}
        message={resultDialogConfig.message}
      />

      {exceptionItem && (
        <ExceptionDialog
          open={showExceptionDialog}
          onOpenChange={setShowExceptionDialog}
          productName={exceptionItem.product.name}
          maxQuantity={Math.max(0, Number(exceptionItem.separatedQty) - Number(exceptionItem.checkedQty) - (exceptionItem.exceptionQty || 0))}
          hasExceptions={(exceptionItem.exceptionQty || 0) > 0}
          onSubmit={(data) => {
            const wu = allMyUnits.find(w => w.items.some(i => i.id === exceptionItem.id));
            if (wu) {
              createExceptionMutation.mutate({
                workUnitId: wu.id,
                orderItemId: exceptionItem.id,
                ...data,
              });
            }
          }}
          onClearExceptions={() => {
            clearExceptionsMutation.mutate(exceptionItem.id);
            setShowExceptionDialog(false);
          }}
          isSubmitting={createExceptionMutation.isPending}
          isClearing={clearExceptionsMutation.isPending}
        />
      )}

      <ExceptionAuthorizationModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        exceptions={pendingExceptions}
        onAuthorized={handleExceptionAuthorized}
      />

      {overQtyContext && (
        <AlertDialog open={overQtyModalOpen} onOpenChange={setOverQtyModalOpen} key={overQtyContext.workUnitId || 'qty-modal'}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
                <AlertTriangle className="h-5 w-5" />
                Quantidade Excedida
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                {overQtyContext.message}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={handleOverQtyRecount}
              >
                Entendi, tentar novamente
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Modal Gerar Volume — acessível em qualquer etapa da conferência */}
      <VolumeModal
        open={volumeModalOpen}
        onClose={() => setVolumeModalOpen(false)}
        defaultErpOrderId={myLockedUnits[0]?.order?.erpOrderId ?? null}
      />

    </div>
  );
}
