'use strict';

// Tests de DELETE /api/orders/items/:itemId/modifiers/:modRowId: quitar un solo
// extra de un producto de una orden activa. El precio del item es INCLUSIVO de
// modificadores, así que quitar el extra resta su priceAdd cobrado, recalcula el
// subtotal del item y los totales de la orden. Solo si la orden no está pagada.

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    orderItemModifier: { delete: jest.fn() },
    orderItem: { update: jest.fn(), findMany: jest.fn() },
    order: { update: jest.fn() },
  };
  return {
    prisma: {
      orderItem: { findUnique: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(tx)),
      __tx: tx,
    },
  };
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', name: 'Cajero', restaurantId: 'r1', tenantId: 't1', role: 'CASHIER' };
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

jest.mock('../src/lib/audit-logger', () => ({
  AUDIT_EVENTS: { MODIFIER_VOID: 'MODIFIER_VOID' },
  record: jest.fn().mockResolvedValue(undefined),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const audit = require('../src/lib/audit-logger');
const orderRoutes = require('../src/routes/orders.routes');

const tx = prisma.__tx;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', orderRoutes);
  return app;
}

// Item base: hamburguesa $100 (precio ya incluye Tocino +$20), orden abierta.
function baseItem(overrides = {}) {
  return {
    id: 'it1',
    orderId: 'o1',
    price: 100,
    quantity: 1,
    weightKg: null,
    subtotal: 100,
    roundId: 'rnd1',
    order: {
      id: 'o1', restaurantId: 'r1', locationId: 'loc1',
      status: 'OPEN', paymentStatus: 'PENDING', discount: 0, deliveryFee: 0,
    },
    modifiers: [{ id: 'oim1', name: 'Tocino', priceAdd: 20 }],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  tx.orderItem.update.mockResolvedValue({});
  tx.order.update.mockImplementation(async ({ data }) => ({ id: 'o1', locationId: 'loc1', ...data }));
});

describe('DELETE /api/orders/items/:itemId/modifiers/:modRowId', () => {
  test('quita el extra: resta su priceAdd del precio y recalcula totales', async () => {
    prisma.orderItem.findUnique.mockResolvedValue(baseItem());
    // Tras la actualización el item queda en $80; es el único de la orden.
    tx.orderItem.findMany.mockResolvedValue([{ subtotal: 80 }]);

    await request(makeApp())
      .delete('/api/orders/items/it1/modifiers/oim1')
      .expect(200);

    expect(tx.orderItemModifier.delete).toHaveBeenCalledWith({ where: { id: 'oim1' } });
    expect(tx.orderItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'it1' },
      data: { price: 80, subtotal: 80 },
    }));
    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ subtotal: 80, total: 80 }),
    }));
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      'MODIFIER_VOID',
      expect.objectContaining({ after: expect.objectContaining({ modifier: 'Tocino', removedCharge: 20 }) }),
    );
  });

  test('línea por peso: resta el extra por kg del precio/kg', async () => {
    prisma.orderItem.findUnique.mockResolvedValue(baseItem({
      price: 250, quantity: 1, weightKg: 2, subtotal: 500,
      modifiers: [{ id: 'oim1', name: 'Extra salsa', priceAdd: 50 }],
    }));
    tx.orderItem.findMany.mockResolvedValue([{ subtotal: 400 }]);

    await request(makeApp())
      .delete('/api/orders/items/it1/modifiers/oim1')
      .expect(200);

    // price/kg: 250 − 50 = 200 ; subtotal = 200 × 2kg = 400
    expect(tx.orderItem.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { price: 200, subtotal: 400 },
    }));
  });

  test('400 si la orden ya fue pagada', async () => {
    prisma.orderItem.findUnique.mockResolvedValue(baseItem({
      order: { id: 'o1', restaurantId: 'r1', locationId: 'loc1', status: 'OPEN', paymentStatus: 'PAID', discount: 0, deliveryFee: 0 },
    }));

    await request(makeApp())
      .delete('/api/orders/items/it1/modifiers/oim1')
      .expect(400);

    expect(tx.orderItemModifier.delete).not.toHaveBeenCalled();
  });

  test('404 si el extra no pertenece al producto', async () => {
    prisma.orderItem.findUnique.mockResolvedValue(baseItem());

    await request(makeApp())
      .delete('/api/orders/items/it1/modifiers/NOPE')
      .expect(404);

    expect(tx.orderItemModifier.delete).not.toHaveBeenCalled();
  });

  test('403 si el item es de otro restaurante', async () => {
    prisma.orderItem.findUnique.mockResolvedValue(baseItem({
      order: { id: 'o1', restaurantId: 'OTRO', locationId: 'loc1', status: 'OPEN', paymentStatus: 'PENDING', discount: 0, deliveryFee: 0 },
    }));

    await request(makeApp())
      .delete('/api/orders/items/it1/modifiers/oim1')
      .expect(403);
  });
});
