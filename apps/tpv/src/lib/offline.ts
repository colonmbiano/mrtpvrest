import useOfflineStore, { type TransactionType } from '@/store/useOfflineStore';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';

let syncInterval: NodeJS.Timeout | null = null;

// ── apiOrQueue ─────────────────────────────────────────────────────────
//
// Wrapper para escrituras críticas que deben sobrevivir a un corte de
// red. Decide en runtime entre:
//   a) llamar al backend (caso normal), o
//   b) encolar la transacción en useOfflineStore y devolver un placeholder
//      optimista para que la UI siga.
//
// La detección de offline cubre 2 escenarios:
//   1. navigator.onLine === false  → directamente a cola.
//   2. la petición arranca pero falla con error de red (ERR_NETWORK,
//      timeout, 5xx que no es de validación) → cola + reportamos OK
//      a la UI para no bloquear al mesero.
//
// Errores de validación (4xx, 401, 403, 409) NO van a cola — esos son
// problemas legítimos que el usuario debe ver y corregir.
export interface ApiOrQueueResult<T = any> {
  ok: boolean;
  queued: boolean;
  data: T | null;
  error?: string;
}

function isNetworkError(err: any): boolean {
  if (!err) return false;
  // Axios marca err.code === 'ERR_NETWORK' cuando no hay respuesta.
  if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true;
  // Sin response = no llegó al server. Con response 5xx = server caído.
  if (!err.response) return true;
  const status = err.response?.status;
  if (typeof status === 'number' && status >= 500) return true;
  return false;
}

export async function apiOrQueue<T = any>(
  type: TransactionType,
  method: 'POST' | 'PUT',
  path: string,
  data: Record<string, any>,
  opts?: { supervisor?: string }
): Promise<ApiOrQueueResult<T>> {
  const store = useOfflineStore.getState();

  // Pre-check: si el navegador YA sabe que está offline, evitamos la
  // request y vamos directo a cola (ahorra timeout en pantalla).
  const isOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isOffline) {
    const tx = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      data: { method, path, body: data },
      timestamp: Date.now(),
      synced: false,
      supervisor: opts?.supervisor,
    };
    store.addToQueue(tx);
    return { ok: true, queued: true, data: null };
  }

  try {
    const res =
      method === 'POST'
        ? await api.post<T>(path, data)
        : await api.put<T>(path, data);
    return { ok: true, queued: false, data: res.data };
  } catch (err: any) {
    if (isNetworkError(err)) {
      const tx = {
        id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        data: { method, path, body: data },
        timestamp: Date.now(),
        synced: false,
        supervisor: opts?.supervisor,
      };
      store.addToQueue(tx);
      return { ok: true, queued: true, data: null };
    }
    // Error legítimo (4xx) — la UI debe mostrarlo.
    return {
      ok: false,
      queued: false,
      data: null,
      error: err?.response?.data?.error || err?.message || 'fallo desconocido',
    };
  }
}

export function initBackgroundSync() {
  if (syncInterval) return; // Already running

  // Sync immediately
  syncOfflineQueue();

  // Set up 5-second interval
  syncInterval = setInterval(() => {
    if (navigator.onLine) {
      syncOfflineQueue();
    }
  }, 5000);

  // Sync when connection returns
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      syncOfflineQueue();
    });
  }
}

export async function syncOfflineQueue() {
  const store = useOfflineStore.getState();
  const authStore = useAuthStore.getState();

  if (store.syncInProgress) return;

  const unsyncedTransactions = store.getUnsyncedTransactions();
  if (unsyncedTransactions.length === 0) return;

  store.setSyncInProgress(true);

  try {
    // Sync employees primero — si volvió la red, refrescamos catálogo
    // de empleados para que PIN offline tenga datos actualizados.
    try {
      const { data: employees } = await api.get('/api/employees/sync');
      if (Array.isArray(employees)) authStore.setEmployees(employees);
    } catch {
      /* no crítico, seguimos con el replay */
    }

    // Replay de cada transacción contra su endpoint original. El
    // beneficio sobre un endpoint genérico de sync: el backend no tiene
    // que conocer "tipos offline" — es el mismo POST /api/orders/tpv
    // que se hubiera hecho online. Idempotencia depende del backend
    // (TODO: cliente debería mandar Idempotency-Key con tx.id).
    for (const transaction of unsyncedTransactions) {
      try {
        const replay = transaction.data as
          | { method?: string; path?: string; body?: Record<string, any> }
          | undefined;

        if (replay && replay.method && replay.path) {
          // Shape nuevo (apiOrQueue) — replay directo con Idempotency-Key
          // para que el backend deduplique si por alguna razón este tx
          // se replay-eara dos veces (sync corre 2x antes de markSynced).
          const cfg = { headers: { 'Idempotency-Key': transaction.id } };
          if (replay.method.toUpperCase() === 'POST') {
            await api.post(replay.path, replay.body || {}, cfg);
          } else if (replay.method.toUpperCase() === 'PUT') {
            await api.put(replay.path, replay.body || {}, cfg);
          } else {
            console.warn(
              `Skipping tx ${transaction.id} — método ${replay.method} no soportado`
            );
            continue;
          }
        } else {
          // Shape legacy (overrides, etc.) — sigue yendo al endpoint de
          // auditoría que registra en accessLog server-side.
          await api.post('/api/sync/transaction', transaction);
        }

        store.markSynced(transaction.id);
      } catch (err) {
        console.error(`Failed to sync transaction ${transaction.id}:`, err);
        // Keep in queue for retry — el próximo tick lo intentará.
      }
    }

    store.setLastSync(Date.now());
  } catch (err) {
    console.error('Background sync error:', err);
  } finally {
    store.setSyncInProgress(false);
  }
}

export function stopBackgroundSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
