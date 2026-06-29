const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess, requireRole } = require('../middleware/auth.middleware');
const { requireFeatureFlag } = require('../lib/modules');
const { pick } = require('../lib/validate');
const router = express.Router();

// Checklist canónico de empaque (fijo en servidor).
const PACKING_CHECKS = ['DRINKS_COMPLETE', 'SAUCES_PACKED', 'TICKET_PRINTED', 'ADDRESS_CONFIRMED', 'PAYMENT_CONFIRMED'];

// Gate: hasKDS en el plan del tenant. En modo warn-only por default.
router.use(authenticate, requireTenantAccess, requireFeatureFlag('hasKDS', 'KDS Cocina'));

// Roles autorizados para acciones KDS de cocina (escrituras).
// Lectura es libre para cualquier empleado autenticado del tenant
// (mesero/cajero pueden ver el estado para coordinarse).
const kdsWriteRoles = requireRole(
  'COOK', 'KITCHEN', 'ADMIN', 'OWNER', 'MANAGER', 'SUPER_ADMIN'
);

// GET pedidos activos para una estación
//
// Enrutamiento — fuente única: PrinterGroup → categorías + items.
//   Una categoría/item asignado a un grupo cuyo miembro sea una impresora
//   con type=station entra al filtro de esta estación. El ruteo se gestiona
//   desde /admin/grupos-impresoras (CategoryPrinterGroup / MenuItemPrinterGroup).
//
// Si NINGÚN grupo declara categorías ni items para esta estación, fallback
// "central": muestra todos los items de las órdenes activas (comportamiento
// KDS-único histórico).
router.get('/orders/:station', async (req, res) => {
  try {
    const { station } = req.params;
    const locationId = req.locationId || null;

    const printerWhere = { type: station, isActive: true };
    if (locationId) printerWhere.locationId = locationId;

    // PrinterGroups que contengan al menos una impresora de esta estación.
    const groupWhere = {
      members: { some: { printer: printerWhere } },
    };
    if (locationId) groupWhere.locationId = locationId;

    const groups = await prisma.printerGroup.findMany({
      where: groupWhere,
      include: {
        categories: { select: { categoryId: true } },
        items:      { select: { menuItemId: true } },
      },
    });

    const catIdSet  = new Set();
    const itemIdSet = new Set();

    for (const g of groups) {
      for (const c of g.categories) catIdSet.add(c.categoryId);
      for (const it of g.items)     itemIdSet.add(it.menuItemId);
    }

    const hasFilter = catIdSet.size > 0 || itemIdSet.size > 0;

    const orderWhere = {
      status: { in: ['OPEN', 'CONFIRMED', 'PREPARING'] },
      createdAt: { gte: new Date(Date.now() - 4 * 60 * 60 * 1000) },
    };
    if (locationId) orderWhere.locationId = locationId;

    const orders = await prisma.order.findMany({
      where: orderWhere,
      include: {
        table: true,
        items: {
          include: {
            menuItem: { include: { category: true } },
            modifiers: true,
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Filtrar items: pasa si su categoría OR su menuItem está enrutado
    // a esta estación. Sin filtros declarados → modo central, todos pasan.
    const filtered = orders.map(order => {
      const stationItems = !hasFilter
        ? order.items
        : order.items.filter(i =>
            (i.menuItem?.categoryId && catIdSet.has(i.menuItem.categoryId)) ||
            (i.menuItem?.id && itemIdSet.has(i.menuItem.id))
          );
      return { ...order, items: stationItems };
    }).filter(o => o.items.length > 0);

    // Obtener estados de items ya marcados
    const itemStatuses = await prisma.kdsItemStatus.findMany({
      where: {
        orderId: { in: filtered.map(o => o.id) },
        station
      }
    });

    const result = filtered.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      tableNumber: order.table?.name ?? order.tableNumber ?? null,
      customerName: order.customerName,
      createdAt: order.createdAt,
      notes: order.notes,
      items: order.items.map(item => ({
        id: item.id,
        menuItemId: item.menuItemId,
        menuItemName: item.name || item.menuItem?.name || 'Producto sin nombre',
        quantity: item.quantity,
        notes: item.notes,
        station,
        seatNumber: item.seatNumber,
        course: item.course,
        modifiers: (item.modifiers || []).map(mod => ({
          id: mod.id,
          name: mod.name || mod.modifier?.name || 'Modificador',
          priceAdd: mod.priceAdd,
        })),
        done: itemStatuses.some(s => s.orderItemId === item.id && s.done)
      })),
      allDone: order.items.every(item =>
        itemStatuses.some(s => s.orderItemId === item.id && s.done)
      ),
      waitMinutes: Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000)
    }));

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT marcar item como listo
router.put('/item/:orderItemId/done', kdsWriteRoles, async (req, res) => {
  try {
    const { station, orderId, done } = req.body;
    await prisma.kdsItemStatus.upsert({
      where: { id: `${orderId}-${req.params.orderItemId}-${station}` },
      update: { done, doneAt: done ? new Date() : null },
      create: {
        id: `${orderId}-${req.params.orderItemId}-${station}`,
        orderId, orderItemId: req.params.orderItemId,
        station, done, doneAt: done ? new Date() : null
      }
    });
    // Si todos los items están listos, avanzar la orden. Cuenta orderItems
    // DISTINTOS (un item puede tener varias filas kdsItemStatus si va a más de
    // una estación → no sobrecontar). Si el tenant usa empaque, va a PACKING
    // (verificación) en vez de READY directo; gate por flag para no atascar a
    // quien no lo usa.
    if (done) {
      const order = await prisma.order.findUnique({
        where: { id: orderId }, include: { items: { select: { id: true } } }
      });
      const doneRows = await prisma.kdsItemStatus.findMany({
        where: { orderId, done: true }, select: { orderItemId: true }
      });
      const doneItemIds = new Set(doneRows.map((r) => r.orderItemId));
      if (order && doneItemIds.size >= order.items.length) {
        const cfg = await prisma.restaurantConfig.findUnique({
          where: { restaurantId: req.restaurantId || req.user?.restaurantId },
          select: { hasPackingStage: true },
        });
        await prisma.order.update({
          where: { id: orderId }, data: { status: cfg?.hasPackingStage ? 'PACKING' : 'READY' }
        });
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EMPAQUE ────────────────────────────────────────────────────────────────
// GET pedidos en PACKING + su checklist (5 checks canónicos mergeados).
router.get('/packing/orders', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const where = { restaurantId, status: 'PACKING' };
    if (req.locationId) where.locationId = req.locationId;
    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        items: { select: { id: true, name: true, quantity: true, notes: true } },
        packingChecks: true,
      },
    });
    const result = orders.map((o) => {
      const byKey = new Map(o.packingChecks.map((c) => [c.checkKey, c.checked]));
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        orderType: o.orderType,
        customerName: o.customerName,
        deliveryAddress: o.deliveryAddress,
        paymentStatus: o.paymentStatus,
        createdAt: o.createdAt,
        items: o.items,
        checks: PACKING_CHECKS.map((key) => ({ key, checked: !!byKey.get(key) })),
      };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT marcar/desmarcar un check; al completar los 5 la orden avanza a READY.
router.put('/packing/:orderId/check', kdsWriteRoles, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const { checkKey, checked } = pick(req.body, ['checkKey', 'checked']);
    if (!PACKING_CHECKS.includes(checkKey)) return res.status(400).json({ error: 'checkKey inválido' });
    // findFirst scoped + estado PACKING (no se puede empacar algo que no lo está).
    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId, restaurantId, status: 'PACKING' },
      select: { id: true },
    });
    if (!order) return res.status(404).json({ error: 'El pedido no está en empaque' });

    const result = await prisma.$transaction(async (tx) => {
      await tx.orderPackingCheck.upsert({
        where: { orderId_checkKey: { orderId: order.id, checkKey } },
        update: { checked: !!checked, checkedAt: checked ? new Date() : null, checkedById: req.user?.id || null },
        create: { orderId: order.id, checkKey, checked: !!checked, checkedAt: checked ? new Date() : null, checkedById: req.user?.id || null },
      });
      const done = await tx.orderPackingCheck.findMany({ where: { orderId: order.id, checked: true }, select: { checkKey: true } });
      const doneKeys = new Set(done.map((c) => c.checkKey));
      const allDone = PACKING_CHECKS.every((k) => doneKeys.has(k));
      let advanced = false;
      if (allDone) {
        // Condicional (idempotente): solo avanza si sigue en PACKING.
        const upd = await tx.order.updateMany({ where: { id: order.id, status: 'PACKING' }, data: { status: 'READY' } });
        advanced = upd.count > 0;
      }
      return { allDone, advanced };
    });
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT marcar orden completa como lista
router.put('/order/:orderId/ready', kdsWriteRoles, async (req, res) => {
  try {
    await prisma.order.update({
      where: { id: req.params.orderId },
      data: { status: 'READY' }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST enviar mensaje desde cocina al TPV
router.post('/message', kdsWriteRoles, async (req, res) => {
  try {
    const { orderId, station, message } = req.body;
    const msg = await prisma.kdsMessage.create({
      data: { orderId, station, message }
    });
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET mensajes no leídos (para TPV)
router.get('/messages/unread', async (req, res) => {
  try {
    const msgs = await prisma.kdsMessage.findMany({
      where: { read: false },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.json(msgs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT marcar mensajes como leídos (TPV los lee → cualquier rol del tenant)
router.put('/messages/:id/read', async (req, res) => {
  try {
    await prisma.kdsMessage.update({
      where: { id: req.params.id }, data: { read: true }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET estaciones disponibles
router.get('/stations', async (req, res) => {
  try {
    const printers = await prisma.printer.findMany({
      where: { isActive: true, type: { not: 'CASHIER' } }
    });
    res.json(printers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
