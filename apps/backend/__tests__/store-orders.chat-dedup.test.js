'use strict';

// Dedupe PERSISTENTE por chat de WhatsApp en POST /api/store/orders.
//
// Vector real (#1230/#1244, 2026-07-05): el cliente manda algo tardío (p.ej. su
// comprobante) y Gemini RE-EMITE CONFIRMED con casi el mismo carrito. La guarda
// en memoria del bot solo cubre 45 min y muere al reiniciar; el backend debe
// detectar el pedido reciente DEL MISMO CHAT (prefijo de clientOrderId
// `wa:<hash>:`) con carrito similar y devolverlo en vez de crear otro.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
    location: { findUnique: jest.fn(), findFirst: jest.fn() },
    restaurantConfig: { findUnique: jest.fn() },
    menuItem: { findFirst: jest.fn(), findMany: jest.fn() },
    order: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
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

const CHAT_HASH = 'ab12cd34ef56ab78';
const CLIENT_ORDER_ID = `wa:${CHAT_HASH}:11112222-3333-4444-5555-666677778888`;

// Carrito nuevo: 2 burgers + 1 alitas (3 unidades).
const BASE_PAYLOAD = {
  source: 'WHATSAPP',
  orderType: 'TAKEOUT',
  customerName: 'Cliente WhatsApp',
  customerPhone: '5215551234567',
  clientOrderId: CLIENT_ORDER_ID,
  items: [
    { menuItemId: 'm1', quantity: 2 },
    { menuItemId: 'm2', quantity: 1 },
  ],
};

const MENU_ITEM = {
  id: 'm1', name: 'Burger', price: 70, isPromo: false, promoPrice: null,
  restaurantId: 'r1', isAvailable: true, availableOnline: true,
  variants: [], modifierGroups: [], complements: [],
};

// Pedido previo del MISMO chat (otro uuid): comparte 2 de 3 unidades → 0.67.
const CHAT_SIBLING = {
  id: 'prev1', orderNumber: 1230, status: 'PENDING',
  clientOrderId: `wa:${CHAT_HASH}:99990000-aaaa-bbbb-cccc-ddddeeeeffff`,
  subtotal: 250, total: 250, discount: 0, pointsUsed: 0, tip: 0,
  estimatedMinutes: 30,
  items: [{ menuItemId: 'm1', quantity: 2 }, { menuItemId: 'm3', quantity: 1 }],
};

function mockTxWithCreateSpy(created) {
  const createSpy = jest.fn().mockResolvedValue(created);
  prisma.$transaction.mockImplementation(async (fn) => fn({
    order: { create: createSpy },
    coupon: { updateMany: jest.fn() },
    loyaltyAccount: { updateMany: jest.fn() },
    loyaltyTransaction: { create: jest.fn() },
  }));
  return createSpy;
}

describe('POST /api/store/orders — dedupe por chat de WhatsApp (clientOrderId wa:)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', isActive: true });
    prisma.restaurantConfig.findUnique.mockResolvedValue(null);
    prisma.location.findFirst.mockResolvedValue({ id: 'loc1' });
    prisma.menuItem.findFirst.mockResolvedValue(MENU_ITEM);
    prisma.cashShift.findFirst.mockResolvedValue({ id: 'shift1' });
  });

  it('carrito IDÉNTICO re-emitido (eco/comprobante) → devuelve el existente en silencio', async () => {
    // 1ª findMany = candidatos por chat. No debe llegar al dedupe por firma.
    prisma.order.findMany.mockResolvedValueOnce([{
      ...CHAT_SIBLING,
      items: [{ menuItemId: 'm1', quantity: 2 }, { menuItemId: 'm2', quantity: 1 }],
    }]);

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'prev1', orderNumber: 1230, deduped: true, dedupReason: 'CHAT_WINDOW',
      correctionFlagged: false,
    });
    expect(res.headers['x-dedup-replay']).toBe('true');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // Idéntico = eco, NO corrección: el ticket original no se toca.
    expect(prisma.order.update).not.toHaveBeenCalled();
    // Responde en el gate por chat: ni siquiera corre el dedupe por firma.
    expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
    const where = prisma.order.findMany.mock.calls[0][0].where;
    expect(where.clientOrderId).toEqual({ startsWith: `wa:${CHAT_HASH}:` });
    expect(where.status).toEqual({ not: 'CANCELLED' });
  });

  it('carrito PARECIDO pero cambiado → dedupea Y marca el ticket original como posible corrección', async () => {
    // CHAT_SIBLING comparte 2 de 3 unidades con el payload (0.67 ≥ 0.6) pero
    // difiere (m3 → m2): el caso Antonio Montes #1230/#1244.
    prisma.order.findMany.mockResolvedValueOnce([CHAT_SIBLING]);
    prisma.menuItem.findMany.mockResolvedValue([
      { id: 'm1', name: 'Burger' }, { id: 'm2', name: 'Alitas' },
    ]);
    prisma.order.update.mockResolvedValue({ ...CHAT_SIBLING, locationId: 'loc1' });

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'prev1', orderNumber: 1230, deduped: true, dedupReason: 'CHAT_WINDOW',
      correctionFlagged: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // El ticket original queda marcado con la nota y el carrito reenviado legible.
    expect(prisma.order.update).toHaveBeenCalledTimes(1);
    const upd = prisma.order.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'prev1' });
    expect(upd.data.notes).toContain('POSIBLE CORRECCIÓN');
    expect(upd.data.notes).toContain('2x Burger, 1x Alitas');
  });

  it('mismo chat pero carrito claramente distinto → NO dedupea y persiste clientOrderId', async () => {
    // Chat: candidato sin items en común (similitud 0). Firma: sin candidatos.
    prisma.order.findMany
      .mockResolvedValueOnce([{ ...CHAT_SIBLING, items: [{ menuItemId: 'm9', quantity: 3 }] }])
      .mockResolvedValueOnce([]);
    nextOrderNumber.mockResolvedValue(1245);
    const createSpy = mockTxWithCreateSpy({
      id: 'new1', orderNumber: 1245, status: 'PENDING',
      total: 210, discount: 0, pointsUsed: 0, tip: 0, estimatedMinutes: 30, items: [],
    });

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.orderNumber).toBe(1245);
    expect(res.body.deduped).toBeUndefined();
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clientOrderId: CLIENT_ORDER_ID }),
    }));
  });

  it('sin clientOrderId (storefront) o con formato ajeno → el gate por chat no corre', async () => {
    prisma.order.findMany.mockResolvedValue([]); // solo el dedupe por firma
    nextOrderNumber.mockResolvedValue(1246);
    const createSpy = mockTxWithCreateSpy({
      id: 'new2', orderNumber: 1246, status: 'PENDING',
      total: 210, discount: 0, pointsUsed: 0, tip: 0, estimatedMinutes: 30, items: [],
    });

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send({ ...BASE_PAYLOAD, clientOrderId: 'uuid-generico-del-tpv' });

    expect(res.status).toBe(201);
    expect(res.body.orderNumber).toBe(1246);
    // Solo UNA findMany (la del dedupe por firma) y el id ajeno NO se persiste.
    expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clientOrderId: undefined }),
    }));
  });

  it('carrera de reintentos: P2002 en clientOrderId → responde la orden ya creada', async () => {
    prisma.order.findMany.mockResolvedValue([]); // ambos dedupes sin candidatos
    nextOrderNumber.mockResolvedValue(1247);
    const p2002 = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002', meta: { target: ['clientOrderId'] },
    });
    prisma.$transaction.mockRejectedValue(p2002);
    prisma.order.findFirst.mockResolvedValue({
      id: 'winner1', orderNumber: 1247, status: 'PENDING',
      total: 210, discount: 0, pointsUsed: 0, tip: 0, estimatedMinutes: 30,
    });

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'winner1', orderNumber: 1247, deduped: true });
    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { restaurantId: 'r1', clientOrderId: CLIENT_ORDER_ID },
    });
  });
});
