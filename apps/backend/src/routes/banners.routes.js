require('dotenv').config();
const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const router = express.Router();

// GET todos los banners activos (publico — para app cliente)
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Dom, 6=Sab
    const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');

    const allBanners = await prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const banners = allBanners.filter(b => {
      // Dias de la semana
      try {
        const days = JSON.parse(b.scheduleDays || '[]');
        if (days.length > 0 && !days.includes(dayOfWeek)) return false;
      } catch {}

      // Rango de fechas
      if (b.dateFrom && now < new Date(b.dateFrom)) return false;
      if (b.dateTo && now > new Date(b.dateTo)) return false;

      // Horario
      if (b.scheduleStart && b.scheduleEnd) {
        if (timeStr < b.scheduleStart || timeStr > b.scheduleEnd) return false;
      }

      return true;
    });

    res.json(banners);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET todos los banners (admin)
router.get('/all', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const banners = await prisma.banner.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json(banners);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST crear banner
router.post('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const count = await prisma.banner.count();
    const banner = await prisma.banner.create({
      data: { ...req.body, sortOrder: count }
    });
    res.json(banner);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT actualizar banner
router.put('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const banner = await prisma.banner.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(banner);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE eliminar banner
router.delete('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    await prisma.banner.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
