const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const router = express.Router();

// GET todas las impresoras (Filtrado por Sucursal)
router.get('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const printers = await prisma.printer.findMany({
      where: { locationId: req.locationId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(printers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST crear impresora (Asignada a Sucursal)
router.post('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const printer = await prisma.printer.create({
      data: { ...req.body, locationId: req.locationId }
    });
    res.json(printer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT actualizar impresora (Seguro por Sucursal)
router.put('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const printer = await prisma.printer.update({
      where: { id: req.params.id, locationId: req.locationId },
      data: req.body
    });
    res.json(printer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE impresora
router.delete('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    await prisma.printer.delete({
      where: { id: req.params.id, locationId: req.locationId }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
