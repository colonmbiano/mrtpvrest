'use strict';

// Pedido desde el QR firmado de una mesa que YA tiene cuenta abierta en el TPV.
//
// Antes cada pedido del QR abría una orden aparte aunque la mesa tuviera su
// cuenta: dos cuentas en la misma mesa que alguien tenía que unir o cobrar por
// separado. Ahora el pedido se suma a esa cuenta como una ronda más, con el
// mismo núcleo que las rondas del TPV (orders.routes):
//   - no crea orden: crea la OrderRound en la cuenta, le cuelga las líneas y
//     recalcula el total de la cuenta desde TODAS sus líneas (se cobra una vez,
//     con la cuenta);
//   - va a cocina como ronda: order:updated a la caja/KDS y order:web-round
//     para que la tablet imprima la comanda de esa ronda (sin order:new, que
//     reimprimiría la cuenta entera como pedido web);
//   - un doble envío no duplica la ronda (id derivado de comensal + carrito);
//   - los pedidos con cupón, puntos o propina, y las cuentas con propina o pago
//     en línea abierto, siguen como orden aparte (su dinero vive en la orden).

process.env.TABLE_QR_SECRET = 'llave-de-pruebas-para-el-qr-de-mesa';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'jwt-de-pruebas-qr-open-tab';

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
    location: { findUnique: jest.fn(), findFirst: jest.fn() },
    restaurantConfig: { findUnique: jest.fn() },
    menuItem: { findFirst: jest.fn() },
    order: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    orderRound: { findFirst: jest.fn(), findUnique: jest.fn() },
    table: { findMany: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    cashShift: { findFirst: jest.fn() },
    coupon: { findFirst: jest.fn() },
    bulkPromo: { findMany: jest.fn() },
    // Descuento de inventario de la ronda (sin recetas en estas pruebas).
    comboSelection: { findMany: jest.fn() },
    recipe: { findMany: jest.fn() },
    recipeItem: { findMany: jest.fn() },
    orderItemModifier: { findMany: jest.fn() },
    modifierIngredient: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../src/lib/order-number', () => ({ nextOrderNumber: jest.fn() }));
jest.mock('../src/services/loyalty.service', () => ({
  addLoyaltyPoints: jest.fn().mockResolvedValue(undefined), genLoyaltyQr: jest.fn(), getTier: jest.fn(),
}));
jest.mock('../src/services/order-dictation.service', () => ({
  runOrderDictationSmart: jest.fn(),
}));
jest.mock('../src/lib/payment-providers', () => ({
  resolveProviderForRestaurant: jest.fn(),
  getProviderForRestaurant: jest.fn(),
  instantiateFromIntegration: jest.fn(),
}));
jest.mock('../src/services/printer.service', () => ({
  printOrderRoundTicket: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/notifications.service', () => ({
  sendOrderWhatsApp: jest.fn().mockResolvedValue(undefined),
  notifyDriversNewDeliveryOrder: jest.fn().mockResolvedValue(undefined),
}));

const { createHash } = require('node:crypto');
const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const { addLoyaltyPoints } = require('../src/services/loyalty.service');
const { printOrderRoundTicket } = require('../src/services/printer.service');
const { sendOrderWhatsApp } = require('../src/services/notifications.service');
const { signTableToken } = require('../src/lib/table-qr');
const { OPEN_TABLE_STATUSES } = require('../src/lib/table-status');

function buildApp(io) {
  const app = express();
  app.use(express.json());
  if (io) app.set('io', io);
  app.use('/api/store', require('../src/routes/store.routes'));
  return app;
}

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

// La cuenta que el mesero abrió en el TPV: una línea de $100 en la ronda 1.
const TAB = {
  id: 'tab-1', restaurantId: 'r1', locationId: 'loc-terraza', orderNumber: 2001,
  tableId: 't-abc', tableNumber: 7, orderType: 'DINE_IN', source: 'TPV',
  status: 'OPEN', paymentStatus: 'PENDING', awaitingTableConfirmation: false,
  subtotal: 100, discount: 0, deliveryFee: 0, tip: 0, total: 100,
  notes: null, paymentProviderRef: null, estimatedMinutes: 25,
};
const TAB_LINE = { id: 'li-1', orderId: 'tab-1', roundId: 'round-1', price: 100, quantity: 1, subtotal: 100, menuItem: { categoryId: 'c1' } };

const BASE = {
  orderType: 'DINE_IN',
  customerName: 'Ana',
  customerPhone: '5512345678',
  items: [{ menuItemId: 'm1', quantity: 2 }],
};
const tokenMesa7 = () => signTableToken({ tableId: 't-abc', number: 7 });

// Transacción falsa que guarda lo escrito y responde como Prisma.
function txMock({ tab = TAB, existingLines = [TAB_LINE], lastRoundNumber = 1 } = {}) {
  const lines = [...existingLines];
  const tx = {
    orderRound: {
      findFirst: jest.fn().mockResolvedValue(lastRoundNumber ? { roundNumber: lastRoundNumber } : null),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: data.id || 'round-auto', ...data })),
    },
    orderItem: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        const line = { id: `li-${lines.length + 1}`, ...data, menuItem: { categoryId: 'c1', name: 'Burger' } };
        lines.push(line);
        return line;
      }),
      findMany: jest.fn().mockImplementation(async () => lines),
      updateMany: jest.fn(),
    },
    order: {
      create: jest.fn(),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        ...tab, ...data, items: lines, rounds: [], table: { id: 't-abc', name: 'Mesa 7' },
      })),
    },
    table: { update: jest.fn() },
    coupon: { updateMany: jest.fn() },
    loyaltyAccount: { updateMany: jest.fn() },
    loyaltyTransaction: { create: jest.fn() },
  };
  return { tx, impl: async (fn) => fn(tx), lines };
}

const post = (body, io) => request(buildApp(io))
  .post('/api/store/orders')
  .set('x-restaurant-id', 'r1')
  .send(body);

// Id de la ronda que la tienda deriva para un comensal + carrito + ventana.
const roundIdFor = ({ customerName = 'Ana', customerPhone = '5512345678', sig = 'm1:2:70.00:', bucket }) =>
  `qr-${createHash('sha256')
    .update(JSON.stringify(['r1', 'tab-1', customerName, customerPhone, sig, bucket]))
    .digest('hex')}`;

let consoleError;
beforeEach(() => {
  jest.clearAllMocks();
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', isActive: true });
  prisma.restaurantConfig.findUnique.mockResolvedValue(CONFIG);
  prisma.location.findFirst.mockResolvedValue({ id: 'loc-principal' });
  prisma.menuItem.findFirst.mockResolvedValue(MENU_ITEM);
  prisma.order.findMany.mockResolvedValue([]);
  prisma.order.findFirst.mockResolvedValue(TAB);
  prisma.orderRound.findFirst.mockResolvedValue(null);
  prisma.cashShift.findFirst.mockResolvedValue({ id: 'shift-1' });
  prisma.table.findFirst.mockResolvedValue({ id: 't-abc', name: 'Mesa 7', locationId: 'loc-terraza', status: 'OCCUPIED' });
  prisma.bulkPromo.findMany.mockResolvedValue([]);
  prisma.comboSelection.findMany.mockResolvedValue([]);
  prisma.recipe.findMany.mockResolvedValue([]);
  prisma.recipeItem.findMany.mockResolvedValue([]);
  prisma.orderItemModifier.findMany.mockResolvedValue([]);
  prisma.modifierIngredient.findMany.mockResolvedValue([]);
});
afterEach(() => consoleError.mockRestore());

describe('POST /api/store/orders — QR a una mesa con cuenta abierta', () => {
  it('se suma a la cuenta como ronda nueva: no crea orden y recalcula la cuenta una sola vez', async () => {
    const { tx, impl } = txMock();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, tableToken: tokenMesa7() });

    expect(res.status).toBe(201);
    expect(tx.order.create).not.toHaveBeenCalled();
    // Ronda 2 de la cuenta, con id derivado del comensal (idempotencia).
    expect(tx.orderRound.create).toHaveBeenCalledWith({
      data: { id: expect.stringMatching(/^qr-[0-9a-f]{64}$/), orderId: 'tab-1', roundNumber: 2 },
    });
    const roundId = tx.orderRound.create.mock.calls[0][0].data.id;
    expect(tx.orderItem.create).toHaveBeenCalledTimes(1);
    expect(tx.orderItem.create.mock.calls[0][0].data).toMatchObject({
      menuItemId: 'm1', quantity: 2, price: 70, subtotal: 140, orderId: 'tab-1', roundId,
    });
    // Total de la cuenta desde TODAS sus líneas ($100 de antes + $140 de la ronda):
    // la ronda no se suma dos veces ni se cobra aparte.
    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tab-1' },
      data: { subtotal: 240, total: 240, promoDiscount: 0 },
    }));
    // El comensal ve el folio de la cuenta y lo de SU ronda, no el total de la mesa.
    expect(res.body).toMatchObject({
      id: 'tab-1', orderNumber: 2001, total: 140, tip: 0, discount: 0,
      appendedToOpenTab: true, roundNumber: 2, awaitingTableConfirmation: false,
    });
    // La mesa ya estaba ocupada por su cuenta: no se toca.
    expect(tx.table.update).not.toHaveBeenCalled();
    // Inventario: SOLO la línea nueva (la de la ronda 1 ya se descontó al abrirla).
    expect(prisma.comboSelection.findMany.mock.calls.map((c) => c[0].where.orderItemId)).toEqual(['li-2']);
  });

  it('busca la cuenta viva y confirmada de esa mesa en la sucursal de la mesa', async () => {
    const { impl } = txMock();
    prisma.$transaction.mockImplementation(impl);

    await post({ ...BASE, locationId: 'loc-principal', tableToken: tokenMesa7() });

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: {
        tableId: 't-abc',
        status: { in: OPEN_TABLE_STATUSES },
        paymentStatus: { not: 'PAID' },
        locationId: 'loc-terraza',
        awaitingTableConfirmation: false,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('va a cocina como ronda: order:updated + order:web-round, sin order:new', async () => {
    const { impl } = txMock();
    prisma.$transaction.mockImplementation(impl);
    const io = fakeIo();

    await post({ ...BASE, tableToken: tokenMesa7() }, io);

    expect(io.emitted.filter((e) => e.event === 'order:new')).toEqual([]);
    const rooms = io.emitted.map((e) => [e.room, e.event]);
    expect(rooms).toEqual([
      ['restaurant:r1:location:loc-terraza:admins', 'order:updated'],
      ['restaurant:r1:location:loc-terraza:admins', 'order:web-round'],
    ]);
    const webRound = io.emitted.find((e) => e.event === 'order:web-round').payload;
    expect(webRound).toMatchObject({
      id: 'tab-1', orderNumber: 2001, roundNumber: 2, tableNumber: 7, tableName: 'Mesa 7',
      customerName: 'Ana', total: 140, source: 'ONLINE',
    });
    expect(webRound.roundId).toMatch(/^qr-/);
    // Impresión de red del backend: SOLO la ronda nueva (igual que la del TPV).
    expect(printOrderRoundTicket).toHaveBeenCalledWith(expect.objectContaining({ id: 'tab-1' }), webRound.roundId);
  });

  it('doble envío del mismo comensal → responde la ronda ya guardada sin escribir otra', async () => {
    prisma.orderRound.findFirst.mockResolvedValue({ id: 'qr-previa', orderId: 'tab-1', roundNumber: 2 });

    const res = await post({ ...BASE, tableToken: tokenMesa7() });

    expect(res.status).toBe(201);
    expect(res.headers['x-dedup-replay']).toBe('true');
    expect(res.body).toMatchObject({ id: 'tab-1', roundNumber: 2, appendedToOpenTab: true, deduped: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // Busca en la ventana actual y en la anterior, acotado a la cuenta.
    const bucket = Math.floor(Date.now() / 30_000);
    expect(prisma.orderRound.findFirst).toHaveBeenCalledWith({
      where: {
        id: { in: [roundIdFor({ bucket }), roundIdFor({ bucket: bucket - 1 })] },
        orderId: 'tab-1',
      },
    });
  });

  it('dos comensales de la mesa con el mismo carrito → dos rondas distintas', async () => {
    const ids = [];
    for (const customerName of ['Ana', 'Beto']) {
      const { tx, impl } = txMock();
      prisma.$transaction.mockImplementation(impl);
      const res = await post({ ...BASE, customerName, tableToken: tokenMesa7() });
      expect(res.status).toBe(201);
      ids.push(tx.orderRound.create.mock.calls[0][0].data.id);
    }
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('doble envío que se cruza en carrera (P2002) → responde la ronda del primero', async () => {
    prisma.$transaction.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    prisma.orderRound.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'qr-del-primero', orderId: 'tab-1', roundNumber: 3 });

    const res = await post({ ...BASE, tableToken: tokenMesa7() });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'tab-1', roundNumber: 3, deduped: true });
  });

  it('nota del comensal → queda en las notas de la cuenta', async () => {
    const { tx, impl } = txMock({ tab: { ...TAB, notes: 'Cumpleaños' } });
    prisma.order.findFirst.mockResolvedValue({ ...TAB, notes: 'Cumpleaños' });
    prisma.$transaction.mockImplementation(impl);

    await post({ ...BASE, notes: 'Sin cebolla', tableToken: tokenMesa7() });

    expect(tx.order.update.mock.calls[0][0].data.notes).toBe('Cumpleaños\nRonda QR (Ana): Sin cebolla');
  });

  it('comensal con sesión → acumula los puntos de su ronda en la cuenta', async () => {
    const jwt = require('jsonwebtoken');
    prisma.user.findUnique.mockResolvedValue({ id: 'cust-1', role: 'CUSTOMER', restaurantId: 'r1', isActive: true });
    const { impl } = txMock();
    prisma.$transaction.mockImplementation(impl);
    const token = jwt.sign({ userId: 'cust-1', id: 'cust-1', role: 'CUSTOMER', restaurantId: 'r1' }, process.env.JWT_SECRET);

    const res = await request(buildApp())
      .post('/api/store/orders')
      .set('x-restaurant-id', 'r1')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...BASE, tableToken: tokenMesa7() });

    expect(res.status).toBe(201);
    expect(res.body.appendedToOpenTab).toBe(true);
    expect(addLoyaltyPoints).toHaveBeenCalledWith('cust-1', {
      id: 'tab-1', restaurantId: 'r1', orderNumber: 2001, subtotal: 140, discount: 0,
    });
  });

  it('aviso al dueño: ronda web de la cuenta, con lo de la ronda', async () => {
    prisma.restaurantConfig.findUnique.mockResolvedValue({
      ...CONFIG, orderAlertEnabled: true, orderAlertWhatsapp: '5599998888', countryCode: '52',
    });
    const { impl } = txMock();
    prisma.$transaction.mockImplementation(impl);

    await post({ ...BASE, tableToken: tokenMesa7() });

    expect(sendOrderWhatsApp).toHaveBeenCalledTimes(1);
    const msg = sendOrderWhatsApp.mock.calls[0][2];
    expect(msg).toContain('Ronda web en la cuenta #2001');
    expect(msg).toContain('🍽 Mesa 7');
    expect(msg).toContain('*Total: $140*');
  });
});

describe('POST /api/store/orders — cuándo sigue siendo orden aparte', () => {
  // Orden aparte = el camino de siempre: order.create en la transacción.
  function orderCreateTx() {
    const create = jest.fn().mockImplementation(async ({ data }) => ({
      id: 'o-nueva', orderNumber: 3001, status: 'PENDING', orderType: 'DINE_IN',
      total: data.total, discount: data.discount, pointsUsed: 0, tip: data.tip, estimatedMinutes: 30, items: [],
      tableNumber: data.tableNumber, awaitingTableConfirmation: data.awaitingTableConfirmation,
    }));
    const impl = async (fn) => fn({
      order: { create },
      table: { update: jest.fn() },
      coupon: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      loyaltyAccount: { updateMany: jest.fn() },
      loyaltyTransaction: { create: jest.fn() },
      orderRound: { create: jest.fn() },
    });
    return { create, impl };
  }
  beforeEach(() => {
    require('../src/lib/order-number').nextOrderNumber.mockResolvedValue(3001);
  });

  it('mesa ocupada sin cuenta abierta → orden propia, como antes', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    const { create, impl } = orderCreateTx();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, tableToken: tokenMesa7() });

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalled();
    expect(res.body.appendedToOpenTab).toBeUndefined();
  });

  it('con propina → orden propia (la propina vive en la orden)', async () => {
    const { create, impl } = orderCreateTx();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, tip: 15, tableToken: tokenMesa7() });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data.tip).toBe(15);
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('con cupón válido → orden propia (el descuento vive en la orden)', async () => {
    prisma.coupon.findFirst.mockResolvedValue({
      id: 'cup-1', code: 'DIEZ', isActive: true, discountType: 'FIXED', discountValue: 10, minOrderAmount: 0,
    });
    const { create, impl } = orderCreateTx();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, couponCode: 'diez', tableToken: tokenMesa7() });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data.couponId).toBe('cup-1');
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['propina', { tip: 20 }],
    ['pago en línea abierto', { paymentProviderRef: 'mp-pref-1' }],
  ])('cuenta con %s → orden propia (no se pierde ni se cobra doble)', async (_label, extra) => {
    prisma.order.findFirst.mockResolvedValue({ ...TAB, ...extra });
    const { create, impl } = orderCreateTx();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, tableToken: tokenMesa7() });

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalled();
  });

  it('mesa libre → por confirmar, sin buscar cuenta (se decide al aceptarlo)', async () => {
    prisma.table.findFirst.mockResolvedValue({ id: 't-abc', name: 'Mesa 7', locationId: 'loc-terraza', status: 'AVAILABLE' });
    const { create, impl } = orderCreateTx();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, tableToken: tokenMesa7() });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data.awaitingTableConfirmation).toBe(true);
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('QR viejo por número (sin firma) → por confirmar, sin buscar cuenta', async () => {
    prisma.table.findMany.mockResolvedValue([{ id: 't-abc', name: 'Mesa 7' }]);
    const { create, impl } = orderCreateTx();
    prisma.$transaction.mockImplementation(impl);

    const res = await post({ ...BASE, tableNumber: 7 });

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data.awaitingTableConfirmation).toBe(true);
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });
});

describe('GET /api/store/orders/by-number — pedido por confirmar sumado a la cuenta', () => {
  it('el comensal sigue el estado de la cuenta, no un "rechazado"', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'o-held', orderNumber: 3002, status: 'CANCELLED', estimatedMinutes: 30,
      paymentStatus: 'PENDING', awaitingTableConfirmation: false, createdAt: new Date(0),
    });
    prisma.orderRound.findUnique.mockResolvedValue({
      roundNumber: 2, order: { orderNumber: 2001, status: 'PREPARING', paymentStatus: 'PENDING' },
    });

    const res = await request(buildApp()).get('/api/store/orders/by-number/3002').set('x-restaurant-id', 'r1');

    expect(prisma.orderRound.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'qr-held-o-held' },
    }));
    expect(res.body).toMatchObject({
      orderNumber: 3002, status: 'PREPARING', awaitingTableConfirmation: false,
      mergedInto: { orderNumber: 2001, roundNumber: 2 },
    });
  });

  it('un pedido rechazado de verdad sigue saliendo CANCELLED', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 'o-held', orderNumber: 3002, status: 'CANCELLED', awaitingTableConfirmation: false,
    });
    prisma.orderRound.findUnique.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/store/orders/by-number/3002').set('x-restaurant-id', 'r1');

    expect(res.body).toMatchObject({ status: 'CANCELLED' });
    expect(res.body.mergedInto).toBeUndefined();
  });
});
