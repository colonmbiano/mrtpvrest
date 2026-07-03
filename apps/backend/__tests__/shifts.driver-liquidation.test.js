'use strict';

// Liquidación por responsable (shiftDriverLiquidation) — modelo de CAJA ÚNICA.
// Regla del dueño: no hay cajas separadas; el repartidor es responsable
// temporal de movimientos de la caja única. Su rendición:
//   Sobrante de fondo = Fondo recibido − Compras comprobadas
//   Total a entregar  = Cobros de pedidos (efectivo) + Sobrante de fondo
// Los cobros salen de las ÓRDENES (fuente única, ya en totalCash) — solo se
// ATRIBUYEN al responsable, no se suman de nuevo (sin doble conteo).

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    employee: { findMany: jest.fn() },
    driverCashMovement: { findMany: jest.fn() },
    order: { findMany: jest.fn() },
  },
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (_req, _res, next) => next(),
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
}));
jest.mock('../src/lib/modules', () => ({
  requireModule: () => (_req, _res, next) => next(),
  MODULES: { MODULE_CASH_SHIFT: 'cash_shift' },
}));

const { prisma } = require('@mrtpvrest/database');
const { shiftDriverLiquidation } = require('../src/routes/shifts.routes');

const shift = {
  id: 'shift1',
  locationId: 'loc1',
  openedAt: new Date('2026-07-02T21:54:05Z'),
  closedAt: new Date('2026-07-03T06:12:34Z'),
};

beforeEach(() => jest.clearAllMocks());

test('caso real: Mau (fondo+compras+cobros) y Kebra (solo cobros de pedidos viejos liquidados hoy)', async () => {
  prisma.employee.findMany.mockResolvedValue([
    { id: 'mau', name: 'Mau' },
    { id: 'kebra', name: 'Kebra' },
  ]);
  prisma.driverCashMovement.findMany.mockResolvedValue([
    { driverId: 'mau', type: 'FLOAT', amount: 2100 },
    { driverId: 'mau', type: 'EXPENSE', amount: 2018 },
  ]);
  prisma.order.findMany.mockResolvedValue([
    // 6 de Mau (2,405.60) — solo efectivo cuenta como cobro en mano
    { deliveryDriverId: 'mau', paymentMethod: 'CASH', total: 490, payments: [] },
    { deliveryDriverId: 'mau', paymentMethod: 'CASH', total: 655, payments: [] },
    { deliveryDriverId: 'mau', paymentMethod: 'CASH', total: 130, payments: [] },
    { deliveryDriverId: 'mau', paymentMethod: 'CASH', total: 308.5, payments: [] },
    { deliveryDriverId: 'mau', paymentMethod: 'CASH', total: 612.1, payments: [] },
    { deliveryDriverId: 'mau', paymentMethod: 'CASH', total: 210, payments: [] },
    // 2 de Kebra
    { deliveryDriverId: 'kebra', paymentMethod: 'CASH', total: 160, payments: [] },
    { deliveryDriverId: 'kebra', paymentMethod: 'CASH', total: 345, payments: [] },
  ]);

  const liq = await shiftDriverLiquidation(shift);
  const mau = liq.find((l) => l.driverId === 'mau');
  const kebra = liq.find((l) => l.driverId === 'kebra');

  expect(mau).toMatchObject({
    fondo: 2100,
    compras: 2018,
    sobrante: 82,
    cobros: 2405.6,
    pedidos: 6,
    totalAEntregar: 2487.6,
    entregadoReal: null,
    diferencia: null,
  });
  expect(kebra).toMatchObject({ fondo: 0, compras: 0, sobrante: 0, cobros: 505, totalAEntregar: 505 });
});

test('transfer/tarjeta se REPORTAN en la rendición pero NO suman al efectivo a entregar', async () => {
  prisma.employee.findMany.mockResolvedValue([{ id: 'd1', name: 'Repa' }]);
  prisma.driverCashMovement.findMany.mockResolvedValue([]);
  prisma.order.findMany.mockResolvedValue([
    { deliveryDriverId: 'd1', paymentMethod: 'TRANSFER', total: 145, payments: [] },
    { deliveryDriverId: 'd1', paymentMethod: 'CARD', total: 90, payments: [] },
    { deliveryDriverId: 'd1', paymentMethod: 'CASH', total: 200, payments: [] },
  ]);
  const [l] = await shiftDriverLiquidation(shift);
  expect(l.cobros).toBe(200); // solo el efectivo pasa por sus manos
  expect(l.cobrosTransfer).toBe(145); // a verificar en banco
  expect(l.cobrosTarjeta).toBe(90); // terminal
  expect(l.totalAEntregar).toBe(200); // transfer/tarjeta NO se entregan físicamente
  expect(l.pedidos).toBe(3);
});

test('responsable con SOLO transferencias sí aparece en la liquidación (hay que verificarlas)', async () => {
  prisma.employee.findMany.mockResolvedValue([{ id: 'd1', name: 'Repa' }]);
  prisma.driverCashMovement.findMany.mockResolvedValue([]);
  prisma.order.findMany.mockResolvedValue([
    { deliveryDriverId: 'd1', paymentMethod: 'TRANSFER', total: 145, payments: [] },
  ]);
  const liq = await shiftDriverLiquidation(shift);
  expect(liq).toHaveLength(1);
  expect(liq[0].cobrosTransfer).toBe(145);
  expect(liq[0].totalAEntregar).toBe(0);
});

test('cobro MIXTO: solo la porción en efectivo de payments[] cuenta', async () => {
  prisma.employee.findMany.mockResolvedValue([{ id: 'd1', name: 'Repa' }]);
  prisma.driverCashMovement.findMany.mockResolvedValue([]);
  prisma.order.findMany.mockResolvedValue([
    {
      deliveryDriverId: 'd1', paymentMethod: 'MIXED', total: 500,
      payments: [
        { method: 'CASH', amount: 300, status: 'PAID' },
        { method: 'CARD', amount: 200, status: 'PAID' },
        { method: 'CASH', amount: 999, status: 'FAILED' }, // no acreditado: fuera
      ],
    },
  ]);
  const [l] = await shiftDriverLiquidation(shift);
  expect(l.cobros).toBe(300);
});

test('responsables sin movimientos ni cobros no aparecen en la liquidación', async () => {
  prisma.employee.findMany.mockResolvedValue([
    { id: 'activo', name: 'Activo' },
    { id: 'ocioso', name: 'Ocioso' },
  ]);
  prisma.driverCashMovement.findMany.mockResolvedValue([{ driverId: 'activo', type: 'FLOAT', amount: 100 }]);
  prisma.order.findMany.mockResolvedValue([]);
  const liq = await shiftDriverLiquidation(shift);
  expect(liq.map((l) => l.driverId)).toEqual(['activo']);
});

test('fondo gastado de más = sobrante negativo (el responsable debe la diferencia)', async () => {
  prisma.employee.findMany.mockResolvedValue([{ id: 'd1', name: 'Repa' }]);
  prisma.driverCashMovement.findMany.mockResolvedValue([
    { driverId: 'd1', type: 'FLOAT', amount: 500 },
    { driverId: 'd1', type: 'EXPENSE', amount: 700 },
  ]);
  prisma.order.findMany.mockResolvedValue([
    { deliveryDriverId: 'd1', paymentMethod: 'CASH', total: 1000, payments: [] },
  ]);
  const [l] = await shiftDriverLiquidation(shift);
  expect(l.sobrante).toBe(-200);
  expect(l.totalAEntregar).toBe(800); // 1000 cobrado − 200 que puso del fondo de más
});

test('ventana: consulta movimientos y órdenes dentro de [openedAt, closedAt] del turno', async () => {
  prisma.employee.findMany.mockResolvedValue([{ id: 'd1', name: 'Repa' }]);
  prisma.driverCashMovement.findMany.mockResolvedValue([]);
  prisma.order.findMany.mockResolvedValue([]);
  await shiftDriverLiquidation(shift);
  expect(prisma.driverCashMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ createdAt: { gte: shift.openedAt, lte: shift.closedAt } }),
  }));
  expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      orderType: 'DELIVERY',
      paymentStatus: 'PAID',
      paidAt: { gte: shift.openedAt, lte: shift.closedAt },
    }),
  }));
});
