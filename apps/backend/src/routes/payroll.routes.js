'use strict';

// ───────────────────────────────────────────────────────────────────────────
// payroll.routes.js — Nómina ("la raya"). Control interno del pago a empleados.
//
// Esquema por defecto: pago POR DÍA TRABAJADO. Un día cuenta cuando el empleado
// tiene al menos un EmployeeShift (clock-in) ese día → las faltas se descuentan
// solas. El periodo de la raya es configurable en días (PayrollConfig).
//
// Capa fiscal (CFDI/IMSS) es OPCIONAL y se prende con PayrollConfig.fiscalEnabled
// (no implementada en esta fase; el flag solo se persiste).
//
// Gating: autenticación + tenant + permiso manage_users + módulo 'payroll'.
// Todo el dinero se computa en el servidor (lib/payroll.js); nunca se confía en
// montos del cliente. Modelos tenant-scoped por restaurantId (tenant-guard).
// ───────────────────────────────────────────────────────────────────────────

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess, requirePermission } = require('../middleware/auth.middleware');
const { requireModule, MODULES } = require('../lib/modules');
const { pick } = require('../lib/validate');
const { localDayRange } = require('../utils/dayRange');
const { buildItemComputation } = require('../lib/payroll');

const router = express.Router();

const gatePayroll = requireModule(MODULES.MODULE_PAYROLL);
const guard = [authenticate, requireTenantAccess, requirePermission('manage_users'), gatePayroll];

// Campos numéricos del perfil de pago — los normalizamos a Number para el
// cálculo (Prisma los entrega como Decimal) y para no arrastrar objetos Decimal.
const RATE_FIELDS = ['dailyRate', 'hourlyRate', 'fixedAmount', 'perDeliveryRate'];
function profileToNumbers(profile) {
  if (!profile) return null;
  const out = { ...profile, payType: profile.payType || 'DAILY' };
  for (const f of RATE_FIELDS) out[f] = Number(profile[f] || 0);
  return out;
}

// Perfil efectivo de un empleado: el suyo o uno default (rate 0) según la config.
function effectiveProfile(profile, config) {
  return profileToNumbers(profile) || {
    payType: config?.defaultPayType || 'DAILY',
    dailyRate: 0, hourlyRate: 0, fixedAmount: 0, perDeliveryRate: 0,
    isActive: true, _missing: true,
  };
}

function resolveRestaurantId(req) {
  return req.restaurantId || req.user?.restaurantId || null;
}
function resolveLocationId(req, bodyOrQuery) {
  return (bodyOrQuery && bodyOrQuery.locationId) || req.locationId ||
    req.headers['x-location-id'] || req.user?.locationId || null;
}

// requireTenantAccess NO valida un locationId provisto por el cliente contra el
// tenant (solo compara el tenant del JWT vs el del subdominio). Como Location no
// está en SCOPED_MODELS, un admin podría pasar un locationId de otro restaurante.
// Verificamos pertenencia explícitamente antes de tocar datos por sucursal
// (mismo patrón que la auditoría de inventario: where location.restaurantId).
async function locationBelongsToRestaurant(restaurantId, locationId) {
  if (!restaurantId || !locationId) return false;
  const loc = await prisma.location.findFirst({
    where: { id: locationId, restaurantId },
    select: { id: true },
  });
  return Boolean(loc);
}

// ── CONFIG ───────────────────────────────────────────────────────────────────

// GET /api/payroll/config — config del restaurante (o defaults si no existe).
router.get('/config', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const cfg = await prisma.payrollConfig.findUnique({ where: { restaurantId } });
    res.json(cfg || {
      restaurantId, periodLengthDays: 7, defaultPayType: 'DAILY',
      tipPolicy: 'INDIVIDUAL', currency: 'MXN', fiscalEnabled: false, _default: true,
    });
  } catch (e) { console.error('GET /payroll/config:', e); res.status(500).json({ error: e.message }); }
});

// PUT /api/payroll/config — upsert de la config (allowlist contra mass-assign).
router.put('/config', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const data = pick(req.body, ['periodLengthDays', 'defaultPayType', 'tipPolicy', 'currency', 'fiscalEnabled']);
    if (data.periodLengthDays != null) {
      const n = Number(data.periodLengthDays);
      if (!Number.isInteger(n) || n < 1 || n > 90) {
        return res.status(400).json({ error: 'periodLengthDays debe ser un entero entre 1 y 90' });
      }
      data.periodLengthDays = n;
    }
    if (data.defaultPayType && !['DAILY', 'HOURLY', 'WEEKLY_FIXED', 'PER_DELIVERY'].includes(data.defaultPayType)) {
      return res.status(400).json({ error: 'defaultPayType inválido' });
    }
    if (data.tipPolicy && !['INDIVIDUAL', 'POOL_BY_ROLE', 'POOL_ALL'].includes(data.tipPolicy)) {
      return res.status(400).json({ error: 'tipPolicy inválido' });
    }
    if (data.fiscalEnabled != null) data.fiscalEnabled = Boolean(data.fiscalEnabled);

    const cfg = await prisma.payrollConfig.upsert({
      where: { restaurantId },
      create: { restaurantId, ...data },
      update: data,
    });
    res.json(cfg);
  } catch (e) { console.error('PUT /payroll/config:', e); res.status(500).json({ error: e.message }); }
});

// ── PERFILES DE PAGO (tarifas por empleado) ──────────────────────────────────

// GET /api/payroll/profiles?locationId= — empleados activos + su perfil de pago.
router.get('/profiles', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const locationId = resolveLocationId(req, req.query);
    // Siempre acotar al restaurante (Location no está en SCOPED_MODELS).
    const where = locationId
      ? { locationId, location: { restaurantId } }
      : { location: { restaurantId } };

    const employees = await prisma.employee.findMany({
      where: { ...where, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, role: true, isActive: true, locationId: true,
        payProfile: true,
      },
    });
    res.json(employees.map((e) => ({
      employeeId: e.id, name: e.name, role: e.role, isActive: e.isActive,
      locationId: e.locationId,
      profile: profileToNumbers(e.payProfile),
    })));
  } catch (e) { console.error('GET /payroll/profiles:', e); res.status(500).json({ error: e.message }); }
});

// PUT /api/payroll/profiles/:employeeId — upsert del perfil de pago del empleado.
router.put('/profiles/:employeeId', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const employeeId = req.params.employeeId;

    // El empleado debe pertenecer al restaurante (anti-IDOR cross-tenant).
    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, location: { restaurantId } },
      select: { id: true },
    });
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado en este restaurante' });

    const data = pick(req.body, ['payType', 'dailyRate', 'hourlyRate', 'fixedAmount', 'perDeliveryRate', 'isActive', 'notes']);
    if (data.payType && !['DAILY', 'HOURLY', 'WEEKLY_FIXED', 'PER_DELIVERY'].includes(data.payType)) {
      return res.status(400).json({ error: 'payType inválido' });
    }
    for (const f of RATE_FIELDS) {
      if (data[f] != null) {
        const n = Number(data[f]);
        if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: `${f} debe ser un número >= 0` });
        data[f] = n;
      }
    }
    if (data.isActive != null) data.isActive = Boolean(data.isActive);

    const profile = await prisma.employeePayProfile.upsert({
      where: { employeeId },
      create: { employeeId, restaurantId, ...data },
      update: data,
    });
    res.json(profileToNumbers(profile));
  } catch (e) { console.error('PUT /payroll/profiles/:id:', e); res.status(500).json({ error: e.message }); }
});

// ── CÁLCULO DE LA RAYA (corridas) ─────────────────────────────────────────────

// Calcula los renglones (sin persistir) de un periodo: por cada empleado activo
// de la sucursal, días trabajados desde EmployeeShift en [from, to] → bruto/neto.
async function computePeriodItems({ restaurantId, locationId, from, to }) {
  const [config, employees] = await Promise.all([
    prisma.payrollConfig.findUnique({ where: { restaurantId } }),
    prisma.employee.findMany({
      where: { locationId, location: { restaurantId }, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true, payProfile: true },
    }),
  ]);

  const empIds = employees.map((e) => e.id);
  const shifts = empIds.length
    ? await prisma.employeeShift.findMany({
        where: { employeeId: { in: empIds }, startAt: { gte: from, lte: to } },
        select: { employeeId: true, startAt: true, endAt: true },
      })
    : [];

  const shiftsByEmp = new Map(empIds.map((id) => [id, []]));
  for (const s of shifts) shiftsByEmp.get(s.employeeId)?.push(s);

  return employees.map((e) => {
    const profile = effectiveProfile(e.payProfile, config);
    const calc = buildItemComputation({ profile, shifts: shiftsByEmp.get(e.id) || [] });
    return {
      employeeId: e.id,
      employeeName: e.name,
      role: e.role,
      needsProfile: Boolean(profile._missing),
      ...calc,
    };
  });
}

// Resuelve [from, to] del periodo desde query/body (YYYY-MM-DD en hora MX).
// Default: últimos `periodLengthDays` de la config terminando hoy.
async function resolvePeriodRange(restaurantId, src) {
  let fromStr = src.from;
  let toStr = src.to;
  if (!fromStr || !toStr) {
    const cfg = await prisma.payrollConfig.findUnique({ where: { restaurantId } });
    const len = cfg?.periodLengthDays || 7;
    const today = localDayRange();
    const fromDate = new Date(today.from.getTime() - (len - 1) * 24 * 60 * 60 * 1000);
    return { from: fromDate, to: today.to };
  }
  const from = localDayRange(fromStr).from;
  const to = localDayRange(toStr).to;
  return { from, to };
}

// GET /api/payroll/periods/preview?locationId=&from=&to= — cálculo en vivo sin
// guardar. Lo usa el wizard "cerrar la raya" para mostrar antes de confirmar.
router.get('/periods/preview', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const locationId = resolveLocationId(req, req.query);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    if (!(await locationBelongsToRestaurant(restaurantId, locationId))) {
      return res.status(403).json({ error: 'Sucursal no pertenece a tu restaurante' });
    }
    const { from, to } = await resolvePeriodRange(restaurantId, req.query);
    if (to < from) return res.status(400).json({ error: 'Rango inválido (to < from)' });

    const items = await computePeriodItems({ restaurantId, locationId, from, to });
    const totalNet = items.reduce((s, it) => s + Number(it.net || 0), 0);
    res.json({ periodFrom: from, periodTo: to, totalNet, items });
  } catch (e) { console.error('GET /payroll/periods/preview:', e); res.status(500).json({ error: e.message }); }
});

// GET /api/payroll/periods?locationId=&limit= — corridas recientes.
router.get('/periods', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const locationId = resolveLocationId(req, req.query);
    const take = Math.min(Number(req.query.limit) || 30, 100);
    const periods = await prisma.payrollPeriod.findMany({
      where: { restaurantId, ...(locationId ? { locationId } : {}) },
      orderBy: { periodFrom: 'desc' },
      take,
      include: { _count: { select: { items: true } } },
    });
    res.json(periods);
  } catch (e) { console.error('GET /payroll/periods:', e); res.status(500).json({ error: e.message }); }
});

// POST /api/payroll/periods — crea la corrida (DRAFT) calculando los renglones
// server-side desde los turnos. Body: { locationId, from, to }.
router.post('/periods', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const locationId = resolveLocationId(req, req.body);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    if (!(await locationBelongsToRestaurant(restaurantId, locationId))) {
      return res.status(403).json({ error: 'Sucursal no pertenece a tu restaurante' });
    }
    const { from, to } = await resolvePeriodRange(restaurantId, req.body);
    if (to < from) return res.status(400).json({ error: 'Rango inválido (to < from)' });

    const computed = await computePeriodItems({ restaurantId, locationId, from, to });
    const totalNet = Number(computed.reduce((s, it) => s + Number(it.net || 0), 0).toFixed(2));

    const period = await prisma.$transaction(async (tx) => {
      const p = await tx.payrollPeriod.create({
        data: {
          restaurantId, locationId, periodFrom: from, periodTo: to,
          status: 'DRAFT', totalNet, createdById: req.user?.id || null,
          notes: typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 500) : null,
        },
      });
      if (computed.length) {
        await tx.payrollItem.createMany({
          data: computed.map((it) => ({
            restaurantId, periodId: p.id,
            employeeId: it.employeeId, employeeName: it.employeeName, role: it.role,
            payType: it.payType, daysWorked: it.daysWorked, rate: it.rate,
            gross: it.gross, tips: it.tips, commission: it.commission,
            additions: it.additions, advancesDeducted: it.advancesDeducted,
            deductions: it.deductions, net: it.net,
          })),
        });
      }
      return p;
    });

    const full = await prisma.payrollPeriod.findUnique({
      where: { id: period.id },
      include: { items: { orderBy: { employeeName: 'asc' } } },
    });
    res.status(201).json(full);
  } catch (e) { console.error('POST /payroll/periods:', e); res.status(500).json({ error: e.message }); }
});

// GET /api/payroll/periods/:id — corrida con sus renglones.
router.get('/periods/:id', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const period = await prisma.payrollPeriod.findFirst({
      where: { id: req.params.id, restaurantId },
      include: { items: { orderBy: { employeeName: 'asc' } }, location: { select: { id: true, name: true } } },
    });
    if (!period) return res.status(404).json({ error: 'Corrida no encontrada' });
    res.json(period);
  } catch (e) { console.error('GET /payroll/periods/:id:', e); res.status(500).json({ error: e.message }); }
});

// POST /api/payroll/periods/:id/recompute — recalcula renglones desde turnos.
// Solo en DRAFT (no se recalcula una corrida aprobada/pagada).
router.post('/periods/:id/recompute', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const period = await prisma.payrollPeriod.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!period) return res.status(404).json({ error: 'Corrida no encontrada' });
    if (period.status !== 'DRAFT') return res.status(409).json({ error: 'Solo se puede recalcular una corrida en borrador' });

    const computed = await computePeriodItems({
      restaurantId, locationId: period.locationId, from: period.periodFrom, to: period.periodTo,
    });
    const totalNet = Number(computed.reduce((s, it) => s + Number(it.net || 0), 0).toFixed(2));

    await prisma.$transaction(async (tx) => {
      await tx.payrollItem.deleteMany({ where: { periodId: period.id } });
      if (computed.length) {
        await tx.payrollItem.createMany({
          data: computed.map((it) => ({
            restaurantId, periodId: period.id,
            employeeId: it.employeeId, employeeName: it.employeeName, role: it.role,
            payType: it.payType, daysWorked: it.daysWorked, rate: it.rate,
            gross: it.gross, tips: it.tips, commission: it.commission,
            additions: it.additions, advancesDeducted: it.advancesDeducted,
            deductions: it.deductions, net: it.net,
          })),
        });
      }
      await tx.payrollPeriod.update({ where: { id: period.id }, data: { totalNet } });
    });

    const full = await prisma.payrollPeriod.findUnique({
      where: { id: period.id }, include: { items: { orderBy: { employeeName: 'asc' } } },
    });
    res.json(full);
  } catch (e) { console.error('POST /payroll/periods/:id/recompute:', e); res.status(500).json({ error: e.message }); }
});

// PUT /api/payroll/periods/:id/items/:itemId — ajustes manuales de un renglón
// (bonos/adiciones, deducciones, método de pago, notas) — solo en DRAFT.
// Recalcula el neto server-side y el totalNet de la corrida.
router.put('/periods/:id/items/:itemId', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const period = await prisma.payrollPeriod.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!period) return res.status(404).json({ error: 'Corrida no encontrada' });
    if (period.status !== 'DRAFT') return res.status(409).json({ error: 'Solo se editan renglones en borrador' });

    const item = await prisma.payrollItem.findFirst({ where: { id: req.params.itemId, periodId: period.id } });
    if (!item) return res.status(404).json({ error: 'Renglón no encontrado' });

    const patch = pick(req.body, ['additions', 'deductions', 'tips', 'commission', 'payMethod', 'notes']);
    for (const f of ['additions', 'deductions', 'tips', 'commission']) {
      if (patch[f] != null) {
        const n = Number(patch[f]);
        if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: `${f} debe ser un número >= 0` });
        patch[f] = n;
      }
    }
    if (patch.payMethod && !['CASH', 'TRANSFER'].includes(patch.payMethod)) {
      return res.status(400).json({ error: 'payMethod inválido (CASH|TRANSFER)' });
    }

    const merged = { ...item, ...patch };
    // round2 vive en lib/payroll vía money; recomputamos el neto con los montos.
    const net = Number(
      (Number(merged.gross) + Number(merged.tips) + Number(merged.commission) +
        Number(merged.additions) - Number(merged.advancesDeducted) - Number(merged.deductions)).toFixed(2),
    );

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.payrollItem.update({ where: { id: item.id }, data: { ...patch, net } });
      const agg = await tx.payrollItem.aggregate({ where: { periodId: period.id }, _sum: { net: true } });
      await tx.payrollPeriod.update({ where: { id: period.id }, data: { totalNet: agg._sum.net || 0 } });
      return u;
    });
    res.json(updated);
  } catch (e) { console.error('PUT /payroll/periods/:id/items/:itemId:', e); res.status(500).json({ error: e.message }); }
});

// POST /api/payroll/periods/:id/approve — DRAFT → APPROVED.
router.post('/periods/:id/approve', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const period = await prisma.payrollPeriod.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!period) return res.status(404).json({ error: 'Corrida no encontrada' });
    if (period.status !== 'DRAFT') return res.status(409).json({ error: 'Solo se aprueba una corrida en borrador' });
    const updated = await prisma.payrollPeriod.update({
      where: { id: period.id },
      data: { status: 'APPROVED', approvedById: req.user?.id || null, approvedAt: new Date() },
    });
    res.json(updated);
  } catch (e) { console.error('POST /payroll/periods/:id/approve:', e); res.status(500).json({ error: e.message }); }
});

// POST /api/payroll/periods/:id/pay — marca la corrida como PAGADA. Body opcional
// { payMethod } se aplica a los renglones sin método. (La salida de caja real va
// en la Fase 2: aquí solo se registra el pago para control.)
router.post('/periods/:id/pay', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const period = await prisma.payrollPeriod.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!period) return res.status(404).json({ error: 'Corrida no encontrada' });
    if (period.status === 'PAID') return res.status(409).json({ error: 'La corrida ya está pagada' });

    const payMethod = ['CASH', 'TRANSFER'].includes(req.body?.payMethod) ? req.body.payMethod : null;

    const updated = await prisma.$transaction(async (tx) => {
      if (payMethod) {
        await tx.payrollItem.updateMany({
          where: { periodId: period.id, payMethod: null },
          data: { payMethod },
        });
      }
      return tx.payrollPeriod.update({
        where: { id: period.id },
        data: { status: 'PAID', paidById: req.user?.id || null, paidAt: new Date() },
      });
    });
    res.json(updated);
  } catch (e) { console.error('POST /payroll/periods/:id/pay:', e); res.status(500).json({ error: e.message }); }
});

// DELETE /api/payroll/periods/:id — elimina una corrida no pagada.
router.delete('/periods/:id', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const period = await prisma.payrollPeriod.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!period) return res.status(404).json({ error: 'Corrida no encontrada' });
    if (period.status === 'PAID') return res.status(409).json({ error: 'No se puede borrar una corrida pagada' });
    await prisma.payrollPeriod.delete({ where: { id: period.id } }); // items en cascade
    res.json({ ok: true });
  } catch (e) { console.error('DELETE /payroll/periods/:id:', e); res.status(500).json({ error: e.message }); }
});

module.exports = router;
