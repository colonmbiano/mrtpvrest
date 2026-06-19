import useOfflineStore, { type TransactionType } from '@/store/useOfflineStore';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';

let syncInterval: NodeJS.Timeout | null = null;

// Timeout para escrituras críticas (apiOrQueue) y sus replays. Acota el
// cold-start del backend para que la operación caiga a cola en vez de
// colgar la pantalla. NO se aplica al axios global (api.ts) porque hay
// requests legítimamente largos (reportes/PDF).
const QUEUE_TIMEOUT_MS = 15000;

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
  // Status HTTP del error (cuando ok=false y no se encolo). Permite al caller
  // distinguir un 409 de conflicto (ej. mesa con cuenta abierta) de otros 4xx.
  status?: number;
  // Cuerpo de la respuesta de error tal cual (para leer code/existingOrder en
  // el 409 TABLE_HAS_OPEN_TAB sin re-pegarle al backend).
  conflict?: any;
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

function genTxId(type: TransactionType) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function apiOrQueue<T = any>(
  type: TransactionType,
  method: 'POST' | 'PUT',
  path: string,
  data: Record<string, any>,
  opts?: { supervisor?: string }
): Promise<ApiOrQueueResult<T>> {
  const store = useOfflineStore.getState();

  // Generamos el txId arriba para poder usarlo como clientOrderId al armar
  // el body. Si el server recibe la misma orden 2x (sync corre antes de
  // markSynced), la dedupe DB-level por clientOrderId garantiza no duplicar.
  const txId = genTxId(type);
  const bodyOut =
    type === 'order' && !data.clientOrderId
      ? { ...data, clientOrderId: txId }
      : data;

  // Las creaciones de orden ENCOLADAS (offline, o replay tras un blip de red)
  // se marcan appendToOpenTab: al sincronizar no podemos abrir un dialogo de
  // confirmacion, y la comanda ya se imprimio/intento, asi que mantenemos el
  // comportamiento historico (si la mesa ya tiene cuenta abierta, fusionar la
  // ronda) en vez de que el backend 409-ee el replay y se pierda el pedido.
  // El intento ONLINE original (api.post de abajo) NO lleva el flag: ahi SI
  // queremos el 409 para preguntar antes de encimar.
  const isOrderCreate =
    type === 'order' && method === 'POST' && /\/orders\/tpv$/.test(path);
  const queuedBody = isOrderCreate
    ? { ...bodyOut, appendToOpenTab: true }
    : bodyOut;

  // Pre-check: si el navegador YA sabe que está offline, evitamos la
  // request y vamos directo a cola (ahorra timeout en pantalla).
  const isOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isOffline) {
    const tx = {
      id: txId,
      type,
      data: { method, path, body: queuedBody },
      timestamp: Date.now(),
      synced: false,
      supervisor: opts?.supervisor,
    };
    store.addToQueue(tx);
    return { ok: true, queued: true, data: null };
  }

  try {
    // Mandamos Idempotency-Key=txId también en el intento ONLINE (no solo en
    // el replay offline). Sin esto, un POST que llega bien al server pero cuya
    // respuesta se pierde (blip de red) cae a `isNetworkError` → se encola con
    // el mismo txId → al replay-earse el backend NO lo dedupea (la llamada
    // online original nunca registró la key) → ronda/cobro DUPLICADO. Con la
    // misma key en ambos caminos, el middleware de idempotencia los une.
    // timeout acotado: un backend dormido (cold-start de Railway) que tarda
    // demasiado cae a ECONNABORTED → isNetworkError → cola, en vez de colgar
    // la UI. Si el request lento SÍ llegó al server, la misma Idempotency-Key
    // en el replay garantiza que no se duplique (turno/orden únicos).
    const cfg = { headers: { 'Idempotency-Key': txId }, timeout: QUEUE_TIMEOUT_MS };
    const res =
      method === 'POST'
        ? await api.post<T>(path, bodyOut, cfg)
        : await api.put<T>(path, bodyOut, cfg);
    return { ok: true, queued: false, data: res.data };
  } catch (err: any) {
    if (isNetworkError(err)) {
      const tx = {
        id: txId,
        type,
        data: { method, path, body: queuedBody },
        timestamp: Date.now(),
        synced: false,
        supervisor: opts?.supervisor,
      };
      store.addToQueue(tx);
      return { ok: true, queued: true, data: null };
    }
    // Error legítimo (4xx) — la UI debe mostrarlo. Exponemos status + cuerpo
    // para que el caller pueda manejar el 409 de conflicto (mesa con cuenta
    // abierta) sin volver a pegarle al backend.
    return {
      ok: false,
      queued: false,
      data: null,
      status: err?.response?.status,
      conflict: err?.response?.data,
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
          const cfg = { headers: { 'Idempotency-Key': transaction.id }, timeout: QUEUE_TIMEOUT_MS };
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
