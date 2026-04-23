const express = require('express');
const bcrypt  = require('bcryptjs');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const router = express.Router();

const ROLE_DEFAULTS = {
  ADMIN:    { canCharge:true,  canDiscount:true,  canModifyTickets:true,  canDeleteTickets:true,  canConfigSystem:true,  canTakeDelivery:true,  canTakeTakeout:true },
  CASHIER:  { canCharge:true,  canDiscount:true,  canModifyTickets:true,  canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:false, canTakeTakeout:true },
  WAITER:   { canCharge:false, canDiscount:false, canModifyTickets:false, canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:false, canTakeTakeout:true },
  DELIVERY: { canCharge:true,  canDiscount:false, canModifyTickets:false, canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:true,  canTakeTakeout:false },
  COOK:     { canCharge:false, canDiscount:false, canModifyTickets:false, canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:false, canTakeTakeout:false },
};

// GET todos los empleados (Filtrado por Sucursal)
router.get('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
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
router.get('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
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
router.post('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { name, phone, pin, role, photo, tables, scheduleStart, scheduleEnd, scheduleDays,
      canCharge, canDiscount, canModifyTickets, canDeleteTickets, canConfigSystem, canTakeDelivery, canTakeTakeout } = req.body;

    if (!name || !pin) return res.status(400).json({ error: 'Nombre y PIN requeridos' });
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'El PIN debe ser numérico de 4 a 6 dígitos' });

    // PIN único dentro de la marca — comparar contra hashes existentes
    const sameRestaurantEmps = await prisma.employee.findMany({
      where: { location: { restaurantId: req.user?.restaurantId || req.restaurantId } },
      select: { pin: true }
    });
    for (const e of sameRestaurantEmps) {
      const isDup = e.pin.startsWith('$2') ? await bcrypt.compare(pin, e.pin) : e.pin === pin;
      if (isDup) return res.status(400).json({ error: 'Este PIN ya está en uso en tu restaurante' });
    }

    const pinHash = await bcrypt.hash(pin, 10);
    const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.WAITER;
    const emp = await prisma.employee.create({
      data: {
        locationId: req.locationId,
        name, phone: phone||null, pin: pinHash, role: role||'WAITER',
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
// PUT actualizar empleado
router.put('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { name, phone, pin, role, photo, tables, scheduleStart, scheduleEnd, scheduleDays, isActive,
      canCharge, canDiscount, canModifyTickets, canDeleteTickets, canConfigSystem, canTakeDelivery, canTakeTakeout } = req.body;

    // 1. Verificar que el empleado exista en esta sucursal
    const existing = await prisma.employee.findUnique({
      where: { id: req.params.id, locationId: req.locationId }
    });
    if (!existing) return res.status(404).json({ error: 'Empleado no encontrado' });

    // 2. Preparar los datos a actualizar
    const updateData = {
      name, phone, role, photo, tables, scheduleStart, scheduleEnd, scheduleDays,
      canCharge, canDiscount, canModifyTickets, canDeleteTickets, canConfigSystem, canTakeDelivery, canTakeTakeout
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
    }

    // 4. Guardar en BD
    const emp = await prisma.employee.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json(emp);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// POST login con PIN
router.post('/login', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    if (!pin) return res.status(400).json({ error: 'PIN requerido' });

    // Buscar todos los empleados activos de la sucursal y comparar PIN.
    // Incluimos location → restaurant para resolver tenantId/restaurantId del empleado
    // (Employee no tiene esos campos directos; viven en la cadena de relaciones).
    const candidates = await prisma.employee.findMany({
      where: { locationId: req.locationId, isActive: true },
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
    for (const c of candidates) {
      if (c.pin.startsWith('$2')) {
        // PIN hasheado con bcrypt
        if (await bcrypt.compare(pin, c.pin)) { emp = c; break; }
      } else {
        // PIN legacy en texto plano — migrar al vuelo
        if (c.pin === pin) { emp = c; needsRehash = true; break; }
      }
    }

    if (!emp) return res.status(401).json({ error: 'PIN incorrecto o empleado no pertenece a esta sucursal' });

    // Migrar PIN legacy a hash
    if (needsRehash) {
      const pinHash = await bcrypt.hash(pin, 10);
      await prisma.employee.update({ where: { id: emp.id }, data: { pin: pinHash } }).catch(() => {});
    }

    const restaurantId = emp.location?.restaurantId ?? req.user?.restaurantId ?? req.restaurantId ?? null;
    const tenantId     = emp.location?.restaurant?.tenantId ?? req.tenant?.id ?? null;

    if (!tenantId) {
      return res.status(500).json({ error: 'Empleado sin tenant resoluble (location/restaurant huérfanos)' });
    }

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: emp.id, role: emp.role, tenantId, restaurantId, locationId: req.locationId },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    // No devolvemos la relación anidada al cliente, solo el empleado plano.
    const { location, ...employeePublic } = emp;
    res.json({ employee: employeePublic, token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
