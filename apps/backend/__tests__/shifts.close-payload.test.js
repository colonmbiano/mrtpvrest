'use strict';

jest.mock('@mrtpvrest/database', () => ({ prisma: {
  $transaction: jest.fn(), cashShift: { findFirst: jest.fn(), update: jest.fn() },
  employee: { findMany: jest.fn() }, employeeShift: { updateMany: jest.fn() },
  order: { findMany: jest.fn() },
} }));
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (_req, _res, next) => next(),
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
}));
jest.mock('../src/lib/modules', () => ({
  requireModule: () => (_req, _res, next) => next(), MODULES: { MODULE_CASH_SHIFT: 'cash_shift' },
}));
jest.mock('../src/lib/audit-logger', () => ({
  AUDIT_EVENTS: { SHIFT_CLOSE: 'SHIFT_CLOSE' }, record: jest.fn(async () => {}),
}));
jest.mock('../src/lib/cash-cut-mailer', () => ({ sendCashCutEmail: jest.fn(async () => {}) }));
jest.mock('../src/lib/vault', () => ({ applyShiftVaultMovement: jest.fn(async () => {}) }));
jest.mock('../src/lib/cash-control', () => ({
  ...jest.requireActual('../src/lib/cash-control'),
  shiftControlSummary: jest.fn(async () => ({ warnings: [] })),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const router = require('../src/routes/shifts.routes');

const app = express();
app.use(express.json(), (req, _res, next) => {
  req.locationId = 'loc1'; req.restaurantId = 'r1';
  req.user = { id: 'admin1', role: 'ADMIN', name: 'Caja' }; next();
});
app.use('/api/shifts', router);

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(async (work) => work(prisma));
  prisma.cashShift.findFirst.mockResolvedValue({
    id: 's1', locationId: 'loc1', isOpen: true, openedAt: new Date('2026-11-21T00:00:00Z'),
    openingFloat: 100, expenses: [{ amount: 20 }], cashIns: [{ amount: 30 }], blindClose: false,
  });
  prisma.cashShift.update.mockImplementation(async ({ data }) => ({ id: 's1', locationId: 'loc1', ...data }));
  prisma.employee.findMany.mockResolvedValue([]);
  prisma.employeeShift.updateMany.mockResolvedValue({ count: 0 });
});

test.each(['/current/close', '/s1/close'])('cierre %s conserva importes y detalle con 2000 tickets proyectados', async (path) => {
  // Simular la proyección que Prisma ejecuta: ningún campo que la consulta
  // omita puede llegar al cálculo. Los metadatos pesados no deben leerse.
  const orders = Array.from({ length: 2000 }, (_, i) => ({
    orderNumber: String(i), customerName: 'Cliente', paidAt: new Date('2026-11-21T01:00:00Z'),
    createdAt: new Date('2026-11-21T00:30:00Z'), paymentMethod: 'MIXED', total: 100,
    payments: [{ method: 'CASH', amount: 60, status: 'PAID' },
      { method: 'TRANSFER', amount: 40, status: 'PAID' },
      { method: 'CARD', amount: 999, status: 'REFUNDED' }],
    metadata: 'x'.repeat(10000), notes: 'No se necesita para el corte',
  }));
  prisma.order.findMany.mockImplementation(async ({ select }) => {
    expect(select).toBeDefined();
    return orders.map((order) => Object.fromEntries(Object.keys(select).map((key) => [key, order[key]])));
  });
  const response = await request(app).post(`/api/shifts${path}`).send({ closingFloat: 120110 });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ isOpen: false, ordersCount: 2000, totalCash: 120000,
    totalTransfer: 80000, totalCard: 0, totalSales: 200000, expectedCash: 120110 });
  expect(response.body.transferOrders).toHaveLength(2000);
  expect(response.body.transferOrders[0]).toMatchObject({ orderNumber: '0', amount: 40, customerName: 'Cliente' });
  const query = prisma.order.findMany.mock.calls[0][0];
  expect(query.include).toBeUndefined();
  expect(query.select.notes).toBeUndefined();
  expect(query.select.metadata).toBeUndefined();
  expect(query.where.locationId).toBe('loc1');
});
