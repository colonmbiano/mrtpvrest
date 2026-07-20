import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
  // Replay rechazado con un 4xx que no tiene caso reintentar (ej. la orden ya
  // se cobró y el backend no acepta más ítems). Se congela aquí en vez de
  // reintentarse cada 5s para siempre: un pendiente fantasma permanente
  // entrena al personal a ignorar el chip, y el día que haya una orden real
  // atorada nadie la va a ver. Requiere que alguien la descarte a mano.
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
  // Pendientes REINTENTABLES. Excluye las fallidas a propósito: alimenta al
  // loop de replay y al gate de orden del cierre de turno, y una tx muerta no
  // debe reintentarse ni bloquear el corte para siempre.
  getUnsyncedTransactions: () => OfflineTransaction[];
  getFailedTransactions: () => OfflineTransaction[];
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
      storage: createJSONStorage(() => localStorage),
      // syncInProgress es estado de RUNTIME, no contexto que deba sobrevivir a
      // un reinicio. Persistirlo causaba un deadlock permanente: si la app
      // moría a mitad de un replay (Android mata el WebView cuando quiere),
      // el `true` quedaba escrito en localStorage, se rehidrataba al abrir, y
      // el guard `if (store.syncInProgress) return` de syncOfflineQueue salía
      // temprano PARA SIEMPRE. Nadie lo volvía a poner en false porque eso
      // solo pasa en el finally de un replay que ya nunca arrancaba →
      // la cola se congelaba y el chip decía "Sincronizando" eternamente.
      partialize: (state) => ({ queue: state.queue, lastSync: state.lastSync }),
      // partialize solo controla lo que se ESCRIBE. Los dispositivos que ya
      // traen el `true` envenenado de la versión anterior lo seguirían
      // rehidratando, así que al fusionar lo forzamos a false: el arranque
      // siempre empieza limpio y el equipo se cura solo al actualizar.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<OfflineState>),
        syncInProgress: false,
      }),
    }
  )
);

export default useOfflineStore;
