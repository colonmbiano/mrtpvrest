'use strict';

// Origen KIOSK de POST /api/store/orders.
//
// `source: 'KIOSK'` exenta al pedido de reglas pensadas para internet (tienda
// cerrada, saturación, mínimo de compra, turno de caja y confirmación de mesa).
// Antes bastaba con declararlo en el body (más un header x-kiosk-terminal-id con
// cualquier valor). Ahora solo vale con el JWT de un Device KIOSK activo de ese
// restaurante y sucursal; sin él, el pedido se trata como ONLINE.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'jwt-de-pruebas-kiosko';

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
    device: { findUnique: jest.fn(), update: jest.fn() },
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

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/store', require('../src/routes/store.routes'));
  app.use('/api/devices', require('../src/routes/devices.routes'));
  return app;
}

const MENU_ITEM = {
  id: 'm1', name: 'Burger', price: 70, isPromo: false, promoPrice: null,
  restaurantId: 'r1', isAvailable: true, availableOnline: true, availableOnKiosk: true,
  variants: [], modifierGroups: [], complements: [],
};

// Tienda cerrada y con mínimo de $500: un pedido ONLINE de $140 no pasa.
const CLOSED_CONFIG = {
  restaurantId: 'r1', isOpen: false, scheduleEnabled: false,
  minOrderAmount: 500, estimatedDelivery: 30, maxOpenOrders: 0,
};
const OPEN_CONFIG = { ...CLOSED_CONFIG, isOpen: true, minOrderAmount: 0 };

const TAKEOUT = {
  source: 'KIOSK',
  orderType: 'TAKEOUT',
  paymentMethod: 'CASH',
  customerName: 'Ana',
  items: [{ menuItemId: 'm1', quantity: 2 }],
};
const DINE_IN = {
  ...TAKEOUT,
  orderType: 'DINE_IN',
  customerName: 'Mesa 3',
  tableNumber: 3,
};

const KIOSK_DEVICE = {
  id: 'dev-kiosk', type: 'KIOSK', isActive: true, tenantId: 'ten1', locationId: 'loc1',
  location: { restaurantId: 'r1', isActive: true },
};

let deviceSeq = 0;
// Cada prueba usa un Device distinto: el freno anti-fraude vive en memoria del
// módulo y se compartiría entre pruebas.
function kioskDevice(overrides = {}) {
  deviceSeq += 1;
  return { ...KIOSK_DEVICE, id: `dev-kiosk-${deviceSeq}`, ...overrides };
}

function deviceJwt(device, extra = {}, options = {}) {
  return jwt.sign(
    {
      userId: device.id, deviceId: device.id, isDevice: true, role: 'KIOSK',
      restaurantId: 'r1', locationId: device.locationId, tenantId: device.tenantId,
      ...extra,
    },
    process.env.JWT_SECRET,
    options,
  );
}

function txMock() {
  const create = jest.fn().mockImplementation(async ({ data }) => ({
    id: 'o1', orderNumber: 3001, status: 'PENDING', total: 140, discount: 0,
    pointsUsed: 0, tip: 0, estimatedMinutes: 30, items: [],
    source: data.source, awaitingTableConfirmation: data.awaitingTableConfirmation,
  }));
  prisma.$transaction.mockImplementation(async (fn) => fn({
    order: { create },
    table: { update: jest.fn() },
    coupon: { updateMany: jest.fn() },
    loyaltyAccount: { updateMany: jest.fn() },
    loyaltyTransaction: { create: jest.fn() },
  }));
  return create;
}

function post(body, { token, headers = {} } = {}) {
  let req = request(buildApp())
    .post('/api/store/orders')
    .set('x-restaurant-id', 'r1')
    .set('x-location-id', 'loc1');
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return req.send(body);
}

describe('POST /api/store/orders — origen KIOSK', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', tenantId: 'ten1', isActive: true });
    prisma.location.findUnique.mockResolvedValue({ id: 'loc1', restaurantId: 'r1', isActive: true });
    prisma.location.findFirst.mockResolvedValue({ id: 'loc1' });
    prisma.restaurantConfig.findUnique.mockResolvedValue(CLOSED_CONFIG);
    prisma.menuItem.findFirst.mockResolvedValue(MENU_ITEM);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.count.mockResolvedValue(0);
    prisma.table.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.cashShift.findFirst.mockResolvedValue(null);
    nextOrderNumber.mockResolvedValue(3001);
  });

  describe('sin JWT de kiosko → pedido ONLINE, sin exenciones', () => {
    it('tienda cerrada: 423 aunque declare KIOSK y mande x-kiosk-terminal-id', async () => {
      const res = await post(TAKEOUT, { headers: { 'x-kiosk-terminal-id': 'TERM-FALSA' } });

      expect(res.status).toBe(423);
      expect(res.body.code).toBe('STORE_CLOSED');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('pedido mínimo: 400 MIN_ORDER_NOT_MET', async () => {
      prisma.restaurantConfig.findUnique.mockResolvedValue({ ...OPEN_CONFIG, minOrderAmount: 500 });

      const res = await post(TAKEOUT);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MIN_ORDER_NOT_MET');
    });

    it('saturación: 429 STORE_SATURATED', async () => {
      prisma.restaurantConfig.findUnique.mockResolvedValue({ ...OPEN_CONFIG, maxOpenOrders: 5 });
      prisma.order.count.mockResolvedValue(5);

      const res = await post(TAKEOUT);

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('STORE_SATURATED');
    });

    it('mesa sin turno de caja: 409 NO_ACTIVE_SHIFT', async () => {
      prisma.restaurantConfig.findUnique.mockResolvedValue(OPEN_CONFIG);

      const res = await post(DINE_IN);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NO_ACTIVE_SHIFT');
    });

    it('mesa con turno: queda por confirmar y se guarda como ONLINE', async () => {
      prisma.restaurantConfig.findUnique.mockResolvedValue(OPEN_CONFIG);
      prisma.cashShift.findFirst.mockResolvedValue({ id: 'shift1' });
      const create = txMock();

      const res = await post(DINE_IN);

      expect(res.status).toBe(201);
      expect(create.mock.calls[0][0].data).toMatchObject({ source: 'ONLINE', awaitingTableConfirmation: true });
      expect(res.body.awaitingTableConfirmation).toBe(true);
      // Catálogo de la tienda web, no el del kiosko.
      expect(prisma.menuItem.findFirst.mock.calls[0][0].where).toMatchObject({ availableOnline: true });
      expect(prisma.menuItem.findFirst.mock.calls[0][0].where).not.toHaveProperty('availableOnKiosk');
    });

    it('JWT de cliente (no de dispositivo): sigue siendo ONLINE', async () => {
      const customerToken = jwt.sign({ userId: 'u1', role: 'CUSTOMER', restaurantId: 'r1' }, process.env.JWT_SECRET);

      const res = await post(TAKEOUT, { token: customerToken });

      expect(res.status).toBe(423);
      expect(prisma.device.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ['de otro restaurante', { location: { restaurantId: 'r2', isActive: true } }],
      ['de otro tenant', { tenantId: 'ten2' }],
      ['de otra sucursal', { locationId: 'loc2' }],
      ['desactivado', { isActive: false }],
      ['de tipo KDS', { type: 'KDS' }],
    ])('Device %s: no acredita KIOSK', async (_label, overrides) => {
      const device = kioskDevice(overrides);
      prisma.device.findUnique.mockResolvedValue(device);

      const res = await post(TAKEOUT, { token: deviceJwt(device) });

      expect(res.status).toBe(423);
      expect(res.body.code).toBe('STORE_CLOSED');
    });

    it('Device borrado: no acredita KIOSK', async () => {
      prisma.device.findUnique.mockResolvedValue(null);

      const res = await post(TAKEOUT, { token: deviceJwt(kioskDevice()) });

      expect(res.status).toBe(423);
    });
  });

  describe('JWT vencido o mal firmado → 401 para que el kiosko lo renueve', () => {
    it('vencido', async () => {
      const token = deviceJwt(kioskDevice(), { exp: Math.floor(Date.now() / 1000) - 60 });

      const res = await post(TAKEOUT, { token });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('KIOSK_DEVICE_TOKEN_INVALID');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('firmado con otra clave', async () => {
      const token = jwt.sign({ isDevice: true, deviceId: 'dev-x', role: 'KIOSK' }, 'otra-clave');

      const res = await post(TAKEOUT, { token });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('KIOSK_DEVICE_TOKEN_INVALID');
    });
  });

  describe('con JWT de Device KIOSK de este restaurante → exenciones del kiosko', () => {
    it('tienda cerrada y bajo el mínimo: crea el pedido como KIOSK', async () => {
      const device = kioskDevice();
      prisma.device.findUnique.mockResolvedValue(device);
      const create = txMock();

      const res = await post(TAKEOUT, { token: deviceJwt(device) });

      expect(res.status).toBe(201);
      expect(create.mock.calls[0][0].data).toMatchObject({ source: 'KIOSK' });
      expect(prisma.device.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: device.id } }));
      expect(prisma.menuItem.findFirst.mock.calls[0][0].where).toMatchObject({ availableOnKiosk: true });
    });

    it('mesa sin turno ni QR firmado: entra directo, sin esperar confirmación', async () => {
      const device = kioskDevice();
      prisma.device.findUnique.mockResolvedValue(device);
      const create = txMock();

      const res = await post(DINE_IN, { token: deviceJwt(device) });

      expect(res.status).toBe(201);
      expect(create.mock.calls[0][0].data).toMatchObject({ source: 'KIOSK', awaitingTableConfirmation: false });
      expect(prisma.cashShift.findFirst).not.toHaveBeenCalled();
    });

    it('sin terminal de cobro configurada (sin x-kiosk-terminal-id): ya no se rechaza', async () => {
      const device = kioskDevice();
      prisma.device.findUnique.mockResolvedValue(device);
      txMock();

      const res = await post(TAKEOUT, { token: deviceJwt(device) });

      expect(res.status).toBe(201);
    });

    it('sin sucursal en la petición: el pedido va a la sucursal del kiosko', async () => {
      const device = kioskDevice({ locationId: 'loc7' });
      prisma.device.findUnique.mockResolvedValue(device);
      prisma.location.findFirst.mockResolvedValue({ id: 'loc-principal' });
      const create = txMock();

      const res = await request(buildApp())
        .post('/api/store/orders')
        .set('x-restaurant-id', 'r1')
        .set('Authorization', `Bearer ${deviceJwt(device)}`)
        .send(TAKEOUT);

      expect(res.status).toBe(201);
      expect(create.mock.calls[0][0].data).toMatchObject({ source: 'KIOSK', locationId: 'loc7' });
    });

    it('el JWT de kiosko no cuenta como personal: con source ONLINE respeta el cierre', async () => {
      const device = kioskDevice();
      prisma.device.findUnique.mockResolvedValue(device);

      const res = await post({ ...TAKEOUT, source: 'ONLINE' }, { token: deviceJwt(device) });

      expect(res.status).toBe(423);
      expect(res.body.code).toBe('STORE_CLOSED');
    });

    it('el freno anti-fraude cuenta por Device: el pedido 9 en la ventana → 429', async () => {
      const device = kioskDevice();
      prisma.device.findUnique.mockResolvedValue(device);
      txMock();
      const token = deviceJwt(device);

      for (let i = 0; i < 8; i += 1) {
        const ok = await post(TAKEOUT, { token });
        expect(ok.status).toBe(201);
      }
      const res = await post(TAKEOUT, { token });

      expect(res.status).toBe(429);
      expect(res.body).toMatchObject({ code: 'KIOSK_RATE_LIMIT', deviceId: device.id });
    });
  });
});

describe('POST /api/devices/auth — Device KIOSK', () => {
  beforeEach(() => jest.clearAllMocks());

  it('emite un JWT de rol KIOSK (no CASHIER) para el Device KIOSK', async () => {
    prisma.device.findUnique.mockResolvedValue({
      id: 'dev-k', name: 'KIOSK - 2026-10-29', type: 'KIOSK', isActive: true, tenantId: 'ten1',
      location: { id: 'loc1', isActive: true, restaurant: { id: 'r1', tenantId: 'ten1', isActive: true } },
    });
    prisma.device.update.mockResolvedValue({});

    const res = await request(buildApp()).post('/api/devices/auth').send({ deviceToken: 'tok' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('KIOSK');
    const payload = jwt.verify(res.body.accessToken, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ isDevice: true, deviceId: 'dev-k', role: 'KIOSK', restaurantId: 'r1' });
  });
});
