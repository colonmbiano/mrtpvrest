'use strict';

// Bóveda (model Vault) — el dinero del negocio fuera de la gaveta del turno,
// en dos bolsas: CASH (billetes) y DIGITAL (banco).
//
// Invariantes que protegen el cuadre de caja:
//   1. Un gasto/compra que NO es CASH_DRAWER no crea ShiftExpense, no toca
//      CashShift y no exige turno abierto. El corte del cajero queda intacto.
//   2. Cada movimiento golpea SOLO la columna de su canal, y `balanceAfter`
//      se toma del UPDATE atómico (no del saldo leído antes).
//   3. El ciclo de turno es idempotente POR CANAL: un replay no duplica saldo.
//   4. Un cajero no saca EFECTIVO de la bóveda sin PIN admin. El canal digital
//      no lleva ese candado (pagar con transferencia siempre se pudo).

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    operatingExpense: { create: jest.fn(async (a) => ({ id: 'oe1', ...a.data })) },
    operatingExpenseCategory: { findUnique: jest.fn(async () => ({ name: 'COMPRAS' })) },
    purchaseOrder: { create: jest.fn(async (a) => ({ id: 'po1', ...a.data })), findFirst: jest.fn() },
    purchaseOrderItem: { create: jest.fn(async () => ({})) },
    stockMovement: { create: jest.fn(async () => ({})) },
    ingredient: { update: jest.fn(async () => ({})) },
    shiftExpense: { create: jest.fn(async () => ({ id: 'se1' })) },
    cashShift: { update: jest.fn(async () => ({})) },
    vault: {
      upsert: jest.fn(async () => ({ id: 'v1', balanceCash: 1000, balanceDigital: 5000 })),
      // El UPDATE atómico devuelve la fila con los saldos YA aplicados.
      update: jest.fn(async () => ({ id: 'v1', balanceCash: 800, balanceDigital: 4800 })),
    },
    vaultMovement: {
      create: jest.fn(async (a) => ({ id: 'vm1', ...a.data })),
      findUnique: jest.fn(async () => null),
    },
  };
  return {
    prisma: {
      supplier: { findFirst: jest.fn() },
      cashShift: { findFirst: jest.fn() },
      user: { findUnique: jest.fn() },
      employee: { findFirst: jest.fn() },
      ingredient: { findMany: jest.fn() },
      operatingExpense: { findFirst: jest.fn() },
      purchaseOrder: { findFirst: jest.fn() },
      vault: { findUnique: jest.fn() },
      vaultMovement: { findMany: jest.fn() },
      location: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(tx)),
      __tx: tx,
    },
    runWithBypass: (fn) => fn(),
  };
});

// El rol lo controla cada test mutando `currentUser` antes del request.
const currentUser = { id: 'u1', name: 'Dueño', restaurantId: 'r1', role: 'OWNER' };
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { ...currentUser };
    req.restaurantId = 'r1';
    req.locationId = 'loc1';
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
}));

jest.mock('../src/lib/modules', () => ({
  requireFeatureFlag: () => (_req, _res, next) => next(),
  requireModule: () => (_req, _res, next) => next(),
  MODULES: { MODULE_CASH_SHIFT: 'cash_shift' },
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const {
  applyVaultMovement, applyShiftVaultMovement, vaultDenied, channelForMethod,
} = require('../src/lib/vault');
const { startOfLocalWeek } = require('../src/utils/dayRange');
const expensesRoutes = require('../src/routes/expenses.routes');
const purchasesRoutes = require('../src/routes/purchases.routes');
const vaultRoutes = require('../src/routes/vault.routes');

const tx = prisma.__tx;

function makeApp(base, router) {
  const app = express();
  app.use(express.json());
  app.use(base, router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  currentUser.role = 'OWNER';
  // clearAllMocks borra implementaciones de los mocks del factory: re-armamos
  // los que devuelven datos (si no, `undefined` rompe el flujo bajo prueba).
  tx.vault.upsert.mockResolvedValue({ id: 'v1', balanceCash: 1000, balanceDigital: 5000 });
  tx.vault.update.mockResolvedValue({ id: 'v1', balanceCash: 800, balanceDigital: 4800 });
  tx.vaultMovement.create.mockImplementation(async (a) => ({ id: 'vm1', ...a.data }));
  tx.vaultMovement.findUnique.mockResolvedValue(null);
  tx.operatingExpense.create.mockImplementation(async (a) => ({ id: 'oe1', ...a.data }));
  tx.operatingExpenseCategory.findUnique.mockResolvedValue({ name: 'COMPRAS' });
  tx.purchaseOrder.create.mockImplementation(async (a) => ({ id: 'po1', ...a.data }));
  tx.purchaseOrder.findFirst.mockResolvedValue(null);
  prisma.supplier.findFirst.mockResolvedValue({ id: 's1', name: 'Walmart' });
  prisma.user.findUnique.mockResolvedValue(null);
  prisma.ingredient.findMany.mockResolvedValue([
    { id: 'i1', name: 'Carne', baseUnit: 'GRAM', stock: 0, locationId: 'loc1' },
  ]);
  prisma.vault.findUnique.mockResolvedValue({ balanceCash: 1000, balanceDigital: 5000 });
  prisma.vaultMovement.findMany.mockResolvedValue([]);
  prisma.location.findFirst.mockResolvedValue({ id: 'loc1' });
});

describe('lib/vault · channelForMethod', () => {
  test('solo CASH_DRAWER se queda fuera de la bóveda', () => {
    expect(channelForMethod('CASH_DRAWER')).toBeNull();
    expect(channelForMethod('CASH_VAULT')).toBe('CASH');
    expect(channelForMethod('CORPORATE_CARD')).toBe('DIGITAL');
    expect(channelForMethod('TRANSFER')).toBe('DIGITAL');
  });
});

describe('lib/vault · applyVaultMovement', () => {
  test('un retiro de efectivo toca balanceCash y congela su balanceAfter', async () => {
    const mov = await applyVaultMovement(tx, {
      restaurantId: 'r1', locationId: 'loc1',
      type: 'WITHDRAWAL', channel: 'CASH', source: 'PURCHASE', amount: 200,
      description: 'Compra: Walmart',
    });

    expect(tx.vault.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { balanceCash: { decrement: 200 } },
    }));
    // balanceAfter sale del saldo devuelto por el UPDATE (800), no del leído antes (1000).
    expect(mov.balanceAfter).toBe(800);
    expect(mov.channel).toBe('CASH');
  });

  test('un retiro digital toca balanceDigital, no el efectivo', async () => {
    const mov = await applyVaultMovement(tx, {
      restaurantId: 'r1', locationId: 'loc1',
      type: 'WITHDRAWAL', channel: 'DIGITAL', source: 'EXPENSE', amount: 200,
      description: 'Luz',
    });

    expect(tx.vault.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { balanceDigital: { decrement: 200 } },
    }));
    expect(mov.balanceAfter).toBe(4800);
  });

  test('un depósito incrementa el saldo de su canal', async () => {
    await applyVaultMovement(tx, {
      restaurantId: 'r1', locationId: 'loc1',
      type: 'DEPOSIT', channel: 'DIGITAL', source: 'SHIFT_CLOSE', amount: 500,
      description: 'Cobros digitales',
    });
    expect(tx.vault.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { balanceDigital: { increment: 500 } },
    }));
  });

  test('un monto <= 0 revienta antes de tocar la BD', async () => {
    await expect(applyVaultMovement(tx, {
      restaurantId: 'r1', locationId: 'loc1', type: 'DEPOSIT', channel: 'CASH',
      source: 'MANUAL', amount: 0, description: 'x',
    })).rejects.toThrow('amount debe ser > 0');
    expect(tx.vault.update).not.toHaveBeenCalled();
  });

  test('un canal inválido revienta antes de tocar la BD', async () => {
    await expect(applyVaultMovement(tx, {
      restaurantId: 'r1', locationId: 'loc1', type: 'DEPOSIT', channel: 'CRIPTO',
      source: 'MANUAL', amount: 10, description: 'x',
    })).rejects.toThrow('channel inválido');
    expect(tx.vault.update).not.toHaveBeenCalled();
  });

  test('el ciclo de turno es idempotente por canal: un replay no duplica el saldo', async () => {
    tx.vaultMovement.findUnique.mockResolvedValue({ id: 'ya-existe' });
    const mov = await applyShiftVaultMovement(tx, {
      restaurantId: 'r1', locationId: 'loc1', type: 'DEPOSIT', channel: 'CASH',
      source: 'SHIFT_CLOSE', amount: 500, description: 'Cierre', shiftId: 'shift1',
    });
    expect(mov).toBeNull();
    expect(tx.vault.update).not.toHaveBeenCalled();
    // La búsqueda del duplicado incluye el canal: el depósito digital del mismo
    // turno es un movimiento distinto y no debe considerarse ya aplicado.
    expect(tx.vaultMovement.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { shiftId_source_channel: { shiftId: 'shift1', source: 'SHIFT_CLOSE', channel: 'CASH' } },
    }));
  });
});

describe('lib/vault · vaultDenied', () => {
  const req = (headers = {}) => ({ headers });

  test('un rol de mando puede sacar efectivo', () => {
    expect(vaultDenied(req(), 'OWNER')).toBeNull();
    expect(vaultDenied(req(), 'ADMIN')).toBeNull();
  });
  test('un cajero sin PIN admin no puede', () => {
    expect(vaultDenied(req(), 'CASHIER')).toMatchObject({ code: 'ADMIN_AUTH_REQUIRED' });
  });
  test('un cajero con PIN admin sí puede', () => {
    expect(vaultDenied(req({ 'x-admin-authorized': 'true' }), 'CASHIER')).toBeNull();
  });
});

describe('POST /api/expenses — pagado desde la bóveda', () => {
  test('CASH_VAULT: no crea ShiftExpense, no toca el turno y saca del efectivo', async () => {
    await request(makeApp('/api/expenses', expensesRoutes))
      .post('/api/expenses')
      .send({ concept: 'Bolsas', amount: 200, paymentMethod: 'CASH_VAULT' })
      .expect(201);

    // El corte del cajero no se entera.
    expect(prisma.cashShift.findFirst).not.toHaveBeenCalled();
    expect(tx.shiftExpense.create).not.toHaveBeenCalled();
    expect(tx.cashShift.update).not.toHaveBeenCalled();

    expect(tx.vaultMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'WITHDRAWAL', channel: 'CASH', source: 'EXPENSE', amount: 200, operatingExpenseId: 'oe1',
      }),
    }));
  });

  test('TRANSFER: sale del saldo digital, sin tocar la caja', async () => {
    await request(makeApp('/api/expenses', expensesRoutes))
      .post('/api/expenses')
      .send({ concept: 'Luz', amount: 1500, paymentMethod: 'TRANSFER' })
      .expect(201);

    expect(tx.shiftExpense.create).not.toHaveBeenCalled();
    expect(tx.vaultMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'WITHDRAWAL', channel: 'DIGITAL', source: 'EXPENSE', amount: 1500 }),
    }));
  });

  test('CORPORATE_CARD también sale del saldo digital', async () => {
    await request(makeApp('/api/expenses', expensesRoutes))
      .post('/api/expenses')
      .send({ concept: 'Software', amount: 300, paymentMethod: 'CORPORATE_CARD' })
      .expect(201);

    expect(tx.vaultMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ channel: 'DIGITAL' }),
    }));
  });

  test('un cajero sin PIN admin no saca efectivo de la bóveda', async () => {
    currentUser.role = 'CASHIER';
    const res = await request(makeApp('/api/expenses', expensesRoutes))
      .post('/api/expenses')
      .send({ concept: 'Bolsas', amount: 200, paymentMethod: 'CASH_VAULT' })
      .expect(402);

    expect(res.body.code).toBe('ADMIN_AUTH_REQUIRED');
    expect(tx.operatingExpense.create).not.toHaveBeenCalled();
    expect(tx.vaultMovement.create).not.toHaveBeenCalled();
  });

  test('un cajero SÍ puede pagar con transferencia (el canal digital no lleva candado)', async () => {
    currentUser.role = 'CASHIER';
    await request(makeApp('/api/expenses', expensesRoutes))
      .post('/api/expenses')
      .send({ concept: 'Luz', amount: 200, paymentMethod: 'TRANSFER' })
      .expect(201);

    expect(tx.vaultMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ channel: 'DIGITAL' }),
    }));
  });

  test('una deuda PENDING no toca la bóveda hasta liquidarse', async () => {
    await request(makeApp('/api/expenses', expensesRoutes))
      .post('/api/expenses')
      .send({ concept: 'Fiado', amount: 300, paymentMethod: 'CASH_VAULT', settlementStatus: 'PENDING' })
      .expect(201);

    expect(tx.vaultMovement.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/purchases — compra en tienda pagada desde la bóveda', () => {
  test('sube stock, no exige turno abierto y descuenta del efectivo acumulado', async () => {
    await request(makeApp('/api/purchases', purchasesRoutes))
      .post('/api/purchases')
      .send({
        supplierId: 's1',
        paymentMethod: 'CASH_VAULT',
        items: [{ ingredientId: 'i1', qty: 2, unitPrice: 100 }],
      })
      .expect(201);

    // Nunca busca turno: ese es justo el punto de la bóveda.
    expect(prisma.cashShift.findFirst).not.toHaveBeenCalled();
    expect(tx.shiftExpense.create).not.toHaveBeenCalled();
    // El stock sube igual que en cualquier compra.
    expect(tx.stockMovement.create).toHaveBeenCalled();
    expect(tx.vaultMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'WITHDRAWAL', channel: 'CASH', source: 'PURCHASE', amount: 200, purchaseOrderId: 'po1',
      }),
    }));
  });

  test('pagada con tarjeta corporativa, descuenta del saldo digital', async () => {
    await request(makeApp('/api/purchases', purchasesRoutes))
      .post('/api/purchases')
      .send({
        supplierId: 's1',
        paymentMethod: 'CORPORATE_CARD',
        items: [{ ingredientId: 'i1', qty: 1, unitPrice: 350 }],
      })
      .expect(201);

    expect(tx.stockMovement.create).toHaveBeenCalled();
    expect(tx.vaultMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ channel: 'DIGITAL', source: 'PURCHASE', amount: 350 }),
    }));
  });
});

describe('POST /api/vault/movements', () => {
  test('un depósito manual entra a la bolsa elegida', async () => {
    await request(makeApp('/api/vault', vaultRoutes))
      .post('/api/vault/movements')
      .send({ type: 'DEPOSIT', channel: 'DIGITAL', amount: 5000, description: 'Depósito del dueño' })
      .expect(201);

    expect(tx.vaultMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'DEPOSIT', channel: 'DIGITAL', source: 'MANUAL', amount: 5000 }),
    }));
  });

  test('un cajero sin PIN admin no puede retirar efectivo', async () => {
    currentUser.role = 'CASHIER';
    await request(makeApp('/api/vault', vaultRoutes))
      .post('/api/vault/movements')
      .send({ type: 'WITHDRAWAL', channel: 'CASH', amount: 100, description: 'x' })
      .expect(402);
    expect(tx.vaultMovement.create).not.toHaveBeenCalled();
  });

  test('un cajero sí puede depositar efectivo (meter dinero nunca es el riesgo)', async () => {
    currentUser.role = 'CASHIER';
    await request(makeApp('/api/vault', vaultRoutes))
      .post('/api/vault/movements')
      .send({ type: 'DEPOSIT', channel: 'CASH', amount: 100, description: 'Feria del dueño' })
      .expect(201);
  });

  test('rechaza un type inválido', async () => {
    await request(makeApp('/api/vault', vaultRoutes))
      .post('/api/vault/movements')
      .send({ type: 'ROBO', channel: 'CASH', amount: 100, description: 'x' })
      .expect(400);
  });

  test('rechaza un channel inválido', async () => {
    await request(makeApp('/api/vault', vaultRoutes))
      .post('/api/vault/movements')
      .send({ type: 'DEPOSIT', channel: 'CRIPTO', amount: 100, description: 'x' })
      .expect(400);
  });
});

describe('GET /api/vault', () => {
  test('devuelve los dos saldos', async () => {
    prisma.vault.findUnique.mockResolvedValue({
      id: 'v1', balanceCash: 1200, balanceDigital: 3400, updatedAt: new Date(),
    });
    const res = await request(makeApp('/api/vault', vaultRoutes)).get('/api/vault').expect(200);
    expect(res.body.balanceCash).toBe(1200);
    expect(res.body.balanceDigital).toBe(3400);
  });

  test('una bóveda que no existe todavía responde ceros, sin crearla', async () => {
    prisma.vault.findUnique.mockResolvedValue(null);
    const res = await request(makeApp('/api/vault', vaultRoutes)).get('/api/vault').expect(200);
    expect(res.body).toMatchObject({ balanceCash: 0, balanceDigital: 0, movements: [] });
  });
});

describe('utils/dayRange · startOfLocalWeek', () => {
  // La semana del corte corre lunes → domingo en hora de México.
  test('un miércoles cae en la semana del lunes anterior', () => {
    // 2026-07-08 es miércoles. 15:00 UTC = 09:00 en México.
    const wed = new Date('2026-07-08T15:00:00Z');
    // Lunes 2026-07-06 a medianoche de México = 06:00 UTC.
    expect(startOfLocalWeek(wed).toISOString()).toBe('2026-07-06T06:00:00.000Z');
  });

  test('el domingo pertenece a la semana que arrancó el lunes previo', () => {
    // 2026-07-12 es domingo, 20:00 local (2026-07-13T02:00Z ya es lunes en UTC).
    const sunNight = new Date('2026-07-13T02:00:00Z');
    expect(startOfLocalWeek(sunNight).toISOString()).toBe('2026-07-06T06:00:00.000Z');
  });

  test('el lunes a primera hora es el inicio de su propia semana', () => {
    const monMorning = new Date('2026-07-06T13:00:00Z'); // 07:00 en México
    expect(startOfLocalWeek(monMorning).toISOString()).toBe('2026-07-06T06:00:00.000Z');
  });
});
