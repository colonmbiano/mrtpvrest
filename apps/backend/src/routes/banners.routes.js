require('dotenv').config();
const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const router = express.Router();

async function locationIdsForRequest(req) {
  if (req.locationId) return [req.locationId];
  const restaurantId = req.restaurantId || req.user?.restaurantId;
  if (!restaurantId) return [];
  const locations = await prisma.location.findMany({
    where: { restaurantId, isActive: true },
    select: { id: true },
  });
  return locations.map((l) => l.id);
}

async function assertBannerAccess(req, res, id) {
  const ids = await locationIdsForRequest(req);
  const banner = await prisma.banner.findUnique({ where: { id } });
  if (!banner) {
    res.status(404).json({ error: 'Banner no encontrado' });
    return null;
  }
  if (req.user?.role !== 'SUPER_ADMIN' && banner.locationId && !ids.includes(banner.locationId)) {
    res.status(404).json({ error: 'Banner no encontrado' });
    return null;
  }
  return banner;
}

router.get('/', async (req, res) => {
  try {
    // Día/hora en hora local de México (el servidor corre en UTC). Sin esto la
    // programación por día/horario se evaluaba contra UTC y fallaba.
    const now = new Date();
    const tz = process.env.STORE_TIMEZONE || 'America/Mexico_City';
    const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const dayOfWeek = local.getDay();
    const timeStr = local.getHours().toString().padStart(2, '0') + ':' + local.getMinutes().toString().padStart(2, '0');
    const locationIds = await locationIdsForRequest(req);

    const allBanners = await prisma.banner.findMany({
      where: {
        isActive: true,
        ...(locationIds.length ? { OR: [{ locationId: { in: locationIds } }, { locationId: null }] } : { locationId: null }),
      },
      orderBy: { sortOrder: 'asc' },
    });

    const banners = allBanners.filter((b) => {
      try {
        const days = JSON.parse(b.scheduleDays || '[]');
        if (days.length > 0 && !days.includes(dayOfWeek)) return false;
      } catch {}
      if (b.dateFrom && now < new Date(b.dateFrom)) return false;
      if (b.dateTo && now > new Date(b.dateTo)) return false;
      if (b.scheduleStart && b.scheduleEnd && (timeStr < b.scheduleStart || timeStr > b.scheduleEnd)) return false;
      return true;
    });

    res.json(banners);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/all', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationIds = await locationIdsForRequest(req);
    const banners = await prisma.banner.findMany({
      where: req.user?.role === 'SUPER_ADMIN' ? {} : { OR: [{ locationId: { in: locationIds } }, { locationId: null }] },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(banners);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationIds = await locationIdsForRequest(req);
    const requestedLocationId = req.body?.locationId || req.locationId || null;
    if (!requestedLocationId && req.user?.role !== 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'locationId requerido para banners del restaurante' });
    }
    if (requestedLocationId && req.user?.role !== 'SUPER_ADMIN' && !locationIds.includes(requestedLocationId)) {
      return res.status(403).json({ error: 'Sucursal no autorizada' });
    }
    const count = await prisma.banner.count({
      where: requestedLocationId ? { locationId: requestedLocationId } : { locationId: null },
    });
    const banner = await prisma.banner.create({
      data: { ...req.body, locationId: requestedLocationId, sortOrder: count },
    });
    res.json(banner);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const banner = await assertBannerAccess(req, res, req.params.id);
    if (!banner) return;
    const locationIds = await locationIdsForRequest(req);
    const requestedLocationId = req.body?.locationId;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'locationId') && !requestedLocationId && req.user?.role !== 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'locationId requerido para banners del restaurante' });
    }
    if (requestedLocationId && req.user?.role !== 'SUPER_ADMIN' && !locationIds.includes(requestedLocationId)) {
      return res.status(403).json({ error: 'Sucursal no autorizada' });
    }
    const updated = await prisma.banner.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const banner = await assertBannerAccess(req, res, req.params.id);
    if (!banner) return;
    await prisma.banner.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
