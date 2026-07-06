'use strict';

// Gate de turno de caja de POST /api/store/orders (commit "no aceptar pedidos
// de WhatsApp sin turno de caja abierto").
//
// El bot de WhatsApp NO debe tomar pedidos si la sucursal no tiene un turno de
// caja abierto: en el hueco entre "abre el negocio" (horario) y "el cajero abre
// turno" se creaban pedidos huérfanos que ninguna caja cobra ni cierra. El gate
// responde 409 NO_ACTIVE_SHIFT solo para source=WHATSAPP de clientes; la tienda
// online (STORE) no se toca.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
    location: { findUnique: jest.fn(), findFirst: jest.fn() },
    restaurantConfig: { findUnique: jest.fn() },
    menuItem: { findFirst: jest.fn() },
    order: { count: jest.fn(), findMany: jest.fn() },
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

function txMock(created) {
  return async (fn) => fn({
    order: { create: jest.fn().mockResolvedValue(created) },
    coupon: { updateMany: jest.fn() },
    loyaltyAccount: { updateMany: jest.fn() },
    loyaltyTransaction: { create: jest.fn() },
  });
}

describe('POST /api/store/orders — gate de turno de caja (WhatsApp)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', isActive: true });
    prisma.restaurantConfig.findUnique.mockResolvedValue(null); // salta cerrado/mínimo
    prisma.location.findFirst.mockResolvedValue({ id: 'loc1' }); // sucursal principal
    prisma.menuItem.findFirst.mockResolvedValue(MENU_ITEM);
    prisma.order.findMany.mockResolvedValue([]); // sin candidatos de dedupe
  });

  it('WhatsApp sin turno abierto → 409 NO_ACTIVE_SHIFT sin crear la orden', async () => {
    prisma.cashShift.findFirst.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_ACTIVE_SHIFT');
    expect(typeof res.body.error).toBe('string');
    // El gate consulta el turno de LA sucursal resuelta, y no abre transacción.
    expect(prisma.cashShift.findFirst).toHaveBeenCalledWith({
      where: { locationId: 'loc1', isOpen: true },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('WhatsApp con turno abierto → crea la orden normalmente', async () => {
    prisma.cashShift.findFirst.mockResolvedValue({ id: 'shift1' });
    nextOrderNumber.mockResolvedValue(1050);
    prisma.$transaction.mockImplementation(txMock({
      id: 'new1', orderNumber: 1050, status: 'PENDING',
      total: 140, discount: 0, pointsUsed: 0, tip: 0, estimatedMinutes: 30, items: [],
    }));

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.orderNumber).toBe(1050);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('tienda online (STORE) sin turno → NO se gatea, crea la orden', async () => {
    prisma.cashShift.findFirst.mockResolvedValue(null);
    nextOrderNumber.mockResolvedValue(1051);
    prisma.$transaction.mockImplementation(txMock({
      id: 'new2', orderNumber: 1051, status: 'PENDING',
      total: 140, discount: 0, pointsUsed: 0, tip: 0, estimatedMinutes: 30, items: [],
    }));

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send({ ...BASE_PAYLOAD, source: 'STORE' });

    expect(res.status).toBe(201);
    expect(res.body.orderNumber).toBe(1051);
    // El gate es exclusivo del canal WhatsApp: ni siquiera consulta turnos.
    expect(prisma.cashShift.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
