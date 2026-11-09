jest.mock('../src/lib/audit-logger', () => ({ ...jest.requireActual('../src/lib/audit-logger'), record: jest.fn(async () => {}) }));
'use strict';

// Fondos de cambio y compras usan SOLO /float, distinguiendo CAJA de EXTERNO.
// El formulario genérico no puede volver a crear una entrada ficticia de caja.

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    driverCashMovement: { create: jest.fn(async (a) => ({ id: 'm1', ...a.data })) },
    shiftExpense: { create: jest.fn(async () => ({ id: 'se1' })) },
    shiftCashIn: { create: jest.fn(async () => ({ id: 'sci1' })) },
    cashShift: { update: jest.fn(async () => ({})), findFirst: jest.fn() },
  };
  return {
    prisma: {
      employee: { findFirst: jest.fn() },
      driverCashMovement: { findFirst: jest.fn() },
      cashShift: { findFirst: jest.fn() },
      order: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(tx)),
      __tx: tx,
    },
  };
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', name: 'Dueño', restaurantId: 'r1', role: 'OWNER' };
    req.restaurantId = 'r1';
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const driverCashRoutes = require('../src/routes/driver-cash.routes');

const tx = prisma.__tx;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/driver-cash', driverCashRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.employee.findFirst.mockResolvedValue({ id: 'd1', name: 'Mau', locationId: 'loc1' });
  prisma.driverCashMovement.findFirst.mockResolvedValue(null); // sin duplicado (dedupe)
  tx.cashShift.findFirst.mockResolvedValue({ id: 'shift1' });
  prisma.cashShift.findFirst.mockResolvedValue({ id: 'shift1' }); // turno abierto
});

describe('POST /:driverId/movements — reflejo en la caja principal', () => {
  test('INCOME para compras exige la única asignación de fondos, sin escribir dinero', async () => {
    const res = await request(makeApp())
      .post('/api/driver-cash/d1/movements')
      .send({ type: 'INCOME', category: 'COMPRAS', amount: 1000, description: 'Para compras' })
      .expect(409);
    expect(res.body.code).toBe('USE_ASSIGN_FUNDS');
    expect(tx.driverCashMovement.create).not.toHaveBeenCalled();
    expect(tx.shiftCashIn.create).not.toHaveBeenCalled();
  });

  test('INCOME cobro de entrega (category DELIVERY) NO crea ShiftCashIn (evita doble ingreso)', async () => {
    await request(makeApp())
      .post('/api/driver-cash/d1/movements')
      .send({ type: 'INCOME', category: 'DELIVERY', amount: 250 })
      .expect(200);

    expect(tx.shiftCashIn.create).not.toHaveBeenCalled();
    expect(tx.shiftExpense.create).not.toHaveBeenCalled();
  });

  test('EXPENSE crea ShiftExpense y NO ShiftCashIn', async () => {
    await request(makeApp())
      .post('/api/driver-cash/d1/movements')
      .send({ type: 'EXPENSE', category: 'COMPRAS', amount: 807, description: 'Verduras' })
      .expect(200);

    expect(tx.shiftExpense.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shiftId: 'shift1', amount: 807 }),
    }));
    expect(tx.cashShift.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { totalExpenses: { increment: 807 } },
    }));
    expect(tx.shiftCashIn.create).not.toHaveBeenCalled();
  });

  test('sin turno abierto no permite asignar fondos', async () => {
    tx.cashShift.findFirst.mockResolvedValue(null);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    await request(makeApp())
      .post('/api/driver-cash/d1/float')
      .send({ amount: 1000, purpose: 'COMPRAS', source: 'CAJA' })
      .expect(409);
    log.mockRestore();
    expect(tx.driverCashMovement.create).not.toHaveBeenCalled();
    expect(tx.shiftCashIn.create).not.toHaveBeenCalled();
    expect(tx.shiftExpense.create).not.toHaveBeenCalled();
  });
});

describe('POST /:driverId/float — fondo de cambio (efecto según origen)', () => {
  // CANDADO: fondo DESDE CAJA (default) NO crea ShiftCashIn. El efectivo sale
  // del cajón y regresa en el corte del repartidor → neto cero para el cierre;
  // sumarlo sin registrar la salida inflaría el esperado (faltante fantasma).
  test('FLOAT sin source (default CAJA) NO crea ShiftCashIn', async () => {
    await request(makeApp())
      .post('/api/driver-cash/d1/float')
      .send({ amount: 500, description: 'Cambio' })
      .expect(200);

    expect(tx.driverCashMovement.create).toHaveBeenCalled();
    expect(tx.shiftCashIn.create).not.toHaveBeenCalled();
    expect(tx.cashShift.update).not.toHaveBeenCalled();
  });

  test('FLOAT source CAJA NO crea ShiftCashIn', async () => {
    await request(makeApp())
      .post('/api/driver-cash/d1/float')
      .send({ amount: 500, description: 'Cambio', source: 'CAJA' })
      .expect(200);

    expect(tx.shiftCashIn.create).not.toHaveBeenCalled();
    expect(tx.cashShift.update).not.toHaveBeenCalled();
  });

  // CANDADO: el fondo EXTERNO (dinero de fuera, p.ej. la cartera del dueño)
  // SÍ suma a la caja. El repartidor lo devuelve al liquidar, así que el
  // cierre debe esperarlo; si no suma, ese efectivo entra al cajón sin estar
  // en el esperado → sobrante fantasma (caso real 2026-07-03: fondo $400
  // EXTERNO → sobrante +$395.35 en el cierre de esa noche).
  test('FLOAT source EXTERNO crea ShiftCashIn (suma a la caja)', async () => {
    await request(makeApp())
      .post('/api/driver-cash/d1/float')
      .send({ amount: 400, description: 'Compras', source: 'EXTERNO' })
      .expect(200);

    expect(tx.shiftCashIn.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shiftId: 'shift1', amount: 400, category: 'FONDO_REPARTIDOR' }),
    }));
    expect(tx.cashShift.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { totalCashIn: { increment: 400 } },
    }));
  });
});

test.each(['CAMBIO', 'COMPRAS'])('fondo %s desde caja no crea ingresos nuevos', async (purpose) => {
  await request(makeApp()).post('/api/driver-cash/d1/float')
    .send({ amount: 1000, purpose, source: 'CAJA' }).expect(200);
  expect(tx.driverCashMovement.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ type: 'FLOAT', category: purpose, amount: 1000 }),
  }));
  expect(tx.shiftCashIn.create).not.toHaveBeenCalled();
});

test('fondos con origen desconocido no crean dinero', async () => {
  await request(makeApp()).post('/api/driver-cash/d1/float')
    .send({ amount: 1000, source: 'OTRO' }).expect(400);
  expect(tx.driverCashMovement.create).not.toHaveBeenCalled();
});
