"use client";

// Cache local-first de "tickets cobrados" (último mes) para la pestaña
// "Cobradas" del drawer de tickets. Patrón stale-while-revalidate igual que el
// catálogo (tpv-catalog-cache) y los cortes (tpv-cortes-cache): al abrir la
// pestaña pintamos al instante lo último que conocemos y luego revalidamos
// contra GET /api/orders/admin?scope=paid.
//
// Guardamos solo una LISTA LIGERA (sin items): el detalle completo se baja
// on-demand al reimprimir (fetchFullOrder por id), así el cache se mantiene
// chico aunque sean cientos de tickets en un mes. localStorage es suficiente
// para este shape compacto; reusamos el mecanismo dominante del TPV.

import { getTenantIds } from "@/lib/tenant";

export interface PaidTicketLite {
  id: string;
  orderNumber: string;
  customerName: string;
  /** Enum crudo del backend (DINE_IN/TAKEOUT/DELIVERY) o null. */
  orderType: string | null;
  total: number;
  /** ISO de cobro; puede ser null en datos viejos previos a la columna. */
  paidAt: string | null;
  createdAt: string | null;
  paymentMethod: string | null;
}

interface CacheShape {
  tickets: PaidTicketLite[];
  ts: number;
}

const PREFIX = "tpv-paid-tickets-";
const WINDOW_DAYS = 31;
const MAX_TICKETS = 1000;

// Llave por tenant+sucursal: cada caja ve solo lo suyo (mismo criterio que
// tpv-cortes-cache). Si el tenant aún no resolvió, una llave "default" evita
// reventar; se sobreescribe en cuanto haya identidad.
function cacheKey(): string {
  try {
    const { restaurantId, locationId } = getTenantIds();
    return `${PREFIX}${restaurantId || "r"}-${locationId || "l"}`;
  } catch {
    return `${PREFIX}default`;
  }
}

function tsOf(t: PaidTicketLite): number {
  const v = Date.parse(t.paidAt || t.createdAt || "");
  return Number.isNaN(v) ? 0 : v;
}

// Descarta lo que cae fuera de la ventana de un mes y ordena por cobro reciente.
// Conserva los que no traen fecha parseable (no deberían existir, pero no los
// perdemos silenciosamente).
function prune(tickets: PaidTicketLite[]): PaidTicketLite[] {
  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return tickets
    .filter((t) => {
      const ts = tsOf(t);
      return ts === 0 || ts >= cutoff;
    })
    .sort((a, b) => tsOf(b) - tsOf(a))
    .slice(0, MAX_TICKETS);
}

export function readPaidTicketsCache(): PaidTicketLite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CacheShape;
    if (!parsed || !Array.isArray(parsed.tickets)) return [];
    return prune(parsed.tickets);
  } catch {
    return [];
  }
}

export function writePaidTicketsCache(tickets: PaidTicketLite[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CacheShape = { tickets: prune(tickets), ts: Date.now() };
    localStorage.setItem(cacheKey(), JSON.stringify(payload));
  } catch {
    // Quota / modo privado: el cache es best-effort, seguimos con la red.
  }
}
