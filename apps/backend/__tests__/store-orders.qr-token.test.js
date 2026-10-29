'use strict';

// Pedido desde el QR de mesa FIRMADO (`tableToken`).
//
// Lo que fija este archivo es la promesa del token: el pedido se ata al tableId
// que trae firmado — no al número, no al `?l=` de la URL — y un token que no
// cuadra se rechaza en vez de degradar al esquema viejo por número.
//
// Y la protección contra pedidos desde fuera del local: el QR es fijo y se
// puede fotografiar, así que sin turno de caja abierto no se aceptan pedidos de
// mesa, y a una mesa libre el pedido queda por confirmar (sin cocina ni mesa
// ocupada) hasta que la caja lo acepta.

process.env.TABLE_QR_SECRET = 'llave-de-pruebas-para-el-qr-de-mesa';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'jwt-de-pruebas-qr-token';

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
const jwt = require('jsonwebtoken');
const { prisma } = require('@mrtpvrest/database');
const { nextOrderNumber } = require('../src/lib/order-number');
const { signTableToken } = require('../src/lib/table-qr');

function buildApp(io) {
  const app = express();
  app.use(express.json());
  if (io) app.set('io', io);
  app.use('/api/store', require('../src/routes/store.routes'));
  return app;
}

// Socket.io falso: registra cada (sala, evento) emitido.
function fakeIo() {
  const emitted = [];
  return {
    emitted,
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  };
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
  const create = jest.fn().mockImplementation(async ({ data }) => ({
    id: 'o1', orderNumber: 3001, status: 'PENDING', orderType: 'DINE_IN',
    total: 140, discount: 0, pointsUsed: 0, tip: 0, estimatedMinutes: 30, items: [],
    tableNumber: data.tableNumber, awaitingTableConfirmation: data.awaitingTableConfirmation,
  }));
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

const post = (body, io) => request(buildApp(io))
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
  prisma.cashShift.findFirst.mockResolvedValue({ id: 'shift-1' });
  nextOrderNumber.mockResolvedValue(3001);
});

describe('POST /api/store/orders — QR de mesa firmado', () => {
  it('ata el pedido al tableId del token y, con la mesa abierta, entra directo', async () => {
    prisma.table.findFirst.mockResolvedValue({ id: 't-abc', name: 'Mesa 7', locationId: 'loc-terraza', status: 'OCCUPIED' });
    const { impl, create, tableUpdate } = txMock();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, tableToken: signTableToken({ tableId: 't-abc', number: 7 }) });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({
      tableId: 't-abc', tableNumber: 7, awaitingTableConfirmation: false,
    });
    expect(res.body.awaitingTableConfirmation).toBe(false);
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

  it('sin token sigue funcionando el QR viejo por número, pero por confirmar', async () => {
    // El número se adivina: aunque la mesa exista, el pedido espera a la caja.
    prisma.table.findMany.mockResolvedValue([{ id: 't-abc', name: 'Mesa 7' }]);
    const { impl, create, tableUpdate } = txMock();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, tableNumber: 7 });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({
      tableId: 't-abc', tableNumber: 7, awaitingTableConfirmation: true,
    });
    expect(tableUpdate).not.toHaveBeenCalled();
  });
});

describe('POST /api/store/orders — mesa por confirmar', () => {
  const tokenMesa7 = () => signTableToken({ tableId: 't-abc', number: 7 });

  it('sin turno de caja abierto → 409 NO_ACTIVE_SHIFT sin crear nada', async () => {
    prisma.table.findFirst.mockResolvedValue({ id: 't-abc', name: 'Mesa 7', locationId: 'loc-terraza', status: 'OCCUPIED' });
    prisma.cashShift.findFirst.mockResolvedValue(null);

    const res = await post({ ...BASE, tableToken: tokenMesa7() });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_ACTIVE_SHIFT');
    // El turno se busca en la sucursal de la mesa, no en la de la URL.
    expect(prisma.cashShift.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { locationId: 'loc-terraza', isOpen: true } }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('mesa libre → por confirmar: no ocupa la mesa, no va a cocina, avisa a la caja', async () => {
    prisma.table.findFirst.mockResolvedValue({ id: 't-abc', name: 'Mesa 7', locationId: 'loc-terraza', status: 'AVAILABLE' });
    const { impl, create, tableUpdate } = txMock();
    prisma.$transaction.mockImplementation(impl);
    const io = fakeIo();

    const res = await post({ ...BASE, tableToken: tokenMesa7() }, io);

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({ tableId: 't-abc', awaitingTableConfirmation: true });
    expect(res.body.awaitingTableConfirmation).toBe(true);
    expect(tableUpdate).not.toHaveBeenCalled();
    expect(io.emitted.filter((e) => e.event === 'order:new')).toEqual([]);
    expect(io.emitted).toEqual([
      {
        room: 'restaurant:r1:location:loc-terraza:admins',
        event: 'order:table-pending',
        payload: { id: 'o1', orderNumber: 3001, tableNumber: 7, total: 140 },
      },
    ]);
  });

  it('mesa sucia (DIRTY) también queda por confirmar', async () => {
    prisma.table.findFirst.mockResolvedValue({ id: 't-abc', name: 'Mesa 7', locationId: 'loc1', status: 'DIRTY' });
    const { impl, create } = txMock();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, tableToken: tokenMesa7() });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data.awaitingTableConfirmation).toBe(true);
  });

  it('mesa abierta → entra como siempre: order:new a cocina y sin aviso de confirmación', async () => {
    prisma.table.findFirst.mockResolvedValue({ id: 't-abc', name: 'Mesa 7', locationId: 'loc-terraza', status: 'OCCUPIED' });
    const { impl } = txMock();
    prisma.$transaction.mockImplementation(impl);
    const io = fakeIo();

    const res = await post({ ...BASE, tableToken: tokenMesa7() }, io);

    expect(res.status).toBe(201);
    expect(io.emitted.some((e) => e.event === 'order:table-pending')).toBe(false);
    expect(io.emitted).toContainEqual(expect.objectContaining({ room: 'restaurant:r1:kitchen', event: 'order:new' }));
  });

  it('personal autenticado → ni turno exigido ni confirmación', async () => {
    prisma.table.findFirst.mockResolvedValue({ id: 't-abc', name: 'Mesa 7', locationId: 'loc1', status: 'AVAILABLE' });
    const { impl, create, tableUpdate } = txMock();
    prisma.$transaction.mockImplementation(impl);
    const staffToken = jwt.sign({ restaurantId: 'r1', role: 'WAITER' }, process.env.JWT_SECRET);

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ ...BASE, tableToken: tokenMesa7() });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data.awaitingTableConfirmation).toBe(false);
    expect(tableUpdate).toHaveBeenCalledWith({ where: { id: 't-abc' }, data: { status: 'OCCUPIED' } });
    expect(prisma.cashShift.findFirst).not.toHaveBeenCalled();
  });

  it('para llevar → no se exige turno ni confirmación', async () => {
    const { impl, create } = txMock();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, orderType: 'TAKEOUT' });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data.awaitingTableConfirmation).toBe(false);
    expect(prisma.cashShift.findFirst).not.toHaveBeenCalled();
  });
});
