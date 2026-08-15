'use strict';

// Pedido desde el QR de mesa (POST /api/store/orders con orderType DINE_IN).
//
// El número de mesa del QR se resuelve contra el mapa de piso de la sucursal y,
// además de guardarse en la orden, debe dejar la mesa OCCUPIED en la MISMA
// transacción: si no, el mapa del TPV la pinta libre y el mesero abre una
// segunda cuenta encima del pedido del comensal.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
    location: { findUnique: jest.fn(), findFirst: jest.fn() },
    restaurantConfig: { findUnique: jest.fn() },
    menuItem: { findFirst: jest.fn() },
    order: { count: jest.fn(), findMany: jest.fn() },
    table: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    cashShift: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../src/lib/order-number', () => ({ nextOrderNumber: jest.fn() }));
jest.mock('../src/services/loyalty.service', () => ({
  addLoyaltyPoints: jest.fn(), genLoyaltyQr: jest.fn(),
}));
jest.mock('../src/services/order-dictation.service', () => ({
  runOrderDictationSmart: jest.fn(),
}));
jest.mock('../src/lib/payment-providers', () => ({
  resolveProviderForRestaurant: jest.fn(),
  getProviderForRestaurant: jest.fn(),
  instantiateFromIntegration: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const { nextOrderNumber } = require('../src/lib/order-number');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/store', require('../src/routes/store.routes'));
  return app;
}

const MENU_ITEM = {
  id: 'm1', name: 'Burger', price: 70, isPromo: false, promoPrice: null,
  restaurantId: 'r1', isAvailable: true, availableOnline: true,
  variants: [], modifierGroups: [], complements: [],
};

const CONFIG = {
  restaurantId: 'r1', isOpen: true, scheduleEnabled: false,
  minOrderAmount: 0, estimatedDelivery: 30, maxOpenOrders: 0,
};

const QR_PAYLOAD = {
  orderType: 'DINE_IN',
  tableNumber: 3,
  customerName: 'Comensal',
  items: [{ menuItemId: 'm1', quantity: 2 }],
};

// tx espía: expone table.update para verificar que la mesa se ocupa dentro de
// la misma transacción que crea la orden.
function txMock(created) {
  const tableUpdate = jest.fn();
  const impl = async (fn) => fn({
    order: { create: jest.fn().mockResolvedValue(created) },
    table: { update: tableUpdate },
    coupon: { updateMany: jest.fn() },
    loyaltyAccount: { updateMany: jest.fn() },
    loyaltyTransaction: { create: jest.fn() },
  });
  return { impl, tableUpdate };
}

const CREATED = {
  id: 'o1', orderNumber: 2001, status: 'PENDING', orderType: 'DINE_IN',
  tableNumber: 3, tableId: 't3', total: 140, discount: 0, pointsUsed: 0,
  tip: 0, estimatedMinutes: 30, items: [],
};

describe('POST /api/store/orders — QR de mesa', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', isActive: true });
    prisma.restaurantConfig.findUnique.mockResolvedValue(CONFIG);
    prisma.location.findFirst.mockResolvedValue({ id: 'loc1' });
    prisma.menuItem.findFirst.mockResolvedValue(MENU_ITEM);
    prisma.order.findMany.mockResolvedValue([]);
    nextOrderNumber.mockResolvedValue(2001);
  });

  it('mesa del mapa → orden con tableId y mesa OCCUPIED en la misma tx', async () => {
    prisma.table.findMany.mockResolvedValue([
      { id: 't3', name: 'Mesa 3' },
      { id: 't4', name: 'Mesa 4' },
    ]);
    const { impl, tableUpdate } = txMock(CREATED);
    prisma.$transaction.mockImplementation(impl);

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(QR_PAYLOAD);

    expect(res.status).toBe(201);
    expect(tableUpdate).toHaveBeenCalledWith({
      where: { id: 't3' },
      data: { status: 'OCCUPIED' },
    });
  });

  it('mesa inexistente en la sucursal → 400 INVALID_TABLE sin crear nada', async () => {
    prisma.table.findMany.mockResolvedValue([{ id: 't9', name: 'Mesa 9' }]);

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(QR_PAYLOAD);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TABLE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sucursal sin mapa de mesas → no ocupa mesa y el pedido pasa igual', async () => {
    prisma.table.findMany.mockResolvedValue([]);
    const { impl, tableUpdate } = txMock({ ...CREATED, tableId: null });
    prisma.$transaction.mockImplementation(impl);

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(QR_PAYLOAD);

    expect(res.status).toBe(201);
    expect(tableUpdate).not.toHaveBeenCalled();
  });

  it('el pedido mínimo NO aplica en mesa', async () => {
    // Mínimo de $500 contra un pedido de $140: en domicilio se rechaza, en mesa
    // pasa — el mínimo es para pedidos que salen del local.
    prisma.restaurantConfig.findUnique.mockResolvedValue({ ...CONFIG, minOrderAmount: 500 });
    prisma.table.findMany.mockResolvedValue([{ id: 't3', name: 'Mesa 3' }]);
    const { impl } = txMock(CREATED);
    prisma.$transaction.mockImplementation(impl);

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(QR_PAYLOAD);

    expect(res.status).toBe(201);
  });

  it('el pedido mínimo sí aplica fuera de mesa', async () => {
    prisma.restaurantConfig.findUnique.mockResolvedValue({ ...CONFIG, minOrderAmount: 500 });

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send({ ...QR_PAYLOAD, orderType: 'TAKEOUT', tableNumber: undefined });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MIN_ORDER_NOT_MET');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('locationId del body que no es del restaurante → se ignora', async () => {
    // findFirst se usa dos veces: validar la sucursal del body (null = ajena) y
    // caer a la principal del restaurante.
    prisma.location.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'loc1' });
    prisma.table.findMany.mockResolvedValue([{ id: 't3', name: 'Mesa 3' }]);
    const { impl } = txMock(CREATED);
    prisma.$transaction.mockImplementation(impl);

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send({ ...QR_PAYLOAD, locationId: 'loc-de-otro-tenant' });

    expect(res.status).toBe(201);
    expect(prisma.table.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { locationId: 'loc1', isActive: true },
      }),
    );
  });
});
