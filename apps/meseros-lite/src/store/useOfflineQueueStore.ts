"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type OfflineTransactionType = "order";

// Tope de reintentos para errores NO de red (datos inválidos, turno cerrado,
// mesa inválida). Sin esto, una comanda mala se reenvía cada 5s para siempre.
export const MAX_SYNC_RETRIES = 5;

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
  retryCount: number;
  failedPermanently?: boolean;
  lastError?: string;
}

interface OfflineQueueState {
  queue: OfflineTransaction[];
  syncInProgress: boolean;
  lastSync: number;
  addToQueue: (transaction: Omit<OfflineTransaction, "retryCount">) => void;
  markSynced: (transactionId: string) => void;
  markFailed: (transactionId: string, error: string) => void;
  clearSynced: () => void;
  retryFailed: () => void;
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
        set((state) => ({ queue: [...state.queue, { ...transaction, retryCount: 0 }] })),
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
          queue: state.queue.map((transaction) => {
            if (transaction.id !== transactionId) return transaction;
            const retryCount = transaction.retryCount + 1;
            return {
              ...transaction,
              retryCount,
              lastError: error,
              failedPermanently: retryCount >= MAX_SYNC_RETRIES,
            };
          }),
        })),
      clearSynced: () =>
        set((state) => ({
          queue: state.queue.filter((transaction) => !transaction.synced),
        })),
      retryFailed: () =>
        set((state) => ({
          queue: state.queue.map((transaction) =>
            transaction.failedPermanently
              ? { ...transaction, failedPermanently: false, retryCount: 0, lastError: undefined }
              : transaction,
          ),
        })),
      setSyncInProgress: (syncInProgress) => set({ syncInProgress }),
      setLastSync: (lastSync) => set({ lastSync }),
      // Excluye las marcadas como fallo permanente: no se reintentan en
      // automático, requieren acción manual del mesero (Perfil → Reintentar).
      getUnsyncedTransactions: () =>
        get().queue.filter((transaction) => !transaction.synced && !transaction.failedPermanently),
    }),
    {
      name: "meseros-lite-offline-queue",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
