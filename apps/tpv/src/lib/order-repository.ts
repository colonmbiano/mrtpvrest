import api, { AUTH_TOKEN_MISSING, BACKEND_UNAVAILABLE } from '@/lib/api';
import useOfflineStore from '@/store/useOfflineStore';
import { getTenantIds } from '@/lib/tenant';
import { isBackendCircuitOpen } from '@/lib/backend-availability';
import { ACTIVE_ORDER_STATUSES, cacheServerOrder, findLocalOrder, pruneLocalOrders, reconcileLocalOrderQueue, sameOrderScope, type OrderScope } from '@/lib/local-order-model';

/** No aceptar escrituras ni lecturas operativas antes de recuperar IndexedDB. */
export async function waitForOfflineHydration(): Promise<void> {
  if (!useOfflineStore.persist.hasHydrated()) await new Promise<void>((resolve, reject) => {
    const off = useOfflineStore.persist.onFinishHydration(() => { clearTimeout(timer); off(); resolve(); });
    const timer = setTimeout(() => { off(); reject(new Error('No se pudo recuperar el almacenamiento local')); }, 5000);
    if (useOfflineStore.persist.hasHydrated()) { clearTimeout(timer); off(); resolve(); }
  });
  const state = useOfflineStore.getState();
  const orders = reconcileLocalOrderQueue(state.orders, state.queue);
  if (orders !== state.orders) useOfflineStore.setState({ orders });
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
    // Un pedido del marketplace pagado en línea sigue abierto mientras espera que
    // el comercio lo acepte; si no, el TPV nunca se lo mostraría.
    .filter(o => mode === 'paid' ? o.paymentStatus === 'PAID'
      : (o.paymentStatus !== 'PAID' || o.status === 'PENDING_MERCHANT') && ACTIVE_ORDER_STATUSES.has(o.status));
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

/** El cambio de mesa necesita confirmación remota para no ocuparla dos veces. */
export async function reassignOrderTable(orderId: string, fromTableId: string, tableId: string): Promise<any> {
  const scope = getTenantIds();
  await waitForOfflineHydration();
  assertScope(scope);
  const record = findLocalOrder(useOfflineStore.getState().orders, scope, orderId);
  if (record?.pending.length || record?.order.localPending ||
      (!record?.serverId && orderId.startsWith('local-order-'))) {
    throw new Error('Sincroniza los cambios pendientes de esta cuenta antes de cambiarla de mesa');
  }
  const { data } = await api.patch(`/api/orders/${record?.serverId ?? orderId}/table`, { tableId, fromTableId });
  assertScope(scope);
  rememberServerOrder(data, scope);
  return data;
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
      return { orders: pruneLocalOrders(orders) };
    });
    const activeIds = new Set(data.map(o => o.id));
    // La lista está limitada a 200: faltar en ella NO demuestra que la cuenta
    // haya cerrado. Consultar las copias locales ausentes por su id remoto
    // recupera PAID/DELIVERED y evita ocultar una cuenta todavía abierta.
    const staleIds = [...new Set(Object.values(useOfflineStore.getState().orders)
      .filter(r => sameOrderScope(r.scope, scope) && !r.pending.length && r.serverId &&
        ACTIVE_ORDER_STATUSES.has(r.order.status) && !activeIds.has(r.serverId))
      .map(r => r.serverId!))];
    // Acotar concurrencia para no saturar la tablet al reparar datos antiguos.
    for (let offset = 0; offset < staleIds.length; offset += 4) {
      await Promise.all(staleIds.slice(offset, offset + 4).map(async id => {
        try {
          const { data: order } = await api.get(`/api/orders/${id}`, { timeout: 8000 });
          assertScope(scope);
          if (order?.id === id) rememberServerOrder(order, scope);
        } catch (error) {
          assertScope(scope);
          // Sin confirmación conservar la copia, nunca borrar una venta por
          // una caída de red, un error de permisos o una respuesta incompleta.
          if (!localFallbackAllowed(error)) throw error;
        }
      }));
    }
  } catch (error) {
    assertScope(scope);
    if (!localFallbackAllowed(error)) throw error;
  }
  return getLocalOrders();
}
