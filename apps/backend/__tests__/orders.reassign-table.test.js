'use strict';

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    order: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    table: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  };
  return { prisma: { $transaction: jest.fn(async fn => fn(tx)), __tx: tx } };
});
jest.mock('../src/lib/audit-logger', () => ({
  AUDIT_EVENTS: { TABLE_REASSIGNED: 'TABLE_REASSIGNED' },
  record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'employee-1', restaurantId: 'r1', role: req.get('x-test-role') || 'WAITER' };
    req.locationId = req.get('x-test-location') || 'loc1';
    next();
  },
  requireTenantAccess: (_req, _res, next) => next(),
  requireAdmin: (_req, _res, next) => next(),
  requireRole: (...roles) => (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Rol no autorizado' }),
  requirePermission: () => (_req, _res, next) => next(),
  userHasPermission: () => true,
  hasValidOverride: () => false,
}));
jest.mock('../src/middleware/shift.middleware', () => ({
  requireActiveShift: (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const audit = require('../src/lib/audit-logger');
const routes = require('../src/routes/orders.routes');
const tx = prisma.__tx;
const emit = jest.fn();
const to = jest.fn(() => ({ emit }));
const app = express();
app.set('io', { to });
app.use(express.json());
app.use('/api/orders', routes);
let source;
const target = { id: 't2', name: 'Terraza 2', locationId: 'loc1', isActive: true, status: 'AVAILABLE' };
const move = () => request(app).patch('/api/orders/o1/table').send({ fromTableId: 't1', tableId: 't2' });

beforeEach(() => {
  jest.clearAllMocks();
  source = {
    id: 'o1', restaurantId: 'r1', locationId: 'loc1', orderType: 'DINE_IN',
    tableId: 't1', tableNumber: 1, table: { id: 't1', name: 'Mesa 1' },
    orderNumber: 'TPV-001', status: 'PREPARING', paymentStatus: 'PENDING',
    awaitingTableConfirmation: false,
    total: 150, subtotal: 170, discount: 20,
    items: [{ id: 'item-1', quantity: 2, roundId: 'round-1' }],
    rounds: [{ id: 'round-1', roundNumber: 1 }, { id: 'round-2', roundNumber: 2 }],
  };
  prisma.$transaction.mockImplementation(async fn => fn(tx));
  tx.order.findFirst.mockImplementation(async ({ where }) => where.id ? source : null);
  tx.order.findUnique.mockImplementation(async () => source);
  tx.table.findFirst.mockResolvedValue(target);
  tx.table.updateMany.mockResolvedValue({ count: 1 });
  tx.table.update.mockResolvedValue({});
  tx.order.update.mockImplementation(async ({ data }) => ({ ...source, ...data, table: target }));
  audit.record.mockResolvedValue({ id: 'audit-1' });
});

test.each(['WAITER', 'CASHIER', 'ADMIN', 'OWNER', 'MANAGER', 'SUPER_ADMIN'])('%s puede mover la misma cuenta sin cambiar productos, rondas ni importes', async role => {
  const res = await request(app).patch('/api/orders/o1/table').set('x-test-role', role)
    .send({ fromTableId: 't1', tableId: 't2' }).expect(200);
  expect(res.body).toMatchObject({
    id: source.id, orderNumber: source.orderNumber, tableId: 't2', tableNumber: null,
    status: source.status, total: 150, subtotal: 170, discount: 20,
    items: source.items, rounds: source.rounds,
  });
  expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({
    data: { tableId: 't2', tableNumber: null },
  }));
  expect(tx.table.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'AVAILABLE' } });
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  expect(audit.record).toHaveBeenCalledWith(expect.anything(), 'TABLE_REASSIGNED', expect.objectContaining({
    before: { tableId: 't1', tableName: 'Mesa 1' }, after: { tableId: 't2', tableName: 'Terraza 2' },
  }), tx);
  expect(to).toHaveBeenCalledWith('restaurant:r1:location:loc1:admins');
  expect(emit).toHaveBeenCalledWith('order:updated', res.body);
});

test('mantiene ocupada la mesa anterior si queda otra cuenta abierta', async () => {
  tx.order.findFirst.mockImplementation(async ({ where }) =>
    where.id ? source : where.tableId === 't1' ? { id: 'split-order' } : null);
  await move().expect(200);
  expect(tx.table.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'OCCUPIED' } });
});

test('rechaza el traslado de un pedido retenido antes de reservar el destino', async () => {
  source.awaitingTableConfirmation = true;
  const res = await move().expect(409);
  expect(res.body).toEqual({ code: 'TABLE_CONFIRMATION_PENDING', error: 'Confirma o rechaza primero el pedido de mesa' });
  expect(tx.table.updateMany).not.toHaveBeenCalled();
  expect(tx.order.update).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
});

test('un pedido QR retenido bloquea el destino aunque la mesa figure libre', async () => {
  tx.order.findFirst.mockImplementation(async ({ where }) => where.id ? source :
    where.tableId === 't2' ? { id: 'held-order', awaitingTableConfirmation: true } : null);
  await move().expect(409);
  expect(tx.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { tableId: 't2', status: { in: expect.any(Array) }, paymentStatus: { not: 'PAID' } },
  }));
  expect(tx.order.update).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
});

test('libera el origen cuando solo queda un pedido QR retenido', async () => {
  tx.order.findFirst.mockImplementation(async ({ where }) => where.id ? source :
    where.tableId === 't1' && where.awaitingTableConfirmation !== false ? { id: 'held-order' } : null);
  await move().expect(200);
  expect(tx.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ tableId: 't1', awaitingTableConfirmation: false }),
  }));
  expect(tx.table.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'AVAILABLE' } });
  expect(emit.mock.calls.map(([event]) => event)).toEqual(['order:updated']);
});

test.each(['KITCHEN', 'DELIVERY', 'CUSTOMER'])('rechaza el rol %s antes de tocar la base de datos', async role => {
  await request(app).patch('/api/orders/o1/table').set('x-test-role', role)
    .send({ fromTableId: 't1', tableId: 't2' }).expect(403);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test.each([{}, { tableId: 't2' }, { fromTableId: 't1', tableId: 2 }])('valida el destino y el origen: %j', async body => {
  await request(app).patch('/api/orders/o1/table').send(body).expect(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test('limita la búsqueda de cuenta y mesa a la sucursal autenticada', async () => {
  tx.order.findFirst.mockResolvedValue(null);
  await move().expect(404);
  expect(tx.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'o1', restaurantId: 'r1', locationId: 'loc1' },
  }));
  expect(tx.order.update).not.toHaveBeenCalled();
});

test('rechaza una mesa inexistente, inactiva o de otra sucursal', async () => {
  tx.table.findFirst.mockResolvedValue(null);
  await move().expect(404);
  expect(tx.table.findFirst).toHaveBeenCalledWith({
    where: { id: 't2', locationId: 'loc1', isActive: true },
  });
  expect(tx.order.update).not.toHaveBeenCalled();
});

test.each([
  { paymentStatus: 'PAID' }, { status: 'CANCELLED' }, { status: 'DELIVERED' },
])('rechaza cuentas pagadas o cerradas: %j', async patch => {
  Object.assign(source, patch);
  await move().expect(409);
  expect(tx.table.updateMany).not.toHaveBeenCalled();
});

test('rechaza una cuenta sin mesa', async () => {
  source.tableId = null;
  await move().expect(400);
  expect(tx.table.updateMany).not.toHaveBeenCalled();
});

test('rechaza la selección antigua si otro empleado ya movió la cuenta', async () => {
  source.tableId = 't3';
  await move().expect(409);
  expect(tx.table.updateMany).not.toHaveBeenCalled();
});

test('no altera una cuenta que ya quedó en el destino al reintentar', async () => {
  source.tableId = 't2';
  await move().expect(200);
  expect(tx.order.update).not.toHaveBeenCalled();
  expect(audit.record).not.toHaveBeenCalled();
});

test('rechaza una mesa sucia u ocupada por otra reserva simultánea', async () => {
  tx.table.updateMany.mockResolvedValue({ count: 0 });
  await move().expect(409);
  expect(tx.order.update).not.toHaveBeenCalled();
});

test('una cuenta activa bloquea el destino aunque su status figure libre', async () => {
  tx.order.findFirst.mockImplementation(async ({ where }) => where.id ? source : { id: 'occupied-order' });
  await move().expect(409);
  expect(tx.order.update).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
});

test('un conflicto de serialización pide actualizar sin anunciar un cambio', async () => {
  prisma.$transaction.mockRejectedValue(Object.assign(new Error('conflict'), { code: 'P2034' }));
  const res = await move().expect(409);
  expect(res.body.error).toMatch(/actualiza/i);
  expect(emit).not.toHaveBeenCalled();
});

test('si falla la auditoría, no se anuncia éxito', async () => {
  audit.record.mockRejectedValue(new Error('audit failed'));
  await move().expect(500);
  expect(emit).not.toHaveBeenCalled();
});
