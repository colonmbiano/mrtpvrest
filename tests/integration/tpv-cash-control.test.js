'use strict';
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const url = new URL(process.env.DATABASE_URL || 'http://missing');
assert(['localhost', '127.0.0.1'].includes(url.hostname) &&
  (['55439', '55449'].includes(url.port) || (process.env.CI === 'true' && url.port === '5432')),
  'Se requiere una base local desechable de pruebas');
const { prisma, runWithBypass } = require('../../packages/database');
const { cashTransaction, cutDriverCash } = require('../../apps/backend/src/lib/driver-cash-settlement');
const { assertOpenPaymentPeriod, verifyOrderPayment } = require('../../apps/backend/src/lib/cash-control');
let tenant, restaurant, location, driver, shift, number = 0;
const req = () => ({ user: { id: driver.id, name: 'Alex', role: 'OWNER', tenantId: tenant.id, restaurantId: restaurant.id }, locationId: location.id });
before(async () => runWithBypass(async () => {
  const slug = 'cash-control-' + randomUUID();
  tenant = await prisma.tenant.create({ data: { name: 'Cash test', slug, ownerEmail: 'cash@example.invalid' } });
  restaurant = await prisma.restaurant.create({ data: { tenantId: tenant.id, slug, name: 'Cash test' } });
  location = await prisma.location.create({ data: { restaurantId: restaurant.id, slug, name: 'Cash test' } });
  driver = await prisma.employee.create({ data: { locationId: location.id, name: 'Polo', pin: 'test-only', role: 'DELIVERY', tables: [], scheduleDays: [] } });
  shift = await prisma.cashShift.create({ data: { locationId: location.id, employeeId: driver.id, employeeName: driver.name, openingFloat: 500 } });
}));
after(async () => {
  try { await runWithBypass(async () => {
    if (driver) {
      await prisma.driverCashMovement.deleteMany({ where: { driverId: driver.id } });
      await prisma.driverCashCut.deleteMany({ where: { driverId: driver.id } });
    }
    if (restaurant) {
      await prisma.accessLog.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.order.deleteMany({ where: { restaurantId: restaurant.id } });
      await prisma.restaurant.delete({ where: { id: restaurant.id } });
    }
    if (tenant) await prisma.tenant.delete({ where: { id: tenant.id } });
  }); } finally { await prisma.$disconnect(); }
});
const cut = (tx, actual = 300, reason) => cutDriverCash(tx, driver, { restaurantId: restaurant.id,
  shiftId: shift.id, countedCash: actual, differenceReason: reason, auditContext: req() });

test('migración conserva filas antiguas sin inventar conteos ni referencias', async () => runWithBypass(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../packages/database/prisma/migrations/20261109154913_tpv_cash_control/migration.sql'), 'utf8');
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('CREATE TEMP TABLE orders (id text PRIMARY KEY) ON COMMIT DROP');
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "DriverCashMovement" (id text PRIMARY KEY, "driverId" text, approved boolean) ON COMMIT DROP');
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "DriverCashCut" (id text PRIMARY KEY, "driverId" text, balance numeric) ON COMMIT DROP');
    await tx.$executeRawUnsafe("INSERT INTO orders(id) VALUES ('legacy')");
    await tx.$executeRawUnsafe("INSERT INTO \"DriverCashCut\"(id, balance) VALUES ('legacy', 10770)");
    for (const statement of sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    const [legacy] = await tx.$queryRawUnsafe('SELECT * FROM pg_temp."DriverCashCut"');
    assert.equal(Number(legacy.balance), 10770);
    assert.equal(legacy.countedCash, null);
    assert.equal(legacy.cashDifference, null);
    const [payment] = await tx.$queryRawUnsafe('SELECT * FROM pg_temp.orders');
    assert.equal(payment.cardVerified, false);
    assert.equal(payment.cardVerificationReference, null);
  });
}));
test('rollback revierte cobro, aprobación, corte y bitácora si falla el cierre', async () => runWithBypass(async () => {
  const order = await prisma.order.create({ data: { restaurantId: restaurant.id, locationId: location.id,
    shiftId: shift.id, deliveryDriverId: driver.id, orderNumber: String(++number), orderType: 'DELIVERY',
    source: 'TPV', status: 'DELIVERED', paymentMethod: 'CASH', subtotal: 300, total: 300 } });
  const movement = await prisma.driverCashMovement.create({ data: { driverId: driver.id, orderId: order.id,
    shiftId: shift.id, type: 'INCOME', category: 'DELIVERY', amount: 300 } });
  await assert.rejects(cashTransaction(prisma, async tx => { await cut(tx); throw new Error('cierre interrumpido'); }), /cierre interrumpido/);
  assert.equal((await prisma.order.findUnique({ where: { id: order.id } })).paymentStatus, 'PENDING');
  assert.equal((await prisma.driverCashMovement.findUnique({ where: { id: movement.id } })).approved, false);
  assert.equal(await prisma.driverCashCut.count({ where: { driverId: driver.id } }), 0);
  assert.equal(await prisma.accessLog.count({ where: { restaurantId: restaurant.id, action: 'DRIVER_CASH_CUT' } }), 0);
  await cashTransaction(prisma, tx => cut(tx, 200, 'Faltante pendiente por entregar'));
  const saved = await prisma.driverCashCut.findFirst({ where: { driverId: driver.id } });
  assert.equal(Number(saved.countedCash), 200);
  assert.equal(Number(saved.cashDifference), -100);
  assert.equal(saved.receivedById, driver.id);
  assert.equal((await prisma.driverCashMovement.findUnique({ where: { id: movement.id } })).cutId, saved.id);
  assert.equal(await cashTransaction(prisma, tx => cut(tx, 200)), null);
  const paid = await prisma.order.findUnique({ where: { id: order.id } });
  await assert.rejects(cashTransaction(prisma, tx => assertOpenPaymentPeriod(tx, paid, restaurant.id)), { code: 'CLOSED_DRIVER_CUT_LOCKED' });
}));
test('conciliación persiste referencia y auditoría sin cambiar la venta', async () => runWithBypass(async () => {
  const order = await prisma.order.create({ data: { restaurantId: restaurant.id, locationId: location.id,
    orderNumber: String(++number), orderType: 'TAKEOUT', source: 'TPV', status: 'DELIVERED',
    paymentStatus: 'PAID', paymentMethod: 'TRANSFER', paidAt: new Date(), subtotal: 150, total: 150 } });
  await cashTransaction(prisma, tx => verifyOrderPayment(tx, order, { reference: 'SPEI-12345' }, req()));
  const saved = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(saved.transferVerificationReference, 'SPEI-12345');
  assert.equal(saved.transferVerified, true);
  assert.equal(saved.total, 150);
  assert.equal(saved.cashCollected, false);
  assert.equal(await prisma.accessLog.count({ where: { restaurantId: restaurant.id, action: 'PAYMENT_VERIFY' } }), 1);
}));
