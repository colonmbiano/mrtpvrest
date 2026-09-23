import useOfflineStore, {
  flushOfflinePersistence,
  type OfflineTransaction,
  type TransactionType,
} from '@/store/useOfflineStore';
import { useAuthStore } from '@/store/authStore';
import api, { AUTH_TOKEN_MISSING, BACKEND_UNAVAILABLE } from '@/lib/api';
import { getToken } from '@/lib/token-vault';
import { getTenantIds } from '@/lib/tenant';
import { ACTIVE_ORDER_STATUSES, findLocalOrder, LOCAL_ORDER_PREFIX, orderIdFromPath, sameOrderScope } from '@/lib/local-order-model';
import { getLocalOrder, rememberServerOrder, waitForOfflineHydration } from '@/lib/order-repository';
import {
  isBackendCircuitOpen,
  markBackendAvailable,
  markBackendUnavailable,
  resetBackendAvailability,
} from '@/lib/backend-availability';

let syncInterval: NodeJS.Timeout | null = null;
let onlineListener: (() => void) | null = null;

// Timeout para escrituras críticas (apiOrQueue) y sus replays. Acota el
// cold-start del backend para que la operación caiga a cola en vez de
// colgar la pantalla. api.ts concede un margen mayor a IA y uploads.
const QUEUE_TIMEOUT_MS = 15000;

// Watchdog del candado de sync. syncHeartbeat se refresca al tomar el candado
// y en CADA vuelta del replay, así que una cola larga (N tx × 15s) nunca
// dispara el watchdog: solo lo hace un PASO individual colgado. Sin esto,
// cualquier await que no resuelva deja syncInProgress en true para siempre y
// la cola offline deja de drenar por completo en ese equipo.
const SYNC_STALE_MS = 60000;
let syncHeartbeat = 0;

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
  if (err.code === AUTH_TOKEN_MISSING) return false;
  if (err.code === BACKEND_UNAVAILABLE) return true;
  // Axios marca err.code === 'ERR_NETWORK' cuando no hay respuesta.
  if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true;
  // Sin response = no llegó al server. Con response 5xx = server caído.
  if (!err.response) return true;
  const status = err.response?.status;
  if (typeof status === 'number' && status >= 500) return true;
  return false;
}

// Veredicto DEFINITIVO del backend sobre un replay: va a responder igual
// dentro de 5 segundos y dentro de 5 días, así que reintentar es ruido.
//   400 → orden cerrada/pagada, payload inválido
//   403 → sin permisos
//   409 → conflicto (mesa con cuenta abierta, dedupe)
//   422 → validación
// Quedan FUERA a propósito, porque el reintento SÍ puede salvarlos:
//   401 → token vencido; el refresh lo arregla
//   404 → ventana de deploy (/current aún no existe en Railway) o un
//         predecesor de la cola que todavía no aterriza (la apertura de
//         turno que crea el /current del cierre)
//   408/429/5xx/red → transitorios
function isPermanentReplayError(err: any): boolean {
  const status = err?.response?.status;
  const code = String(err?.response?.data?.code ?? '');
  const recoverable403 =
    status === 403 &&
    ['NO_ACTIVE_SHIFT', 'SHIFT_REQUIRED', 'TOKEN_EXPIRED'].includes(code);
  return (
    status === 400 ||
    (status === 403 && !recoverable403) ||
    status === 409 ||
    status === 422
  );
}

function genTxId(type: TransactionType) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeTransaction(
  id: string,
  type: TransactionType,
  method: string,
  path: string,
  body: Record<string, any>,
  supervisor?: string,
): OfflineTransaction {
  const { restaurantId, locationId } = getTenantIds();
  const auth = useAuthStore.getState();
  const shiftId = auth.activeShift?.id;
  return {
    id,
    type,
    data: { method, path, body },
    timestamp: Date.now(),
    synced: false,
    supervisor,
    scope: {
      restaurantId: restaurantId ?? undefined,
      locationId: locationId ?? undefined,
      employeeId: auth.employee?.id,
      shiftId: typeof shiftId === 'string' ? shiftId : undefined,
    },
  };
}

async function enqueueDurably(transaction: OfflineTransaction): Promise<boolean> {
  const store = useOfflineStore.getState();
  const previousOrders = store.orders;
  try {
    store.addToQueue(transaction);
    await flushOfflinePersistence();
    return true;
  } catch (error) {
    // No confirmamos una venta que solo existe en RAM. La dejamos fuera para
    // que el caller mantenga el ticket visible y pueda volver a intentar.
    store.discardTransaction(transaction.id, true);
    useOfflineStore.setState(s => ({ orders: Object.fromEntries(
      Object.entries(s.orders).flatMap(([key, record]) => record.pending.includes(transaction.id)
        ? (previousOrders[key] ? [[key, previousOrders[key]]] : []) : [[key, record]]),
    ) }));
    console.error('No se pudo persistir el outbox offline:', error);
    return false;
  }
}

function transactionMatchesCurrentScope(transaction: OfflineTransaction): boolean {
  if (!transaction.scope) return true; // compatibilidad con cola legacy
  const { restaurantId, locationId } = getTenantIds();
  const employeeId = useAuthStore.getState().employee?.id;
  const scope = transaction.scope;
  return (
    !!scope.restaurantId && scope.restaurantId === restaurantId &&
    !!scope.locationId && scope.locationId === locationId &&
    !!scope.employeeId && scope.employeeId === employeeId
  );
}

async function queueResult<T>(
  transaction: OfflineTransaction,
): Promise<ApiOrQueueResult<T>> {
  const localTarget = orderIdFromPath(transaction.data.path ?? '');
  const record = localTarget ? findLocalOrder(useOfflineStore.getState().orders, transaction.scope ?? {}, localTarget) : undefined;
  const expectedTotal = transaction.type === 'payment' ? record?.order.total
    : transaction.data.path === '/api/orders/tpv' ? transaction.localOrder?.expectedTotal : undefined;
  if (expectedTotal != null) {
    transaction.data = { ...transaction.data, body: { ...transaction.data.body, expectedTotal: Number(expectedTotal) } };
  }
  if (transaction.localOrder && transaction.data.path === '/api/orders/tpv' && transaction.data.body?.tableId) {
    const existing = Object.values(useOfflineStore.getState().orders).find(r =>
      sameOrderScope(r.scope, transaction.scope ?? {}) && r.order.tableId === transaction.data.body.tableId &&
      r.order.paymentStatus !== 'PAID' && ACTIVE_ORDER_STATUSES.has(r.order.status));
    if (existing) return { ok: false, queued: false, data: null, status: 409,
      error: 'Esta mesa ya tiene una cuenta en el dispositivo',
      conflict: { code: 'TABLE_HAS_OPEN_TAB', existingOrder: existing.order } };
  }
  const persisted = await enqueueDurably(transaction);
  return persisted
    ? { ok: true, queued: true, data: (getLocalOrder(
        transaction.data.path === '/api/orders/tpv' ? `${LOCAL_ORDER_PREFIX}${transaction.id}`
          : orderIdFromPath(transaction.data.path) ?? '', transaction.scope,
      ) as T | null) }
    : {
        ok: false,
        queued: false,
        data: null,
        error: 'No se pudo guardar la operación en este dispositivo',
      };
}

export async function apiOrQueue<T = any>(
  type: TransactionType,
  method: 'POST' | 'PUT',
  path: string,
  data: Record<string, any>,
  opts?: { supervisor?: string; localOrder?: Record<string, any> }
): Promise<ApiOrQueueResult<T>> {
  try { await waitForOfflineHydration(); } catch (error: any) {
    return { ok: false, queued: false, data: null, error: error.message };
  }
  const auth = useAuthStore.getState();
  const tenant = getTenantIds();
  if (!auth.isAuthenticated || !auth.employee?.id) {
    return { ok: false, queued: false, data: null, status: 401,
      error: 'Ingresa tu PIN antes de registrar la operación' };
  }
  if (!tenant.restaurantId || !tenant.locationId) {
    return { ok: false, queued: false, data: null, status: 400,
      error: 'Selecciona la sucursal antes de registrar la operación' };
  }
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
  const isPaidOrderCreate =
    isOrderCreate &&
    Boolean(data.paymentMethod || (Array.isArray(data.payments) && data.payments.length)) &&
    ['DELIVERED', 'COMPLETED', 'PAID'].includes(
      String(data.status ?? '').toUpperCase(),
    );
  // Una orden YA COBRADA nunca se fusiona silenciosamente con una cuenta que
  // el dispositivo no conocía: el importe podría cubrir solo la venta local y
  // no toda la mesa. Ese 409 queda visible para conciliación en vez de perder
  // el pago dentro de addRoundHandler.
  const queuedBody = isOrderCreate && !isPaidOrderCreate && !opts?.localOrder
    ? { ...bodyOut, appendToOpenTab: true }
    : bodyOut;
  // Capturar identidad ANTES del await: un cambio de empleado durante un
  // timeout no debe atribuir la venta al usuario que entró después.
  const transaction = makeTransaction(txId, type, method, path, queuedBody, opts?.supervisor);
  transaction.localOrder = opts?.localOrder;
  const targetId = orderIdFromPath(path);
  const targetRecord = targetId ? findLocalOrder(useOfflineStore.getState().orders, transaction.scope ?? {}, targetId) : undefined;
  if (targetId?.startsWith(LOCAL_ORDER_PREFIX) && !targetRecord) {
    return { ok: false, queued: false, data: null, error: 'No se encontró la cuenta local en esta sucursal' };
  }
  if (targetRecord?.order.paymentStatus === 'PAID') {
    return { ok: false, queued: false, data: null, status: 409, error: 'Esta cuenta ya fue cobrada en el dispositivo' };
  }
  const resolvedPath = targetRecord?.serverId && targetId
    ? path.replace(`/orders/${targetId}/`, `/orders/${targetRecord.serverId}/`) : path;

  // navigator.onLine solo conoce el Wi-Fi, no si Railway responde. Después
  // del primer timeout/5xx el circuito evita pagar otros 15s por operación.
  const shouldQueueImmediately =
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    isBackendCircuitOpen() || (targetRecord?.pending.length ?? 0) > 0 ||
    useOfflineStore.getState().queue.some(tx => !tx.synced);

  if (shouldQueueImmediately) {
    return queueResult<T>(transaction);
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
        ? await api.post<T>(resolvedPath, bodyOut, cfg)
        : await api.put<T>(resolvedPath, bodyOut, cfg);
    markBackendAvailable();
    if (isOrderCreate || targetId) rememberServerOrder(res.data, transaction.scope);
    return { ok: true, queued: false, data: res.data };
  } catch (err: any) {
    if (err?.code === AUTH_TOKEN_MISSING || isNetworkError(err)) {
      if (err?.code !== AUTH_TOKEN_MISSING) markBackendUnavailable();
      return queueResult<T>(transaction);
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

// Acción de turno (cerrar / gasto / ingreso) vía cola con fallback de
// despliegue. Apunta al endpoint nuevo /api/shifts/current/<suffix> que
// resuelve el turno abierto por sucursal — clave porque un turno abierto
// offline no tiene id de servidor. Si el backend aún no expone /current
// (404: ventana en que Vercel ya sirve el front nuevo pero Railway no, o
// APK viejo) y conocemos el id del turno, reintentamos contra /:id/<suffix>.
export async function shiftActionQueued<T = any>(
  type: 'shift-close' | 'shift-expense' | 'shift-cashin',
  suffix: 'close' | 'expenses' | 'cash-ins',
  body: Record<string, any>,
  knownShiftId?: string | null
): Promise<ApiOrQueueResult<T>> {
  const res = await apiOrQueue<T>(type, 'POST', `/api/shifts/current/${suffix}`, body);
  if (!res.ok && res.status === 404 && knownShiftId) {
    return apiOrQueue<T>(type, 'POST', `/api/shifts/${knownShiftId}/${suffix}`, body);
  }
  return res;
}

export function initBackgroundSync() {
  if (syncInterval) return; // Already running

  // Sync immediately
  void syncOfflineQueue();

  // Set up 5-second interval
  syncInterval = setInterval(() => {
    if (navigator.onLine) {
      void syncOfflineQueue();
    }
  }, 5000);

  // Sync when connection returns
  if (typeof window !== 'undefined') {
    onlineListener = () => {
      resetBackendAvailability();
      void syncOfflineQueue({ force: true });
    };
    window.addEventListener('online', onlineListener);
  }
}

export async function syncOfflineQueue(opts?: { force?: boolean }) {
  try { await waitForOfflineHydration(); } catch { return; }
  const store = useOfflineStore.getState();
  const authStore = useAuthStore.getState();

  if (!authStore.isAuthenticated || !authStore.employee?.id) return;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (!opts?.force && isBackendCircuitOpen()) return;
  if (opts?.force) resetBackendAvailability();

  if (store.syncInProgress) {
    // Candado viejo. El flag ya no sobrevive a un reinicio (partialize+merge
    // en el store), así que si está en true lo puso ESTE proceso — y
    // syncHeartbeat dice cuándo dio señales de vida por última vez. Si un
    // paso se colgó más que SYNC_STALE_MS, damos el candado por muerto y
    // tomamos el relevo: quedarse bloqueado para siempre es peor que un
    // replay concurrente (el Idempotency-Key lo dedupea en el backend).
    const stuckMs = Date.now() - syncHeartbeat;
    if (stuckMs < SYNC_STALE_MS) return;
    console.warn(
      `Sync sin latido hace ${Math.round(stuckMs / 1000)}s — retomando el candado`
    );
  }

  const unsyncedTransactions = store
    .getUnsyncedTransactions()
    .sort((a, b) => a.timestamp - b.timestamp);
  if (unsyncedTransactions.length === 0) return;

  // Una operación rechazada puede ser predecesora de las siguientes. Pausar
  // todo el replay es conservador, pero evita cobrar/cerrar una orden cuya
  // ronda anterior no aterrizó. El drawer permite revisarla y descartarla.
  if (store.getFailedTransactions().length > 0) return;

  // Una sesión PIN local es válida para vender, pero no para atribuir replays
  // al servidor. Sin JWT dejamos la cola intacta hasta reautenticación.
  if (!(await getToken())) return;

  store.setSyncInProgress(true);
  syncHeartbeat = Date.now();

  try {
    // Sync employees primero — si volvió la red, refrescamos catálogo
    // de empleados para que PIN offline tenga datos actualizados.
    // timeout OBLIGATORIO: el axios global no trae uno (api.ts hace
    // axios.create() pelón = espera infinita) y esta es la PRIMERA await
    // después de tomar el candado. Un backend que acepta la conexión pero
    // nunca responde (cold start, portal cautivo del wifi del local) colgaba
    // aquí con syncInProgress en true y congelaba la cola entera.
    try {
      const { data: employees } = await api.get('/api/employees/sync', {
        timeout: QUEUE_TIMEOUT_MS,
      });
      markBackendAvailable();
      if (Array.isArray(employees)) authStore.setEmployees(employees);
    } catch (err: any) {
      if (isNetworkError(err)) {
        markBackendUnavailable();
        return;
      }
      if (err?.code === AUTH_TOKEN_MISSING || err?.response?.status === 401) {
        return;
      }
      // Un error funcional de refresco de empleados no impide replayear la
      // venta con el JWT vigente.
    }

    // Replay de cada transacción contra su endpoint original. El
    // beneficio sobre un endpoint genérico de sync: el backend no tiene
    // que conocer "tipos offline" — es el mismo POST /api/orders/tpv
    // que se hubiera hecho online. Idempotencia depende del backend
    // (TODO: cliente debería mandar Idempotency-Key con tx.id).
    for (const transaction of unsyncedTransactions) {
      // Latido: avisa al watchdog que el pase sigue avanzando. Va aquí y no
      // fuera del loop para que una cola larga no se auto-desbloquee.
      syncHeartbeat = Date.now();
      try {
        if (!transactionMatchesCurrentScope(transaction)) {
          console.warn(
            `Tx ${transaction.id} pertenece a otro restaurante, sucursal o empleado; replay pausado`,
          );
          break;
        }

        // Gate de orden para el CIERRE de turno: el corte se calcula en el
        // servidor leyendo las órdenes ya en la BD. Si todavía hay cualquier
        // tx más vieja sin sincronizar (órdenes, gastos, ingresos, apertura),
        // el corte saldría incompleto → posponemos el cierre al próximo tick.
        // FIFO ya encola el cierre al final; esto cubre un predecesor que falló.
        if (transaction.type === 'shift-close') {
          // Lectura VIVA del store: la lista capturada arriba no refleja los
          // markSynced de este mismo pase (guarda referencias viejas).
          const hasOlderPending = store
            .getUnsyncedTransactions()
            .some((t) => t.id !== transaction.id && t.timestamp < transaction.timestamp);
          if (hasOlderPending) continue; // reintenta el próximo tick
        }

        const replay = transaction.data as
          | { method?: string; path?: string; body?: Record<string, any> }
          | undefined;

        let replayResponse: any;
        if (replay && replay.method && replay.path) {
          // Shape nuevo (apiOrQueue) — replay directo con Idempotency-Key
          // para que el backend deduplique si por alguna razón este tx
          // se replay-eara dos veces (sync corre 2x antes de markSynced).
          const cfg = { headers: { 'Idempotency-Key': transaction.id }, timeout: QUEUE_TIMEOUT_MS };
          const localId = orderIdFromPath(replay.path);
          const record = localId ? findLocalOrder(useOfflineStore.getState().orders, transaction.scope ?? {}, localId) : undefined;
          if (localId?.startsWith(LOCAL_ORDER_PREFIX) && !record?.serverId) {
            throw new Error('La cuenta local aún no tiene confirmación del servidor');
          }
          const replayPath = localId && record?.serverId
            ? replay.path.replace(`/orders/${localId}/`, `/orders/${record.serverId}/`) : replay.path;
          if (replay.method.toUpperCase() === 'POST') {
            replayResponse = (await api.post(replayPath, replay.body || {}, cfg)).data;
          } else if (replay.method.toUpperCase() === 'PUT') {
            replayResponse = (await api.put(replayPath, replay.body || {}, cfg)).data;
          } else {
            console.warn(
              `Skipping tx ${transaction.id} — método ${replay.method} no soportado`
            );
            continue;
          }
        } else {
          // Shape legacy (overrides, etc.) — sigue yendo al endpoint de
          // auditoría que registra en accessLog server-side. Mismo timeout
          // que el replay moderno: era la ÚNICA llamada HTTP del loop sin
          // cfg, y el axios global no trae timeout propio (espera infinita).
          await api.post('/api/sync/transaction', transaction, {
            timeout: QUEUE_TIMEOUT_MS,
          });
        }

        markBackendAvailable();
        if (transaction.localOrder && replay?.path === '/api/orders/tpv' && !replayResponse?.id) {
          throw new Error('El servidor no confirmó el identificador de la cuenta');
        }
        store.markSynced(transaction.id, replayResponse);
        // El alias local → servidor y el ACK deben sobrevivir ANTES de
        // enviar una ronda/pago que dependa del identificador recién creado.
        await flushOfflinePersistence();
      } catch (err: any) {
        if (isPermanentReplayError(err)) {
          // El backend ya dictaminó: reintentar no la va a salvar. La
          // congelamos con el motivo para que la UI lo muestre y alguien
          // decida (típicamente: descartarla tras verificar el ticket).
          const failure = {
            status: err?.response?.status as number,
            error:
              err?.response?.data?.error ||
              err?.message ||
              'Rechazada por el servidor',
            at: Date.now(),
          };
          console.error(
            `Tx ${transaction.id} rechazada (${failure.status}): ${failure.error}`
          );
          store.markFailed(transaction.id, failure);
          break;
        } else {
          console.error(`Failed to sync transaction ${transaction.id}:`, err);
          if (isNetworkError(err)) markBackendUnavailable();
          // FIFO estricto: si falla un predecesor no adelantamos una ronda,
          // pago o cierre posterior. El próximo tick parte de este mismo tx.
          break;
        }
      }
    }

    if (
      store.getUnsyncedTransactions().length === 0 &&
      store.getFailedTransactions().length === 0
    ) {
      store.setLastSync(Date.now());
    }
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
  if (typeof window !== 'undefined' && onlineListener) {
    window.removeEventListener('online', onlineListener);
    onlineListener = null;
  }
}
