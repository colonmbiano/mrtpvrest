'use strict';

// Freno de saturación de POST /api/store/orders.
//
// Con la cocina al tope (pedidos abiertos de las últimas 2h >= maxOpenOrders),
// los canales remotos (tienda online / bot de WhatsApp) deben recibir 429
// STORE_SATURATED con el mensaje configurable, SIN crear la orden. Con el
// freno apagado (maxOpenOrders null/0) no se consulta el conteo y el flujo
// queda intacto.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
    location: { findUnique: jest.fn(), findFirst: jest.fn() },
    restaurantConfig: { findUnique: jest.fn() },
    menuItem: { findFirst: jest.fn() },
    order: { count: jest.fn(), findMany: jest.fn() },
    user: { findUnique: jest.fn() },
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

const BASE_PAYLOAD = {
  source: 'WHATSAPP',
  orderType: 'TAKEOUT',
  customerName: 'Cliente WhatsApp',
  customerPhone: '5215551234567',
  items: [{ menuItemId: 'm1', quantity: 2 }],
};

const MENU_ITEM = {
  id: 'm1', name: 'Burger', price: 70, isPromo: false, promoPrice: null,
  restaurantId: 'r1', isAvailable: true, availableOnline: true,
  variants: [], modifierGroups: [], complements: [],
};

// Config con el freno en 25 pedidos abiertos. Tienda abierta y sin mínimo para
// no activar los otros bloqueos del endpoint.
const CONFIG_WITH_BRAKE = {
  restaurantId: 'r1', isOpen: true, scheduleEnabled: false,
  minOrderAmount: 0, estimatedDelivery: 30,
  maxOpenOrders: 25, saturatedMessage: null,
};

function txMock(created) {
  return async (fn) => fn({
    order: { create: jest.fn().mockResolvedValue(created) },
    coupon: { updateMany: jest.fn() },
    loyaltyAccount: { updateMany: jest.fn() },
    loyaltyTransaction: { create: jest.fn() },
  });
}

describe('POST /api/store/orders — freno de saturación', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', isActive: true });
    prisma.restaurantConfig.findUnique.mockResolvedValue(CONFIG_WITH_BRAKE);
    prisma.location.findFirst.mockResolvedValue({ id: 'loc1' });
    prisma.menuItem.findFirst.mockResolvedValue(MENU_ITEM);
    prisma.order.findMany.mockResolvedValue([]); // sin candidatos de dedupe
  });

  it('cocina al tope → 429 STORE_SATURATED sin crear la orden', async () => {
    prisma.order.count.mockResolvedValue(25); // == maxOpenOrders

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('STORE_SATURATED');
    expect(res.body.openOrders).toBe(25);
    expect(res.body.limit).toBe(25);
    expect(typeof res.body.error).toBe('string');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('mensaje personalizado del restaurante → se relaya tal cual', async () => {
    prisma.restaurantConfig.findUnique.mockResolvedValue({
      ...CONFIG_WITH_BRAKE, saturatedMessage: 'Cocina al tope, vuelve en 30 min',
    });
    prisma.order.count.mockResolvedValue(30);

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Cocina al tope, vuelve en 30 min');
  });

  it('bajo el tope → crea la orden normalmente', async () => {
    prisma.order.count.mockResolvedValue(10);
    nextOrderNumber.mockResolvedValue(1042);
    prisma.$transaction.mockImplementation(txMock({
      id: 'new1', orderNumber: 1042, status: 'PENDING',
      total: 140, discount: 0, pointsUsed: 0, tip: 0, estimatedMinutes: 30, items: [],
    }));

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.orderNumber).toBe(1042);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('freno apagado (maxOpenOrders null) → ni siquiera consulta el conteo', async () => {
    prisma.restaurantConfig.findUnique.mockResolvedValue({
      ...CONFIG_WITH_BRAKE, maxOpenOrders: null,
    });
    nextOrderNumber.mockResolvedValue(1043);
    prisma.$transaction.mockImplementation(txMock({
      id: 'new2', orderNumber: 1043, status: 'PENDING',
      total: 140, discount: 0, pointsUsed: 0, tip: 0, estimatedMinutes: 30, items: [],
    }));

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(201);
    expect(prisma.order.count).not.toHaveBeenCalled();
  });
});
