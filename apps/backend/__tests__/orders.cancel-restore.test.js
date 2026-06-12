'use strict';

// Tests de restoreInventoryForCancelledOrder: cancelar una orden repone el
// stock que descontaron sus StockMovements SALE, neteado contra reversiones
// previas (ADJUSTMENT con el mismo ref) para ser idempotente.

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    ingredient: { update: jest.fn() },
    stockMovement: { create: jest.fn() },
  };
  return {
    prisma: {
      stockMovement: { findMany: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(tx)),
      __tx: tx,
    },
  };
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 'u1', restaurantId: 'r1', tenantId: 't1', role: 'ADMIN' }; next(); },
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

const { prisma } = require('@mrtpvrest/database');
const { restoreInventoryForCancelledOrder } = require('../src/routes/orders.routes');

const tx = prisma.__tx;

describe('restoreInventoryForCancelledOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tx.ingredient.update.mockResolvedValue({ id: 'i1', stock: 10, baseUnit: 'G', locationId: 'loc1' });
    tx.stockMovement.create.mockResolvedValue({});
  });

  it('repone el stock descontado por los SALE de la orden', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([
      { ingredientId: 'i1', delta: -200 },
      { ingredientId: 'i1', delta: -50 },
      { ingredientId: 'i2', delta: -30 },
    ]);

    await restoreInventoryForCancelledOrder(prisma, 'o1');

    expect(tx.ingredient.update).toHaveBeenCalledTimes(2);
    expect(tx.ingredient.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'i1' },
      data: { stock: { increment: 250 } },
    }));
    expect(tx.ingredient.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'i2' },
      data: { stock: { increment: 30 } },
    }));
    // Cada reposición deja su StockMovement ADJUSTMENT auditable con el ref de la orden.
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: 'ADJUSTMENT', refType: 'order', refId: 'o1', delta: 250 }),
    }));
  });

  it('es idempotente: una reversión previa netea a cero y no repone de nuevo', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([
      { ingredientId: 'i1', delta: -200 },
      { ingredientId: 'i1', delta: 200 }, // ADJUSTMENT de una cancelación previa
    ]);

    await restoreInventoryForCancelledOrder(prisma, 'o1');

    expect(tx.ingredient.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('no hace nada si la orden nunca descontó inventario', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([]);

    await restoreInventoryForCancelledOrder(prisma, 'o1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
