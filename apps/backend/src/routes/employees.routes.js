const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const rateLimit = require('express-rate-limit');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess, requirePermission } = require('../middleware/auth.middleware');
const { requireModule, MODULES } = require('../lib/modules');
const { mapPermissions, PERM_TO_FLAG, PERMISSION_FLAG_SELECT } = require('../lib/permissions');
const { localDayRange } = require('../utils/dayRange');
const router = express.Router();

// Gate del módulo "employee_management". Aplica solo a CRUD admin
// (POST/PUT/DELETE/GET de listado). NO aplica a /login (PIN del TPV),
// /me (perfil del user logueado), ni /sync (catálogo offline).
const gateEmployees = requireModule(MODULES.MODULE_EMPLOYEES);

// Rate-limit para login con PIN: max 10 intentos / 15 min por IP+location.
// (PIN es 4 dígitos = 10000 combinaciones; sin esto, fuerza bruta tarda < 1min)
// PIN_LOGIN_RATE_MAX solo lo setea el entorno E2E de CI: toda la suite
// Playwright loguea desde la misma IP+location y excedería los 10 intentos.
const pinLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PIN_LOGIN_RATE_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.locationId || 'no-loc'}`,
  message: { error: 'Demasiados intentos de PIN. Espera 15 minutos.' },
});

// Rate-limit para autorizaciones de supervisor (override de permisos):
// max 30 intentos / 15 min por IP+location. Más holgado que el login porque
// un turno con muchos descuentos/anulaciones puede pedir varios overrides.
const overrideLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.locationId || 'no-loc'}`,
  message: { error: 'Demasiados intentos de autorización. Espera 15 minutos.' },
});

const ROLE_DEFAULTS = {
  ADMIN:    { canCharge:true,  canDiscount:true,  canModifyTickets:true,  canDeleteTickets:true,  canConfigSystem:true,  canTakeDelivery:true,  canTakeTakeout:true,  canManageShifts:true,
              canCancelItems:true,  canApplyDiscounts:true,  canReopenTables:true,  canManageUsers:true  },
  CASHIER:  { canCharge:true,  canDiscount:true,  canModifyTickets:true,  canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:false, canTakeTakeout:true,  canManageShifts:true,
              canCancelItems:false, canApplyDiscounts:true,  canReopenTables:false, canManageUsers:false },
  WAITER:   { canCharge:false, canDiscount:false, canModifyTickets:false, canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:false, canTakeTakeout:true,  canManageShifts:false,
              canCancelItems:false, canApplyDiscounts:false, canReopenTables:false, canManageUsers:false },
  DELIVERY: { canCharge:true,  canDiscount:false, canModifyTickets:false, canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:true,  canTakeTakeout:false, canManageShifts:false,
              canCancelItems:false, canApplyDiscounts:false, canReopenTables:false, canManageUsers:false },
  COOK:     { canCharge:false, canDiscount:false, canModifyTickets:false, canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:false, canTakeTakeout:false, canManageShifts:false,
              canCancelItems:false, canApplyDiscounts:false, canReopenTables:false, canManageUsers:false },
};

// FASE 10 · Validación de booleanos. Acepta true/false explícito o
// undefined (deja default). Cualquier otro valor (string truthy, number,
// objeto) se descarta para evitar inyecciones tipo `canManageUsers: "1"`
// que Prisma aceptaría como string pero el schema es Boolean.
function asBoolOrUndef(v) {
  if (v === true || v === false) return v;
  return undefined;
}

// GET /api/employees/me — devuelve sesión actual con restaurante y sucursal
router.get('/me', authenticate, async (req, res) => {
  try {
    if (!req.user?.isEmployee) {
      return res.status(403).json({ error: 'Solo empleados' });
    }
    const emp = await prisma.employee.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        role: true,
        isActive: true,
        ...PERMISSION_FLAG_SELECT,
        location: {
          select: {
            id: true,
            name: true,
            restaurant: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!emp || !emp.location) {
      return res.status(404).json({ error: 'Empleado o sucursal no encontrada' });
    }
    const { location, ...employee } = emp;
    return res.json({
      employee: { ...employee, permissions: mapPermissions(employee) },
      restaurant: location.restaurant,
      location: { id: location.id, name: location.name },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Turno laboral del empleado (clock-in/out) — Meseros v2 Fase 2.2 ─────
// EmployeeShift = jornada del empleado (no confundir con CashShift, que es
// el corte de caja en /api/shifts). El ID sale SIEMPRE del token; nunca de
// la URL — un mesero no puede abrir/cerrar el turno de otro.
// Declarados antes de /:id para que el router no capture "me" como id.

const requireEmployee = (req, res, next) => {
  if (!req.user?.isEmployee) {
    return res.status(403).json({ error: 'Solo empleados (token de PIN del TPV)' });
  }
  next();
};

// GET /api/employees/me/shift — turno abierto del empleado del token (o null)
router.get('/me/shift', authenticate, requireTenantAccess, requireEmployee, async (req, res) => {
  try {
    const shift = await prisma.employeeShift.findFirst({
      where: { employeeId: req.user.id, endAt: null },
      orderBy: { startAt: 'desc' },
    });
    res.json(shift || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/employees/me/shift/start — clock-in. Si había un turno abierto
// lo devuelve tal cual (idempotente): re-entrar a /meseros no duplica turnos.
router.post('/me/shift/start', authenticate, requireTenantAccess, requireEmployee, async (req, res) => {
  try {
    const open = await prisma.employeeShift.findFirst({
      where: { employeeId: req.user.id, endAt: null },
      orderBy: { startAt: 'desc' },
    });
    if (open) return res.json(open);
    const shift = await prisma.employeeShift.create({
      data: { employeeId: req.user.id },
    });
    res.json(shift);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/employees/me/shift/end — clock-out de todos los turnos abiertos.
router.post('/me/shift/end', authenticate, requireTenantAccess, requireEmployee, async (req, res) => {
  try {
    const { count } = await prisma.employeeShift.updateMany({
      where: { employeeId: req.user.id, endAt: null },
      data: { endAt: new Date() },
    });
    res.json({ ok: true, closed: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/employees/sync — descarga lista para uso offline
router.get('/sync', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const locationId = req.locationId || req.headers['x-location-id'];
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const employees = await prisma.employee.findMany({
      where: { locationId, isActive: true },
      select: {
        id: true,
        name: true,
        role: true,
        offlinePin: true, // SHA256 para validación local
        isActive: true,
        // Flags canónicos para evaluar permisos en el cache offline.
        ...PERMISSION_FLAG_SELECT,
      }
    });

    // Mapear permisos al set canónico (Permission union del TPV). Unificado:
    // canApplyDiscounts||canDiscount → 'apply_discount'. Las columnas legacy
    // sin operación ya no se traducen (quedan deprecadas).
    const formatted = employees.map(e => ({
      id: e.id,
      name: e.name,
      role: e.role,
      pin: e.offlinePin,
      isActive: e.isActive,
      permissions: mapPermissions(e),
      lastSync: Date.now()
    }));

    res.json(formatted);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET todos los empleados (Filtrado por Sucursal)
router.get('/', authenticate, requireTenantAccess, requirePermission('manage_users'), gateEmployees, async (req, res) => {
  try {
    // locationId es OPCIONAL: si se envía, filtramos por sucursal; si no,
    // retornamos todos los empleados del restaurante. Antes 400 cuando
    // faltaba el header tumbaba la lista en restaurantes con una sucursal
    // o admin sin selector activo.
    const locationId =
      req.locationId ||
      req.headers['x-location-id'] ||
      req.user?.locationId ||
      null;

    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Restaurante no identificado' });
    }

    const where = locationId
      ? { locationId }
      : { location: { restaurantId } };

    const employees = await prisma.employee.findMany({
      where,
      include: {
        shifts: { where: { endAt: null }, take: 1, orderBy: { startAt: 'desc' } }
      },
      orderBy: { name: 'asc' }
    });
    // Nunca devolver hashes de PIN al cliente (el panel admin los pre-llenaba
    // en el form y al "Guardar" mandaba el bcrypt como nuevo PIN, generando
    // un 400 silencioso del regex \d{4,6}). hasPin permite UI condicional.
    const safe = employees.map(({ pin, offlinePin, ...rest }) => ({
      ...rest,
      hasPin: Boolean(pin),
    }));
    res.json(safe);
  } catch (e) {
    console.error('GET /api/employees failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /export-activity?from=&to=&role=ALL|DELIVERY|WAITER|... ──────────
// Exporta a CSV la actividad de TODOS los empleados de la sucursal (o de un
// rol) en un rango de días, agrupado por empleado con subtotales y un total
// general. Atribución por rol: DELIVERY→entregas (deliveryDriverId), resto→
// pedidos tomados (createdById). DEBE ir antes de /:id para no matchear el
// param con "export-activity".
const ROLE_ES = { ADMIN: 'Admin', CASHIER: 'Cajero', WAITER: 'Mesero', DELIVERY: 'Repartidor', COOK: 'Cocinero' };

// Sección "Turnos de caja" del CSV: header + builder de fila + acumulador.
const CASH_HEADER = ['Empleado', 'Rol', 'Apertura', 'Cierre', 'Estado', 'Efectivo', 'Tarjeta', 'Transferencia', 'Cortesias', 'Propinas', 'Gastos', 'Fondo inicial', 'Efectivo esperado'];
function cashRow(s, name, rolEs, dFmt, tFmt) {
  const fmtDT = (d) => d ? `${dFmt.format(d)} ${tFmt.format(d)}` : '';
  return [
    name, rolEs, fmtDT(s.openedAt), fmtDT(s.closedAt), s.isOpen ? 'Abierto' : 'Cerrado',
    (s.totalCash || 0).toFixed(2), (s.totalCard || 0).toFixed(2), (s.totalTransfer || 0).toFixed(2),
    (s.totalCourtesy || 0).toFixed(2), (s.totalTips || 0).toFixed(2), (s.totalExpenses || 0).toFixed(2),
    (s.openingFloat || 0).toFixed(2), s.expectedCash != null ? s.expectedCash.toFixed(2) : '',
  ];
}
const CASH_SELECT = {
  employeeId: true, isOpen: true, openedAt: true, closedAt: true, openingFloat: true,
  expectedCash: true, totalCash: true, totalCard: true, totalTransfer: true,
  totalCourtesy: true, totalTips: true, totalExpenses: true,
};

router.get('/export-activity', authenticate, requireTenantAccess, requirePermission('manage_users'), gateEmployees, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const roleFilter = String(req.query.role || 'ALL').toUpperCase();
    const fromStr = req.query.from;
    const toStr = req.query.to || req.query.from;
    const from = localDayRange(fromStr).from;
    const to = localDayRange(toStr).to;
    if (to < from) return res.status(400).json({ error: 'Rango de fechas inválido (to < from)' });

    const empWhere = req.locationId ? { locationId: req.locationId } : { location: { restaurantId } };
    if (roleFilter !== 'ALL') empWhere.role = roleFilter;
    const employees = await prisma.employee.findMany({
      where: empWhere,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true },
    });

    const deliveryIds = employees.filter(e => e.role === 'DELIVERY').map(e => e.id);
    const otherIds = employees.filter(e => e.role !== 'DELIVERY').map(e => e.id);

    const orders = (deliveryIds.length || otherIds.length) ? await prisma.order.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(restaurantId ? { restaurantId } : {}),
        OR: [
          ...(deliveryIds.length ? [{ deliveryDriverId: { in: deliveryIds } }] : []),
          ...(otherIds.length ? [{ createdById: { in: otherIds } }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: {
        orderNumber: true, status: true, orderType: true, paymentMethod: true,
        total: true, cashCollected: true, customerName: true, ticketName: true,
        createdAt: true, deliveryDriverId: true, createdById: true,
      },
    }) : [];

    // Atribuir cada pedido al empleado según su rol (un pedido puede contar
    // para el repartidor que lo entregó y para quien lo tomó: son actividades
    // distintas de empleados distintos).
    const empById = Object.fromEntries(employees.map(e => [e.id, e]));
    const byEmp = Object.fromEntries(employees.map(e => [e.id, []]));
    for (const o of orders) {
      if (o.deliveryDriverId && byEmp[o.deliveryDriverId] && empById[o.deliveryDriverId].role === 'DELIVERY') {
        byEmp[o.deliveryDriverId].push(o);
      }
      if (o.createdById && byEmp[o.createdById] && empById[o.createdById].role !== 'DELIVERY') {
        byEmp[o.createdById].push(o);
      }
    }

    const dFmt = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });
    const tFmt = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });
    const PAY = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', CASH_ON_DELIVERY: 'Efectivo', MP: 'Mercado Pago' };

    const lines = [['Empleado', 'Rol', 'Fecha', 'Hora', 'Folio', 'Cliente', 'Tipo', 'Metodo', 'Estado', 'Total', 'Efectivo cobrado']];
    let grand = 0, grandCount = 0;
    for (const e of employees) {
      const list = byEmp[e.id] || [];
      const live = list.filter(o => o.status !== 'CANCELLED');
      const sub = live.reduce((s, o) => s + (o.total || 0), 0);
      const rolEs = ROLE_ES[e.role] || e.role;
      for (const o of list) {
        lines.push([
          e.name, rolEs, dFmt.format(o.createdAt), tFmt.format(o.createdAt), o.orderNumber,
          o.customerName || o.ticketName || 'Publico general', o.orderType || '',
          PAY[o.paymentMethod] || o.paymentMethod || '', o.status, (o.total || 0).toFixed(2),
          (o.paymentMethod === 'CASH' || o.paymentMethod === 'CASH_ON_DELIVERY') ? (o.cashCollected ? 'Si' : 'No') : '',
        ]);
      }
      lines.push([e.name, rolEs, '', '', '', '', '', '', `SUBTOTAL (${live.length})`, sub.toFixed(2), '']);
      lines.push([]);
      grand += sub; grandCount += live.length;
    }
    lines.push(['', '', '', '', '', '', '', '', `TOTAL (${grandCount})`, grand.toFixed(2), '']);

    // Sección de turnos de caja (cajeros/admin) de los empleados en alcance.
    const empIds = employees.map(e => e.id);
    const cashShifts = empIds.length ? await prisma.cashShift.findMany({
      where: {
        employeeId: { in: empIds },
        openedAt: { gte: from, lte: to },
        ...(req.locationId ? { locationId: req.locationId } : {}),
      },
      orderBy: [{ employeeId: 'asc' }, { openedAt: 'asc' }],
      select: CASH_SELECT,
    }) : [];
    if (cashShifts.length) {
      lines.push([]);
      lines.push(['TURNOS DE CAJA']);
      lines.push(CASH_HEADER);
      const tot = { cash: 0, card: 0, tr: 0, co: 0, tip: 0, ex: 0 };
      for (const s of cashShifts) {
        const e = empById[s.employeeId] || {};
        lines.push(cashRow(s, e.name || '', ROLE_ES[e.role] || e.role || '', dFmt, tFmt));
        tot.cash += s.totalCash || 0; tot.card += s.totalCard || 0; tot.tr += s.totalTransfer || 0;
        tot.co += s.totalCourtesy || 0; tot.tip += s.totalTips || 0; tot.ex += s.totalExpenses || 0;
      }
      lines.push(['TOTAL CAJA', '', '', '', '', tot.cash.toFixed(2), tot.card.toFixed(2), tot.tr.toFixed(2), tot.co.toFixed(2), tot.tip.toFixed(2), tot.ex.toFixed(2), '', '']);
    }

    const csv = '﻿' + lines.map(r => r.map(csvCell).join(',')).join('\r\n');
    const scope = roleFilter === 'ALL' ? 'todos' : roleFilter.toLowerCase();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="actividad_${scope}_${fromStr || ''}_${toStr || ''}.csv"`);
    res.send(csv);
  } catch (e) { console.error('GET /api/employees/export-activity failed:', e); res.status(500).json({ error: e.message }); }
});

// GET un empleado
router.get('/:id', authenticate, requireTenantAccess, requirePermission('manage_users'), gateEmployees, async (req, res) => {
  try {
    const emp = await prisma.employee.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
      include: { shifts: { orderBy: { startAt: 'desc' }, take: 30 } }
    });
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado en esta sucursal' });
    const { pin, offlinePin, ...rest } = emp;
    res.json({ ...rest, hasPin: Boolean(pin) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /:id/activity?date=YYYY-MM-DD ────────────────────────────────────
// Actividad del día de UN empleado, atribuida SEGÚN SU ROL:
//   · DELIVERY            → entregas asignadas (order.deliveryDriverId)
//   · WAITER/CASHIER/etc. → pedidos que tomó en el TPV (order.createdById)
//   · CASHIER/ADMIN       → además, sus turnos de caja del día (CashShift)
// Todos los rangos se calculan en hora de México (el servidor corre en UTC).
// `createdById` empezó a guardarse desde el deploy de esta feature: pedidos
// anteriores no tienen atribución de mesero (el front lo avisa).
router.get('/:id/activity', authenticate, requireTenantAccess, requirePermission('manage_users'), gateEmployees, async (req, res) => {
  try {
    const emp = await prisma.employee.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
      select: { id: true, name: true, role: true },
    });
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado en esta sucursal' });

    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const { from, to } = localDayRange(req.query.date);
    const isDelivery = emp.role === 'DELIVERY';
    const attribution = isDelivery ? 'DELIVERY' : 'CREATED_BY';

    // Pedidos atribuibles al empleado en el día.
    const orders = await prisma.order.findMany({
      where: {
        ...(isDelivery ? { deliveryDriverId: emp.id } : { createdById: emp.id }),
        createdAt: { gte: from, lte: to },
        ...(restaurantId ? { restaurantId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, orderNumber: true, status: true, orderType: true,
        paymentMethod: true, paymentStatus: true, total: true,
        cashCollected: true, customerName: true, ticketName: true, createdAt: true,
      },
    });

    // Resumen: las anuladas no suman a ventas ni al desglose por método.
    const live = orders.filter(o => o.status !== 'CANCELLED');
    const byMethod = live.reduce((acc, o) => {
      const k = o.paymentMethod || 'OTHER';
      acc[k] = (acc[k] || 0) + (o.total || 0);
      return acc;
    }, {});
    const orderSummary = {
      count: live.length,
      cancelled: orders.length - live.length,
      total: live.reduce((s, o) => s + (o.total || 0), 0),
      byMethod,
    };

    // Turnos de caja del día en los que participó (sólo relevante para roles
    // con caja, pero se devuelve siempre por simplicidad del front).
    const cashShifts = await prisma.cashShift.findMany({
      where: {
        OR: [{ employeeId: emp.id }, { openedById: emp.id }, { closedById: emp.id }],
        openedAt: { gte: from, lte: to },
        ...(req.locationId ? { locationId: req.locationId } : {}),
      },
      orderBy: { openedAt: 'desc' },
      select: {
        id: true, isOpen: true, openedAt: true, closedAt: true,
        openingFloat: true, closingFloat: true, expectedCash: true,
        totalCash: true, totalCard: true, totalTransfer: true,
        totalCourtesy: true, totalTips: true, totalExpenses: true,
      },
    });

    // Historial de turnos laborales (asistencia). De paso da contenido a la
    // sección "Historial de turnos" del detalle.
    const shifts = await prisma.employeeShift.findMany({
      where: { employeeId: emp.id },
      orderBy: { startAt: 'desc' },
      take: 30,
    });

    res.json({
      employeeId: emp.id,
      role: emp.role,
      attribution,
      date: { from, to },
      orders: orders.map(o => ({ ...o, customer: o.customerName || o.ticketName || null })),
      orderSummary,
      cashShifts,
      shifts,
    });
  } catch (e) { console.error('GET /api/employees/:id/activity failed:', e); res.status(500).json({ error: e.message }); }
});

// ── GET /:id/activity-export?from=YYYY-MM-DD&to=YYYY-MM-DD ────────────────
// Exporta a CSV la actividad (pedidos atribuidos según rol) de un empleado en
// un rango de días. Mismas reglas de atribución que /activity. Rango en hora
// de México. `to` opcional (default = from → un solo día).
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
router.get('/:id/activity-export', authenticate, requireTenantAccess, requirePermission('manage_users'), gateEmployees, async (req, res) => {
  try {
    const emp = await prisma.employee.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
      select: { id: true, name: true, role: true },
    });
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado en esta sucursal' });

    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const fromStr = req.query.from;
    const toStr = req.query.to || req.query.from;
    const from = localDayRange(fromStr).from;
    const to = localDayRange(toStr).to;
    if (to < from) return res.status(400).json({ error: 'Rango de fechas inválido (to < from)' });

    const isDelivery = emp.role === 'DELIVERY';
    const orders = await prisma.order.findMany({
      where: {
        ...(isDelivery ? { deliveryDriverId: emp.id } : { createdById: emp.id }),
        createdAt: { gte: from, lte: to },
        ...(restaurantId ? { restaurantId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        orderNumber: true, status: true, orderType: true,
        paymentMethod: true, paymentStatus: true, total: true,
        cashCollected: true, customerName: true, ticketName: true, createdAt: true,
      },
    });

    const dFmt = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });
    const tFmt = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });
    const PAY = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', CASH_ON_DELIVERY: 'Efectivo', MP: 'Mercado Pago' };

    const header = ['Fecha', 'Hora', 'Folio', 'Cliente', 'Tipo', 'Metodo', 'Estado', 'Total', 'Efectivo cobrado'];
    const rows = orders.map(o => ([
      dFmt.format(o.createdAt),
      tFmt.format(o.createdAt),
      o.orderNumber,
      o.customerName || o.ticketName || 'Publico general',
      o.orderType || '',
      PAY[o.paymentMethod] || o.paymentMethod || '',
      o.status,
      (o.total || 0).toFixed(2),
      (o.paymentMethod === 'CASH' || o.paymentMethod === 'CASH_ON_DELIVERY') ? (o.cashCollected ? 'Si' : 'No') : '',
    ]));

    const live = orders.filter(o => o.status !== 'CANCELLED');
    const totalSum = live.reduce((s, o) => s + (o.total || 0), 0);
    rows.push([]);
    rows.push(['', '', '', '', '', '', `TOTAL (${live.length})`, totalSum.toFixed(2), '']);

    // Sección de turnos de caja del empleado (relevante para cajero/admin).
    const cashShifts = await prisma.cashShift.findMany({
      where: {
        OR: [{ employeeId: emp.id }, { openedById: emp.id }, { closedById: emp.id }],
        openedAt: { gte: from, lte: to },
        ...(req.locationId ? { locationId: req.locationId } : {}),
      },
      orderBy: { openedAt: 'asc' },
      select: CASH_SELECT,
    });
    if (cashShifts.length) {
      const rolEs = ROLE_ES[emp.role] || emp.role || '';
      rows.push([]);
      rows.push(['TURNOS DE CAJA']);
      rows.push(CASH_HEADER);
      for (const s of cashShifts) rows.push(cashRow(s, emp.name, rolEs, dFmt, tFmt));
    }

    // BOM para que Excel respete los acentos (UTF-8); CRLF entre filas.
    const csv = '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    const safeName = (emp.name || 'empleado').trim().replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="actividad_${safeName}_${fromStr || ''}_${toStr || ''}.csv"`);
    res.send(csv);
  } catch (e) { console.error('GET /api/employees/:id/activity-export failed:', e); res.status(500).json({ error: e.message }); }
});

// POST crear empleado
router.post('/', authenticate, requireTenantAccess, requirePermission('manage_users'), gateEmployees, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { name, phone, pin, role, photo, tables, scheduleStart, scheduleEnd, scheduleDays,
      canCharge, canDiscount, canModifyTickets, canDeleteTickets, canConfigSystem, canTakeDelivery, canTakeTakeout, canManageShifts,
      // Fase 10 · permisos granulares
      canCancelItems, canApplyDiscounts, canReopenTables, canManageUsers,
      locationId: bodyLocationId } = req.body;

    const locationId = req.locationId || bodyLocationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    if (!name || !pin) return res.status(400).json({ error: 'Nombre y PIN requeridos' });
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'El PIN debe ser numérico de 4 a 6 dígitos' });

    // PIN único dentro de la marca — comparar contra hashes existentes
    const sameRestaurantEmps = await prisma.employee.findMany({
      where: { location: { restaurantId: req.restaurantId || req.user?.restaurantId } },
      select: { pin: true }
    });
    for (const e of sameRestaurantEmps) {
      const isDup = e.pin.startsWith('$2') ? await bcrypt.compare(pin, e.pin) : e.pin === pin;
      if (isDup) return res.status(400).json({ error: 'Este PIN ya está en uso en tu restaurante' });
    }

    const pinHash = await bcrypt.hash(pin, 10);
    const offlinePin = crypto.createHash('sha256').update(pin).digest('hex');
    const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.WAITER;
    const emp = await prisma.employee.create({
      data: {
        locationId: req.locationId,
        name, phone: phone||null, pin: pinHash, offlinePin, role: role||'WAITER',
        photo: photo||null, tables: tables||[],
        scheduleStart: scheduleStart||null, scheduleEnd: scheduleEnd||null,
        scheduleDays: scheduleDays||[],
        canCharge:        asBoolOrUndef(canCharge)        ?? defaults.canCharge,
        canDiscount:      asBoolOrUndef(canDiscount)      ?? defaults.canDiscount,
        canModifyTickets: asBoolOrUndef(canModifyTickets) ?? defaults.canModifyTickets,
        canDeleteTickets: asBoolOrUndef(canDeleteTickets) ?? defaults.canDeleteTickets,
        canConfigSystem:  asBoolOrUndef(canConfigSystem)  ?? defaults.canConfigSystem,
        canTakeDelivery:  asBoolOrUndef(canTakeDelivery)  ?? defaults.canTakeDelivery,
        canTakeTakeout:   asBoolOrUndef(canTakeTakeout)   ?? defaults.canTakeTakeout,
        canManageShifts:  asBoolOrUndef(canManageShifts)  ?? defaults.canManageShifts,
        // Fase 10 · permisos granulares. Default por rol (mínimo
        // privilegio — solo ADMIN los tiene encendidos por defecto).
        canCancelItems:    asBoolOrUndef(canCancelItems)    ?? defaults.canCancelItems    ?? false,
        canApplyDiscounts: asBoolOrUndef(canApplyDiscounts) ?? defaults.canApplyDiscounts ?? false,
        canReopenTables:   asBoolOrUndef(canReopenTables)   ?? defaults.canReopenTables   ?? false,
        canManageUsers:    asBoolOrUndef(canManageUsers)    ?? defaults.canManageUsers    ?? false,
      }
    });
    const { pin: _p, offlinePin: _op, ...rest } = emp;
    res.json({ ...rest, hasPin: Boolean(_p) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// PUT actualizar empleado
router.put('/:id', authenticate, requireTenantAccess, requirePermission('manage_users'), gateEmployees, async (req, res) => {
  try {
    const { name, phone, pin, role, photo, tables, scheduleStart, scheduleEnd, scheduleDays, isActive,
      canCharge, canDiscount, canModifyTickets, canDeleteTickets, canConfigSystem, canTakeDelivery, canTakeTakeout, canManageShifts,
      // Fase 10 · permisos granulares
      canCancelItems, canApplyDiscounts, canReopenTables, canManageUsers } = req.body;

    // 1. Verificar que el empleado exista en esta sucursal
    const existing = await prisma.employee.findFirst({
      where: { id: req.params.id, locationId: req.locationId }
    });
    if (!existing) return res.status(404).json({ error: 'Empleado no encontrado' });

    // 2. Preparar los datos a actualizar — sólo campos provistos en el body.
    // Pasar `undefined` a Prisma simplemente NO actualiza el campo, así que
    // un PUT parcial (ej. toggle de isActive) no borra los permisos previos.
    const updateData = {
      name, phone, role, photo, tables, scheduleStart, scheduleEnd, scheduleDays,
      canCharge:        asBoolOrUndef(canCharge),
      canDiscount:      asBoolOrUndef(canDiscount),
      canModifyTickets: asBoolOrUndef(canModifyTickets),
      canDeleteTickets: asBoolOrUndef(canDeleteTickets),
      canConfigSystem:  asBoolOrUndef(canConfigSystem),
      canTakeDelivery:  asBoolOrUndef(canTakeDelivery),
      canTakeTakeout:   asBoolOrUndef(canTakeTakeout),
      canManageShifts:  asBoolOrUndef(canManageShifts),
      // Fase 10 · permisos granulares
      canCancelItems:    asBoolOrUndef(canCancelItems),
      canApplyDiscounts: asBoolOrUndef(canApplyDiscounts),
      canReopenTables:   asBoolOrUndef(canReopenTables),
      canManageUsers:    asBoolOrUndef(canManageUsers),
    };

    // Actualizar estado activo/inactivo si se envía
    if (isActive !== undefined) updateData.isActive = isActive;

    // 3. Manejar el cambio de PIN de forma segura (si viene en el body)
    if (pin && pin.trim() !== '') {
      if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'El PIN debe ser numérico de 4 a 6 dígitos' });
      
      // Evitar PINes duplicados en la misma marca (ignorando al empleado actual)
      const sameRestaurantEmps = await prisma.employee.findMany({
        where: { 
          location: { restaurantId: req.user?.restaurantId || req.restaurantId },
          id: { not: req.params.id } 
        },
        select: { pin: true }
      });
      
      for (const e of sameRestaurantEmps) {
        const isDup = e.pin.startsWith('$2') ? await bcrypt.compare(pin, e.pin) : e.pin === pin;
        if (isDup) return res.status(400).json({ error: 'Este PIN ya está en uso' });
      }
      
      updateData.pin = await bcrypt.hash(pin, 10);
      updateData.offlinePin = crypto.createHash('sha256').update(pin).digest('hex');
    }

    // 4. Guardar en BD
    const emp = await prisma.employee.update({
      where: { id: req.params.id },
      data: updateData
    });

    const { pin: _p, offlinePin: _op, ...rest } = emp;
    res.json({ ...rest, hasPin: Boolean(_p) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// DELETE eliminar empleado
router.delete('/:id', authenticate, requireTenantAccess, requirePermission('manage_users'), gateEmployees, async (req, res) => {
  try {
    const emp = await prisma.employee.findFirst({
      where: { id: req.params.id, locationId: req.locationId }
    });
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado en esta sucursal' });

    await prisma.employee.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST login con PIN — rate-limit 10/15min por IP+location
router.post('/login', pinLoginLimiter, async (req, res) => {
  try {
    const { pin } = req.body;
    // locationId viene de tenant middleware o directo del header (ruta en globalPaths)
    const locationId = req.locationId || req.headers['x-location-id'];
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada. Envía header x-location-id.' });
    if (!pin) return res.status(400).json({ error: 'PIN requerido' });

    // Buscar todos los empleados activos de la sucursal y comparar PIN.
    // Incluimos location → restaurant para resolver tenantId/restaurantId del empleado
    // (Employee no tiene esos campos directos; viven en la cadena de relaciones).
    const candidates = await prisma.employee.findMany({
      where: { locationId, isActive: true },
      include: {
        location: {
          select: {
            restaurantId: true,
            restaurant: { select: { tenantId: true } },
          },
        },
      },
    });

    let emp = null;
    let needsRehash = false;
    const sha256Pin = crypto.createHash('sha256').update(pin).digest('hex');
    for (const c of candidates) {
      if (c.pin && c.pin.startsWith('$2')) {
        // PIN hasheado con bcrypt
        if (await bcrypt.compare(pin, c.pin)) { emp = c; break; }
      } else if (c.pin && c.pin === pin) {
        // PIN legacy en texto plano — migrar al vuelo
        emp = c; needsRehash = true; break;
      }
      // Fallback: comparar contra offlinePin (SHA256). Cubre casos de
      // desincronización entre `pin` (bcrypt) y `offlinePin` (SHA256) por
      // migraciones antiguas o creaciones que solo poblaron uno. Si match,
      // forzamos re-hash del bcrypt para alinearlos en el siguiente request.
      if (c.offlinePin && c.offlinePin === sha256Pin) {
        emp = c; needsRehash = true; break;
      }
    }

    if (!emp) {
      return res.status(401).json({
        error: candidates.length === 0
          ? 'No hay empleados activos en esta sucursal. Verifica que el empleado esté creado y asignado a la sucursal donde está vinculado el TPV.'
          : `PIN incorrecto. Se probó contra ${candidates.length} empleado(s) activos de esta sucursal.`,
        candidates: candidates.length,
        locationId,
      });
    }

    // Migrar PIN legacy a hash
    if (needsRehash || !emp.offlinePin) {
      const pinHash = await bcrypt.hash(pin, 10);
      const offlinePin = crypto.createHash('sha256').update(pin).digest('hex');
      await prisma.employee.update({ 
        where: { id: emp.id }, 
        data: { pin: pinHash, offlinePin } 
      }).catch(() => {});
    }

    const restaurantId = emp.location?.restaurantId ?? req.user?.restaurantId ?? req.restaurantId ?? null;
    const tenantId     = emp.location?.restaurant?.tenantId ?? req.tenant?.id ?? null;

    if (!tenantId) {
      return res.status(500).json({ error: 'Empleado sin tenant resoluble (location/restaurant huérfanos)' });
    }

    const jwt = require('jsonwebtoken');
    // Tablets POS (TPV cajero, TPV meseros, meseros-lite) operan toda la
    // jornada sobre un dispositivo ya emparejado. El login con PIN no tiene
    // refresh token (a diferencia del login admin), así que un token de 12h
    // se traducía en "Sesión vencida" a mitad de turno: la app borraba la
    // sesión y aparentaba "desvincularse", y al meter un pedido moría con 401.
    // Alineamos la vida con el token de Device (30d): el PIN sigue
    // re-autenticando en cualquier momento si hace falta.
    const token = jwt.sign(
      { id: emp.id, role: emp.role, tenantId, restaurantId, locationId },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // BUG-13: registrar login en la bitácora de acceso. Fire-and-forget
    // para no bloquear el response si la insert falla (la auditoría no
    // debe degradar el login).
    prisma.accessLog.create({
      data: {
        tenantId,
        restaurantId,
        locationId,
        actorType: 'EMPLOYEE',
        actorId:   emp.id,
        actorName: emp.name,
        action:    'LOGIN',
        ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
        userAgent: req.headers['user-agent']?.slice(0, 200) || null,
      },
    }).catch((e) => console.error('[audit] login log failed:', e?.message || e));

    // No devolvemos la relación anidada al cliente, solo el empleado plano.
    // Incluimos `permissions` (set canónico) para que el authStore del TPV
    // evalúe RBAC del usuario logueado sin depender solo de los flags crudos.
    const { location, ...employeePublic } = emp;
    res.json({
      employee: { ...employeePublic, permissions: mapPermissions(employeePublic) },
      token,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/employees/verify-permission — autorización de supervisor (override).
//
// Reemplaza la validación client-side (cache offline, spoofeable) por una
// validación real contra el backend. El empleado logueado solicita autorización
// presentando el PIN de un supervisor (ADMIN/MANAGER/OWNER de su sucursal) que
// SÍ tenga el permiso. Si es válido, devuelve un override token (JWT corto, 15
// min) que el cliente adjunta como header `x-override-token` en la acción
// gateada. El backend (requirePermission) lo valida y deja pasar la operación.
router.post('/verify-permission', authenticate, requireTenantAccess, overrideLimiter, async (req, res) => {
  try {
    const { pin, permission } = req.body;
    if (!pin || !permission) {
      return res.status(400).json({ error: 'PIN y permiso requeridos' });
    }
    const flag = PERM_TO_FLAG[permission];
    if (!flag) return res.status(400).json({ error: 'Permiso desconocido' });

    const locationId = req.user?.locationId || req.locationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    // Solo supervisores de la misma sucursal pueden autorizar.
    const candidates = await prisma.employee.findMany({
      where: {
        locationId,
        isActive: true,
        role: { in: ['ADMIN', 'MANAGER', 'OWNER'] },
      },
      select: {
        id: true, name: true, role: true, pin: true, offlinePin: true,
        ...PERMISSION_FLAG_SELECT,
      },
    });

    let supervisor = null;
    const sha256Pin = crypto.createHash('sha256').update(pin).digest('hex');
    for (const c of candidates) {
      const ok = c.pin && c.pin.startsWith('$2')
        ? await bcrypt.compare(pin, c.pin)
        : (c.pin === pin || c.offlinePin === sha256Pin);
      if (ok) { supervisor = c; break; }
    }

    if (!supervisor) {
      return res.status(401).json({ error: 'PIN de supervisor incorrecto' });
    }

    // El supervisor debe TENER el permiso (OWNER/ADMIN tienen bypass total).
    const privileged = ['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(supervisor.role);
    const hasPerm = privileged
      || supervisor[flag]
      || (flag === 'canApplyDiscounts' && supervisor.canDiscount);
    if (!hasPerm) {
      return res.status(403).json({ error: 'El supervisor no tiene este permiso' });
    }

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      {
        override: true,
        permission,
        supervisorId: supervisor.id,
        tenantId: req.user?.tenantId ?? null,
        locationId,
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Auditoría — quién autorizó qué y a quién (fire-and-forget).
    prisma.accessLog.create({
      data: {
        tenantId: req.user?.tenantId ?? null,
        restaurantId: req.user?.restaurantId ?? null,
        locationId,
        actorType: 'EMPLOYEE',
        actorId: supervisor.id,
        actorName: supervisor.name,
        action: `OVERRIDE:${permission}`,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
        userAgent: req.headers['user-agent']?.slice(0, 200) || null,
      },
    }).catch((e) => console.error('[audit] override log failed:', e?.message || e));

    return res.json({
      token,
      supervisor: { id: supervisor.id, name: supervisor.name },
      expiresIn: 900,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
