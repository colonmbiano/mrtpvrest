import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';

export type TransactionType =
  | 'order'
  | 'payment'
  | 'adjustment'
  | 'override'
  | 'shift'
  | 'shift-close'
  | 'shift-expense'
  | 'shift-cashin';

// Veredicto definitivo del backend sobre un replay (4xx no reintentable).
export interface OfflineFailure {
  status: number;
  error: string;
  at: number;
}

export interface OfflineTransaction {
  id: string;
  type: TransactionType;
  data: Record<string, any>;
  timestamp: number;
  synced: boolean;
  supervisor?: string;
  failed?: OfflineFailure;
}

interface OfflineState {
  queue: OfflineTransaction[];
  syncInProgress: boolean;
  lastSync: number;
  addToQueue: (transaction: OfflineTransaction) => void;
  markSynced: (transactionId: string) => void;
  markFailed: (transactionId: string, failure: OfflineFailure) => void;
  discardTransaction: (transactionId: string) => void;
  clearQueue: () => void;
  setSyncInProgress: (inProgress: boolean) => void;
  setLastSync: (timestamp: number) => void;
  getUnsyncedTransactions: () => OfflineTransaction[];
  getFailedTransactions: () => OfflineTransaction[];
}

const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const idbValue = (await get<string>(name)) || null;

    // Hasta la migración a IndexedDB, Zustand persistía esta cola bajo la
    // misma llave en localStorage. Recuperamos ese estado una sola vez y lo
    // fusionamos con IndexedDB para cubrir también terminales que ya alcanzaron
    // a crear un estado nuevo antes de recibir este fix.
    if (typeof window === 'undefined') return idbValue;

    let legacyValue: string | null = null;
    try {
      legacyValue = window.localStorage.getItem(name);
    } catch {
      return idbValue;
    }
    if (!legacyValue) return idbValue;

    const merged = mergeOfflinePersistedStates(idbValue, legacyValue);
    if (!merged) return idbValue;

    await set(name, merged);
    try {
      window.localStorage.removeItem(name);
    } catch {
      // IndexedDB ya contiene la copia; dejar la llave legacy no bloquea uso.
    }
    return merged;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

type PersistedOfflineSnapshot = {
  state?: {
    queue?: OfflineTransaction[];
    lastSync?: number;
    [key: string]: unknown;
  };
  version?: number;
};

/** Fusiona el snapshot nuevo con el legacy sin duplicar transacciones. */
export function mergeOfflinePersistedStates(
  idbValue: string | null,
  legacyValue: string | null,
): string | null {
  const parse = (raw: string | null): PersistedOfflineSnapshot | null => {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as PersistedOfflineSnapshot;
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  };

  const current = parse(idbValue);
  const legacy = parse(legacyValue);
  if (!legacy) return idbValue;
  if (!current) return legacyValue;

  const transactions = new Map<string, OfflineTransaction>();
  for (const tx of legacy.state?.queue ?? []) transactions.set(tx.id, tx);
  // El snapshot de IndexedDB es más reciente y prevalece si ya conocía la tx.
  for (const tx of current.state?.queue ?? []) transactions.set(tx.id, tx);

  const queue = Array.from(transactions.values()).sort(
    (a, b) => a.timestamp - b.timestamp,
  );
  const lastSync = Math.max(
    Number(legacy.state?.lastSync ?? 0),
    Number(current.state?.lastSync ?? 0),
  );

  return JSON.stringify({
    ...legacy,
    ...current,
    state: {
      ...(legacy.state ?? {}),
      ...(current.state ?? {}),
      queue,
      lastSync,
    },
  });
}

const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      queue: [],
      syncInProgress: false,
      lastSync: 0,
      addToQueue: (transaction) =>
        set((state) => ({ queue: [...state.queue, transaction] })),
      markSynced: (transactionId) =>
        set((state) => ({
          queue: state.queue.map((t) =>
            t.id === transactionId ? { ...t, synced: true } : t
          ),
        })),
      markFailed: (transactionId, failure) =>
        set((state) => ({
          queue: state.queue.map((t) =>
            t.id === transactionId ? { ...t, failed: failure } : t
          ),
        })),
      discardTransaction: (transactionId) =>
        set((state) => ({
          queue: state.queue.filter((t) => t.id !== transactionId),
        })),
      clearQueue: () => set({ queue: [] }),
      setSyncInProgress: (inProgress) => set({ syncInProgress: inProgress }),
      setLastSync: (timestamp) => set({ lastSync: timestamp }),
      getUnsyncedTransactions: () => {
        return get().queue.filter((t) => !t.synced && !t.failed);
      },
      getFailedTransactions: () => {
        return get().queue.filter((t) => !t.synced && !!t.failed);
      },
    }),
    {
      name: 'tpv-offline-store',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({ queue: state.queue, lastSync: state.lastSync }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<OfflineState>),
        syncInProgress: false,
      }),
    }
  )
);

export default useOfflineStore;
