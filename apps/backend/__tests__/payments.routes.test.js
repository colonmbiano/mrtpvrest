'use strict';

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    order: {
      update: jest.fn(),
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
  prisma.order.update.mockResolvedValue({ id: 'order-7' });
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

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-7' },
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
});
