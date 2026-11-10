'use strict';

// C8: cortes diarios del repartidor independiente (100% del envío, pago diario), con dobles en memoria.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCourierPayouts, hashLines } = require('../src/lib/marketplace-courier-payouts');
const { createCourierPayoutsJob } = require('../src/jobs/courierPayouts.job');
const { dayRange, dateOf, previousDate } = require('../src/lib/mx-calendar');

const PLATFORM = { accountId: 'saas', roles: ['SUPER_ADMIN'] };
const OWNER = { accountId: 'owner', roles: ['ADMIN'], tenantId: 't1', restaurantId: 'r1' };
const COURIER = { accountId: 'acc-c1', roles: ['COURIER'] };

function fakeDb() {
  const state = { tasks: [], orders: new Map(), payouts: [], ledger: [], restaurants: [{ id: 'r1', name: "Master Burger's", tenantId: 't1' },
    { id: 'r2', name: 'Bobbas', tenantId: 't2' }], couriers: [{ id: 'c1', accountId: 'acc-c1', status: 'ACTIVE', payload: { name: 'Luis' } },
    { id: 'c2', accountId: 'acc-c2', status: 'ACTIVE', payload: { name: 'Ana' } }] };
  const pick = (row, select) => (select ? Object.fromEntries(Object.keys(select).filter(k => select[k]).map(k => [k, structuredClone(row[k])])) : structuredClone(row));
  const match = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(part => match(row, part));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('gte' in value) return row[key] >= value.gte;
      if ('path' in value) {
        const target = value.path.reduce((v, k) => v?.[k], row[key]);
        return typeof target === 'string' && target.startsWith(value.string_starts_with);
      }
    }
    return row[key] === value;
  });
  const db = {
    state,
    marketplaceNetworkTask: { findMany: async ({ where, take, cursor, skip = 0 }) => {
      let rows = state.tasks.filter(t => match(t, where)).sort((a, b) => (a.id < b.id ? -1 : 1));
      if (cursor) rows = rows.slice(rows.findIndex(r => r.id === cursor.id) + skip);
      return structuredClone(rows.slice(0, take));
    } },
    order: { findMany: async ({ where }) => where.id.in.map(id => state.orders.get(id)).filter(Boolean).map(o => structuredClone(o)) },
    restaurant: {
      findFirst: async ({ where, select }) => { const r = state.restaurants.find(x => x.id === where.id); return r ? pick(r, select) : null; },
      findMany: async ({ where }) => state.restaurants.filter(r => where.id.in.includes(r.id)).map(r => ({ id: r.id, name: r.name })),
    },
    marketplaceNetworkCourier: {
      findUnique: async ({ where }) => structuredClone(state.couriers.find(c => c.accountId === where.accountId) ?? null),
      findMany: async ({ where }) => state.couriers.filter(c => where.id.in.includes(c.id)).map(c => structuredClone(c)),
    },
    marketplaceCourierPayout: {
      create: async ({ data }) => {
        if (state.payouts.some(p => p.restaurantId === data.restaurantId && p.courierId === data.courierId && p.businessDate === data.businessDate)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        const row = { id: 'p' + (state.payouts.length + 1), paidAt: null, paidBy: null, paymentReference: null, paymentNote: null, ...structuredClone(data) };
        state.payouts.push(row); return structuredClone(row);
      },
      findFirst: async ({ where, select }) => { const r = state.payouts.find(p => match(p, where)); return r ? pick(r, select) : null; },
      findMany: async ({ where, select }) => state.payouts.filter(p => match(p, where))
        .sort((a, b) => (a.businessDate < b.businessDate ? 1 : -1)).map(p => pick(p, select)),
      updateMany: async ({ where, data }) => {
        const rows = state.payouts.filter(p => match(p, where)); rows.forEach(r => Object.assign(r, structuredClone(data)));
        return { count: rows.length };
      },
    },
    marketplaceLedgerEntry: {
      findMany: async ({ where }) => state.ledger.filter(e => match(e, where)).map(e => structuredClone(e)),
      createMany: async ({ data }) => { state.ledger.push(...structuredClone(data)); return { count: data.length }; },
      groupBy: async ({ where }) => {
        const rows = state.ledger.filter(e => match(e, where)); const by = {};
        for (const e of rows) { by[e.type] = (by[e.type] || 0) + Math.round(Number(e.amount) * 100); }
        return Object.entries(by).map(([type, c]) => ({ type, _sum: { amount: (c / 100).toFixed(2) } }));
      },
    },
    $transaction: async work => work(db),
  };
  return db;
}
let n = 0;
function delivery(db, { courierId = 'c1', restaurantId = 'r1', method = 'CASH', deliveredAt = '2026-11-09T20:00:00.000Z',
  total = 15500, fee = 3500, orderStatus = 'DELIVERED', taskStatus = 'DELIVERED', assignmentStatus = 'COMPLETED' } = {}) {
  n++; const orderId = `o${String(n).padStart(3, '0')}`;
  db.state.tasks.push({ id: orderId + '_t', orderId, restaurantId, status: taskStatus,
    payload: { deliveredAt, currentAssignment: { id: orderId + '_a', courierId, status: assignmentStatus } } });
  db.state.orders.set(orderId, { id: orderId, restaurantId, orderNumber: 'M-' + n, status: orderStatus,
    marketplacePipeline: { paymentMethod: method, settlement: { totalCents: total, courierPayoutCents: fee } } });
  return orderId;
}
const service = (db, at = '2026-11-10T18:00:00Z') => createCourierPayouts({ prisma: db, now: () => new Date(at), bypass: fn => fn() });

test('el día es el de CDMX: una entrega a las 23:30 del 9 cuenta el 9 aunque en UTC ya sea el 10', async () => {
  const db = fakeDb();
  delivery(db, { deliveredAt: '2026-11-10T05:30:00.000Z' }); // 9/nov 23:30 CDMX
  delivery(db, { deliveredAt: '2026-11-10T06:30:00.000Z' }); // 10/nov 00:30 CDMX
  const nine = await service(db).computeDay(db, '2026-11-09');
  assert.equal(nine.groups.length, 1); assert.equal(nine.groups[0].deliveriesCount, 1);
  assert.equal(nine.range.start.toISOString(), '2026-11-09T06:00:00.000Z');
  assert.equal(dateOf(new Date('2026-11-10T05:59:00Z')), '2026-11-09'); assert.equal(previousDate('2026-03-01'), '2026-02-28');
});

test('efectivo: se queda su envío y le debe el resto al comercio; en línea: el comercio le debe el envío', async () => {
  const db = fakeDb();
  const cash = delivery(db, { method: 'CASH', total: 15500, fee: 3500 });
  delivery(db, { method: 'ONLINE', total: 20000, fee: 4000 });
  delivery(db, { method: 'ONLINE', total: 10000, fee: 3000 });
  const [g] = (await service(db).computeDay(db, '2026-11-09')).groups;
  assert.deepEqual({ d: g.deliveriesCount, e: g.earningsCents, cc: g.cashCollectedCents, ctm: g.cashToMerchantCents, on: g.onlineEarningsCents, net: g.netCents },
    { d: 3, e: 10500, cc: 15500, ctm: 12000, on: 7000, net: -5000 });
  assert.deepEqual(g.lines.find(l => l.orderId === cash), { orderId: cash, orderNumber: 'M-' + Number(cash.slice(1)), deliveredAt: '2026-11-09T20:00:00.000Z', paymentMethod: 'CASH',
    totalCents: 15500, earningsCents: 3500, cashCollectedCents: 15500, cashToMerchantCents: 12000, onlineEarningsCents: 0 });
});

test('no cuenta: pedido cancelado, tarea sin asignación completada, otro repartidor u otro día; agrupa por comercio', async () => {
  const db = fakeDb();
  delivery(db); delivery(db, { orderStatus: 'CANCELLED' }); delivery(db, { assignmentStatus: 'REASSIGNED' });
  delivery(db, { courierId: 'c2' }); delivery(db, { deliveredAt: '2026-11-08T20:00:00.000Z' }); delivery(db, { restaurantId: 'r2' });
  const { groups } = await service(db).computeDay(db, '2026-11-09', { courierId: 'c1' });
  assert.deepEqual(groups.map(g => [g.restaurantId, g.deliveriesCount]).sort(), [['r1', 1], ['r2', 1]]);
});

test('un snapshot ilegible se excluye y se reporta, no se paga en silencio', async () => {
  const db = fakeDb();
  const bad = delivery(db, { fee: 99999, total: 100 });
  const result = await service(db).computeDay(db, '2026-11-09');
  assert.equal(result.groups.length, 0); assert.deepEqual(result.excluded, [{ orderId: bad, reason: 'INVALID_SETTLEMENT' }]);
});

test('emitir congela el corte del día anterior, una sola vez; sin nada que saldar queda pagado', async () => {
  const db = fakeDb();
  delivery(db, { method: 'ONLINE', total: 20000, fee: 4000 });
  delivery(db, { courierId: 'c2', method: 'CASH', total: 3000, fee: 3000 }); // envío = total: no debe nada
  const svc = service(db);
  const first = await svc.issueDay({});
  assert.deepEqual(first, { businessDate: '2026-11-09', groups: 2, created: 2, existing: 0, excluded: 0 });
  assert.deepEqual((await svc.issueDay({ date: '2026-11-09' })).existing, 2);
  const c1 = db.state.payouts.find(p => p.courierId === 'c1');
  assert.equal(c1.status, 'ISSUED'); assert.equal(c1.netCents, 4000); assert.equal(c1.linesHash, hashLines(c1.lines));
  assert.equal(c1.dayStart.toISOString(), dayRange('2026-11-09').start.toISOString());
  const c2 = db.state.payouts.find(p => p.courierId === 'c2');
  assert.equal(c2.status, 'PAID'); assert.equal(c2.paymentReference, 'Sin saldo');
  await assert.rejects(svc.issueDay({ date: '2026-11-10' }), e => e.code === 'DAY_OPEN');
});

test('el comercio marca pagado con referencia; reintento igual responde lo mismo; otro comercio no puede', async () => {
  const db = fakeDb();
  delivery(db, { method: 'ONLINE', total: 20000, fee: 4000 });
  const svc = service(db); await svc.issueDay({});
  const id = db.state.payouts[0].id;
  await assert.rejects(svc.markPaid({ ...OWNER, tenantId: 't2', restaurantId: 'r2' }, id, { reference: 'SPEI-1' }), e => e.code === 'MERCHANT_FORBIDDEN');
  await assert.rejects(svc.markPaid({ ...OWNER, roles: ['CASHIER'] }, id, { reference: 'SPEI-1' }), e => e.code === 'MERCHANT_FORBIDDEN');
  await assert.rejects(svc.markPaid(OWNER, id, { reference: 'a' }), e => e.code === 'INVALID_REQUEST');
  const paid = await svc.markPaid(OWNER, id, { reference: ' Efectivo en caja ', note: 'Lo recogió Luis' });
  assert.equal(paid.payout.status, 'PAID'); assert.equal(paid.payout.paymentReference, 'Efectivo en caja'); assert.equal(paid.replayed, false);
  assert.equal(db.state.payouts[0].paidBy, 'owner');
  assert.equal((await svc.markPaid(OWNER, id, { reference: 'Efectivo en caja' })).replayed, true);
  await assert.rejects(svc.markPaid(PLATFORM, id, { reference: 'OTRO' }), e => e.code === 'ALREADY_PAID' && e.statusCode === 409);
  await assert.rejects(svc.markPaid(OWNER, 'nope', { reference: 'SPEI-2' }), e => e.code === 'PAYOUT_NOT_FOUND');
});

test('al pagar, los envíos en línea liquidados en el libro bajan COURIER_PAYABLE y la billetera cuadra', async () => {
  const db = fakeDb();
  const settled = delivery(db, { method: 'ONLINE', total: 20000, fee: 4000 });
  delivery(db, { method: 'ONLINE', total: 10000, fee: 3000 }); // sin liquidar en el libro
  db.state.ledger.push({ restaurantId: 'r1', orderId: settled, paymentId: 'pay1', account: 'COURIER_PAYABLE', beneficiaryId: 'c1', type: 'CREDIT', amount: '40.00' });
  const svc = service(db); await svc.issueDay({});
  assert.equal((await svc.wallet(COURIER)).totals.ledgerPayableCents, 4000);
  const paid = await svc.markPaid(OWNER, db.state.payouts[0].id, { reference: 'SPEI-9' });
  assert.equal(paid.disbursedCents, 4000);
  const posted = db.state.ledger.filter(e => e.eventType === 'PAYOUT_DISBURSED');
  assert.deepEqual(posted.map(e => [e.account, e.type, e.amount, e.paymentId, e.referenceId]).sort(),
    [['COURIER_PAYABLE', 'DEBIT', '40.00', 'pay1', 'p1'], ['PAYOUT_CLEARING', 'CREDIT', '40.00', 'pay1', 'p1']].sort());
  assert.equal((await svc.wallet(COURIER)).totals.ledgerPayableCents, 0);
});

test('la billetera muestra hoy en vivo, los cortes de los últimos días y lo pendiente en cada sentido', async () => {
  const db = fakeDb();
  delivery(db, { method: 'ONLINE', total: 20000, fee: 4000 });                     // 9/nov, r1: le deben 40
  delivery(db, { method: 'CASH', total: 15500, fee: 3500, restaurantId: 'r2' });   // 9/nov, r2: debe 120
  delivery(db, { method: 'CASH', total: 9000, fee: 3000, deliveredAt: '2026-11-10T17:00:00.000Z' }); // hoy
  const svc = service(db); await svc.issueDay({});
  const w = await svc.wallet(COURIER, { days: '7' });
  assert.equal(w.today, '2026-11-10'); assert.equal(w.from, '2026-11-04');
  assert.equal(w.days[0].businessDate, '2026-11-10'); assert.equal(w.days[0].items[0].status, 'OPEN');
  assert.equal(w.days[0].items[0].earningsCents, 3000);
  assert.deepEqual(w.days[1].items.map(i => [i.restaurantName, i.direction, i.netCents]).sort(),
    [["Master Burger's", 'MERCHANT_PAYS', 4000], ['Bobbas', 'COURIER_PAYS', -12000]].sort());
  assert.deepEqual({ ...w.totals, ledgerPayableCents: undefined }, { todayEarningsCents: 3000, periodEarningsCents: 10500,
    pendingFromMerchantsCents: 4000, owedToMerchantsCents: 12000, ledgerPayableCents: undefined });
  await assert.rejects(svc.wallet({ accountId: 'x', roles: ['COURIER'] }), e => e.code === 'COURIER_NOT_FOUND');
  await assert.rejects(svc.wallet(OWNER), e => e.code === 'COURIER_FORBIDDEN');
  await assert.rejects(svc.wallet(COURIER, { days: '90' }), e => e.code === 'INVALID_REQUEST');
});

test('el comercio ve el día: hoy en vivo, días cerrados desde lo emitido, con nombre del repartidor', async () => {
  const db = fakeDb();
  delivery(db, { method: 'ONLINE', total: 20000, fee: 4000 });
  delivery(db, { method: 'CASH', total: 9000, fee: 3000, deliveredAt: '2026-11-10T17:00:00.000Z' });
  const svc = service(db); await svc.issueDay({});
  const yesterday = await svc.merchantDay(OWNER, { date: '2026-11-09' });
  assert.equal(yesterday.items[0].status, 'ISSUED'); assert.equal(yesterday.items[0].courierName, 'Luis'); assert.equal(yesterday.items[0].lines.length, 1);
  const today = await svc.merchantDay(OWNER, {});
  assert.equal(today.items[0].status, 'OPEN'); assert.equal(today.items[0].netCents, -6000);
  await assert.rejects(svc.merchantDay(OWNER, { date: '2026-11-11' }), e => e.code === 'INVALID_DATE');
  await assert.rejects(svc.merchantDay(OWNER, { restaurantId: 'r2' }), e => e.code === 'MERCHANT_FORBIDDEN');
});

test('el job emite ayer y anteayer; un día que falla no frena el otro', async () => {
  const calls = [];
  const job = createCourierPayoutsJob({ now: () => new Date('2026-11-10T09:17:00Z'), logger: { info() {}, error() {} },
    payouts: { issueDay: async ({ date }) => { calls.push(date); if (date === '2026-11-09') throw Object.assign(new Error('x'), { code: 'BOOM' }); return { businessDate: date, created: 1 }; } } });
  const { results } = await job.run();
  assert.deepEqual(calls, ['2026-11-09', '2026-11-08']);
  assert.deepEqual(results, [{ businessDate: '2026-11-09', error: 'BOOM' }, { businessDate: '2026-11-08', created: 1 }]);
});

test('rutas: billetera del repartidor, día y pago del comercio, emisión solo de plataforma', async () => {
  const routes = [];
  const Router = () => ({ get: (p, h) => routes.push(['get', p, h]), post: (p, h) => routes.push(['post', p, h]), delete() {} });
  const calls = [];
  const payoutService = { wallet: async (a, q) => { calls.push(['wallet', a.accountId, q]); return { ok: 1 }; },
    merchantDay: async (a, q) => { calls.push(['day', q]); return { items: [] }; },
    markPaid: async (a, id, b) => { calls.push(['pay', id, b]); return { payout: {} }; },
    issueDay: async args => { calls.push(['issue', args]); return { created: 0 }; } };
  require('../src/routes/marketplace-couriers-v1.routes')({ Router, payoutService, service: {}, resolveActor: async () => COURIER });
  require('../src/routes/marketplace-settlements-v1.routes')({ Router, payoutService, commissionService: {}, resolveActor: async req => req.actor });
  const call = async (verb, path, req = {}) => {
    const handler = routes.find(([v, p]) => v === verb && p === path)[2];
    const res = { code: 200, set() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await handler({ query: {}, params: {}, body: {}, headers: {}, ...req }, res); return res;
  };
  assert.equal((await call('get', '/couriers/me/wallet', { query: { days: '3' } })).code, 200);
  assert.equal((await call('get', '/merchant/courier-payouts', { actor: OWNER, query: { date: '2026-11-09' } })).code, 200);
  assert.equal((await call('post', '/merchant/courier-payouts/:id/pay', { actor: OWNER, params: { id: 'p1' }, body: { reference: 'SPEI' } })).code, 200);
  assert.equal((await call('post', '/ops/courier-payouts/issue', { actor: OWNER, body: { date: '2026-11-09' } })).code, 403);
  assert.equal((await call('post', '/ops/courier-payouts/issue', { actor: PLATFORM, body: { date: '2026-11-09', x: 1 } })).code, 400);
  assert.equal((await call('post', '/ops/courier-payouts/issue', { actor: PLATFORM, body: { date: '2026-11-09' } })).code, 200);
  assert.deepEqual(calls.map(c => c[0]), ['wallet', 'day', 'pay', 'issue']);
  assert.deepEqual(calls[3][1], { date: '2026-11-09', issuedBy: 'saas' });
});
