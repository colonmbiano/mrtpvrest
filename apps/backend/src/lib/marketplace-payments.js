'use strict';

/**
 * marketplace-payments.js
 *
 * Motor de pagos para MRTPVREST Marketplace con split 1:1 Mercado Pago.
 * Funcionalidades:
 * - Creación de preferencia con marketplace_fee (split automático)
 * - Webhook idempotente con validación de firma
 * - OAuth onboarding para comercios
 * - Integración con ledger contable
 * - Conciliación de efectivo
 */

const crypto = require('crypto');
const {
  ACCOUNT_TYPES,
  ENTRY_TYPES,
  roundCents,
  calculateOrderSettlement,
  buildOrderCaptureTransaction,
  buildOrderSettlementTransaction,
} = require('./marketplace-ledger');

const PAYMENT_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REFUNDED: 'REFUNDED',
  IN_PROCESS: 'IN_PROCESS',
  IN_MEDIATION: 'IN_MEDIATION',
  CANCELLED: 'CANCELLED',
});

const WEBHOOK_EVENTS = Object.freeze({
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_UPDATED: 'payment.updated',
  MERCHANT_ORDER_CREATED: 'merchant_order.created',
  MERCHANT_ORDER_UPDATED: 'merchant_order.updated',
});

class PaymentError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Genera la URL de OAuth para onboarding del comercio.
 * En producción, integra con el endpoint de Mercado Pago.
 */
function generateOAuthUrl({
  tenantId,
  merchantSlug,
  redirectUri = process.env.MARKETPLACE_OAUTH_REDIRECT_URI || 'http://localhost:3000/api/marketplace/payments/oauth-callback',
  clientId = process.env.MERCADOPAGO_CLIENT_ID || 'test_client_id',
} = {}) {
  if (!tenantId || !merchantSlug) {
    throw new PaymentError('tenantId y merchantSlug son obligatorios', 'INVALID_OAUTH_PARAMS');
  }

  // En producción, construir URL real de Mercado Pago
  // https://auth.mercadopago.com/authorization?response_type=code&client_id=...&redirect_uri=...&state=...
  const state = Buffer.from(JSON.stringify({ tenantId, merchantSlug })).toString('base64');
  const scope = ['read', 'write'].join(' ');

  // URL simulada (sin hacer request real)
  const url = `https://auth.mercadopago.com/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scopes=${encodeURIComponent(scope)}`;

  return { url, state };
}

/**
 * Procesa el callback de OAuth para obtener el collector_id del comercio.
 * En tests, simula el resultado sin hacer request real.
 */
async function handleOAuthCallback({
  code,
  state,
  ledger,
  store = {}, // merchant data
} = {}) {
  if (!code || !state) {
    throw new PaymentError('code y state son requeridos', 'INVALID_OAUTH_CALLBACK');
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch (err) {
    throw new PaymentError('state contiene datos inválidos', 'INVALID_STATE_DATA');
  }

  if (!decoded.tenantId || !decoded.merchantSlug) {
    throw new PaymentError('state contiene datos inválidos', 'INVALID_STATE_DATA');
  }

  // En producción: intercambiar code por access_token via POST a Mercado Pago
  // Por ahora, simulamos retorno de collector_id
  const simulatedCollectorId = `collector_${decoded.tenantId}_${Math.random().toString(36).slice(2)}`;

  return {
    collectorId: simulatedCollectorId,
    tenantId: decoded.tenantId,
    merchantSlug: decoded.merchantSlug,
    status: 'AUTHORIZED',
    authorizedAt: new Date().toISOString(),
  };
}

/**
 * Crea una preferencia de pago en Mercado Pago con split automático (marketplace_fee).
 *
 * @param {Object} params
 * @param {string} params.orderId - ID de la orden MRTPVREST
 * @param {number} params.subtotal - Subtotal de productos
 * @param {number} params.deliveryFee - Tarifa de entrega
 * @param {number} [params.tip=0] - Propina
 * @param {number} [params.commissionRate=0.05] - Tasa de comisión del marketplace (default 5%)
 * @param {number} [params.commissionFixed=0] - Cargo fijo en pesos
 * @param {string} params.collectorId - Collector ID de Mercado Pago del comercio
 * @param {string} [params.currency='MXN']
 * @param {string} [params.customerEmail] - Email del cliente
 * @param {string} [params.description=''] - Descripción del pago
 * @returns {Object} Preferencia (simulada, sin request real)
 */
function createPaymentPreference({
  orderId,
  subtotal,
  deliveryFee,
  tip = 0,
  commissionRate = 0.05,
  commissionFixed = 0,
  collectorId,
  currency = 'MXN',
  customerEmail = 'customer@example.com',
  description = '',
  gateway,
  idempotencyKey,
  settlementSnapshot,
} = {}) {
  if (!orderId || !collectorId) {
    throw new PaymentError('orderId y collectorId son obligatorios', 'INVALID_PAYMENT_PARAMS');
  }

  // Calcular desglose contable
  const settlement = gateway && settlementSnapshot ? settlementSnapshot : calculateOrderSettlement({
    subtotal,
    deliveryFee,
    tip,
    commissionRate,
    commissionFixed,
  });

  if (gateway && settlementSnapshot) {
    const { cents } = require('./marketplace-order-money');
    if (cents(settlement.subtotal) !== cents(subtotal) || cents(settlement.deliveryFee) !== cents(deliveryFee)
      || cents(settlement.tip) !== cents(tip) || cents(settlement.customerTotal) !== cents(subtotal) + cents(deliveryFee) + cents(tip)
      || cents(settlement.merchantPayout) + cents(settlement.platformFee) !== cents(subtotal)
      || cents(settlement.courierPayout) !== cents(deliveryFee) + cents(tip)) {
      throw new PaymentError('Desglose de pago inconsistente', 'INVALID_SETTLEMENT');
    }
  }

  const { customerTotal, platformFee } = settlement;
  const cleanTotal = roundCents(customerTotal);
  const cleanFee = roundCents(platformFee);

  // Construir items para Mercado Pago
  const items = [
    {
      id: 'products',
      title: 'Productos',
      quantity: 1,
      unit_price: roundCents(subtotal),
      currency_id: currency,
    },
  ];

  if (deliveryFee > 0) {
    items.push({
      id: 'delivery',
      title: 'Entrega',
      quantity: 1,
      unit_price: deliveryFee,
      currency_id: currency,
    });
  }

  if (tip > 0) {
    items.push({
      id: 'tip',
      title: 'Propina',
      quantity: 1,
      unit_price: tip,
      currency_id: currency,
    });
  }

  // The persistent orders pipeline always supplies an authenticated merchant gateway.
  if (gateway) {
    return gateway.createPreference({ orderId, items, marketplaceFee: cleanFee, idempotencyKey });
  }

  // Preferencia simulada (sin request real a Mercado Pago)
  const preferenceId = `pref_${orderId}_${Date.now()}`;

  return {
    id: preferenceId,
    orderId,
    collectorId,
    transactionAmount: cleanTotal,
    marketplaceFee: cleanFee, // Split automático: el fee va a MRTPVREST
    merchantNet: roundCents(cleanTotal - cleanFee), // Lo que recibe el comercio
    currency,
    description: description || `Orden ${orderId}`,
    externalReference: orderId,
    payer: { email: customerEmail },
    items,
    settlement,
    createdAt: new Date().toISOString(),
    initPoint: `https://www.mercadopago.com/checkout/v1/redirect?pref_id=${preferenceId}`,
  };
}

/**
 * Valida la firma del webhook de Mercado Pago.
 *
 * Formula: SHA256(id|request.qs|secret)
 * Detalle: https://www.mercadopago.com.ar/developers/es/reference/webhooks/_merchant_orders_id/get
 */
function validateWebhookSignature({
  xSignature,
  xRequestId,
  body,
  webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET || 'test_webhook_secret',
} = {}) {
  if (!xSignature || !xRequestId || !body) {
    throw new PaymentError('Firma de webhook inválida: falta x-signature, x-request-id o body', 'INVALID_WEBHOOK_FORMAT');
  }

  // Formato: ts=1614556228,v1=hash
  const parts = xSignature.split(',');
  if (parts.length < 2) {
    throw new PaymentError('Firma de webhook malformada', 'MALFORMED_SIGNATURE');
  }

  let ts = null;
  let v1 = null;
  for (const part of parts) {
    if (part.startsWith('ts=')) ts = part.slice(3);
    if (part.startsWith('v1=')) v1 = part.slice(3);
  }

  if (!ts || !v1) {
    throw new PaymentError('Firma de webhook falta ts o v1', 'MISSING_SIGNATURE_PARTS');
  }

  // Reconstruir el hash: ts.id.request_id.secret
  const idempotencyKey = `${ts}.${xRequestId}`;
  const stringToSign = `${ts}.${xRequestId}.${webhookSecret}`;
  const expectedHash = crypto.createHash('sha256').update(stringToSign).digest('hex');

  if (v1 !== expectedHash) {
    throw new PaymentError('Firma de webhook no válida', 'INVALID_SIGNATURE', {
      expected: expectedHash,
      received: v1,
    });
  }

  return { valid: true, idempotencyKey, timestamp: new Date(parseInt(ts) * 1000) };
}

/**
 * Procesa un webhook de pago de Mercado Pago (payment.created o payment.updated).
 * Aplica idempotencia via ledger.
 */
function processPaymentWebhook({
  paymentId,
  externalReference, // order_id
  status, // PENDING, APPROVED, etc.
  amount,
  metadata = {},
  ledger,
  idempotencyKey,
} = {}) {
  if (!paymentId || !externalReference || !status) {
    throw new PaymentError('Webhook incompleto: falta paymentId, externalReference o status', 'INVALID_WEBHOOK_PAYLOAD');
  }

  // Idempotencia: si ya procesamos este evento, return early
  if (ledger && ledger.hasIdempotencyKey(idempotencyKey)) {
    return { idempotent: true, paymentId, status };
  }

  const cleanAmount = roundCents(amount || 0);

  // Solo crear transacción si el pago fue APPROVED (captura de efectivo)
  let transaction = null;
  if (status === PAYMENT_STATUSES.APPROVED && cleanAmount > 0) {
    transaction = buildOrderCaptureTransaction({
      orderId: externalReference,
      referenceId: paymentId,
      amount: cleanAmount,
      currency: 'MXN',
      description: `Pago capturado de Mercado Pago: ${paymentId}`,
    });

    // Registrar en ledger con idempotencia
    if (ledger) {
      ledger.record(transaction, idempotencyKey);
    }
  }

  return {
    paymentId,
    externalReference,
    status,
    amount: cleanAmount,
    transactionId: transaction?.id || null,
    idempotent: false,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Simula un webhook de settlement (merchant_order.updated) cuando la entrega se completa.
 * En producción, este es disparado por el repartidor verificando PIN.
 */
function processSettlementWebhook({
  orderId,
  settlement, // resultado de calculateOrderSettlement
  ledger,
  idempotencyKey,
} = {}) {
  if (!orderId || !settlement) {
    throw new PaymentError('Settlement incompleto: falta orderId o settlement', 'INVALID_SETTLEMENT_PAYLOAD');
  }

  // Idempotencia
  if (ledger && ledger.hasIdempotencyKey(idempotencyKey)) {
    return { idempotent: true, orderId };
  }

  // Construir transacción de liquidación
  const transaction = buildOrderSettlementTransaction({
    orderId,
    referenceId: `settlement_${orderId}`,
    settlement,
    currency: 'MXN',
    description: `Liquidación de orden ${orderId}`,
  });

  // Registrar en ledger
  if (ledger) {
    ledger.record(transaction, idempotencyKey);
  }

  return {
    orderId,
    transactionId: transaction.id,
    settlementAmount: settlement.customerTotal,
    merchantPayout: settlement.merchantPayout,
    courierPayout: settlement.courierPayout,
    platformFee: settlement.platformFee,
    idempotent: false,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Obtiene el saldo de liquidación pendiente de un comercio.
 */
function getMerchantBalance({
  ledger,
  collectorId,
} = {}) {
  if (!ledger || !collectorId) {
    throw new PaymentError('Falta ledger o collectorId', 'INVALID_BALANCE_PARAMS');
  }

  const payableBalance = ledger.getBalance(ACCOUNT_TYPES.MERCHANT_PAYABLE);
  return {
    collectorId,
    merchantPayable: payableBalance.net,
    availableForPayout: Math.max(0, payableBalance.net), // Solo positivos
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Obtiene el saldo global de la plataforma (ingresos por comisiones).
 */
function getPlatformBalance({
  ledger,
} = {}) {
  if (!ledger) {
    throw new PaymentError('Falta ledger', 'INVALID_BALANCE_PARAMS');
  }

  const feeBalance = ledger.getBalance(ACCOUNT_TYPES.PLATFORM_FEES);
  const courierBalance = ledger.getBalance(ACCOUNT_TYPES.COURIER_PAYABLE);
  const escrowBalance = ledger.getBalance(ACCOUNT_TYPES.GATEWAY_ESCROW);
  const customerBalance = ledger.getBalance(ACCOUNT_TYPES.CUSTOMER_RECEIVABLE);

  return {
    platformCommissions: feeBalance.net,
    courierPayable: courierBalance.net,
    escrowHeld: escrowBalance.net,
    customerReceivable: customerBalance.net,
    lastUpdated: new Date().toISOString(),
  };
}

module.exports = {
  PAYMENT_STATUSES,
  WEBHOOK_EVENTS,
  PaymentError,
  generateOAuthUrl,
  handleOAuthCallback,
  createPaymentPreference,
  validateWebhookSignature,
  processPaymentWebhook,
  processSettlementWebhook,
  getMerchantBalance,
  getPlatformBalance,
};
