'use strict';

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    order: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    orderItem: { updateMany: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  };
  return { prisma: { $transaction: jest.fn((fn) => fn(tx)), __tx: tx } };
});
jest.mock('../src/lib/order-number', () => ({ nextOrderNumber: jest.fn().mockResolvedValue('43') }));
jest.mock('../src/lib/bulk-promo', () => ({
  loadActiveBulkPromos: jest.fn().mockResolvedValue([]),
  computeBulkPromoDiscount: jest.fn(() => ({ promoDiscount: 0 })),
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', restaurantId: 'r1', tenantId: 't1', role: 'CASHIER' };
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

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const routes = require('../src/routes/orders.routes');
const tx = prisma.__tx;

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/orders', routes);
  return server;
}

let orders;
let items;

beforeEach(() => {
  jest.clearAllMocks();
  orders = {
    o1: {
      id: 'o1', restaurantId: 'r1', locationId: 'loc1', orderNumber: '42',
      status: 'OPEN', paymentStatus: 'PENDING', orderType: 'DINE_IN',
      tableId: 'table1', tableNumber: 1, discount: 0, deliveryFee: 0,
      subtotal: 240, total: 240,
    },
  };
  items = [{
    id: 'burger', orderId: 'o1', menuItemId: 'menu1', name: 'Hamburguesa',
    price: 120, quantity: 2, subtotal: 240, notes: 'sin cebolla',
    roundId: 'round1', seatNumber: null, course: 'FUERTE',
    weightKg: null, costSnapshot: null, recipeIdSnap: null,
    modifiers: [{ modifierId: 'extra1', name: 'Tocino', priceAdd: 20 }],
    comboSelections: [{ componentId: 'c1', optionId: 'opt1', optionMenuItemId: 'menu2', name: 'Papas', priceDelta: 0 }],
  }];

  tx.order.findFirst.mockImplementation(async ({ where }) =>
    orders[where.id]?.restaurantId === where.restaurantId
      ? { ...orders[where.id], items: items.filter((item) => item.orderId === where.id).map((item) => ({ ...item })) }
      : null);
  tx.order.create.mockImplementation(async ({ data }) => {
    orders.o2 = { id: 'o2', ...data };
    return orders.o2;
  });
  tx.orderItem.updateMany.mockImplementation(async ({ where, data }) => {
    const item = items.find((it) => it.id === where.id && it.orderId === where.orderId && it.quantity === where.quantity);
    if (!item) return { count: 0 };
    Object.assign(item, data);
    return { count: 1 };
  });
  tx.orderItem.create.mockImplementation(async ({ data }) => {
    const item = { id: 'burger-split', ...data };
    items.push(item);
    return item;
  });
  tx.orderItem.findMany.mockImplementation(async ({ where }) =>
    items.filter((item) => item.orderId === where.orderId).map((item) => ({
      ...item, menuItem: { categoryId: 'cat1' },
    })));
  tx.order.update.mockImplementation(async ({ where, data }) => {
    Object.assign(orders[where.id], data);
    return orders[where.id];
  });
  tx.order.findUnique.mockImplementation(async ({ where }) => ({
    ...orders[where.id], items: items.filter((item) => item.orderId === where.id),
  }));
});

describe('POST /api/orders/:id/split', () => {
  it('separa una de dos hamburguesas y conserva precio, extras y opciones', async () => {
    const response = await request(app()).post('/api/orders/o1/split')
      .send({ items: [{ id: 'burger', quantity: 1 }] }).expect(200);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ orderId: 'o1', quantity: 1, subtotal: 120 });
    expect(items[1]).toMatchObject({ orderId: 'o2', quantity: 1, subtotal: 120 });
    expect(tx.orderItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      modifiers: { create: [{ modifierId: 'extra1', name: 'Tocino', priceAdd: 20 }] },
      comboSelections: { create: [{ componentId: 'c1', optionId: 'opt1', optionMenuItemId: 'menu2', name: 'Papas', priceDelta: 0 }] },
    }) });
    expect(response.body.source).toMatchObject({ subtotal: 120, total: 120 });
    expect(response.body.created).toMatchObject({ subtotal: 120, total: 120 });
  });

  it('reparte los centavos sin alterar el subtotal conjunto', async () => {
    items[0].subtotal = 200.01;
    items[0].price = 100.005;
    const response = await request(app()).post('/api/orders/o1/split')
      .send({ items: [{ id: 'burger', quantity: 1 }] }).expect(200);
    expect(response.body.source.subtotal + response.body.created.subtotal).toBeCloseTo(200.01, 2);
  });

  it('rechaza cantidades inválidas y una cuenta que quedaría vacía', async () => {
    await request(app()).post('/api/orders/o1/split')
      .send({ items: [{ id: 'burger', quantity: 3 }] }).expect(400);
    await request(app()).post('/api/orders/o1/split')
      .send({ items: [{ id: 'burger', quantity: 2 }] }).expect(400);
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('acepta el formato anterior itemIds para mover un renglón completo', async () => {
    items.push({ ...items[0], id: 'drink', name: 'Refresco', quantity: 1, subtotal: 30, price: 30 });
    await request(app()).post('/api/orders/o1/split').send({ itemIds: ['drink'] }).expect(200);
    expect(items.find((item) => item.id === 'drink').orderId).toBe('o2');
  });
});
