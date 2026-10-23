import api from './api';
import { useOfflineStore, OfflineTransaction, isPinTransaction } from '@/store/useOfflineStore';

let syncInterval: NodeJS.Timeout | null = null;

export function initBackgroundSync() {
  if (syncInterval) return; // Ya está corriendo

  syncInterval = setInterval(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    await performSync();
  }, 5000); // Intentar cada 5 segundos
}

export async function performSync() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const store = useOfflineStore.getState();
  if (store.syncInProgress) return;

  const unsynced = store.getUnsynced();
  if (unsynced.length === 0) return;

  store.setSyncInProgress(true);

  try {
    for (const tx of unsynced) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;
      // Re-read before replay: logout, expiry or a preceding action may have removed it.
      const current = store.getUnsynced().find(item => item.id === tx.id);
      if (!current) continue;
      if (tx.type === 'CONFIRM_DELIVERY_PIN' && useOfflineStore.getState().queue.some(item => item.type === 'CONFIRM_PICKUP_PIN'
        && item.data.courierId === tx.data.courierId && item.data.taskId === tx.data.taskId && !item.synced)) continue;
      try {
        await processTransaction(current);
        store.markSynced(tx.id);
      } catch (err) {
        // Never log Axios errors here: their request config contains the PIN.
        const status = (err as any)?.response?.status;
        if ((err as Error)?.message === 'UNKNOWN_TRANSACTION_TYPE') store.markFailed(tx.id, 'UNKNOWN_TYPE');
        else if (isPinTransaction(tx) && status >= 400 && status < 500 && ![408, 429].includes(status)) store.markFailed(tx.id, 'REJECTED');
        else store.incrementRetry(tx.id);
      }
    }
    store.setLastSync(Date.now());
  } finally {
    store.setSyncInProgress(false);
  }
}

async function processTransaction(tx: OfflineTransaction) {
  const { type, data } = tx;

  switch (type) {
    case 'CONFIRM_PICKUP_PIN':
    case 'CONFIRM_DELIVERY_PIN': {
      const phase = type === 'CONFIRM_PICKUP_PIN' ? 'pickup' : 'deliver';
      const result = await api.post(`/api/marketplace/dispatch/couriers/tasks/${encodeURIComponent(data.taskId)}/${phase}`,
        data, { headers: { 'Idempotency-Key': tx.id } });
      if (result.data?.ok !== true && result.data?.success !== true) throw new Error('PIN_NOT_CONFIRMED');
      return result;
    }
    case 'CONFIRM_DELIVERY':
      // DEBE ser el mismo endpoint que la entrega online: este dispara
      // ensureCashOnDeliveryMovement() (crea el INCOME del corte) y pone
      // status=DELIVERED respetando el paymentMethod. /confirm-cash NO hace
      // nada de eso —marcaba el ticket pagado pero dejaba la venta fuera del
      // corte del repartidor, descuadrándolo por debajo.
      return api.put(`/api/delivery/${data.driverId}/orders/${data.orderId}/status`, data);

    case 'LOG_EXPENSE':
      // El gasto se registra como movimiento del repartidor (mismo endpoint que
      // la ruta online). /api/driver-cash/expenses no existe → daba 404 y el
      // gasto offline se perdía. Reenvía la Idempotency-Key para que un replay
      // (el reintento cada 5s) no duplique el gasto/la deuda.
      return api.post(`/api/driver-cash/${data.driverId}/movements`, data,
        data.movementId ? { headers: { 'Idempotency-Key': data.movementId } } : undefined);

    case 'MARK_ERRAND_DONE':
      return api.put(`/api/delivery/errands/${data.id}/done`, data);

    case 'CHAT_MESSAGE':
      return api.post(`/api/delivery/orders/${data.orderId}/messages`, data);

    default:
      throw new Error('UNKNOWN_TRANSACTION_TYPE');
  }
}

export function stopBackgroundSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
