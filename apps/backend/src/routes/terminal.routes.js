// apps/backend/src/routes/terminal.routes.js
// PUBLIC endpoint — no JWT. Identifies restaurant via x-restaurant-id header.
// Must be mounted BEFORE tenant middleware.

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const paymentsService = require('../services/payments');
const router = express.Router();

router.post('/charge', async (req, res) => {
  const restaurantId = req.headers['x-restaurant-id'];
  if (!restaurantId) return res.status(400).json({ success: false, errorCode: 'NO_RESTAURANT', message: 'x-restaurant-id requerido' });

  const { terminalId, amount, currency = 'MXN', orderId, orderNumber, locationId } = req.body || {};

  if (!terminalId || typeof terminalId !== 'string' || !terminalId.trim()) {
    return res.status(400).json({ success: false, errorCode: 'INVALID_TERMINAL', message: 'terminalId requerido' });
  }
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 50000) {
    return res.status(400).json({ success: false, errorCode: 'INVALID_AMOUNT', message: 'amount inválido (0 < amount ≤ 50000)' });
  }
  if (!orderId) {
    return res.status(400).json({ success: false, errorCode: 'INVALID_ORDER', message: 'orderId requerido' });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, restaurantId: true, paymentStatus: true, total: true, orderNumber: true },
  });
  if (!order) return res.status(404).json({ success: false, errorCode: 'ORDER_NOT_FOUND', message: 'Orden no encontrada' });
  if (order.restaurantId !== restaurantId) {
    return res.status(403).json({ success: false, errorCode: 'ORDER_FOREIGN', message: 'La orden no pertenece a este restaurante' });
  }
  if (order.paymentStatus !== 'PENDING') {
    return res.status(409).json({ success: false, errorCode: 'ORDER_ALREADY_PAID', message: 'La orden ya no está pendiente' });
  }

  try {
    const result = await paymentsService.charge('stub', {
      terminalId: terminalId.trim(),
      amount: numericAmount,
      currency,
      orderId,
      orderNumber: orderNumber || order.orderNumber,
      restaurantId,
      locationId,
    });

    if (result.success) {
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'PAID', paidAt: new Date() },
      });

      const io = req.app.get('io');
      if (io) {
        io.to(`restaurant:${restaurantId}`).emit('order:payment:confirmed', {
          orderId, orderNumber: result.orderNumber, transactionId: result.transactionId,
        });
      }
    }

    return res.json(result);
  } catch (e) {
    console.error('[terminal] charge error:', e.message);
    return res.status(500).json({ success: false, errorCode: 'DRIVER_ERROR', message: e.message });
  }
});

module.exports = router;
