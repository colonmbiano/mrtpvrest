const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const router = express.Router();

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
      include: { items: { include: { menuItem: true } }, user: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET historial del día ─────────────────────────────────────────────────
router.get('/:driverId/history', async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const orders = await prisma.order.findMany({
      where: {
        deliveryDriverId: req.params.driverId,
        createdAt: { gte: today }
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT asignar repartidor a pedido (admin) ───────────────────────────────
router.put('/assign', authenticate, requireAdmin, async (req, res) => {
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
    if (status === 'DELIVERED') data.paidAt = new Date();
    const order = await prisma.order.update({
      where: { id: req.params.orderId },
      data,
      include: { items: { include: { menuItem: true } }, user: true }
    });
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
      data: { orderId: req.params.orderId, message, fromDriver: fromDriver || false }
    });
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET todos los repartidores (admin) ────────────────────────────────────
router.get('/', authenticate, requireAdmin, async (req, res) => {
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
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
