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
        // Master Schema: Aplicar wastagePercent
        // Cantidad = (Qty Receta) * (Factor Merma) * (Qty Item Vendido)
        const wastageFactor = 1 + (r.wastagePercent / 100);
        const needed = r.quantity * wastageFactor * item.quantity;
        
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
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireActiveShift } = require('../middleware/shift.middleware');
const router = express.Router();


// ── GET /admin — Pedidos filtrados por SUCURSAL ──────────────────────────
router.get('/admin', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const orders = await prisma.order.findMany({
      where: {
        restaurantId: req.restaurantId || req.user?.restaurantId,
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
      where: { id: req.params.id, restaurantId: req.restaurantId || req.user?.restaurantId },
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
router.post('/tpv', authenticate, requireTenantAccess, requireAdmin, requireActiveShift, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { items, orderType, tableNumber, tableId, paymentMethod, subtotal, discount, total, customerName, customerPhone, status } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Sin productos' });

    const restaurantId = req.user?.restaurantId || req.restaurantId;

    // Validar tableId si vino: debe pertenecer a esta sucursal y estar activa.
    let table = null;
    if (tableId) {
      table = await prisma.table.findFirst({
        where: { id: tableId, locationId: req.locationId, isActive: true },
      });
      if (!table) return res.status(400).json({ error: 'Mesa no válida para esta sucursal' });
      if (table.status === 'OCCUPIED') {
        return res.status(409).json({
          error: 'La mesa ya tiene una cuenta abierta',
          code: 'TABLE_OCCUPIED',
        });
      }
    }

    const orderNumber = 'TPV-' + Date.now().toString().slice(-6);
    const isDineInTab = (orderType === 'DINE_IN') && !!tableId;

    const createdItems = await Promise.all(items.map(async (item) => {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: item.menuItemId, restaurantId }
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

    // Si es dine-in con mesa: status=OPEN (cuenta abierta) y la primera ronda
    // se crea explícita para que el flujo de rondas posteriores quede limpio.
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          restaurantId,
          locationId: req.locationId,
          shiftId: req.shiftId,
          orderNumber,
          status: status || (isDineInTab ? 'OPEN' : 'CONFIRMED'),
          orderType: orderType || 'TAKEOUT',
          tableNumber: tableNumber || (table ? null : null),
          tableId: tableId || null,
          paymentMethod: paymentMethod || 'CASH',
          subtotal: subtotal || 0,
          discount: discount || 0,
          total: total || 0,
          source: 'TPV',
          customerName, customerPhone,
        },
      });

      if (isDineInTab) {
        // Primera ronda con sus items.
        const round = await tx.orderRound.create({
          data: { orderId: created.id, roundNumber: 1 },
        });
        await tx.orderItem.createMany({
          data: createdItems.map(it => ({ ...it, orderId: created.id, roundId: round.id })),
        });
        await tx.table.update({ where: { id: tableId }, data: { status: 'OCCUPIED' } });
      } else {
        // Quick service: ronda implícita (roundId=null) — flujo legacy.
        await tx.orderItem.createMany({
          data: createdItems.map(it => ({ ...it, orderId: created.id })),
        });
      }

      return tx.order.findUnique({
        where: { id: created.id },
        include: {
          items: { include: { menuItem: { include: { category: true } } } },
          rounds: true,
          table: true,
        },
      });
    });

    await discountInventory(prisma, items, order.id, restaurantId, req.locationId);

    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${restaurantId}:location:${req.locationId}:admins`).emit('order:new', order);
    }

    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /:id/items — Añadir ronda a una orden activa ──────────────────
// Crea una nueva OrderRound (roundNumber = max+1), inserta los items con
// roundId tagueado y manda a cocina SOLO los items de esa ronda (no
// reimprime la cuenta entera).
//
// Alias: POST /:id/rounds — mismo handler, nombre canónico para clientes
// nuevos del API. /items se mantiene por compatibilidad con la TPV actual.
async function addRoundHandler(req, res) {
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
        menuItemId: item.menuItemId,
        name: menuItem?.name || 'Producto',
        price,
        quantity: qty,
        subtotal: price * qty,
        notes: item.notes || null,
      };
    }));

    // Transaccional: crear OrderRound, insertar items con roundId, recalcular totales.
    const { updated, round } = await prisma.$transaction(async (tx) => {
      const lastRound = await tx.orderRound.findFirst({
        where: { orderId: id },
        orderBy: { roundNumber: 'desc' },
        select: { roundNumber: true },
      });
      const nextNumber = (lastRound?.roundNumber || 0) + 1;

      const newRound = await tx.orderRound.create({
        data: { orderId: id, roundNumber: nextNumber },
      });

      await tx.orderItem.createMany({
        data: newItemsData.map(d => ({ ...d, orderId: id, roundId: newRound.id })),
      });

      const all = await tx.orderItem.findMany({ where: { orderId: id } });
      const subtotal = all.reduce((s, i) => s + (i.subtotal || 0), 0);
      const discount = existing.discount || 0;
      const deliveryFee = existing.deliveryFee || 0;
      const total = subtotal - discount + deliveryFee;

      const finalOrder = await tx.order.update({
        where: { id },
        data: { subtotal, total },
        include: {
          user: { select: { name: true, phone: true } },
          items: { include: { menuItem: { select: { name: true, categoryId: true } } } },
          rounds: { orderBy: { roundNumber: 'asc' } },
          address: true,
          table: true,
        },
      });

      return { updated: finalOrder, round: newRound };
    });

    // Descontar inventario con el request original (usa menuItemId + quantity).
    await discountInventory(prisma, items, id, restaurantId, req.locationId);

    // Imprimir SOLO los items de esta ronda en cocina. Fire-and-forget.
    try {
      const { printOrderRoundTicket } = require('../services/printer.service');
      printOrderRoundTicket(updated, round.id).catch(() => {});
    } catch (err) { console.error('Print round ticket no disponible:', err.message); }

    // Notificar a clientes conectados (admin/cocina) para refresco en vivo.
    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${restaurantId}:location:${req.locationId}:admins`)
        .emit('order:updated', updated);
    }

    res.json({ ...updated, lastRound: round });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

router.post('/:id/items',  authenticate, requireTenantAccess, requireAdmin, addRoundHandler);
router.post('/:id/rounds', authenticate, requireTenantAccess, requireAdmin, addRoundHandler);

// ── GESTIÓN DE PAGOS Y CUENTAS ──

// Helper: cuando un dine-in se paga, libera la mesa (OCCUPIED → DIRTY) para
// que el equipo de salón sepa que está pendiente de limpieza. Idempotente:
// si la orden no es dine-in o no tiene tableId, no-op.
async function releaseTableIfDineIn(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { tableId: true, orderType: true },
  });
  if (!order?.tableId || order.orderType !== 'DINE_IN') return;
  await prisma.table.update({
    where: { id: order.tableId },
    data: { status: 'DIRTY' },
  }).catch(() => {});
}

router.post('/:id/confirm-payment', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id, restaurantId: req.restaurantId || req.user?.restaurantId },
      data: { status: 'CONFIRMED', paidAt: new Date(), paymentStatus: 'PAID' },
      include: { user: true }
    });
    await releaseTableIfDineIn(order.id);
    res.json({ ok: true, order });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/print-bill', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id, restaurantId: req.restaurantId || req.user?.restaurantId },
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

router.put('/:id/confirm-cash', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id, restaurantId: req.restaurantId || req.user?.restaurantId },
      data: {
        cashCollected: true,
        cashCollectedAt: new Date(),
        paymentStatus: 'PAID',
        paidAt: new Date(),
      }
    });

    // Kick del cajón: fire-and-forget. Un cobro nunca debe fallar porque el
    // cajón esté desconectado o no haya impresora de caja configurada.
    try {
      const { kickCashDrawerForLocation } = require('../services/printer.service');
      kickCashDrawerForLocation(order.locationId).catch(() => {});
    } catch (err) { console.error('Drawer kick no disponible:', err.message); }

    // Si era dine-in, liberar la mesa (OCCUPIED → DIRTY).
    await releaseTableIfDineIn(order.id);

    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/status', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await prisma.order.update({
      where: { id: req.params.id, restaurantId: req.user?.restaurantId || req.restaurantId },
      data: { status }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${order.restaurantId}:location:${order.locationId}:admins`).emit('order:updated', order);
    }

    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/payment', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const { paymentMethod } = req.body;
    const order = await prisma.order.update({
      where: { id: req.params.id, restaurantId: req.user?.restaurantId || req.restaurantId },
      data: {
        paymentMethod,
        paymentStatus: 'PAID',
        status: 'DELIVERED',
        paidAt: new Date(),
        cashCollected: paymentMethod === 'CASH',
        cashCollectedAt: paymentMethod === 'CASH' ? new Date() : null,
      }
    });

    await releaseTableIfDineIn(order.id);

    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${order.restaurantId}:location:${order.locationId}:admins`).emit('order:updated', order);
    }

    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /:id/void-payment — Anular un cobro (solo ADMIN) ──────────────
// Revierte un pago marcado como PAID: deja la orden como pendiente de cobro
// y conserva una nota de auditoría con el nombre del admin que anuló.
router.put('/:id/void-payment', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
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
