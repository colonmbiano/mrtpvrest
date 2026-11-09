'use strict';
jest.mock('@mrtpvrest/database', () => ({ prisma: {} }));
jest.mock('../src/lib/audit-logger', () => ({
  AUDIT_EVENTS: { PAYMENT_VERIFY: 'PAYMENT_VERIFY' }, record: jest.fn(async () => {}),
}));
const { assertOpenPaymentPeriod, digitalPaymentEntries, verifyOrderPayment, shiftControlSummary } = require('../src/lib/cash-control');
const audit = require('../src/lib/audit-logger');
const order = { id: 'o1', restaurantId: 'r1', locationId: 'l1', shiftId: 's1',
  paidAt: new Date('2026-11-08T02:00:00Z'), paymentStatus: 'PAID', total: 300,
  paymentMethod: 'MIXED', deliveryDriverId: 'd1', payments: [
    { method: 'CASH', amount: 100, status: 'PAID' },
    { method: 'TRANSFER', amount: 150, status: 'PAID' },
    { method: 'CARD', amount: 50, status: 'PAID' },
    { method: 'TRANSFER', amount: 999, status: 'REFUNDED' },
  ] };
let tx;
beforeEach(() => {
  jest.clearAllMocks();
  tx = { cashShift: { findFirst: jest.fn(async () => null) },
    driverCashMovement: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    order: { update: jest.fn(async ({ data }) => ({ ...order, ...data })), findMany: jest.fn(async () => []) },
    employee: { findMany: jest.fn(async () => [{ id: 'd1', name: 'Polo' }]) } };
});
test('no consulta ni cambia pedidos de otro restaurante', async () => {
  await expect(assertOpenPaymentPeriod(tx, order, 'otro')).rejects.toMatchObject({ status: 404 });
  expect(tx.cashShift.findFirst).not.toHaveBeenCalled();
});
test('un turno cerrado bloquea el cobro incluso cuando shiftId viene vacío', async () => {
  tx.cashShift.findFirst.mockResolvedValue({ id: 's1' });
  await expect(assertOpenPaymentPeriod(tx, { ...order, shiftId: null }, 'r1')).rejects.toMatchObject({ code: 'CLOSED_SHIFT_LOCKED' });
  expect(tx.cashShift.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
    locationId: 'l1', isOpen: false, OR: [{ openedAt: { lte: order.paidAt }, closedAt: { gte: order.paidAt } }],
  }) }));
  expect(tx.order.update).not.toHaveBeenCalled();
});
test('un corte de repartidor cerrado protege el pedido aunque siga abierta la caja', async () => {
  tx.driverCashMovement.findFirst.mockResolvedValue({ id: 'm1' });
  await expect(assertOpenPaymentPeriod(tx, order, 'r1')).rejects.toMatchObject({ code: 'CLOSED_DRIVER_CUT_LOCKED' });
});
test('conciliación mixta separa importes bancarios y excluye efectivo y reembolsos', () => {
  expect(digitalPaymentEntries(order).map(({ method, amount, verified }) => ({ method, amount, verified })))
    .toEqual([{ method: 'TRANSFER', amount: 150, verified: false }, { method: 'CARD', amount: 50, verified: false }]);
});
test('referencia obligatoria y pago real antes de verificar', async () => {
  await expect(verifyOrderPayment(tx, order, { method: 'CARD' }, {})).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
  await expect(verifyOrderPayment(tx, { ...order, paymentStatus: 'PENDING' }, { reference: 'BANCO123' }, {}))
    .rejects.toMatchObject({ code: 'PAYMENT_NOT_PAID' });
  expect(tx.order.update).not.toHaveBeenCalled();
});
test('verificación guarda referencia y actor sin cambiar ventas ni efectivo; auditoría comparte tx', async () => {
  const req = { user: { id: 'owner', name: 'Alex' } };
  await verifyOrderPayment(tx, order, { method: 'CARD', reference: 'TERM-12345' }, req);
  expect(tx.order.update).toHaveBeenCalledWith({ where: { id: 'o1', restaurantId: 'r1', paymentStatus: 'PAID' },
    data: { cardVerified: true, cardVerifiedAt: expect.any(Date), cardVerifiedBy: 'Alex', cardVerificationReference: 'TERM-12345' } });
  expect(audit.record).toHaveBeenCalledWith(req, 'PAYMENT_VERIFY', expect.objectContaining({ after: expect.objectContaining({ amount: 50 }) }), tx);
  await expect(verifyOrderPayment(tx, order, { method: 'CARD', verified: false }, req)).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
});
test('un fallo de auditoría impide confirmar la verificación', async () => {
  audit.record.mockRejectedValueOnce(new Error('audit unavailable'));
  await expect(verifyOrderPayment(tx, order, { method: 'TRANSFER', reference: 'SPEI-12345' }, { user: { id: 'u1' } }))
    .rejects.toThrow('audit unavailable');
});
test('precierre no inventa efectivo contado y muestra todos los pendientes', async () => {
  const expense = { id: 'e1', driverId: 'd1', type: 'EXPENSE', amount: 50, photoUrl: null, receiptStatus: 'PENDING' };
  tx.driverCashMovement.findMany.mockImplementation(async ({ where }) => where.type ? [expense]
    : [{ id: 'f1', driverId: 'd1', type: 'FLOAT', amount: 100 }, expense]);
  tx.order.findMany.mockResolvedValue([{ ...order, orderType: 'DELIVERY', status: 'DELIVERED', deliveryDriverId: null },
    { id: 'unpaid', paymentStatus: 'PENDING', status: 'OPEN', total: 80, orderType: 'DINE_IN' }]);
  const summary = await shiftControlSummary(tx, { id: 's1', locationId: 'l1', openedAt: new Date('2026-11-07T21:00:00Z') }, 'r1');
  expect(summary.driverReceipts).toEqual([{ driverId: 'd1', name: 'Polo', expectedCash: 50, movements: 2 }]);
  expect(summary.warnings.map(w => w.code)).toEqual(['UNVERIFIED_PAYMENTS', 'UNASSIGNED_DELIVERIES', 'UNPAID_ORDERS', 'MISSING_RECEIPTS']);
  expect(tx.order.findMany.mock.calls[0][0].where).toMatchObject({ restaurantId: 'r1', locationId: 'l1' });
});
