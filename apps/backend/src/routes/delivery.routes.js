const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess, requireRole } = require('../middleware/auth.middleware');
const router = express.Router();

// BUG-31: garantizar que la entrega se refleje SIEMPRE en MI CAJA del
// repartidor cuando el pago es en efectivo y aún no se acreditó. Idempotente
// por (driverId, orderId, category=DELIVERY) para soportar reintentos del
// frontend sin duplicar movimientos.
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

// ── LOGIN repartidor (usa Employee con rol DELIVERY) ──────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    // Buscar en Employee por nombre como email y pin como password
    const driver = await prisma.employee.findFirst({
      where: { role: 'DELIVERY', isActive: true, phone: email }
    });
    if (!driver || driver.pin !== password)
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    res.json({ driver: { id: driver.id, name: driver.name, photo: driver.photo, phone: driver.phone } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET pedidos asignados al repartidor ───────────────────────────────────
router.get('/:driverId/orders', async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        deliveryDriverId: req.params.driverId,
        status: { notIn: ['DELIVERED', 'CANCELLED'] }
      },
      // BUG-30: incluir modifiers para que el detalle muestre nombre completo
      // del producto + variantes/modificadores antes de salir a la entrega.
      include: {
        items: { include: { menuItem: true, modifiers: true } },
        user: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET historial del día ─────────────────────────────────────────────────
// BUG-31: filtrar exclusivamente por status='DELIVERED'. Antes devolvía toda
// la actividad del día (incluyendo ON_THE_WAY) y la app la pintaba como
// "ENTREGADO", inconsistente con RUTA ACTIVA y MI CAJA.
router.get('/:driverId/history', async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const orders = await prisma.order.findMany({
      where: {
        deliveryDriverId: req.params.driverId,
        status: 'DELIVERED',
        createdAt: { gte: today }
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT asignar repartidor a pedido ───────────────────────────────────────
// BUG-24: el cajero (CASHIER) asigna el repartidor en el flujo de COBRAR
// DELIVERY. Antes requería ADMIN y la asignación quedaba bloqueada en POS.
router.put('/assign', authenticate, requireTenantAccess, requireRole('CASHIER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { orderId, driverId } = req.body;
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { deliveryDriverId: driverId, status: 'ON_THE_WAY' }
    });
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT cambiar estado del pedido ─────────────────────────────────────────
router.put('/:driverId/orders/:orderId/status', async (req, res) => {
  try {
    const { status, paymentMethod } = req.body;
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
      where: { id: req.params.orderId },
      data,
      include: { items: { include: { menuItem: true } }, user: true }
    });

    if (order.status === 'DELIVERED') {
      await ensureCashOnDeliveryMovement(order);
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${order.restaurantId}:location:${order.locationId}:admins`).emit('order:updated', order);
      io.to(`restaurant:${order.restaurantId}:location:${order.locationId}:admins`).emit('orderUpdated');
    }

    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET mensajes de un pedido ─────────────────────────────────────────────
router.get('/orders/:orderId/messages', async (req, res) => {
  try {
    const msgs = await prisma.deliveryMessage.findMany({
      where: { orderId: req.params.orderId },
      orderBy: { createdAt: 'asc' }
    });
    res.json(msgs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST enviar mensaje ───────────────────────────────────────────────────
router.post('/orders/:orderId/messages', async (req, res) => {
  try {
    const { message, fromDriver } = req.body;
    const msg = await prisma.deliveryMessage.create({
      data: { orderId: req.params.orderId, message, fromDriver: fromDriver || false },
      include: { order: true }
    });

    const io = req.app.get('io');
    if (io && msg.order) {
      io.to(`restaurant:${msg.order.restaurantId}:location:${msg.order.locationId}:admins`).emit('newMessage', { orderId: msg.orderId, msg });
    }

    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET todos los repartidores ────────────────────────────────────────────
// BUG-24: el cajero necesita la lista para asignar repartidor al cobrar
// DELIVERY. La lista se restringe a empleados rol=DELIVERY activos del
// mismo tenant via requireTenantAccess.
router.get('/', authenticate, requireTenantAccess, requireRole('CASHIER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const drivers = await prisma.employee.findMany({
      where: { role: 'DELIVERY', isActive: true },
      orderBy: { name: 'asc' }
    });
    res.json(drivers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ── Confirmar entrega sin cobro (efectivo pendiente) ──────────────────────
router.put('/:driverId/orders/:orderId/deliver', async (req, res) => {
  try {
    const order = await prisma.order.update({
      where: { id: req.params.orderId },
      data: {
        status: 'DELIVERED',
        paidAt: null, // se pagará después
        paymentStatus: 'PENDING',
        cashCollected: false,
      },
      include: { items: { include: { menuItem: true } } }
    });
    await ensureCashOnDeliveryMovement(order);
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
