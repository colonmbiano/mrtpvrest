import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';
import { acknowledgeLocalOrder, projectOrderTransaction, pruneLocalOrders, type LocalOrders } from '@/lib/local-order-model';

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
  /** Metadatos de presentación locales; nunca se envían al backend. */
  localOrder?: Record<string, any>;
  failed?: OfflineFailure;
  scope?: {
    restaurantId?: string;
    locationId?: string;
    employeeId?: string;
    shiftId?: string;
  };
}

interface OfflineState {
  queue: OfflineTransaction[];
  orders: LocalOrders;
  syncInProgress: boolean;
  lastSync: number;
  addToQueue: (transaction: OfflineTransaction) => void;
  markSynced: (transactionId: string, response?: any) => void;
  markFailed: (transactionId: string, failure: OfflineFailure) => void;
  discardTransaction: (transactionId: string, rollback?: boolean) => boolean;
  clearQueue: () => void;
  setSyncInProgress: (inProgress: boolean) => void;
  setLastSync: (timestamp: number) => void;
  getUnsyncedTransactions: () => OfflineTransaction[];
  getFailedTransactions: () => OfflineTransaction[];
}

// Zustand dispara la escritura de persistencia sin esperarla. Serializamos
// todas las escrituras para impedir que un snapshot viejo termine después de
// uno nuevo, y exponemos flushOfflinePersistence para que apiOrQueue NO
// confirme una venta hasta que el outbox ya quedó durable en IndexedDB.
let idbWriteChain: Promise<void> = Promise.resolve();

function enqueueIdbWrite(name: string, value: string): Promise<void> {
  idbWriteChain = idbWriteChain
    .catch(() => undefined)
    .then(() => set(name, value));
  return idbWriteChain;
}

export function flushOfflinePersistence(): Promise<void> {
  return idbWriteChain;
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
  setItem: (name: string, value: string): void => {
    // Zustand no espera esta promesa; el caller crítico la observa mediante
    // flushOfflinePersistence. Evitar un rejection global sin consumir.
    void enqueueIdbWrite(name, value).catch(() => undefined);
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
      orders: {},
      syncInProgress: false,
      lastSync: 0,
      addToQueue: (transaction) =>
        set((state) => ({ queue: [...state.queue, transaction],
          orders: projectOrderTransaction(state.orders, transaction) })),
      // Un ACK del backend ya no aporta nada operativo. Retirarlo evita que
      // el blob de IndexedDB crezca para siempre en una caja de alto volumen.
      markSynced: (transactionId, response) =>
        set((state) => ({
          queue: state.queue.filter((t) => t.id !== transactionId),
          orders: pruneLocalOrders(acknowledgeLocalOrder(state.orders, transactionId, response)),
        })),
      markFailed: (transactionId, failure) =>
        set((state) => ({
          queue: state.queue.map((t) =>
            t.id === transactionId ? { ...t, failed: failure } : t
          ),
        })),
      discardTransaction: (transactionId, rollback = false) => {
        // Borrar un comando de una cuenta local dejaría rondas/pagos
        // huérfanos. Su conciliación debe conservar el registro completo.
        if (!rollback && Object.values(get().orders).some(r => r.pending.includes(transactionId))) return false;
        set((state) => ({
          queue: state.queue.filter((t) => t.id !== transactionId),
        }));
        return true;
      },
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
      partialize: (state) => ({ queue: state.queue, orders: state.orders, lastSync: state.lastSync }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<OfflineState>),
        syncInProgress: false,
      }),
    }
  )
);

export default useOfflineStore;
