'use strict';

// Pedidos del marketplace en el TPV: los que esperan al comercio
// (PENDING_MERCHANT) salen en la lista de cuentas abiertas y el cajero los
// acepta (→ CONFIRMED) o rechaza (→ CANCELLED). Los que esperan pago en línea
// (PENDING_PAYMENT) no se muestran ni se pueden mover a mano.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    order: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    table: { update: jest.fn() },
    stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
  },
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

jest.mock('../src/middleware/shift.middleware', () => ({
  requireActiveShift: (_req, _res, next) => next(),
}));

jest.mock('../src/services/notifications.service', () => ({
  notifyOrderStatus: jest.fn().mockResolvedValue(undefined),
}));

// Sin Redis en pruebas: el reclamo de impresión no participa aquí.
jest.mock('../src/lib/print-claim', () => ({ claimKitchenPrint: jest.fn(), releaseKitchenPrint: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const { notifyOrderStatus } = require('../src/services/notifications.service');
const { ACTIVE_ORDER_STATUSES, canTransition } = require('../src/lib/order-status');
const ordersRoutes = require('../src/routes/orders.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', ordersRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'CASHIER';
});

describe('máquina de estados :: pedidos del marketplace', () => {
  it('el comercio acepta o rechaza un pedido que espera su respuesta', () => {
    for (const role of ['CASHIER', 'KITCHEN', 'ADMIN', 'MANAGER']) {
      expect(canTransition('PENDING_MERCHANT', 'CONFIRMED', role)).toBe(true);
      expect(canTransition('PENDING_MERCHANT', 'CANCELLED', role)).toBe(true);
    }
    // Un mesero solo puede cancelar, como en cualquier otro pedido.
    expect(canTransition('PENDING_MERCHANT', 'CONFIRMED', 'WAITER')).toBe(false);
    expect(canTransition('PENDING_MERCHANT', 'CANCELLED', 'WAITER')).toBe(true);
    // Aceptar es el único camino a cocina: no se salta a PREPARING/READY.
    expect(canTransition('PENDING_MERCHANT', 'PREPARING', 'ADMIN')).toBe(false);
    expect(canTransition('PENDING_MERCHANT', 'READY', 'ADMIN')).toBe(false);
  });

  it('nadie mueve a mano un pedido que espera el pago en línea', () => {
    for (const to of ['CONFIRMED', 'PENDING_MERCHANT', 'PREPARING', 'CANCELLED']) {
      expect(canTransition('PENDING_PAYMENT', to, 'SUPER_ADMIN')).toBe(false);
    }
  });

  it('solo los pedidos por aceptar cuentan como activos', () => {
    expect(ACTIVE_ORDER_STATUSES).toContain('PENDING_MERCHANT');
    expect(ACTIVE_ORDER_STATUSES).not.toContain('PENDING_PAYMENT');
  });
});

describe('GET /api/orders/admin?scope=active', () => {
  it('incluye los pedidos del marketplace por aceptar y deja fuera los no pagados', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    const res = await request(makeApp()).get('/api/orders/admin?scope=active');
    expect(res.status).toBe(200);
    const statuses = prisma.order.findMany.mock.calls[0][0].where.status.in;
    expect(statuses).toContain('PENDING_MERCHANT');
    expect(statuses).not.toContain('PENDING_PAYMENT');
  });
});

describe('PUT /api/orders/:id/status', () => {
  const marketplaceOrder = (status) => ({ id: 'o1', status });

  it('aceptar un pedido del marketplace lo confirma y avisa al cliente', async () => {
    prisma.order.findFirst.mockResolvedValue(marketplaceOrder('PENDING_MERCHANT'));
    prisma.order.update.mockResolvedValue({ id: 'o1', status: 'CONFIRMED', restaurantId: 'r1', locationId: 'l1', source: 'MARKETPLACE' });
    const res = await request(makeApp()).put('/api/orders/o1/status').send({ status: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { status: 'CONFIRMED' } });
    expect(notifyOrderStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), 'CONFIRMED');
  });

  it('rechazar un pedido del marketplace lo cancela', async () => {
    prisma.order.findFirst.mockResolvedValue(marketplaceOrder('PENDING_MERCHANT'));
    prisma.order.update.mockResolvedValue({ id: 'o1', status: 'CANCELLED', restaurantId: 'r1', locationId: 'l1', orderType: 'DELIVERY' });
    const res = await request(makeApp()).put('/api/orders/o1/status').send({ status: 'CANCELLED' });
    expect(res.status).toBe(200);
    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { status: 'CANCELLED' } });
  });

  it('no deja confirmar a mano un pedido que espera el pago', async () => {
    mockRole = 'ADMIN';
    prisma.order.findFirst.mockResolvedValue(marketplaceOrder('PENDING_PAYMENT'));
    const res = await request(makeApp()).put('/api/orders/o1/status').send({ status: 'CONFIRMED' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});
