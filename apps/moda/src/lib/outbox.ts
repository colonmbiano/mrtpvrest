// Cola de ventas pendientes de enviar al backend.
//
// Antes, una venta sin conexión se "cobraba" en local con un folio inventado
// ("DEMO-123456") y NUNCA llegaba al servidor: la tienda entregaba mercancía por
// dinero que no existía en ningún corte. Ahora la venta se guarda en disco con
// su llave de idempotencia y se reintenta hasta que el backend la acepta.
//
// Lo que hace segura la reentrega es `clientSaleId`: el backend dedupea por
// (restaurantId, clientSaleId) y devuelve la venta ya creada con
// `idempotent:true`, así que reintentar N veces cobra UNA vez.

import * as Retail from "./retail";
import type { ApiError } from "./api";

const KEY = "moda-pos-outbox";

export interface PendingSale {
  clientSaleId: string;
  payload: Parameters<typeof Retail.createSale>[0];
  total: number;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /** El backend rechazó la venta por regla de negocio (stock, totales). No se
   *  reintenta sola: reintentar un 4xx da 4xx para siempre. Se conserva y se
   *  muestra, porque descartarla en silencio es perder una venta cobrada. */
  rejected?: boolean;
}

function read(): PendingSale[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(list: PendingSale[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* cuota llena: mejor perder el guardado que tirar la caja con una excepción */
  }
}

export function loadOutbox(): PendingSale[] {
  return read();
}

/** Ventas que todavía pueden salir solas (excluye las rechazadas por el backend). */
export function pendingCount(): number {
  return read().filter((s) => !s.rejected).length;
}

export function rejectedCount(): number {
  return read().filter((s) => s.rejected).length;
}

export function enqueue(sale: Omit<PendingSale, "attempts">) {
  const list = read();
  // Idempotente también del lado del cliente: si ya está encolada esa misma
  // llave no se duplica la fila (p. ej. dos reintentos del mismo cobro).
  if (list.some((s) => s.clientSaleId === sale.clientSaleId)) return;
  list.push({ ...sale, attempts: 0 });
  write(list);
}

export function remove(clientSaleId: string) {
  write(read().filter((s) => s.clientSaleId !== clientSaleId));
}

/** ¿El fallo es de red/servidor (reintentable) o del negocio (definitivo)? */
function isTransient(e: unknown): boolean {
  const status = (e as ApiError)?.status;
  // status 0 = no se pudo conectar / timeout (lo pone apiFetch).
  // 5xx = el servidor se cayó; volverá.
  // 408/429 = timeout y rate limit: también pasan.
  return status === 0 || status === undefined || status >= 500 || status === 408 || status === 429;
}

export interface FlushResult {
  sent: number;
  pending: number;
  rejected: number;
}

/**
 * Intenta enviar todo lo pendiente. Se detiene en el primer fallo transitorio:
 * si la red está caída, la segunda venta va a fallar igual y no tiene sentido
 * esperar el timeout de cada una.
 */
export async function flushOutbox(): Promise<FlushResult> {
  const list = read();
  let sent = 0;

  for (const sale of list) {
    if (sale.rejected) continue;
    try {
      await Retail.createSale({ ...sale.payload, clientSaleId: sale.clientSaleId });
      sent++;
      remove(sale.clientSaleId);
    } catch (e) {
      const cur = read();
      const row = cur.find((s) => s.clientSaleId === sale.clientSaleId);
      if (row) {
        row.attempts += 1;
        row.lastError = e instanceof Error ? e.message : String(e);
        if (!isTransient(e)) row.rejected = true;
        write(cur);
      }
      if (isTransient(e)) break; // la red está mal: no seguir golpeando
    }
  }

  return { sent, pending: pendingCount(), rejected: rejectedCount() };
}

export { isTransient };
