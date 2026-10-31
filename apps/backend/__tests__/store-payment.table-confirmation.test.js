'use strict';

// Pago en línea de un pedido de mesa por confirmar (QR desde internet a una mesa
// libre): ya pagado no hay riesgo de pedido falso y rechazarlo exigiría un
// reembolso, así que el pago cuenta como confirmación — ocupa la mesa y entra a
// cocina con el order:new de siempre.

jest.mock('@mrtpvrest/database', () => {
  const prisma = {
    order: { findUnique: jest.fn(), update: jest.fn() },
    table: { update: jest.fn() },
  };
  // El consumo de inventario abre su propia transacción tras guardar el pago.
  prisma.$transaction = jest.fn(async (fn) => fn(prisma));
  return { prisma };
});
jest.mock('../src/services/order-inventory.service', () => ({
  consumePaidOrder: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/lib/order-number', () => ({ nextOrderNumber: jest.fn() }));
jest.mock('../src/services/loyalty.service', () => ({
  addLoyaltyPoints: jest.fn(), genLoyaltyQr: jest.fn(), getTier: jest.fn(),
}));
jest.mock('../src/services/order-dictation.service', () => ({
  runOrderDictationSmart: jest.fn(),
}));
jest.mock('../src/lib/order-confirmation-mailer', () => ({
  sendOrderPaidEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/payment-providers', () => ({
  resolveProviderForRestaurant: jest.fn(),
  getProviderForRestaurant: jest.fn(),
  instantiateFromIntegration: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const { getProviderForRestaurant } = require('../src/lib/payment-providers');
const { consumePaidOrder } = require('../src/services/order-inventory.service');

function fakeIo() {
  const emitted = [];
  return { emitted, to: (room) => ({ emit: (event) => emitted.push({ room, event }) }) };
}

function makeApp(io) {
  const app = express();
  app.use(express.json());
  app.set('io', io);
  app.use('/api/store', require('../src/routes/store.routes'));
  return app;
}

const ORDER = {
  id: 'o1', restaurantId: 'r1', locationId: 'loc1', tableId: 't7',
  orderNumber: 3001, total: 140, status: 'PENDING', paymentMethod: 'ONLINE',
};

const stripePaid = () => ({
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_1', payment_intent: 'pi_1', client_reference_id: 'o1' } },
});

beforeEach(() => {
  jest.clearAllMocks();
  prisma.order.update.mockResolvedValue({});
  prisma.table.update.mockResolvedValue({});
  getProviderForRestaurant.mockResolvedValue({
    getPayment: jest.fn().mockResolvedValue({ status: 'PAID', rawStatus: 'paid', providerId: 'pi_1', externalReference: 'o1' }),
  });
});

test('pagado en línea: quita la marca, ocupa la mesa y manda el pedido a cocina', async () => {
  prisma.order.findUnique.mockResolvedValue({ ...ORDER, awaitingTableConfirmation: true });
  const io = fakeIo();

  const res = await request(makeApp(io)).post('/api/store/webhook/stripe').send(stripePaid());

  expect(res.status).toBe(200);
  expect(prisma.order.update.mock.calls[0][0].data).toMatchObject({
    paymentStatus: 'PAID', status: 'CONFIRMED', awaitingTableConfirmation: false,
  });
  expect(prisma.table.update).toHaveBeenCalledWith({ where: { id: 't7' }, data: { status: 'OCCUPIED' } });
  expect(io.emitted).toContainEqual({ room: 'restaurant:r1:kitchen', event: 'order:new' });
});

test('un pedido pagado que no esperaba confirmación no toca la mesa', async () => {
  prisma.order.findUnique.mockResolvedValue({ ...ORDER, awaitingTableConfirmation: false });

  await request(makeApp(fakeIo())).post('/api/store/webhook/stripe').send(stripePaid());

  expect(prisma.order.update.mock.calls[0][0].data).not.toHaveProperty('awaitingTableConfirmation');
  expect(prisma.table.update).not.toHaveBeenCalled();
});

test('pagado en línea: consume el inventario después de guardar el pago', async () => {
  prisma.order.findUnique.mockResolvedValue({ ...ORDER, awaitingTableConfirmation: false });

  await request(makeApp(fakeIo())).post('/api/store/webhook/stripe').send(stripePaid());

  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(consumePaidOrder).toHaveBeenCalledWith(prisma, 'o1', 'r1', { confirmedExternalPayment: true });
  expect(prisma.order.update.mock.invocationCallOrder[0]).toBeLessThan(consumePaidOrder.mock.invocationCallOrder[0]);
});

test('si el inventario falla, el pago queda guardado y el pedido entra a cocina', async () => {
  prisma.order.findUnique.mockResolvedValue({ ...ORDER, awaitingTableConfirmation: false });
  consumePaidOrder.mockRejectedValueOnce(new Error('Revisa los insumos del plan de empaques'));
  const io = fakeIo();

  const res = await request(makeApp(io)).post('/api/store/webhook/stripe').send(stripePaid());

  expect(res.status).toBe(200);
  expect(prisma.order.update.mock.calls[0][0].data).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
  expect(io.emitted).toContainEqual({ room: 'restaurant:r1:kitchen', event: 'order:new' });
});

test('un pago no aprobado no consume inventario', async () => {
  prisma.order.findUnique.mockResolvedValue({ ...ORDER, awaitingTableConfirmation: false });
  getProviderForRestaurant.mockResolvedValue({
    getPayment: jest.fn().mockResolvedValue({ status: 'FAILED', rawStatus: 'failed', providerId: 'pi_1', externalReference: 'o1' }),
  });

  await request(makeApp(fakeIo())).post('/api/store/webhook/stripe').send(stripePaid());

  expect(prisma.order.update.mock.calls[0][0].data).toMatchObject({ paymentStatus: 'FAILED' });
  expect(consumePaidOrder).not.toHaveBeenCalled();
});
