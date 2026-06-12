'use strict';

// Tests de idempotencia de los webhooks de pago del kiosko:
//  - Solo el PRIMER webhook que marca PAID emite sockets (el TPV auto-imprime
//    con order:paid — un duplicado sería doble ticket).
//  - Un evento no-PAID tardío nunca degrada una orden ya pagada.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    order: { findUnique: jest.fn(), updateMany: jest.fn() },
    integrationConfig: { findFirst: jest.fn() },
  },
}));

jest.mock('../src/lib/payment-providers', () => ({
  getProviderForRestaurant: jest.fn(),
  instantiateFromIntegration: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const { getProviderForRestaurant } = require('../src/lib/payment-providers');

const emit = jest.fn();
const io = { to: jest.fn(() => ({ emit })) };

function buildApp() {
  const app = express();
  app.set('io', io);
  app.use(express.json());
  app.use('/api/kiosk/webhook', require('../src/routes/kiosk-webhook.routes'));
  return app;
}

const stripeEvent = {
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_1', client_reference_id: 'o1', payment_intent: 'pi_1' } },
};

describe('POST /api/kiosk/webhook/stripe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', restaurantId: 'r1', status: 'PENDING', paymentStatus: 'PENDING' });
    getProviderForRestaurant.mockResolvedValue({
      getPayment: jest.fn().mockResolvedValue({
        status: 'PAID', rawStatus: 'succeeded', providerId: 'pi_1', externalReference: 'o1',
      }),
    });
  });

  it('marca PAID con guard condicional y emite sockets la primera vez', async () => {
    prisma.order.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(buildApp()).post('/api/kiosk/webhook/stripe').send(stripeEvent);

    expect(res.status).toBe(200);
    expect(prisma.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'o1', paymentStatus: { not: 'PAID' } },
      data: expect.objectContaining({ paymentStatus: 'PAID', status: 'CONFIRMED' }),
    }));
    expect(io.to).toHaveBeenCalledWith('restaurant:r1');
    expect(emit).toHaveBeenCalledWith('order:paid', { orderId: 'o1', source: 'KIOSK' });
    expect(emit).toHaveBeenCalledWith('new:order', { orderId: 'o1', source: 'KIOSK' });
  });

  it('webhook duplicado: la orden ya estaba PAID → no re-emite sockets', async () => {
    prisma.order.updateMany.mockResolvedValue({ count: 0 }); // el guard no matcheó

    const res = await request(buildApp()).post('/api/kiosk/webhook/stripe').send(stripeEvent);

    expect(res.status).toBe(200);
    expect(emit).not.toHaveBeenCalled();
  });

  it('un FAILED tardío nunca degrada una orden pagada (guard en el WHERE)', async () => {
    getProviderForRestaurant.mockResolvedValue({
      getPayment: jest.fn().mockResolvedValue({
        status: 'FAILED', rawStatus: 'payment_failed', providerId: 'pi_1', externalReference: 'o1',
      }),
    });
    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(buildApp())
      .post('/api/kiosk/webhook/stripe')
      .send({ ...stripeEvent, type: 'payment_intent.payment_failed' });

    expect(res.status).toBe(200);
    // El update va condicionado a no-PAID y nunca toca order.status ni paidAt.
    expect(prisma.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'o1', paymentStatus: { not: 'PAID' } },
      data: expect.not.objectContaining({ status: expect.anything() }),
    }));
    expect(emit).not.toHaveBeenCalled();
  });

  it('ignora pagos cuyo externalReference no coincide con la orden', async () => {
    getProviderForRestaurant.mockResolvedValue({
      getPayment: jest.fn().mockResolvedValue({
        status: 'PAID', rawStatus: 'succeeded', providerId: 'pi_1', externalReference: 'OTRA-ORDEN',
      }),
    });

    const res = await request(buildApp()).post('/api/kiosk/webhook/stripe').send(stripeEvent);

    expect(res.status).toBe(200);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
