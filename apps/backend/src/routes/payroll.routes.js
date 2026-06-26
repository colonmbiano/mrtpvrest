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
const { round2 } = require('../lib/money');

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
  // discountPct es un override opcional (null = usa el default del negocio).
  out.discountPct = profile.discountPct == null ? null : Number(profile.discountPct);
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

    const data = pick(req.body, ['periodLengthDays', 'defaultPayType', 'tipPolicy', 'currency', 'fiscalEnabled', 'employeeDiscountPct']);
    if (data.periodLengthDays != null) {
      const n = Number(data.periodLengthDays);
      if (!Number.isInteger(n) || n < 1 || n > 90) {
        return res.status(400).json({ error: 'periodLengthDays debe ser un entero entre 1 y 90' });
      }
      data.periodLengthDays = n;
    }
    if (data.employeeDiscountPct != null) {
      const n = Number(data.employeeDiscountPct);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return res.status(400).json({ error: 'employeeDiscountPct debe estar entre 0 y 100' });
      }
      data.employeeDiscountPct = n;
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

    const data = pick(req.body, ['payType', 'dailyRate', 'hourlyRate', 'fixedAmount', 'perDeliveryRate', 'isActive', 'notes', 'discountPct']);
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
    // discountPct: null limpia el override (usa default); número 0-100 lo fija.
    if ('discountPct' in data) {
      if (data.discountPct === null || data.discountPct === '') {
        data.discountPct = null;
      } else {
        const n = Number(data.discountPct);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          return res.status(400).json({ error: 'discountPct debe estar entre 0 y 100' });
        }
        data.discountPct = n;
      }
    }

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
  const [shifts, pendingCharges] = await Promise.all([
    empIds.length
      ? prisma.employeeShift.findMany({
          where: { employeeId: { in: empIds }, startAt: { gte: from, lte: to } },
          select: { employeeId: true, startAt: true, endAt: true },
        })
      : [],
    // Cargos a cuenta PENDIENTES (consumo + anticipos + ajustes) que aún no se
    // liquidan en ninguna raya. Se descuentan del neto del periodo, sin filtro
    // de fecha: el empleado los debe hasta que una corrida pagada los liquide.
    empIds.length
      ? prisma.employeeCharge.groupBy({
          by: ['employeeId'],
          where: { restaurantId, employeeId: { in: empIds }, status: 'PENDING' },
          _sum: { amount: true },
        })
      : [],
  ]);

  const shiftsByEmp = new Map(empIds.map((id) => [id, []]));
  for (const s of shifts) shiftsByEmp.get(s.employeeId)?.push(s);

  const pendingByEmp = new Map(
    pendingCharges.map((c) => [c.employeeId, Number(c._sum.amount || 0)]),
  );

  return employees.map((e) => {
    const profile = effectiveProfile(e.payProfile, config);
    const advancesDeducted = pendingByEmp.get(e.id) || 0;
    const calc = buildItemComputation({
      profile,
      shifts: shiftsByEmp.get(e.id) || [],
      extras: { advancesDeducted },
    });
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
// { payMethod } se aplica a los renglones sin método. Al pagar se LIQUIDAN los
// cargos a cuenta de cada empleado (PENDING → SETTLED, ligados a esta corrida):
// re-sincronizamos advancesDeducted con lo realmente liquidado dentro de la
// misma $transaction, así lo descontado del neto = lo que se marcó como saldado
// (sin drift si llegaron/cancelaron cargos entre el borrador y el pago).
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

      // Liquidar cargos a cuenta de los empleados con renglón en esta corrida.
      const items = await tx.payrollItem.findMany({
        where: { periodId: period.id },
        select: {
          id: true, employeeId: true, advancesDeducted: true,
          gross: true, tips: true, commission: true, additions: true, deductions: true,
        },
      });
      const empIds = items.filter((i) => i.employeeId).map((i) => i.employeeId);
      if (empIds.length) {
        const sums = await tx.employeeCharge.groupBy({
          by: ['employeeId'],
          where: { restaurantId, employeeId: { in: empIds }, status: 'PENDING' },
          _sum: { amount: true },
        });
        const sumByEmp = new Map(sums.map((s) => [s.employeeId, Number(s._sum.amount || 0)]));

        await tx.employeeCharge.updateMany({
          where: { restaurantId, employeeId: { in: empIds }, status: 'PENDING' },
          data: { status: 'SETTLED', settledPeriodId: period.id, settledAt: new Date() },
        });

        // Re-sincronizar advancesDeducted/net de cada renglón con lo liquidado.
        for (const it of items) {
          if (!it.employeeId) continue;
          const adv = round2(sumByEmp.get(it.employeeId) || 0);
          if (round2(Number(it.advancesDeducted)) === adv) continue;
          const net = round2(
            Number(it.gross) + Number(it.tips) + Number(it.commission) +
            Number(it.additions) - adv - Number(it.deductions),
          );
          await tx.payrollItem.update({
            where: { id: it.id },
            data: { advancesDeducted: adv, net },
          });
        }
        const agg = await tx.payrollItem.aggregate({ where: { periodId: period.id }, _sum: { net: true } });
        await tx.payrollPeriod.update({ where: { id: period.id }, data: { totalNet: agg._sum.net || 0 } });
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

// ── CAJA DE EMPLEADO (cargos a cuenta + anticipos) ───────────────────────────
// Los cargos CONSUMPTION normalmente los crea el TPV al cobrar una orden "a
// cuenta de empleado" (orders.routes → POST /:id/charge-to-employee). Aquí el
// admin consulta saldos y captura anticipos/ajustes manuales.

// GET /api/payroll/charges/balance?locationId= — saldo PENDIENTE por empleado.
router.get('/charges/balance', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const locationId = resolveLocationId(req, req.query);
    const where = locationId
      ? { locationId, location: { restaurantId } }
      : { location: { restaurantId } };
    const employees = await prisma.employee.findMany({
      where: { ...where, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true },
    });
    const empIds = employees.map((e) => e.id);
    const sums = empIds.length
      ? await prisma.employeeCharge.groupBy({
          by: ['employeeId'],
          where: { restaurantId, employeeId: { in: empIds }, status: 'PENDING' },
          _sum: { amount: true },
        })
      : [];
    const byEmp = new Map(sums.map((s) => [s.employeeId, Number(s._sum.amount || 0)]));
    const rows = employees.map((e) => ({
      employeeId: e.id, name: e.name, role: e.role,
      pending: round2(byEmp.get(e.id) || 0),
    }));
    const totalPending = round2(rows.reduce((s, r) => s + r.pending, 0));
    res.json({ totalPending, employees: rows });
  } catch (e) { console.error('GET /payroll/charges/balance:', e); res.status(500).json({ error: e.message }); }
});

// GET /api/payroll/charges?status=&employeeId=&locationId=&limit= — lista cargos.
router.get('/charges', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const { status, employeeId } = req.query;
    const locationId = resolveLocationId(req, req.query);
    const take = Math.min(Number(req.query.limit) || 100, 300);
    const where = { restaurantId };
    if (status && ['PENDING', 'SETTLED', 'CANCELLED'].includes(status)) where.status = status;
    if (employeeId) where.employeeId = String(employeeId);
    if (locationId) where.locationId = locationId;
    const charges = await prisma.employeeCharge.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: { order: { select: { id: true, orderNumber: true, total: true } } },
    });
    res.json(charges);
  } catch (e) { console.error('GET /payroll/charges:', e); res.status(500).json({ error: e.message }); }
});

// POST /api/payroll/charges — alta manual de un anticipo o ajuste (o consumo
// suelto) capturado por el admin. Body: { employeeId, type, amount, note }.
// Solo ADJUSTMENT admite monto negativo (saldo a favor del empleado).
router.post('/charges', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const data = pick(req.body, ['employeeId', 'type', 'amount', 'note', 'locationId']);
    const employeeId = String(data.employeeId || '');
    if (!employeeId) return res.status(400).json({ error: 'employeeId requerido' });

    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, location: { restaurantId } },
      select: { id: true, name: true, locationId: true },
    });
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado en este restaurante' });

    const type = ['CONSUMPTION', 'ADVANCE', 'ADJUSTMENT'].includes(data.type) ? data.type : 'ADVANCE';
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ error: 'amount debe ser un número distinto de 0' });
    }
    if (amount < 0 && type !== 'ADJUSTMENT') {
      return res.status(400).json({ error: 'Solo un ADJUSTMENT puede ser negativo' });
    }

    const charge = await prisma.employeeCharge.create({
      data: {
        restaurantId,
        locationId: emp.locationId || data.locationId || null,
        employeeId: emp.id,
        employeeName: emp.name,
        type,
        status: 'PENDING',
        amount: round2(amount),
        note: typeof data.note === 'string' ? data.note.slice(0, 300) : null,
        createdById: req.user?.id || null,
      },
    });
    res.status(201).json(charge);
  } catch (e) { console.error('POST /payroll/charges:', e); res.status(500).json({ error: e.message }); }
});

// POST /api/payroll/charges/:id/cancel — anula un cargo PENDIENTE (no liquidado).
router.post('/charges/:id/cancel', ...guard, async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req);
    const charge = await prisma.employeeCharge.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!charge) return res.status(404).json({ error: 'Cargo no encontrado' });
    if (charge.status !== 'PENDING') {
      return res.status(409).json({ error: 'Solo se puede anular un cargo pendiente' });
    }
    const updated = await prisma.employeeCharge.update({
      where: { id: charge.id },
      data: { status: 'CANCELLED' },
    });
    res.json(updated);
  } catch (e) { console.error('POST /payroll/charges/:id/cancel:', e); res.status(500).json({ error: e.message }); }
});

module.exports = router;
