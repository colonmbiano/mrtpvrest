"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type OfflineTransactionType = "order";

// Tope de reintentos para errores NO de red (datos inválidos, turno cerrado,
// mesa inválida). Sin esto, una comanda mala se reenvía cada 5s para siempre.
export const MAX_SYNC_RETRIES = 5;

// Resumen de presentación de una comanda encolada. NO se envía al backend (eso
// va en `data.body`); existe para que las vistas de lectura (/mesas, /cuenta)
// puedan mostrar lo que el mesero acaba de guardar ANTES de que sincronice, sin
// "perderlo" visualmente. Es el corazón del modo optimista local-first.
export interface OfflineOrderMeta {
  // Mesa a la que pertenece la comanda. Mesa real = cuid (activeTableId);
  // mesa demo = "mesa-N"; pedido para llevar = null.
  tableId: string | null;
  tableName: string | null;
  // orderId si fue una ronda a una cuenta YA existente (/orders/:id/rounds);
  // null si es una comanda nueva (/orders/tpv).
  orderId: string | null;
  itemCount: number;
  total: number;
  items: Array<{ name: string; quantity: number; total: number }>;
}

export interface OfflineTransaction {
  id: string;
  type: OfflineTransactionType;
  data: {
    method: "POST" | "PUT";
    path: string;
    body: Record<string, unknown>;
  };
  meta?: OfflineOrderMeta;
  timestamp: number;
  synced: boolean;
  retryCount: number;
  failedPermanently?: boolean;
  lastError?: string;
}

// Comandas locales que aún NO llegaron al servidor (en cola o reintentando, e
// incluso las fallidas permanentes), para que /mesas y /cuenta no pierdan de
// vista lo recién guardado. `match` filtra por mesa o por cuenta existente.
export function pendingOrdersFor(
  queue: OfflineTransaction[],
  match: { tableId?: string | null; orderId?: string | null },
): OfflineTransaction[] {
  return queue.filter((transaction) => {
    if (transaction.synced || !transaction.meta) return false;
    if (match.orderId && transaction.meta.orderId === match.orderId) return true;
    if (match.tableId && transaction.meta.tableId === match.tableId) return true;
    return false;
  });
}

interface OfflineQueueState {
  queue: OfflineTransaction[];
  syncInProgress: boolean;
  lastSync: number;
  addToQueue: (transaction: Omit<OfflineTransaction, "retryCount">) => void;
  markSynced: (transactionId: string) => void;
  markFailed: (transactionId: string, error: string) => void;
  // Registra un fallo de red transitorio SIN gastar presupuesto de reintentos:
  // la comanda es válida, fue la conexión la que se cayó. Se reintenta intacta.
  noteNetworkRetry: (transactionId: string, error: string) => void;
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
      noteNetworkRetry: (transactionId, error) =>
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
