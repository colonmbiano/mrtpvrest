'use strict';

// Pedido de mesa por confirmar (QR a mesa libre o por el QR viejo por número)
// que la caja acepta cuando la mesa YA tiene una cuenta abierta: otro pedido QR
// aceptado antes, el mesero la abrió mientras esperaba, o el QR viejo a una mesa
// ocupada. En vez de dejar dos cuentas en la mesa:
//   - sus líneas pasan a la cuenta como una ronda nueva (id fijo qr-held-<id>)
//     y el total de la cuenta se recalcula desde todas sus líneas;
//   - el pedido queda CANCELLED en $0 con la nota de a dónde fue (no cuenta en
//     ventas ni se cobra aparte) y la respuesta trae `mergedInto`;
//   - va a cocina como ronda (order:updated + order:web-round), sin order:new
//     ni aviso de "cancelado" al cliente.
// Si no hay cuenta, o el pedido/cuenta llevan dinero propio (propina, cupón,
// pago en línea), la aceptación sigue el camino de siempre.
//
// Y el reclamo de impresión por ronda: cada ronda web se imprime una sola vez.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    order: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    orderRound: { findFirst: jest.fn(), findUnique: jest.fn() },
    table: { update: jest.fn() },
    bulkPromo: { findMany: jest.fn() },
    stockMovement: { findMany: jest.fn() },
    // Descuento de inventario de la ronda (sin recetas en estas pruebas).
    comboSelection: { findMany: jest.fn() },
    recipe: { findMany: jest.fn() },
    recipeItem: { findMany: jest.fn() },
    orderItemModifier: { findMany: jest.fn() },
    modifierIngredient: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', name: 'Cajero', restaurantId: 'r1', tenantId: 't1', role: 'CASHIER' };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
  requirePermission: () => (_req, _res, next) => next(),
  userHasPermission: () => true,
  hasValidOverride: () => false,
}));

jest.mock('../src/middleware/shift.middleware', () => ({
  requireActiveShift: (_req, _res, next) => next(),
}));

jest.mock('../src/services/notifications.service', () => ({
  notifyOrderStatus: jest.fn().mockResolvedValue(undefined),
  notifyDriversNewDeliveryOrder: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/printer.service', () => ({
  printOrderRoundTicket: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/lib/audit-logger', () => ({
  record: jest.fn().mockResolvedValue(undefined),
  AUDIT_EVENTS: { ORDER_CANCEL: 'ORDER_CANCEL', TAB_MERGE: 'TAB_MERGE' },
}));

jest.mock('../src/lib/print-claim', () => ({
  claimKitchenPrint: jest.fn().mockResolvedValue(true),
  releaseKitchenPrint: jest.fn().mockResolvedValue(undefined),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const { notifyOrderStatus } = require('../src/services/notifications.service');
const { printOrderRoundTicket } = require('../src/services/printer.service');
const audit = require('../src/lib/audit-logger');
const { claimKitchenPrint, releaseKitchenPrint } = require('../src/lib/print-claim');
const { OPEN_TABLE_STATUSES } = require('../src/lib/table-status');
const orderRoutes = require('../src/routes/orders.routes');

function fakeIo() {
  const emitted = [];
  return {
    emitted,
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  };
}

function makeApp(io) {
  const app = express();
  app.use(express.json());
  if (io) app.set('io', io);
  app.use('/api/orders', orderRoutes);
  return app;
}

// Pedido QR por confirmar de la mesa 7 ($140) y la cuenta que ya tiene la mesa ($100).
const HELD = {
  id: 'o1', status: 'PENDING', awaitingTableConfirmation: true,
  tableId: 't7', locationId: 'loc1', orderType: 'DINE_IN', customerName: 'Ana', notes: null,
  tip: 0, discount: 0, pointsUsed: 0, couponId: null, paymentStatus: 'PENDING', paymentProviderRef: null,
};
const TAB = {
  id: 'tab-1', restaurantId: 'r1', locationId: 'loc1', orderNumber: 2001, tableId: 't7', tableNumber: 7,
  status: 'OPEN', paymentStatus: 'PENDING', paymentProviderRef: null,
  subtotal: 100, discount: 0, deliveryFee: 0, tip: 0, total: 100, notes: null,
};

function txMock() {
  const lines = [{ id: 'li-1', orderId: 'tab-1', roundId: 'round-1', price: 100, quantity: 1, subtotal: 100, menuItem: { categoryId: 'c1' } }];
  const tx = {
    orderRound: {
      findFirst: jest.fn().mockResolvedValue({ roundNumber: 1 }),
      create: jest.fn().mockImplementation(async ({ data }) => ({ ...data })),
    },
    orderItem: {
      // Las líneas del pedido pasan a la cuenta, con su ronda.
      updateMany: jest.fn().mockImplementation(async ({ data }) => {
        lines.push({ id: 'li-o1', orderId: data.orderId, roundId: data.roundId, price: 70, quantity: 2, subtotal: 140, menuItem: { categoryId: 'c1' } });
        return { count: 1 };
      }),
      create: jest.fn(),
      findMany: jest.fn().mockImplementation(async () => lines),
    },
    order: {
      update: jest.fn().mockImplementation(async ({ where, data }) => (where.id === 'tab-1'
        ? { ...TAB, ...data, items: lines, rounds: [], table: { id: 't7', name: 'Mesa 7' } }
        : { ...HELD, orderNumber: 3002, ...data })),
    },
  };
  return { tx, impl: async (fn) => fn(tx) };
}

const accept = (io) => request(makeApp(io)).put('/api/orders/o1/status').send({ status: 'CONFIRMED' });

beforeEach(() => {
  jest.clearAllMocks();
  prisma.order.update.mockImplementation(async ({ data }) => ({ ...HELD, restaurantId: 'r1', orderNumber: 3002, ...data }));
  prisma.table.update.mockResolvedValue({});
  prisma.bulkPromo.findMany.mockResolvedValue([]);
  prisma.stockMovement.findMany.mockResolvedValue([]);
  prisma.comboSelection.findMany.mockResolvedValue([]);
  prisma.recipe.findMany.mockResolvedValue([]);
  prisma.recipeItem.findMany.mockResolvedValue([]);
  prisma.orderItemModifier.findMany.mockResolvedValue([]);
  prisma.modifierIngredient.findMany.mockResolvedValue([]);
});

describe('PUT /api/orders/:id/status · aceptar un pedido de mesa que ya tiene cuenta', () => {
  test('sus líneas pasan a la cuenta como ronda nueva y el pedido queda unido', async () => {
    prisma.order.findFirst.mockResolvedValueOnce(HELD).mockResolvedValueOnce(TAB);
    const { tx, impl } = txMock();
    prisma.$transaction.mockImplementation(impl);
    const io = fakeIo();

    const res = await accept(io);

    expect(res.status).toBe(200);
    // La cuenta de esa mesa, confirmada, de la misma sucursal y que no sea él mismo.
    expect(prisma.order.findFirst).toHaveBeenLastCalledWith({
      where: {
        tableId: 't7',
        status: { in: OPEN_TABLE_STATUSES },
        paymentStatus: { not: 'PAID' },
        locationId: 'loc1',
        awaitingTableConfirmation: false,
        id: { not: 'o1' },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(tx.orderRound.create).toHaveBeenCalledWith({
      data: { id: 'qr-held-o1', orderId: 'tab-1', roundNumber: 2 },
    });
    expect(tx.orderItem.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'o1' },
      data: { orderId: 'tab-1', roundId: 'qr-held-o1' },
    });
    // La cuenta se cobra una vez: total desde TODAS sus líneas.
    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tab-1' },
      data: { subtotal: 240, total: 240, promoDiscount: 0 },
    }));
    // El pedido queda vacío, en $0 y cancelado con el rastro: no se cobra aparte
    // ni cuenta en ventas.
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: {
        status: 'CANCELLED', awaitingTableConfirmation: false, subtotal: 0, total: 0,
        notes: '[Unido a la cuenta 2001 como ronda 2]',
      },
    });
    expect(prisma.table.update).toHaveBeenCalledWith({ where: { id: 't7' }, data: { status: 'OCCUPIED' } });
    expect(res.body).toMatchObject({
      id: 'o1', status: 'CANCELLED', mergedInto: { id: 'tab-1', orderNumber: 2001, roundNumber: 2 },
    });
    // Sin el camino normal: ni update suelto, ni aviso de cancelado al cliente.
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(notifyOrderStatus).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), 'TAB_MERGE', expect.objectContaining({
      resource: 'order:tab-1',
    }));
  });

  test('va a cocina como ronda de la cuenta: order:updated + order:web-round, sin order:new', async () => {
    prisma.order.findFirst.mockResolvedValueOnce(HELD).mockResolvedValueOnce(TAB);
    const { impl } = txMock();
    prisma.$transaction.mockImplementation(impl);
    const io = fakeIo();

    await accept(io);

    expect(io.emitted.map((e) => [e.room, e.event])).toEqual([
      ['restaurant:r1:location:loc1:admins', 'order:updated'],
      ['restaurant:r1:location:loc1:admins', 'order:web-round'],
    ]);
    expect(io.emitted[1].payload).toMatchObject({
      id: 'tab-1', orderNumber: 2001, roundId: 'qr-held-o1', roundNumber: 2,
      customerName: 'Ana', total: 140, source: 'ONLINE',
    });
    expect(printOrderRoundTicket).toHaveBeenCalledWith(expect.objectContaining({ id: 'tab-1' }), 'qr-held-o1');
    // Inventario: la ronda no descuenta nada; la cuenta se consume completa al cobrarla.
    expect(prisma.comboSelection.findMany).not.toHaveBeenCalled();
  });

  test('la nota del comensal pasa a las notas de la cuenta', async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ ...HELD, notes: 'Sin hielo' }).mockResolvedValueOnce(TAB);
    const { tx, impl } = txMock();
    prisma.$transaction.mockImplementation(impl);

    await accept();

    const tabUpdate = tx.order.update.mock.calls.find((c) => c[0].where.id === 'tab-1')[0];
    expect(tabUpdate.data.notes).toBe('Ronda QR (Ana): Sin hielo');
  });

  test('dos cajas aceptan a la vez (P2002) → responde la unión ya hecha, sin repetir efectos', async () => {
    prisma.order.findFirst.mockResolvedValueOnce(HELD).mockResolvedValueOnce(TAB);
    prisma.$transaction.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    prisma.orderRound.findUnique.mockResolvedValue({ id: 'qr-held-o1', orderId: 'tab-1', roundNumber: 2 });
    prisma.order.findUnique.mockResolvedValue({ ...HELD, status: 'CANCELLED', awaitingTableConfirmation: false });
    const io = fakeIo();

    const res = await accept(io);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'CANCELLED', mergedInto: { id: 'tab-1', roundNumber: 2 } });
    expect(io.emitted).toEqual([]);
    expect(prisma.table.update).not.toHaveBeenCalled();
  });
});

describe('PUT /api/orders/:id/status · cuándo el pedido aceptado se vuelve la cuenta (como antes)', () => {
  const normalAccept = (io) => {
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { status: 'CONFIRMED', awaitingTableConfirmation: false },
    });
    expect(io.emitted.filter((e) => e.event === 'order:new')).toHaveLength(3);
  };

  test('la mesa no tiene cuenta → el pedido es la cuenta y va a cocina con order:new', async () => {
    prisma.order.findFirst.mockResolvedValueOnce(HELD).mockResolvedValueOnce(null);
    const io = fakeIo();

    const res = await accept(io);

    expect(res.status).toBe(200);
    normalAccept(io);
  });

  test.each([
    ['propina', { tip: 15 }],
    ['cupón', { couponId: 'cup-1', discount: 10 }],
    ['puntos', { pointsUsed: 50, discount: 5 }],
  ])('pedido con %s → no se une (ese dinero vive en la orden)', async (_label, extra) => {
    prisma.order.findFirst.mockResolvedValueOnce({ ...HELD, ...extra });
    const io = fakeIo();

    await accept(io);

    expect(prisma.order.findFirst).toHaveBeenCalledTimes(1); // ni busca la cuenta
    normalAccept(io);
  });

  test.each([
    ['propina', { tip: 20 }],
    ['pago en línea abierto', { paymentProviderRef: 'mp-pref-1' }],
  ])('cuenta con %s → no se une (no se pierde ni se cobra doble)', async (_label, extra) => {
    prisma.order.findFirst.mockResolvedValueOnce(HELD).mockResolvedValueOnce({ ...TAB, ...extra });
    const io = fakeIo();

    await accept(io);

    normalAccept(io);
  });

  test('rechazar nunca busca cuenta: cancela como antes', async () => {
    prisma.order.findFirst.mockResolvedValueOnce(HELD);

    const res = await request(makeApp()).put('/api/orders/o1/status').send({ status: 'CANCELLED' });

    expect(res.status).toBe(200);
    // Una sola lectura (el pedido): no busca la cuenta de la mesa. Reponer el
    // inventario al cancelar abre su propia transacción en segundo plano.
    expect(prisma.order.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.order.update.mock.calls[0][0].data).toEqual({ status: 'CANCELLED', awaitingTableConfirmation: false });
  });
});

describe('POST /api/orders/:id/claim-kitchen-print · ronda web', () => {
  test('cada ronda tiene su propio reclamo', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'tab-1', awaitingTableConfirmation: false });
    prisma.orderRound.findFirst.mockResolvedValue({ id: 'qr-abc' });

    const res = await request(makeApp()).post('/api/orders/tab-1/claim-kitchen-print').send({ roundId: 'qr-abc' });

    expect(res.body).toEqual({ claimed: true });
    expect(prisma.orderRound.findFirst).toHaveBeenCalledWith({
      where: { id: 'qr-abc', orderId: 'tab-1' }, select: { id: true },
    });
    expect(claimKitchenPrint).toHaveBeenCalledWith('r1:tab-1:qr-abc');
  });

  test('una ronda que no es de ese pedido → 404 sin reclamar', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'tab-1', awaitingTableConfirmation: false });
    prisma.orderRound.findFirst.mockResolvedValue(null);

    const res = await request(makeApp()).post('/api/orders/tab-1/claim-kitchen-print').send({ roundId: 'qr-ajena' });

    expect(res.status).toBe(404);
    expect(claimKitchenPrint).not.toHaveBeenCalled();
  });

  test('sin ronda el reclamo sigue siendo el del pedido', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'tab-1', awaitingTableConfirmation: false });

    await request(makeApp()).post('/api/orders/tab-1/claim-kitchen-print');

    expect(prisma.orderRound.findFirst).not.toHaveBeenCalled();
    expect(claimKitchenPrint).toHaveBeenCalledWith('r1:tab-1');
  });

  test('liberar también va por ronda', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'tab-1' });
    prisma.orderRound.findFirst.mockResolvedValue({ id: 'qr-abc' });

    const res = await request(makeApp()).post('/api/orders/tab-1/release-kitchen-print').send({ roundId: 'qr-abc' });

    expect(res.body).toEqual({ released: true });
    expect(releaseKitchenPrint).toHaveBeenCalledWith('r1:tab-1:qr-abc');
  });
});
