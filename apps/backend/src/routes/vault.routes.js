// vault.routes.js
//
// Bóveda: el dinero del negocio que ya salió de la gaveta del turno, en dos
// bolsas — efectivo (CASH) y banco (DIGITAL). Ver el modelo y las invariantes
// en packages/database/prisma/schema.prisma (model Vault) y la mecánica en
// src/lib/vault.js.
//
//   GET  /api/vault            → saldos + últimos movimientos
//   GET  /api/vault/weekly     → corte semanal (lun–dom, hora de México)
//   POST /api/vault/movements  → depósito o retiro manual en un canal
//
// Lectura: cualquiera que pueda registrar gastos (el cajero ya ve el dinero
// del negocio; ocultarle el saldo no protege nada y rompe el UX del TPV).
// Escritura: retirar EFECTIVO exige rol de mando o PIN admin (vaultDenied).

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { round2 } = require('../lib/money');
const { applyVaultMovement, vaultDenied } = require('../lib/vault');
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireFeatureFlag } = require('../lib/modules');
const { startOfLocalWeek, DEFAULT_TZ } = require('../utils/dayRange');
const router = express.Router();

router.use(authenticate, requireTenantAccess, requireFeatureFlag('hasInventory', 'Inventario y costeo'));

const ALLOWED_ROLES = ['CASHIER', 'WAITER', 'KITCHEN', 'ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'];
const VALID_TYPES = ['DEPOSIT', 'WITHDRAWAL'];
const VALID_CHANNELS = ['CASH', 'DIGITAL'];

const DAY_MS = 24 * 60 * 60 * 1000;

// Resuelve la sucursal del request y valida que sea del restaurante (anti-IDOR
// cross-tenant: el guard de Prisma protege el modelo, pero el locationId del
// query lo manda el cliente).
async function resolveLocationId(req) {
  const queried = req.query.locationId ? String(req.query.locationId) : null;
  if (!queried) return req.locationId || req.user?.locationId || null;
  const restaurantId = req.restaurantId || req.user?.restaurantId;
  const loc = await prisma.location.findFirst({
    where: { id: queried, restaurantId },
    select: { id: true },
  });
  return loc?.id || null;
}

// ── GET /api/vault ───────────────────────────────────────────────────────
// Saldos actuales + últimos movimientos. `limit` acota la lista (default 50).
router.get('/', async (req, res) => {
  try {
    const userRole = req.user?.role || 'CUSTOMER';
    if (!ALLOWED_ROLES.includes(userRole)) {
      return res.status(403).json({ error: 'Rol sin permiso para ver la bóveda' });
    }
    const locationId = await resolveLocationId(req);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const vault = await prisma.vault.findUnique({
      where: { locationId },
      select: { id: true, balanceCash: true, balanceDigital: true, updatedAt: true },
    });

    // Bóveda que aún no existe = saldos en cero. No la creamos en un GET.
    if (!vault) {
      return res.json({ balanceCash: 0, balanceDigital: 0, locationId, movements: [], updatedAt: null });
    }

    const movements = await prisma.vaultMovement.findMany({
      where: { vaultId: vault.id },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    res.json({
      balanceCash: Number(vault.balanceCash),
      balanceDigital: Number(vault.balanceDigital),
      locationId,
      updatedAt: vault.updatedAt,
      movements,
    });
  } catch (e) {
    console.error('GET /api/vault:', e);
    res.status(500).json({ error: 'Error al leer la bóveda: ' + e.message });
  }
});

// ── GET /api/vault/weekly ────────────────────────────────────────────────
// Corte semanal (lunes a domingo, hora de México), separado por canal.
// Responde la pregunta real del dueño: "esta semana, ¿cuánto me gasté del
// dinero acumulado, y de qué bolsa salió?".
//
// El agrupado se hace en JS y no en SQL crudo a propósito: `$queryRaw` no pasa
// por el tenant-guard (ver CLAUDE.md), y el volumen de movimientos de bóveda
// es de decenas por semana, no de millones.
router.get('/weekly', async (req, res) => {
  try {
    const userRole = req.user?.role || 'CUSTOMER';
    if (!ALLOWED_ROLES.includes(userRole)) {
      return res.status(403).json({ error: 'Rol sin permiso para ver la bóveda' });
    }
    const locationId = await resolveLocationId(req);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const weeks = Math.min(Math.max(Number(req.query.weeks) || 8, 1), 52);
    const currentWeekStart = startOfLocalWeek(new Date());
    // Retrocedemos semana a semana anclando al mediodía: si en el camino hay un
    // cambio de horario, `startOfLocalWeek` lo reabsorbe.
    const from = startOfLocalWeek(new Date(currentWeekStart.getTime() - (weeks - 1) * 7 * DAY_MS + 12 * 60 * 60 * 1000));

    const movements = await prisma.vaultMovement.findMany({
      where: { locationId, occurredAt: { gte: from } },
      orderBy: { occurredAt: 'asc' },
      select: {
        id: true, type: true, source: true, channel: true, amount: true,
        occurredAt: true, purchaseOrderId: true, operatingExpenseId: true,
      },
    });

    const emptyChannel = () => ({
      deposits: 0,
      withdrawals: 0,
      purchases: 0, // compras de insumos pagadas desde la bóveda
      expenses: 0,  // gastos operativos pagados desde la bóveda
    });

    // Sembramos todas las semanas del rango para que una semana sin
    // movimientos aparezca en cero en vez de desaparecer de la tabla.
    const buckets = new Map();
    for (let i = 0; i < weeks; i++) {
      const start = startOfLocalWeek(new Date(from.getTime() + i * 7 * DAY_MS + 12 * 60 * 60 * 1000));
      buckets.set(start.toISOString(), {
        weekStart: start,
        weekEnd: new Date(start.getTime() + 7 * DAY_MS - 1),
        cash: emptyChannel(),
        digital: emptyChannel(),
        movements: 0,
      });
    }

    for (const m of movements) {
      const b = buckets.get(startOfLocalWeek(m.occurredAt).toISOString());
      if (!b) continue; // fuera del rango sembrado (bordes)
      const bag = m.channel === 'DIGITAL' ? b.digital : b.cash;
      const amt = Number(m.amount);
      b.movements++;

      if (m.type === 'DEPOSIT') {
        bag.deposits = round2(bag.deposits + amt);
        continue;
      }
      bag.withdrawals = round2(bag.withdrawals + amt);
      if (m.source === 'PURCHASE') bag.purchases = round2(bag.purchases + amt);
      else if (m.source === 'EXPENSE') bag.expenses = round2(bag.expenses + amt);
      // SETTLEMENT es un abono a una cuenta por pagar: puede ser de compra o
      // de gasto. Lo clasificamos por el documento al que apunta.
      else if (m.source === 'SETTLEMENT') {
        if (m.purchaseOrderId) bag.purchases = round2(bag.purchases + amt);
        else if (m.operatingExpenseId) bag.expenses = round2(bag.expenses + amt);
      }
    }

    const list = [...buckets.values()]
      .map((b) => ({
        ...b,
        cash: { ...b.cash, net: round2(b.cash.deposits - b.cash.withdrawals) },
        digital: { ...b.digital, net: round2(b.digital.deposits - b.digital.withdrawals) },
        // Totales de la semana sumando ambas bolsas — lo que el dueño lee primero.
        spent: round2(b.cash.withdrawals + b.digital.withdrawals),
      }))
      .sort((a, b) => b.weekStart - a.weekStart); // más reciente primero

    const vault = await prisma.vault.findUnique({
      where: { locationId },
      select: { balanceCash: true, balanceDigital: true },
    });

    res.json({
      locationId,
      timezone: DEFAULT_TZ,
      balanceCash: Number(vault?.balanceCash || 0),
      balanceDigital: Number(vault?.balanceDigital || 0),
      weeks: list,
    });
  } catch (e) {
    console.error('GET /api/vault/weekly:', e);
    res.status(500).json({ error: 'Error al calcular el corte semanal: ' + e.message });
  }
});

// ── POST /api/vault/movements ────────────────────────────────────────────
// Depósito o retiro manual. Body: { type, channel, amount, description, notes?, occurredAt? }
//
// Para el dinero que entra o sale de la bóveda sin pasar por un turno ni por
// una compra: el dueño mete efectivo de su bolsa, o saca del banco.
router.post('/movements', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const userRole = req.user?.role || 'CUSTOMER';
    const { type, channel, amount, description, notes, occurredAt, locationId: bodyLocationId } = req.body || {};

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'type debe ser DEPOSIT o WITHDRAWAL' });
    }
    if (!VALID_CHANNELS.includes(channel)) {
      return res.status(400).json({ error: 'channel debe ser CASH o DIGITAL' });
    }
    // Sacar efectivo de la bóveda a mano tiene el mismo candado que pagar un
    // gasto con ella. Depositar no: meter dinero nunca es el riesgo.
    if (type === 'WITHDRAWAL' && channel === 'CASH') {
      const denied = vaultDenied(req, userRole);
      if (denied) return res.status(402).json(denied);
    } else if (!ALLOWED_ROLES.includes(userRole)) {
      return res.status(403).json({ error: 'Rol sin permiso para mover la bóveda' });
    }

    const amt = round2(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'amount debe ser > 0' });
    }
    if (!description || String(description).trim().length === 0) {
      return res.status(400).json({ error: 'description requerida' });
    }

    // El locationId del body se valida contra el restaurante igual que el del query.
    let locationId = req.locationId || req.user?.locationId || null;
    if (bodyLocationId) {
      const loc = await prisma.location.findFirst({
        where: { id: String(bodyLocationId), restaurantId },
        select: { id: true },
      });
      if (!loc) return res.status(400).json({ error: 'Sucursal no pertenece a este restaurante' });
      locationId = loc.id;
    }
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const movement = await prisma.$transaction((tx) => applyVaultMovement(tx, {
      restaurantId,
      locationId,
      type,
      channel,
      source: 'MANUAL',
      amount: amt,
      description: String(description).trim(),
      notes: notes || null,
      createdById: req.user?.id || null,
      createdByName: req.user?.name || null,
      occurredAt: occurredAt ? new Date(occurredAt) : undefined,
    }));

    res.status(201).json(movement);
  } catch (e) {
    console.error('POST /api/vault/movements:', e);
    res.status(500).json({ error: 'Error al registrar el movimiento: ' + e.message });
  }
});

module.exports = router;
