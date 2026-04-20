require('dotenv').config();

// Funcion para descontar inventario al vender (Adaptada a Sucursal)
async function discountInventory(prisma, items, orderId, restaurantId, locationId) {
  try {
    for (const item of items) {
      const recipe = await prisma.recipeItem.findMany({
        where: {
          menuItemId: item.menuItemId,
          menuItem: { restaurantId }
        },
      });
      for (const r of recipe) {
        const needed = r.quantity * item.quantity;
        await prisma.ingredient.update({
          where: { id: r.ingredientId, locationId },
          data: { stock: { decrement: needed } },
        });
        await prisma.inventoryMovement.create({
          data: {
            ingredientId: r.ingredientId,
            type: 'OUT',
            quantity: needed,
            reason: 'Venta',
            orderId: orderId,
          }
        });
      }
    }
  } catch (e) {
    console.error('Error descontando inventario:', e.message);
  }
}

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const { requireActiveShift } = require('../middleware/shift.middleware');
const router = express.Router();


// ── GET /admin — Pedidos filtrados por SUCURSAL ──────────────────────────
router.get('/admin', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const orders = await prisma.order.findMany({
      where: {
        restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId,
        locationId: req.locationId
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { name: true, phone: true } },
        items: { include: { menuItem: { select: { name: true, categoryId: true } } } },
        address: true,
      }
    });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /:id — Detalle completo ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id, restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId },
      include: {
        user: { select: { name: true, phone: true, email: true } },
        items: { include: { menuItem: true } },
        address: true,
      }
    });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    let driver = null;
    if (order.deliveryDriverId) {
      driver = await prisma.employee.findUnique({
        where: { id: order.deliveryDriverId },
        select: { id: true, name: true, phone: true, photo: true }
      });
    }

    res.json({ ...order, driver });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /tpv — Crear pedido ──────────────────────────────────────────
router.post('/tpv', authenticate, requireAdmin, requireActiveShift, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { items, orderType, tableNumber, paymentMethod, subtotal, discount, total, customerName, customerPhone, status } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Sin productos' });

    const orderNumber = 'TPV-' + Date.now().toString().slice(-6);

    const createdItems = await Promise.all(items.map(async (item) => {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: item.menuItemId, restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId }
      });
      return {
        menuItemId: item.menuItemId,
        name: menuItem?.name || 'Producto',
        price: menuItem?.price || 0,
        quantity: item.quantity,
        subtotal: (menuItem?.price || 0) * item.quantity,
        notes: item.notes || null,
      };
    }));

    const order = await prisma.order.create({
      data: {
        restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId,
        locationId: req.locationId,
        shiftId: req.shiftId,
        orderNumber,
        status: status || 'CONFIRMED',
        orderType: orderType || 'TAKEOUT',
        tableNumber: tableNumber || null,
        paymentMethod: paymentMethod || 'CASH',
        subtotal: subtotal || 0,
        discount: discount || 0,
        total: total || 0,
        source: 'TPV',
        customerName, customerPhone,
        items: { create: createdItems },
      },
      include: { items: { include: { menuItem: { include: { category: true } } } } },
    });

    await discountInventory(prisma, items, order.id, req.user?.restaurantId || req.user?.restaurantId || req.restaurantId, req.locationId);

    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${req.user?.restaurantId || req.user?.restaurantId || req.restaurantId}:location:${req.locationId}:admins`).emit('order:new', order);
    }

    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /:id/items — Añadir ronda a una orden activa ──────────────────
// Inserta nuevos OrderItem sobre una orden ya abierta (no pagada ni cerrada),
// re-calcula subtotal/total y devuelve la orden completa actualizada.
router.post('/:id/items', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { id } = req.params;
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sin productos' });
    }

    const restaurantId = req.user?.restaurantId || req.restaurantId;

    // Verificar que la orden existe, pertenece a la misma sucursal y sigue abierta.
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Orden no encontrada' });
    if (existing.locationId !== req.locationId) {
      return res.status(403).json({ error: 'La orden pertenece a otra sucursal' });
    }
    if (['DELIVERED', 'CANCELLED'].includes(existing.status)) {
      return res.status(400).json({ error: 'No se pueden agregar ítems a una orden cerrada' });
    }
    if (existing.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'La orden ya fue pagada' });
    }

    // Re-leer precios desde DB (misma lógica de defensa que POST /tpv).
    const newItemsData = await Promise.all(items.map(async (item) => {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: item.menuItemId, restaurantId }
      });
      const price = menuItem?.price || 0;
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      return {
        orderId: id,
        menuItemId: item.menuItemId,
        name: menuItem?.name || 'Producto',
        price,
        quantity: qty,
        subtotal: price * qty,
        notes: item.notes || null,
      };
    }));

    // Transaccional: insertar items + recalcular totales desde cero.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.orderItem.createMany({ data: newItemsData });

      const all = await tx.orderItem.findMany({ where: { orderId: id } });
      const subtotal = all.reduce((s, i) => s + (i.subtotal || 0), 0);
      const discount = existing.discount || 0;
      const deliveryFee = existing.deliveryFee || 0;
      const total = subtotal - discount + deliveryFee;

      return tx.order.update({
        where: { id },
        data: { subtotal, total },
        include: {
          user: { select: { name: true, phone: true } },
          items: { include: { menuItem: { select: { name: true, categoryId: true } } } },
          address: true,
        },
      });
    });

    // Descontar inventario con el request original (usa menuItemId + quantity).
    await discountInventory(prisma, items, id, restaurantId, req.locationId);

    // Notificar a clientes conectados (admin/cocina) para refresco en vivo.
    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${restaurantId}:location:${req.locationId}:admins`)
        .emit('order:updated', updated);
    }

    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GESTIÓN DE PAGOS Y CUENTAS ──

router.post('/:id/confirm-payment', authenticate, requireAdmin, async (req, res) => {
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id, restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId },
      data: { status: 'CONFIRMED', paidAt: new Date(), paymentStatus: 'PAID' },
      include: { user: true }
    });
    res.json({ ok: true, order });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/print-bill', authenticate, requireAdmin, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id, restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId },
      include: { items: { include: { menuItem: true } } }
    });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    // Llamada al servicio de impresión (debe estar en services/printer.service)
    try {
      const { printBillTicket } = require('../services/printer.service');
      await printBillTicket(order);
    } catch (err) { console.error('Error impresora:', err.message); }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/confirm-cash', authenticate, async (req, res) => {
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id, restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId },
      data: {
        cashCollected: true,
        cashCollectedAt: new Date(),
        paymentStatus: 'PAID',
        paidAt: new Date(),
      }
    });
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /:id/void-payment — Anular un cobro (solo ADMIN) ──────────────
// Revierte un pago marcado como PAID: deja la orden como pendiente de cobro
// y conserva una nota de auditoría con el nombre del admin que anuló.
router.put('/:id/void-payment', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.restaurantId;

    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Orden no encontrada' });
    if (existing.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'La orden pertenece a otro restaurante' });
    }
    if (existing.paymentStatus !== 'PAID') {
      return res.status(400).json({ error: 'La orden no está pagada' });
    }

    // Registrar auditoría en `notes` — el schema no tiene un log dedicado
    // para anulaciones de pago, así que preservamos la traza aquí.
    const voidedBy =
      req.user?.name || req.user?.email || `empleado#${req.user?.id}`;
    const stamp = new Date().toISOString();
    const auditNote = `[Cobro anulado por ${voidedBy} el ${stamp}]`;
    const notes = existing.notes ? `${existing.notes}\n${auditNote}` : auditNote;

    const updated = await prisma.order.update({
      where: { id },
      data: {
        paymentStatus: 'PENDING',
        cashCollected: false,
        cashCollectedAt: null,
        cashCollectedBy: null,
        paidAt: null,
        paymentMethod: 'PENDING',
        notes,
      },
      include: {
        user: { select: { name: true, phone: true } },
        items: { include: { menuItem: { select: { name: true, categoryId: true } } } },
      }
    });

    const io = req.app.get('io');
    if (io && existing.locationId) {
      io.to(`restaurant:${restaurantId}:location:${existing.locationId}:admins`)
        .emit('order:updated', updated);
    }

    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CHAT DE PEDIDO ──

router.get('/:id/messages', async (req, res) => {
  try {
    const messages = await prisma.deliveryMessage.findMany({
      where: { orderId: req.params.id },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/messages', async (req, res) => {
  try {
    const { message, fromDriver } = req.body;
    const msg = await prisma.deliveryMessage.create({
      data: { orderId: req.params.id, message, fromDriver: fromDriver || false }
    });
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
