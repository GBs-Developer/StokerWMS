import { create } from "zustand";

type Namespace = "separacao" | "conferencia" | "balcao";

interface PendingDeltaState {
  separacao: Record<string, number>;
  conferencia: Record<string, number>;
  balcao: Record<string, number>;
  _lastServer: {
    separacao: Record<string, number>;
    conferencia: Record<string, number>;
    balcao: Record<string, number>;
  };
  inc: (ns: Namespace, itemId: string, qty?: number) => void;
  dec: (ns: Namespace, itemId: string, qty?: number) => void;
  get: (ns: Namespace, itemId: string) => number;
  clear: (ns: Namespace) => void;
  clearItem: (ns: Namespace, itemId: string) => void;
  resetBaseline: (ns: Namespace, itemId: string) => void;
  reconcile: (ns: Namespace, serverValues: Record<string, number>) => void;
}

export const usePendingDeltaStore = create<PendingDeltaState>()((set, getState) => ({
  separacao: {},
  conferencia: {},
  balcao: {},
  _lastServer: {
    separacao: {},
    conferencia: {},
    balcao: {},
  },

  inc: (ns, itemId, qty = 1) =>
    set((state) => ({
      [ns]: { ...state[ns], [itemId]: (state[ns][itemId] || 0) + Math.max(0, qty) },
    })),

  dec: (ns, itemId, qty = 1) =>
    set((state) => ({
      [ns]: {
        ...state[ns],
        [itemId]: Math.max(0, (state[ns][itemId] || 0) - Math.max(0, qty)),
      },
    })),

  get: (ns, itemId) => getState()[ns][itemId] || 0,

  clear: (ns) => set({ [ns]: {} }),

  clearItem: (ns, itemId) =>
    set((state) => {
      const { [itemId]: _, ...rest } = state[ns];
      return { [ns]: rest };
    }),

  resetBaseline: (ns, itemId) =>
    set((state) => {
      const { [itemId]: _, ...rest } = state._lastServer[ns];
      return {
        _lastServer: { ...state._lastServer, [ns]: rest },
      };
    }),

  reconcile: (ns, serverValues) =>
    set((state) => {
      const oldServer = state._lastServer[ns];
      const pending = { ...state[ns] };

      for (const itemId of Object.keys(pending)) {
        if (pending[itemId] <= 0) {
          delete pending[itemId];
          continue;
        }
        const newVal = serverValues[itemId] ?? 0;
        const oldVal = oldServer[itemId] ?? newVal;
        const advanced = newVal - oldVal;
        if (advanced > 0) {
          pending[itemId] = Math.max(0, pending[itemId] - advanced);
          if (pending[itemId] === 0) delete pending[itemId];
        } else if (advanced < 0) {
          delete pending[itemId];
        }
      }

      return {
        [ns]: pending,
        _lastServer: { ...state._lastServer, [ns]: { ...serverValues } },
      };
    }),
}));
