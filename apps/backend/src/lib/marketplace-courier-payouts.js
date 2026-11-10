'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// marketplace-courier-payouts.js — Pagos diarios del repartidor INDEPENDIENTE (C8).
//
// Decisión del 9/nov/2026: el repartidor de la red se queda con el 100% del envío y se le paga cada
// día. Este servicio arma, por repartidor y comercio, el corte de cada día (CDMX):
//   · Cuenta los pedidos de la red ENTREGADOS ese día por ese repartidor (tarea DELIVERED con su
//     asignación, orden DELIVERED). El envío de cada uno es el que quedó congelado al crear el pedido
//     (settlement.courierPayoutCents).
//   · Efectivo: el repartidor cobró el total al cliente, se queda su envío y le debe al comercio el
//     resto (cashToMerchantCents). En línea: el dinero entró al comercio, que le debe el envío
//     (onlineEarningsCents).
//   · netCents = onlineEarningsCents - cashToMerchantCents. > 0: el comercio le paga esa cantidad;
//     < 0: el repartidor le entrega ese efectivo al comercio. Así un solo movimiento salda el día.
//   · Cada madrugada un job emite el corte del día anterior (jobs/courierPayouts.job.js). El día en
//     curso se ve en vivo. Emitido, el corte se congela con su hash.
//   · El comercio lo marca pagado (referencia, quién, cuándo; condicional ISSUED → PAID). Si los
//     envíos en línea ya están liquidados en el libro (COURIER_PAYABLE con el repartidor como
//     beneficiario), al pagarse se asienta PAYOUT_DISBURSED (debe COURIER_PAYABLE, haber
//     PAYOUT_CLEARING) en la misma transacción, así la billetera y el libro cuadran.
// Montos en centavos enteros. Cada consulta de comercio filtra por restaurantId.
// ─────────────────────────────────────────────────────────────────────────────

const { createHash } = require('node:crypto');
const { dateOf, isDate, dayRange, previousDate } = require('./mx-calendar');
const { createLedgerTransaction } = require('./marketplace-ledger');

const PAGE = 1000;
const MAX_TASKS = 20000;
const MAX_WALLET_DAYS = 31;
const TX = { isolationLevel: 'Serializable', maxWait: 5000, timeout: 20000 };
const ID = /^[A-Za-z0-9_:-]{1,160}$/;
const MERCHANT_ROLES = ['ADMIN', 'OWNER', 'MERCHANT_OWNER'];
const NO_BALANCE_REFERENCE = 'Sin saldo';

class CourierPayoutError extends Error {
  constructor(code, message, statusCode = 422) {
    super(message); this.name = 'CourierPayoutError'; this.code = code; this.statusCode = statusCode;
  }
}
function check(ok, code, message, status = 422) { if (!ok) throw new CourierPayoutError(code, message, status); }
const cents = value => Number.isSafeInteger(value) && value >= 0;
const hashLines = lines => createHash('sha256').update(JSON.stringify(lines)).digest('hex');
// Montos Decimal del libro → centavos enteros.
function decimalCents(value) {
  const text = String(value ?? '0');
  check(/^-?\d{1,16}(\.\d{1,2})?$/.test(text), 'INVALID_FINANCIAL_DATA', 'Monto contable inválido', 503);
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return text.startsWith('-') ? -result : result;
}

function emptyTotals() {
  return { deliveriesCount: 0, earningsCents: 0, cashCollectedCents: 0, cashToMerchantCents: 0, onlineEarningsCents: 0, netCents: 0 };
}
function addLine(totals, line) {
  totals.deliveriesCount++; totals.earningsCents += line.earningsCents; totals.cashCollectedCents += line.cashCollectedCents;
  totals.cashToMerchantCents += line.cashToMerchantCents; totals.onlineEarningsCents += line.onlineEarningsCents;
  totals.netCents = totals.onlineEarningsCents - totals.cashToMerchantCents;
}

function createCourierPayouts({ prisma, now = () => new Date(), bypass } = {}) {
  const db = prisma || require('@mrtpvrest/database').prisma;
  // La red es de plataforma: los cortes cruzan comercios y se autorizan aquí.
  const global = bypass || (fn => require('../../../../packages/database/tenant-guard').runWithBypass(fn));
  const at = () => {
    const date = now();
    check(date instanceof Date && Number.isFinite(date.getTime()), 'INVALID_CLOCK', 'Reloj inválido', 503);
    return date;
  };
  const today = () => dateOf(at());
  function parseDate(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    check(isDate(value), 'INVALID_DATE', 'Fecha inválida; usa AAAA-MM-DD', 400);
    check(value <= today(), 'INVALID_DATE', 'Ese día todavía no llega', 400);
    return value;
  }

  // ── cálculo ────────────────────────────────────────────────────────────────
  // Pedidos de la red entregados el día local `date`, agrupados por comercio y repartidor.
  async function computeDay(client, date, { restaurantId, courierId } = {}) {
    const range = dayRange(date);
    // deliveredAt vive en el payload (ISO UTC): el día local cae en dos fechas UTC.
    const prefixes = [...new Set([range.start.toISOString().slice(0, 10), new Date(range.end.getTime() - 1).toISOString().slice(0, 10)])];
    const where = { status: 'DELIVERED', ...(restaurantId ? { restaurantId } : {}),
      OR: prefixes.map(prefix => ({ payload: { path: ['deliveredAt'], string_starts_with: prefix } })) };
    const tasks = []; let cursor = null;
    for (;;) {
      const page = await client.marketplaceNetworkTask.findMany({ where, select: { id: true, orderId: true, restaurantId: true, payload: true },
        orderBy: { id: 'asc' }, take: PAGE, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      tasks.push(...page);
      check(tasks.length <= MAX_TASKS, 'PAYOUTS_TOO_LARGE', 'Demasiadas entregas para calcular en línea', 503);
      if (page.length < PAGE) break;
      cursor = page.at(-1).id;
    }
    const delivered = tasks.filter(task => {
      const p = task.payload || {}; const a = p.currentAssignment;
      const when = Date.parse(p.deliveredAt);
      return Number.isFinite(when) && when >= range.start.getTime() && when < range.end.getTime()
        && a && typeof a.courierId === 'string' && a.status === 'COMPLETED' && (!courierId || a.courierId === courierId);
    });
    const orders = delivered.length ? await client.order.findMany({ where: { id: { in: delivered.map(t => t.orderId) } },
      select: { id: true, restaurantId: true, orderNumber: true, status: true,
        marketplacePipeline: { select: { paymentMethod: true, settlement: true } } } }) : [];
    const byId = new Map(orders.map(o => [o.id, o]));
    const groups = new Map(); const excluded = [];
    for (const task of delivered.sort((a, b) => (a.payload.deliveredAt < b.payload.deliveredAt ? -1 : a.payload.deliveredAt > b.payload.deliveredAt ? 1 : 0))) {
      const order = byId.get(task.orderId); const s = order?.marketplacePipeline?.settlement;
      if (!order || order.restaurantId !== task.restaurantId || order.status !== 'DELIVERED') continue;
      const method = order.marketplacePipeline.paymentMethod;
      if (!s || !cents(s.courierPayoutCents) || !cents(s.totalCents) || s.courierPayoutCents > s.totalCents || !['CASH', 'ONLINE'].includes(method)) {
        excluded.push({ orderId: order.id, reason: 'INVALID_SETTLEMENT' }); continue;
      }
      const cash = method === 'CASH';
      const line = { orderId: order.id, orderNumber: order.orderNumber ?? null, deliveredAt: new Date(task.payload.deliveredAt).toISOString(),
        paymentMethod: method, totalCents: s.totalCents, earningsCents: s.courierPayoutCents,
        cashCollectedCents: cash ? s.totalCents : 0, cashToMerchantCents: cash ? s.totalCents - s.courierPayoutCents : 0,
        onlineEarningsCents: cash ? 0 : s.courierPayoutCents };
      const key = `${task.restaurantId}|${task.payload.currentAssignment.courierId}`;
      if (!groups.has(key)) groups.set(key, { restaurantId: task.restaurantId, courierId: task.payload.currentAssignment.courierId,
        businessDate: date, lines: [], ...emptyTotals() });
      const group = groups.get(key); group.lines.push(line); addLine(group, line);
    }
    return { range, groups: [...groups.values()], excluded };
  }

  const STORED = { id: true, restaurantId: true, courierId: true, businessDate: true, currency: true, status: true,
    deliveriesCount: true, earningsCents: true, cashCollectedCents: true, cashToMerchantCents: true, onlineEarningsCents: true,
    netCents: true, lines: true, issuedAt: true, paidAt: true, paidBy: true, paymentReference: true, paymentNote: true };
  const direction = net => (net > 0 ? 'MERCHANT_PAYS' : net < 0 ? 'COURIER_PAYS' : 'EVEN');
  function view(row, { names = new Map(), lines = false, live = false } = {}) {
    return { id: row.id ?? null, restaurantId: row.restaurantId, restaurantName: names.get(row.restaurantId) ?? null,
      courierId: row.courierId, businessDate: row.businessDate, currency: row.currency ?? 'MXN',
      status: live ? 'OPEN' : row.status, deliveriesCount: row.deliveriesCount, earningsCents: row.earningsCents,
      cashCollectedCents: row.cashCollectedCents, cashToMerchantCents: row.cashToMerchantCents,
      onlineEarningsCents: row.onlineEarningsCents, netCents: row.netCents, direction: direction(row.netCents),
      issuedAt: row.issuedAt ? new Date(row.issuedAt).toISOString() : null, paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : null,
      paymentReference: row.paymentReference ?? null, ...(lines ? { lines: row.lines } : {}) };
  }
  async function restaurantNames(client, ids) {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const rows = await client.restaurant.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(rows.map(r => [r.id, r.name]));
  }

  // ── emisión (job diario o plataforma) ──────────────────────────────────────
  async function issueDay({ date, issuedBy = 'system-courier-payouts' } = {}) {
    const day = date ?? previousDate(today());
    check(isDate(day) && day < today(), 'DAY_OPEN', 'Solo se emite un día ya terminado', 409);
    return global(async () => {
      const { range, groups, excluded } = await computeDay(db, day);
      const issuedAt = at(); let created = 0; let existing = 0;
      for (const g of groups) {
        const settled = g.onlineEarningsCents === 0 && g.cashToMerchantCents === 0;
        try {
          await db.marketplaceCourierPayout.create({ data: { restaurantId: g.restaurantId, courierId: g.courierId, businessDate: day,
            dayStart: range.start, dayEnd: range.end, currency: 'MXN', status: settled ? 'PAID' : 'ISSUED',
            deliveriesCount: g.deliveriesCount, earningsCents: g.earningsCents, cashCollectedCents: g.cashCollectedCents,
            cashToMerchantCents: g.cashToMerchantCents, onlineEarningsCents: g.onlineEarningsCents, netCents: g.netCents,
            lines: g.lines, linesHash: hashLines(g.lines), issuedAt, issuedBy,
            ...(settled ? { paidAt: issuedAt, paidBy: issuedBy, paymentReference: NO_BALANCE_REFERENCE } : {}) } });
          created++;
        } catch (error) {
          // Ya emitido (otra instancia o una corrida anterior): el corte congelado no se toca.
          if (error?.code !== 'P2002') throw error;
          existing++;
        }
      }
      return { businessDate: day, groups: groups.length, created, existing, excluded: excluded.length };
    });
  }

  // ── permisos ───────────────────────────────────────────────────────────────
  function requireActor(actor) {
    check(actor && typeof actor.accountId === 'string' && actor.accountId && Array.isArray(actor.roles), 'UNAUTHENTICATED', 'Sesión requerida', 401);
    return actor;
  }
  const isPlatform = actor => actor.roles.includes('SUPER_ADMIN');
  async function merchantScope(actor, restaurantId) {
    requireActor(actor);
    const rid = restaurantId ?? actor.restaurantId;
    check(typeof rid === 'string' && ID.test(rid), 'INVALID_MERCHANT', 'Comercio inválido', 400);
    const restaurant = await db.restaurant.findFirst({ where: { id: rid }, select: { id: true, tenantId: true } });
    check(restaurant, 'MERCHANT_NOT_FOUND', 'Comercio no encontrado', 404);
    check(isPlatform(actor) || (actor.roles.some(role => MERCHANT_ROLES.includes(role)) && actor.tenantId === restaurant.tenantId
      && (actor.restaurantId === rid || (Array.isArray(actor.merchantIds) && actor.merchantIds.includes(rid)))),
    'MERCHANT_FORBIDDEN', 'No tienes permiso sobre este comercio', 403);
    return rid;
  }

  // ── comercio ───────────────────────────────────────────────────────────────
  async function courierNames(client, ids) {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const rows = await client.marketplaceNetworkCourier.findMany({ where: { id: { in: unique } }, select: { id: true, payload: true } });
    return new Map(rows.map(r => [r.id, typeof r.payload?.name === 'string' ? r.payload.name.slice(0, 80) : null]));
  }
  async function merchantDay(actor, query = {}) {
    const restaurantId = await merchantScope(actor, query.restaurantId);
    const date = parseDate(query.date, today());
    return global(async () => {
      const stored = await db.marketplaceCourierPayout.findMany({ where: { restaurantId, businessDate: date }, select: STORED, orderBy: { courierId: 'asc' } });
      const live = date === today() ? (await computeDay(db, date, { restaurantId })).groups : [];
      const rows = stored.length ? stored.map(row => ({ row, live: false })) : live.map(row => ({ row, live: true }));
      const names = await courierNames(db, rows.map(({ row }) => row.courierId));
      return { businessDate: date, today: today(), items: rows.map(({ row, live: isLive }) =>
        ({ ...view(row, { lines: true, live: isLive }), courierName: names.get(row.courierId) ?? null })) };
    });
  }

  function text(value, { min, max, field }) {
    if (value === undefined || value === null || value === '') { check(min === 0, 'INVALID_REQUEST', `Falta ${field}`, 400); return null; }
    check(typeof value === 'string' && !/[\x00-\x1f\x7f]/.test(value), 'INVALID_REQUEST', `${field} inválido`, 400);
    const trimmed = value.trim();
    check(trimmed.length >= Math.max(min, 1) && trimmed.length <= max, 'INVALID_REQUEST', `${field} debe tener entre ${Math.max(min, 1)} y ${max} caracteres`, 400);
    return trimmed;
  }
  async function transaction(work) {
    for (let attempt = 0; ; attempt++) {
      try { return await db.$transaction(work, TX); }
      catch (error) { if (error?.code !== 'P2034' || attempt >= 2) throw error; }
    }
  }
  // Envíos en línea ya liquidados en el libro: al pagarse el corte bajan COURIER_PAYABLE.
  async function disburse(tx, payout, paidAt) {
    let disbursedCents = 0;
    for (const line of Array.isArray(payout.lines) ? payout.lines : []) {
      if (line.paymentMethod !== 'ONLINE' || !(line.onlineEarningsCents > 0)) continue;
      const entries = await tx.marketplaceLedgerEntry.findMany({ where: { restaurantId: payout.restaurantId, orderId: line.orderId,
        account: 'COURIER_PAYABLE', beneficiaryId: payout.courierId }, select: { paymentId: true, type: true, amount: true } });
      if (!entries.length) continue;
      const paymentIds = [...new Set(entries.map(e => e.paymentId))];
      check(paymentIds.length === 1, 'LEDGER_INTEGRITY_ERROR', 'Envío ligado a varios pagos', 503);
      const balance = entries.reduce((sum, e) => sum + (e.type === 'CREDIT' ? 1 : -1) * decimalCents(e.amount), 0);
      const amount = Math.min(balance, line.onlineEarningsCents);
      if (amount <= 0) continue;
      const transactionRecord = createLedgerTransaction({ eventType: 'PAYOUT_DISBURSED', orderId: line.orderId, referenceId: payout.id,
        currency: 'MXN', createdAt: paidAt, entries: [
          { account: 'COURIER_PAYABLE', type: 'DEBIT', amount: amount / 100 },
          { account: 'PAYOUT_CLEARING', type: 'CREDIT', amount: amount / 100 }] });
      const data = transactionRecord.entries.map((entry, index) => ({ id: entry.id, restaurantId: payout.restaurantId, orderId: line.orderId,
        paymentId: paymentIds[0], transactionId: transactionRecord.id, transactionHash: transactionRecord.hash,
        idempotencyKey: `courier-payout:${payout.id}`, lineNumber: index + 1, eventType: 'PAYOUT_DISBURSED', account: entry.account,
        beneficiaryId: entry.account === 'COURIER_PAYABLE' ? payout.courierId : null, type: entry.type,
        amount: (amount / 100).toFixed(2), currency: 'MXN', referenceId: payout.id,
        description: 'Pago diario al repartidor de la red', createdAt: paidAt }));
      const inserted = await tx.marketplaceLedgerEntry.createMany({ data });
      check(inserted.count === 2, 'LEDGER_INTEGRITY_ERROR', 'Pago incompleto en el libro', 503);
      disbursedCents += amount;
    }
    return disbursedCents;
  }
  async function markPaid(actor, payoutId, body = {}) {
    requireActor(actor);
    check(typeof payoutId === 'string' && ID.test(payoutId), 'INVALID_PAYOUT', 'Corte inválido', 400);
    check(body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every(k => ['reference', 'note'].includes(k)),
      'INVALID_REQUEST', 'Parámetros inválidos', 400);
    const reference = text(body.reference, { min: 3, max: 200, field: 'La referencia del pago' });
    const note = text(body.note, { min: 0, max: 500, field: 'La nota' });
    const paidAt = at();
    return global(() => transaction(async tx => {
      const payout = await tx.marketplaceCourierPayout.findFirst({ where: { id: payoutId }, select: { ...STORED } });
      check(payout, 'PAYOUT_NOT_FOUND', 'Corte no encontrado', 404);
      await merchantScope(actor, payout.restaurantId);
      if (payout.status === 'PAID') {
        check(payout.paymentReference === reference, 'ALREADY_PAID', 'Ese corte ya está pagado', 409);
        return { payout: view(payout), replayed: true, disbursedCents: 0 };
      }
      const changed = await tx.marketplaceCourierPayout.updateMany({ where: { id: payoutId, restaurantId: payout.restaurantId, status: 'ISSUED' },
        data: { status: 'PAID', paidAt, paidBy: actor.accountId, paymentReference: reference, paymentNote: note } });
      check(changed.count === 1, 'ALREADY_PAID', 'Ese corte ya está pagado', 409);
      const disbursedCents = await disburse(tx, payout, paidAt);
      const row = await tx.marketplaceCourierPayout.findFirst({ where: { id: payoutId, restaurantId: payout.restaurantId }, select: STORED });
      return { payout: view(row), replayed: false, disbursedCents };
    }));
  }

  // ── repartidor ─────────────────────────────────────────────────────────────
  async function courierOf(actor) {
    requireActor(actor);
    check(actor.roles.includes('COURIER'), 'COURIER_FORBIDDEN', 'Repartidor requerido', 403);
    const courier = await db.marketplaceNetworkCourier.findUnique({ where: { accountId: actor.accountId }, select: { id: true, status: true } });
    check(courier, 'COURIER_NOT_FOUND', 'Tu cuenta aún no tiene un perfil de repartidor en la red', 404);
    return courier.id;
  }
  async function wallet(actor, query = {}) {
    const courierId = await courierOf(actor);
    const days = query.days === undefined ? 14 : Number(query.days);
    check(Number.isInteger(days) && days >= 1 && days <= MAX_WALLET_DAYS, 'INVALID_REQUEST', `days debe estar entre 1 y ${MAX_WALLET_DAYS}`, 400);
    const todayDate = today();
    let from = todayDate; for (let i = 1; i < days; i++) from = previousDate(from);
    return global(async () => {
      const live = (await computeDay(db, todayDate, { courierId })).groups;
      const stored = await db.marketplaceCourierPayout.findMany({ where: { courierId, businessDate: { gte: from } },
        select: STORED, orderBy: [{ businessDate: 'desc' }, { restaurantId: 'asc' }] });
      const ledger = await db.marketplaceLedgerEntry.groupBy({ by: ['type'], where: { account: 'COURIER_PAYABLE', beneficiaryId: courierId },
        _sum: { amount: true } });
      const ledgerPayableCents = ledger.reduce((sum, row) => sum + (row.type === 'CREDIT' ? 1 : -1) * decimalCents(row._sum.amount), 0);
      const names = await restaurantNames(db, [...live, ...stored].map(r => r.restaurantId));
      const byDay = [{ businessDate: todayDate, items: live.map(row => view(row, { names, lines: true, live: true })) }];
      for (const row of stored) {
        let day = byDay.find(d => d.businessDate === row.businessDate);
        if (!day) { day = { businessDate: row.businessDate, items: [] }; byDay.push(day); }
        day.items.push(view(row, { names, lines: true }));
      }
      const pending = stored.filter(row => row.status === 'ISSUED');
      const totals = {
        todayEarningsCents: live.reduce((sum, g) => sum + g.earningsCents, 0),
        periodEarningsCents: live.reduce((sum, g) => sum + g.earningsCents, 0) + stored.reduce((sum, r) => sum + r.earningsCents, 0),
        // Lo que los comercios le deben por cortes emitidos sin pagar, y lo que él debe entregar en efectivo.
        pendingFromMerchantsCents: pending.filter(r => r.netCents > 0).reduce((sum, r) => sum + r.netCents, 0),
        owedToMerchantsCents: pending.filter(r => r.netCents < 0).reduce((sum, r) => sum - r.netCents, 0),
        ledgerPayableCents,
      };
      return { courierId, today: todayDate, from, totals, days: byDay };
    });
  }

  return { computeDay, issueDay, merchantDay, markPaid, wallet };
}

module.exports = { createCourierPayouts, CourierPayoutError, hashLines };
