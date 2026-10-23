// Checkout del marketplace sobre la API v1: cotización y orden (plan §5-6). Módulo
// puro: la URL de la API y el fetch se inyectan para probarlo sin red.
// El precio final lo calcula siempre el servidor; el cliente solo envía ids y
// cantidades. La cotización no aplica variantes, modificadores ni combos, así que un
// carrito con esas opciones no puede usar este camino.
import type { CartLine } from './cartStore';

const KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;
const PHONE_RE = /^\+?[0-9 ()-]{7,25}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Fulfillment = 'DELIVERY' | 'PICKUP';
export type PaymentMethod = 'ONLINE' | 'CASH';
export type V1Failure = {
  ok: false;
  reason: 'config' | 'unavailable' | 'rejected' | 'unsupported';
  message: string;
};
export type V1Quote = { quoteId: string; expiresAt: string; total: string };
export type V1Order = { orderId: string; quoteId: string; idempotent: boolean };
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

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function buildQuoteBody(input: {
  merchantId: string;
  lines: CartLine[];
  fulfillment: Fulfillment;
  deliveryAddressId?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    merchantId: input.merchantId,
    fulfillment: input.fulfillment,
    items: input.lines.map(line => ({ menuItemId: line.menuItemId, quantity: line.quantity, modifiers: [] })),
  };
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

async function post(apiUrl: string | null, path: string, body: unknown, key: string, fetchImpl: FetchLike): Promise<{ ok: true; status: number; json: unknown } | V1Failure> {
  if (!apiUrl) return failure('config', 'El pedido no está disponible en este entorno.');
  if (!KEY_RE.test(key)) return failure('rejected', 'Clave de solicitud inválida.');
  let res: Response;
  try {
    res = await fetchImpl(`${apiUrl}${path}`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return failure('unavailable', 'No pudimos conectar. Intenta de nuevo.');
  }
  const json: unknown = await res.json().catch(() => null);
  if (res.status >= 500) return failure('unavailable', 'El servicio no está disponible. Intenta de nuevo.');
  if (!res.ok) {
    const message = json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string'
      ? (json as { error: string }).error : 'La solicitud fue rechazada.';
    return failure('rejected', message);
  }
  return { ok: true, status: res.status, json };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function requestQuote(apiUrl: string | null, body: unknown, key: string, fetchImpl: FetchLike = fetch): Promise<V1Quote | V1Failure> {
  const result = await post(apiUrl, '/api/marketplace/v1/quotes', body, key, fetchImpl);
  if (!result.ok) return result;
  const json = result.json;
  if (!isRecord(json) || typeof json.quoteId !== 'string' || typeof json.total !== 'string' || typeof json.expiresAt !== 'string') {
    return failure('unavailable', 'Respuesta de cotización fuera de contrato.');
  }
  return { quoteId: json.quoteId, expiresAt: json.expiresAt, total: json.total };
}

export async function placeOrder(apiUrl: string | null, body: unknown, key: string, fetchImpl: FetchLike = fetch): Promise<V1Order | V1Failure> {
  const result = await post(apiUrl, '/api/marketplace/v1/orders', body, key, fetchImpl);
  if (!result.ok) return result;
  const json = result.json;
  if (!isRecord(json) || typeof json.orderId !== 'string' || typeof json.quoteId !== 'string') {
    return failure('unavailable', 'Respuesta de orden fuera de contrato.');
  }
  return { orderId: json.orderId, quoteId: json.quoteId, idempotent: json.idempotent === true };
}
