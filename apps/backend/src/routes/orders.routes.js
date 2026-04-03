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
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const prisma = new PrismaClient();
const router = express.Router();


// ── GET /admin — Pedidos filtrados por SUCURSAL ──────────────────────────
router.get('/admin', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const orders = await prisma.order.findMany({
      where: {
        restaurantId: req.restaurantId,
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
      where: { id: req.params.id, restaurantId: req.restaurantId },
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
router.post('/tpv', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { items, orderType, tableNumber, paymentMethod, subtotal, discount, total, customerName, customerPhone, status } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Sin productos' });

    const orderNumber = 'TPV-' + Date.now().toString().slice(-6);

    const createdItems = await Promise.all(items.map(async (item) => {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: item.menuItemId, restaurantId: req.restaurantId }
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
        restaurantId: req.restaurantId,
        locationId: req.locationId,
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

    await discountInventory(prisma, items, order.id, req.restaurantId, req.locationId);

    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${req.restaurantId}:location:${req.locationId}:admins`).emit('order:new', order);
    }

    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GESTIÓN DE PAGOS Y CUENTAS ──

router.post('/:id/confirm-payment', authenticate, requireAdmin, async (req, res) => {
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id, restaurantId: req.restaurantId },
      data: { status: 'CONFIRMED', paidAt: new Date(), paymentStatus: 'PAID' },
      include: { user: true }
    });
    res.json({ ok: true, order });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/print-bill', authenticate, requireAdmin, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id, restaurantId: req.restaurantId },
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
      where: { id: req.params.id, restaurantId: req.restaurantId },
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
