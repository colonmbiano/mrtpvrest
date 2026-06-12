'use strict';

// Tests del sync de authorized payments de MP (billing SaaS):
//  - Invoice y subscription se escriben en la MISMA $transaction.
//  - El dedupe por externalId actualiza la invoice existente (no duplica).
//  - FAILED marca la suscripción PAST_DUE; estados sin mapeo no la tocan.

jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn(),
  PreApproval: jest.fn(),
}));

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    invoice: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    subscription: { update: jest.fn() },
  };
  return {
    prisma: {
      subscription: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(tx)),
      __tx: tx,
    },
  };
});

const { prisma } = require('@mrtpvrest/database');
const { syncAuthorizedPaymentFromMercadoPago } = require('../src/lib/saas-mercadopago');

const tx = prisma.__tx;

const basePayment = {
  id: 'ap_1',
  preapproval_id: 'pre_1',
  status: 'processed',
  transaction_amount: 499,
  currency_id: 'MXN',
  date_created: '2026-06-12T10:00:00Z',
  debit_date: '2026-06-12T10:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.subscription.findFirst.mockResolvedValue({ id: 'sub_local', priceSnapshot: 499 });
  tx.invoice.findFirst.mockResolvedValue(null);
  tx.invoice.create.mockResolvedValue({ id: 'inv_1' });
  tx.invoice.update.mockResolvedValue({ id: 'inv_1' });
  tx.subscription.update.mockResolvedValue({});
});

describe('syncAuthorizedPaymentFromMercadoPago', () => {
  it('pago aprobado: crea invoice PAID y activa la sub en la misma tx', async () => {
    const invoice = await syncAuthorizedPaymentFromMercadoPago(basePayment);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.invoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ externalId: 'ap_1', status: 'PAID', subscriptionId: 'sub_local' }),
    }));
    expect(tx.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub_local' },
      data: expect.objectContaining({ status: 'ACTIVE' }),
    }));
    expect(invoice).toEqual({ id: 'inv_1' });
  });

  it('replay del mismo pago: actualiza la invoice existente, no crea otra', async () => {
    tx.invoice.findFirst.mockResolvedValue({ id: 'inv_1' });

    await syncAuthorizedPaymentFromMercadoPago(basePayment);

    expect(tx.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'inv_1' } }));
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('pago rechazado: invoice FAILED y sub a PAST_DUE', async () => {
    // El mapeo lee payment.status (anidado), no el status del authorized payment.
    await syncAuthorizedPaymentFromMercadoPago({ ...basePayment, status: 'scheduled', payment: { status: 'rejected' } });

    expect(tx.invoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED', paidAt: null }),
    }));
    expect(tx.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'PAST_DUE' },
    }));
  });

  it('sin subscription local ni preapproval: no toca la BD', async () => {
    prisma.subscription.findFirst.mockResolvedValue(null);

    const out = await syncAuthorizedPaymentFromMercadoPago({ ...basePayment, preapproval_id: null });

    expect(out).toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
