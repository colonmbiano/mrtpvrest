const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const router = express.Router();

// GET pedidos activos para una estación
router.get('/orders/:station', async (req, res) => {
  try {
    const { station } = req.params;
    // Buscar categorías asignadas a esta estación
    const printers = await prisma.printer.findMany({
      where: { type: station, isActive: true }
    });
    const catIds = printers.flatMap(p => {
      try { return JSON.parse(p.categories || '[]'); } catch { return []; }
    });

    const orders = await prisma.order.findMany({
      where: {
        status: { in: ['CONFIRMED', 'PREPARING'] },
        createdAt: { gte: new Date(Date.now() - 4 * 60 * 60 * 1000) } // últimas 4 horas
      },
      include: {
        items: {
          include: { menuItem: { include: { category: true } } }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Filtrar items por categorías de esta estación
    const filtered = orders.map(order => {
      const stationItems = catIds.length === 0
        ? order.items
        : order.items.filter(i => catIds.includes(i.menuItem?.categoryId));
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
      ...order,
      items: order.items.map(item => ({
        ...item,
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
router.put('/item/:orderItemId/done', async (req, res) => {
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
router.put('/order/:orderId/ready', async (req, res) => {
  try {
    await prisma.order.update({
      where: { id: req.params.orderId },
      data: { status: 'READY' }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST enviar mensaje desde cocina al TPV
router.post('/message', async (req, res) => {
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

// PUT marcar mensajes como leídos
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
