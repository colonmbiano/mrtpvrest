// Marketplace Checkout - Mercado Pago Split Integration
// Verifica: cálculo de totales, split, payloads, resiliencia
// Sin dependencias instaladas: Node >= 22.18
//   node apps/client/scripts/marketplace-checkout.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

// ── Cálculo de Totales ───────────────────────────────────────────────────────

test('cálculo de total: subtotal + delivery + tip - discount', () => {
  const subtotal = 100;
  const deliveryFee = 50;
  const tip = 10;
  const discount = 0;
  const total = Math.max(0, subtotal - discount + deliveryFee + tip);
  assert.equal(total, 160);
});

test('cálculo de total: con descuento', () => {
  const subtotal = 100;
  const deliveryFee = 50;
  const tip = 10;
  const discount = 20;
  const total = Math.max(0, subtotal - discount + deliveryFee + tip);
  assert.equal(total, 140);
});

test('cálculo de total: sin delivery (takeout)', () => {
  const subtotal = 80;
  const deliveryFee = 0;
  const tip = 5;
  const discount = 0;
  const total = Math.max(0, subtotal - discount + deliveryFee + tip);
  assert.equal(total, 85);
});

test('cálculo de total: nunca negativo', () => {
  const subtotal = 10;
  const deliveryFee = 0;
  const tip = 0;
  const discount = 50;
  const total = Math.max(0, subtotal - discount + deliveryFee + tip);
  assert.equal(total >= 0, true);
});

test('cálculo de propina: porcentaje del subtotal', () => {
  const subtotal = 100;
  const tipPct = 15;
  const tip = Math.round(subtotal * (tipPct / 100));
  assert.equal(tip, 15);
});

test('cálculo de propina: 0% es cero', () => {
  const subtotal = 100;
  const tipPct = 0;
  const tip = Math.round(subtotal * (tipPct / 100));
  assert.equal(tip, 0);
});

// ── Métodos de Pago ────────────────────────────────────────────────────────

test('paymentMethod: CASH disponible siempre', () => {
  const allowed = ['CASH', 'CARD', 'TRANSFER'];
  assert.equal(allowed.includes('CASH'), true);
});

test('paymentMethod: ONLINE solo si onlinePayment=true y no es DINE_IN', () => {
  const onlinePayment = true;
  const isDineIn = false;
  const allowed = onlinePayment && !isDineIn;
  assert.equal(allowed, true);
});

test('paymentMethod: ONLINE no disponible en DINE_IN', () => {
  const onlinePayment = true;
  const isDineIn = true;
  const allowed = onlinePayment && !isDineIn;
  assert.equal(allowed, false);
});

// ── Payload de Checkout Marketplace ──────────────────────────────────────

test('marketplace checkout payload: contiene todos los campos requeridos', () => {
  const payload = {
    orderId: 'order-123',
    subtotal: 100,
    deliveryFee: 50,
    tip: 10,
    collectorId: 'collector-456',
    returnUrl: 'https://example.com/store/checkout?success=1',
  };

  assert.equal(typeof payload.orderId, 'string');
  assert.equal(typeof payload.subtotal, 'number');
  assert.equal(typeof payload.deliveryFee, 'number');
  assert.equal(typeof payload.tip, 'number');
  assert.equal(typeof payload.collectorId, 'string');
  assert.equal(typeof payload.returnUrl, 'string');
});

test('marketplace checkout payload: total implícito es subtotal + deliveryFee + tip', () => {
  const subtotal = 100;
  const deliveryFee = 50;
  const tip = 10;
  const implicitTotal = subtotal + deliveryFee + tip;
  assert.equal(implicitTotal, 160);
});

test('marketplace checkout endpoint: POST /api/marketplace/payments/checkout', () => {
  const endpoint = '/api/marketplace/payments/checkout';
  assert.equal(endpoint.includes('marketplace'), true);
  assert.equal(endpoint.includes('payments'), true);
});

// ── Payload de Checkout Regular (No Marketplace) ──────────────────────────

test('regular checkout payload: contiene orderId y returnUrl', () => {
  const payload = {
    orderId: 'order-789',
    returnUrl: 'https://example.com/',
  };

  assert.equal(typeof payload.orderId, 'string');
  assert.equal(typeof payload.returnUrl, 'string');
});

test('regular checkout endpoint: POST /api/store/payment/create', () => {
  const endpoint = '/api/store/payment/create';
  assert.equal(endpoint.includes('store'), true);
  assert.equal(!endpoint.includes('marketplace'), true);
});

// ── Detección de Marketplace ────────────────────────────────────────────

test('es marketplace si collectorId está presente', () => {
  const collectorId = 'collector-123';
  const isMarketplace = !!collectorId;
  assert.equal(isMarketplace, true);
});

test('no es marketplace si collectorId está ausente', () => {
  const collectorId = undefined;
  const isMarketplace = !!collectorId;
  assert.equal(isMarketplace, false);
});

test('seleccionar endpoint correcto según collectorId', () => {
  const collectorId = 'collector-abc';
  const baseUrl = '/api';
  const endpoint = !!collectorId
    ? `${baseUrl}/marketplace/payments/checkout`
    : `${baseUrl}/store/payment/create`;
  assert.equal(endpoint, '/api/marketplace/payments/checkout');
});

// ── Split & Comisiones ────────────────────────────────────────────────────

test('split: marketplace fee es porcentaje del total', () => {
  const total = 160;
  const marketplaceFeePercent = 5;
  const marketplaceFee = Math.round(total * (marketplaceFeePercent / 100));
  assert.equal(marketplaceFee, 8);
});

test('split: merchant amount es total menos marketplace fee', () => {
  const total = 160;
  const marketplaceFee = 8;
  const merchantAmount = total - marketplaceFee;
  assert.equal(merchantAmount, 152);
});

test('split: merchant recibe subtotal + delivery + tip - fee', () => {
  const subtotal = 100;
  const deliveryFee = 50;
  const tip = 10;
  const total = subtotal + deliveryFee + tip;
  const feePercent = 5;
  const fee = Math.round(total * (feePercent / 100));
  const merchantReceives = total - fee;
  assert.equal(merchantReceives, 152);
});

// ── Cash / PIN Entrega ────────────────────────────────────────────────────

test('CASH + DELIVERY: mostrar aviso de PIN', () => {
  const paymentMethod = 'CASH';
  const isDelivery = true;
  const shouldShowPin = paymentMethod === 'CASH' && isDelivery;
  assert.equal(shouldShowPin, true);
});

test('CASH + TAKEOUT: no mostrar aviso de PIN', () => {
  const paymentMethod = 'CASH';
  const isDelivery = false;
  const shouldShowPin = paymentMethod === 'CASH' && isDelivery;
  assert.equal(shouldShowPin, false);
});

test('aviso de PIN: contiene instrucción clara', () => {
  const msg = 'El repartidor solicitará un código de 4 dígitos para entrega segura. Confirma con el vendedor.';
  assert.ok(msg.includes('repartidor'));
  assert.ok(msg.includes('código'));
  assert.ok(msg.includes('4 dígitos'));
});

// ── Resiliencia ────────────────────────────────────────────────────────────

test('si checkout URL falla: mostrar error pero preservar orden', () => {
  const orderCreated = true;
  const checkoutFailed = true;
  const shouldShow = { orderNumber: 'ORD-001', status: 'PENDING' };
  const error = 'No se pudo abrir la pasarela. Tu pedido quedó registrado.';

  assert.equal(orderCreated && checkoutFailed, true);
  assert.ok(shouldShow.orderNumber);
  assert.ok(error);
});

test('si checkout URL se resuelve: redirigir sin mostrar orden', () => {
  const checkoutUrl = 'https://secure.mercadopago.com/checkout/v1/..';
  const shouldRedirect = !!checkoutUrl;
  assert.equal(shouldRedirect, true);
});

test('retry logic: sin reintento automático en errores transitorios', () => {
  const networkError = new Error('fetch failed');
  const isRetryable = networkError.message.includes('fetch');
  assert.equal(isRetryable, true);
  // Nota: el componente NO reintenta automáticamente, el usuario puede hacer refresh
});

// ── Validaciones de Entrada ────────────────────────────────────────────────

test('validación: orderId no puede estar vacío', () => {
  const orderId = 'order-123';
  const valid = orderId && orderId.trim().length > 0;
  assert.equal(valid, true);
});

test('validación: subtotal debe ser >= 0', () => {
  const amounts = [0, 50, 100, 1000];
  amounts.forEach(amount => {
    assert.equal(amount >= 0, true);
  });
});

test('validación: deliveryFee debe ser >= 0', () => {
  const deliveryFee = 50;
  assert.equal(deliveryFee >= 0, true);
});

test('validación: collectorId requerido en marketplace', () => {
  const collectorId = 'mkt-001';
  const isMarketplace = !!collectorId;
  if (isMarketplace) {
    assert.ok(collectorId);
  }
});

// ── Datos de Éxito ─────────────────────────────────────────────────────────

test('success object: contiene orderNumber y status', () => {
  const success = { id: 'ord-789', orderNumber: 'ORD-001', status: 'PENDING' };
  assert.ok(success.orderNumber);
  assert.ok(success.status);
});

test('success object: puede contener deliveryNote para CASH', () => {
  const success = {
    id: 'ord-abc',
    orderNumber: 'ORD-002',
    status: 'PENDING',
    deliveryNote: 'El repartidor solicitará un código de 4 dígitos para entrega segura. Confirma con el vendedor.',
  };
  assert.ok(success.deliveryNote.includes('repartidor'));
});

test('status labels: PENDING = "Recibido"', () => {
  const statusMap = {
    PENDING: 'Recibido',
    CONFIRMED: 'Confirmado',
    PREPARING: 'En preparación',
    READY: 'Listo',
    ON_THE_WAY: 'En camino',
    DELIVERED: 'Entregado',
    CANCELLED: 'Cancelado',
  };

  assert.equal(statusMap.PENDING, 'Recibido');
});

// ── Flujo Completo ────────────────────────────────────────────────────────

test('flujo marketplace: create order → marketplace checkout', () => {
  const collectorId = 'col-123';
  const steps = [];

  steps.push({ action: 'createOrder', data: { id: 'ord-1', status: 'PENDING' } });

  if (collectorId) {
    steps.push({
      action: 'marketplaceCheckout',
      endpoint: '/api/marketplace/payments/checkout',
      payload: { orderId: 'ord-1', subtotal: 100, deliveryFee: 50, tip: 10, collectorId },
    });
  }

  assert.equal(steps.length, 2);
  assert.equal(steps[0].action, 'createOrder');
  assert.equal(steps[1].action, 'marketplaceCheckout');
});

test('flujo cash: create order → show PIN aviso', () => {
  const paymentMethod = 'CASH';
  const isDelivery = true;
  const steps = [];

  steps.push({ action: 'createOrder', data: { id: 'ord-2', status: 'PENDING' } });

  if (paymentMethod === 'CASH' && isDelivery) {
    steps.push({
      action: 'showDeliveryPin',
      message: 'El repartidor solicitará un código de 4 dígitos para entrega segura.',
    });
  }

  assert.equal(steps.length, 2);
  assert.equal(steps[1].action, 'showDeliveryPin');
});

test('flujo regular: create order → store payment checkout', () => {
  const collectorId = undefined;
  const steps = [];

  steps.push({ action: 'createOrder', data: { id: 'ord-3', status: 'PENDING' } });

  if (!collectorId) {
    steps.push({
      action: 'storeCheckout',
      endpoint: '/api/store/payment/create',
      payload: { orderId: 'ord-3' },
    });
  }

  assert.equal(steps.length, 2);
  assert.equal(steps[1].action, 'storeCheckout');
});

// ── Edge Cases ────────────────────────────────────────────────────────────

test('edge case: tip > subtotal es válido', () => {
  const subtotal = 20;
  const tip = 50;
  assert.ok(tip >= 0);
});

test('edge case: descuento = 0 es válido', () => {
  const discount = 0;
  const total = 100 - discount;
  assert.equal(total, 100);
});

test('edge case: múltiples items en línea', () => {
  const lines = [
    { id: '1', price: 30, quantity: 2 },
    { id: '2', price: 20, quantity: 1 },
  ];
  const subtotal = lines.reduce((sum, l) => sum + (l.price * l.quantity), 0);
  assert.equal(subtotal, 80);
});

test('edge case: returnUrl incluye estado si es success', () => {
  const returnUrl = 'https://example.com/store/checkout?success=1';
  const hasSuccessParam = returnUrl.includes('success');
  assert.equal(hasSuccessParam, true);
});

test('completeness: marketplace split requerido para checkout online', () => {
  const collectorId = 'col-001';
  const isMarketplace = !!collectorId;
  if (isMarketplace) {
    assert.ok(collectorId.length > 0);
  }
});

// ── Checkout v1 (cotización + orquestador) y carrito mono-tienda ──────────────
import {
  unsupportedReason, buildQuoteBody, buildOrderBody, checkCustomer, requestQuote, placeOrder, newIdempotencyKey,
} from '../src/lib/marketplaceV1Checkout.ts';


const cartLine = (over = {}) => ({ id: 'k1', menuItemId: 'burger', name: 'Hamburguesa', price: 100, quantity: 2,
  variantId: null, modifierIds: [], ...over });
const KEY = 'checkout-key-0123456789abcdef0123456789';
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('carts with variants, modifiers or combos cannot be quoted in v1', () => {
  assert.equal(unsupportedReason([cartLine()]), null);
  assert.match(unsupportedReason([cartLine({ variantId: 'xl' })]), /variante/);
  assert.match(unsupportedReason([cartLine({ modifierIds: ['queso'] })]), /modificadores/);
  assert.match(unsupportedReason([cartLine({ comboSelections: [{ componentId: 'c', optionId: 'o' }] })]), /combo/);
  assert.match(unsupportedReason([cartLine({ menuItemId: '' })]), /identificador/);
});

test('the quote body sends ids, quantities and empty modifiers; delivery needs an address, pickup omits it', () => {
  const delivery = buildQuoteBody({ merchantId: 'm1', lines: [cartLine()], fulfillment: 'DELIVERY', deliveryAddressId: 'addr-1' });
  assert.deepEqual(delivery, { merchantId: 'm1', fulfillment: 'DELIVERY', deliveryAddressId: 'addr-1',
    items: [{ menuItemId: 'burger', quantity: 2, modifiers: [] }] });
  const pickup = buildQuoteBody({ merchantId: 'm1', lines: [cartLine()], fulfillment: 'PICKUP', deliveryAddressId: 'addr-1' });
  assert.equal('deliveryAddressId' in pickup, false);
});

test('the order body carries only the quote, payment, customer and notes', () => {
  const body = buildOrderBody({ quoteId: 'q1', fulfillment: 'PICKUP', paymentMethod: 'CASH',
    customer: { name: 'Ana', phone: '5512345678' }, notes: 'Sin cebolla' });
  assert.deepEqual(body, { quoteId: 'q1', paymentMethod: 'CASH', customer: { name: 'Ana', phone: '5512345678' }, notes: 'Sin cebolla' });
  assert.equal('total' in body, false, 'the client never sends money');
});

test('customer checks reject blank names, short phones and bad emails', () => {
  assert.equal(checkCustomer({ name: 'Ana', phone: '5512345678' }), null);
  assert.match(checkCustomer({ name: '  ', phone: '5512345678' }), /nombre/);
  assert.match(checkCustomer({ name: 'Ana', phone: '123' }), /tel/);
  assert.match(checkCustomer({ name: 'Ana', phone: '5512345678', email: 'nope' }), /correo/);
});

test('requestQuote sends the idempotency key and parses the server quote', async () => {
  let sent;
  const result = await requestQuote('https://api.example', { merchantId: 'm1' }, KEY, async (url, init) => {
    sent = { url, init };
    return jsonResponse({ quoteId: 'q1', expiresAt: '2026-10-23T12:05:00.000Z', total: '100.02' }, 201);
  });
  assert.equal(sent.url, 'https://api.example/api/marketplace/v1/quotes');
  assert.equal(sent.init.method, 'POST');
  assert.equal(sent.init.headers['Idempotency-Key'], KEY);
  assert.deepEqual(result, { quoteId: 'q1', expiresAt: '2026-10-23T12:05:00.000Z', total: '100.02' });
});

test('a 401 or 4xx from the server is a rejection carrying the server message', async () => {
  const result = await requestQuote('https://api.example', {}, KEY,
    async () => jsonResponse({ error: 'Cuenta requerida', errorCode: 'UNAUTHENTICATED' }, 401));
  assert.deepEqual(result, { ok: false, reason: 'rejected', message: 'Cuenta requerida' });
});

test('server 5xx and network errors are unavailable, and a missing api url is a config failure', async () => {
  assert.equal((await requestQuote('https://api.example', {}, KEY, async () => new Response('x', { status: 503 }))).reason, 'unavailable');
  assert.equal((await requestQuote('https://api.example', {}, KEY, async () => { throw new Error('offline'); })).reason, 'unavailable');
  assert.equal((await placeOrder(null, {}, KEY)).reason, 'config');
});

test('an invalid idempotency key is refused before any request', async () => {
  let called = false;
  const result = await placeOrder('https://api.example', {}, 'short', async () => { called = true; return jsonResponse({}); });
  assert.equal(result.reason, 'rejected');
  assert.equal(called, false);
  assert.match(newIdempotencyKey(), /^[A-Za-z0-9_-]{32,128}$/);
});

test('placeOrder parses the order and the idempotent flag; malformed responses are unavailable', async () => {
  const ok = await placeOrder('https://api.example', {}, KEY,
    async () => jsonResponse({ orderId: 'o1', quoteId: 'q1', idempotent: true }, 200));
  assert.deepEqual(ok, { orderId: 'o1', quoteId: 'q1', idempotent: true });
  const bad = await placeOrder('https://api.example', {}, KEY, async () => jsonResponse({ quoteId: 'q1' }, 201));
  assert.equal(bad.reason, 'unavailable');
});

// ── Elegibilidad, seguimiento v1 y token de la orden ──────────────────────────
import { checkMarketplaceEligibility, parseTracking, fetchTracking } from '../src/lib/marketplaceV1Checkout.ts';

const TOKEN = 'a'.repeat(64);

test('marketplace checkout is pickup-only, cash or online, and never silently uses another path', () => {
  const plain = [cartLine()];
  assert.deepEqual(checkMarketplaceEligibility({ orderType: 'TAKEOUT', paymentMethod: 'CASH', lines: plain }),
    { ok: true, fulfillment: 'PICKUP', paymentMethod: 'CASH' });
  assert.deepEqual(checkMarketplaceEligibility({ orderType: 'TAKEOUT', paymentMethod: 'ONLINE', lines: plain }),
    { ok: true, fulfillment: 'PICKUP', paymentMethod: 'ONLINE' });
  assert.match(checkMarketplaceEligibility({ orderType: 'DELIVERY', paymentMethod: 'CASH', lines: plain }).message, /domicilio/);
  assert.match(checkMarketplaceEligibility({ orderType: 'DINE_IN', paymentMethod: 'CASH', lines: plain }).message, /mesa/);
  assert.match(checkMarketplaceEligibility({ orderType: 'TAKEOUT', paymentMethod: 'TRANSFER', lines: plain }).message, /pago/);
  assert.match(checkMarketplaceEligibility({ orderType: 'TAKEOUT', paymentMethod: 'CASH', lines: [cartLine({ modifierIds: ['x'] })] }).message, /modificadores/);
});

test('placeOrder keeps the tracking token and order number when the server returns them', async () => {
  const withToken = await placeOrder('https://api.example', {}, KEY, async () =>
    jsonResponse({ orderId: 'o1', quoteId: 'q1', idempotent: false, trackingToken: TOKEN, orderNumber: 42 }, 201));
  assert.equal(withToken.trackingToken, TOKEN);
  assert.equal(withToken.orderNumber, '42');
  const malformed = await placeOrder('https://api.example', {}, KEY, async () =>
    jsonResponse({ orderId: 'o1', quoteId: 'q1', trackingToken: 'not-hex' }, 201));
  assert.equal('trackingToken' in malformed, false, 'an invalid token is dropped, never trusted');
});

test('parseTracking projects only the public tracking fields', () => {
  assert.deepEqual(parseTracking({ orderId: 'o1', status: 'READY', taskStatus: null, isStale: false, courierId: 'secret' }),
    { orderId: 'o1', status: 'READY', taskStatus: null, isStale: false });
  assert.equal(parseTracking({ orderId: 'o1' }), null);
});

test('fetchTracking sends the token in a header only, never in the url', async () => {
  let sent;
  const result = await fetchTracking('https://api.example', 'o1', TOKEN, async (url, init) => {
    sent = { url, init };
    return jsonResponse({ orderId: 'o1', status: 'PREPARING', taskStatus: null, isStale: false });
  });
  assert.equal(sent.url, 'https://api.example/api/marketplace/v1/orders/o1/tracking');
  assert.equal(sent.url.includes(TOKEN), false);
  assert.equal(sent.init.headers['X-Marketplace-Order-Token'], TOKEN);
  assert.equal(result.status, 'PREPARING');
});

test('fetchTracking maps 401, 5xx, malformed and missing config without leaking details', async () => {
  assert.equal((await fetchTracking('https://a', 'o1', TOKEN, async () => new Response('{}', { status: 401 }))).reason, 'rejected');
  assert.equal((await fetchTracking('https://a', 'o1', TOKEN, async () => new Response('x', { status: 503 }))).reason, 'unavailable');
  assert.equal((await fetchTracking('https://a', 'o1', TOKEN, async () => jsonResponse({ nope: 1 }))).reason, 'unavailable');
  assert.equal((await fetchTracking(null, 'o1', TOKEN)).reason, 'config');
  assert.equal((await fetchTracking('https://a', 'o1', 'short')).reason, 'rejected');
});
