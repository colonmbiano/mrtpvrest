'use strict';

jest.mock('../src/services/order-inventory.service', () => ({ consumePaidOrder: jest.fn(async () => {}) }));
jest.mock('@mrtpvrest/database', () => ({ prisma: {} }));
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'owner', role: 'OWNER', restaurantId: 'r1', canManageShifts: true };
    req.restaurantId = 'r1'; req.locationId = 'loc1'; next();
  },
  requireTenantAccess: (_req, _res, next) => next(),
  requireAdmin: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
}));
jest.mock('../src/lib/modules', () => ({
  requireModule: () => (_req, _res, next) => next(), MODULES: {},
}));
jest.mock('../src/lib/audit-logger', () => ({ AUDIT_EVENTS: {}, record: jest.fn(async () => {}) }));
jest.mock('../src/lib/vault', () => ({ applyShiftVaultMovement: jest.fn(async () => {}) }));
jest.mock('../src/lib/cash-cut-mailer', () => ({ sendCashCutEmail: jest.fn(async () => {}) }));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const { consumePaidOrder } = require('../src/services/order-inventory.service');
const { cutDriverCash, cashTransaction } = require('../src/lib/driver-cash-settlement');
const cashRoutes = require('../src/routes/driver-cash.routes');
const shiftRoutes = require('../src/routes/shifts.routes');

const driver = { id: 'd1', name: 'Polo', locationId: 'loc1', role: 'DELIVERY' };
let order, movement, shift;
const app = express();
app.use(express.json());
app.use('/cash', cashRoutes);
app.use('/shifts', shiftRoutes);

beforeEach(() => {
  jest.clearAllMocks();
  order = { id: 'o1', orderNumber: '6195', restaurantId: 'r1', locationId: 'loc1',
    deliveryDriverId: 'd1', orderType: 'DELIVERY', status: 'DELIVERED',
    paymentMethod: 'CASH', paymentStatus: 'PENDING', paidAt: null, total: 300, payments: [] };
  movement = { id: 'm1', driverId: 'd1', orderId: 'o1', type: 'INCOME', category: 'DELIVERY', amount: 300, approved: false };
  shift = { id: 'saturday', locationId: 'loc1', isOpen: true,
    openedAt: new Date('2026-11-07T21:00:00Z'), expenses: [], cashIns: [], openingFloat: 500 };
  Object.assign(prisma, {
    employee: { findFirst: jest.fn(async () => driver), findMany: jest.fn(async () => [driver]) },
    employeeShift: { updateMany: jest.fn(async () => ({ count: 1 })) },
    restaurantConfig: { findUnique: jest.fn(async () => null) },
    order: {
      findMany: jest.fn(async ({ where }) => where.id ? [{ ...order }]
        : (order.paymentStatus === 'PAID' ? [{ ...order }] : [])),
      updateMany: jest.fn(async ({ data }) => { Object.assign(order, data); return { count: 1 }; }),
    },
    cashShift: {
      findFirst: jest.fn(async () => shift),
      update: jest.fn(async ({ data }) => { Object.assign(shift, data); return { ...shift }; }),
    },
    driverCashMovement: {
      findMany: jest.fn(async () => movement.approved ? [] : [{ ...movement }]),
      updateMany: jest.fn(async ({ data }) => { Object.assign(movement, data); return { count: 1 }; }),
    },
    driverCashCut: { create: jest.fn(async ({ data }) => ({ id: 'cut1', ...data })) },
    driverShiftRequest: { updateMany: jest.fn(async () => ({ count: 0 })) },
  });
  prisma.$transaction = jest.fn(async (work) => work(prisma));
});

test('corte manual liquida los pedidos y los movimientos juntos en el turno original', async () => {
  const res = await request(app).post('/cash/d1/cut').send({}).expect(200);
  expect(res.body.balance).toBe(300);
  expect(order.paymentStatus).toBe('PAID');
  expect(order.shiftId).toBe('saturday');
  expect(order.paidAt).toEqual(movement.approvedAt);
  expect(movement.approved).toBe(true);
  expect(consumePaidOrder).toHaveBeenCalledWith(prisma, 'o1', 'r1');
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
});

test('cerrar caja liquida primero y luego incluye el efectivo en el MISMO corte', async () => {
  const res = await request(app).post('/shifts/saturday/close').send({ closingFloat: 800 }).expect(200);
  expect(res.body.totalCash).toBe(300);
  expect(res.body.expectedCash).toBe(800);
  expect(res.body.driversCut).toBe(1);
  expect(order.shiftId).toBe('saturday');
  expect(order.paidAt).toEqual(shift.closedAt);
  expect(movement.approvedAt).toEqual(shift.closedAt);
  expect(prisma.order.updateMany.mock.invocationCallOrder[0])
    .toBeLessThan(prisma.cashShift.update.mock.invocationCallOrder[0]);
});

test('repetir corte sin movimientos no crea otro corte ni mueve el pedido', async () => {
  await request(app).post('/cash/d1/cut').send({}).expect(200);
  const settledAt = order.paidAt;
  shift.id = 'sunday';
  const res = await request(app).post('/cash/d1/cut').send({}).expect(200);
  expect(res.body.alreadyClosed).toBe(true);
  expect(order.paidAt).toBe(settledAt);
  expect(order.shiftId).toBe('saturday');
  expect(prisma.driverCashCut.create).toHaveBeenCalledTimes(1);
});

test('cobro ya confirmado por caja conserva su fecha y turno al cortar al repartidor', async () => {
  Object.assign(order, { paymentStatus: 'PAID', paidAt: new Date('2026-11-08T02:00:00Z'), shiftId: 'saturday' });
  const original = order.paidAt;
  await cutDriverCash(prisma, driver, { restaurantId: 'r1', shiftId: 'sunday' });
  expect(order.paidAt).toBe(original);
  expect(order.shiftId).toBe('saturday');
  expect(prisma.order.updateMany).not.toHaveBeenCalled();
});

test.each([
  ['importe distinto', { total: 400 }],
  ['pedido cancelado', { status: 'CANCELLED' }],
  ['transferencia registrada como efectivo', { paymentMethod: 'TRANSFER' }],
])('no aprueba el corte si hay %s', async (_label, changes) => {
  Object.assign(order, changes);
  await expect(cutDriverCash(prisma, driver, { restaurantId: 'r1', shiftId: 'saturday' }))
    .rejects.toMatchObject({ status: 409 });
  expect(prisma.driverCashCut.create).not.toHaveBeenCalled();
  expect(movement.approved).toBe(false);
});

test('sin turno no aprueba una liquidación de pedidos', async () => {
  await expect(cutDriverCash(prisma, driver, { restaurantId: 'r1' })).rejects.toMatchObject({ status: 409 });
  expect(prisma.driverCashCut.create).not.toHaveBeenCalled();
});

test('cobros de otro restaurante/repartidor no se liquidan por id sin scope', async () => {
  prisma.order.findMany.mockResolvedValue([]);
  await expect(cutDriverCash(prisma, driver, { restaurantId: 'r1', shiftId: 'saturday' }))
    .rejects.toMatchObject({ status: 409 });
  expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ restaurantId: 'r1', deliveryDriverId: 'd1', locationId: 'loc1' }),
  }));
  expect(prisma.driverCashCut.create).not.toHaveBeenCalled();
});

test('una aprobación concurrente provoca conflicto en vez de aprobar dos veces', async () => {
  prisma.driverCashMovement.updateMany.mockResolvedValue({ count: 0 });
  await expect(cutDriverCash(prisma, driver, { restaurantId: 'r1', shiftId: 'saturday' }))
    .rejects.toMatchObject({ status: 409 });
});

test('reintenta conflictos serializables y no reintenta otros errores financieros', async () => {
  const db = { $transaction: jest.fn().mockRejectedValueOnce({ code: 'P2034' }).mockResolvedValueOnce('ok') };
  await expect(cashTransaction(db, async () => {})).resolves.toBe('ok');
  expect(db.$transaction).toHaveBeenCalledTimes(2);
  db.$transaction.mockReset().mockRejectedValue(new Error('No hay efectivo'));
  await expect(cashTransaction(db, async () => {})).rejects.toThrow('No hay efectivo');
  expect(db.$transaction).toHaveBeenCalledTimes(1);
});
