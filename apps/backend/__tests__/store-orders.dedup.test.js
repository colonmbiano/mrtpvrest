'use strict';

// Dedupe anti doble-submit de POST /api/store/orders.
//
// Vector real: el bot de WhatsApp ("Cajero Estrella") crea la orden cuando
// Gemini responde status=CONFIRMED; si el modelo REEMITE CONFIRMED en dos
// mensajes seguidos, se dispararía POST /orders dos veces con el MISMO carrito.
// El storefront tiene el mismo riesgo por doble-tap en "Confirmar pedido".
// El endpoint debe devolver la orden existente (sin crear otra ni re-consumir
// cupón/puntos) cuando dentro de la ventana llega una firma idéntica.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
    location: { findUnique: jest.fn(), findFirst: jest.fn() },
    restaurantConfig: { findUnique: jest.fn() },
    menuItem: { findFirst: jest.fn() },
    order: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    cashShift: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

// Servicios/deps pesadas fuera del camino que probamos.
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

// Producto: hamburguesa a $70, sin variantes ni modificadores.
const MENU_ITEM = {
  id: 'm1', name: 'Burger', price: 70, isPromo: false, promoPrice: null,
  restaurantId: 'r1', isAvailable: true, availableOnline: true,
  variants: [], modifierGroups: [], complements: [],
};

// Orden ya existente idéntica (2 × $70 = $140).
const EXISTING = {
  id: 'existing1', orderNumber: 1041, status: 'PENDING',
  subtotal: 140, total: 140, discount: 0, pointsUsed: 0, tip: 0,
  estimatedMinutes: 30,
  items: [{ menuItemId: 'm1', quantity: 2, price: 70, modifiers: [] }],
};

function txMock(created) {
  return async (fn) => fn({
    order: { create: jest.fn().mockResolvedValue(created) },
    coupon: { updateMany: jest.fn() },
    loyaltyAccount: { updateMany: jest.fn() },
    loyaltyTransaction: { create: jest.fn() },
  });
}

describe('POST /api/store/orders — dedupe anti doble-submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', isActive: true });
    prisma.restaurantConfig.findUnique.mockResolvedValue(null); // salta cerrado/mínimo
    prisma.location.findFirst.mockResolvedValue({ id: 'loc1' }); // sucursal principal
    prisma.menuItem.findFirst.mockResolvedValue(MENU_ITEM);
    // Turno de caja abierto: el payload es WHATSAPP y sin esto el gate de
    // turno (409 NO_ACTIVE_SHIFT) responde antes de llegar al dedupe.
    prisma.cashShift.findFirst.mockResolvedValue({ id: 'shift1' });
  });

  it('firma idéntica dentro de la ventana → devuelve la orden existente sin crear otra', async () => {
    prisma.order.findMany.mockResolvedValue([EXISTING]);

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'existing1', orderNumber: 1041, deduped: true });
    expect(res.headers['x-dedup-replay']).toBe('true');
    // Lo esencial: NO se abrió transacción → ni orden nueva ni consumo de cupón/puntos.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sin candidatos recientes → crea la orden normalmente (una sola vez)', async () => {
    prisma.order.findMany.mockResolvedValue([]);
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
    expect(res.body.deduped).toBeUndefined();
    expect(res.headers['x-dedup-replay']).toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('mismo cliente pero items distintos → NO dedupea, crea orden nueva', async () => {
    // Candidato reciente con OTRO subtotal/cantidad: la firma no casa.
    prisma.order.findMany.mockResolvedValue([{
      ...EXISTING, subtotal: 90,
      items: [{ menuItemId: 'm1', quantity: 1, price: 90, modifiers: [] }],
    }]);
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
    expect(res.body.orderNumber).toBe(1043);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});


describe('Master Burguer\'s boneless por peso', () => {
  const id = 'cmpp2pipe00c81qpl3me2i2v2';
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', isActive: true });
    prisma.restaurantConfig.findUnique.mockResolvedValue(null);
    prisma.location.findFirst.mockResolvedValue({ id: 'loc1' });
    prisma.cashShift.findFirst.mockResolvedValue({ id: 'shift1' });
    prisma.menuItem.findFirst.mockResolvedValue({ ...MENU_ITEM, id, name: '1 KG de Boneless', price: 320, saleUnit: 'WEIGHT', minWeightKg: 1 });
    prisma.order.findMany.mockResolvedValue([]);
    nextOrderNumber.mockResolvedValue(1042);
  });
  test.each([[1, 1, 320], [1.5, 1, 480], [2, 1, 640], [1.5, 2, 960], [1.563, 1, 500.16]])(
    '%s kg, %s porciones persiste el peso y cobra $%s desde catálogo', async (weightKg, quantity, total) => {
      const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...data, id: 'new', items: [] }));
      prisma.$transaction.mockImplementation(fn => fn({ order: { create } }));
      const res = await request(buildApp()).post('/api/store/orders').set('x-restaurant-id', 'r1')
        .send({ ...BASE_PAYLOAD, items: [{ menuItemId: id, weightKg, quantity, price: 1, subtotal: 1 }] });
      expect(res.status).toBe(201);
      expect(create.mock.calls[0][0].data.items.create[0]).toMatchObject({ price: 320, quantity: 1, weightKg: weightKg * quantity, subtotal: total });
    });
  test.each([0, -1, 0.999, 0.9999, 'no', 10000000])('rechaza peso inválido %s antes de escribir', async weightKg => {
    const res = await request(buildApp()).post('/api/store/orders').set('x-restaurant-id', 'r1')
      .send({ ...BASE_PAYLOAD, items: [{ menuItemId: id, weightKg, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('mínimo');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
