import api, { AUTH_TOKEN_MISSING, BACKEND_UNAVAILABLE } from '@/lib/api';
import useOfflineStore from '@/store/useOfflineStore';
import { getTenantIds } from '@/lib/tenant';
import { isBackendCircuitOpen } from '@/lib/backend-availability';
import { ACTIVE_ORDER_STATUSES, cacheServerOrder, findLocalOrder, pruneLocalOrders, sameOrderScope, type OrderScope } from '@/lib/local-order-model';

/** No aceptar escrituras ni lecturas operativas antes de recuperar IndexedDB. */
export async function waitForOfflineHydration(): Promise<void> {
  if (useOfflineStore.persist.hasHydrated()) return;
  await new Promise<void>((resolve, reject) => {
    const off = useOfflineStore.persist.onFinishHydration(() => { clearTimeout(timer); off(); resolve(); });
    const timer = setTimeout(() => { off(); reject(new Error('No se pudo recuperar el almacenamiento local')); }, 5000);
    if (useOfflineStore.persist.hasHydrated()) { clearTimeout(timer); off(); resolve(); }
  });
}

function assertScope(scope: OrderScope) {
  if (!sameOrderScope(scope, getTenantIds())) throw new Error('La sucursal cambió durante la operación');
}
export function getLocalOrder(id: string, scope: OrderScope = getTenantIds()): any | null {
  return findLocalOrder(useOfflineStore.getState().orders, scope, id)?.order ?? null;
}
export function getLocalOrders(mode: 'active' | 'paid' = 'active'): any[] {
  const scope = getTenantIds();
  return Object.values(useOfflineStore.getState().orders)
    .filter(r => sameOrderScope(r.scope, scope))
    .map(r => r.order)
    .filter(o => mode === 'paid' ? o.paymentStatus === 'PAID' : o.paymentStatus !== 'PAID' && ACTIVE_ORDER_STATUSES.has(o.status));
}
export function mergeLocalPaidOrders(tickets: any[]): any[] {
  const merged = new Map(tickets.map(o => [o.id, o]));
  const scope = getTenantIds();
  for (const record of Object.values(useOfflineStore.getState().orders)) {
    if (!sameOrderScope(record.scope, scope) || record.order.paymentStatus !== 'PAID') continue;
    if (record.serverId) merged.delete(record.serverId);
    const o = record.order;
    merged.set(o.id, { ...o, customerName: o.ticketName || o.customerName || 'Público general' });
  }
  return [...merged.values()].sort((a, b) => Date.parse(b.paidAt || b.createdAt || '') - Date.parse(a.paidAt || a.createdAt || ''));
}
export function rememberServerOrder(order: any, scope: OrderScope = getTenantIds()): void {
  useOfflineStore.setState(s => ({ orders: pruneLocalOrders(cacheServerOrder(s.orders, scope, order)) }));
}
function localFallbackAllowed(error: any): boolean {
  return !error?.response || error.response.status >= 500 ||
    error.code === AUTH_TOKEN_MISSING || error.code === BACKEND_UNAVAILABLE;
}

export async function loadOrder(id: string): Promise<any> {
  const scope = getTenantIds();
  await waitForOfflineHydration();
  assertScope(scope);
  const record = findLocalOrder(useOfflineStore.getState().orders, scope, id);
  const local = record?.order;
  if (local && (record.pending.length || isBackendCircuitOpen() || navigator.onLine === false)) return local;
  try {
    const { data } = await api.get(`/api/orders/${record?.serverId ?? id}`);
    assertScope(scope);
    rememberServerOrder(data, scope);
    return getLocalOrder(id, scope) ?? data;
  } catch (error) {
    assertScope(scope);
    if (local && localFallbackAllowed(error)) return local;
    throw error;
  }
}

export async function loadOpenOrders(onCached?: (orders: any[]) => void): Promise<any[]> {
  const scope = getTenantIds();
  await waitForOfflineHydration();
  assertScope(scope);
  onCached?.(getLocalOrders());
  try {
    const { data } = await api.get('/api/orders/admin?scope=active');
    assertScope(scope);
    if (!Array.isArray(data)) throw new Error('Respuesta de cuentas inválida');
    useOfflineStore.setState(s => {
      let orders = s.orders;
      for (const order of data) orders = cacheServerOrder(orders, scope, order);
      const activeIds = new Set(data.map(o => o.id));
      // Una cuenta que desaparece de la lista remota deja de estar abierta,
      // salvo que tenga operaciones locales todavía pendientes de confirmar.
      for (const [key, record] of Object.entries(orders)) {
        if (data.length < 200 && sameOrderScope(record.scope, scope) && !record.pending.length && record.serverId &&
          ACTIVE_ORDER_STATUSES.has(record.order.status) && !activeIds.has(record.serverId)) {
          orders = { ...orders, [key]: { ...record, order: { ...record.order, status: 'CLOSED' } } };
        }
      }
      return { orders: pruneLocalOrders(orders) };
    });
  } catch (error) {
    assertScope(scope);
    if (!localFallbackAllowed(error)) throw error;
  }
  return getLocalOrders();
}
