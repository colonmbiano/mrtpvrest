const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireRole, requireTenantAccess } = require('../middleware/auth.middleware');
const { printTest, kickDrawer } = require('../services/printer.service');
const router = express.Router();

// ── Gate común ───────────────────────────────────────────────────────────────
router.use(authenticate, requireTenantAccess);

const requirePrinterRead = requireRole(
  'CASHIER',
  'WAITER',
  'MANAGER',
  'ADMIN',
  'OWNER',
  'SUPER_ADMIN',
);

// ────────────────────────────────────────────────────────────────────────────
// Ticket Config — GET/PUT deben ir ANTES de /:id para que Express no matchee
// "ticket-config" como un id.
// ────────────────────────────────────────────────────────────────────────────
router.get('/ticket-config', requirePrinterRead, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    let cfg = await prisma.ticketConfig.findUnique({ where: { locationId: req.locationId } });
    if (!cfg) {
      // Auto-crear con defaults si nunca se configuró esta sucursal.
      const loc = await prisma.location.findUnique({
        where: { id: req.locationId },
        include: { restaurant: { select: { name: true, logoUrl: true } } },
      });
      cfg = await prisma.ticketConfig.create({
        data: {
          locationId: req.locationId,
          businessName: loc?.restaurant?.name || loc?.name || 'Mi Negocio',
          header: loc?.restaurant?.name || '',
          logoUrl: loc?.restaurant?.logoUrl || null,
        },
      });
    }
    res.json(cfg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/ticket-config', requireAdmin, async (req, res) => {
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

// Whitelist de columnas que aceptamos del cliente. Cualquier otra cosa
// (p. ej. `isVirtual`, flags de UI) se descarta antes de tocar Prisma para
// que el frontend no nos tumbe el endpoint con un 500 si manda un campo
// fantasma.
const PRINTER_ALLOWED_FIELDS = [
  'name',
  'type',
  'connectionType',
  'ip',
  'port',
  'usbPort',
  'bluetoothAddress',
  'supportsCashDrawer',
  'isActive',
  'stations',
];

const VALID_STATIONS = ['CASHIER', 'KITCHEN', 'BAR', 'GRILL', 'FRYER'];

// Normaliza el payload según connectionType: vacía los campos irrelevantes
// para que no queden "IPs zombi" cuando se cambia de NETWORK a USB.
function normalizePrinterPayload(body) {
  const src = body || {};
  const payload = {};
  for (const k of PRINTER_ALLOWED_FIELDS) {
    if (src[k] !== undefined) payload[k] = src[k];
  }
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
  // IP: quitar TODO el whitespace (un espacio colado hace que el connect
  // nativo del TPV falle con "No address associated with hostname") y
  // validar IPv4 estricta. '' → null; '0.0.0.0' (KDS virtual) es válida.
  if (payload.ip !== undefined && payload.ip !== null) {
    payload.ip = String(payload.ip).replace(/\s+/g, '');
    if (payload.ip === '') {
      payload.ip = null;
    } else {
      const octets = payload.ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (!octets || octets.slice(1).some((o) => Number(o) > 255)) {
        const err = new Error(`IP inválida ("${payload.ip}") — usa formato IPv4, ej. 192.168.1.84`);
        err.status = 400;
        throw err;
      }
    }
  }
  // Sanity: port es Int
  if (payload.port !== undefined && payload.port !== null) {
    payload.port = parseInt(payload.port, 10) || 9100;
  }
  // stations: array de estaciones que un KDS vigila. Sanitizamos para
  // evitar que un cliente meta valores arbitrarios y rompa el filtro
  // del KDS app. Si llega algo no-array lo descartamos.
  if (payload.stations !== undefined) {
    if (!Array.isArray(payload.stations)) {
      payload.stations = [];
    } else {
      payload.stations = payload.stations
        .map((s) => String(s).toUpperCase())
        .filter((s) => VALID_STATIONS.includes(s));
    }
  }
  return payload;
}

router.get('/', requirePrinterRead, async (req, res) => {
  try {
    if (!req.locationId) {
      return res.status(400).json({
        error: 'Sucursal no identificada (envía x-location-id)',
        code: 'LOCATION_REQUIRED',
      });
    }
    const printers = await prisma.printer.findMany({
      where: { locationId: req.locationId },
      include: {
        // Printer Groups a los que pertenece — el TPV los consume para
        // enrutar comandas a la impresora correcta cuando el item /
        // categoría tiene route asignada.
        printerGroups: {
          include: { printerGroup: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(printers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const data = normalizePrinterPayload(req.body);
    const printer = await prisma.printer.create({
      data: { ...data, locationId: req.locationId },
    });
    res.json(printer);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const data = normalizePrinterPayload(req.body);
    const printer = await prisma.printer.update({
      where: { id: req.params.id, locationId: req.locationId },
      data,
    });
    res.json(printer);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
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
router.post('/:id/test', requireAdmin, async (req, res) => {
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
router.post('/:id/kick-drawer', requireAdmin, async (req, res) => {
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
