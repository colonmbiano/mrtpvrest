'use strict';

// Cuentas por pagar (estado PENDIENTE/PAGADO en gastos y compras).
// Invariantes que protegen el cuadre de caja:
//   1. Un gasto PENDING NO toca caja al crearse (no ShiftExpense, no exige turno).
//   2. /settle con CASH_DRAWER recién golpea la caja del día — y es idempotente.
//   3. Un gasto de repartidor marcado "pendiente" se vuelve deuda (OperatingExpense
//      PENDING) y NO crea DriverCashMovement ni ShiftExpense (su corte queda intacto).

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    operatingExpense: {
      create: jest.fn(async (a) => ({ id: 'oe1', ...a.data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    operatingExpenseCategory: { findUnique: jest.fn(async () => ({ name: 'GAS' })) },
    purchaseOrder: { updateMany: jest.fn(async () => ({ count: 1 })) },
    recurringExpense: { updateMany: jest.fn(async () => ({ count: 1 })) },
    driverCashMovement: { create: jest.fn(async (a) => ({ id: 'm1', ...a.data })) },
    shiftExpense: { create: jest.fn(async () => ({ id: 'se1' })) },
    shiftCashIn: { create: jest.fn(async () => ({ id: 'sci1' })) },
    cashShift: { update: jest.fn(async () => ({})) },
  };
  return {
    prisma: {
      supplier: { findFirst: jest.fn() },
      cashShift: { findFirst: jest.fn() },
      user: { findUnique: jest.fn() },
      employee: { findFirst: jest.fn() },
      driverCashMovement: { findFirst: jest.fn(), create: jest.fn() },
      operatingExpense: {
        findFirst: jest.fn(),
        create: jest.fn(async (a) => ({ id: 'oeP', ...a.data })),
      },
      purchaseOrder: { findFirst: jest.fn() },
      recurringExpense: { findMany: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(tx)),
      __tx: tx,
    },
    runWithBypass: (fn) => fn(),
  };
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', name: 'Dueño', restaurantId: 'r1', role: 'OWNER' };
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
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const expensesRoutes = require('../src/routes/expenses.routes');
const driverCashRoutes = require('../src/routes/driver-cash.routes');
const payablesRoutes = require('../src/routes/payables.routes');

const tx = prisma.__tx;

function makeApp(base, router) {
  const app = express();
  app.use(express.json());
  app.use(base, router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(null);
  // clearAllMocks no resetea implementaciones: default explícito para el dedup
  // del gasto pendiente del repartidor (si no, el mockResolvedValue de un test
  // de /settle se filtra y simula un duplicado inexistente).
  prisma.operatingExpense.findFirst.mockResolvedValue(null);
  prisma.employee.findFirst.mockResolvedValue({ id: 'd1', name: 'Kebra', locationId: 'loc1' });
  prisma.driverCashMovement.findFirst.mockResolvedValue(null);
  prisma.cashShift.findFirst.mockResolvedValue({ id: 'shift1' });
  tx.operatingExpense.updateMany.mockResolvedValue({ count: 1 });
});

describe('POST /api/expenses — gasto PENDIENTE', () => {
  test('un gasto PENDING no toca caja: no busca turno ni crea ShiftExpense', async () => {
    const res = await request(makeApp('/api/expenses', expensesRoutes))
      .post('/api/expenses')
      .send({ concept: 'Insumos a crédito', amount: 800, paymentMethod: 'CASH_DRAWER', settlementStatus: 'PENDING' })
      .expect(201);

    expect(tx.operatingExpense.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ settlementStatus: 'PENDING', cashShiftId: null, amount: 800 }),
    }));
    expect(prisma.cashShift.findFirst).not.toHaveBeenCalled();
    expect(tx.shiftExpense.create).not.toHaveBeenCalled();
    expect(tx.cashShift.update).not.toHaveBeenCalled();
    expect(res.body.settlementStatus).toBe('PENDING');
  });

  test('un gasto PAID en efectivo sí crea ShiftExpense (comportamiento intacto)', async () => {
    await request(makeApp('/api/expenses', expensesRoutes))
      .post('/api/expenses')
      .send({ concept: 'Gas', amount: 150, paymentMethod: 'CASH_DRAWER' })
      .expect(201);

    expect(prisma.cashShift.findFirst).toHaveBeenCalled();
    expect(tx.shiftExpense.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shiftId: 'shift1', amount: 150 }),
    }));
    expect(tx.cashShift.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { totalExpenses: { increment: 150 } },
    }));
  });
});

describe('POST /api/expenses/:id/settle — liquidación', () => {
  test('settle CASH_DRAWER golpea la caja y es idempotente', async () => {
    prisma.operatingExpense.findFirst.mockResolvedValue({
      id: 'oe1', amount: 610, paidAmount: 0, concept: 'Pago a Pepe', locationId: 'loc1', categoryId: null, settlementStatus: 'PENDING',
    });
    // 1ª liquidación gana (count 1), 2ª pierde la carrera (count 0).
    tx.operatingExpense.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const app = makeApp('/api/expenses', expensesRoutes);

    await request(app).post('/api/expenses/oe1/settle').send({ paymentMethod: 'CASH_DRAWER' }).expect(200);
    await request(app).post('/api/expenses/oe1/settle').send({ paymentMethod: 'CASH_DRAWER' }).expect(409);

    // El ShiftExpense se creó UNA sola vez pese a las dos llamadas.
    expect(tx.shiftExpense.create).toHaveBeenCalledTimes(1);
    expect(tx.shiftExpense.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ operatingExpenseId: 'oe1', amount: 610, shiftId: 'shift1' }),
    }));
    expect(tx.cashShift.update).toHaveBeenCalledTimes(1);
  });

  test('abono parcial deja PENDIENTE, sube paidAmount y carga solo el abono a caja', async () => {
    prisma.operatingExpense.findFirst.mockResolvedValue({
      id: 'oe9', amount: 1000, paidAmount: 0, concept: 'Renta', locationId: 'loc1', categoryId: null, settlementStatus: 'PENDING',
    });
    tx.operatingExpense.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(makeApp('/api/expenses', expensesRoutes))
      .post('/api/expenses/oe9/settle')
      .send({ paymentMethod: 'CASH_DRAWER', amount: 400 })
      .expect(200);

    expect(res.body.fully).toBe(false);
    expect(res.body.paidAmount).toBe(400);
    expect(res.body.remaining).toBe(600);
    // No marca PAID en el update (sigue pendiente)
    const updArg = tx.operatingExpense.updateMany.mock.calls[0][0];
    expect(updArg.where).toMatchObject({ id: 'oe9', settlementStatus: 'PENDING', paidAmount: 0 });
    expect(updArg.data.settlementStatus).toBeUndefined();
    expect(updArg.data.paidAmount).toBe(400);
    // Solo el abono entra a caja
    expect(tx.shiftExpense.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: 400, operatingExpenseId: 'oe9' }),
    }));
    expect(tx.cashShift.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { totalExpenses: { increment: 400 } },
    }));
  });

  test('settle de un gasto ya pagado responde 409', async () => {
    prisma.operatingExpense.findFirst.mockResolvedValue({
      id: 'oe2', amount: 100, concept: 'X', locationId: 'loc1', categoryId: null, settlementStatus: 'PAID',
    });
    await request(makeApp('/api/expenses', expensesRoutes))
      .post('/api/expenses/oe2/settle').send({ paymentMethod: 'CASH_DRAWER' })
      .expect(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('POST /api/driver-cash/:driverId/movements — gasto pendiente del repartidor', () => {
  test('EXPENSE pendiente crea deuda y NO toca su corte ni la caja', async () => {
    const res = await request(makeApp('/api/driver-cash', driverCashRoutes))
      .post('/api/driver-cash/d1/movements')
      .send({ type: 'EXPENSE', category: 'OTROS', amount: 610, description: 'Pago pendiente con Pepe', pending: true })
      .expect(200);

    expect(res.body.pending).toBe(true);
    expect(prisma.operatingExpense.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ settlementStatus: 'PENDING', amount: 610, restaurantId: 'r1', locationId: 'loc1' }),
    }));
    // No reduce su balance (no DriverCashMovement) ni la caja (no ShiftExpense).
    expect(prisma.driverCashMovement.create).not.toHaveBeenCalled();
    expect(tx.shiftExpense.create).not.toHaveBeenCalled();
    expect(prisma.cashShift.findFirst).not.toHaveBeenCalled();
  });

  test('EXPENSE normal (no pendiente) sigue creando el movimiento del repartidor', async () => {
    await request(makeApp('/api/driver-cash', driverCashRoutes))
      .post('/api/driver-cash/d1/movements')
      .send({ type: 'EXPENSE', category: 'COMPRAS', amount: 55, description: 'Crema' })
      .expect(200);

    expect(prisma.operatingExpense.create).not.toHaveBeenCalled();
    expect(tx.shiftExpense.create).toHaveBeenCalled();
  });
});

describe('POST /api/payables/recurring/run — generador de recurrentes', () => {
  test('materializa plantillas vencidas como cuentas por pagar PENDIENTE', async () => {
    const past = new Date(Date.now() - 24 * 3600 * 1000);
    prisma.recurringExpense.findMany.mockResolvedValue([
      { id: 't1', restaurantId: 'r1', locationId: 'loc1', categoryId: null, supplierId: null,
        concept: 'Renta local', amount: 9000, frequency: 'MONTHLY', dayOfMonth: 1, nextDueAt: past },
    ]);
    tx.recurringExpense.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(makeApp('/api/payables', payablesRoutes))
      .post('/api/payables/recurring/run')
      .send({})
      .expect(200);

    expect(res.body).toMatchObject({ generated: 1, scanned: 1 });
    expect(tx.operatingExpense.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ settlementStatus: 'PENDING', amount: 9000, concept: 'Renta local', locationId: 'loc1' }),
    }));
    expect(tx.recurringExpense.updateMany).toHaveBeenCalled(); // avanza nextDueAt
  });
});
