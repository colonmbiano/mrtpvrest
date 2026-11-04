'use strict';

// Avisos push de la cuenta del comprador (app del cliente): suscripción con el
// Bearer y aviso al cambiar el estado de un pedido del marketplace. Sin BD ni red.

const mockSend = jest.fn().mockResolvedValue({});
jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: (...args) => mockSend(...args) }));
jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    pushSubscription: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn(), delete: jest.fn() },
    marketplaceQuote: { findFirst: jest.fn() },
    restaurant: { findUnique: jest.fn() },
  },
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const { createBuyerPushStore, parseSubscription } = require('../src/lib/marketplace-buyer-push');
const { BuyerIdentityError } = require('../src/lib/marketplace-buyer-identity');

const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };
const bearer = async req => {
  if (req.headers.authorization === 'Bearer buyer') return 'acc-1';
  if (req.headers['x-buyer-id']) return 'guest:abc';
  throw new BuyerIdentityError('INVALID_BUYER_IDENTITY', 'Token de comprador invalido');
};
function app(service) {
  const a = express();
  a.use(express.json());
  a.use('/api/marketplace/v1/push', require('../src/routes/marketplace-push-v1.routes')({ service, resolveAccount: bearer }));
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('/api/marketplace/v1/push', () => {
  it('suscribe y da de baja este navegador a la cuenta del Bearer', async () => {
    const service = createBuyerPushStore({ prisma });
    const a = app(service);
    const res = await request(a).put('/api/marketplace/v1/push').set('Authorization', 'Bearer buyer').set('User-Agent', 'Prueba/1.0').send({ subscription: SUB });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: SUB.endpoint },
      update: { userId: 'buyer:acc-1', orderId: null, locationId: null, p256dh: SUB.keys.p256dh, auth: SUB.keys.auth, userAgent: 'Prueba/1.0' },
      create: { endpoint: SUB.endpoint, p256dh: SUB.keys.p256dh, auth: SUB.keys.auth, userId: 'buyer:acc-1', userAgent: 'Prueba/1.0' },
    });
    const off = await request(a).delete('/api/marketplace/v1/push').set('Authorization', 'Bearer buyer').send({ endpoint: SUB.endpoint });
    expect(off.status).toBe(204);
    // Solo borra la suscripción de esta cuenta.
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { endpoint: SUB.endpoint, userId: 'buyer:acc-1' } });
  });

  it('sin Bearer o con id de invitado no suscribe nada', async () => {
    const a = app(createBuyerPushStore({ prisma }));
    expect((await request(a).put('/api/marketplace/v1/push').send({ subscription: SUB })).status).toBe(401);
    expect((await request(a).put('/api/marketplace/v1/push').set('X-Buyer-Id', 'guest-browser').send({ subscription: SUB })).status).toBe(401);
    expect((await request(a).delete('/api/marketplace/v1/push').set('Authorization', 'Bearer otro').send({ endpoint: SUB.endpoint })).status).toBe(401);
    expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
    expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });

  it('rechaza suscripciones mal formadas sin escribir', async () => {
    const a = app(createBuyerPushStore({ prisma }));
    for (const subscription of [null, {}, { ...SUB, endpoint: 'http://push.example.com/x' }, { ...SUB, endpoint: 'https://u:p@push.example.com/x' },
      { ...SUB, endpoint: 'https://push.example.com/' + 'x'.repeat(1000) }, { ...SUB, keys: { p256dh: 'corta', auth: SUB.keys.auth } },
      { ...SUB, keys: { p256dh: SUB.keys.p256dh, auth: 'a b c d e f g h' } }]) {
      const res = await request(a).put('/api/marketplace/v1/push').set('Authorization', 'Bearer buyer').send({ subscription });
      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_SUBSCRIPTION');
    }
    expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
    expect(() => parseSubscription(SUB)).not.toThrow();
  });

  it('sin la bandera v1 responde 503', async () => {
    const saved = process.env.MARKETPLACE_V1_ORDERS_ENABLED;
    delete process.env.MARKETPLACE_V1_ORDERS_ENABLED;
    let a;
    jest.isolateModules(() => {
      a = express();
      a.use(express.json());
      a.use('/api/marketplace/v1/push', require('../src/routes/marketplace-push-v1.routes')({ resolveAccount: bearer }));
    });
    const res = await request(a).put('/api/marketplace/v1/push').set('Authorization', 'Bearer buyer').send({ subscription: SUB });
    if (saved !== undefined) process.env.MARKETPLACE_V1_ORDERS_ENABLED = saved;
    expect(res.status).toBe(503);
    expect(res.body.errorCode).toBe('PUSH_UNAVAILABLE');
  });
});

describe('notifyOrderStatus avisa a la cuenta dueña de un pedido del marketplace', () => {
  let notifyOrderStatus;
  beforeAll(() => {
    process.env.VAPID_PUBLIC_KEY = 'public-test-key';
    process.env.VAPID_PRIVATE_KEY = 'private-test-key';
    jest.isolateModules(() => { ({ notifyOrderStatus } = require('../src/services/notifications.service')); });
  });
  afterAll(() => { delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; });

  const subscriptions = { 'buyer:acc-1': [{ id: 's1', endpoint: 'https://push.example.com/acc-1', p256dh: 'k', auth: 'a' }] };
  beforeEach(() => {
    prisma.pushSubscription.findMany.mockImplementation(async ({ where }) => (where.userId ? subscriptions[where.userId] ?? [] : []));
  });

  it('manda el aviso a los navegadores de la cuenta, sin códigos y con enlace a Mis pedidos', async () => {
    prisma.marketplaceQuote.findFirst.mockResolvedValue({ accountId: 'acc-1' });
    await notifyOrderStatus({ id: 'o1', orderNumber: 41, source: 'MARKETPLACE', restaurantId: 'r1' }, 'READY');
    expect(prisma.marketplaceQuote.findFirst).toHaveBeenCalledWith({ where: { orderId: 'o1' }, select: { accountId: true } });
    const toBuyer = mockSend.mock.calls.filter(([sub]) => sub.endpoint === 'https://push.example.com/acc-1');
    expect(toBuyer).toHaveLength(1);
    const payload = JSON.parse(toBuyer[0][1]);
    expect(payload).toEqual(expect.objectContaining({ tag: 'o1', data: { url: '/cuenta/pedidos' } }));
    expect(payload.body).toContain('41');
    expect(payload.body).not.toMatch(/\d{6}/);
  });

  it('pedidos de otro origen, de invitados o sin cotización no buscan cuenta ni avisan', async () => {
    await notifyOrderStatus({ id: 'o2', orderNumber: 7, source: 'ONLINE', restaurantId: 'r1' }, 'READY');
    expect(prisma.marketplaceQuote.findFirst).not.toHaveBeenCalled();
    prisma.marketplaceQuote.findFirst.mockResolvedValueOnce({ accountId: 'guest:abc' }).mockResolvedValueOnce(null);
    await notifyOrderStatus({ id: 'o3', orderNumber: 8, source: 'MARKETPLACE', restaurantId: 'r1' }, 'READY');
    await notifyOrderStatus({ id: 'o4', orderNumber: 9, source: 'MARKETPLACE', restaurantId: 'r1' }, 'READY');
    expect(mockSend.mock.calls.some(([sub]) => sub.endpoint === 'https://push.example.com/acc-1')).toBe(false);
  });

  it('un error al buscar la cuenta no rompe el cambio de estado', async () => {
    prisma.marketplaceQuote.findFirst.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(notifyOrderStatus({ id: 'o5', orderNumber: 10, source: 'MARKETPLACE', restaurantId: 'r1' }, 'CONFIRMED')).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
