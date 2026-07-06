'use strict';

// Detección de "pedido corregido" en POST /api/store/orders (solo WHATSAPP).
//
// Vector real (Master Burguer's, 2026-07-05): el cliente pidió a las 18:27
// (orden #1230, $800) y una hora después mandó el pedido corregido con OTROS
// platillos (#1244, $926.30). Como el carrito es distinto, el dedupe por firma
// no aplica y el bot creó una segunda orden; ambas se entregaron/cobraron y la
// caja del repartidor quedó $800 arriba. El endpoint NO debe bloquear ni
// cancelar nada (eso lo decide el cajero): debe crear la orden nueva CON una
// nota visible "POSIBLE CORRECCIÓN del pedido #X" y avisar a la caja por
// socket (order:possible-correction al room de admins de la sucursal).

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

// io mockeado: to() siempre devuelve el mismo emit para poder inspeccionar
// TODO lo emitido (order:new + order:possible-correction) por room.
function buildApp(io) {
  const app = express();
  app.use(express.json());
  if (io) app.set('io', io);
  app.use('/api/store', require('../src/routes/store.routes'));
  return app;
}

function makeIo() {
  const emit = jest.fn();
  const io = { to: jest.fn(() => ({ emit })) };
  return { io, emit };
}

// El pedido "corregido": carrito distinto al anterior (el dedupe por firma NO
// aplica — eso ya lo cubre store-orders.dedup.test.js).
const BASE_PAYLOAD = {
  source: 'WHATSAPP',
  orderType: 'TAKEOUT',
  customerName: 'antonio  MONTES', // casing/espacios distintos a la orden previa
  items: [{ menuItemId: 'm1', quantity: 3 }],
};

const MENU_ITEM = {
  id: 'm1', name: 'Burger', price: 70, isPromo: false, promoPrice: null,
  restaurantId: 'r1', isAvailable: true, availableOnline: true,
  variants: [], modifierGroups: [], complements: [],
};

// Orden previa del mismo cliente, AÚN abierta y sin pagar (el caso #1230).
// customerPhone null: el bot no siempre lo setea → el match cae al nombre.
const PREV_OPEN = {
  id: 'prev1', orderNumber: 1230, status: 'PENDING', total: 800,
  customerName: 'Antonio Montés', customerPhone: null,
  createdAt: new Date(Date.now() - 60 * 60 * 1000), // hace 1h, dentro de ~2h
};

// Transacción con order.create capturable para asertar la nota persistida.
function makeTx(created) {
  const orderCreate = jest.fn().mockResolvedValue(created);
  const impl = async (fn) => fn({
    order: { create: orderCreate },
    coupon: { updateMany: jest.fn() },
    loyaltyAccount: { updateMany: jest.fn() },
    loyaltyTransaction: { create: jest.fn() },
  });
  return { impl, orderCreate };
}

const CREATED = {
  id: 'new1', orderNumber: 1244, status: 'PENDING',
  subtotal: 210, total: 210, discount: 0, pointsUsed: 0, tip: 0,
  estimatedMinutes: 30, items: [],
  customerName: 'antonio MONTES', customerPhone: null,
};

// El findMany de Order se llama DOS veces: 1) candidatos del dedupe (ventana
// 30s, firma exacta), 2) candidatos de corrección (ventana ~2h, abiertos).
function primeFindMany({ dedupe = [], correction = [] } = {}) {
  prisma.order.findMany
    .mockResolvedValueOnce(dedupe)
    .mockResolvedValueOnce(correction);
}

describe('POST /api/store/orders — detección de pedido corregido (WHATSAPP)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', isActive: true });
    prisma.restaurantConfig.findUnique.mockResolvedValue(null); // salta cerrado/mínimo
    prisma.location.findFirst.mockResolvedValue({ id: 'loc1' }); // sucursal principal
    prisma.menuItem.findFirst.mockResolvedValue(MENU_ITEM);
    // Turno de caja abierto: el payload es WHATSAPP y sin esto el gate de
    // turno (409 NO_ACTIVE_SHIFT) responde antes de llegar a la detección.
    prisma.cashShift.findFirst.mockResolvedValue({ id: 'shift1' });
    nextOrderNumber.mockResolvedValue(1244);
  });

  it('orden previa abierta del mismo cliente (nombre normalizado, sin teléfono) → crea la orden CON nota y avisa a la caja', async () => {
    primeFindMany({ correction: [PREV_OPEN] });
    const { impl, orderCreate } = makeTx(CREATED);
    prisma.$transaction.mockImplementation(impl);
    const { io, emit } = makeIo();

    const res = await request(buildApp(io))
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    // NO se bloquea: la orden nueva se crea normal (cancelar la anterior es
    // decisión del cajero, nunca automática).
    expect(res.status).toBe(201);
    expect(res.body.orderNumber).toBe(1244);
    expect(res.body.possibleCorrectionOf).toBe(1230);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Nota visible en la orden nueva (ticket + panel del TPV).
    const createdData = orderCreate.mock.calls[0][0].data;
    expect(createdData.notes).toContain('POSIBLE CORRECCIÓN del pedido #1230');

    // Aviso a la caja: evento dedicado al room de admins de la sucursal.
    expect(io.to).toHaveBeenCalledWith('restaurant:r1:location:loc1:admins');
    const correctionEmits = emit.mock.calls.filter(([ev]) => ev === 'order:possible-correction');
    expect(correctionEmits).toHaveLength(1);
    expect(correctionEmits[0][1]).toMatchObject({
      newOrderNumber: 1244,
      previousOrderId: 'prev1',
      previousOrderNumber: 1230,
      previousTotal: 800,
    });
  });

  it('con teléfono en ambas órdenes, manda el teléfono: mismo número → marca aunque el nombre difiera', async () => {
    primeFindMany({
      correction: [{ ...PREV_OPEN, customerName: 'Toño', customerPhone: '5215551234567' }],
    });
    const { impl, orderCreate } = makeTx({ ...CREATED, customerPhone: '5215551234567' });
    prisma.$transaction.mockImplementation(impl);
    const { io } = makeIo();

    const res = await request(buildApp(io))
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send({ ...BASE_PAYLOAD, customerPhone: '5215551234567' });

    expect(res.status).toBe(201);
    expect(res.body.possibleCorrectionOf).toBe(1230);
    expect(orderCreate.mock.calls[0][0].data.notes).toContain('POSIBLE CORRECCIÓN del pedido #1230');
  });

  it('teléfonos DISTINTOS en ambas órdenes → NO marca aunque el nombre coincida (dos clientes homónimos)', async () => {
    primeFindMany({
      correction: [{ ...PREV_OPEN, customerName: 'Antonio Montes', customerPhone: '5215559999999' }],
    });
    const { impl, orderCreate } = makeTx(CREATED);
    prisma.$transaction.mockImplementation(impl);
    const { io, emit } = makeIo();

    const res = await request(buildApp(io))
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send({ ...BASE_PAYLOAD, customerName: 'Antonio Montes', customerPhone: '5215551234567' });

    expect(res.status).toBe(201);
    expect(res.body.possibleCorrectionOf).toBeUndefined();
    expect(orderCreate.mock.calls[0][0].data.notes).toBeNull();
    expect(emit.mock.calls.filter(([ev]) => ev === 'order:possible-correction')).toHaveLength(0);
  });

  it('sin órdenes previas abiertas → crea la orden limpia, sin nota ni evento', async () => {
    primeFindMany({ correction: [] });
    const { impl, orderCreate } = makeTx(CREATED);
    prisma.$transaction.mockImplementation(impl);
    const { io, emit } = makeIo();

    const res = await request(buildApp(io))
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.possibleCorrectionOf).toBeUndefined();
    expect(orderCreate.mock.calls[0][0].data.notes).toBeNull();
    expect(emit.mock.calls.filter(([ev]) => ev === 'order:possible-correction')).toHaveLength(0);
  });

  it('multi-tenancy y alcance: el query de candidatos filtra por restaurante, sucursal, estados abiertos, no-pagado y ventana ~2h', async () => {
    primeFindMany({ correction: [] });
    const { impl } = makeTx(CREATED);
    prisma.$transaction.mockImplementation(impl);

    await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send(BASE_PAYLOAD);

    // 2a llamada = candidatos de corrección (la 1a es el dedupe).
    expect(prisma.order.findMany).toHaveBeenCalledTimes(2);
    const where = prisma.order.findMany.mock.calls[1][0].where;
    expect(where.restaurantId).toBe('r1');
    expect(where.locationId).toBe('loc1');
    expect(where.source).toBe('WHATSAPP');
    expect(where.status.in).toEqual(
      expect.arrayContaining(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ON_THE_WAY']),
    );
    expect(where.status.in).not.toContain('DELIVERED');
    expect(where.status.in).not.toContain('CANCELLED');
    expect(where.paymentStatus).toEqual({ not: 'PAID' });
    // Ventana de ~2h hacia atrás (con tolerancia por el reloj del test).
    const gte = where.createdAt.gte.getTime();
    expect(Date.now() - gte).toBeGreaterThan(2 * 60 * 60 * 1000 - 60 * 1000);
    expect(Date.now() - gte).toBeLessThan(2 * 60 * 60 * 1000 + 60 * 1000);
  });

  it('pedidos NO-WHATSAPP (tienda online) no corren la detección', async () => {
    prisma.order.findMany.mockResolvedValue([]); // solo el dedupe la usará
    const { impl, orderCreate } = makeTx(CREATED);
    prisma.$transaction.mockImplementation(impl);

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .send({ ...BASE_PAYLOAD, source: 'ONLINE' });

    expect(res.status).toBe(201);
    // Una sola consulta de órdenes: el dedupe. Nada de corrección.
    expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
    expect(orderCreate.mock.calls[0][0].data.notes).toBeNull();
  });
});
