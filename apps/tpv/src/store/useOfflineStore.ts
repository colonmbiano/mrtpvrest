import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type TransactionType = 'order' | 'payment' | 'adjustment' | 'override';

// Estado por operación (FASE 2 · escrituras optimistas):
//   pending → en cola, se reintentará.
//   synced  → confirmada por el backend (== synced:true, se conserva por compat).
//   failed  → agotó reintentos o el backend la rechazó (4xx). Debe ser VISIBLE
//             al cajero (banner) y permitir reintento manual — nunca silenciosa,
//             sobre todo en un cobro.
export type TxStatus = 'pending' | 'synced' | 'failed';

export interface OfflineTransaction {
  id: string;
  type: TransactionType;
  data: Record<string, any>;
  timestamp: number;
  synced: boolean;
  /** Estado granular. Ausente en tx legacy → se trata como 'pending'. */
  status?: TxStatus;
  /** Reintentos ya consumidos (para el backoff). */
  attempts?: number;
  /** Epoch ms a partir del cual se puede reintentar (backoff). 0/ausente = ya. */
  nextRetryAt?: number;
  /** Último error para mostrar en el panel de pendientes. */
  lastError?: string;
  supervisor?: string;
}

export const statusOf = (t: OfflineTransaction): TxStatus =>
  t.synced ? 'synced' : t.status || 'pending';

interface OfflineState {
  queue: OfflineTransaction[];
  syncInProgress: boolean;
  lastSync: number;
  addToQueue: (transaction: OfflineTransaction) => void;
  markSynced: (transactionId: string) => void;
  /** Marca la tx como fallida (visible, ya no se reintenta sola). */
  markFailed: (transactionId: string, error?: string) => void;
  /** Registra un intento fallido transitorio y programa el próximo reintento. */
  scheduleRetry: (transactionId: string, nextRetryAt: number, error?: string) => void;
  /** Reintento manual: vuelve la tx a 'pending' y resetea el backoff. */
  retryTransaction: (transactionId: string) => void;
  clearQueue: () => void;
  /** Quita del historial las tx ya sincronizadas (limpieza opcional). */
  purgeSynced: () => void;
  setSyncInProgress: (inProgress: boolean) => void;
  setLastSync: (timestamp: number) => void;
  /** Tx no sincronizadas (pending + failed) — para el chip de cola. */
  getUnsyncedTransactions: () => OfflineTransaction[];
  /** Solo las pendientes (excluye failed) — lo que el procesador reintenta. */
  getPendingTransactions: () => OfflineTransaction[];
  /** Solo las fallidas — para el banner de "sin confirmar". */
  getFailedTransactions: () => OfflineTransaction[];
}

const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      queue: [],
      syncInProgress: false,
      lastSync: 0,
      addToQueue: (transaction) =>
        set((state) => ({
          queue: [
            ...state.queue,
            {
              status: 'pending' as TxStatus,
              attempts: 0,
              nextRetryAt: 0,
              ...transaction,
            },
          ],
        })),
      markSynced: (transactionId) =>
        set((state) => ({
          queue: state.queue.map((t) =>
            t.id === transactionId
              ? { ...t, synced: true, status: 'synced' as TxStatus }
              : t
          ),
        })),
      markFailed: (transactionId, error) =>
        set((state) => ({
          queue: state.queue.map((t) =>
            t.id === transactionId
              ? { ...t, status: 'failed' as TxStatus, lastError: error }
              : t
          ),
        })),
      scheduleRetry: (transactionId, nextRetryAt, error) =>
        set((state) => ({
          queue: state.queue.map((t) =>
            t.id === transactionId
              ? {
                  ...t,
                  status: 'pending' as TxStatus,
                  attempts: (t.attempts || 0) + 1,
                  nextRetryAt,
                  lastError: error,
                }
              : t
          ),
        })),
      retryTransaction: (transactionId) =>
        set((state) => ({
          queue: state.queue.map((t) =>
            t.id === transactionId
              ? {
                  ...t,
                  status: 'pending' as TxStatus,
                  attempts: 0,
                  nextRetryAt: 0,
                  lastError: undefined,
                }
              : t
          ),
        })),
      clearQueue: () => set({ queue: [] }),
      purgeSynced: () =>
        set((state) => ({ queue: state.queue.filter((t) => !t.synced) })),
      setSyncInProgress: (inProgress) => set({ syncInProgress: inProgress }),
      setLastSync: (timestamp) => set({ lastSync: timestamp }),
      getUnsyncedTransactions: () => get().queue.filter((t) => !t.synced),
      getPendingTransactions: () =>
        get().queue.filter((t) => statusOf(t) === 'pending'),
      getFailedTransactions: () =>
        get().queue.filter((t) => statusOf(t) === 'failed'),
    }),
    {
      name: 'tpv-offline-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export default useOfflineStore;
