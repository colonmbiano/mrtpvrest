const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess, requireRole } = require('../middleware/auth.middleware');
const router = express.Router();

// Punto de origen del negocio (actualizable desde admin)
const ORIGIN = {
  lat: parseFloat(process.env.RESTAURANT_LAT || '19.2826'),
  lng: parseFloat(process.env.RESTAURANT_LNG || '-99.6557'),
};

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── POST iniciar ruta manualmente ─────────────────────────────────────────
router.post('/:driverId/route/start', async (req, res) => {
  try {
    const { lat, lng, orderId, trigger } = req.body;
    const driver = await prisma.employee.findUnique({ where: { id: req.params.driverId } });
    // Cerrar ruta anterior si existe
    await prisma.driverRoute.updateMany({
      where: { driverId: req.params.driverId, endAt: null },
      data: { endAt: new Date() }
    });
    const route = await prisma.driverRoute.create({
      data: {
        driverId: req.params.driverId,
        driverName: driver?.name || 'Repartidor',
        orderId: orderId || null,
        originLat: lat || ORIGIN.lat,
        originLng: lng || ORIGIN.lng,
        trigger: trigger || 'MANUAL',
      }
    });
    res.json(route);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST terminar ruta ────────────────────────────────────────────────────
router.post('/:driverId/route/end', async (req, res) => {
  try {
    await prisma.driverRoute.updateMany({
      where: { driverId: req.params.driverId, endAt: null },
      data: { endAt: new Date() }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST registrar punto GPS ──────────────────────────────────────────────
router.post('/:driverId/location', async (req, res) => {
  try {
    const { lat, lng, accuracy, speed, heading, orderId } = req.body;
    // Verificar si salió más de 50m del origen
    const dist = distanceMeters(ORIGIN.lat, ORIGIN.lng, lat, lng);
    const location = await prisma.driverLocation.create({
      data: {
        driverId: req.params.driverId,
        lat, lng,
        accuracy: accuracy || null,
        speed: speed || null,
        heading: heading || null,
        orderId: orderId || null,
      }
    });
    // Actualizar contador de puntos y distancia en ruta activa
    const activeRoute = await prisma.driverRoute.findFirst({
      where: { driverId: req.params.driverId, endAt: null }
    });
    if (activeRoute) {
      await prisma.driverRoute.update({
        where: { id: activeRoute.id },
        data: { points: { increment: 1 } }
      });
    }
    res.json({ location, distFromOrigin: Math.round(dist) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET ubicación actual de todos los repartidores ────────────────────────
// Accesible a roles admin-like del TPV (ADMIN/MANAGER/OWNER) y a SUPER_ADMIN.
// Se relajó respecto al requireAdmin original porque en la operación del TPV
// un MANAGER necesita ver repartidores activos sin tener el rol ADMIN pleno.
router.get('/live', authenticate, requireTenantAccess, requireRole('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const drivers = await prisma.employee.findMany({
      where: { role: 'DELIVERY', isActive: true }
    });
    const result = await Promise.all(drivers.map(async d => {
      const last = await prisma.driverLocation.findFirst({
        where: { driverId: d.id },
        orderBy: { createdAt: 'desc' }
      });
      const route = await prisma.driverRoute.findFirst({
        where: { driverId: d.id, endAt: null },
        orderBy: { startAt: 'desc' }
      });
      return {
        driver: { id: d.id, name: d.name, photo: d.photo },
        location: last,
        activeRoute: route,
        online: last ? (Date.now() - new Date(last.createdAt).getTime()) < 3 * 60 * 1000 : false,
      };
    }));
    res.json({ drivers: result, origin: ORIGIN });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET historial de puntos de una ruta ───────────────────────────────────
router.get('/:driverId/route/:routeId/points', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const route = await prisma.driverRoute.findUnique({ where: { id: req.params.routeId } });
    if (!route) return res.status(404).json({ error: 'Ruta no encontrada' });
    const points = await prisma.driverLocation.findMany({
      where: {
        driverId: req.params.driverId,
        createdAt: { gte: route.startAt, ...(route.endAt ? { lte: route.endAt } : {}) }
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json({ route, points });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET historial de rutas de un repartidor ───────────────────────────────
router.get('/:driverId/routes', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const routes = await prisma.driverRoute.findMany({
      where: { driverId: req.params.driverId },
      orderBy: { startAt: 'desc' },
      take: 20
    });
    res.json(routes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT actualizar coordenadas del restaurante ────────────────────────────
router.put('/origin', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    // Guardar en config (simplificado)
    process.env.RESTAURANT_LAT = String(lat);
    process.env.RESTAURANT_LNG = String(lng);
    res.json({ ok: true, lat, lng });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
