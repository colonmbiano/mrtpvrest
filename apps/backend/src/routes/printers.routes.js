const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess, requirePermission } = require('../middleware/auth.middleware');
const { printTest, kickDrawer } = require('../services/printer.service');
const router = express.Router();

// ── Gate común ───────────────────────────────────────────────────────────────
router.use(authenticate, requireTenantAccess);

// Configurar impresoras y tickets es operativo (no setup de tenant), así que
// en lugar de requireAdmin usamos canConfigSystem. Admin sigue pasando porque
// tiene rol admin-equivalente.
const requireConfig = requirePermission('canConfigSystem');

// ────────────────────────────────────────────────────────────────────────────
// Ticket Config — GET/PUT deben ir ANTES de /:id para que Express no matchee
// "ticket-config" como un id.
// ────────────────────────────────────────────────────────────────────────────
router.get('/ticket-config', requireConfig, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    let cfg = await prisma.ticketConfig.findUnique({ where: { locationId: req.locationId } });
    if (!cfg) {
      // Auto-crear con defaults si nunca se configuró esta sucursal.
      const loc = await prisma.location.findUnique({
        where: { id: req.locationId },
        include: { restaurant: { select: { name: true } } },
      });
      cfg = await prisma.ticketConfig.create({
        data: {
          locationId: req.locationId,
          businessName: loc?.restaurant?.name || loc?.name || 'Mi Negocio',
          header: loc?.restaurant?.name || '',
        },
      });
    }
    res.json(cfg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/ticket-config', requireConfig, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const { id, locationId, createdAt, updatedAt, ...data } = req.body || {};
    const cfg = await prisma.ticketConfig.upsert({
      where: { locationId: req.locationId },
      update: data,
      create: {
        ...data,
        locationId: req.locationId,
        businessName: data.businessName || 'Mi Negocio',
      },
    });
    res.json(cfg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────────────
// Printers CRUD
// ────────────────────────────────────────────────────────────────────────────

// Normaliza el payload según connectionType: vacía los campos irrelevantes
// para que no queden "IPs zombi" cuando se cambia de NETWORK a USB.
function normalizePrinterPayload(body) {
  const { id, locationId, createdAt, updatedAt, ...rest } = body || {};
  const payload = { ...rest };
  const conn = payload.connectionType || 'NETWORK';
  if (conn === 'NETWORK') {
    payload.usbPort = null;
    payload.bluetoothAddress = null;
  } else if (conn === 'USB') {
    payload.ip = null;
    payload.bluetoothAddress = null;
  } else if (conn === 'BLUETOOTH') {
    payload.ip = null;
    payload.usbPort = null;
  }
  // Sanity: port es Int
  if (payload.port !== undefined && payload.port !== null) {
    payload.port = parseInt(payload.port, 10) || 9100;
  }
  // categories: garantizar array (el modelo es String[])
  if (payload.categories !== undefined && !Array.isArray(payload.categories)) {
    payload.categories = [];
  }
  return payload;
}

router.get('/', requireConfig, async (req, res) => {
  try {
    const printers = await prisma.printer.findMany({
      where: { locationId: req.locationId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(printers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireConfig, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const data = normalizePrinterPayload(req.body);
    const printer = await prisma.printer.create({
      data: { ...data, locationId: req.locationId },
    });
    res.json(printer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireConfig, async (req, res) => {
  try {
    const data = normalizePrinterPayload(req.body);
    const printer = await prisma.printer.update({
      where: { id: req.params.id, locationId: req.locationId },
      data,
    });
    res.json(printer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireConfig, async (req, res) => {
  try {
    await prisma.printer.delete({
      where: { id: req.params.id, locationId: req.locationId },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────────────
// Acciones hardware
// ────────────────────────────────────────────────────────────────────────────

// POST /api/printers/:id/test — envía un ticket de prueba
router.post('/:id/test', requireConfig, async (req, res) => {
  try {
    const printer = await prisma.printer.findFirst({
      where: { id: req.params.id, locationId: req.locationId, isActive: true },
    });
    if (!printer) return res.status(404).json({ error: 'Impresora no encontrada' });
    if (printer.connectionType !== 'NETWORK') {
      return res.status(501).json({
        error: `Conexión ${printer.connectionType} no implementada todavía; sólo NETWORK es funcional.`,
        code: 'CONNECTION_NOT_IMPLEMENTED',
      });
    }
    if (!printer.ip) return res.status(400).json({ error: 'Impresora NETWORK sin IP configurada' });
    await printTest(printer.ip, printer.port, printer.type || 'KITCHEN');
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: `No se pudo alcanzar la impresora: ${e.message}` });
  }
});

// POST /api/printers/:id/kick-drawer — abre el cajón vía ESC/POS
router.post('/:id/kick-drawer', requireConfig, async (req, res) => {
  try {
    const printer = await prisma.printer.findFirst({
      where: { id: req.params.id, locationId: req.locationId, isActive: true },
    });
    if (!printer) return res.status(404).json({ error: 'Impresora no encontrada' });
    if (!printer.supportsCashDrawer) {
      return res.status(400).json({ error: 'Esta impresora no tiene cajón conectado' });
    }
    if (printer.connectionType !== 'NETWORK') {
      return res.status(501).json({
        error: `Conexión ${printer.connectionType} no implementada todavía; sólo NETWORK es funcional.`,
        code: 'CONNECTION_NOT_IMPLEMENTED',
      });
    }
    if (!printer.ip) return res.status(400).json({ error: 'Impresora NETWORK sin IP configurada' });
    await kickDrawer(printer.ip, printer.port);
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: `No se pudo abrir el cajón: ${e.message}` });
  }
});

module.exports = router;
