const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess, requireRole } = require('../middleware/auth.middleware');
const router = express.Router();

const STAFF_ROLES = ['CASHIER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'];

function isStaff(user) {
  return Boolean(user && STAFF_ROLES.includes(user.role));
}

function canAccessDriver(req, driverId) {
  return req.user?.id === driverId || isStaff(req.user);
}

function driverWhereForRequest(req, driverId) {
  const where = { id: driverId, role: 'DELIVERY', isActive: true };
  if (req.user?.role !== 'SUPER_ADMIN') {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (restaurantId) where.location = { restaurantId };
  }
  return where;
}

async function assertDriverAccess(req, res) {
  const driverId = req.params.driverId || req.body?.driverId;
  if (!driverId) {
    res.status(400).json({ error: 'driverId requerido' });
    return null;
  }
  if (!canAccessDriver(req, driverId)) {
    res.status(403).json({ error: 'No autorizado para este repartidor' });
    return null;
  }
  const driver = await prisma.employee.findFirst({
    where: driverWhereForRequest(req, driverId),
    select: { id: true, name: true, photo: true, phone: true, locationId: true },
  });
  if (!driver) {
    res.status(404).json({ error: 'Repartidor no encontrado' });
    return null;
  }
  return driver;
}

async function findDriverOrder(req, orderId, driverId) {
  const where = { id: orderId };
  if (driverId && !isStaff(req.user)) where.deliveryDriverId = driverId;
  if (req.user?.role !== 'SUPER_ADMIN') {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (restaurantId) where.restaurantId = restaurantId;
  }
  return prisma.order.findFirst({
    where,
    include: { items: { include: { menuItem: true, modifiers: true } }, user: true },
  });
}

async function ensureCashOnDeliveryMovement(order) {
  if (!order || !order.deliveryDriverId) return null;
  if (order.paymentMethod !== 'CASH') return null;
  if (order.paymentStatus === 'PAID') return null;
  const existing = await prisma.driverCashMovement.findFirst({
    where: {
      driverId: order.deliveryDriverId,
      orderId: order.id,
      category: 'DELIVERY',
      type: 'INCOME',
    },
  });
  if (existing) return existing;
  return prisma.driverCashMovement.create({
    data: {
      driverId: order.deliveryDriverId,
      type: 'INCOME',
      category: 'DELIVERY',
      amount: Number(order.total) || 0,
      description: 'Cobro entrega ' + (order.orderNumber || order.id),
      orderId: order.id,
    },
  });
}

// Legacy login by phone + PIN. New clients should prefer /api/employees/login.
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const restaurantId = req.restaurantId || req.headers['x-restaurant-id'] || null;
    const driver = await prisma.employee.findFirst({
      where: {
        role: 'DELIVERY',
        isActive: true,
        phone: email,
        ...(restaurantId ? { location: { restaurantId } } : {}),
      },
      include: {
        location: {
          select: {
            id: true,
            restaurantId: true,
            restaurant: { select: { tenantId: true } },
          },
        },
      },
    });
    const valid = driver?.pin?.startsWith('$2')
      ? await bcrypt.compare(String(password || ''), driver.pin)
      : driver?.pin === password;
    if (!driver || !valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = jwt.sign(
      {
        id: driver.id,
        role: driver.role,
        tenantId: driver.location?.restaurant?.tenantId,
        restaurantId: driver.location?.restaurantId,
        locationId: driver.locationId,
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      driver: { id: driver.id, name: driver.name, photo: driver.photo, phone: driver.phone },
    });
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.get('/:driverId/orders', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const orders = await prisma.order.findMany({
      where: {
        deliveryDriverId: driver.id,
        status: { notIn: ['DELIVERED', 'CANCELLED'] },
        ...(req.user?.role !== 'SUPER_ADMIN' ? { restaurantId: req.restaurantId || req.user?.restaurantId } : {}),
      },
      include: {
        items: { include: { menuItem: true, modifiers: true } },
        user: true,
        // País del restaurante → la app del repartidor arma el enlace de
        // WhatsApp con la lada correcta (ver packages/config/phone.js).
        restaurant: { select: { config: { select: { countryCode: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Aplanar countryCode al nivel del pedido para simplificar el frontend.
    const withCountry = orders.map(o => ({
      ...o,
      countryCode: o.restaurant?.config?.countryCode || 'MX',
    }));
    res.json(withCountry);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.get('/:driverId/history', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const orders = await prisma.order.findMany({
      where: {
        deliveryDriverId: driver.id,
        status: 'DELIVERED',
        createdAt: { gte: today },
        ...(req.user?.role !== 'SUPER_ADMIN' ? { restaurantId: req.restaurantId || req.user?.restaurantId } : {}),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.put('/assign', authenticate, requireTenantAccess, requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    const { orderId, driverId } = req.body;
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const driver = await prisma.employee.findFirst({
      where: { id: driverId, role: 'DELIVERY', isActive: true, ...(restaurantId ? { location: { restaurantId } } : {}) },
    });
    if (!driver) return res.status(404).json({ error: 'Repartidor no encontrado' });
    const order = await prisma.order.update({
      where: { id: orderId, ...(req.user?.role !== 'SUPER_ADMIN' ? { restaurantId } : {}) },
      data: { deliveryDriverId: driverId, status: 'ON_THE_WAY' },
      include: { items: { include: { menuItem: true } }, user: true },
    });

    // Notificar en tiempo real al repartidor (sala driver:{id}) y a los admins.
    const io = req.app.get('io');
    if (io) {
      io.to(`driver:${driverId}`).emit('orderAssigned', { order });
      io.to(`restaurant:${order.restaurantId}:location:${order.locationId}:admins`).emit('orderUpdated');
    }

    res.json(order);
  } catch (e) { console.error('PUT /delivery/assign:', e); res.status(500).json({ error: 'Error interno' }); }
});

router.put('/:driverId/orders/:orderId/status', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const existing = await findDriverOrder(req, req.params.orderId, driver.id);
    if (!existing) return res.status(404).json({ error: 'Pedido no encontrado' });

    const { status, paymentMethod } = req.body;
    // El repartidor solo puede mover el pedido a estados válidos de su flujo.
    const ALLOWED_DRIVER_STATUSES = ['ON_THE_WAY', 'DELIVERED'];
    if (!ALLOWED_DRIVER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Estado no permitido' });
    }
    const data = { status };
    if (paymentMethod) data.paymentMethod = paymentMethod;
    if (status === 'DELIVERED') {
      if (paymentMethod === 'CASH') {
        data.cashCollected = false;
        data.paidAt = null;
      } else {
        data.paidAt = new Date();
      }
    }
    const order = await prisma.order.update({
      where: { id: existing.id },
      data,
      include: { items: { include: { menuItem: true } }, user: true },
    });

    if (order.status === 'DELIVERED') await ensureCashOnDeliveryMovement(order);

    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${order.restaurantId}:location:${order.locationId}:admins`).emit('order:updated', order);
      io.to(`restaurant:${order.restaurantId}:location:${order.locationId}:admins`).emit('orderUpdated');
    }

    res.json(order);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.get('/orders/:orderId/messages', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const order = await findDriverOrder(req, req.params.orderId, req.user?.role === 'DELIVERY' ? req.user.id : null);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    const msgs = await prisma.deliveryMessage.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(msgs);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.post('/orders/:orderId/messages', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const order = await findDriverOrder(req, req.params.orderId, req.user?.role === 'DELIVERY' ? req.user.id : null);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    const { message, fromDriver } = req.body || {};
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message requerido' });
    const msg = await prisma.deliveryMessage.create({
      data: { orderId: order.id, message: message.slice(0, 1000), fromDriver: Boolean(fromDriver) },
      include: { order: true },
    });

    const io = req.app.get('io');
    if (io && msg.order) {
      const payload = { orderId: msg.orderId, msg };
      io.to(`restaurant:${msg.order.restaurantId}:location:${msg.order.locationId}:admins`).emit('newMessage', payload);
      io.to(`order:${msg.orderId}`).emit('newMessage', payload);
      // El restaurante respondió → empujar al repartidor asignado.
      if (msg.order.deliveryDriverId) {
        io.to(`driver:${msg.order.deliveryDriverId}`).emit('newMessage', payload);
      }
    }

    res.json(msg);
  } catch (e) { console.error('POST /delivery/messages:', e); res.status(500).json({ error: 'Error interno' }); }
});

router.get('/', authenticate, requireTenantAccess, requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const drivers = await prisma.employee.findMany({
      where: {
        role: 'DELIVERY',
        isActive: true,
        ...(req.user?.role !== 'SUPER_ADMIN' && restaurantId ? { location: { restaurantId } } : {}),
      },
      orderBy: { name: 'asc' },
    });
    res.json(drivers);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.put('/:driverId/orders/:orderId/deliver', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const existing = await findDriverOrder(req, req.params.orderId, driver.id);
    if (!existing) return res.status(404).json({ error: 'Pedido no encontrado' });
    const order = await prisma.order.update({
      where: { id: existing.id },
      data: {
        status: 'DELIVERED',
        paidAt: null,
        paymentStatus: 'PENDING',
        cashCollected: false,
      },
      include: { items: { include: { menuItem: true } } },
    });
    await ensureCashOnDeliveryMovement(order);
    res.json(order);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

// ── AVISOS A REPARTIDORES ──────────────────────────────────────────────────

// POST /api/delivery/notices — staff crea un aviso (driverId null = broadcast)
router.post('/notices', authenticate, requireTenantAccess, requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { title, body, driverId, locationId } = req.body || {};
    if (!body || typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({ error: 'El mensaje es requerido' });
    }
    // Si es dirigido a un repartidor, validar que pertenezca al restaurante.
    if (driverId) {
      const driver = await prisma.employee.findFirst({
        where: { id: driverId, role: 'DELIVERY', isActive: true, ...(restaurantId ? { location: { restaurantId } } : {}) },
        select: { id: true },
      });
      if (!driver) return res.status(404).json({ error: 'Repartidor no encontrado' });
    }
    const notice = await prisma.driverNotice.create({
      data: {
        restaurantId,
        locationId: locationId || req.locationId || null,
        driverId: driverId || null,
        title: title ? String(title).slice(0, 120) : null,
        body: body.trim().slice(0, 1000),
        createdById: req.user?.id || null,
        createdByName: req.user?.name || null,
      },
    });

    const io = req.app.get('io');
    if (io) {
      const payload = { notice };
      if (notice.driverId) io.to(`driver:${notice.driverId}`).emit('newNotice', payload);
      else io.to(`restaurant:${restaurantId}:drivers`).emit('newNotice', payload);
    }

    res.json(notice);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

// GET /api/delivery/:driverId/notices — avisos visibles para el repartidor
router.get('/:driverId/notices', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const notices = await prisma.driverNotice.findMany({
      where: {
        restaurantId,
        OR: [{ driverId: driver.id }, { driverId: null }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const enriched = notices.map(n => ({ ...n, read: n.readBy.includes(driver.id) }));
    res.json({ notices: enriched, unread: enriched.filter(n => !n.read).length });
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

// POST /api/delivery/notices/:id/read — el repartidor marca un aviso como leído
router.post('/notices/:id/read', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driverId = req.user?.role === 'DELIVERY' ? req.user.id : (req.body?.driverId || null);
    if (!driverId) return res.status(400).json({ error: 'driverId requerido' });
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const notice = await prisma.driverNotice.findFirst({
      where: { id: req.params.id, restaurantId },
    });
    if (!notice) return res.status(404).json({ error: 'Aviso no encontrado' });
    if (!notice.readBy.includes(driverId)) {
      await prisma.driverNotice.update({
        where: { id: notice.id },
        data: { readBy: { push: driverId } },
      });
    }
    res.json({ ok: true });
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

module.exports = router;
