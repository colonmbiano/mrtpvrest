'use strict';

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    order: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    table: {
      update: jest.fn(),
    },
  },
}));

const mockPaymentGet = jest.fn();

jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn().mockImplementation(() => ({})),
  Preference: jest.fn(),
  Payment: jest.fn().mockImplementation(() => ({ get: mockPaymentGet })),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const paymentRoutes = require('../src/routes/payments.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/payments', paymentRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.MP_WEBHOOK_SECRET;
  mockPaymentGet.mockResolvedValue({
    external_reference: 'order-7',
    status: 'approved',
    payment_type_id: 'credit_card',
  });
  prisma.order.updateMany.mockResolvedValue({ count: 1 });
  prisma.order.findUnique.mockResolvedValue({
    tableId: 'table-7',
    orderType: 'DINE_IN',
  });
  prisma.table.update.mockResolvedValue({ id: 'table-7', status: 'AVAILABLE' });
});

describe('POST /api/payments/webhook', () => {
  test('cierra la orden y libera la mesa cuando Mercado Pago aprueba', async () => {
    await request(makeApp())
      .post('/api/payments/webhook')
      .send({ type: 'payment', data: { id: 'payment-1' } })
      .expect(200);

    // El update es condicional (paymentStatus != PAID) para que los replays
    // at-least-once de MP no re-procesen una orden ya cobrada.
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-7', paymentStatus: { not: 'PAID' } },
      data: expect.objectContaining({
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        paymentMethod: 'CARD',
      }),
    });
    expect(prisma.table.update).toHaveBeenCalledWith({
      where: { id: 'table-7' },
      data: { status: 'AVAILABLE' },
    });
  });

  test('un replay del webhook (orden ya pagada) no libera la mesa de nuevo', async () => {
    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    await request(makeApp())
      .post('/api/payments/webhook')
      .send({ type: 'payment', data: { id: 'payment-1' } })
      .expect(200);

    expect(prisma.table.update).not.toHaveBeenCalled();
  });
});
