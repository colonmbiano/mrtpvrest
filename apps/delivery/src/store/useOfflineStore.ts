import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Local retention limit, not a promise about the server's PIN lifetime.
export const PIN_QUEUE_TTL_MS = 15 * 60_000;
export const MAX_SYNC_RETRIES = 10;

export interface PickupPinData {
  courierId: string;
  taskId: string;
  pickupPin: string;
}

export interface DeliveryPinData {
  courierId: string;
  taskId: string;
  deliveryPin: string;
  paymentMethod: 'CASH' | 'TRANSFER' | 'CARD_ONLINE';
  cashCollected: boolean;
}

type OfflineInput =
  | { type: 'CONFIRM_DELIVERY' | 'MARK_ERRAND_DONE' | 'LOG_EXPENSE' | 'CHAT_MESSAGE'; data: any }
  | { type: 'CONFIRM_PICKUP_PIN'; data: PickupPinData; expiresAt?: number }
  | { type: 'CONFIRM_DELIVERY_PIN'; data: DeliveryPinData; expiresAt?: number };

export type FailureReason = 'EXPIRED' | 'REJECTED' | 'MAX_RETRIES' | 'UNKNOWN_TYPE';
export type OfflineTransaction = OfflineInput & {
  id: string;
  timestamp: number;
  synced: boolean;
  retryCount: number;
  failureReason?: FailureReason;
};

export function isPinTransaction(tx: { type: string }): boolean {
  return tx.type === 'CONFIRM_PICKUP_PIN' || tx.type === 'CONFIRM_DELIVERY_PIN';
}

function failed(tx: OfflineTransaction, failureReason: FailureReason): OfflineTransaction {
  // Keep the failure visible, but discard verification codes immediately.
  return { ...tx, failureReason, data: isPinTransaction(tx)
    ? { courierId: tx.data?.courierId, taskId: tx.data?.taskId } : tx.data } as OfflineTransaction;
}

function validPinData(tx: { type: string; data: any }): boolean {
  const data = tx.data;
  if (!data || typeof data !== 'object' || typeof data.courierId !== 'string' || !data.courierId.trim()
    || typeof data.taskId !== 'string' || !data.taskId.trim()) return false;
  const pin = tx.type === 'CONFIRM_PICKUP_PIN' ? data.pickupPin : data.deliveryPin;
  return typeof pin === 'string' && /^\d{4}$/.test(pin.trim()) && (tx.type !== 'CONFIRM_DELIVERY_PIN'
    || (['CASH', 'TRANSFER', 'CARD_ONLINE'].includes(data.paymentMethod) && typeof data.cashCollected === 'boolean'));
}

interface OfflineState {
  queue: OfflineTransaction[];
  syncInProgress: boolean;
  lastSync: number | null;
  addToQueue: (transaction: OfflineInput) => string;
  markSynced: (id: string) => void;
  markFailed: (id: string, reason: FailureReason) => void;
  removeFailed: (id: string) => void;
  incrementRetry: (id: string) => void;
  expirePending: (now?: number) => void;
  clearPinActions: () => void;
  setSyncInProgress: (status: boolean) => void;
  setLastSync: (timestamp: number) => void;
  getUnsynced: () => OfflineTransaction[];
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      queue: [], syncInProgress: false, lastSync: null,
      addToQueue: (tx) => {
        const now = Date.now();
        if (isPinTransaction(tx)) {
          if (!validPinData(tx)) throw new Error('INVALID_PIN_ACTION');
          const data = tx.data;
          const pin = tx.type === 'CONFIRM_PICKUP_PIN' ? data.pickupPin : data.deliveryPin;
          const expiresAt = 'expiresAt' in tx && tx.expiresAt !== undefined ? tx.expiresAt : now + PIN_QUEUE_TTL_MS;
          if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + PIN_QUEUE_TTL_MS) throw new Error('INVALID_PIN_EXPIRY');
          get().expirePending(now);
          const existing = get().queue.find(item => !item.synced && !item.failureReason && item.type === tx.type
            && item.data.courierId === data.courierId && item.data.taskId === data.taskId);
          if (existing) return existing.id;
          const cleanData = tx.type === 'CONFIRM_PICKUP_PIN'
            ? { courierId: data.courierId, taskId: data.taskId, pickupPin: pin.trim() }
            : { courierId: data.courierId, taskId: data.taskId, deliveryPin: pin.trim(),
              paymentMethod: tx.data.paymentMethod, cashCollected: tx.data.cashCollected };
          tx = { ...tx, data: cleanData, expiresAt } as OfflineInput;
        }
        const id = globalThis.crypto?.randomUUID?.() || `tx-${now}-${Math.random().toString(36).slice(2)}`;
        const newTx = { ...tx, data: { ...tx.data }, id, timestamp: now, synced: false, retryCount: 0 } as OfflineTransaction;
        set(state => ({ queue: [...state.queue, newTx] }));
        return id;
      },
      markSynced: id => set(state => {
        const done = state.queue.find(tx => tx.id === id);
        return { queue: state.queue.filter(tx => tx.id !== id && !(done && isPinTransaction(done)
          && tx.failureReason && tx.type === done.type && tx.data.courierId === done.data.courierId
          && tx.data.taskId === done.data.taskId)) };
      }),
      markFailed: (id, reason) => set(state => ({ queue: state.queue.map(tx => tx.id === id ? failed(tx, reason) : tx) })),
      removeFailed: id => set(state => ({ queue: state.queue.filter(tx => tx.id !== id) })),
      incrementRetry: id => set(state => ({ queue: state.queue.map(tx => {
        if (tx.id !== id) return tx;
        const updated = { ...tx, retryCount: tx.retryCount + 1 };
        return updated.retryCount >= MAX_SYNC_RETRIES ? failed(updated, 'MAX_RETRIES') : updated;
      }) })),
      expirePending: (now = Date.now()) => set(state => ({ queue: state.queue.map(tx =>
        isPinTransaction(tx) && !tx.failureReason && (!('expiresAt' in tx) || !Number.isFinite(tx.expiresAt) || tx.expiresAt! <= now)
          ? failed(tx, 'EXPIRED') : tx) })),
      clearPinActions: () => set(state => ({ queue: state.queue.filter(tx => !isPinTransaction(tx)) })),
      setSyncInProgress: syncInProgress => set({ syncInProgress }),
      setLastSync: lastSync => set({ lastSync }),
      getUnsynced: () => {
        get().expirePending();
        return get().queue.filter(tx => !tx.synced && !tx.failureReason);
      },
    }),
    {
      name: 'delivery-offline-storage',
      version: 1,
      migrate: state => state as OfflineState,
      partialize: ({ queue, lastSync }) => ({ queue, lastSync }),
      merge: (saved, current) => {
        const state = (saved || {}) as Partial<OfflineState>;
        const queue = Array.isArray(state.queue) ? state.queue.filter(tx => tx && typeof tx.id === 'string' && !tx.synced) : [];
        return { ...current, queue: queue.map(tx => {
          if (!isPinTransaction(tx)) return tx;
          if (tx.failureReason) return failed(tx, tx.failureReason);
          if (!validPinData(tx)) return failed(tx, 'REJECTED');
          return !('expiresAt' in tx) || !Number.isFinite(tx.expiresAt) || tx.expiresAt! <= Date.now()
            ? failed(tx, 'EXPIRED') : tx;
        }),
        lastSync: typeof state.lastSync === 'number' ? state.lastSync : null, syncInProgress: false };
      },
      onRehydrateStorage: () => state => state?.expirePending(),
    }
  )
);
