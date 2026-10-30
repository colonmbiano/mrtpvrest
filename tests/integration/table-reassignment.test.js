'use strict';

// Ejecutar contra una BD efímera con el schema Prisma aplicado:
// DATABASE_URL=postgresql://.../reassignment_test node --test tests/integration/table-reassignment.test.js
// La autenticación se prueba en orders.reassign-table.test.js. Aquí invocamos
// los handlers con contexto autenticado para probar las transacciones reales.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const databaseUrl = new URL(process.env.DATABASE_URL || 'http://missing');
assert(['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) && /test/i.test(databaseUrl.pathname) &&
  (databaseUrl.port === '55449' || (process.env.CI === 'true' && databaseUrl.port === '5432')),
  'Esta prueba requiere una base de datos local de pruebas');
const { prisma, runWithBypass, runWithTenant } = require('../../packages/database');
const routes = require('../../apps/backend/src/routes/orders.routes');
const handlerFor = path => routes.stack.find(layer => layer.route?.path === path && layer.route.methods[path === '/tpv' ? 'post' : 'patch']).route.stack.at(-1).handle;
const moveHandler = handlerFor('/:id/table');
const createHandler = handlerFor('/tpv');
let tenant, restaurant, location, menuItem;
let sequence = 0;

before(async () => runWithBypass(async () => {
  const slug = 'reassign-' + randomUUID();
  tenant = await prisma.tenant.create({ data: { name: 'Reassignment test', slug, ownerEmail: 'test@example.invalid' } });
  restaurant = await prisma.restaurant.create({ data: { tenantId: tenant.id, slug, name: 'Test' } });
  location = await prisma.location.create({ data: { restaurantId: restaurant.id, name: 'Test', slug } });
  const category = await prisma.category.create({ data: { restaurantId: restaurant.id, name: 'Test' } });
  menuItem = await prisma.menuItem.create({ data: {
    restaurantId: restaurant.id, categoryId: category.id, name: 'Test product', price: 75, activeDays: [],
  } });
}));
after(async () => {
  try {
    await runWithBypass(async () => {
      if (restaurant) {
        await prisma.accessLog.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.order.deleteMany({ where: { restaurantId: restaurant.id } });
        await prisma.restaurant.delete({ where: { id: restaurant.id } });
      }
      if (tenant) await prisma.tenant.delete({ where: { id: tenant.id } });
    });
  } finally {
    await prisma.$disconnect();
  }
});
const inTenant = fn => runWithTenant({ restaurantId: restaurant.id, role: 'OWNER' }, fn);

async function fixture() {
  return inTenant(async () => {
    const name = String(++sequence);
    const source = await prisma.table.create({ data: { locationId: location.id, name: 'From ' + name, status: 'OCCUPIED' } });
    const target = await prisma.table.create({ data: { locationId: location.id, name: 'To ' + name } });
    const order = await prisma.order.create({ data: {
      restaurantId: restaurant.id, locationId: location.id, orderNumber: name, orderType: 'DINE_IN',
      tableId: source.id, tableNumber: 1, status: 'PREPARING', paymentMethod: 'CASH',
      subtotal: 150, total: 135, discount: 15, tip: 10, numberOfGuests: 2,
      rounds: { create: [{ roundNumber: 1 }, { roundNumber: 2 }] },
    }, include: { rounds: { orderBy: { roundNumber: 'asc' } } } });
    await prisma.orderItem.createMany({ data: order.rounds.map(round => ({
      orderId: order.id, menuItemId: menuItem.id, name: 'Test product', price: 75,
      quantity: 1, subtotal: 75, roundId: round.id,
    })) });
    return { source, target, order };
  });
}

async function invoke(handler, { order, source, target }, body, userPatch = {}) {
  let status = 200;
  let data;
  const req = {
    headers: {},
    params: { id: order.id }, body: body || { fromTableId: source.id, tableId: target.id },
    restaurantId: restaurant.id, locationId: location.id,
    user: { id: 'integration-waiter', name: 'Test waiter', role: 'WAITER', isEmployee: true,
      restaurantId: restaurant.id, tenantId: tenant.id, ...userPatch },
    app: { get: () => null },
  };
  const res = { status(value) { status = value; return this; }, json(value) { data = value; return this; }, setHeader() {} };
  await inTenant(() => handler(req, res));
  return { status, data };
}
const readTable = id => inTenant(() => prisma.table.findUnique({ where: { id } }));
const readOrder = id => inTenant(() => prisma.order.findUnique({
  where: { id }, include: { items: { orderBy: { id: 'asc' } }, rounds: { orderBy: { roundNumber: 'asc' } } },
}));

test('traslada la misma cuenta y preserva líneas, rondas, descuentos y propina', async () => {
  const fixtureData = await fixture();
  const previous = await readOrder(fixtureData.order.id);
  const result = await invoke(moveHandler, fixtureData);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const moved = await readOrder(fixtureData.order.id);
  for (const key of ['id', 'orderNumber', 'status', 'paymentStatus', 'total', 'subtotal', 'discount', 'tip', 'numberOfGuests']) {
    assert.deepEqual(moved[key], previous[key], key);
  }
  assert.deepEqual(moved.items, previous.items);
  assert.deepEqual(moved.rounds, previous.rounds);
  assert.equal(moved.tableId, fixtureData.target.id);
  assert.equal(moved.tableNumber, null);
  assert.equal((await readTable(fixtureData.source.id)).status, 'AVAILABLE');
  assert.equal((await readTable(fixtureData.target.id)).status, 'OCCUPIED');
  const audit = await inTenant(() => prisma.accessLog.findFirst({
    where: { restaurantId: restaurant.id, resource: 'order:' + moved.id, action: 'TABLE_REASSIGNED' },
  }));
  assert.equal(audit.before.tableId, fixtureData.source.id);
  assert.equal(audit.after.tableId, fixtureData.target.id);
});

test('rollback de la reserva si una cuenta activa contradice el status libre', async () => {
  const f = await fixture();
  await inTenant(() => prisma.order.create({ data: {
    restaurantId: restaurant.id, locationId: location.id, orderNumber: 'occupied-' + sequence,
    tableId: f.target.id, orderType: 'DINE_IN', status: 'OPEN', paymentMethod: 'CASH', subtotal: 0, total: 0,
  } }));
  const result = await invoke(moveHandler, f);
  assert.equal(result.status, 409);
  assert.equal((await readTable(f.target.id)).status, 'AVAILABLE');
  assert.equal((await readOrder(f.order.id)).tableId, f.source.id);
});

for (const placement of ['source', 'target']) {
  test(`pedido retenido en ${placement}: conserva el estado correcto de ambas mesas`, async () => {
    const f = await fixture();
    await inTenant(() => prisma.order.create({ data: {
      restaurantId: restaurant.id, locationId: location.id, orderNumber: 'held-' + sequence,
      tableId: f[placement].id, orderType: 'DINE_IN', status: 'PENDING',
      awaitingTableConfirmation: true, paymentMethod: 'CASH', subtotal: 75, total: 75,
    } }));
    const result = await invoke(moveHandler, f);
    assert.equal(result.status, placement === 'source' ? 200 : 409, JSON.stringify(result.data));
    assert.equal((await readTable(f.source.id)).status, placement === 'source' ? 'AVAILABLE' : 'OCCUPIED');
    assert.equal((await readTable(f.target.id)).status, placement === 'source' ? 'OCCUPIED' : 'AVAILABLE');
  });
}

test('un pedido retenido no puede trasladarse ni ocupar el destino', async () => {
  const f = await fixture();
  await inTenant(() => prisma.order.update({ where: { id: f.order.id }, data: { awaitingTableConfirmation: true } }));
  const result = await invoke(moveHandler, f);
  assert.equal(result.status, 409);
  assert.equal(result.data.code, 'TABLE_CONFIRMATION_PENDING');
  assert.equal((await readOrder(f.order.id)).tableId, f.source.id);
  assert.equal((await readTable(f.target.id)).status, 'AVAILABLE');
});

test('dos empleados no pueden mover sus cuentas a la misma mesa', async () => {
  const a = await fixture();
  const b = await fixture();
  b.target = a.target;
  const results = await Promise.all([invoke(moveHandler, a), invoke(moveHandler, b)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409], JSON.stringify(results));
  const orders = await inTenant(() => prisma.order.findMany({ where: { tableId: a.target.id, paymentStatus: { not: 'PAID' } } }));
  assert.equal(orders.length, 1);
  const loser = results[0].status === 409 ? a : b;
  assert.equal((await readOrder(loser.order.id)).tableId, loser.source.id);
  assert.equal((await readTable(loser.source.id)).status, 'OCCUPIED');
});

test('una apertura simultánea de cuenta no duplica la cuenta de la mesa destino', async () => {
  const f = await fixture();
  const results = await Promise.all([
    invoke(moveHandler, f),
    invoke(createHandler, f, { orderType: 'DINE_IN', tableId: f.target.id, items: [{ menuItemId: menuItem.id, quantity: 1 }] }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409], JSON.stringify(results));
  const count = await inTenant(() => prisma.order.count({ where: { tableId: f.target.id, paymentStatus: { not: 'PAID' } } }));
  assert.equal(count, 1);
});

test('si la auditoría falla, la cuenta y ambas mesas hacen rollback', async () => {
  const f = await fixture();
  const result = await invoke(moveHandler, f, undefined, { tenantId: null });
  assert.equal(result.status, 500);
  assert.equal((await readOrder(f.order.id)).tableId, f.source.id);
  assert.equal((await readTable(f.source.id)).status, 'OCCUPIED');
  assert.equal((await readTable(f.target.id)).status, 'AVAILABLE');
});
