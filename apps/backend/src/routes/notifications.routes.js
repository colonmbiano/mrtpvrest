const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const { notifyOrderStatus, notifyIngredientShortage, sendWhatsApp } = require('../services/notifications.service');
const router = express.Router();

// GET clave pública VAPID (para el frontend)
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

// POST suscribir dispositivo a push
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription, userId, orderId } = req.body;
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: { userId: userId || null, orderId: orderId || null, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      create: { endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userId: userId || null, orderId: orderId || null }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST notificar cambio de estado (se llama automáticamente desde orders)
router.post('/order-status', authenticate, requireAdmin, async (req, res) => {
  try {
    const { orderId, status } = req.body;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true }
    });
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    await notifyOrderStatus(order, status);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST notificar falta de ingrediente (desde TPV)
router.post('/ingredient-shortage', authenticate, requireAdmin, async (req, res) => {
  try {
    const { orderId, missingItem, options } = req.body;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true, items: true }
    });
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    await notifyIngredientShortage(order, missingItem, options);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST enviar mensaje personalizado a cliente
router.post('/custom', authenticate, requireAdmin, async (req, res) => {
  try {
    const { orderId, message } = req.body;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true }
    });
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    const phone = order.customerPhone || order.user?.phone;
    if (phone) await sendWhatsApp(phone, `*Master Burger's*\n${message}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;