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
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

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
