import useOfflineStore, { type TransactionType } from '@/store/useOfflineStore';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';

let syncInterval: NodeJS.Timeout | null = null;

// Backoff para reintentos transitorios (red caída / 5xx). Exponencial con
// tope; tras MAX_ATTEMPTS la tx pasa a `failed` y se vuelve VISIBLE al cajero.
const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60000;

// ── apiOrQueue ─────────────────────────────────────────────────────────
//
// Wrapper para escrituras críticas que deben sobrevivir a un corte de
// red. Tiene dos modos:
//
//   · Por defecto (bloqueante): cuando hay red, llama al backend y espera
//     la respuesta (devuelve `data`). Errores de red → cola. 4xx → error a
//     la UI. Es el modo histórico, lo usan llamadores que necesitan el id
//     real de la orden de inmediato (p.ej. meseros).
//
//   · `opts.optimistic` (FASE 2): NO bloquea con red. Encola la operación y
//     devuelve YA con estado optimista; el procesador la sincroniza en
//     background. La idempotencia (clientOrderId en el body de la orden y la
//     llave en el header Idempotency-Key) garantiza que un reintento no
//     duplique ni doble-cobre. Lo usan los flujos de "guardar a mesa" y
//     "cobrar" para que la UI avance al instante.
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
  /** Id de la transacción en cola (sirve como Idempotency-Key). */
  txId?: string;
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

function errMsg(err: any): string {
  return err?.response?.data?.error || err?.message || 'fallo desconocido';
}

function genTxId(type: TransactionType) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function apiOrQueue<T = any>(
  type: TransactionType,
  method: 'POST' | 'PUT',
  path: string,
  data: Record<string, any>,
  opts?: { supervisor?: string; optimistic?: boolean }
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

  const enqueue = () => {
    store.addToQueue({
      id: txId,
      type,
      data: { method, path, body: bodyOut },
      timestamp: Date.now(),
      synced: false,
      supervisor: opts?.supervisor,
    });
  };

  // FASE 2 · MODO OPTIMISTA — encolar y devolver de inmediato. El procesador
  // sincroniza en background; la idempotencia evita duplicados/doble cobro.
  if (opts?.optimistic) {
    enqueue();
    kickSync();
    return { ok: true, queued: true, data: null, txId };
  }

  // Pre-check: si el navegador YA sabe que está offline, evitamos la
  // request y vamos directo a cola (ahorra timeout en pantalla).
  const isOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isOffline) {
    enqueue();
    return { ok: true, queued: true, data: null, txId };
  }

  try {
    const res =
      method === 'POST'
        ? await api.post<T>(path, bodyOut)
        : await api.put<T>(path, bodyOut);
    return { ok: true, queued: false, data: res.data, txId };
  } catch (err: any) {
    if (isNetworkError(err)) {
      enqueue();
      return { ok: true, queued: true, data: null, txId };
    }
    // Error legítimo (4xx) — la UI debe mostrarlo.
    return {
      ok: false,
      queued: false,
      data: null,
      error: errMsg(err),
    };
  }
}

// Dispara el procesador en background sin bloquear el render que originó la
// acción. No-op si el navegador está offline (el listener `online` lo
// retomará). Usado tras cada encolado optimista.
export function kickSync() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  queueMicrotask(() => {
    void syncOfflineQueue();
  });
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

// Clave de orden de una tx: agrupa las operaciones que pertenecen a la misma
// orden para respetar su orden relativo (la ronda debe sincronizar ANTES que
// el pago) y para cascada de fallos (no cobrar una orden cuya ronda se perdió).
//
// SOLO la ronda (/items|/rounds) y el pago (/payment) entran en la cadena
// ordenada. Operaciones de metadatos best-effort (p.ej. /details con el nombre
// del cliente) quedan INDEPENDIENTES (`tx:`) para que su fallo nunca bloquee ni
// haga fallar un cobro.
function orderKeyOf(tx: { id: string; data?: any }): string {
  const path: string = tx?.data?.path || '';
  if (path === '/api/orders/tpv') {
    const cid = tx?.data?.body?.clientOrderId;
    return cid ? `new:${cid}` : `tx:${tx.id}`;
  }
  const m = path.match(/^\/api\/orders\/([^/]+)\/(items|rounds|payment)$/);
  if (m) return `ord:${m[1]}`;
  return `tx:${tx.id}`;
}

export async function syncOfflineQueue() {
  const store = useOfflineStore.getState();
  const authStore = useAuthStore.getState();

  if (store.syncInProgress) return;

  const pending = store.getPendingTransactions();
  if (pending.length === 0) return;

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

    const now = Date.now();
    // orderKeys con una op no resuelta en este pass → las posteriores de la
    // misma orden esperan (preserva el orden ronda→pago).
    const blocked = new Set<string>();
    // orderKeys con una op fallida permanente → las posteriores se marcan
    // failed en cascada (no aplicar un cobro si su ronda se perdió).
    const deadFailed = new Set<string>();

    // Recorremos en orden FIFO (getPendingTransactions conserva el orden de
    // inserción). Idempotencia por Idempotency-Key = tx.id para que el backend
    // deduplique si este tx se replay-eara dos veces.
    for (const transaction of pending) {
      const key = orderKeyOf(transaction);

      if (deadFailed.has(key)) {
        store.markFailed(
          transaction.id,
          'Una operación previa de esta orden falló — revisar',
        );
        continue;
      }
      // Op anterior de la misma orden aún pendiente/en backoff este pass.
      if (blocked.has(key)) continue;
      // Backoff: todavía no toca reintentar; bloquea la orden, sigue con otras.
      if ((transaction.nextRetryAt || 0) > now) {
        blocked.add(key);
        continue;
      }

      try {
        const replay = transaction.data as
          | { method?: string; path?: string; body?: Record<string, any> }
          | undefined;

        if (replay && replay.method && replay.path) {
          // Shape nuevo (apiOrQueue) — replay directo con Idempotency-Key.
          const cfg = { headers: { 'Idempotency-Key': transaction.id } };
          if (replay.method.toUpperCase() === 'POST') {
            await api.post(replay.path, replay.body || {}, cfg);
          } else if (replay.method.toUpperCase() === 'PUT') {
            await api.put(replay.path, replay.body || {}, cfg);
          } else {
            console.warn(
              `Skipping tx ${transaction.id} — método ${replay.method} no soportado`
            );
            store.markFailed(transaction.id, `Método ${replay.method} no soportado`);
            deadFailed.add(key);
            continue;
          }
        } else {
          // Shape legacy (overrides, etc.) — endpoint de auditoría server-side.
          await api.post('/api/sync/transaction', transaction);
        }

        store.markSynced(transaction.id);
      } catch (err) {
        if (isNetworkError(err)) {
          // Fallo transitorio → backoff. Bloquea las siguientes ops de la
          // misma orden hasta que ESTA pase.
          const attempts = (transaction.attempts || 0) + 1;
          if (attempts >= MAX_ATTEMPTS) {
            store.markFailed(transaction.id, errMsg(err));
            deadFailed.add(key);
          } else {
            const delay = Math.min(
              MAX_BACKOFF_MS,
              BASE_BACKOFF_MS * 2 ** (transaction.attempts || 0),
            );
            store.scheduleRetry(transaction.id, Date.now() + delay, errMsg(err));
            blocked.add(key);
          }
        } else {
          // 4xx legítimo (validación/permiso) — reintentar no sirve. Failed
          // VISIBLE + cascada para no aplicar el resto de la cadena.
          console.error(`Tx ${transaction.id} rechazada por el backend:`, err);
          store.markFailed(transaction.id, errMsg(err));
          deadFailed.add(key);
        }
      }
    }

    // Limpieza: las tx ya confirmadas no se vuelven a tocar y solo inflan el
    // localStorage (se observaron 20+ acumuladas por unas pocas ventas). El
    // chip ya las ignora (cuenta unsynced), pero las purgamos para no crecer
    // sin límite. La dedupe vive DB-side (Idempotency-Key), así que es seguro.
    store.purgeSynced();
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
