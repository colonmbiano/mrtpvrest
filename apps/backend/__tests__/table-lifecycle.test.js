'use strict';

const { releaseTableAfterPayment } = require('../src/services/table-lifecycle.service');

function makePrisma(order) {
  return {
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
    },
    table: {
      update: jest.fn().mockResolvedValue({ id: order?.tableId, status: 'AVAILABLE' }),
    },
  };
}

describe('table lifecycle', () => {
  it('marca la mesa como limpia y disponible al cobrar una orden de mesa', async () => {
    const prisma = makePrisma({ tableId: 'table-1', orderType: 'DINE_IN' });

    await expect(releaseTableAfterPayment(prisma, 'order-1')).resolves.toBe(true);
    expect(prisma.table.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: { status: 'AVAILABLE' },
    });
  });

  it.each([
    [{ tableId: null, orderType: 'DINE_IN' }],
    [{ tableId: 'table-1', orderType: 'TAKEOUT' }],
    [null],
  ])('no modifica mesas para pedidos que no son de mesa', async (order) => {
    const prisma = makePrisma(order);

    await expect(releaseTableAfterPayment(prisma, 'order-1')).resolves.toBe(false);
    expect(prisma.table.update).not.toHaveBeenCalled();
  });
});
