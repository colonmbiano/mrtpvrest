// apps/backend/src/routes/terminal.routes.js

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const paymentsService = require('../services/payments');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const router = express.Router();

router.post(
  '/charge',
  authenticate,
  requireRole('CASHIER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'),
  async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.headers['x-restaurant-id'];
    if (!restaurantId) {
      return res.status(400).json({ success: false, errorCode: 'NO_RESTAURANT', message: 'Restaurante requerido' });
    }

    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_STUB_PAYMENTS !== 'true') {
      return res.status(503).json({
        success: false,
        errorCode: 'PAYMENT_DRIVER_NOT_CONFIGURED',
        message: 'Driver de terminal no configurado',
      });
    }

    const { terminalId, amount, currency = 'MXN', orderId, orderNumber, locationId } = req.body || {};

    if (!terminalId || typeof terminalId !== 'string' || !terminalId.trim()) {
      return res.status(400).json({ success: false, errorCode: 'INVALID_TERMINAL', message: 'terminalId requerido' });
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 50000) {
      return res.status(400).json({ success: false, errorCode: 'INVALID_AMOUNT', message: 'amount invalido (0 < amount <= 50000)' });
    }
    if (!orderId) {
      return res.status(400).json({ success: false, errorCode: 'INVALID_ORDER', message: 'orderId requerido' });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, restaurantId: true, locationId: true, paymentStatus: true, total: true, orderNumber: true },
    });
    if (!order) return res.status(404).json({ success: false, errorCode: 'ORDER_NOT_FOUND', message: 'Orden no encontrada' });
    if (order.restaurantId !== restaurantId) {
      return res.status(403).json({ success: false, errorCode: 'ORDER_FOREIGN', message: 'La orden no pertenece a este restaurante' });
    }
    if (req.user?.role !== 'SUPER_ADMIN' && req.user?.locationId && order.locationId && order.locationId !== req.user.locationId) {
      return res.status(403).json({ success: false, errorCode: 'LOCATION_FOREIGN', message: 'La orden pertenece a otra sucursal' });
    }
    if (locationId && order.locationId && order.locationId !== locationId) {
      return res.status(403).json({ success: false, errorCode: 'LOCATION_FOREIGN', message: 'La orden pertenece a otra sucursal' });
    }
    if (order.paymentStatus !== 'PENDING') {
      return res.status(409).json({ success: false, errorCode: 'ORDER_ALREADY_PAID', message: 'La orden ya no esta pendiente' });
    }
    if (Math.abs(Number(order.total) - numericAmount) > 0.01) {
      return res.status(409).json({ success: false, errorCode: 'AMOUNT_MISMATCH', message: 'El monto no coincide con el total de la orden' });
    }

    try {
      const result = await paymentsService.charge('stub', {
        terminalId: terminalId.trim(),
        amount: numericAmount,
        currency,
        orderId,
        orderNumber: orderNumber || order.orderNumber,
        restaurantId,
        locationId: order.locationId || locationId,
      });

      if (result.success) {
        await prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'PAID', paidAt: new Date() },
        });

        const io = req.app.get('io');
        if (io) {
          io.to(`restaurant:${restaurantId}`).emit('order:payment:confirmed', {
            orderId,
            orderNumber: result.orderNumber,
            transactionId: result.transactionId,
          });
        }
      }

      return res.json(result);
    } catch (e) {
      console.error('[terminal] charge error:', e.message);
      return res.status(500).json({ success: false, errorCode: 'DRIVER_ERROR', message: e.message });
    }
  }
);

module.exports = router;
