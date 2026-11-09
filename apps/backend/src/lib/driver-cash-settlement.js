'use strict';

const { consumePaidOrder } = require('../services/order-inventory.service');

function cashConflict(message) {
  return Object.assign(new Error(message), { status: 409, code: 'DRIVER_CASH_CONFLICT' });
}

// Both cash-closing paths use the same transaction and retry serialization
// conflicts. A concurrent confirmation/cut must never settle the same cash twice.
async function cashTransaction(prisma, work) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: 'Serializable', maxWait: 5000, timeout: 30000,
      });
    } catch (error) {
      if (error.code !== 'P2034' || attempt >= 2) throw error;
    }
  }
}

async function cutDriverCash(tx, driver, { restaurantId, shiftId, at = new Date(), notes = null }) {
  const movements = await tx.driverCashMovement.findMany({
    where: { driverId: driver.id, approved: false },
  });
  if (movements.length === 0) return null;

  const deliveryAmounts = new Map();
  for (const movement of movements) {
    if (movement.type === 'INCOME' && movement.category === 'DELIVERY' && movement.orderId) {
      deliveryAmounts.set(movement.orderId,
        (deliveryAmounts.get(movement.orderId) || 0) + Number(movement.amount));
    }
  }
  if (deliveryAmounts.size) {
    if (!restaurantId || !shiftId) throw cashConflict('Abre un turno de caja antes de liquidar los pedidos.');
    const orders = await tx.order.findMany({
      where: {
        id: { in: [...deliveryAmounts.keys()] }, restaurantId,
        locationId: driver.locationId, deliveryDriverId: driver.id,
      },
    });
    if (orders.length !== deliveryAmounts.size) {
      throw cashConflict('Hay cobros que no corresponden a los pedidos de este repartidor.');
    }
    for (const order of orders) {
      // Cash already confirmed by the cashier keeps its original date/shift.
      if (order.paymentStatus === 'PAID' && order.paidAt) continue;
      if (order.status !== 'DELIVERED' || !['CASH', 'CASH_ON_DELIVERY'].includes(order.paymentMethod)
        || Math.abs(deliveryAmounts.get(order.id) - Number(order.total)) > 0.01) {
        throw cashConflict(`Revisa el cobro del pedido ${order.orderNumber}: no coincide con el efectivo a liquidar.`);
      }
      const claimed = await tx.order.updateMany({
        where: {
          id: order.id, restaurantId, status: 'DELIVERED',
          paymentStatus: { not: 'PAID' }, paidAt: null,
        },
        data: {
          paymentStatus: 'PAID', paidAt: at, shiftId,
          cashCollected: true, cashCollectedAt: at,
        },
      });
      if (claimed.count !== 1) throw cashConflict('El cobro cambió durante el corte. Actualiza e intenta de nuevo.');
      await consumePaidOrder(tx, order.id, restaurantId);
    }
  }

  const sum = (type) => movements.filter((m) => m.type === type)
    .reduce((total, m) => total + Number(m.amount), 0);
  const cut = await tx.driverCashCut.create({
    data: {
      driverId: driver.id, driverName: driver.name || 'Repartidor',
      totalFloat: sum('FLOAT'), totalIncome: sum('INCOME'),
      totalExpense: sum('EXPENSE'), totalReturn: sum('RETURN'),
      balance: sum('FLOAT') + sum('INCOME') - sum('EXPENSE') - sum('RETURN'),
      movements: movements.length, notes,
    },
  });
  const approved = await tx.driverCashMovement.updateMany({
    where: { id: { in: movements.map((m) => m.id) }, driverId: driver.id, approved: false },
    data: { approved: true, approvedAt: at },
  });
  if (approved.count !== movements.length) throw cashConflict('Estos movimientos ya se liquidaron en otro corte.');
  await tx.driverShiftRequest.updateMany({
    where: { driverId: driver.id, status: 'PENDING' },
    data: { status: 'RESOLVED', resolvedAt: at },
  });
  return cut;
}

// Legacy cuts approved their movements without settling the linked orders.
// A late confirmation must recover that settlement, never book it as new cash.
async function previousDriverSettlement(tx, order) {
  if (!order.deliveryDriverId) return null;
  const movement = await tx.driverCashMovement.findFirst({
    where: {
      driverId: order.deliveryDriverId, orderId: order.id,
      type: 'INCOME', category: 'DELIVERY', approved: true,
    },
    orderBy: { approvedAt: 'asc' },
  });
  if (!movement) return null;
  if (!movement.approvedAt || Math.abs(Number(movement.amount) - Number(order.total)) > 0.01) {
    throw cashConflict('Este pedido ya tiene un corte anterior. Revisa su liquidación antes de modificarlo.');
  }
  const shift = await tx.cashShift.findFirst({
    where: {
      locationId: order.locationId, openedAt: { lte: movement.approvedAt },
      OR: [{ closedAt: null }, { closedAt: { gte: movement.approvedAt } }],
    },
    orderBy: { openedAt: 'desc' }, select: { id: true },
  });
  if (!shift) throw cashConflict('No se encontró el turno del corte anterior de este pedido.');
  return { at: movement.approvedAt, shiftId: shift.id };
}

module.exports = { cashTransaction, cutDriverCash, previousDriverSettlement, cashConflict };
