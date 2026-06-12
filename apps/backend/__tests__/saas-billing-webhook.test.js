'use strict';

// Tests del webhook de Stripe para billing SaaS:
//  - Rechaza requests sin firma o con firma inválida (400).
//  - Enruta cada evento soportado a su handler.
//  - Un fallo del handler devuelve 500 para que Stripe reintente con backoff.

jest.mock('../src/lib/saas-stripe', () => ({
  getStripe: jest.fn(),
  verifyWebhook: jest.fn(),
  upsertLocalSubscriptionFromStripe: jest.fn(),
  markSubscriptionCancelled: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const {
  getStripe,
  verifyWebhook,
  upsertLocalSubscriptionFromStripe,
  markSubscriptionCancelled,
} = require('../src/lib/saas-stripe');

function buildApp() {
  const app = express();
  // En producción se monta con express.raw ANTES de express.json (la firma
  // exige body crudo); aquí verifyWebhook está mockeado y eso no aplica.
  app.use('/api/billing/webhook', express.json(), require('../src/routes/saas-billing-webhook.routes'));
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/billing/webhook (Stripe SaaS)', () => {
  it('400 sin header stripe-signature', async () => {
    const res = await request(buildApp()).post('/api/billing/webhook').send({});
    expect(res.status).toBe(400);
    expect(verifyWebhook).not.toHaveBeenCalled();
  });

  it('400 con firma inválida', async () => {
    verifyWebhook.mockImplementation(() => { throw new Error('bad sig'); });
    const res = await request(buildApp())
      .post('/api/billing/webhook')
      .set('stripe-signature', 'sig')
      .send({});
    expect(res.status).toBe(400);
    expect(upsertLocalSubscriptionFromStripe).not.toHaveBeenCalled();
  });

  it('checkout.session.completed: recupera la sub de Stripe y la upserta local', async () => {
    verifyWebhook.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', subscription: 'sub_1', metadata: { tenantId: 't1' } } },
    });
    const retrieve = jest.fn().mockResolvedValue({ id: 'sub_1', metadata: {} });
    getStripe.mockReturnValue({ subscriptions: { retrieve } });

    const res = await request(buildApp())
      .post('/api/billing/webhook')
      .set('stripe-signature', 'sig')
      .send({});

    expect(res.status).toBe(200);
    expect(retrieve).toHaveBeenCalledWith('sub_1');
    // Safety net: propaga el tenantId de la Session al sub si faltaba.
    expect(upsertLocalSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ tenantId: 't1' }) }),
    );
  });

  it('customer.subscription.updated → upsert; deleted → cancelación', async () => {
    verifyWebhook.mockReturnValue({ type: 'customer.subscription.updated', data: { object: { id: 'sub_2' } } });
    await request(buildApp()).post('/api/billing/webhook').set('stripe-signature', 'sig').send({});
    expect(upsertLocalSubscriptionFromStripe).toHaveBeenCalledWith({ id: 'sub_2' });

    verifyWebhook.mockReturnValue({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_3' } } });
    await request(buildApp()).post('/api/billing/webhook').set('stripe-signature', 'sig').send({});
    expect(markSubscriptionCancelled).toHaveBeenCalledWith({ id: 'sub_3' });
  });

  it('evento no soportado se ignora con 200 (sin tocar la BD)', async () => {
    verifyWebhook.mockReturnValue({ type: 'invoice.paid', data: { object: {} } });
    const res = await request(buildApp()).post('/api/billing/webhook').set('stripe-signature', 'sig').send({});
    expect(res.status).toBe(200);
    expect(upsertLocalSubscriptionFromStripe).not.toHaveBeenCalled();
    expect(markSubscriptionCancelled).not.toHaveBeenCalled();
  });

  it('fallo del handler → 500 para que Stripe reintente', async () => {
    verifyWebhook.mockReturnValue({ type: 'customer.subscription.updated', data: { object: { id: 'sub_4' } } });
    upsertLocalSubscriptionFromStripe.mockRejectedValue(new Error('db down'));
    const res = await request(buildApp()).post('/api/billing/webhook').set('stripe-signature', 'sig').send({});
    expect(res.status).toBe(500);
  });
});
