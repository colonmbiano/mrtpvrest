const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const router = express.Router();

const ROLE_DEFAULTS = {
  ADMIN:    { canCharge:true,  canDiscount:true,  canModifyTickets:true,  canDeleteTickets:true,  canConfigSystem:true,  canTakeDelivery:true,  canTakeTakeout:true },
  CASHIER:  { canCharge:true,  canDiscount:true,  canModifyTickets:true,  canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:false, canTakeTakeout:true },
  WAITER:   { canCharge:false, canDiscount:false, canModifyTickets:false, canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:false, canTakeTakeout:true },
  DELIVERY: { canCharge:true,  canDiscount:false, canModifyTickets:false, canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:true,  canTakeTakeout:false },
  COOK:     { canCharge:false, canDiscount:false, canModifyTickets:false, canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:false, canTakeTakeout:false },
};

// GET todos los empleados (Filtrado por Sucursal)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { locationId: req.locationId }, // Cambio: locationId
      include: {
        shifts: { where: { endAt: null }, take: 1, orderBy: { startAt: 'desc' } }
      },
      orderBy: { name: 'asc' }
    });
    res.json(employees);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET un empleado
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const emp = await prisma.employee.findUnique({
      where: { id: req.params.id, locationId: req.locationId },
      include: { shifts: { orderBy: { startAt: 'desc' }, take: 30 } }
    });
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado en esta sucursal' });
    res.json(emp);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST crear empleado
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { name, phone, pin, role, photo, tables, scheduleStart, scheduleEnd, scheduleDays,
      canCharge, canDiscount, canModifyTickets, canDeleteTickets, canConfigSystem, canTakeDelivery, canTakeTakeout } = req.body;

    if (!name || !pin) return res.status(400).json({ error: 'Nombre y PIN requeridos' });

    // PIN único dentro de la sucursal (o marca, por seguridad)
    const existing = await prisma.employee.findFirst({
      where: { pin, location: { restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId } }
    });
    if (existing) return res.status(400).json({ error: 'Este PIN ya está en uso en tu restaurante' });

    const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.WAITER;
    const emp = await prisma.employee.create({
      data: {
        locationId: req.locationId,
        name, phone: phone||null, pin, role: role||'WAITER',
        photo: photo||null, tables: tables||[],
        scheduleStart: scheduleStart||null, scheduleEnd: scheduleEnd||null,
        scheduleDays: scheduleDays||[],
        canCharge:        canCharge        !== undefined ? canCharge        : defaults.canCharge,
        canDiscount:      canDiscount      !== undefined ? canDiscount      : defaults.canDiscount,
        canModifyTickets: canModifyTickets !== undefined ? canModifyTickets : defaults.canModifyTickets,
        canDeleteTickets: canDeleteTickets !== undefined ? canDeleteTickets : defaults.canDeleteTickets,
        canConfigSystem:  canConfigSystem  !== undefined ? canConfigSystem  : defaults.canConfigSystem,
        canTakeDelivery:  canTakeDelivery  !== undefined ? canTakeDelivery  : defaults.canTakeDelivery,
        canTakeTakeout:   canTakeTakeout   !== undefined ? canTakeTakeout   : defaults.canTakeTakeout,
      }
    });
    res.json(emp);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST login con PIN
router.post('/login', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const emp = await prisma.employee.findFirst({
      where: { pin, locationId: req.locationId, isActive: true }
    });
    
    if (!emp) return res.status(401).json({ error: 'PIN incorrecto o empleado no pertenece a esta sucursal' });

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: emp.id, role: emp.role, restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId, locationId: req.locationId },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    
    res.json({ employee: emp, token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
