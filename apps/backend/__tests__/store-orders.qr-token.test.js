'use strict';

// Pedido desde el QR de mesa FIRMADO (`tableToken`).
//
// Lo que fija este archivo es la promesa del token: el pedido se ata al tableId
// que trae firmado — no al número, no al `?l=` de la URL — y un token que no
// cuadra se rechaza en vez de degradar al esquema viejo por número.

process.env.TABLE_QR_SECRET = 'llave-de-pruebas-para-el-qr-de-mesa';

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
    location: { findUnique: jest.fn(), findFirst: jest.fn() },
    restaurantConfig: { findUnique: jest.fn() },
    menuItem: { findFirst: jest.fn() },
    order: { count: jest.fn(), findMany: jest.fn() },
    table: { findMany: jest.fn(), findFirst: jest.fn() },
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
const { signTableToken } = require('../src/lib/table-qr');

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

const BASE = {
  orderType: 'DINE_IN',
  customerName: 'Comensal',
  items: [{ menuItemId: 'm1', quantity: 2 }],
};

// Captura lo que se le pasa a order.create para inspeccionar tableId/número.
function txMock() {
  const create = jest.fn().mockResolvedValue({
    id: 'o1', orderNumber: 3001, status: 'PENDING', orderType: 'DINE_IN',
    total: 140, discount: 0, pointsUsed: 0, tip: 0, estimatedMinutes: 30, items: [],
  });
  const tableUpdate = jest.fn();
  const impl = async (fn) => fn({
    order: { create },
    table: { update: tableUpdate },
    coupon: { updateMany: jest.fn() },
    loyaltyAccount: { updateMany: jest.fn() },
    loyaltyTransaction: { create: jest.fn() },
  });
  return { impl, create, tableUpdate };
}

const post = (body) => request(buildApp())
  .post('/api/store/orders')
  .set('x-restaurant-id', 'r1')
  .send(body);

beforeEach(() => {
  jest.clearAllMocks();
  prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', isActive: true });
  prisma.restaurantConfig.findUnique.mockResolvedValue(CONFIG);
  prisma.location.findFirst.mockResolvedValue({ id: 'loc-principal' });
  prisma.menuItem.findFirst.mockResolvedValue(MENU_ITEM);
  prisma.order.findMany.mockResolvedValue([]);
  nextOrderNumber.mockResolvedValue(3001);
});

describe('POST /api/store/orders — QR de mesa firmado', () => {
  it('ata el pedido al tableId del token y ocupa esa mesa', async () => {
    prisma.table.findFirst.mockResolvedValue({ id: 't-abc', name: 'Mesa 7', locationId: 'loc-terraza' });
    const { impl, create, tableUpdate } = txMock();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, tableToken: signTableToken({ tableId: 't-abc', number: 7 }) });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({ tableId: 't-abc', tableNumber: 7 });
    expect(tableUpdate).toHaveBeenCalledWith({ where: { id: 't-abc' }, data: { status: 'OCCUPIED' } });
    // Nunca se cae al matcheo por nombre del esquema viejo.
    expect(prisma.table.findMany).not.toHaveBeenCalled();
  });

  it('la mesa manda sobre la sucursal: el pedido cae en la del tableId', async () => {
    // El QR trae `?l=loc-principal` pero la mesa vive en la terraza: gana la BD,
    // o el pedido aterrizaría en la caja equivocada.
    prisma.table.findFirst.mockResolvedValue({ id: 't-abc', name: 'Mesa 7', locationId: 'loc-terraza' });
    const { impl, create } = txMock();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({
      ...BASE,
      locationId: 'loc-principal',
      tableToken: signTableToken({ tableId: 't-abc', number: 7 }),
    });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({ locationId: 'loc-terraza' });
  });

  it('sobrevive al renombrado: el ticket usa el número ACTUAL de la mesa', async () => {
    // QR impreso cuando era "Mesa 4"; hoy la mesa se llama "Mesa 12".
    prisma.table.findFirst.mockResolvedValue({ id: 't-abc', name: 'Mesa 12', locationId: 'loc1' });
    const { impl, create } = txMock();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, tableToken: signTableToken({ tableId: 't-abc', number: 4 }) });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({ tableId: 't-abc', tableNumber: 12 });
  });

  it('token manipulado → 400 y NO degrada al esquema por número', async () => {
    const good = signTableToken({ tableId: 't-abc', number: 7 });
    const forged = `${Buffer.from('t-otra.9').toString('base64url')}.${good.split('.')[1]}`;

    const res = await post({ ...BASE, tableNumber: 9, tableToken: forged });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TABLE_TOKEN');
    expect(prisma.table.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('token válido de una mesa borrada o de otro restaurante → 400', async () => {
    prisma.table.findFirst.mockResolvedValue(null); // el WHERE filtra por restaurante

    const res = await post({ ...BASE, tableToken: signTableToken({ tableId: 't-ajena', number: 3 }) });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TABLE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('la mesa se busca acotada al restaurante y activa', async () => {
    prisma.table.findFirst.mockResolvedValue({ id: 't-abc', name: 'Mesa 7', locationId: 'loc1' });
    const { impl } = txMock();
    prisma.$transaction.mockImplementation(impl);

    await post({ ...BASE, tableToken: signTableToken({ tableId: 't-abc', number: 7 }) });

    expect(prisma.table.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't-abc', isActive: true, location: { restaurantId: 'r1' } },
      }),
    );
  });

  it('mesa sin número en el nombre ("Barra") → se atiende igual, sin tableNumber', async () => {
    prisma.table.findFirst.mockResolvedValue({ id: 't-barra', name: 'Barra', locationId: 'loc1' });
    const { impl, create } = txMock();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, tableToken: signTableToken({ tableId: 't-barra', number: null }) });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({ tableId: 't-barra', tableNumber: null });
  });

  it('sin token sigue funcionando el QR viejo por número', async () => {
    prisma.table.findMany.mockResolvedValue([{ id: 't-abc', name: 'Mesa 7' }]);
    const { impl, create } = txMock();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, tableNumber: 7 });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({ tableId: 't-abc', tableNumber: 7 });
  });
});
