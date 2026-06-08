"use client";

import api from "@/lib/api";
import { useOfflineQueueStore, type OfflineTransactionType } from "@/store/useOfflineQueueStore";

let syncInterval: number | null = null;

export interface ApiOrQueueResult<T = unknown> {
  ok: boolean;
  queued: boolean;
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

function errorMessage(err: unknown) {
  const error = err as { message?: string; response?: { data?: { error?: string } } } | null;
  return error?.response?.data?.error || error?.message || "fallo desconocido";
}

export async function apiOrQueue<T = unknown>(
  type: OfflineTransactionType,
  method: "POST" | "PUT",
  path: string,
  body: Record<string, unknown>,
): Promise<ApiOrQueueResult<T>> {
  const store = useOfflineQueueStore.getState();
  const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;

  // ID estable por transacción: se usa como `clientOrderId` (dedup a nivel DB,
  // sobrevive reinicios del backend y multi-instancia) Y como header
  // `Idempotency-Key`. Crítico: la MISMA clave viaja en el primer intento y en
  // todos los reintentos de la cola, para que un ack perdido no duplique la
  // comanda (server creó la orden, la red se cayó antes de la respuesta).
  const transactionId = makeTransactionId(type);
  const idempotentBody = { clientOrderId: transactionId, ...body };
  const config = { headers: { "Idempotency-Key": transactionId } };

  if (isOffline) {
    store.addToQueue({
      id: transactionId,
      type,
      data: { method, path, body: idempotentBody },
      timestamp: Date.now(),
      synced: false,
    });
    return { ok: true, queued: true, data: null };
  }

  try {
    const response =
      method === "POST"
        ? await api.post<T>(path, idempotentBody, config)
        : await api.put<T>(path, idempotentBody, config);
    return { ok: true, queued: false, data: response.data };
  } catch (err: unknown) {
    if (isNetworkError(err)) {
      store.addToQueue({
        id: transactionId,
        type,
        data: { method, path, body: idempotentBody },
        timestamp: Date.now(),
        synced: false,
        lastError: errorMessage(err),
      });
      return { ok: true, queued: true, data: null };
    }

    return { ok: false, queued: false, data: null, error: errorMessage(err) };
  }
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
