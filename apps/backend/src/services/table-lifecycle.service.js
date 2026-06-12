'use strict';

async function releaseTableAfterPayment(prisma, orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { tableId: true, orderType: true },
  });
  if (!order?.tableId || order.orderType !== 'DINE_IN') return false;

  await prisma.table.update({
    where: { id: order.tableId },
    data: { status: 'AVAILABLE' },
  });
  return true;
}

module.exports = { releaseTableAfterPayment };
