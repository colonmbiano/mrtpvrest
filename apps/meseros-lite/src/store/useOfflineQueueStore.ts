"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type OfflineTransactionType = "order";

export interface OfflineTransaction {
  id: string;
  type: OfflineTransactionType;
  data: {
    method: "POST" | "PUT";
    path: string;
    body: Record<string, unknown>;
  };
  timestamp: number;
  synced: boolean;
  lastError?: string;
}

interface OfflineQueueState {
  queue: OfflineTransaction[];
  syncInProgress: boolean;
  lastSync: number;
  addToQueue: (transaction: OfflineTransaction) => void;
  markSynced: (transactionId: string) => void;
  markFailed: (transactionId: string, error: string) => void;
  clearSynced: () => void;
  setSyncInProgress: (inProgress: boolean) => void;
  setLastSync: (timestamp: number) => void;
  getUnsyncedTransactions: () => OfflineTransaction[];
}

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      syncInProgress: false,
      lastSync: 0,
      addToQueue: (transaction) =>
        set((state) => ({ queue: [...state.queue, transaction] })),
      markSynced: (transactionId) =>
        set((state) => ({
          queue: state.queue.map((transaction) =>
            transaction.id === transactionId
              ? { ...transaction, synced: true, lastError: undefined }
              : transaction,
          ),
        })),
      markFailed: (transactionId, error) =>
        set((state) => ({
          queue: state.queue.map((transaction) =>
            transaction.id === transactionId
              ? { ...transaction, lastError: error }
              : transaction,
          ),
        })),
      clearSynced: () =>
        set((state) => ({
          queue: state.queue.filter((transaction) => !transaction.synced),
        })),
      setSyncInProgress: (syncInProgress) => set({ syncInProgress }),
      setLastSync: (lastSync) => set({ lastSync }),
      getUnsyncedTransactions: () =>
        get().queue.filter((transaction) => !transaction.synced),
    }),
    {
      name: "meseros-lite-offline-queue",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
