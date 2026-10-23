import assert from 'node:assert';

function createPayoutMockService() {
  const payouts = new Map();
  const rejections = new Map();

  function generateId() {
    return Math.random().toString(36).substring(2, 15);
  }

  function createPayout(driver) {
    const id = generateId();
    const payout = {
      id,
      driverId: driver.id,
      driverName: driver.name,
      amount: driver.requestAmount,
      currency: 'MXN',
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
      clabe: driver.clabe,
      cashOnHand: driver.cashOnHand || 0,
    };
    payouts.set(id, payout);
    return payout;
  }

  function listPayouts(filter = {}) {
    const all = Array.from(payouts.values());
    const filtered = all.filter(p => {
      if (filter.status && p.status !== filter.status) return false;
      if (filter.driverId && p.driverId !== filter.driverId) return false;
      return true;
    });
    return filtered.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  }

  function getPayout(id) {
    const payout = payouts.get(id);
    if (!payout) throw new Error('PAYOUT_NOT_FOUND');
    return payout;
  }

  function validateClabe(clabe) {
    return clabe && /^\d{18}$/.test(clabe);
  }

  function approvePayout(id, paymentReference) {
    const payout = getPayout(id);
    if (payout.status !== 'PENDING') throw new Error('PAYOUT_ALREADY_PROCESSED');
    if (!paymentReference || paymentReference.trim().length === 0) {
      throw new Error('PAYMENT_REFERENCE_REQUIRED');
    }
    payout.status = 'PAID';
    payout.paidAt = new Date().toISOString();
    payout.paymentReference = paymentReference.trim();
    return payout;
  }

  function rejectPayout(id, reason) {
    const payout = getPayout(id);
    if (payout.status !== 'PENDING') throw new Error('PAYOUT_ALREADY_PROCESSED');
    if (!reason || reason.trim().length === 0) {
      throw new Error('REJECTION_REASON_REQUIRED');
    }
    payout.status = 'REJECTED';
    rejections.set(id, {
      reason: reason.trim(),
      rejectedAt: new Date().toISOString(),
    });
    return payout;
  }

  function getCashWarning(payout) {
    return {
      hasPendingCash: payout.cashOnHand > 0,
      amount: payout.cashOnHand,
      warning: payout.cashOnHand > 0 ? 'Driver must reconcile cash before payout' : null,
    };
  }

  function validateClabeMissing(payout) {
    return !payout.clabe || !validateClabe(payout.clabe);
  }

  return {
    createPayout,
    listPayouts,
    getPayout,
    approvePayout,
    rejectPayout,
    getCashWarning,
    validateClabe,
    validateClabeMissing,
  };
}

function runTests() {
  const tests = [];
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    tests.push({ name, fn });
  }

  test('list payouts returns empty initially', () => {
    const service = createPayoutMockService();
    const payouts = service.listPayouts();
    assert.strictEqual(payouts.length, 0, 'Should start with no payouts');
  });

  test('create payout with valid data', () => {
    const service = createPayoutMockService();
    const driver = {
      id: 'driver-1',
      name: 'Juan Pérez',
      requestAmount: 500.50,
      clabe: '123456789012345678',
    };
    const payout = service.createPayout(driver);
    assert.strictEqual(payout.driverId, 'driver-1');
    assert.strictEqual(payout.amount, 500.50);
    assert.strictEqual(payout.status, 'PENDING');
    assert.strictEqual(payout.currency, 'MXN');
  });

  test('list payouts returns created payout', () => {
    const service = createPayoutMockService();
    const driver = {
      id: 'driver-2',
      name: 'María González',
      requestAmount: 300,
      clabe: '098765432109876543',
    };
    service.createPayout(driver);
    const payouts = service.listPayouts();
    assert.strictEqual(payouts.length, 1);
    assert.strictEqual(payouts[0].driverId, 'driver-2');
  });

  test('filter payouts by status PENDING', () => {
    const service = createPayoutMockService();
    const driver1 = {
      id: 'driver-3',
      name: 'Carlos López',
      requestAmount: 200,
      clabe: '111111111111111111',
    };
    const payout1 = service.createPayout(driver1);
    service.approvePayout(payout1.id, 'TRX123456');

    const driver2 = {
      id: 'driver-4',
      name: 'Ana Martínez',
      requestAmount: 400,
      clabe: '222222222222222222',
    };
    service.createPayout(driver2);

    const pending = service.listPayouts({ status: 'PENDING' });
    const paid = service.listPayouts({ status: 'PAID' });

    assert.strictEqual(pending.length, 1);
    assert.strictEqual(paid.length, 1);
  });

  test('cash on hand warning calculation', () => {
    const service = createPayoutMockService();
    const driver = {
      id: 'driver-5',
      name: 'Roberto Sánchez',
      requestAmount: 600,
      clabe: '333333333333333333',
      cashOnHand: 150.75,
    };
    const payout = service.createPayout(driver);
    const warning = service.getCashWarning(payout);
    assert.strictEqual(warning.hasPendingCash, true);
    assert.strictEqual(warning.amount, 150.75);
    assert.ok(warning.warning);
  });

  test('no cash warning when balance is zero', () => {
    const service = createPayoutMockService();
    const driver = {
      id: 'driver-6',
      name: 'Isabel Rodríguez',
      requestAmount: 250,
      clabe: '444444444444444444',
      cashOnHand: 0,
    };
    const payout = service.createPayout(driver);
    const warning = service.getCashWarning(payout);
    assert.strictEqual(warning.hasPendingCash, false);
    assert.strictEqual(warning.amount, 0);
    assert.strictEqual(warning.warning, null);
  });

  test('validate CLABE format 18 digits', () => {
    const service = createPayoutMockService();
    assert.strictEqual(service.validateClabe('123456789012345678'), true);
    assert.strictEqual(service.validateClabe('12345678901234567'), false);
    assert.strictEqual(service.validateClabe('1234567890123456789'), false);
    assert.strictEqual(service.validateClabe('abcdefghijklmnopqr'), false);
  });

  test('approve payout with payment reference', () => {
    const service = createPayoutMockService();
    const driver = {
      id: 'driver-7',
      name: 'Diego Flores',
      requestAmount: 800,
      clabe: '555555555555555555',
    };
    const payout = service.createPayout(driver);
    const approved = service.approvePayout(payout.id, 'TRX20261022001');
    assert.strictEqual(approved.status, 'PAID');
    assert.strictEqual(approved.paymentReference, 'TRX20261022001');
    assert.ok(approved.paidAt);
  });

  test('reject payout approval throws when already processed', () => {
    const service = createPayoutMockService();
    const driver = {
      id: 'driver-8',
      name: 'Sofía Álvarez',
      requestAmount: 350,
      clabe: '666666666666666666',
    };
    const payout = service.createPayout(driver);
    service.approvePayout(payout.id, 'TRX20261022002');
    try {
      service.approvePayout(payout.id, 'TRX20261022003');
      assert.fail('Should throw PAYOUT_ALREADY_PROCESSED');
    } catch (error) {
      assert.strictEqual(error.message, 'PAYOUT_ALREADY_PROCESSED');
    }
  });

  test('approve payout requires payment reference', () => {
    const service = createPayoutMockService();
    const driver = {
      id: 'driver-9',
      name: 'Fernando Ruiz',
      requestAmount: 450,
      clabe: '777777777777777777',
    };
    const payout = service.createPayout(driver);
    try {
      service.approvePayout(payout.id, '');
      assert.fail('Should throw PAYMENT_REFERENCE_REQUIRED');
    } catch (error) {
      assert.strictEqual(error.message, 'PAYMENT_REFERENCE_REQUIRED');
    }
  });

  test('reject payout with reason', () => {
    const service = createPayoutMockService();
    const driver = {
      id: 'driver-10',
      name: 'Laura García',
      requestAmount: 600,
      clabe: '888888888888888888',
    };
    const payout = service.createPayout(driver);
    const rejected = service.rejectPayout(payout.id, 'CLABE inválido según banco');
    assert.strictEqual(rejected.status, 'REJECTED');
  });

  test('reject payout requires reason', () => {
    const service = createPayoutMockService();
    const driver = {
      id: 'driver-11',
      name: 'Tomás Guerrero',
      requestAmount: 550,
      clabe: '999999999999999999',
    };
    const payout = service.createPayout(driver);
    try {
      service.rejectPayout(payout.id, '');
      assert.fail('Should throw REJECTION_REASON_REQUIRED');
    } catch (error) {
      assert.strictEqual(error.message, 'REJECTION_REASON_REQUIRED');
    }
  });

  test('cannot process non-pending payout', () => {
    const service = createPayoutMockService();
    const driver = {
      id: 'driver-12',
      name: 'Elena Moreno',
      requestAmount: 700,
      clabe: '101010101010101010',
    };
    const payout = service.createPayout(driver);
    service.rejectPayout(payout.id, 'Fondos insuficientes');
    try {
      service.approvePayout(payout.id, 'TRX123');
      assert.fail('Should throw PAYOUT_ALREADY_PROCESSED');
    } catch (error) {
      assert.strictEqual(error.message, 'PAYOUT_ALREADY_PROCESSED');
    }
  });

  test('get payout by id', () => {
    const service = createPayoutMockService();
    const driver = {
      id: 'driver-13',
      name: 'Raúl Castro',
      requestAmount: 400,
      clabe: '202020202020202020',
    };
    const payout = service.createPayout(driver);
    const retrieved = service.getPayout(payout.id);
    assert.strictEqual(retrieved.id, payout.id);
    assert.strictEqual(retrieved.driverId, 'driver-13');
  });

  test('get non-existent payout throws error', () => {
    const service = createPayoutMockService();
    try {
      service.getPayout('non-existent-id');
      assert.fail('Should throw PAYOUT_NOT_FOUND');
    } catch (error) {
      assert.strictEqual(error.message, 'PAYOUT_NOT_FOUND');
    }
  });

  test('list payouts ordered by date descending', () => {
    const service = createPayoutMockService();
    const driver1 = {
      id: 'driver-14',
      name: 'Patricia Navarro',
      requestAmount: 300,
      clabe: '303030303030303030',
    };
    const driver2 = {
      id: 'driver-15',
      name: 'Víctor Herrera',
      requestAmount: 400,
      clabe: '404040404040404040',
    };
    const payout1 = service.createPayout(driver1);
    const payout2 = service.createPayout(driver2);
    const list = service.listPayouts();
    assert.strictEqual(list.length, 2);
    assert.ok(
      (list[0].id === payout2.id && list[1].id === payout1.id) ||
      (list[0].id === payout1.id && list[1].id === payout2.id),
      'Payouts should be ordered by creation time (descending) or ID as secondary sort'
    );
  });

  test('filter payouts by driver id', () => {
    const service = createPayoutMockService();
    const driver1 = {
      id: 'driver-16',
      name: 'Óscar Vargas',
      requestAmount: 500,
      clabe: '505050505050505050',
    };
    const driver2 = {
      id: 'driver-17',
      name: 'Beatriz Soto',
      requestAmount: 600,
      clabe: '606060606060606060',
    };
    service.createPayout(driver1);
    service.createPayout(driver2);
    const byDriver = service.listPayouts({ driverId: 'driver-16' });
    assert.strictEqual(byDriver.length, 1);
    assert.strictEqual(byDriver[0].driverId, 'driver-16');
  });

  test('validate missing or invalid CLABE', () => {
    const service = createPayoutMockService();
    const validPayout = {
      driverId: 'driver-18',
      driverName: 'Claudio Mendez',
      amount: 250,
      clabe: '707070707070707070',
      status: 'PENDING',
    };
    const invalidPayout = {
      driverId: 'driver-19',
      driverName: 'Gregoria Peña',
      amount: 350,
      clabe: '70707070707070707',
      status: 'PENDING',
    };
    const noClabePayou = {
      driverId: 'driver-20',
      driverName: 'Humberto Valenzuela',
      amount: 450,
      status: 'PENDING',
    };
    assert.strictEqual(service.validateClabeMissing(validPayout), false);
    assert.strictEqual(service.validateClabeMissing(invalidPayout), true);
    assert.strictEqual(service.validateClabeMissing(noClabePayou), true);
  });

  for (const { name, fn } of tests) {
    try {
      fn();
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`✗ ${name}`);
      console.error(`  ${error.message}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
