// /api/tasks — gamificación KDS
//
// Endpoints:
//   GET  /api/tasks                     lista de tareas activas de la sucursal
//   POST /api/tasks/log                 registra completar una tarea (PIN o employeeId)
//   GET  /api/tasks/leaderboard         top empleados por XP en últimos 30 días
//
// Reglas:
// - Sin requireAdmin: cualquier empleado autenticado puede listar y loggear,
//   porque el KDS corre con device-token (auth de máquina) y la
//   identificación humana viene del PIN del Employee.
// - El PIN se resuelve contra Employee.pin (4-6 dígitos). Si no se manda
//   PIN ni employeeId, se rechaza.
// - clientId opcional permite deduplicar cuando el cliente sincroniza una
//   cola offline: el mismo clientId no crea log nuevo si ya existe en notes.

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware');
const { validateBody } = require('../lib/validate');
const { logTaskSchema } = require('../schemas/tasks.schema');
const log = require('../lib/logger')('tasks');

const router = express.Router();

// ── GET /api/tasks ────────────────────────────────────────────────────────
router.get('/', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const locationId = req.locationId || req.headers['x-location-id'];
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const tasks = await prisma.task.findMany({
      where: { locationId, isActive: true },
      orderBy: [{ pointsReward: 'desc' }, { title: 'asc' }],
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        pointsReward: true,
        frequency: true,
      },
    });
    res.json(tasks);
  } catch (e) {
    log.error('list_failed', { err: e.message });
    res.status(500).json({ error: 'Error al obtener tareas' });
  }
});

// ── POST /api/tasks/log ───────────────────────────────────────────────────
router.post('/log', authenticate, requireTenantAccess, validateBody(logTaskSchema), async (req, res) => {
  try {
    const locationId = req.locationId || req.headers['x-location-id'];
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { taskId, employeeId: bodyEmployeeId, pin, notes, clientId } = req.body;

    // 1. Validar que la tarea pertenece a la sucursal del request.
    const task = await prisma.task.findFirst({
      where: { id: taskId, locationId, isActive: true },
      select: { id: true, pointsReward: true, title: true },
    });
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada en esta sucursal' });

    // 2. Resolver Employee por employeeId o PIN.
    let employeeId = bodyEmployeeId;
    if (!employeeId) {
      if (!pin) return res.status(400).json({ error: 'Se requiere PIN o employeeId' });
      const emp = await prisma.employee.findFirst({
        where: { pin, locationId, isActive: true },
        select: { id: true },
      });
      if (!emp) return res.status(401).json({ error: 'PIN inválido', code: 'INVALID_PIN' });
      employeeId = emp.id;
    } else {
      // Validar que el employee existe y pertenece a la sucursal.
      const emp = await prisma.employee.findFirst({
        where: { id: employeeId, locationId, isActive: true },
        select: { id: true },
      });
      if (!emp) return res.status(404).json({ error: 'Empleado no encontrado en esta sucursal' });
    }

    // 3. Deduplicación por clientId (offline sync). Almacenamos clientId en
    //    notes con prefijo para identificar logs reproducidos.
    if (clientId) {
      const dup = await prisma.taskLog.findFirst({
        where: { taskId, employeeId, notes: { contains: `[client:${clientId}]` } },
        select: { id: true, pointsEarned: true, completedAt: true },
      });
      if (dup) return res.json({ deduped: true, ...dup });
    }

    const composedNotes = clientId
      ? `[client:${clientId}] ${notes || ''}`.trim()
      : (notes || null);

    const created = await prisma.taskLog.create({
      data: {
        taskId,
        employeeId,
        pointsEarned: task.pointsReward,
        notes: composedNotes,
      },
      select: { id: true, pointsEarned: true, completedAt: true, taskId: true, employeeId: true },
    });

    log.info('task_logged', { taskId, employeeId, points: task.pointsReward });
    res.json(created);
  } catch (e) {
    log.error('log_failed', { err: e.message });
    res.status(500).json({ error: 'Error al registrar tarea' });
  }
});

// ── GET /api/tasks/leaderboard ────────────────────────────────────────────
// Top 10 empleados de la sucursal por XP acumulada en los últimos 30 días.
router.get('/leaderboard', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const locationId = req.locationId || req.headers['x-location-id'];
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // groupBy + join manual (Prisma no permite where sobre relaciones nested
    // en groupBy aún). Filtramos por employee.locationId después.
    const grouped = await prisma.taskLog.groupBy({
      by: ['employeeId'],
      where: {
        completedAt: { gte: since },
        employee: { locationId },
      },
      _sum: { pointsEarned: true },
      _count: { _all: true },
      orderBy: { _sum: { pointsEarned: 'desc' } },
      take: 10,
    });

    const employees = await prisma.employee.findMany({
      where: { id: { in: grouped.map((g) => g.employeeId) } },
      select: { id: true, name: true, photo: true, role: true },
    });
    const empById = new Map(employees.map((e) => [e.id, e]));

    const leaderboard = grouped.map((g) => ({
      employee: empById.get(g.employeeId) || { id: g.employeeId, name: 'Desconocido' },
      points:   g._sum.pointsEarned || 0,
      tasks:    g._count._all || 0,
    }));

    res.json(leaderboard);
  } catch (e) {
    log.error('leaderboard_failed', { err: e.message });
    res.status(500).json({ error: 'Error al obtener leaderboard' });
  }
});

module.exports = router;
