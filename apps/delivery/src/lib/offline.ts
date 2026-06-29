import api from './api';
import { useOfflineStore, OfflineTransaction } from '@/store/useOfflineStore';

let syncInterval: NodeJS.Timeout | null = null;

export function initBackgroundSync() {
  if (syncInterval) return; // Ya está corriendo

  syncInterval = setInterval(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    await performSync();
  }, 5000); // Intentar cada 5 segundos
}

async function performSync() {
  const store = useOfflineStore.getState();
  if (store.syncInProgress) return;

  const unsynced = store.getUnsynced();
  if (unsynced.length === 0) return;

  store.setSyncInProgress(true);

  for (const tx of unsynced) {
    try {
      await processTransaction(tx);
      store.markSynced(tx.id);
    } catch (err) {
      console.error(`Error sincronizando ${tx.type}:`, err);
      store.incrementRetry(tx.id);
      
      // Si ha fallado muchas veces, podríamos marcarla como fallida definitiva
      if (tx.retryCount > 10) {
        store.removeFailed(tx.id);
      }
    }
  }

  store.setLastSync(Date.now());
  store.setSyncInProgress(false);
}

async function processTransaction(tx: OfflineTransaction) {
  const { type, data } = tx;

  switch (type) {
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
      console.warn(`Tipo de transacción no soportado: ${type}`);
  }
}

export function stopBackgroundSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
