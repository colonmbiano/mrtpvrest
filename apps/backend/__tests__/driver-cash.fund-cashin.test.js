'use strict';

// Tests del reflejo de los movimientos del repartidor en la CAJA PRINCIPAL.
// Modelo de una sola caja, sin doble gasto ni doble ingreso:
//  - INCOME que NO es cobro de entrega (fondo para compras que la caja entrega
//    al repartidor) → crea ShiftCashIn (suma al efectivo esperado). Sin esto, el
//    gasto que sale de ese fondo se restaba sin haber sumado el fondo → sobrante
//    fantasma en el cajón.
//  - INCOME category 'DELIVERY' (cobro de entrega) → NO crea ShiftCashIn: ya está
//    contado vía totalCash de la venta; reflejarlo sería doble ingreso.
//  - EXPENSE → ShiftExpense (comportamiento existente, intacto).
//  - POST /float (fondo de cambio) → depende del ORIGEN (regla del dueño):
//      · CAJA (default): el efectivo sale del cajón y regresa al corte del
//        repartidor → neto cero; NO crea ShiftCashIn (sumarlo sin registrar la
//        salida = faltante fantasma). Solo vive en la caja del repartidor.
//      · EXTERNO: dinero que entra de fuera; el repartidor lo devuelve al
//        liquidar → SÍ crea ShiftCashIn (sin él = sobrante fantasma).

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    driverCashMovement: { create: jest.fn(async (a) => ({ id: 'm1', ...a.data })) },
    shiftExpense: { create: jest.fn(async () => ({ id: 'se1' })) },
    shiftCashIn: { create: jest.fn(async () => ({ id: 'sci1' })) },
    cashShift: { update: jest.fn(async () => ({})) },
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
  prisma.cashShift.findFirst.mockResolvedValue({ id: 'shift1' }); // turno abierto
});

describe('POST /:driverId/movements — reflejo en la caja principal', () => {
  test('INCOME (fondo para compras) crea ShiftCashIn y NO ShiftExpense', async () => {
    await request(makeApp())
      .post('/api/driver-cash/d1/movements')
      .send({ type: 'INCOME', category: 'COMPRAS', amount: 1000, description: 'Para compras' })
      .expect(200);

    expect(tx.shiftCashIn.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shiftId: 'shift1', amount: 1000, category: 'FONDO_REPARTIDOR' }),
    }));
    expect(tx.cashShift.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'shift1' },
      data: { totalCashIn: { increment: 1000 } },
    }));
    expect(tx.shiftExpense.create).not.toHaveBeenCalled();
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

  test('sin turno abierto no refleja nada en la caja', async () => {
    prisma.cashShift.findFirst.mockResolvedValue(null);
    await request(makeApp())
      .post('/api/driver-cash/d1/movements')
      .send({ type: 'INCOME', category: 'COMPRAS', amount: 1000 })
      .expect(200);
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
