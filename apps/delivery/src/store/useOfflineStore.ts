import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface OfflineTransaction {
  id: string;
  type: 'CONFIRM_DELIVERY' | 'MARK_ERRAND_DONE' | 'LOG_EXPENSE' | 'CHAT_MESSAGE';
  data: any;
  timestamp: number;
  synced: boolean;
  retryCount: number;
}

interface OfflineState {
  queue: OfflineTransaction[];
  syncInProgress: boolean;
  lastSync: number | null;
  
  addToQueue: (transaction: Omit<OfflineTransaction, 'id' | 'timestamp' | 'synced' | 'retryCount'>) => void;
  markSynced: (id: string) => void;
  removeFailed: (id: string) => void;
  incrementRetry: (id: string) => void;
  setSyncInProgress: (status: boolean) => void;
  setLastSync: (timestamp: number) => void;
  getUnsynced: () => OfflineTransaction[];
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      queue: [],
      syncInProgress: false,
      lastSync: null,

      addToQueue: (tx) => {
        const newTx: OfflineTransaction = {
          ...tx,
          id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          synced: false,
          retryCount: 0,
        };
        set((state) => ({ queue: [...state.queue, newTx] }));
      },

      markSynced: (id) => {
        set((state) => ({
          queue: state.queue.map((tx) =>
            tx.id === id ? { ...tx, synced: true } : tx
          ),
        }));
        // Optional: clear synced items after some time or immediately
        setTimeout(() => {
          set((state) => ({
            queue: state.queue.filter((tx) => tx.id !== id),
          }));
        }, 1000);
      },

      removeFailed: (id) => {
        set((state) => ({
          queue: state.queue.filter((tx) => tx.id !== id),
        }));
      },

      incrementRetry: (id) => {
        set((state) => ({
          queue: state.queue.map((tx) =>
            tx.id === id ? { ...tx, retryCount: tx.retryCount + 1 } : tx
          ),
        }));
      },

      setSyncInProgress: (status) => set({ syncInProgress: status }),
      setLastSync: (timestamp) => set({ lastSync: timestamp }),
      getUnsynced: () => get().queue.filter((tx) => !tx.synced),
    }),
    {
      name: 'delivery-offline-storage',
    }
  )
);
