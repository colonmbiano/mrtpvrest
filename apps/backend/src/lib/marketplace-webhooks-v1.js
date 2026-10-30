'use strict';

// Durable Mercado Pago webhook for marketplace v1 (plan §5.2, §6, §7). Order of operations:
//  1. Verify the manifest HMAC over data.id, x-request-id and ts. Nothing from the body is read first.
//     A missing secret fails closed (503), never a default.
//  2. Drop repeated deliveries before calling the provider. The unique insert in step 4 is the real guard.
//  3. Fetch the payment again from the provider. The notification body is never a source of amounts.
//  4. In one unit of work: record the event, move the payment and order to PAID only if still pending,
//     and write the PaymentConfirmed outbox event. Any failure rolls all three back.
// Permanent mismatches are audited and answered 200, so the provider stops retrying. Transient
// failures are thrown as 503, so the provider retries. Neither path can loop.
// Ports: webhookStore, paymentGateway, orderStore, outboxStore, unitOfWork. No network or database here.
const crypto = require('node:crypto');

const PROVIDER = 'MERCADOPAGO';
const DATA_ID = /^[A-Za-z0-9]{1,64}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const DIGITS = /^[0-9]{1,16}$/;

class MarketplaceWebhookError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.name = 'MarketplaceWebhookError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
function fail(code, message, statusCode) {
  throw new MarketplaceWebhookError(code, message, statusCode);
}
function check(ok, code, message, statusCode) {
  if (!ok) fail(code, message, statusCode);
}

// Documented Mercado Pago manifest. The id comes from the URL query, lowercased when alphanumeric.
function verifySignature({ headers, query, secret }) {
  check(typeof secret === 'string' && secret.length >= 16, 'WEBHOOK_SECRET_UNAVAILABLE', 'Webhook no configurado', 503);
  const xSignature = headers?.['x-signature'];
  const requestId = headers?.['x-request-id'];
  check(typeof xSignature === 'string' && typeof requestId === 'string' && requestId.length > 0 && requestId.length <= 128,
    'INVALID_SIGNATURE', 'Firma invalida', 401);
  let ts = null;
  let v1 = null;
  for (const part of xSignature.split(',')) {
    const [key, value] = part.split('=').map(item => item.trim());
    if (key === 'ts') ts = value;
    if (key === 'v1') v1 = value;
  }
  check(DIGITS.test(ts || '') && HEX64.test(v1 || ''), 'INVALID_SIGNATURE', 'Firma invalida', 401);
  const dataId = query?.['data.id'];
  check(typeof dataId === 'string' && DATA_ID.test(dataId), 'INVALID_SIGNATURE', 'Firma invalida', 401);
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  check(crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1)), 'INVALID_SIGNATURE', 'Firma invalida', 401);
  return { dataId, requestId };
}

// The body must agree with the signed id, so a tampered body cannot ride on a valid signature.
function readNotification(body, dataId) {
  check(body && typeof body === 'object' && !Array.isArray(body), 'INVALID_NOTIFICATION', 'Notificacion invalida', 400);
  const bodyId = body.data && typeof body.data === 'object' ? body.data.id : undefined;
  check(bodyId === undefined || String(bodyId) === dataId, 'INVALID_SIGNATURE', 'Firma invalida', 401);
  return { type: typeof body.type === 'string' ? body.type : null, action: typeof body.action === 'string' ? body.action : null };
}

// Decides the outcome from the provider's payment and the stored order. Nothing is written here.
function decide(payment, order) {
  if (!payment) return 'PAYMENT_NOT_FOUND';
  if (!order || payment.orderId !== order.orderId) return 'UNMATCHED';
  if (payment.status !== 'approved') return 'NOT_APPROVED';
  if (order.paidPaymentId && order.paidPaymentId !== payment.id) return 'PAYMENT_CONFLICT';
  const agrees = payment.collectorId === order.collectorId && payment.currency === order.currency
    && payment.amountCents === order.totalCents && payment.marketplaceFeeCents === order.platformFeeCents;
  return agrees ? 'PAID' : 'MISMATCH';
}

function createMarketplaceWebhooksV1Service({ webhookStore, paymentGateway, orderStore, outboxStore, unitOfWork, now = () => new Date() } = {}) {
  function ready() {
    check(webhookStore && paymentGateway && orderStore && outboxStore && unitOfWork, 'WEBHOOKS_UNAVAILABLE', 'Webhooks no disponibles', 503);
  }

  async function handle({ headers, query, body, secret }) {
    ready();
    const { dataId, requestId } = verifySignature({ headers, query, secret });
    const notification = readNotification(body, dataId);
    if (notification.type !== 'payment') return { status: 'IGNORED' };

    // One row per (provider, eventId). Each Mercado Pago delivery has its own x-request-id, so a
    // new delivery of the same payment is a new event. Replays of one delivery are the duplicates.
    const eventId = `${dataId}:${requestId}`;
    if (await webhookStore.findEvent(PROVIDER, eventId)) return { status: 'DUPLICATE' };

    const payment = await paymentGateway.getPayment(dataId);
    const order = payment?.orderId ? await orderStore.findOrder(payment.orderId) : null;
    const outcome = decide(payment, order);
    const at = now();
    try {
      return await unitOfWork.run(async tx => {
        const event = await webhookStore.insertEvent(tx, { id: crypto.randomUUID(), provider: PROVIDER, eventId, dataId,
          requestId, action: notification.action, outcome, receivedAt: at });
        if (outcome !== 'PAID') return { status: outcome };
        const changed = await orderStore.markPaidIfPending(tx, { orderId: order.orderId, paymentId: payment.id, paidAt: at });
        if (!changed) {
          await webhookStore.updateEvent(tx, event.id, { outcome: 'ALREADY_PAID' });
          return { status: 'ALREADY_PAID' };
        }
        await outboxStore.append(tx, { eventKey: `PaymentConfirmed:${order.orderId}`, aggregateType: 'MarketplaceOrder',
          aggregateId: order.orderId, eventType: 'PaymentConfirmed', payload: { orderId: order.orderId, paymentId: payment.id },
          createdAt: at });
        return { status: 'PROCESSED' };
      });
    } catch (error) {
      // A unique violation means a concurrent delivery already recorded this event. Its transaction wins.
      if (error?.code === 'DUPLICATE') return { status: 'DUPLICATE' };
      throw error;
    }
  }

  return { handle };
}

module.exports = { MarketplaceWebhookError, createMarketplaceWebhooksV1Service, verifySignature, decide };
