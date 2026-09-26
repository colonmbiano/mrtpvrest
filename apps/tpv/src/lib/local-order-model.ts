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
  return /^\/api\/orders\/([^/]+)\/(?:items|details|discount|payment|split)$/.exec(path)?.[1] ?? null;
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
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function splitOrderLocally(orders: LocalOrders, tx: OfflineTransaction, source: LocalOrderRecord): LocalOrders {
  const selections = tx.data.body?.items as { id: string; quantity: number; newItemId?: string }[] | undefined;
  const sourceItems = Array.isArray(source.order.items) ? source.order.items as Record<string, any>[] : [];
  if (!Array.isArray(selections) || selections.length === 0 || sourceItems.length === 0 ||
      source.order.paymentStatus === 'PAID') {
    throw new Error('La cuenta local no se puede dividir');
  }
  if (selections.some(s => !s || typeof s.id !== 'string')) {
    throw new Error('Los productos seleccionados cambiaron; revisa la cuenta');
  }
  const byId = new Map(selections.map(s => [s.id, s]));
  if (byId.size !== selections.length || selections.some(s =>
    !Number.isSafeInteger(s.quantity) || s.quantity < 1 ||
    !sourceItems.some(item => item.id === s.id && s.quantity <= Number(item.quantity) &&
      (item.weightKg == null || s.quantity === Number(item.quantity))))) {
    throw new Error('Los productos seleccionados cambiaron; revisa la cuenta');
  }
  const remaining: Record<string, any>[] = [];
  const moved: Record<string, any>[] = [];
  for (const item of sourceItems) {
    const selection = byId.get(item.id);
    if (!selection) { remaining.push(item); continue; }
    if (selection.quantity === Number(item.quantity)) { moved.push(item); continue; }
    const movedSubtotal = cents(Number(item.subtotal) * selection.quantity / Number(item.quantity));
    moved.push({ ...item, id: selection.newItemId ?? `local-item-${tx.id}-${moved.length}`,
      quantity: selection.quantity, subtotal: movedSubtotal });
    remaining.push({ ...item, quantity: Number(item.quantity) - selection.quantity,
      subtotal: cents(Number(item.subtotal) - movedSubtotal) });
  }
  if (remaining.length === 0 || moved.length === 0) {
    throw new Error('Deja al menos un producto en la cuenta original');
  }
  const subtotal = (rows: Record<string, any>[]) => cents(rows.reduce((sum, item) => sum + Number(item.subtotal || 0), 0));
  const sourceSubtotal = subtotal(remaining);
  const movedSubtotal = subtotal(moved);
  const originalSubtotal = Number(source.order.subtotal) || sourceSubtotal + movedSubtotal;
  const originalPromo = Number(source.order.promoDiscount || 0);
  const movedPromo = originalSubtotal > 0 ? cents(originalPromo * movedSubtotal / originalSubtotal) : 0;
  const sourcePromo = cents(originalPromo - movedPromo);
  const sourceDiscount = cents(Math.min(Math.max(0, Number(source.order.discount || 0)),
    Math.max(0, sourceSubtotal - sourcePromo)));
  const deliveryFee = Number(source.order.deliveryFee || 0);
  const sourceOrder = { ...source.order, items: remaining, subtotal: sourceSubtotal,
    discount: sourceDiscount, promoDiscount: sourcePromo,
    total: cents(Math.max(0, sourceSubtotal - sourceDiscount - sourcePromo + deliveryFee)), localPending: true };
  const newId = `${LOCAL_ORDER_PREFIX}${tx.id}`;
  const newOrder = { ...source.order, id: newId,
    clientOrderId: tx.id,
    orderNumber: `LOCAL-${tx.id.slice(-6).toUpperCase()}`,
    ticketName: source.order.ticketName ? `${source.order.ticketName} (2)` : null,
    createdAt: new Date(tx.timestamp).toISOString(),
    items: moved, subtotal: movedSubtotal, discount: 0, promoDiscount: movedPromo,
    deliveryFee: 0, total: cents(Math.max(0, movedSubtotal - movedPromo)),
    paymentStatus: 'PENDING', localPending: true };
  const updatedSource: LocalOrderRecord = { ...source, order: sourceOrder,
    pending: [...source.pending, tx.id] };
  const created: LocalOrderRecord = { scope: tx.scope!, localId: newId, order: newOrder,
    pending: [tx.id] };
  return { ...orders,
    [orderRecordKey(tx.scope!, source.localId)]: updatedSource,
    [orderRecordKey(tx.scope!, newId)]: created };
}

/** Proyección local + outbox se persisten en un mismo snapshot IndexedDB. */
export function projectOrderTransaction(orders: LocalOrders, tx: OfflineTransaction): LocalOrders {
  const { path, body = {} } = tx.data;
  if (!tx.scope || typeof path !== 'string') return orders;
  const creating = tx.type === 'order' && tx.data.method === 'POST' && path === '/api/orders/tpv';
  const id = creating ? `${LOCAL_ORDER_PREFIX}${tx.id}` : orderIdFromPath(path);
  if (!id) return orders;
  const existing = findLocalOrder(orders, tx.scope, id);
  if (path.endsWith('/split')) {
    if (!existing) throw new Error('No hay una copia local de esta cuenta para dividir');
    return splitOrderLocally(orders, tx, existing);
  }
  if (!creating && !existing) return orders; // Comando legacy sin detalle cacheado.
  const items = (tx.localOrder?.items ?? body.items ?? []).map((item: any, index: number) => ({
    ...item, id: body.items?.[index]?.clientItemId ?? `local-item-${tx.id}-${index}`,
  }));
  let order: Record<string, any> = creating ? {
    ...body, ...tx.localOrder, id, orderNumber: `LOCAL-${tx.id.slice(-6).toUpperCase()}`,
    createdAt: new Date(tx.timestamp).toISOString(),
    status: body.status ?? 'CONFIRMED', paymentStatus: 'PENDING',
    total: tx.localOrder?.expectedTotal ?? body.total,
    discount: Number(body.discount ?? 0), deliveryFee: Number(body.deliveryFee ?? 0), items,
  } : { ...existing!.order };
  if (creating && !body.paymentMethod && Number.isFinite(Number(tx.localOrder?.expectedTotal))) {
    const subtotal = cents(items.reduce((sum: number, item: any) => sum + Number(item.subtotal || 0), 0));
    const expectedTotal = Number(tx.localOrder!.expectedTotal);
    order.subtotal = subtotal;
    order.promoDiscount = cents(Math.max(0, subtotal - Number(order.discount) +
      Number(order.deliveryFee) - expectedTotal));
  }
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
  if (response?.source?.id && response?.created?.id) {
    const newLocalId = `${LOCAL_ORDER_PREFIX}${txId}`;
    const updated = { ...orders };
    for (const [key, record] of Object.entries(orders)) {
      if (!record.pending.includes(txId)) continue;
      const serverOrder = record.localId === newLocalId ? response.created : response.source;
      const pending = record.pending.filter(id => id !== txId);
      updated[key] = { ...record, serverId: serverOrder.id, pending,
        order: pending.length > 0
          ? { ...record.order, localPending: true }
          : { ...record.order, ...serverOrder, localPending: false } };
    }
    return updated;
  }
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
