'use strict';

// Barrido de mesas con pedido de QR nunca aceptado (staleTableOrders.job).
//
// Cubre lo que hace peligroso a un job que cancela órdenes: que solo toque las
// que debe, que no pise a caja si acepta el pedido en el mismo instante, y que
// no libere una mesa que ya tiene otra cuenta viva encima.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    order: { findMany: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
    table: { update: jest.fn() },
  },
}));

jest.mock('node-cron', () => ({ schedule: jest.fn(() => ({ stop: jest.fn() })) }));

jest.mock('../src/routes/orders.routes', () => ({
  restoreInventoryForCancelledOrder: jest.fn().mockResolvedValue(undefined),
}));

const cron = require('node-cron');
const { prisma } = require('@mrtpvrest/database');
const { restoreInventoryForCancelledOrder } = require('../src/routes/orders.routes');
const {
  runStaleTableOrdersJob,
  startStaleTableOrdersJob,
} = require('../src/jobs/staleTableOrders.job');

const STALE_ORDER = {
  id: 'o-vieja',
  orderNumber: 3001,
  notes: 'Sin cebolla',
  restaurantId: 'r1',
  locationId: 'loc1',
  tableId: 't5',
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.TABLE_PENDING_TTL_MIN;
  prisma.order.findMany.mockResolvedValue([]);
  prisma.order.updateMany.mockResolvedValue({ count: 1 });
  prisma.order.findFirst.mockResolvedValue(null);
  prisma.table.update.mockResolvedValue({ id: 't5', status: 'AVAILABLE' });
});

describe('runStaleTableOrdersJob', () => {
  it('cancela el pedido rezagado, repone stock y libera la mesa', async () => {
    prisma.order.findMany.mockResolvedValue([STALE_ORDER]);

    const res = await runStaleTableOrdersJob();

    expect(res).toEqual({ cancelled: 1, released: 1, skipped: 0 });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o-vieja', status: 'PENDING', paymentStatus: { not: 'PAID' } },
      data: expect.objectContaining({ status: 'CANCELLED' }),
    });
    // La nota original se conserva y se le anexa el motivo.
    expect(prisma.order.updateMany.mock.calls[0][0].data.notes).toMatch(/^Sin cebolla — /);
    expect(restoreInventoryForCancelledOrder).toHaveBeenCalledWith(prisma, 'o-vieja');
    expect(prisma.table.update).toHaveBeenCalledWith({
      where: { id: 't5' },
      data: { status: 'AVAILABLE' },
    });
  });

  it('solo mira PENDING de mesa, sin pagar y de canales remotos', async () => {
    await runStaleTableOrdersJob();

    const where = prisma.order.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      status: 'PENDING',
      orderType: 'DINE_IN',
      tableId: { not: null },
      paymentStatus: { not: 'PAID' },
      source: { in: ['ONLINE', 'KIOSK', 'WHATSAPP'] },
    });
    // createdAt Y updatedAt: cualquier actividad sobre la cuenta reinicia el reloj.
    expect(where.createdAt.lt).toBeInstanceOf(Date);
    expect(where.updatedAt.lt).toEqual(where.createdAt.lt);
  });

  it('si caja acepta el pedido en el mismo instante, gana caja', async () => {
    prisma.order.findMany.mockResolvedValue([STALE_ORDER]);
    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    const res = await runStaleTableOrdersJob();

    expect(res).toEqual({ cancelled: 0, released: 0, skipped: 1 });
    expect(restoreInventoryForCancelledOrder).not.toHaveBeenCalled();
    expect(prisma.table.update).not.toHaveBeenCalled();
  });

  it('no libera la mesa si quedó otra cuenta viva encima', async () => {
    prisma.order.findMany.mockResolvedValue([STALE_ORDER]);
    prisma.order.findFirst.mockResolvedValue({ id: 'otra-cuenta' });

    const res = await runStaleTableOrdersJob();

    expect(res).toEqual({ cancelled: 1, released: 0, skipped: 0 });
    expect(prisma.table.update).not.toHaveBeenCalled();
  });

  it('TTL en 0 → apagado: ni consulta la BD', async () => {
    process.env.TABLE_PENDING_TTL_MIN = '0';

    const res = await runStaleTableOrdersJob();

    expect(res).toEqual({ cancelled: 0, released: 0, skipped: 0 });
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('TTL configurable: mueve el corte', async () => {
    process.env.TABLE_PENDING_TTL_MIN = '30';
    const before = Date.now();

    await runStaleTableOrdersJob();

    const cutoff = prisma.order.findMany.mock.calls[0][0].where.createdAt.lt.getTime();
    expect(cutoff).toBeLessThanOrEqual(before - 30 * 60000);
    expect(cutoff).toBeGreaterThan(before - 31 * 60000);
  });

  it('emite order:updated a caja y cocina de la sucursal', async () => {
    prisma.order.findMany.mockResolvedValue([STALE_ORDER]);
    const emit = jest.fn();
    const io = { to: jest.fn(() => ({ emit })) };

    await runStaleTableOrdersJob(io);

    expect(io.to).toHaveBeenCalledWith('restaurant:r1:location:loc1:admins');
    expect(io.to).toHaveBeenCalledWith('restaurant:r1:location:loc1:kitchen');
    expect(emit).toHaveBeenCalledWith(
      'order:updated',
      expect.objectContaining({ id: 'o-vieja', status: 'CANCELLED', tableId: 't5' }),
    );
  });

  it('un pedido que falla no aborta el resto del barrido', async () => {
    prisma.order.findMany.mockResolvedValue([
      { ...STALE_ORDER, id: 'o-mala' },
      { ...STALE_ORDER, id: 'o-buena' },
    ]);
    prisma.order.updateMany
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockResolvedValueOnce({ count: 1 });

    const res = await runStaleTableOrdersJob();

    expect(res.cancelled).toBe(1);
  });
});

describe('startStaleTableOrdersJob', () => {
  it('registra el cron cada 15 min', () => {
    expect(startStaleTableOrdersJob()).not.toBeNull();
    expect(cron.schedule).toHaveBeenCalledWith('*/15 * * * *', expect.any(Function));
  });

  it('TTL <= 0 → ni registra el cron', () => {
    process.env.TABLE_PENDING_TTL_MIN = '-1';
    expect(startStaleTableOrdersJob()).toBeNull();
    expect(cron.schedule).not.toHaveBeenCalled();
  });
});
