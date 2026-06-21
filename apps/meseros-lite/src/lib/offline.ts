"use client";

import api from "@/lib/api";
import { useEmployeeSessionStore } from "@/store/useEmployeeSessionStore";
import {
  useOfflineQueueStore,
  type OfflineOrderMeta,
  type OfflineTransactionType,
} from "@/store/useOfflineQueueStore";

let syncInterval: number | null = null;

export interface ApiOrQueueResult<T = unknown> {
  ok: boolean;
  queued: boolean;
  // Había red al guardar (la comanda se enviará casi de inmediato) o no (queda
  // en cola hasta que vuelva la conexión). Solo afecta el mensaje al mesero.
  online?: boolean;
  data: T | null;
  error?: string;
}

function makeTransactionId(type: OfflineTransactionType) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isNetworkError(err: unknown) {
  const error = err as { code?: string; response?: { status?: number } } | null;
  if (!error) return false;
  if (error.code === "ERR_NETWORK" || error.code === "ECONNABORTED") return true;
  if (!error.response) return true;
  return typeof error.response.status === "number" && error.response.status >= 500;
}

// Sesión vencida (401/403) o token inválido. Distinto de un 4xx de datos: la
// comanda es válida, lo que caducó es la sesión del mesero. No quema su
// presupuesto de reintentos; dispara el cierre de sesión → SessionGate al PIN.
function isAuthError(err: unknown) {
  const error = err as { response?: { status?: number }; message?: string } | null;
  const status = error?.response?.status;
  if (status === 401 || status === 403) return true;
  return (error?.message || "").toLowerCase().includes("token");
}

function errorMessage(err: unknown) {
  const error = err as { message?: string; response?: { data?: { error?: string } } } | null;
  return error?.response?.data?.error || error?.message || "fallo desconocido";
}

// Local-first OPTIMISTA: la comanda se guarda SIEMPRE primero en la cola local
// (respuesta instantánea, cero espera al backend) y el envío real corre en
// segundo plano. Esto da fluidez constante en WiFi saturado y unifica el camino
// online/offline. Las vistas de lectura mergean `meta` para no perder de vista
// lo recién guardado, y los rechazos del servidor afloran de forma diferida
// (OfflineStatus / Perfil / badges en mesa).
export async function apiOrQueue<T = unknown>(
  type: OfflineTransactionType,
  method: "POST" | "PUT",
  path: string,
  body: Record<string, unknown>,
  meta?: OfflineOrderMeta,
): Promise<ApiOrQueueResult<T>> {
  const store = useOfflineQueueStore.getState();

  // ID estable por transacción: se usa como `clientOrderId` (dedup a nivel DB,
  // sobrevive reinicios del backend y multi-instancia) Y como header
  // `Idempotency-Key`. Crítico: la MISMA clave viaja en todos los reintentos de
  // la cola, para que un ack perdido no duplique la comanda (server creó la
  // orden, la red se cayó antes de la respuesta).
  const transactionId = makeTransactionId(type);
  const idempotentBody = { clientOrderId: transactionId, ...body };

  store.addToQueue({
    id: transactionId,
    type,
    data: { method, path, body: idempotentBody },
    meta,
    timestamp: Date.now(),
    synced: false,
  });

  // Si hay red, empujamos YA en segundo plano (sale en ~ms, no esperamos los 5s
  // del intervalo). Sin red, se queda en cola y el listener `online` la dispara.
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (online) void syncOfflineQueue();

  return { ok: true, queued: true, online, data: null };
}

export async function syncOfflineQueue() {
  const store = useOfflineQueueStore.getState();
  if (store.syncInProgress) return;

  const transactions = store.getUnsyncedTransactions();
  if (transactions.length === 0) return;

  store.setSyncInProgress(true);
  try {
    for (const transaction of transactions) {
      try {
        const config = { headers: { "Idempotency-Key": transaction.id } };
        if (transaction.data.method === "POST") {
          await api.post(transaction.data.path, transaction.data.body, config);
        } else {
          await api.put(transaction.data.path, transaction.data.body, config);
        }
        store.markSynced(transaction.id);
      } catch (err: unknown) {
        if (isNetworkError(err)) {
          // La red se cayó a mitad de la pasada: NO es culpa de esta comanda,
          // así que no gastamos su presupuesto de reintentos (si no, 5 cortes
          // de WiFi marcarían una comanda válida como fallo permanente, justo
          // el escenario para el que existe esta app). Cortamos la pasada y la
          // cola se reintenta intacta al volver la conexión (online / 5s).
          store.noteNetworkRetry(transaction.id, errorMessage(err));
          break;
        }
        if (isAuthError(err)) {
          // Sesión vencida: NO es culpa de la comanda (no quemamos su retry
          // budget). Cerramos sesión → SessionGate redirige al PIN; tras re-PIN
          // la cola reintenta con token fresco y la comanda sale sola. Cortamos
          // la pasada: sin token, el resto fallaría igual.
          store.noteNetworkRetry(transaction.id, errorMessage(err));
          useEmployeeSessionStore.getState().logout();
          break;
        }
        // Error real (4xx: datos inválidos, turno cerrado, mesa inválida):
        // esta comanda sí es mala. Cuenta contra MAX_SYNC_RETRIES.
        store.markFailed(transaction.id, errorMessage(err));
      }
    }

    store.setLastSync(Date.now());
    store.clearSynced();
  } finally {
    store.setSyncInProgress(false);
  }
}

export function initBackgroundSync() {
  if (typeof window === "undefined" || syncInterval) return;

  void syncOfflineQueue();
  syncInterval = window.setInterval(() => {
    if (navigator.onLine) void syncOfflineQueue();
  }, 5000);

  window.addEventListener("online", () => {
    void syncOfflineQueue();
  });
}
