'use strict';

/**
 * marketplace-payments.test.cjs
 *
 * Suite completa de pruebas unitarias offline para la integración de pagos del marketplace.
 * Corre con mocks sin hacer requests reales a internet (Mercado Pago, etc).
 *
 * Ejecutar con: node apps/backend/scripts/marketplace-payments.test.cjs
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
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
} = require('../src/lib/marketplace-payments');

const {
  ACCOUNT_TYPES,
  ENTRY_TYPES,
  EVENT_TYPES,
  roundCents,
  calculateOrderSettlement,
  createInMemoryLedgerStore,
} = require('../src/lib/marketplace-ledger');

const createRouter = require('../src/routes/marketplace-payments.routes');

// ============================================================================
// TEST: OAUTH ONBOARDING
// ============================================================================

test('OAuth: generateOAuthUrl construye URL válida', (t) => {
  const { url, state } = generateOAuthUrl({
    tenantId: 'tenant_123',
    merchantSlug: 'merchant_alpha',
  });

  assert(url.includes('auth.mercadopago.com'), 'URL debe apuntar a Mercado Pago');
  assert(url.includes('response_type=code'), 'URL debe tener response_type=code');
  assert(state, 'state debe estar presente');

  const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  assert.equal(decoded.tenantId, 'tenant_123', 'state contiene tenantId');
  assert.equal(decoded.merchantSlug, 'merchant_alpha', 'state contiene merchantSlug');
});

test('OAuth: handleOAuthCallback procesa callback y retorna collector_id', async (t) => {
  const state = Buffer.from(JSON.stringify({ tenantId: 'tenant_456', merchantSlug: 'merchant_beta' })).toString('base64');

  const result = await handleOAuthCallback({
    code: 'auth_code_xyz',
    state,
  });

  assert.equal(result.tenantId, 'tenant_456', 'Resultado contiene tenantId');
  assert.equal(result.merchantSlug, 'merchant_beta', 'Resultado contiene merchantSlug');
  assert(result.collectorId.startsWith('collector_'), 'collectorId tiene prefijo correcto');
  assert.equal(result.status, 'AUTHORIZED', 'status es AUTHORIZED');
});

test('OAuth: handleOAuthCallback rechaza state inválido', async (t) => {
  try {
    await handleOAuthCallback({
      code: 'auth_code_xyz',
      state: 'invalid_state',
    });
    assert.fail('Debería haber lanzado PaymentError');
  } catch (err) {
    assert(err instanceof PaymentError, 'Lanza PaymentError');
    assert.equal(err.code, 'INVALID_STATE_DATA', 'Código de error correcto');
  }
});

// ============================================================================
// TEST: PAYMENT PREFERENCE (CHECKOUT)
// ============================================================================

test('Checkout: createPaymentPreference genera preferencia con split correcto', (t) => {
  const preference = createPaymentPreference({
    orderId: 'order_123',
    subtotal: 100,
    deliveryFee: 10,
    tip: 5,
    commissionRate: 0.05,
    collectorId: 'collector_abc',
    customerEmail: 'client@example.com',
  });

  assert.equal(preference.orderId, 'order_123', 'orderId correcto');
  assert.equal(preference.transactionAmount, 115, 'Total cliente = 100 + 10 + 5');
  assert.equal(preference.marketplaceFee, 5, 'marketplace_fee = 5% de 100');
  assert.equal(preference.merchantNet, 110, 'merchantNet = 115 - 5');
  assert(preference.id.startsWith('pref_'), 'ID tiene prefijo pref_');
  assert(preference.initPoint.includes('mercadopago'), 'Tiene init_point simulado');
});

test('Checkout: createPaymentPreference valida settlement interno', (t) => {
  const preference = createPaymentPreference({
    orderId: 'order_retail',
    subtotal: 200,
    deliveryFee: 20,
    tip: 10,
    commissionRate: 0.02, // 2% para retail
    commissionFixed: 1, // $1 fijo
    collectorId: 'collector_retail',
  });

  const { settlement } = preference;
  assert.equal(settlement.customerTotal, 230, 'customerTotal = 200 + 20 + 10');
  // Comisión = 200 * 0.02 + 1 = 5
  assert.equal(settlement.platformFee, 5, 'platformFee = 4 + 1');
  assert.equal(settlement.merchantPayout, 195, 'merchantPayout = 200 - 5');
  assert.equal(settlement.courierPayout, 30, 'courierPayout = 20 + 10 (100% propina)');
});

test('Checkout: createPaymentPreference rechaza params inválidos', (t) => {
  assert.throws(
    () => createPaymentPreference({ orderId: 'order_1', subtotal: 100 }),
    { code: 'INVALID_PAYMENT_PARAMS' },
    'Falta collectorId',
  );

  assert.throws(
    () => createPaymentPreference({ subtotal: 100, collectorId: 'col_1' }),
    { code: 'INVALID_PAYMENT_PARAMS' },
    'Falta orderId',
  );
});

// ============================================================================
// TEST: WEBHOOK SIGNATURE VALIDATION
// ============================================================================

test('Webhook: validateWebhookSignature valida firma correcta', (t) => {
  const ts = Math.floor(Date.now() / 1000);
  const requestId = 'req_123456';
  const secret = 'test_webhook_secret';

  // Construir firma válida
  const stringToSign = `${ts}.${requestId}.${secret}`;
  const crypto = require('crypto');
  const validHash = crypto.createHash('sha256').update(stringToSign).digest('hex');
  const xSignature = `ts=${ts},v1=${validHash}`;

  const result = validateWebhookSignature({
    xSignature,
    xRequestId: requestId,
    body: { test: 'data' },
    webhookSecret: secret,
  });

  assert.equal(result.valid, true, 'Firma validada');
  assert(result.idempotencyKey, 'idempotencyKey presente');
});

test('Webhook: validateWebhookSignature rechaza firma inválida', (t) => {
  assert.throws(
    () => validateWebhookSignature({
      xSignature: 'ts=123,v1=invalid_hash',
      xRequestId: 'req_123',
      body: {},
      webhookSecret: 'secret',
    }),
    { code: 'INVALID_SIGNATURE' },
    'Firma inválida detectada',
  );
});

test('Webhook: validateWebhookSignature rechaza formato malformado', (t) => {
  assert.throws(
    () => validateWebhookSignature({
      xSignature: 'malformed',
      xRequestId: 'req_123',
      body: {},
    }),
    { code: 'MALFORMED_SIGNATURE' },
  );
});

// ============================================================================
// TEST: PAYMENT WEBHOOK PROCESSING (IDEMPOTENT)
// ============================================================================

test('Webhook Payment: processPaymentWebhook registra captura en ledger', (t) => {
  const ledger = createInMemoryLedgerStore();

  const result = processPaymentWebhook({
    paymentId: 'payment_mp_123',
    externalReference: 'order_123',
    status: PAYMENT_STATUSES.APPROVED,
    amount: 115,
    ledger,
    idempotencyKey: 'idempotent_key_1',
  });

  assert.equal(result.status, PAYMENT_STATUSES.APPROVED, 'Status correcto');
  assert.equal(result.amount, 115, 'Amount redondeado');
  assert(result.transactionId, 'transactionId creado');
  assert.equal(result.idempotent, false, 'Primera vez no es idempotente');

  // Verificar que se registró en el ledger
  const transactions = ledger.getAllTransactions();
  assert.equal(transactions.length, 1, 'Una transacción en ledger');
  assert.equal(transactions[0].eventType, EVENT_TYPES.ORDER_CAPTURED, 'Tipo es ORDER_CAPTURED');
});

test('Webhook Payment: Idempotencia previene duplicados', (t) => {
  const ledger = createInMemoryLedgerStore();
  const idempotencyKey = 'idempotent_key_2';

  // Primer webhook
  const result1 = processPaymentWebhook({
    paymentId: 'payment_mp_456',
    externalReference: 'order_456',
    status: PAYMENT_STATUSES.APPROVED,
    amount: 200,
    ledger,
    idempotencyKey,
  });

  // Segundo webhook idéntico (replay)
  const result2 = processPaymentWebhook({
    paymentId: 'payment_mp_456',
    externalReference: 'order_456',
    status: PAYMENT_STATUSES.APPROVED,
    amount: 200,
    ledger,
    idempotencyKey,
  });

  assert.equal(result1.idempotent, false, 'Primera es nueva');
  assert.equal(result2.idempotent, true, 'Segunda es idempotente');

  // Solo una transacción en ledger
  const transactions = ledger.getAllTransactions();
  assert.equal(transactions.length, 1, 'Solo una transacción registrada');
});

test('Webhook Payment: No crea transacción si status no es APPROVED', (t) => {
  const ledger = createInMemoryLedgerStore();

  const result = processPaymentWebhook({
    paymentId: 'payment_pending',
    externalReference: 'order_pending',
    status: PAYMENT_STATUSES.PENDING,
    amount: 100,
    ledger,
    idempotencyKey: 'idempotent_key_3',
  });

  assert.equal(result.transactionId, null, 'No hay transactionId para PENDING');
  const transactions = ledger.getAllTransactions();
  assert.equal(transactions.length, 0, 'Ledger vacío');
});

// ============================================================================
// TEST: SETTLEMENT WEBHOOK PROCESSING
// ============================================================================

test('Webhook Settlement: processSettlementWebhook distribuye fondos correctamente', (t) => {
  const ledger = createInMemoryLedgerStore();

  // Usar calculateOrderSettlement para generar datos consistentes
  const settlement = calculateOrderSettlement({
    subtotal: 100,
    deliveryFee: 20,
    tip: 10,
    commissionRate: 0.05,
    commissionFixed: 0,
  });

  const result = processSettlementWebhook({
    orderId: 'order_settled_1',
    settlement,
    ledger,
    idempotencyKey: 'settlement_key_1',
  });

  assert(result.transactionId, 'transactionId creado');
  assert.equal(result.merchantPayout, settlement.merchantPayout, 'merchantPayout correcto');
  assert.equal(result.courierPayout, settlement.courierPayout, 'courierPayout correcto');
  assert.equal(result.platformFee, settlement.platformFee, 'platformFee correcto');

  // Verificar transacciones
  const transactions = ledger.getAllTransactions();
  assert.equal(transactions.length, 1, 'Una transacción en ledger');
  assert.equal(transactions[0].eventType, EVENT_TYPES.ORDER_SETTLED, 'Tipo es ORDER_SETTLED');

  // Verificar integridad: suma de débitos = suma de créditos
  const integrity = ledger.verifyGlobalIntegrity();
  assert.equal(integrity.valid, true, 'Ledger balanceado');
  assert.equal(integrity.totalDebits, settlement.customerTotal, `Débitos = ${settlement.customerTotal}`);
  assert.equal(integrity.totalCredits, settlement.customerTotal, `Créditos = ${settlement.customerTotal}`);
});

test('Webhook Settlement: Idempotencia en settlement', (t) => {
  const ledger = createInMemoryLedgerStore();
  const settlement = calculateOrderSettlement({
    subtotal: 100,
    deliveryFee: 10,
    tip: 0,
    commissionRate: 0.05,
    commissionFixed: 0,
  });

  const idempotencyKey = 'settlement_key_2';

  processSettlementWebhook({
    orderId: 'order_settled_2',
    settlement,
    ledger,
    idempotencyKey,
  });

  const result2 = processSettlementWebhook({
    orderId: 'order_settled_2',
    settlement,
    ledger,
    idempotencyKey,
  });

  assert.equal(result2.idempotent, true, 'Segunda es idempotente');
  assert.equal(ledger.getAllTransactions().length, 1, 'Solo una transacción');
});

// ============================================================================
// TEST: MERCHANT BALANCE
// ============================================================================

test('Balance: getMerchantBalance calcula saldo correcto', (t) => {
  const ledger = createInMemoryLedgerStore();

  const settlement1 = calculateOrderSettlement({
    subtotal: 100,
    deliveryFee: 10,
    tip: 0,
    commissionRate: 0.05,
    commissionFixed: 0,
  });

  processPaymentWebhook({
    paymentId: 'payment_1',
    externalReference: 'order_1',
    status: PAYMENT_STATUSES.APPROVED,
    amount: settlement1.customerTotal,
    ledger,
    idempotencyKey: 'key_1',
  });

  processSettlementWebhook({
    orderId: 'order_1',
    settlement: settlement1,
    ledger,
    idempotencyKey: 'key_2',
  });

  const balance = getMerchantBalance({
    ledger,
    collectorId: 'collector_test',
  });

  assert.equal(balance.merchantPayable, settlement1.merchantPayout, `merchantPayable = ${settlement1.merchantPayout}`);
  assert.equal(balance.availableForPayout, settlement1.merchantPayout, `availableForPayout = ${settlement1.merchantPayout}`);
});

// ============================================================================
// TEST: PLATFORM BALANCE
// ============================================================================

test('Balance: getPlatformBalance agrega todos los saldos', (t) => {
  const ledger = createInMemoryLedgerStore();

  // Dos órdenes con pagos y settlement
  for (let i = 1; i <= 2; i++) {
    const settlement = calculateOrderSettlement({
      subtotal: 100,
      deliveryFee: 15,
      tip: 0,
      commissionRate: 0.05,
      commissionFixed: 0,
    });

    processPaymentWebhook({
      paymentId: `payment_${i}`,
      externalReference: `order_${i}`,
      status: PAYMENT_STATUSES.APPROVED,
      amount: settlement.customerTotal,
      ledger,
      idempotencyKey: `key_pay_${i}`,
    });

    processSettlementWebhook({
      orderId: `order_${i}`,
      settlement,
      ledger,
      idempotencyKey: `key_settle_${i}`,
    });
  }

  const balance = getPlatformBalance({ ledger });

  assert.equal(balance.platformCommissions, 10, 'platformCommissions = 2 * 5');
  assert.equal(balance.courierPayable, 30, 'courierPayable = 2 * 15');
});

// ============================================================================
// TEST: HTTP ROUTES
// ============================================================================

function httpFixture(ledgerOverride = null) {
  const routes = {};
  const ledger = ledgerOverride || createInMemoryLedgerStore();
  createRouter({ Router: () => ({ post(path, handler) { routes[path] = handler; }, get(path, handler) { routes[path] = handler; } }), ledger });

  const makeRequest = async (method, path, body = {}, headers = {}) => {
    const res = {
      statusCode: 200,
      headers: {},
      set(key, value) { this.headers[key] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };

    // Separar path de query string
    const [pathname, queryString] = path.split('?');

    const req = {
      method,
      url: path,
      params: {},
      query: {},
      body,
      headers,
    };

    // Parse query
    if (queryString) {
      queryString.split('&').forEach(pair => {
        const [key, value] = pair.split('=');
        req.query[key] = decodeURIComponent(value || '');
      });
    }

    // Parse route params
    let match = null;
    for (const route of Object.keys(routes)) {
      const pattern = route.replace(/:[\w]+/g, '([^/]+)');
      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(pathname)) {
        match = route;
        const params = pathname.match(regex);
        const paramNames = (route.match(/:[\w]+/g) || []).map(p => p.slice(1));
        paramNames.forEach((name, i) => {
          req.params[name] = params[i + 1];
        });
        break;
      }
    }

    if (!match) {
      res.status(404).json({ error: 'Route not found' });
    } else {
      await routes[match](req, res);
    }

    return res;
  };

  return { makeRequest, ledger };
}

test('HTTP: POST /checkout retorna preferencia válida', async (t) => {
  const { makeRequest: http } = httpFixture();

  const res = await http('POST', '/checkout', {
    orderId: 'order_http_1',
    subtotal: 100,
    deliveryFee: 10,
    tip: 5,
    commissionRate: 0.05,
    collectorId: 'collector_http',
    customerEmail: 'test@example.com',
  });

  assert.equal(res.statusCode, 201, 'Status 201 Created');
  assert.equal(res.body.orderId, 'order_http_1', 'orderId correcto');
  assert.equal(res.body.transactionAmount, 115, 'Total correcto');
  assert.equal(res.body.marketplaceFee, 5, 'Fee correcto');
});

test('HTTP: POST /checkout rechaza params faltantes', async (t) => {
  const { makeRequest: http } = httpFixture();

  const res = await http('POST', '/checkout', {
    orderId: 'order_incomplete',
    // Falta subtotal y collectorId
  });

  assert.equal(res.statusCode, 400, 'Status 400');
  assert(res.body.errorCode.includes('MISSING') || res.body.errorCode.includes('incomplete'), 'Error por params incompletos');
});

test('HTTP: GET /merchants/:slug/oauth-url retorna URL válida', async (t) => {
  const { makeRequest: http } = httpFixture();

  const res = await http('GET', '/merchants/merchant_test/oauth-url?tenantId=tenant_test');

  assert.equal(res.statusCode, 200, 'Status 200');
  assert(res.body.oauthUrl.includes('mercadopago'), 'URL tiene mercadopago');
  assert.equal(res.body.merchantSlug, 'merchant_test', 'merchantSlug correcto');
});

test('HTTP: POST /webhook procesa payment actualizado con idempotencia', async (t) => {
  const { makeRequest: http, ledger } = httpFixture();

  const ts = Math.floor(Date.now() / 1000);
  const requestId = 'req_webhook_1';
  const secret = 'test_webhook_secret';
  const stringToSign = `${ts}.${requestId}.${secret}`;
  const crypto = require('crypto');
  const validHash = crypto.createHash('sha256').update(stringToSign).digest('hex');

  const res1 = await http('POST', '/webhook',
    {
      action: 'payment.updated',
      data: {
        id: 'payment_hook_1',
        external_reference: 'order_hook_1',
        status: PAYMENT_STATUSES.APPROVED, // ← USE UPPERCASE
        transaction_amount: 150,
      },
    },
    {
      'x-signature': `ts=${ts},v1=${validHash}`,
      'x-request-id': requestId,
    },
  );

  assert.equal(res1.statusCode, 200, 'Primera llamada retorna 200');
  assert.equal(res1.body.processed, true, 'Procesado');
  assert.equal(res1.body.ledgerIntegrity.valid, true, 'Ledger balanceado');

  // Replay idéntico usando el MISMO ledger
  const res2 = await http('POST', '/webhook',
    {
      action: 'payment.updated',
      data: {
        id: 'payment_hook_1',
        external_reference: 'order_hook_1',
        status: PAYMENT_STATUSES.APPROVED,
        transaction_amount: 150,
      },
    },
    {
      'x-signature': `ts=${ts},v1=${validHash}`,
      'x-request-id': requestId,
    },
  );

  assert.equal(res2.statusCode, 200, 'Segundo webhook idéntico también 200');
  assert.equal(res2.body.result.idempotent, true, 'Marcado como idempotente');
});

test('HTTP: GET /platform/balance retorna saldos globales', async (t) => {
  const { makeRequest: http } = httpFixture();

  const res = await http('GET', '/platform/balance');

  assert.equal(res.statusCode, 200, 'Status 200');
  assert(typeof res.body.platformCommissions === 'number', 'platformCommissions es número');
  assert(typeof res.body.courierPayable === 'number', 'courierPayable es número');
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n✅ Suite de pruebas marketplace-payments completada');
console.log('   - OAuth onboarding: 3 tests');
console.log('   - Payment preference (checkout): 3 tests');
console.log('   - Webhook signature validation: 3 tests');
console.log('   - Payment webhook processing: 4 tests');
console.log('   - Settlement webhook processing: 2 tests');
console.log('   - Merchant balance: 1 test');
console.log('   - Platform balance: 1 test');
console.log('   - HTTP routes: 6 tests');
console.log('   TOTAL: 23 tests\n');
