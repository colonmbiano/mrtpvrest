jest.mock('../src/lib/audit-logger', () => ({ ...jest.requireActual('../src/lib/audit-logger'), record: jest.fn(async () => {}) }));
'use strict';

// C1: cancelar un pedido del Mercadito. Roles por estado y reembolso total del pago en línea,
// reservado en la misma transacción que la cancelación y asentado después del commit.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    $transaction: jest.fn(async (fn) => fn(require('@mrtpvrest/database').prisma)),
    order: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    table: { update: jest.fn() },
    cashShift: { findFirst: jest.fn().mockResolvedValue(null) },
    driverCashMovement: { findFirst: jest.fn().mockResolvedValue(null) },
    stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

const mockFinance = { reserveCancellationRefund: jest.fn(), completeRefund: jest.fn() };
jest.mock('../src/lib/marketplace-settlements-prisma', () => ({
  createMarketplaceSettlementsPrisma: () => mockFinance,
}));

let mockRole = 'CASHIER';
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', restaurantId: 'r1', tenantId: 't1', role: mockRole };
    req.restaurantId = 'r1';
    req.locationId = 'l1';
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
  requirePermission: () => (_req, _res, next) => next(),
  userHasPermission: () => true,
  hasValidOverride: () => false,
}));
jest.mock('../src/middleware/shift.middleware', () => ({ requireActiveShift: (_req, _res, next) => next() }));
jest.mock('../src/services/notifications.service', () => ({ notifyOrderStatus: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/lib/print-claim', () => ({ claimKitchenPrint: jest.fn(), releaseKitchenPrint: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const ordersRoutes = require('../src/routes/orders.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', ordersRoutes);
  return app;
}

const REASON = 'El comercio no tiene el producto';
const paid = (status) => ({ id: 'o1', restaurantId: 'r1', locationId: 'l1', source: 'MARKETPLACE', orderType: 'DELIVERY',
  status, paymentStatus: 'PAID', paymentProvider: 'MERCADOPAGO', paymentProviderId: '555', total: 130 });
const cash = (status) => ({ ...paid(status), paymentStatus: 'PENDING', paymentProvider: null, paymentProviderId: null });
// La ruta lee la orden dos veces: antes de validar y dentro de la transacción.
function orderReads(first, fresh = first) {
  prisma.order.findFirst.mockResolvedValueOnce(first).mockResolvedValueOnce(fresh);
  prisma.order.update.mockImplementation(async ({ data }) => ({ ...fresh, ...data }));
}
const cancel = () => request(makeApp()).put('/api/orders/o1/status').send({ status: 'CANCELLED', reason: REASON });

beforeEach(() => {
  jest.clearAllMocks();
  // Las lecturas encoladas de una prueba que respondió antes de la TX no pasan a la siguiente.
  prisma.order.findFirst.mockReset();
  prisma.order.update.mockReset();
  mockRole = 'CASHIER';
  mockFinance.reserveCancellationRefund.mockResolvedValue({ id: 'rf1', orderId: 'o1', amountCents: 13000, status: 'PENDING' });
  mockFinance.completeRefund.mockResolvedValue({ refundId: 'rf1', status: 'POSTED', amountCents: 13000 });
});

describe('PUT /api/orders/:id/status → CANCELLED en pedidos del Mercadito', () => {
  it.each(['WAITER', 'KITCHEN'])('%s no cancela un pedido del Mercadito', async (role) => {
    mockRole = role;
    orderReads(paid('PENDING_MERCHANT'));
    const res = await cancel();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MARKETPLACE_CANCEL_FORBIDDEN');
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(mockFinance.reserveCancellationRefund).not.toHaveBeenCalled();
  });

  it('la caja rechaza un pedido pagado por aceptar y se reembolsa completo', async () => {
    orderReads(paid('PENDING_MERCHANT'));
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.refund).toEqual({ refundId: 'rf1', status: 'POSTED', amountCents: 13000 });
    expect(mockFinance.reserveCancellationRefund).toHaveBeenCalledWith(prisma,
      { orderId: 'o1', restaurantId: 'r1', actorId: 'staff-u1', reason: REASON });
    // La reserva va antes de cancelar (misma TX) y Mercado Pago después.
    const reserveOrder = mockFinance.reserveCancellationRefund.mock.invocationCallOrder[0];
    expect(reserveOrder).toBeLessThan(prisma.order.update.mock.invocationCallOrder[0]);
    expect(mockFinance.completeRefund.mock.invocationCallOrder[0]).toBeGreaterThan(prisma.order.update.mock.invocationCallOrder[0]);
    // El dinero está en Mercado Pago: no se consulta el corte de caja.
    expect(prisma.cashShift.findFirst).not.toHaveBeenCalled();
  });

  it('la caja no cancela un pedido ya aceptado y pagado en línea', async () => {
    orderReads(paid('CONFIRMED'));
    const res = await cancel();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MARKETPLACE_CANCEL_REQUIRES_MANAGER');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('un gerente cancela un pedido aceptado y pagado en línea, con reembolso', async () => {
    mockRole = 'MANAGER';
    orderReads(paid('READY'));
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(res.body.refund.status).toBe('POSTED');
  });

  it('si otra caja lo aceptó mientras tanto, se vuelve a validar dentro de la transacción', async () => {
    orderReads(paid('PENDING_MERCHANT'), paid('CONFIRMED'));
    const res = await cancel();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MARKETPLACE_CANCEL_REQUIRES_MANAGER');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('si no se puede reservar el reembolso, la orden no se cancela', async () => {
    orderReads(paid('PENDING_MERCHANT'));
    mockFinance.reserveCancellationRefund.mockRejectedValue(Object.assign(new Error('Hay un reembolso pendiente de conciliacion'),
      { code: 'REFUND_IN_PROGRESS', statusCode: 409 }));
    const res = await cancel();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('REFUND_IN_PROGRESS');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('si Mercado Pago falla después, la orden queda cancelada y el reembolso pendiente', async () => {
    orderReads(paid('PENDING_MERCHANT'));
    mockFinance.completeRefund.mockRejectedValue(Object.assign(new Error('down'), { code: 'PROVIDER_REFUND_PENDING' }));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await cancel();
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.refund).toEqual({ status: 'PENDING', amountCents: 13000, refundId: 'rf1', errorCode: 'PROVIDER_REFUND_PENDING' });
  });

  it('un pedido en efectivo aceptado lo cancela la caja sin reembolso', async () => {
    orderReads(cash('CONFIRMED'));
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(res.body.refund).toBeUndefined();
    expect(mockFinance.reserveCancellationRefund).not.toHaveBeenCalled();
  });

  it('los pedidos que no son del Mercadito no cambian: un mesero sigue cancelando', async () => {
    mockRole = 'WAITER';
    orderReads({ ...cash('PENDING'), source: 'TPV', orderType: 'TAKEOUT' });
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(mockFinance.reserveCancellationRefund).not.toHaveBeenCalled();
  });
});
