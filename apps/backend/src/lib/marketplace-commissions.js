'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// marketplace-commissions.js — Estado de cuenta mensual de comisiones del Mercadito (C5).
//
// En un pedido en efectivo el comercio cobra todo al cliente, así que la comisión de la plataforma
// queda como deuda del comercio. Este servicio la junta por mes y deja marcarla pagada:
//
//   · Qué entra: pedidos del Mercadito pagados en EFECTIVO (pipeline.paymentMethod = CASH) y ya
//     ENTREGADOS, creados dentro del mes calendario de America/Mexico_City. Un pedido cancelado no
//     cobra comisión. Los pedidos en línea no entran: su comisión se cobraría en el split de
//     Mercado Pago (C3, pospuesto), y un pedido en efectivo no pasa por el libro contable (no hay
//     pago de pasarela), así que el estado de cuenta es el registro de esa deuda.
//   · La comisión de cada pedido es la que quedó congelada al crear el pedido
//     (settlement.platformFeeCents, o commissionCents en snapshots viejos): cambiar el porcentaje
//     después no cambia meses anteriores. Durante el piloto es 0%, así que los totales dan 0.
//   · El mes en curso se calcula en vivo y no se guarda. Un mes cerrado se "emite": las líneas se
//     congelan con su hash y ya no cambian. No se emite si quedan pedidos en efectivo del mes sin
//     entregar ni cancelar. Con comisión 0 la emisión queda pagada en el mismo acto.
//   · Marcar pagado es condicional (solo ISSUED → PAID) y guarda referencia, quién y cuándo.
//
// Permisos: emitir, pagar y ver todos los comercios es de la plataforma (SUPER_ADMIN, o FINANCE sin
// restaurante). El comercio solo ve lo suyo (ADMIN / MERCHANT_OWNER / FINANCE de su tenant).
// Montos en centavos enteros. Cada consulta filtra por restaurantId.
// ─────────────────────────────────────────────────────────────────────────────

const { createHash } = require('node:crypto');

const TIME_ZONE = 'America/Mexico_City';
const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const FIRST_YEAR = 2024;
const PAGE = 500;
const MAX_ROWS = 50000;
const MAX_LINES_IN_RESPONSE = 2000;
const HISTORY = 12;
const TX = { isolationLevel: 'Serializable', maxWait: 5000, timeout: 20000 };
const MERCHANT_ROLES = ['ADMIN', 'MERCHANT_OWNER', 'FINANCE'];
const ZERO_REFERENCE = 'Sin comisión (0%)';

class CommissionError extends Error {
  constructor(code, message, statusCode = 422) {
    super(message); this.name = 'CommissionError'; this.code = code; this.statusCode = statusCode;
  }
}
function check(ok, code, message, status = 422) { if (!ok) throw new CommissionError(code, message, status); }

// ── calendario ───────────────────────────────────────────────────────────────
const formatter = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric',
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function localParts(ms) {
  return Object.fromEntries(formatter.formatToParts(new Date(ms)).map(part => [part.type, part.value]));
}
function offsetMs(ms) {
  const p = localParts(ms);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
// Medianoche local del día 1: dos pasadas cubren un cambio de horario (hoy CDMX no tiene).
function localMonthStart(year, month) {
  const guess = Date.UTC(year, month - 1, 1);
  const first = guess - offsetMs(guess);
  return new Date(guess - offsetMs(first));
}
function periodOf(date) {
  const p = localParts(date.getTime());
  return `${p.year}-${p.month}`;
}
function periodRange(period) {
  const [, y, m] = PERIOD.exec(period);
  const year = Number(y); const month = Number(m);
  return { start: localMonthStart(year, month),
    end: month === 12 ? localMonthStart(year + 1, 1) : localMonthStart(year, month + 1) };
}
function parsePeriod(value, today) {
  if (value === undefined || value === null || value === '') return periodOf(today);
  check(typeof value === 'string' && PERIOD.test(value) && Number(value.slice(0, 4)) >= FIRST_YEAR,
    'INVALID_PERIOD', 'Mes inválido; usa AAAA-MM', 400);
  check(value <= periodOf(today), 'INVALID_PERIOD', 'Ese mes todavía no empieza', 400);
  return value;
}

// ── líneas ───────────────────────────────────────────────────────────────────
const cents = value => Number.isSafeInteger(value) && value >= 0;
function lineOf(row) {
  const s = row.settlement && typeof row.settlement === 'object' ? row.settlement : {};
  const commissionCents = cents(s.platformFeeCents) ? s.platformFeeCents : s.commissionCents;
  if (!cents(s.subtotalCents) || !cents(commissionCents) || commissionCents > s.subtotalCents) return null;
  const commissionBps = Number.isInteger(s.commissionBps) ? s.commissionBps
    : typeof s.commissionRate === 'number' && Number.isFinite(s.commissionRate) ? Math.round(s.commissionRate * 10000) : null;
  return { orderId: row.orderId, orderNumber: row.order.orderNumber ?? null, createdAt: row.createdAt.toISOString(),
    subtotalCents: s.subtotalCents, commissionBps, commissionCents };
}
function emptySummary() {
  return { ordersCount: 0, salesCents: 0, commissionCents: 0, cancelledCount: 0, pendingCount: 0, excluded: [], lines: [] };
}
function add(summary, row) {
  const status = row.order?.status;
  if (status === 'CANCELLED') { summary.cancelledCount++; return; }
  if (status !== 'DELIVERED') { summary.pendingCount++; return; }
  const line = lineOf(row);
  if (!line) { summary.excluded.push({ orderId: row.orderId, reason: 'INVALID_SETTLEMENT' }); return; }
  summary.ordersCount++; summary.salesCents += line.subtotalCents; summary.commissionCents += line.commissionCents;
  summary.lines.push(line);
}
function hashLines(lines) {
  return createHash('sha256').update(JSON.stringify(lines)).digest('hex');
}

function createCommissionStatements({ prisma, now = () => new Date(), bypass } = {}) {
  const db = prisma || require('@mrtpvrest/database').prisma;
  // Las vistas de plataforma cruzan comercios: se autorizan aquí y corren sin el scope del guard.
  const global = bypass || (fn => require('../../../../packages/database/tenant-guard').runWithBypass(fn));
  const at = () => {
    const date = now();
    check(date instanceof Date && Number.isFinite(date.getTime()), 'INVALID_CLOCK', 'Reloj inválido', 503);
    return date;
  };

  function requireActor(actor) {
    check(actor && typeof actor.accountId === 'string' && actor.accountId && Array.isArray(actor.roles),
      'UNAUTHENTICATED', 'Sesión requerida', 401);
    return actor;
  }
  function isPlatform(actor) {
    return actor.roles.includes('SUPER_ADMIN') || (actor.roles.includes('FINANCE') && !actor.restaurantId);
  }
  function requirePlatform(actor) {
    requireActor(actor);
    check(isPlatform(actor), 'COMMISSIONS_FORBIDDEN', 'Solo la plataforma administra comisiones', 403);
    return actor;
  }
  async function restaurantOf(restaurantId) {
    check(typeof restaurantId === 'string' && ID.test(restaurantId), 'INVALID_MERCHANT', 'Comercio inválido', 400);
    const restaurant = await db.restaurant.findFirst({ where: { id: restaurantId }, select: { id: true, name: true, tenantId: true } });
    check(restaurant, 'MERCHANT_NOT_FOUND', 'Comercio no encontrado', 404);
    return restaurant;
  }
  async function canSee(actor, restaurant) {
    if (isPlatform(actor)) return true;
    return actor.roles.some(role => MERCHANT_ROLES.includes(role)) && actor.tenantId === restaurant.tenantId
      && (actor.restaurantId === restaurant.id || (Array.isArray(actor.merchantIds) && actor.merchantIds.includes(restaurant.id)));
  }

  // Recorre los pipelines en efectivo de un rango en páginas por orderId (no carga todo de golpe).
  async function scan(client, where, visit) {
    let cursor = null; let seen = 0;
    for (;;) {
      const page = await client.marketplaceOrderPipeline.findMany({
        where: { ...where, paymentMethod: 'CASH' },
        select: { orderId: true, restaurantId: true, createdAt: true, settlement: true,
          order: { select: { status: true, orderNumber: true } } },
        orderBy: { orderId: 'asc' }, take: PAGE, ...(cursor ? { cursor: { orderId: cursor }, skip: 1 } : {}),
      });
      for (const row of page) visit(row);
      seen += page.length;
      check(seen <= MAX_ROWS, 'COMMISSIONS_TOO_LARGE', 'Demasiados pedidos para calcular en línea', 503);
      if (page.length < PAGE) return;
      cursor = page[page.length - 1].orderId;
    }
  }
  async function summarize(client, restaurantId, range) {
    const summary = emptySummary();
    await scan(client, { restaurantId, createdAt: { gte: range.start, lt: range.end } }, row => add(summary, row));
    return summary;
  }

  function statusFor(range, today) { return range.end.getTime() <= today.getTime() ? 'TO_ISSUE' : 'OPEN'; }
  function liveView(restaurant, period, range, summary, today, { withLines = false } = {}) {
    return {
      restaurantId: restaurant.id, restaurantName: restaurant.name ?? null, period,
      periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(), currency: 'MXN',
      status: statusFor(range, today), ordersCount: summary.ordersCount, salesCents: summary.salesCents,
      commissionCents: summary.commissionCents, cancelledCount: summary.cancelledCount, pendingCount: summary.pendingCount,
      excludedCount: summary.excluded.length, issuedAt: null, paidAt: null, paymentReference: null,
      ...(withLines ? { lines: summary.lines.slice(0, MAX_LINES_IN_RESPONSE), linesTruncated: summary.lines.length > MAX_LINES_IN_RESPONSE,
        excluded: summary.excluded.slice(0, 100) } : {}),
    };
  }
  function storedView(row, restaurantName, { withLines = false } = {}) {
    const lines = Array.isArray(row.lines) ? row.lines : [];
    return {
      id: row.id, restaurantId: row.restaurantId, restaurantName: restaurantName ?? null, period: row.period,
      periodStart: row.periodStart.toISOString(), periodEnd: row.periodEnd.toISOString(), currency: row.currency,
      status: row.status, ordersCount: row.ordersCount, salesCents: row.salesCents, commissionCents: row.commissionCents,
      issuedAt: row.issuedAt.toISOString(), issuedBy: row.issuedBy, paidAt: row.paidAt ? row.paidAt.toISOString() : null,
      paidBy: row.paidBy ?? null, paymentReference: row.paymentReference ?? null, paymentNote: row.paymentNote ?? null,
      linesHash: row.linesHash,
      ...(withLines ? { lines: lines.slice(0, MAX_LINES_IN_RESPONSE), linesTruncated: lines.length > MAX_LINES_IN_RESPONSE } : {}),
    };
  }
  const STORED = { id: true, restaurantId: true, period: true, periodStart: true, periodEnd: true, currency: true, status: true,
    ordersCount: true, salesCents: true, commissionCents: true, lines: true, linesHash: true, issuedAt: true, issuedBy: true,
    paidAt: true, paidBy: true, paymentReference: true, paymentNote: true };
  const STORED_SUMMARY = { ...STORED, lines: false };

  // Detalle de un mes: el congelado si ya se emitió (con aviso si los pedidos cambiaron después),
  // si no, el cálculo en vivo.
  async function detail(restaurant, period, today) {
    const range = periodRange(period);
    const stored = await db.marketplaceCommissionStatement.findFirst({ where: { restaurantId: restaurant.id, period }, select: STORED });
    const live = await summarize(db, restaurant.id, range);
    if (!stored) return liveView(restaurant, period, range, live, today, { withLines: true });
    return { ...storedView(stored, restaurant.name, { withLines: true }),
      changedSinceIssue: hashLines(live.lines) !== stored.linesHash || live.pendingCount > 0 };
  }

  // ── plataforma ─────────────────────────────────────────────────────────────
  async function listPeriod(actor, query = {}) {
    requirePlatform(actor);
    const today = at();
    const period = parsePeriod(query?.period, today);
    const range = periodRange(period);
    return global(async () => {
      const byMerchant = new Map();
      await scan(db, { createdAt: { gte: range.start, lt: range.end } }, row => {
        if (!byMerchant.has(row.restaurantId)) byMerchant.set(row.restaurantId, emptySummary());
        add(byMerchant.get(row.restaurantId), row);
      });
      const stored = await db.marketplaceCommissionStatement.findMany({ where: { period }, select: STORED_SUMMARY });
      const ids = [...new Set([...byMerchant.keys(), ...stored.map(row => row.restaurantId)])];
      const names = new Map((ids.length ? await db.restaurant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [])
        .map(row => [row.id, row.name]));
      const storedBy = new Map(stored.map(row => [row.restaurantId, row]));
      const items = ids.map(id => {
        const statement = storedBy.get(id);
        if (statement) return storedView(statement, names.get(id));
        return liveView({ id, name: names.get(id) }, period, range, byMerchant.get(id), today);
      }).sort((a, b) => b.commissionCents - a.commissionCents || String(a.restaurantName).localeCompare(String(b.restaurantName), 'es'));
      const totals = items.reduce((acc, item) => {
        acc.commissionCents += item.commissionCents;
        if (item.status === 'PAID') acc.paidCents += item.commissionCents;
        else if (item.status === 'ISSUED') acc.issuedCents += item.commissionCents;
        else acc.unissuedCents += item.commissionCents;
        return acc;
      }, { merchants: items.length, commissionCents: 0, paidCents: 0, issuedCents: 0, unissuedCents: 0 });
      return { period, periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
        currentPeriod: periodOf(today), totals, items };
    });
  }

  async function merchantDetail(actor, restaurantId, query = {}) {
    requirePlatform(actor);
    const today = at();
    const period = parsePeriod(query?.period, today);
    return global(async () => detail(await restaurantOf(restaurantId), period, today));
  }

  async function transaction(work) {
    for (let attempt = 0; ; attempt++) {
      try { return await db.$transaction(work, TX); }
      catch (error) { if (error?.code !== 'P2034' || attempt >= 2) throw error; }
    }
  }

  async function issue(actor, restaurantId, body = {}) {
    requirePlatform(actor);
    check(body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every(key => key === 'period'),
      'INVALID_REQUEST', 'Parámetros inválidos', 400);
    const today = at();
    check(typeof body.period === 'string', 'INVALID_PERIOD', 'Indica el mes a emitir', 400);
    const period = parsePeriod(body.period, today);
    const range = periodRange(period);
    check(range.end.getTime() <= today.getTime(), 'PERIOD_OPEN', 'El mes todavía no termina', 409);
    return global(async () => {
      const restaurant = await restaurantOf(restaurantId);
      const replay = async () => {
        const row = await db.marketplaceCommissionStatement.findFirst({ where: { restaurantId, period }, select: STORED });
        return row ? { statement: storedView(row, restaurant.name), replayed: true } : null;
      };
      try {
        return await transaction(async tx => {
          const existing = await tx.marketplaceCommissionStatement.findFirst({ where: { restaurantId, period }, select: STORED });
          if (existing) return { statement: storedView(existing, restaurant.name), replayed: true };
          const summary = await summarize(tx, restaurantId, range);
          check(summary.pendingCount === 0, 'ORDERS_PENDING',
            `Hay ${summary.pendingCount} pedido(s) en efectivo de ese mes sin entregar ni cancelar; ciérralos antes de emitir`, 409);
          check(summary.excluded.length === 0, 'INVALID_SETTLEMENT',
            `${summary.excluded.length} pedido(s) no tienen la comisión registrada; revísalos antes de emitir`, 409);
          check(summary.ordersCount > 0, 'NOTHING_TO_ISSUE', 'No hay pedidos en efectivo entregados en ese mes', 409);
          const zero = summary.commissionCents === 0;
          const row = await tx.marketplaceCommissionStatement.create({ data: {
            restaurantId, period, periodStart: range.start, periodEnd: range.end, currency: 'MXN',
            status: zero ? 'PAID' : 'ISSUED', ordersCount: summary.ordersCount, salesCents: summary.salesCents,
            commissionCents: summary.commissionCents, lines: summary.lines, linesHash: hashLines(summary.lines),
            issuedAt: today, issuedBy: actor.accountId,
            ...(zero ? { paidAt: today, paidBy: actor.accountId, paymentReference: ZERO_REFERENCE } : {}) }, select: STORED });
          return { statement: storedView(row, restaurant.name), replayed: false };
        });
      } catch (error) {
        // Otra emisión del mismo mes ganó la carrera: devolver la que quedó.
        if (error?.code === 'P2002') { const won = await replay(); if (won) return won; }
        throw error;
      }
    });
  }

  function text(value, { min, max, field }) {
    if (value === undefined || value === null || value === '') {
      check(min === 0, 'INVALID_REQUEST', `Falta ${field}`, 400);
      return null;
    }
    check(typeof value === 'string' && !/[\x00-\x1f\x7f]/.test(value), 'INVALID_REQUEST', `${field} inválido`, 400);
    const trimmed = value.trim();
    check(trimmed.length >= Math.max(min, 1) && trimmed.length <= max, 'INVALID_REQUEST',
      `${field} debe tener entre ${Math.max(min, 1)} y ${max} caracteres`, 400);
    return trimmed;
  }

  async function markPaid(actor, restaurantId, body = {}) {
    requirePlatform(actor);
    check(body && typeof body === 'object' && !Array.isArray(body)
      && Object.keys(body).every(key => ['period', 'reference', 'note'].includes(key)), 'INVALID_REQUEST', 'Parámetros inválidos', 400);
    const today = at();
    check(typeof body.period === 'string', 'INVALID_PERIOD', 'Indica el mes', 400);
    const period = parsePeriod(body.period, today);
    const reference = text(body.reference, { min: 3, max: 200, field: 'La referencia del pago' });
    const note = text(body.note, { min: 0, max: 500, field: 'La nota' });
    return global(async () => {
      const restaurant = await restaurantOf(restaurantId);
      const changed = await db.marketplaceCommissionStatement.updateMany({ where: { restaurantId, period, status: 'ISSUED' },
        data: { status: 'PAID', paidAt: today, paidBy: actor.accountId, paymentReference: reference, paymentNote: note } });
      const row = await db.marketplaceCommissionStatement.findFirst({ where: { restaurantId, period }, select: STORED });
      check(row, 'STATEMENT_NOT_FOUND', 'Ese mes no tiene estado de cuenta emitido', 404);
      if (changed.count === 1) return { statement: storedView(row, restaurant.name), replayed: false };
      // Reintento del mismo pago: misma respuesta. Otro pago distinto sobre uno ya pagado: conflicto.
      check(row.status === 'PAID' && row.paymentReference === reference, 'ALREADY_PAID', 'Ese estado de cuenta ya está pagado', 409);
      return { statement: storedView(row, restaurant.name), replayed: true };
    });
  }

  // ── comercio ───────────────────────────────────────────────────────────────
  async function merchantStatements(actor, query = {}) {
    requireActor(actor);
    const restaurantId = query?.restaurantId ?? actor.restaurantId;
    const restaurant = await restaurantOf(restaurantId);
    check(await canSee(actor, restaurant), 'MERCHANT_FORBIDDEN', 'No tienes permiso sobre este comercio', 403);
    const today = at();
    const period = parsePeriod(query?.period, today);
    const history = await db.marketplaceCommissionStatement.findMany({ where: { restaurantId: restaurant.id },
      select: STORED_SUMMARY, orderBy: { period: 'desc' }, take: HISTORY });
    return { currentPeriod: periodOf(today), statement: await detail(restaurant, period, today),
      history: history.map(row => storedView(row, restaurant.name)) };
  }

  return { listPeriod, merchantDetail, issue, markPaid, merchantStatements };
}

module.exports = { createCommissionStatements, CommissionError, periodRange, periodOf, parsePeriod, hashLines, TIME_ZONE };
