'use strict';

/**
 * marketplace-ledger.js
 *
 * Motor contable inmutable de doble entrada (Double-Entry Ledger) para MRTPVREST Marketplace.
 * Garantiza que en cada transacción los débitos y créditos estén perfectamente equilibrados (suma cero).
 *
 * Invariante: sum(DEBIT) === sum(CREDIT)
 */

const crypto = require('crypto');

const ACCOUNT_TYPES = Object.freeze({
  GATEWAY_ESCROW: 'GATEWAY_ESCROW',         // Fondos retenidos por Mercado Pago / pasarela
  CUSTOMER_RECEIVABLE: 'CUSTOMER_RECEIVABLE', // Cargo cobrado al cliente final
  MERCHANT_PAYABLE: 'MERCHANT_PAYABLE',       // Pasivo por pagar a la tienda / comercio
  COURIER_PAYABLE: 'COURIER_PAYABLE',         // Pasivo por pagar al repartidor
  PLATFORM_FEES: 'PLATFORM_FEES',             // Comisión ganada por el marketplace
  PLATFORM_PROMO_SUBSIDY: 'PLATFORM_PROMO_SUBSIDY', // Contrapartida de promos subsidiadas
});

const ENTRY_TYPES = Object.freeze({
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT',
});

const EVENT_TYPES = Object.freeze({
  ORDER_CAPTURED: 'ORDER_CAPTURED',
  ORDER_SETTLED: 'ORDER_SETTLED',
  ORDER_REFUNDED: 'ORDER_REFUNDED',
  PAYOUT_DISBURSED: 'PAYOUT_DISBURSED',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
});

class LedgerError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'LedgerError';
    this.code = code || 'LEDGER_ERROR';
  }
}

class UnbalancedTransactionError extends LedgerError {
  constructor(totalDebits, totalCredits, diff) {
    super(
      `Transacción desbalanceada: Débitos (${totalDebits}) != Créditos (${totalCredits}), diferencia: ${diff}`,
      'UNBALANCED_TRANSACTION'
    );
    this.totalDebits = totalDebits;
    this.totalCredits = totalCredits;
    this.difference = diff;
  }
}

class DuplicateTransactionError extends LedgerError {
  constructor(idempotencyKey) {
    super(`Transacción duplicada detectada para la clave: ${idempotencyKey}`, 'DUPLICATE_TRANSACTION');
    this.idempotencyKey = idempotencyKey;
  }
}

/**
 * Redondea un valor numérico a 2 decimales para evitar anomalías IEEE 754 de coma flotante.
 * @param {number} amount
 * @returns {number}
 */
function roundCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new LedgerError(`Monto inválido para redondeo contable: ${amount}`, 'INVALID_AMOUNT');
  }
  return Math.round(amount * 100) / 100;
}

/**
 * Calcula el desglose financiero de una orden de acuerdo al modelo de negocio de MRTPVREST.
 *
 * @param {Object} params
 * @param {number} params.subtotal - Subtotal de productos
 * @param {number} params.deliveryFee - Tarifa de entrega
 * @param {number} [params.tip=0] - Propina al repartidor (100% destinada al courier)
 * @param {number} [params.commissionRate=0.05] - Tasa de comisión de plataforma (ej. 0.05 para 5%, o 0 para retail puro sin renta)
 * @param {number} [params.commissionFixed=0] - Cargo fijo por transacción
 * @returns {Object} Desglose contable
 */
function calculateOrderSettlement({
  subtotal,
  deliveryFee,
  tip = 0,
  commissionRate = 0.05,
  commissionFixed = 0,
}) {
  const cleanSubtotal = roundCents(subtotal);
  const cleanDeliveryFee = roundCents(deliveryFee);
  const cleanTip = roundCents(tip);

  if (cleanSubtotal < 0 || cleanDeliveryFee < 0 || cleanTip < 0) {
    throw new LedgerError('Los montos de la orden no pueden ser negativos', 'NEGATIVE_AMOUNT');
  }

  // Comisión calculada sobre el subtotal de productos
  let platformFee = roundCents(cleanSubtotal * commissionRate + commissionFixed);
  if (platformFee > cleanSubtotal) {
    platformFee = cleanSubtotal; // La comisión no puede exceder el valor de los productos
  }

  const merchantPayout = roundCents(cleanSubtotal - platformFee);
  const courierPayout = roundCents(cleanDeliveryFee + cleanTip);
  const customerTotal = roundCents(cleanSubtotal + cleanDeliveryFee + cleanTip);

  // Verificación aritmética de integridad
  const distributedSum = roundCents(merchantPayout + courierPayout + platformFee);
  if (Math.abs(customerTotal - distributedSum) > 0.001) {
    throw new LedgerError(
      `Discrepancia en el desglose contable: total cliente (${customerTotal}) != suma distribuida (${distributedSum})`,
      'CALCULATION_DISCREPANCY'
    );
  }

  return {
    customerTotal,
    merchantPayout,
    courierPayout,
    platformFee,
    tip: cleanTip,
    subtotal: cleanSubtotal,
    deliveryFee: cleanDeliveryFee,
  };
}

/**
 * Crea una transacción de libro mayor validando balance estricto entre débitos y créditos.
 *
 * @param {Object} params
 * @param {string} params.eventType - Tipo de evento contable
 * @param {string} params.orderId - ID de la orden vinculada
 * @param {string} [params.referenceId] - Referencia externa (ej. ID de pago Mercado Pago)
 * @param {string} [params.currency='MXN'] - Moneda ISO 4217
 * @param {Array<Object>} params.entries - Asientos individuales
 * @param {string} [params.description=''] - Detalle descriptivo
 * @returns {Object} Transacción contable inmutable
 */
function createLedgerTransaction({
  eventType,
  orderId,
  referenceId = null,
  currency = 'MXN',
  entries,
  description = '',
  createdAt = new Date(),
}) {
  if (!EVENT_TYPES[eventType]) {
    throw new LedgerError(`Tipo de evento contable inválido: ${eventType}`, 'INVALID_EVENT_TYPE');
  }
  if (!orderId || typeof orderId !== 'string') {
    throw new LedgerError('El ID de orden es obligatorio', 'INVALID_ORDER_ID');
  }
  if (!Array.isArray(entries) || entries.length < 2) {
    throw new LedgerError('Una transacción de doble entrada requiere al menos 2 asientos', 'INSUFFICIENT_ENTRIES');
  }

  let totalDebits = 0;
  let totalCredits = 0;

  const validatedEntries = entries.map((entry, index) => {
    if (!ACCOUNT_TYPES[entry.account]) {
      throw new LedgerError(`Cuenta contable desconocida en índice ${index}: ${entry.account}`, 'INVALID_ACCOUNT');
    }
    if (!ENTRY_TYPES[entry.type]) {
      throw new LedgerError(`Tipo de asiento inválido en índice ${index}: ${entry.type}`, 'INVALID_ENTRY_TYPE');
    }
    const cleanAmount = roundCents(entry.amount);
    if (cleanAmount <= 0) {
      throw new LedgerError(`El monto en índice ${index} debe ser mayor a cero: ${cleanAmount}`, 'NON_POSITIVE_AMOUNT');
    }

    if (entry.type === ENTRY_TYPES.DEBIT) {
      totalDebits = roundCents(totalDebits + cleanAmount);
    } else {
      totalCredits = roundCents(totalCredits + cleanAmount);
    }

    return Object.freeze({
      id: crypto.randomUUID(),
      account: entry.account,
      type: entry.type,
      amount: cleanAmount,
      metadata: entry.metadata ? Object.freeze({ ...entry.metadata }) : null,
    });
  });

  const diff = roundCents(Math.abs(totalDebits - totalCredits));
  if (diff > 0.001) {
    throw new UnbalancedTransactionError(totalDebits, totalCredits, diff);
  }

  const transactionId = crypto.randomUUID();
  const txHash = crypto
    .createHash('sha256')
    .update(`${transactionId}:${orderId}:${eventType}:${totalDebits}:${createdAt.toISOString()}`)
    .digest('hex');

  return Object.freeze({
    id: transactionId,
    hash: txHash,
    eventType,
    orderId,
    referenceId,
    currency,
    totalAmount: totalDebits,
    description,
    createdAt: createdAt.toISOString(),
    entries: Object.freeze(validatedEntries),
  });
}

/**
 * Genera la transacción para la captura del cobro al cliente (ORDER_CAPTURED).
 */
function buildOrderCaptureTransaction({ orderId, referenceId, amount, currency = 'MXN', description = '' }) {
  const cleanAmount = roundCents(amount);
  return createLedgerTransaction({
    eventType: EVENT_TYPES.ORDER_CAPTURED,
    orderId,
    referenceId,
    currency,
    description: description || `Cobro capturado para orden ${orderId}`,
    entries: [
      { account: ACCOUNT_TYPES.CUSTOMER_RECEIVABLE, type: ENTRY_TYPES.DEBIT, amount: cleanAmount },
      { account: ACCOUNT_TYPES.GATEWAY_ESCROW, type: ENTRY_TYPES.CREDIT, amount: cleanAmount },
    ],
  });
}

/**
 * Genera la transacción de liquidación y distribución al completarse la entrega (ORDER_SETTLED).
 */
function buildOrderSettlementTransaction({ orderId, referenceId, settlement, currency = 'MXN', description = '' }) {
  const { customerTotal, merchantPayout, courierPayout, platformFee } = settlement;

  const entries = [
    // El procesador libera los fondos retenidos
    { account: ACCOUNT_TYPES.GATEWAY_ESCROW, type: ENTRY_TYPES.DEBIT, amount: customerTotal },
  ];

  if (merchantPayout > 0) entries.push({ account: ACCOUNT_TYPES.MERCHANT_PAYABLE, type: ENTRY_TYPES.CREDIT, amount: merchantPayout });

  // Se acredita al repartidor si hay entrega
  if (courierPayout > 0) {
    entries.push({ account: ACCOUNT_TYPES.COURIER_PAYABLE, type: ENTRY_TYPES.CREDIT, amount: courierPayout });
  }

  // Se acredita la comisión al marketplace si es mayor a 0
  if (platformFee > 0) {
    entries.push({ account: ACCOUNT_TYPES.PLATFORM_FEES, type: ENTRY_TYPES.CREDIT, amount: platformFee });
  }

  return createLedgerTransaction({
    eventType: EVENT_TYPES.ORDER_SETTLED,
    orderId,
    referenceId,
    currency,
    description: description || `Liquidación de orden ${orderId}`,
    entries,
  });
}

/**
 * Genera la transacción de reembolso total al cliente (ORDER_REFUNDED).
 */
function buildOrderRefundTransaction({ orderId, referenceId, amount, currency = 'MXN', description = '' }) {
  const cleanAmount = roundCents(amount);
  return createLedgerTransaction({
    eventType: EVENT_TYPES.ORDER_REFUNDED,
    orderId,
    referenceId,
    currency,
    description: description || `Reembolso de orden ${orderId}`,
    entries: [
      { account: ACCOUNT_TYPES.GATEWAY_ESCROW, type: ENTRY_TYPES.DEBIT, amount: cleanAmount },
      { account: ACCOUNT_TYPES.CUSTOMER_RECEIVABLE, type: ENTRY_TYPES.CREDIT, amount: cleanAmount },
    ],
  });
}

/**
 * Almacén contable en memoria para pruebas y validaciones sin base de datos activa.
 */
function createInMemoryLedgerStore() {
  const transactions = [];
  const processedIdempotencyKeys = new Map();

  return {
    /**
     * Registra una transacción validando idempotencia.
     */
    record(transaction, idempotencyKey = null) {
      if (idempotencyKey) {
        if (processedIdempotencyKeys.has(idempotencyKey)) {
          throw new DuplicateTransactionError(idempotencyKey);
        }
        processedIdempotencyKeys.set(idempotencyKey, {
          transactionId: transaction.id,
          recordedAt: new Date().toISOString(),
        });
      }
      transactions.push(transaction);
      return transaction;
    },

    /**
     * Devuelve el saldo neto de una cuenta contable específica.
     */
    getBalance(account) {
      let debits = 0;
      let credits = 0;

      for (const tx of transactions) {
        for (const entry of tx.entries) {
          if (entry.account === account) {
            if (entry.type === ENTRY_TYPES.DEBIT) {
              debits = roundCents(debits + entry.amount);
            } else {
              credits = roundCents(credits + entry.amount);
            }
          }
        }
      }

      // Para cuentas de pasivo e ingresos (CREDIT normales): saldo = créditos - débitos
      // Para cuentas de activo y cobros (DEBIT normales): saldo = débitos - créditos
      const isDebitNormal = account === ACCOUNT_TYPES.CUSTOMER_RECEIVABLE;
      const net = isDebitNormal ? roundCents(debits - credits) : roundCents(credits - debits);

      return {
        account,
        debits,
        credits,
        net,
      };
    },

    /**
     * Verifica la integridad global de todas las transacciones almacenadas.
     * Retorna true si sum(debits) === sum(credits) globalmente.
     */
    verifyGlobalIntegrity() {
      let totalDebits = 0;
      let totalCredits = 0;

      for (const tx of transactions) {
        for (const entry of tx.entries) {
          if (entry.type === ENTRY_TYPES.DEBIT) {
            totalDebits = roundCents(totalDebits + entry.amount);
          } else {
            totalCredits = roundCents(totalCredits + entry.amount);
          }
        }
      }

      const diff = roundCents(Math.abs(totalDebits - totalCredits));
      return {
        valid: diff === 0,
        totalDebits,
        totalCredits,
        discrepancy: diff,
        transactionCount: transactions.length,
      };
    },

    getAllTransactions() {
      return [...transactions];
    },

    hasIdempotencyKey(key) {
      return processedIdempotencyKeys.has(key);
    },
  };
}

/** Persist every line of one balanced event, joining the caller's transaction when supplied.
 * No upserts, partial duplicate suppression or mutations of existing ledger lines.
 */
async function recordLedgerTransaction({ transaction, paymentId, restaurantId, idempotencyKey, courierId, prismaClient }) {
  const { cents, decimal } = require('./marketplace-order-money');
  const fail = () => { throw new LedgerError('Asiento persistente invalido o inconsistente', 'LEDGER_INTEGRITY_ERROR'); };
  if (!prismaClient || !paymentId || !restaurantId || typeof idempotencyKey !== 'string' || !idempotencyKey
    || !transaction || !EVENT_TYPES[transaction.eventType] || transaction.currency !== 'MXN'
    || !Array.isArray(transaction.entries) || transaction.entries.length < 2 || transaction.entries.length > 20
    || !/^[a-f0-9]{64}$/.test(transaction.hash) || !Number.isFinite(Date.parse(transaction.createdAt))) fail();
  let debit = 0; let credit = 0;
  for (const entry of transaction.entries) {
    if (!ACCOUNT_TYPES[entry.account] || !ENTRY_TYPES[entry.type] || cents(entry.amount) <= 0) fail();
    if (entry.type === 'DEBIT') debit += cents(entry.amount); else credit += cents(entry.amount);
    if (entry.account === 'COURIER_PAYABLE' && (typeof courierId !== 'string' || !courierId)) fail();
  }
  const expectedHash = crypto.createHash('sha256').update(`${transaction.id}:${transaction.orderId}:${transaction.eventType}:${transaction.totalAmount}:${transaction.createdAt}`).digest('hex');
  if (debit !== credit || debit !== cents(transaction.totalAmount) || expectedHash !== transaction.hash) fail();
  const work = async tx => {
    const payment = await tx.marketplacePayment.findFirst({ where: { id: paymentId, restaurantId, orderId: transaction.orderId },
      select: { id: true, restaurantId: true, orderId: true, currency: true, amount: true, status: true } });
    if (!payment || payment.restaurantId !== restaurantId || payment.orderId !== transaction.orderId
      || payment.currency !== transaction.currency || payment.status !== 'CAPTURED' || cents(payment.amount) !== debit) fail();
    const existing = await tx.marketplaceLedgerEntry.findMany({ where: { paymentId, restaurantId,
      orderId: transaction.orderId, idempotencyKey }, orderBy: { lineNumber: 'asc' } });
    const lines = transaction.entries.map((entry, index) => ({ id: entry.id, restaurantId,
      orderId: transaction.orderId, paymentId, transactionId: transaction.id, transactionHash: transaction.hash,
      idempotencyKey, lineNumber: index + 1, eventType: transaction.eventType, account: entry.account,
      beneficiaryId: entry.account === 'MERCHANT_PAYABLE' ? restaurantId : entry.account === 'COURIER_PAYABLE' ? courierId : null,
      type: entry.type, amount: decimal(cents(entry.amount)), currency: transaction.currency,
      referenceId: transaction.referenceId, description: transaction.description, createdAt: new Date(transaction.createdAt) }));
    if (existing.length) {
      if (existing.length !== lines.length) fail();
      for (let i = 0; i < lines.length; i++) {
        const saved = existing[i]; const line = lines[i];
        if (['restaurantId', 'orderId', 'paymentId', 'idempotencyKey', 'lineNumber', 'eventType', 'account', 'beneficiaryId', 'type', 'currency', 'referenceId']
          .some(key => saved[key] !== line[key]) || cents(saved.amount) !== cents(line.amount)
          || saved.transactionId !== existing[0].transactionId || saved.transactionHash !== existing[0].transactionHash) fail();
      }
      const head = existing[0];
      const hash = crypto.createHash('sha256').update(`${head.transactionId}:${head.orderId}:${head.eventType}:${debit / 100}:${new Date(head.createdAt).toISOString()}`).digest('hex');
      if (hash !== head.transactionHash || existing.some(line => new Date(line.createdAt).getTime() !== new Date(head.createdAt).getTime())) fail();
      return { transactionId: head.transactionId, idempotent: true };
    }
    const created = await tx.marketplaceLedgerEntry.createMany({ data: lines });
    if (created.count !== lines.length) fail();
    return { transactionId: transaction.id, idempotent: false };
  };
  return typeof prismaClient.$transaction === 'function'
    ? prismaClient.$transaction(work, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 }) : work(prismaClient);
}

module.exports = {
  ACCOUNT_TYPES,
  ENTRY_TYPES,
  EVENT_TYPES,
  LedgerError,
  UnbalancedTransactionError,
  DuplicateTransactionError,
  roundCents,
  calculateOrderSettlement,
  createLedgerTransaction,
  buildOrderCaptureTransaction,
  buildOrderSettlementTransaction,
  buildOrderRefundTransaction,
  createInMemoryLedgerStore,
  recordLedgerTransaction,
};
