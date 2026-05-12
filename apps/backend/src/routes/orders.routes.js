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
const { authenticate, requireAdmin, requireTenantAccess, requireRole } = require('../middleware/auth.middleware');
const { requireActiveShift } = require('../middleware/shift.middleware');
const { validateBody } = require('../lib/validate');
const {
  createOrderSchema,
  addItemsSchema,
  updateStatusSchema,
  updatePaymentSchema,
  messageSchema,
} = require('../schemas/orders.schema');
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

// ── GET /:id — Detalle completo (requiere auth + tenant scope) ───────────
router.get('/:id', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Restaurante no identificado' });
    }

    // Filtrar por restaurantId garantiza que solo se devuelva la orden si
    // pertenece al tenant del token. findFirst evita el undefined-bypass de
    // findUnique que Prisma silenciosamente ignoraba.
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, restaurantId },
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
router.post('/tpv', authenticate, requireTenantAccess, requireRole('CASHIER', 'WAITER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'), requireActiveShift, validateBody(createOrderSchema), async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { items, orderType, tableNumber, tableId, numberOfGuests, paymentMethod, subtotal, discount, total, customerName, customerPhone, status } = req.body;
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

    // Resolver cada item con su menuItem y modificadores (validados contra DB).
    // El precio del item siempre se re-lee del servidor, igual que los priceAdd
    // de los modificadores: el cliente no puede manipular precios.
    const resolvedItems = await Promise.all(items.map(async (item) => {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: item.menuItemId, restaurantId },
        include: { modifierGroups: { include: { modifiers: true } } },
      });

      const basePrice = menuItem?.price || 0;
      const modifierIds = Array.isArray(item.modifiers)
        ? item.modifiers.map((m) => m?.modifierId).filter(Boolean)
        : [];

      // Indexar todos los modificadores válidos del item por id, agrupados.
      const validModsById = new Map();
      const groupsById = new Map();
      for (const g of menuItem?.modifierGroups || []) {
        groupsById.set(g.id, g);
        for (const m of g.modifiers) validModsById.set(m.id, m);
      }

      // Filtrar a sólo los que efectivamente pertenecen al item; agrupar por groupId.
      const selectedByGroup = new Map();
      for (const id of modifierIds) {
        const mod = validModsById.get(id);
        if (!mod) continue;
        const arr = selectedByGroup.get(mod.groupId) || [];
        arr.push(mod);
        selectedByGroup.set(mod.groupId, arr);
      }

      // Aplicar freeModifiersLimit por grupo: los más baratos van gratis primero.
      let unitExtra = 0;
      const flatMods = [];
      for (const [groupId, mods] of selectedByGroup.entries()) {
        const free = groupsById.get(groupId)?.freeModifiersLimit || 0;
        const sorted = [...mods].sort((a, b) => a.priceAdd - b.priceAdd);
        sorted.forEach((m, idx) => {
          const charge = idx >= free ? m.priceAdd : 0;
          unitExtra += charge;
          flatMods.push({ modifierId: m.id, name: m.name, priceAdd: charge });
        });
      }

      const unitPrice = basePrice + unitExtra;
      const seatRaw = Number(item.seatNumber);
      const seatNumber = Number.isFinite(seatRaw) && seatRaw >= 1 && seatRaw <= 50
        ? Math.floor(seatRaw)
        : null;
      // FASE 11 · COURSING — normalizar a uppercase y permitir solo
      // strings sanos (1..32 chars). Valores libres pero acotados para
      // que cocina pueda agruparlos sin sorpresas (mismo string siempre).
      const courseRaw = typeof item.course === 'string' ? item.course.trim().toUpperCase() : null;
      const course = courseRaw && courseRaw.length > 0 && courseRaw.length <= 32 ? courseRaw : null;
      return {
        menuItemId: item.menuItemId,
        name: menuItem?.name || 'Producto',
        price: unitPrice,
        quantity: item.quantity,
        subtotal: unitPrice * item.quantity,
        notes: item.notes || null,
        seatNumber,
        course,
        _modifiers: flatMods,
      };
    }));

    // Si es dine-in con mesa: status=OPEN (cuenta abierta) y la primera ronda
    // se crea explícita para que el flujo de rondas posteriores quede limpio.
    const order = await prisma.$transaction(async (tx) => {
      // numberOfGuests: clamp 1..50, ignorado si no es DINE_IN.
      const guestsRaw = Number(numberOfGuests);
      const safeGuests = isDineInTab && Number.isFinite(guestsRaw) && guestsRaw >= 1 && guestsRaw <= 50
        ? Math.floor(guestsRaw)
        : null;

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
          numberOfGuests: safeGuests,
          paymentMethod: paymentMethod || 'CASH',
          subtotal: subtotal || 0,
          discount: discount || 0,
          total: total || 0,
          source: 'TPV',
          customerName, customerPhone,
        },
      });

      let roundId = null;
      if (isDineInTab) {
        const round = await tx.orderRound.create({
          data: { orderId: created.id, roundNumber: 1 },
        });
        roundId = round.id;
        await tx.table.update({ where: { id: tableId }, data: { status: 'OCCUPIED' } });
      }

      // Creamos cada OrderItem individualmente porque los modificadores son
      // una relación nested write (no se puede con createMany).
      for (const it of resolvedItems) {
        const { _modifiers, ...itemData } = it;
        await tx.orderItem.create({
          data: {
            ...itemData,
            orderId: created.id,
            roundId,
            modifiers: _modifiers.length
              ? { create: _modifiers.map(m => ({ modifierId: m.modifierId, name: m.name, priceAdd: m.priceAdd })) }
              : undefined,
          },
        });
      }

      return tx.order.findUnique({
        where: { id: created.id },
        include: {
          items: { include: { menuItem: { include: { category: true } }, modifiers: true } },
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
      const seatRaw = Number(item.seatNumber);
      const seatNumber = Number.isFinite(seatRaw) && seatRaw >= 1 && seatRaw <= 50
        ? Math.floor(seatRaw)
        : null;
      const courseRaw = typeof item.course === 'string' ? item.course.trim().toUpperCase() : null;
      const course = courseRaw && courseRaw.length > 0 && courseRaw.length <= 32 ? courseRaw : null;
      return {
        menuItemId: item.menuItemId,
        name: menuItem?.name || 'Producto',
        price,
        quantity: qty,
        subtotal: price * qty,
        notes: item.notes || null,
        seatNumber,
        course,
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

router.post('/:id/items',  authenticate, requireTenantAccess, requireAdmin, validateBody(addItemsSchema), addRoundHandler);
router.post('/:id/rounds', authenticate, requireTenantAccess, requireAdmin, validateBody(addItemsSchema), addRoundHandler);

// ── PUT /items/:itemId — Editar cantidad/notas de un item de orden abierta
// Sólo admin/manager. Bloquea ediciones si la orden está cerrada o pagada.
// Recalcula subtotal del item y totales de la orden, y emite order:updated
// por socket para refresco en vivo de admin/cocina.
router.put('/items/:itemId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { quantity, notes } = req.body || {};
    const restaurantId = req.user?.restaurantId || req.restaurantId;

    const orderItem = await prisma.orderItem.findUnique({
      where: { id: req.params.itemId },
      include: { order: true, modifiers: true },
    });
    if (!orderItem) return res.status(404).json({ error: 'Item no encontrado' });
    if (orderItem.order.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'Item de otro restaurante' });
    }
    if (orderItem.order.locationId && req.locationId && orderItem.order.locationId !== req.locationId) {
      return res.status(403).json({ error: 'Item de otra sucursal' });
    }
    if (['DELIVERED', 'CANCELLED'].includes(orderItem.order.status)) {
      return res.status(400).json({ error: 'La orden ya está cerrada' });
    }
    if (orderItem.order.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'La orden ya fue pagada' });
    }

    // Validar inputs. Si no viene quantity/notes válido, no-op para ese campo.
    const newQty = quantity !== undefined
      ? Math.max(1, Math.min(99, parseInt(quantity, 10) || orderItem.quantity))
      : orderItem.quantity;
    const newNotes = notes !== undefined
      ? (typeof notes === 'string' ? notes.slice(0, 200) : null)
      : orderItem.notes;

    // Subtotal del item = price unitario × quantity. price ya incluye los
    // modificadores aplicados al item (ver lógica de POST /tpv).
    const newSubtotal = orderItem.price * newQty;

    const updatedOrder = await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: req.params.itemId },
        data: { quantity: newQty, subtotal: newSubtotal, notes: newNotes },
      });

      const remaining = await tx.orderItem.findMany({
        where: { orderId: orderItem.orderId },
        select: { subtotal: true },
      });
      const newOrderSubtotal = remaining.reduce((s, i) => s + (i.subtotal || 0), 0);
      const discount = orderItem.order.discount || 0;
      const deliveryFee = orderItem.order.deliveryFee || 0;
      const newTotal = newOrderSubtotal - discount + deliveryFee;

      return tx.order.update({
        where: { id: orderItem.orderId },
        data: { subtotal: newOrderSubtotal, total: newTotal },
        include: {
          items: { include: { menuItem: { select: { name: true, categoryId: true } }, modifiers: true } },
          rounds: { orderBy: { roundNumber: 'asc' } },
          table: true,
        },
      });
    });

    const io = req.app.get('io');
    if (io && updatedOrder.locationId) {
      io.to(`restaurant:${restaurantId}:location:${updatedOrder.locationId}:admins`)
        .emit('order:updated', updatedOrder);
    }

    res.json(updatedOrder);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /items/:itemId — Eliminar item de orden abierta
// Misma protección que PUT. Recalcula totales tras la eliminación.
router.delete('/items/:itemId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;

    const orderItem = await prisma.orderItem.findUnique({
      where: { id: req.params.itemId },
      include: { order: true },
    });
    if (!orderItem) return res.status(404).json({ error: 'Item no encontrado' });
    if (orderItem.order.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'Item de otro restaurante' });
    }
    if (orderItem.order.locationId && req.locationId && orderItem.order.locationId !== req.locationId) {
      return res.status(403).json({ error: 'Item de otra sucursal' });
    }
    if (['DELIVERED', 'CANCELLED'].includes(orderItem.order.status)) {
      return res.status(400).json({ error: 'La orden ya está cerrada' });
    }
    if (orderItem.order.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'La orden ya fue pagada' });
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      await tx.orderItem.delete({ where: { id: req.params.itemId } });

      const remaining = await tx.orderItem.findMany({
        where: { orderId: orderItem.orderId },
        select: { subtotal: true },
      });
      const newSubtotal = remaining.reduce((s, i) => s + (i.subtotal || 0), 0);
      const discount = orderItem.order.discount || 0;
      const deliveryFee = orderItem.order.deliveryFee || 0;
      const newTotal = newSubtotal - discount + deliveryFee;

      return tx.order.update({
        where: { id: orderItem.orderId },
        data: { subtotal: newSubtotal, total: newTotal },
        include: {
          items: { include: { menuItem: { select: { name: true, categoryId: true } }, modifiers: true } },
          rounds: { orderBy: { roundNumber: 'asc' } },
          table: true,
        },
      });
    });

    const io = req.app.get('io');
    if (io && updatedOrder.locationId) {
      io.to(`restaurant:${restaurantId}:location:${updatedOrder.locationId}:admins`)
        .emit('order:updated', updatedOrder);
    }

    res.json(updatedOrder);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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

router.put('/:id/status', authenticate, requireTenantAccess, validateBody(updateStatusSchema), async (req, res) => {
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

router.put('/:id/payment', authenticate, requireTenantAccess, validateBody(updatePaymentSchema), async (req, res) => {
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

// ── POST /:id/transfer-to/:targetId — Transferir todos los items
// de una orden abierta a otra orden abierta. La orden origen se cierra
// (CANCELLED) y, si era dine-in, libera la mesa. Solo admin/manager.
//
// /merge es alias del mismo handler. Diferencia conceptual:
//   transfer → mover toda una cuenta a otra mesa
//   merge    → fusionar dos cuentas existentes (mismo flujo)
// Ambos tratan los items de la origen como ítems del destino.
async function transferOrderHandler(req, res) {
  try {
    const { id, targetId } = req.params;
    if (id === targetId) return res.status(400).json({ error: 'Origen y destino son la misma orden' });

    const restaurantId = req.user?.restaurantId || req.restaurantId;

    const [source, target] = await Promise.all([
      prisma.order.findUnique({ where: { id }, include: { items: true } }),
      prisma.order.findUnique({ where: { id: targetId }, include: { items: true } }),
    ]);
    if (!source) return res.status(404).json({ error: 'Orden origen no encontrada' });
    if (!target) return res.status(404).json({ error: 'Orden destino no encontrada' });
    if (source.restaurantId !== restaurantId || target.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'Las órdenes pertenecen a otro restaurante' });
    }
    if (source.locationId && target.locationId && source.locationId !== target.locationId) {
      return res.status(400).json({ error: 'Las órdenes son de sucursales distintas' });
    }
    for (const o of [source, target]) {
      if (['DELIVERED', 'CANCELLED'].includes(o.status)) {
        return res.status(400).json({ error: `Orden ${o.id === id ? 'origen' : 'destino'} cerrada` });
      }
      if (o.paymentStatus === 'PAID') {
        return res.status(400).json({ error: `Orden ${o.id === id ? 'origen' : 'destino'} ya pagada` });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Mover items origen → destino. Usamos updateMany para no perder
      // modificadores ni roundId/seatNumber (todos viven en OrderItem).
      await tx.orderItem.updateMany({
        where: { orderId: id },
        data: { orderId: targetId },
      });

      // Recalcular totales del destino con todos los items consolidados.
      const items = await tx.orderItem.findMany({
        where: { orderId: targetId },
        select: { subtotal: true },
      });
      const newSubtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0);
      const discount = target.discount || 0;
      const deliveryFee = target.deliveryFee || 0;
      const newTotal = newSubtotal - discount + deliveryFee;

      const updatedTarget = await tx.order.update({
        where: { id: targetId },
        data: { subtotal: newSubtotal, total: newTotal },
        include: {
          items: { include: { menuItem: { select: { name: true, categoryId: true } }, modifiers: true } },
          rounds: { orderBy: { roundNumber: 'asc' } },
          table: true,
        },
      });

      // Cancelar origen (no la borramos para preservar audit trail) y
      // liberar mesa si era dine-in.
      await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: `${source.notes ? source.notes + '\n' : ''}[Transferida a orden ${target.orderNumber || targetId.slice(-6)}]`,
        },
      });
      if (source.tableId && source.orderType === 'DINE_IN') {
        await tx.table.update({
          where: { id: source.tableId },
          data: { status: 'AVAILABLE' },
        }).catch(() => { /* mesa eliminada o ya liberada */ });
      }

      return updatedTarget;
    });

    const io = req.app.get('io');
    if (io && result.locationId) {
      io.to(`restaurant:${restaurantId}:location:${result.locationId}:admins`)
        .emit('order:updated', result);
    }

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

router.post('/:id/transfer-to/:targetId', authenticate, requireTenantAccess, requireAdmin, transferOrderHandler);
router.post('/:id/merge/:targetId',       authenticate, requireTenantAccess, requireAdmin, transferOrderHandler);

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

// ── CHAT DE PEDIDO (requiere auth + tenant scope) ─────────────────────────

router.get('/:id/messages', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Restaurante no identificado' });
    }

    // Verifica que la orden existe y pertenece al tenant antes de exponer chat.
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, restaurantId },
      select: { id: true },
    });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const messages = await prisma.deliveryMessage.findMany({
      where: { orderId: req.params.id },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/messages', authenticate, requireTenantAccess, validateBody(messageSchema), async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Restaurante no identificado' });
    }

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, restaurantId },
      select: { id: true },
    });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const { message, fromDriver } = req.body;

    const msg = await prisma.deliveryMessage.create({
      data: { orderId: req.params.id, message: message.trim(), fromDriver: fromDriver || false }
    });
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
