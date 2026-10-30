'use strict';

/**
 * marketplace-ledger.test.cjs
 *
 * Suite de pruebas unitarias offline para el motor contable de doble entrada (Ledger)
 * y conciliación financiera del marketplace MRTPVREST.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ACCOUNT_TYPES,
  ENTRY_TYPES,
  EVENT_TYPES,
  UnbalancedTransactionError,
  DuplicateTransactionError,
  roundCents,
  calculateOrderSettlement,
  createLedgerTransaction,
  buildOrderCaptureTransaction,
  buildOrderSettlementTransaction,
  buildOrderRefundTransaction,
  createInMemoryLedgerStore,
} = require('../src/lib/marketplace-ledger');

test('roundCents: redondea a 2 decimales y rechaza valores inválidos', () => {
  assert.equal(roundCents(10.555), 10.56);
  assert.equal(roundCents(10.554), 10.55);
  assert.equal(roundCents(0), 0);
  assert.equal(roundCents(100), 100);
  assert.throws(() => roundCents('100'), { code: 'INVALID_AMOUNT' });
  assert.throws(() => roundCents(NaN), { code: 'INVALID_AMOUNT' });
  assert.throws(() => roundCents(Infinity), { code: 'INVALID_AMOUNT' });
});

test('calculateOrderSettlement: orden estándar de restaurante con comisión porcentual y propina', () => {
  const settlement = calculateOrderSettlement({
    subtotal: 250,
    deliveryFee: 35,
    tip: 20,
    commissionRate: 0.05, // 5%
    commissionFixed: 0,
  });

  assert.equal(settlement.subtotal, 250);
  assert.equal(settlement.deliveryFee, 35);
  assert.equal(settlement.tip, 20);
  assert.equal(settlement.platformFee, 12.50); // 5% de 250
  assert.equal(settlement.merchantPayout, 237.50); // 250 - 12.50
  assert.equal(settlement.courierPayout, 55.00); // 35 + 20
  assert.equal(settlement.customerTotal, 305.00); // 250 + 35 + 20

  // Verificación del balance estricto: Total cobrado = suma de dispersiones
  assert.equal(
    settlement.customerTotal,
    roundCents(settlement.merchantPayout + settlement.courierPayout + settlement.platformFee)
  );
});

test('calculateOrderSettlement: modelo retail puro con comisión fija cero ($0 renta, comercio recibe 100%)', () => {
  const settlement = calculateOrderSettlement({
    subtotal: 1200,
    deliveryFee: 60,
    tip: 0,
    commissionRate: 0, // Sin comisión
    commissionFixed: 0,
  });

  assert.equal(settlement.platformFee, 0);
  assert.equal(settlement.merchantPayout, 1200);
  assert.equal(settlement.courierPayout, 60);
  assert.equal(settlement.customerTotal, 1260);
  assert.equal(
    settlement.customerTotal,
    roundCents(settlement.merchantPayout + settlement.courierPayout + settlement.platformFee)
  );
});

test('calculateOrderSettlement: rechaza montos negativos', () => {
  assert.throws(() => calculateOrderSettlement({ subtotal: -10, deliveryFee: 30 }), {
    code: 'NEGATIVE_AMOUNT',
  });
  assert.throws(() => calculateOrderSettlement({ subtotal: 100, deliveryFee: -5 }), {
    code: 'NEGATIVE_AMOUNT',
  });
});

test('createLedgerTransaction: crea transacción balanceada con hash inmutable', () => {
  const tx = createLedgerTransaction({
    eventType: EVENT_TYPES.ORDER_CAPTURED,
    orderId: 'ord_test_01',
    entries: [
      { account: ACCOUNT_TYPES.CUSTOMER_RECEIVABLE, type: ENTRY_TYPES.DEBIT, amount: 150 },
      { account: ACCOUNT_TYPES.GATEWAY_ESCROW, type: ENTRY_TYPES.CREDIT, amount: 150 },
    ],
  });

  assert.ok(tx.id);
  assert.ok(tx.hash);
  assert.equal(tx.totalAmount, 150);
  assert.equal(tx.entries.length, 2);
  assert.equal(tx.entries[0].type, ENTRY_TYPES.DEBIT);
  assert.equal(tx.entries[1].type, ENTRY_TYPES.CREDIT);
  assert.throws(() => {
    tx.totalAmount = 200; // Inmutabilidad congelada
  });
});

test('createLedgerTransaction: detecta y rechaza transacciones desbalanceadas (UnbalancedTransactionError)', () => {
  assert.throws(
    () =>
      createLedgerTransaction({
        eventType: EVENT_TYPES.ORDER_CAPTURED,
        orderId: 'ord_bad_01',
        entries: [
          { account: ACCOUNT_TYPES.CUSTOMER_RECEIVABLE, type: ENTRY_TYPES.DEBIT, amount: 100 },
          { account: ACCOUNT_TYPES.GATEWAY_ESCROW, type: ENTRY_TYPES.CREDIT, amount: 90 }, // Diferencia de 10
        ],
      }),
    (err) => {
      assert.ok(err instanceof UnbalancedTransactionError);
      assert.equal(err.code, 'UNBALANCED_TRANSACTION');
      assert.equal(err.difference, 10);
      return true;
    }
  );
});

test('createLedgerTransaction: valida cuentas y tipos de asiento existentes', () => {
  assert.throws(
    () =>
      createLedgerTransaction({
        eventType: 'EVENTO_INVENTADO',
        orderId: 'ord_01',
        entries: [
          { account: ACCOUNT_TYPES.CUSTOMER_RECEIVABLE, type: ENTRY_TYPES.DEBIT, amount: 50 },
          { account: ACCOUNT_TYPES.GATEWAY_ESCROW, type: ENTRY_TYPES.CREDIT, amount: 50 },
        ],
      }),
    { code: 'INVALID_EVENT_TYPE' }
  );

  assert.throws(
    () =>
      createLedgerTransaction({
        eventType: EVENT_TYPES.ORDER_CAPTURED,
        orderId: 'ord_01',
        entries: [
          { account: 'CUENTA_FANTASMA', type: ENTRY_TYPES.DEBIT, amount: 50 },
          { account: ACCOUNT_TYPES.GATEWAY_ESCROW, type: ENTRY_TYPES.CREDIT, amount: 50 },
        ],
      }),
    { code: 'INVALID_ACCOUNT' }
  );

  assert.throws(
    () =>
      createLedgerTransaction({
        eventType: EVENT_TYPES.ORDER_CAPTURED,
        orderId: 'ord_01',
        entries: [
          { account: ACCOUNT_TYPES.CUSTOMER_RECEIVABLE, type: ENTRY_TYPES.DEBIT, amount: 0 },
          { account: ACCOUNT_TYPES.GATEWAY_ESCROW, type: ENTRY_TYPES.CREDIT, amount: 0 },
        ],
      }),
    { code: 'NON_POSITIVE_AMOUNT' }
  );
});

test('buildOrderSettlementTransaction: genera desglose a 3 bandas perfectamente balanceado', () => {
  const settlement = calculateOrderSettlement({
    subtotal: 500,
    deliveryFee: 40,
    tip: 25,
    commissionRate: 0.10, // 10% de 500 = 50
  });

  const tx = buildOrderSettlementTransaction({
    orderId: 'ord_settle_01',
    settlement,
  });

  assert.equal(tx.eventType, EVENT_TYPES.ORDER_SETTLED);
  assert.equal(tx.totalAmount, 565);

  const debit = tx.entries.find((e) => e.type === ENTRY_TYPES.DEBIT);
  const credits = tx.entries.filter((e) => e.type === ENTRY_TYPES.CREDIT);

  assert.equal(debit.account, ACCOUNT_TYPES.GATEWAY_ESCROW);
  assert.equal(debit.amount, 565);

  const merchantCredit = credits.find((e) => e.account === ACCOUNT_TYPES.MERCHANT_PAYABLE);
  const courierCredit = credits.find((e) => e.account === ACCOUNT_TYPES.COURIER_PAYABLE);
  const platformCredit = credits.find((e) => e.account === ACCOUNT_TYPES.PLATFORM_FEES);

  assert.equal(merchantCredit.amount, 450); // 500 - 50
  assert.equal(courierCredit.amount, 65);   // 40 + 25
  assert.equal(platformCredit.amount, 50);  // Comisión

  // Suma de créditos = 450 + 65 + 50 = 565
  assert.equal(roundCents(merchantCredit.amount + courierCredit.amount + platformCredit.amount), 565);
});

test('buildOrderRefundTransaction: genera reembolso simétrico al cliente', () => {
  const tx = buildOrderRefundTransaction({
    orderId: 'ord_refund_01',
    amount: 180.50,
  });

  assert.equal(tx.eventType, EVENT_TYPES.ORDER_REFUNDED);
  assert.equal(tx.totalAmount, 180.50);
  assert.equal(tx.entries[0].account, ACCOUNT_TYPES.GATEWAY_ESCROW);
  assert.equal(tx.entries[0].type, ENTRY_TYPES.DEBIT);
  assert.equal(tx.entries[1].account, ACCOUNT_TYPES.CUSTOMER_RECEIVABLE);
  assert.equal(tx.entries[1].type, ENTRY_TYPES.CREDIT);
});

test('createInMemoryLedgerStore: simula ciclo de vida completo (Captura -> Liquidación -> Verificación Global)', () => {
  const store = createInMemoryLedgerStore();

  const orderId = 'ord_sim_999';
  const subtotal = 400;
  const deliveryFee = 50;
  const tip = 30;
  const settlement = calculateOrderSettlement({ subtotal, deliveryFee, tip, commissionRate: 0.08 }); // 8% = 32

  // 1. Cobro capturado
  const captureTx = buildOrderCaptureTransaction({
    orderId,
    amount: settlement.customerTotal, // 480
    referenceId: 'mp_pay_123456',
  });
  store.record(captureTx, 'idemp_capture_999');

  // En custodia de pasarela debe haber $480
  let escrowBal = store.getBalance(ACCOUNT_TYPES.GATEWAY_ESCROW);
  assert.equal(escrowBal.credits, 480);
  assert.equal(escrowBal.net, 480);

  // 2. Intento de duplicar la captura con la misma clave de idempotencia falla
  assert.throws(() => store.record(captureTx, 'idemp_capture_999'), (err) => {
    assert.ok(err instanceof DuplicateTransactionError);
    assert.equal(err.idempotencyKey, 'idemp_capture_999');
    return true;
  });

  // 3. Liquidación al entregar
  const settleTx = buildOrderSettlementTransaction({
    orderId,
    settlement,
    referenceId: 'dispatch_task_777',
  });
  store.record(settleTx, 'idemp_settle_999');

  // El saldo en custodia de pasarela debe quedar en CERO (fondos liberados)
  escrowBal = store.getBalance(ACCOUNT_TYPES.GATEWAY_ESCROW);
  assert.equal(escrowBal.net, 0);

  // Saldo a favor del comercio (400 - 32 = 368)
  const merchantBal = store.getBalance(ACCOUNT_TYPES.MERCHANT_PAYABLE);
  assert.equal(merchantBal.net, 368);

  // Saldo a favor del repartidor (50 + 30 = 80)
  const courierBal = store.getBalance(ACCOUNT_TYPES.COURIER_PAYABLE);
  assert.equal(courierBal.net, 80);

  // Ganancia devengada de la plataforma (32)
  const platformBal = store.getBalance(ACCOUNT_TYPES.PLATFORM_FEES);
  assert.equal(platformBal.net, 32);

  // 4. Verificación global de suma cero
  const integrity = store.verifyGlobalIntegrity();
  assert.equal(integrity.valid, true);
  assert.equal(integrity.discrepancy, 0);
  assert.equal(integrity.transactionCount, 2);
  // Total movido en débitos = 480 (captura) + 480 (liquidación) = 960
  assert.equal(integrity.totalDebits, 960);
  assert.equal(integrity.totalCredits, 960);
});
