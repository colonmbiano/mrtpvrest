const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess, requireRole } = require('../middleware/auth.middleware');
const { requireFeatureFlag } = require('../lib/modules');
const router = express.Router();

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
// Enrutamiento (en este orden, fuentes que se UNEN — no se sobrescriben):
//   1. PrinterGroup → categorías + items: el modelo moderno.
//      Una categoría/item asignado a un grupo cuyo miembro sea una
//      impresora con type=station entra al filtro de esta estación.
//   2. Printer.categories[] (legacy): array Postgres de categoryIds en la
//      propia impresora. Se respeta para que la pantalla "Asignar
//      categorías" del modal por-impresora siga funcionando aunque no
//      uses Printer Groups.
//
// Si NINGUNA fuente declara categorías ni items para esta estación,
// fallback "central": muestra todos los items de las órdenes activas
// (comportamiento KDS-único histórico).
router.get('/orders/:station', async (req, res) => {
  try {
    const { station } = req.params;
    const locationId = req.locationId || null;

    const printerWhere = { type: station, isActive: true };
    if (locationId) printerWhere.locationId = locationId;

    // 1) PrinterGroups que contengan al menos una impresora de esta estación
    const groupWhere = {
      members: { some: { printer: printerWhere } },
    };
    if (locationId) groupWhere.locationId = locationId;

    const [groups, legacyPrinters] = await Promise.all([
      prisma.printerGroup.findMany({
        where: groupWhere,
        include: {
          categories: { select: { categoryId: true } },
          items:      { select: { menuItemId: true } },
        },
      }),
      prisma.printer.findMany({
        where: printerWhere,
        select: { categories: true },
      }),
    ]);

    const catIdSet  = new Set();
    const itemIdSet = new Set();

    for (const g of groups) {
      for (const c of g.categories) catIdSet.add(c.categoryId);
      for (const it of g.items)     itemIdSet.add(it.menuItemId);
    }
    for (const p of legacyPrinters) {
      // Postgres String[] → ya es array. Si por algún motivo viniera string
      // (datos antiguos en JSON) lo intentamos parsear best-effort.
      const arr = Array.isArray(p.categories)
        ? p.categories
        : (() => { try { return JSON.parse(p.categories || '[]'); } catch { return []; } })();
      for (const id of arr) catIdSet.add(id);
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
    // Si todos los items están listos, avanzar orden a READY
    if (done) {
      const order = await prisma.order.findUnique({
        where: { id: orderId }, include: { items: true }
      });
      const allDone = await prisma.kdsItemStatus.findMany({
        where: { orderId, done: true }
      });
      if (order && allDone.length >= order.items.length) {
        await prisma.order.update({
          where: { id: orderId }, data: { status: 'READY' }
        });
      }
    }
    res.json({ ok: true });
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
