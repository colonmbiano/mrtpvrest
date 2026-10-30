#!/usr/bin/env node

const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};

const assertEqual = (actual, expected, message) => {
  if (actual !== expected) {
    throw new Error(`FAIL: ${message} (expected ${expected}, got ${actual})`);
  }
};

const assertDeepEqual = (actual, expected, message) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`FAIL: ${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
};

let testCount = 0;
let passCount = 0;
let failCount = 0;

const test = (name, fn) => {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failCount++;
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
  }
};

// ────────────────────────────────────────────────────────────────
// Validación de CLABE
// ────────────────────────────────────────────────────────────────

function validateCLABE(clabe) {
  if (typeof clabe !== 'string') return false;
  const digits = clabe.replace(/\D/g, '');
  if (digits.length !== 18) return false;
  return /^\d{18}$/.test(digits);
}

test('CLABE validation: accepts valid 18-digit CLABE', () => {
  assert(validateCLABE('012345678901234567'), 'Valid CLABE should pass');
  assert(validateCLABE('000 000 000 000 000 000'), 'CLABE with spaces should pass');
  assert(validateCLABE('999-999-999-999-999-999'), 'CLABE with dashes should pass');
});

test('CLABE validation: rejects invalid CLABE', () => {
  assert(!validateCLABE('12345678901234567'), 'CLABE with 17 digits should fail');
  assert(!validateCLABE('123456789012345678901'), 'CLABE with 21 digits should fail');
  assert(!validateCLABE(''), 'Empty string should fail');
  assert(!validateCLABE('abcdefghijklmnopqr'), 'CLABE with letters should fail');
  assert(!validateCLABE(null), 'Null should fail');
  assert(!validateCLABE(undefined), 'Undefined should fail');
});

// ────────────────────────────────────────────────────────────────
// Validación de montos
// ────────────────────────────────────────────────────────────────

function validatePayoutAmount(amount, availableBalance, minAmount = 100, maxAmount = 50000) {
  if (!Number.isFinite(amount)) return false;
  if (amount <= 0) return false;
  if (amount < minAmount) return false;
  if (amount > availableBalance) return false;
  if (amount > maxAmount) return false;
  return true;
}

test('Payout amount validation: accepts valid amounts', () => {
  assert(validatePayoutAmount(500, 5000), 'Valid amount 500 with balance 5000 should pass');
  assert(validatePayoutAmount(100, 5000), 'Minimum amount 100 should pass');
  assert(validatePayoutAmount(50000, 50000), 'Maximum amount 50000 should pass');
  assert(validatePayoutAmount(1234.56, 5000), 'Decimal amount should pass');
});

test('Payout amount validation: rejects invalid amounts', () => {
  assert(!validatePayoutAmount(0, 5000), 'Zero amount should fail');
  assert(!validatePayoutAmount(-100, 5000), 'Negative amount should fail');
  assert(!validatePayoutAmount(50, 5000), 'Below minimum should fail');
  assert(!validatePayoutAmount(60000, 50000), 'Above maximum should fail');
  assert(!validatePayoutAmount(6000, 5000), 'Above available balance should fail');
  assert(!validatePayoutAmount(NaN, 5000), 'NaN should fail');
  assert(!validatePayoutAmount(Infinity, 5000), 'Infinity should fail');
});

// ────────────────────────────────────────────────────────────────
// Advertencia de efectivo en mano
// ────────────────────────────────────────────────────────────────

function shouldWarnCashInHand(pendingCash) {
  return pendingCash > 0;
}

test('Cash warning: detects pending cash in hand', () => {
  assert(shouldWarnCashInHand(100), 'Should warn when cash > 0');
  assert(shouldWarnCashInHand(0.01), 'Should warn for any amount > 0');
  assert(!shouldWarnCashInHand(0), 'Should not warn when no pending cash');
  assert(!shouldWarnCashInHand(-100), 'Should not warn for negative (invalid) cash');
});

// ────────────────────────────────────────────────────────────────
// Formato de número de cuenta
// ────────────────────────────────────────────────────────────────

function formatCLABE(clabe) {
  const digits = clabe.replace(/\D/g, '');
  if (digits.length !== 18) return null;
  return digits;
}

test('CLABE formatting: extracts and normalizes CLABE', () => {
  assertEqual(formatCLABE('012345678901234567'), '012345678901234567', 'Plain CLABE');
  assertEqual(formatCLABE('012 345 678 901 234 567'), '012345678901234567', 'Spaced CLABE');
  assertEqual(formatCLABE('012-345-678-901-234-567'), '012345678901234567', 'Dashed CLABE');
  assertEqual(formatCLABE('1234567890123456789'), null, 'Invalid length returns null');
});

// ────────────────────────────────────────────────────────────────
// Validación combinada de solicitud de retiro
// ────────────────────────────────────────────────────────────────

function validatePayoutRequest(request) {
  const errors = [];

  if (!Number.isFinite(request.amount) || request.amount <= 0) {
    errors.push('Invalid amount');
  } else if (request.amount < 100) {
    errors.push('Amount below minimum (100)');
  } else if (request.amount > 50000) {
    errors.push('Amount above maximum (50000)');
  } else if (request.amount > request.availableBalance) {
    errors.push('Amount exceeds available balance');
  }

  if (!request.accountType || !['CLABE', 'DEBIT'].includes(request.accountType)) {
    errors.push('Invalid account type');
  }

  if (request.accountType === 'CLABE') {
    if (!validateCLABE(request.bankAccount)) {
      errors.push('Invalid CLABE');
    }
  } else if (request.accountType === 'DEBIT') {
    if (!request.bankAccount || request.bankAccount.trim().length === 0) {
      errors.push('Debit account required');
    }
  }

  if (request.pendingCash > 0) {
    errors.push('Pending cash in hand blocks payout (warning)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

test('Payout request validation: accepts valid request (CLABE)', () => {
  const result = validatePayoutRequest({
    amount: 500,
    availableBalance: 5000,
    accountType: 'CLABE',
    bankAccount: '012345678901234567',
    pendingCash: 0,
  });
  assert(result.valid, 'Valid CLABE request should be valid');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('Payout request validation: accepts valid request (DEBIT)', () => {
  const result = validatePayoutRequest({
    amount: 1000,
    availableBalance: 5000,
    accountType: 'DEBIT',
    bankAccount: '1234567890123456',
    pendingCash: 0,
  });
  assert(result.valid, 'Valid DEBIT request should be valid');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('Payout request validation: rejects request with invalid amount', () => {
  const result = validatePayoutRequest({
    amount: 50,
    availableBalance: 5000,
    accountType: 'CLABE',
    bankAccount: '012345678901234567',
    pendingCash: 0,
  });
  assert(!result.valid, 'Invalid amount should fail');
  assert(result.errors.includes('Amount below minimum (100)'), 'Should report minimum amount error');
});

test('Payout request validation: rejects request exceeding balance', () => {
  const result = validatePayoutRequest({
    amount: 6000,
    availableBalance: 5000,
    accountType: 'CLABE',
    bankAccount: '012345678901234567',
    pendingCash: 0,
  });
  assert(!result.valid, 'Amount exceeding balance should fail');
  assert(result.errors.includes('Amount exceeds available balance'), 'Should report balance error');
});

test('Payout request validation: warns about pending cash', () => {
  const result = validatePayoutRequest({
    amount: 500,
    availableBalance: 5000,
    accountType: 'CLABE',
    bankAccount: '012345678901234567',
    pendingCash: 200,
  });
  assert(!result.valid, 'Request with pending cash should be invalid');
  assert(result.errors.includes('Pending cash in hand blocks payout (warning)'), 'Should warn about cash');
});

test('Payout request validation: rejects invalid CLABE', () => {
  const result = validatePayoutRequest({
    amount: 500,
    availableBalance: 5000,
    accountType: 'CLABE',
    bankAccount: '12345678901234567',
    pendingCash: 0,
  });
  assert(!result.valid, 'Invalid CLABE should fail');
  assert(result.errors.includes('Invalid CLABE'), 'Should report CLABE error');
});

test('Payout request validation: rejects invalid account type', () => {
  const result = validatePayoutRequest({
    amount: 500,
    availableBalance: 5000,
    accountType: 'INVALID',
    bankAccount: '012345678901234567',
    pendingCash: 0,
  });
  assert(!result.valid, 'Invalid account type should fail');
  assert(result.errors.includes('Invalid account type'), 'Should report account type error');
});

// ────────────────────────────────────────────────────────────────
// Historial de retiros y consistencia
// ────────────────────────────────────────────────────────────────

function validatePayoutHistory(payouts) {
  const errors = [];

  if (!Array.isArray(payouts)) {
    errors.push('Payout history must be an array');
  } else {
    for (let i = 0; i < payouts.length; i++) {
      const payout = payouts[i];
      if (!payout.id) errors.push(`Payout ${i}: missing id`);
      if (!Number.isFinite(payout.amount) || payout.amount <= 0) {
        errors.push(`Payout ${i}: invalid amount`);
      }
      if (!['PENDING', 'APPROVED', 'TRANSFERRED'].includes(payout.status)) {
        errors.push(`Payout ${i}: invalid status`);
      }
      if (!payout.createdAt) errors.push(`Payout ${i}: missing createdAt`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

test('Payout history validation: accepts valid history', () => {
  const history = [
    { id: '1', amount: 500, status: 'PENDING', createdAt: new Date().toISOString() },
    { id: '2', amount: 1000, status: 'TRANSFERRED', createdAt: new Date().toISOString() },
  ];
  const result = validatePayoutHistory(history);
  assert(result.valid, 'Valid payout history should pass');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('Payout history validation: accepts empty history', () => {
  const result = validatePayoutHistory([]);
  assert(result.valid, 'Empty history should pass');
});

test('Payout history validation: rejects invalid payouts', () => {
  const history = [
    { id: '1', amount: 500, status: 'PENDING', createdAt: new Date().toISOString() },
    { id: '2', amount: 1000, status: 'INVALID_STATUS', createdAt: new Date().toISOString() },
  ];
  const result = validatePayoutHistory(history);
  assert(!result.valid, 'Invalid status should fail');
});

// ────────────────────────────────────────────────────────────────
// Cálculos de saldo y consistencia
// ────────────────────────────────────────────────────────────────

function calculateAvailableBalance(totalEarnings, transferredPayouts) {
  const totalTransferred = transferredPayouts.reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, totalEarnings - totalTransferred);
}

test('Balance calculation: calculates available balance correctly', () => {
  const available1 = calculateAvailableBalance(5000, []);
  assertEqual(available1, 5000, 'No transferred payouts');

  const available2 = calculateAvailableBalance(5000, [{ amount: 2000 }, { amount: 1000 }]);
  assertEqual(available2, 2000, 'With transferred payouts');

  const available3 = calculateAvailableBalance(5000, [{ amount: 5000 }]);
  assertEqual(available3, 0, 'All earnings transferred');
});

// ────────────────────────────────────────────────────────────────
// Integración: flujo completo de solicitud
// ────────────────────────────────────────────────────────────────

function processPayoutRequest(request) {
  const validation = validatePayoutRequest(request);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors[0],
    };
  }

  const normalizedCLABE = formatCLABE(request.bankAccount);
  if (request.accountType === 'CLABE' && !normalizedCLABE) {
    return {
      success: false,
      error: 'Failed to normalize CLABE',
    };
  }

  return {
    success: true,
    payout: {
      id: Math.random().toString(36).substr(2, 9),
      amount: request.amount,
      bankAccount: normalizedCLABE || request.bankAccount,
      accountType: request.accountType,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    },
  };
}

test('Payout processing: successfully processes valid request', () => {
  const result = processPayoutRequest({
    amount: 500,
    availableBalance: 5000,
    accountType: 'CLABE',
    bankAccount: '012 345 678 901 234 567',
    pendingCash: 0,
  });
  assert(result.success, 'Should process successfully');
  assert(result.payout, 'Should return payout object');
  assertEqual(result.payout.status, 'PENDING', 'Status should be PENDING');
  assertEqual(result.payout.accountType, 'CLABE', 'Account type preserved');
  assertEqual(result.payout.bankAccount, '012345678901234567', 'CLABE normalized');
});

test('Payout processing: rejects invalid request', () => {
  const result = processPayoutRequest({
    amount: 50,
    availableBalance: 5000,
    accountType: 'CLABE',
    bankAccount: '012345678901234567',
    pendingCash: 0,
  });
  assert(!result.success, 'Should fail');
  assert(result.error, 'Should return error message');
});

// ────────────────────────────────────────────────────────────────
// Casos extremos
// ────────────────────────────────────────────────────────────────

test('Edge cases: handles boundary values', () => {
  assert(validatePayoutAmount(100, 100), 'Min amount = available balance');
  assert(validatePayoutAmount(50000, 50000), 'Max amount = available balance');
  assert(!validatePayoutAmount(100.01, 100), 'Amount slightly over balance fails');
  assert(!validatePayoutAmount(99.99, 100), 'Amount below minimum fails');
});

test('Edge cases: handles precision in decimal amounts', () => {
  const result = validatePayoutAmount(123.45, 1000);
  assert(result, 'Decimal amounts handled correctly');
});

test('Edge cases: CLABE with leading zeros preserved', () => {
  const clabe = '000000000000000001';
  assert(validateCLABE(clabe), 'CLABE with leading zeros valid');
  assertEqual(formatCLABE(clabe), clabe, 'Leading zeros preserved in formatting');
});

// ────────────────────────────────────────────────────────────────
// Resultados
// ────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(60));
console.log(`Test Results: ${passCount}/${testCount} passed`);
if (failCount > 0) {
  console.log(`${failCount} test(s) failed`);
  process.exit(1);
} else {
  console.log('All tests passed ✓');
  process.exit(0);
}
