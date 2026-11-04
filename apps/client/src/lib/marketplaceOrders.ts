// Mis pedidos del comprador del marketplace (API v1, con el token de la cuenta).
// La lista y los códigos solo existen para una cuenta con sesión: sin token no se
// pide nada y se responde "sin sesión". La URL y el fetch se inyectan para probarlo.
import { getBuyerToken } from './marketplaceAccount';
import { parseTracking, type Fulfillment, type V1Failure, type V1Tracking } from './marketplaceV1Checkout';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type BuyerOrderItem = { menuItemId: string; name: string; quantity: number };
export type BuyerOrder = {
  orderId: string;
  orderNumber: string | null;
  status: string;
  total: string;
  currency: string;
  fulfillment: Fulfillment | null;
  placedAt: string;
  merchant: { name: string; slug: string | null };
  items: BuyerOrderItem[];
};
export type BuyerOrdersPage = { orders: BuyerOrder[]; nextBefore: string | null };
export type OrderCodes = { pickupPin: string; deliveryPin: string };

// Estados reales de la orden (Order.status) tal como los devuelve la API v1.
export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Esperando el pago',
  PENDING_MERCHANT: 'Esperando que la tienda lo acepte',
  CONFIRMED: 'Aceptado por la tienda',
  PREPARING: 'En preparación',
  PACKING: 'Empacando tu pedido',
  READY: 'Listo para recoger',
  ON_THE_WAY: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};
// Ya no cambian: no se consultan ni muestran código.
export const FINAL_ORDER_STATUSES = new Set(['DELIVERED', 'CANCELLED']);

const PIN_RE = /^\d{6}$/;
const MONEY_RE = /^\d+\.\d{2}$/;

function failure(reason: V1Failure['reason'], message: string): V1Failure {
  return { ok: false, reason, message };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseOrder(value: unknown): BuyerOrder | null {
  if (!isRecord(value) || typeof value.orderId !== 'string' || typeof value.status !== 'string'
    || typeof value.total !== 'string' || !MONEY_RE.test(value.total) || typeof value.placedAt !== 'string') return null;
  const merchant = isRecord(value.merchant) ? value.merchant : {};
  const items = Array.isArray(value.items) ? value.items.filter((it): it is BuyerOrderItem => isRecord(it)
    && typeof it.name === 'string' && typeof it.quantity === 'number' && Number.isInteger(it.quantity) && it.quantity > 0
    && typeof it.menuItemId === 'string') : [];
  return {
    orderId: value.orderId,
    orderNumber: typeof value.orderNumber === 'string' ? value.orderNumber : null,
    status: value.status,
    total: value.total,
    currency: typeof value.currency === 'string' ? value.currency : 'MXN',
    fulfillment: value.fulfillment === 'PICKUP' || value.fulfillment === 'DELIVERY' ? value.fulfillment : null,
    placedAt: value.placedAt,
    merchant: { name: typeof merchant.name === 'string' ? merchant.name : '',
      slug: typeof merchant.slug === 'string' && merchant.slug ? merchant.slug : null },
    items: items.map(it => ({ menuItemId: it.menuItemId, name: it.name, quantity: it.quantity })),
  };
}

type Options = { apiUrl: string | null; fetchImpl?: FetchLike };

async function authedGet(path: string, { apiUrl, fetchImpl = fetch }: Options): Promise<{ ok: true; json: unknown } | V1Failure> {
  if (!apiUrl) return failure('config', 'Tus pedidos no están disponibles en este entorno.');
  const token = await getBuyerToken({ apiUrl, fetchImpl });
  if (!token) return failure('rejected', 'Inicia sesión para ver tus pedidos.');
  let res: Response;
  try {
    res = await fetchImpl(`${apiUrl}/api/marketplace/v1${path}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return failure('unavailable', 'No pudimos conectar. Intenta de nuevo.');
  }
  const json: unknown = await res.json().catch(() => null);
  if (res.status >= 500) return failure('unavailable', 'Tus pedidos no están disponibles en este momento. Intenta más tarde.');
  if (!res.ok) return failure('rejected', isRecord(json) && typeof json.error === 'string' ? json.error : 'No pudimos completar la solicitud.');
  return { ok: true, json };
}

export async function listMyOrders(options: Options & { before?: string | null; limit?: number }): Promise<BuyerOrdersPage | V1Failure> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 10) });
  if (options.before) params.set('before', options.before);
  const result = await authedGet(`/orders?${params.toString()}`, options);
  if (!result.ok) return result;
  if (!isRecord(result.json) || !Array.isArray(result.json.orders)) return failure('unavailable', 'Respuesta de pedidos fuera de contrato.');
  return {
    orders: result.json.orders.map(parseOrder).filter((o): o is BuyerOrder => o !== null),
    nextBefore: typeof result.json.nextBefore === 'string' ? result.json.nextBefore : null,
  };
}

// Códigos para recoger o recibir un pedido activo de la cuenta. Solo viven en memoria.
export async function fetchOrderCodes(orderId: string, options: Options): Promise<OrderCodes | V1Failure> {
  const result = await authedGet(`/orders/${encodeURIComponent(orderId)}/codes`, options);
  if (!result.ok) return result;
  const json = result.json;
  if (!isRecord(json) || typeof json.pickupPin !== 'string' || !PIN_RE.test(json.pickupPin)
    || typeof json.deliveryPin !== 'string' || !PIN_RE.test(json.deliveryPin)) return failure('unavailable', 'Respuesta de códigos fuera de contrato.');
  return { pickupPin: json.pickupPin, deliveryPin: json.deliveryPin };
}

// Seguimiento de un pedido de la cuenta, sin el token de rastreo de la orden.
export async function fetchTrackingForAccount(orderId: string, options: Options): Promise<V1Tracking | V1Failure> {
  const result = await authedGet(`/orders/${encodeURIComponent(orderId)}/tracking`, options);
  if (!result.ok) return result.reason === 'rejected' ? failure('rejected', 'No pudimos consultar el seguimiento.') : result;
  return parseTracking(result.json) ?? failure('unavailable', 'Respuesta de seguimiento fuera de contrato.');
}
