import type { OfflineTransaction } from '@/store/useOfflineStore';
import type { CartItem } from '@/store/ticketStore';
import { comboPartsFromCartItem } from '@/lib/modifiers';

export type OrderScope = { restaurantId?: string | null; locationId?: string | null };
export type LocalOrderRecord = {
  scope: OrderScope;
  localId: string;
  serverId?: string;
  order: Record<string, any>;
  pending: string[];
};
export type LocalOrders = Record<string, LocalOrderRecord>;
export const LOCAL_ORDER_PREFIX = 'local-order-';
export const ACTIVE_ORDER_STATUSES = new Set(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PACKING', 'OPEN', 'ON_THE_WAY']);

export function sameOrderScope(a: OrderScope, b: OrderScope): boolean {
  return !!a.restaurantId && !!a.locationId && a.restaurantId === b.restaurantId && a.locationId === b.locationId;
}
export function orderRecordKey(scope: OrderScope, id: string): string {
  return JSON.stringify([scope.restaurantId, scope.locationId, id]);
}
export function findLocalOrder(orders: LocalOrders, scope: OrderScope, id: string): LocalOrderRecord | undefined {
  return Object.values(orders).find(r => sameOrderScope(r.scope, scope) &&
    (r.localId === id || r.serverId === id || r.order.id === id));
}
export function orderIdFromPath(path: string): string | null {
  return /^\/api\/orders\/([^/]+)\/(?:items|details|discount|payment)$/.exec(path)?.[1] ?? null;
}
export function localItemsFromCart(items: CartItem[]): Record<string, any>[] {
  return items.map(item => ({
    ...item,
    menuItem: { ...item, id: item.menuItemId, name: item.name },
    comboSelections: comboPartsFromCartItem(item),
    // IDs del carrito no son IDs de líneas del servidor. Evitar que una
    // edición posterior confunda una línea local con una línea remota.
    id: undefined,
  }));
}
const cents = (n: number) => Math.round(n * 100) / 100;

/** Proyección local + outbox se persisten en un mismo snapshot IndexedDB. */
export function projectOrderTransaction(orders: LocalOrders, tx: OfflineTransaction): LocalOrders {
  const { path, body = {} } = tx.data;
  if (!tx.scope || typeof path !== 'string') return orders;
  const creating = tx.type === 'order' && tx.data.method === 'POST' && path === '/api/orders/tpv';
  const id = creating ? `${LOCAL_ORDER_PREFIX}${tx.id}` : orderIdFromPath(path);
  if (!id) return orders;
  const existing = findLocalOrder(orders, tx.scope, id);
  if (!creating && !existing) return orders; // Comando legacy sin detalle cacheado.
  const items = (tx.localOrder?.items ?? body.items ?? []).map((item: any, index: number) => ({
    ...item, id: `local-item-${tx.id}-${index}`,
  }));
  let order: Record<string, any> = creating ? {
    ...body, ...tx.localOrder, id, orderNumber: `LOCAL-${tx.id.slice(-6).toUpperCase()}`,
    createdAt: new Date(tx.timestamp).toISOString(),
    status: body.status ?? 'CONFIRMED', paymentStatus: 'PENDING',
    total: tx.localOrder?.expectedTotal ?? body.total,
    discount: Number(body.discount ?? 0), deliveryFee: Number(body.deliveryFee ?? 0), items,
  } : { ...existing!.order };
  if (creating && body.paymentMethod && ['DELIVERED', 'COMPLETED', 'PAID'].includes(body.status)) {
    order.paymentStatus = 'PAID';
    order.paidAt = new Date(tx.timestamp).toISOString();
  }
  if (path.endsWith('/items')) {
    order.items = [...(order.items ?? []), ...items];
    order.subtotal = cents(order.items.reduce((sum: number, i: any) => sum + Number(i.subtotal ?? Number(i.price) * Number(i.quantity)), 0));
    order.total = cents(order.subtotal - Number(order.discount ?? 0) - Number(order.promoDiscount ?? 0) + Number(order.deliveryFee ?? 0));
  } else if (path.endsWith('/details')) {
    order = { ...order, ...body };
  } else if (path.endsWith('/discount')) {
    order.discount = cents(body.type === 'percent' ? Number(order.subtotal) * Number(body.value) / 100 : Number(body.value));
    order.total = cents(Number(order.subtotal) - order.discount - Number(order.promoDiscount ?? 0) + Number(order.deliveryFee ?? 0));
  } else if (path.endsWith('/payment')) {
    order = { ...order, paymentStatus: 'PAID', status: 'DELIVERED',
      paymentMethod: body.payments ? 'MIXED' : body.paymentMethod,
      paidAt: new Date(tx.timestamp).toISOString(), tip: Number(body.tip ?? 0) };
  }
  order.localPending = true;
  if (tx.localOrder && (!Number.isFinite(Number(order.total)) ||
    items.some((item: any) => !Number.isFinite(Number(item.subtotal))))) {
    throw new Error('La cuenta local no tiene importes completos');
  }
  const record: LocalOrderRecord = {
    scope: tx.scope, localId: existing?.localId ?? id,
    serverId: existing ? existing.serverId : (creating ? undefined : id),
    order, pending: [...(existing?.pending ?? []), tx.id],
  };
  return { ...orders, [orderRecordKey(tx.scope, record.localId)]: record };
}

export function acknowledgeLocalOrder(orders: LocalOrders, txId: string, response?: any): LocalOrders {
  const entry = Object.entries(orders).find(([, r]) => r.pending.includes(txId));
  if (!entry) return orders;
  const [key, record] = entry;
  const pending = record.pending.filter(id => id !== txId);
  const serverId = typeof response?.id === 'string' ? response.id : record.serverId;
  // Un ACK de la creación no debe borrar rondas o pagos aún pendientes.
  const order = pending.length > 0 ? record.order : {
    ...record.order, ...(response ?? {}),
    items: Array.isArray(response?.items) ? response.items : record.order.items,
  };
  return { ...orders, [key]: { ...record, serverId, pending,
    order: { ...order, id: serverId ?? record.localId, localPending: pending.length > 0 } } };
}

export function cacheServerOrder(orders: LocalOrders, scope: OrderScope, order: any): LocalOrders {
  if (!order?.id || !scope.restaurantId || !scope.locationId) return orders;
  const existing = findLocalOrder(orders, scope, order.id);
  if (existing?.pending.length) return orders;
  const localId = existing?.localId ?? order.id;
  return { ...orders, [orderRecordKey(scope, localId)]: {
    scope, localId, serverId: order.id, pending: [],
    order: { ...existing?.order, ...order,
      items: Array.isArray(order.items) ? order.items.map((item: any) => ({
        ...existing?.order.items?.find((old: any) => old.id === item.id), ...item,
      })) : existing?.order.items,
      localPending: false },
  } };
}

/** Limita SOLO copias de cuentas cerradas ya confirmadas; nunca outbox ni abiertas. */
export function pruneLocalOrders(orders: LocalOrders): LocalOrders {
  const closed = Object.entries(orders).filter(([, r]) => !r.pending.length &&
    (r.order.paymentStatus === 'PAID' || !ACTIVE_ORDER_STATUSES.has(r.order.status)))
    .sort(([, a], [, b]) => Date.parse(b.order.paidAt || b.order.createdAt || '') - Date.parse(a.order.paidAt || a.order.createdAt || ''));
  if (closed.length <= 1000) return orders;
  const expiredKeys = new Set(closed.slice(1000).map(([key]) => key));
  return Object.fromEntries(Object.entries(orders).filter(([key]) => !expiredKeys.has(key)));
}
