// Checkout del marketplace sobre la API v1: cotización y orden (plan §5-6). Módulo
// puro: la URL de la API y el fetch se inyectan para probarlo sin red.
// El precio final lo calcula siempre el servidor; el cliente solo envía ids y
// cantidades. La cotización no aplica variantes, modificadores ni combos, así que un
// carrito con esas opciones no puede usar este camino.
import type { CartLine } from './cartStore';
import { getOrCreateGuestId, isGuestId, randomHexId } from './guestIdentity';

const KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;
const PHONE_RE = /^\+?[0-9 ()-]{7,25}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRACKING_TOKEN_RE = /^[a-f0-9]{64}$/;
const PIN_RE = /^\d{6}$/;
const MONEY_RE = /^\d+\.\d{2}$/;

export type Fulfillment = 'DELIVERY' | 'PICKUP';
export type PaymentMethod = 'ONLINE' | 'CASH';
export type V1Failure = {
  ok: false;
  reason: 'config' | 'unavailable' | 'rejected' | 'unsupported';
  message: string;
  // errorCode del servidor en un rechazo (p. ej. QUOTE_EXPIRED), cuando lo manda.
  code?: string;
};
// Desglose opcional de la cotización. Montos como cadenas de dos decimales, tal como los da el servidor.
export type V1Quote = {
  quoteId: string;
  expiresAt: string;
  total: string;
  discount?: string;
  subtotal?: string;
  deliveryFee?: string;
};
export type V1Order = {
  orderId: string;
  quoteId: string;
  idempotent: boolean;
  trackingToken?: string;
  orderNumber?: string;
  // Códigos de seis dígitos. Solo viven en memoria: nunca se persisten.
  // pickupPin lo muestra el comprador en la tienda; deliveryPin se dicta al repartidor.
  fulfillment?: Fulfillment;
  pickupPin?: string;
  deliveryPin?: string;
  // Pago en línea: link de Mercado Pago, o pendiente si el servidor aún no lo generó
  // (se reintenta la orden con la misma clave).
  checkoutUrl?: string;
  checkoutPending?: boolean;
};

const MP_HOST_RE = /^([a-z0-9-]+\.)*mercadopago\.(com|com\.mx|com\.ar|cl|com\.co|com\.br|com\.pe|com\.uy)$/;

// Solo un link https de Mercado Pago sirve como página de pago.
export function isCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && MP_HOST_RE.test(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// Primer motivo por el que el carrito no puede cotizarse en v1; null si todas las líneas son simples.
export function unsupportedReason(lines: CartLine[]): string | null {
  for (const line of lines) {
    if (!line.menuItemId) return `"${line.name}" no tiene identificador de producto`;
    if (line.variantId) return `"${line.name}" tiene variante`;
    if ((line.modifierIds?.length ?? 0) > 0) return `"${line.name}" tiene modificadores`;
    if ((line.comboSelections?.length ?? 0) > 0) return `"${line.name}" es un combo`;
  }
  return null;
}

// 32 caracteres hexadecimales: cumple KEY_RE y no depende de un contexto seguro.
export function newIdempotencyKey(): string {
  return randomHexId(16);
}

export function isDeliveryPin(value: unknown): value is string {
  return typeof value === 'string' && PIN_RE.test(value);
}

export type PinDisplay = { label: string; code: string; instruction: string };

// Código que el comprador debe mostrar según cómo recibe el pedido: recogida usa el pickupPin
// (se muestra en la tienda); entrega usa el deliveryPin (se dicta al repartidor).
export function pinForFulfillment(fulfillment: Fulfillment | null | undefined,
  pins: { pickupPin?: string | null; deliveryPin?: string | null }): PinDisplay | null {
  if (fulfillment === 'PICKUP') {
    return isDeliveryPin(pins.pickupPin)
      ? { label: 'Código de recogida', code: pins.pickupPin, instruction: 'Muéstralo en la tienda para recoger tu pedido.' }
      : null;
  }
  if (fulfillment === 'DELIVERY') {
    return isDeliveryPin(pins.deliveryPin)
      ? { label: 'Código de entrega', code: pins.deliveryPin, instruction: 'Díctaselo al repartidor al recibir tu pedido.' }
      : null;
  }
  return null;
}

// El cotizador acepta merchantId o merchantSlug; se envía uno solo (el id cuando la API lo expone).
// couponCode es opcional: solo viaja si el comprador escribió un cupón.
export function buildQuoteBody(input: {
  merchant: { merchantId: string | null; slug: string };
  lines: CartLine[];
  fulfillment: Fulfillment;
  deliveryAddressId?: string;
  couponCode?: string;
}): Record<string, unknown> {
  const merchant = input.merchant.merchantId
    ? { merchantId: input.merchant.merchantId }
    : { merchantSlug: input.merchant.slug };
  const body: Record<string, unknown> = {
    ...merchant,
    fulfillment: input.fulfillment,
    items: input.lines.map(line => ({ menuItemId: line.menuItemId, quantity: line.quantity, modifiers: [] })),
  };
  const coupon = input.couponCode?.trim();
  if (coupon) body.couponCode = coupon;
  if (input.fulfillment === 'DELIVERY') body.deliveryAddressId = input.deliveryAddressId;
  return body;
}

export function buildOrderBody(input: {
  quoteId: string;
  fulfillment: Fulfillment;
  deliveryAddressId?: string;
  paymentMethod: PaymentMethod;
  customer: { name: string; phone: string; email?: string };
  notes?: string;
}): Record<string, unknown> {
  const customer: Record<string, string> = { name: input.customer.name, phone: input.customer.phone };
  if (input.customer.email) customer.email = input.customer.email;
  const body: Record<string, unknown> = { quoteId: input.quoteId, paymentMethod: input.paymentMethod, customer };
  if (input.fulfillment === 'DELIVERY') body.deliveryAddressId = input.deliveryAddressId;
  if (input.notes) body.notes = input.notes;
  return body;
}

// Validación local mínima. El servidor valida todo de nuevo y es la autoridad.
export function checkCustomer(customer: { name: string; phone: string; email?: string }): string | null {
  if (!customer.name.trim()) return 'Tu nombre es requerido.';
  if (!PHONE_RE.test(customer.phone) || customer.phone.replace(/\D/g, '').length < 7) return 'El teléfono no es válido.';
  if (customer.email && !EMAIL_RE.test(customer.email)) return 'El correo no tiene un formato válido.';
  return null;
}

function failure(reason: V1Failure['reason'], message: string): V1Failure {
  return { ok: false, reason, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rejection(json: unknown): V1Failure {
  const result = failure('rejected', isRecord(json) && typeof json.error === 'string' ? json.error : 'La solicitud fue rechazada.');
  if (isRecord(json) && typeof json.errorCode === 'string') result.code = json.errorCode;
  return result;
}

async function post(apiUrl: string | null, path: string, body: unknown, key: string, fetchImpl: FetchLike, guestId: string): Promise<{ ok: true; status: number; json: unknown } | V1Failure> {
  if (!apiUrl) return failure('config', 'El pedido no está disponible en este entorno.');
  if (!KEY_RE.test(key)) return failure('rejected', 'Clave de solicitud inválida.');
  if (!isGuestId(guestId)) return failure('rejected', 'Identificador de sesión inválido.');
  let res: Response;
  try {
    res = await fetchImpl(`${apiUrl}${path}`, {
      method: 'POST',
      cache: 'no-store',
      // La orden solo acepta X-Buyer-Id (no X-Guest-Id); ambos llevan el mismo id de
      // invitado, así la orden consume la cotización de la misma sesión.
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': key,
        'X-Guest-Id': guestId, 'X-Buyer-Id': guestId },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return failure('unavailable', 'No pudimos conectar. Intenta de nuevo.');
  }
  const json: unknown = await res.json().catch(() => null);
  if (res.status >= 500) return failure('unavailable', 'El servicio no está disponible. Intenta de nuevo.');
  if (!res.ok) return rejection(json);
  return { ok: true, status: res.status, json };
}

// fetchImpl y guestId tienen valor por defecto: la producción usa el identificador del navegador.
export async function requestQuote(apiUrl: string | null, body: unknown, key: string,
  fetchImpl: FetchLike = fetch, guestId: string = getOrCreateGuestId()): Promise<V1Quote | V1Failure> {
  const result = await post(apiUrl, '/api/marketplace/v1/quotes', body, key, fetchImpl, guestId);
  if (!result.ok) return result;
  const json = result.json;
  if (!isRecord(json) || typeof json.quoteId !== 'string' || typeof json.total !== 'string' || typeof json.expiresAt !== 'string') {
    return failure('unavailable', 'Respuesta de cotización fuera de contrato.');
  }
  const quote: V1Quote = { quoteId: json.quoteId, expiresAt: json.expiresAt, total: json.total };
  // El desglose es opcional: un monto fuera de formato se omite en lugar de mostrarse mal.
  for (const field of ['discount', 'subtotal', 'deliveryFee'] as const) {
    const value = json[field];
    if (typeof value === 'string' && MONEY_RE.test(value)) quote[field] = value;
  }
  return quote;
}

export async function placeOrder(apiUrl: string | null, body: unknown, key: string,
  fetchImpl: FetchLike = fetch, guestId: string = getOrCreateGuestId()): Promise<V1Order | V1Failure> {
  const result = await post(apiUrl, '/api/marketplace/v1/orders', body, key, fetchImpl, guestId);
  if (!result.ok) return result;
  const json = result.json;
  if (!isRecord(json) || typeof json.orderId !== 'string' || typeof json.quoteId !== 'string') {
    return failure('unavailable', 'Respuesta de orden fuera de contrato.');
  }
  const order: V1Order = { orderId: json.orderId, quoteId: json.quoteId, idempotent: json.idempotent === true };
  if (typeof json.trackingToken === 'string' && TRACKING_TOKEN_RE.test(json.trackingToken)) order.trackingToken = json.trackingToken;
  if (typeof json.orderNumber === 'number' || typeof json.orderNumber === 'string') order.orderNumber = String(json.orderNumber);
  if (json.fulfillment === 'PICKUP' || json.fulfillment === 'DELIVERY') order.fulfillment = json.fulfillment;
  if (isDeliveryPin(json.pickupPin)) order.pickupPin = json.pickupPin;
  if (isDeliveryPin(json.deliveryPin)) order.deliveryPin = json.deliveryPin;
  if (isRecord(json.checkout)) {
    if (isCheckoutUrl(json.checkout.url)) order.checkoutUrl = json.checkout.url;
    else if (json.checkout.status === 'PENDING') order.checkoutPending = true;
  }
  return order;
}

// Elegibilidad del checkout v1 (recogida o domicilio; ver el comentario del módulo). Devuelve
// el motivo cuando el pedido no puede enviarse por v1: en ese caso no se usa el legacy. Si
// el comercio no entrega a domicilio por el marketplace, lo dice la cotización.
export type CheckoutEligibility =
  | { ok: true; fulfillment: Fulfillment; paymentMethod: PaymentMethod }
  | { ok: false; message: string };

export function checkMarketplaceEligibility(input: {
  orderType: 'DELIVERY' | 'TAKEOUT' | 'DINE_IN';
  paymentMethod: string;
  lines: CartLine[];
}): CheckoutEligibility {
  if (input.orderType === 'DINE_IN') return { ok: false, message: 'Pedidos de mesa no están disponibles en el marketplace.' };
  if (input.paymentMethod !== 'CASH' && input.paymentMethod !== 'ONLINE') {
    return { ok: false, message: 'Este método de pago no está disponible en el marketplace. Usa efectivo o pago en línea.' };
  }
  const reason = unsupportedReason(input.lines);
  if (reason) return { ok: false, message: `Este pedido no puede pagarse en línea: ${reason}.` };
  return { ok: true, fulfillment: input.orderType === 'DELIVERY' ? 'DELIVERY' : 'PICKUP', paymentMethod: input.paymentMethod };
}

// Monto de dos decimales del servidor ("30.00") → centavos; null si no es un monto.
export function moneyCents(value: string | undefined): number | null {
  return typeof value === 'string' && MONEY_RE.test(value) ? Math.round(Number(value) * 100) : null;
}

// ── Libreta de direcciones del comprador (/api/marketplace/v1/addresses) ──────
// Misma identidad que la orden (X-Buyer-Id): la orden lee la dirección por su id.
// Guardar otra vez la misma dirección (texto y punto del mapa) devuelve la existente.
export type V1Address = { id: string; address: string; lat: number; lng: number };

function parseAddress(value: unknown): V1Address | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.address !== 'string'
    || typeof value.lat !== 'number' || !Number.isFinite(value.lat) || typeof value.lng !== 'number' || !Number.isFinite(value.lng)) return null;
  return { id: value.id, address: value.address, lat: value.lat, lng: value.lng };
}

// Validación local mínima de una dirección nueva. El servidor valida todo de nuevo.
export function checkAddress(input: { address: string; coords: { lat: number; lng: number } | null }): string | null {
  const address = input.address.replace(/\s+/g, ' ').trim();
  if (address.length < 5) return 'Escribe la dirección de entrega.';
  if (address.length > 500) return 'La dirección es demasiado larga.';
  if (!input.coords || !Number.isFinite(input.coords.lat) || !Number.isFinite(input.coords.lng)) return 'Marca tu ubicación en el mapa para calcular el envío.';
  return null;
}

async function addressRequest(apiUrl: string | null, path: string, init: RequestInit, fetchImpl: FetchLike,
  guestId: string): Promise<{ ok: true; status: number; json: unknown } | V1Failure> {
  if (!apiUrl) return failure('config', 'Las direcciones no están disponibles en este entorno.');
  if (!isGuestId(guestId)) return failure('rejected', 'Identificador de sesión inválido.');
  let res: Response;
  try {
    res = await fetchImpl(`${apiUrl}/api/marketplace/v1/addresses${path}`, { ...init, cache: 'no-store',
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), 'X-Buyer-Id': guestId },
      signal: AbortSignal.timeout(8000) });
  } catch {
    return failure('unavailable', 'No pudimos conectar. Intenta de nuevo.');
  }
  const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status >= 500) return failure('unavailable', 'Las direcciones no están disponibles. Intenta de nuevo.');
  if (!res.ok) return rejection(json);
  return { ok: true, status: res.status, json };
}

export async function listAddresses(apiUrl: string | null, fetchImpl: FetchLike = fetch,
  guestId: string = getOrCreateGuestId()): Promise<V1Address[] | V1Failure> {
  const result = await addressRequest(apiUrl, '', { method: 'GET' }, fetchImpl, guestId);
  if (!result.ok) return result;
  if (!isRecord(result.json) || !Array.isArray(result.json.addresses)) return failure('unavailable', 'Respuesta de direcciones fuera de contrato.');
  return result.json.addresses.map(parseAddress).filter((a): a is V1Address => a !== null);
}

export async function saveAddress(apiUrl: string | null, input: { address: string; lat: number; lng: number },
  fetchImpl: FetchLike = fetch, guestId: string = getOrCreateGuestId()): Promise<V1Address | V1Failure> {
  const body = JSON.stringify({ address: input.address.replace(/\s+/g, ' ').trim(), lat: input.lat, lng: input.lng });
  const result = await addressRequest(apiUrl, '', { method: 'POST', body }, fetchImpl, guestId);
  if (!result.ok) return result;
  return parseAddress(result.json) ?? failure('unavailable', 'Respuesta de dirección fuera de contrato.');
}

export async function deleteAddress(apiUrl: string | null, id: string, fetchImpl: FetchLike = fetch,
  guestId: string = getOrCreateGuestId()): Promise<true | V1Failure> {
  const result = await addressRequest(apiUrl, `/${encodeURIComponent(id)}`, { method: 'DELETE' }, fetchImpl, guestId);
  return result.ok ? true : result;
}

// Seguimiento v1 de una orden. El token viaja solo en cabecera, nunca en la URL.
export type V1Tracking = { orderId: string; status: string; taskStatus: string | null; isStale: boolean };

export function parseTracking(json: unknown): V1Tracking | null {
  if (!isRecord(json) || typeof json.orderId !== 'string' || typeof json.status !== 'string') return null;
  const taskStatus = typeof json.taskStatus === 'string' ? json.taskStatus : null;
  return { orderId: json.orderId, status: json.status, taskStatus, isStale: json.isStale === true };
}

export async function fetchTracking(apiUrl: string | null, orderId: string, trackingToken: string,
  fetchImpl: FetchLike = fetch, guestId: string = getOrCreateGuestId()): Promise<V1Tracking | V1Failure> {
  if (!apiUrl) return failure('config', 'El seguimiento no está disponible en este entorno.');
  if (!TRACKING_TOKEN_RE.test(trackingToken)) return failure('rejected', 'Token de seguimiento inválido.');
  if (!isGuestId(guestId)) return failure('rejected', 'Identificador de sesión inválido.');
  try {
    const res = await fetchImpl(`${apiUrl}/api/marketplace/v1/orders/${encodeURIComponent(orderId)}/tracking`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-Marketplace-Order-Token': trackingToken, 'X-Guest-Id': guestId },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return failure(res.status >= 500 ? 'unavailable' : 'rejected', 'No pudimos consultar el seguimiento.');
    const tracking = parseTracking(await res.json().catch(() => null));
    return tracking ?? failure('unavailable', 'Respuesta de seguimiento fuera de contrato.');
  } catch {
    return failure('unavailable', 'No pudimos consultar el seguimiento.');
  }
}
