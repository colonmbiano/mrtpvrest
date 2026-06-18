const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess, requireRole } = require('../middleware/auth.middleware');
const router = express.Router();

// Origen para el cálculo de distancia. Se lee dinámicamente de process.env en
// CADA uso: antes era una const capturada al cargar el módulo, por lo que el
// PUT /origin (que muta process.env) era un no-op hasta reiniciar el proceso.
// LIMITACIÓN: sigue siendo global al proceso, no por sucursal. El origen real
// por-sucursal requiere agregar gpsLat/gpsLng al modelo Location (follow-up).
function getOrigin() {
  return {
    lat: parseFloat(process.env.RESTAURANT_LAT || '19.2826'),
    lng: parseFloat(process.env.RESTAURANT_LNG || '-99.6557'),
  };
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isStaff(user) {
  return ['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'].includes(user?.role);
}

async function assertDriverAccess(req, res) {
  const driverId = req.params.driverId;
  if (req.user?.id !== driverId && !isStaff(req.user)) {
    res.status(403).json({ error: 'No autorizado para este repartidor' });
    return null;
  }
  const restaurantId = req.restaurantId || req.user?.restaurantId;
  const driver = await prisma.employee.findFirst({
    where: {
      id: driverId,
      role: 'DELIVERY',
      isActive: true,
      ...(req.user?.role !== 'SUPER_ADMIN' && restaurantId ? { location: { restaurantId } } : {}),
    },
    select: { id: true, name: true },
  });
  if (!driver) {
    res.status(404).json({ error: 'Repartidor no encontrado' });
    return null;
  }
  return driver;
}

router.post('/:driverId/route/start', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const { lat, lng, orderId, trigger } = req.body;
    if (orderId) {
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          deliveryDriverId: driver.id,
          ...(req.user?.role !== 'SUPER_ADMIN' ? { restaurantId: req.restaurantId || req.user?.restaurantId } : {}),
        },
        select: { id: true },
      });
      if (!order) return res.status(404).json({ error: 'Orden no encontrada para este repartidor' });
    }
    await prisma.driverRoute.updateMany({
      where: { driverId: driver.id, endAt: null },
      data: { endAt: new Date() },
    });
    const route = await prisma.driverRoute.create({
      data: {
        driverId: driver.id,
        driverName: driver.name || 'Repartidor',
        orderId: orderId || null,
        originLat: Number(lat) || getOrigin().lat,
        originLng: Number(lng) || getOrigin().lng,
        trigger: trigger || 'MANUAL',
      },
    });
    res.json(route);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.post('/:driverId/route/end', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    await prisma.driverRoute.updateMany({
      where: { driverId: driver.id, endAt: null },
      data: { endAt: new Date() },
    });
    res.json({ ok: true });
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.post('/:driverId/location', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const { lat, lng, accuracy, speed, heading, orderId } = req.body;
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng) || Math.abs(nLat) > 90 || Math.abs(nLng) > 180) {
      return res.status(400).json({ error: 'Coordenadas invalidas' });
    }
    if (orderId) {
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          deliveryDriverId: driver.id,
          ...(req.user?.role !== 'SUPER_ADMIN' ? { restaurantId: req.restaurantId || req.user?.restaurantId } : {}),
        },
        select: { id: true },
      });
      if (!order) return res.status(404).json({ error: 'Orden no encontrada para este repartidor' });
    }
    const origin = getOrigin();
    const dist = distanceMeters(origin.lat, origin.lng, nLat, nLng);
    const location = await prisma.driverLocation.create({
      data: {
        driverId: driver.id,
        lat: nLat,
        lng: nLng,
        accuracy: accuracy || null,
        speed: speed || null,
        heading: heading || null,
        orderId: orderId || null,
      },
    });
    const activeRoute = await prisma.driverRoute.findFirst({
      where: { driverId: driver.id, endAt: null },
    });
    if (activeRoute) {
      await prisma.driverRoute.update({
        where: { id: activeRoute.id },
        data: { points: { increment: 1 } },
      });
    }
    res.json({ location, distFromOrigin: Math.round(dist) });
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.get('/live', authenticate, requireTenantAccess, requireRole('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN', 'CASHIER'), async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const drivers = await prisma.employee.findMany({
      where: {
        role: 'DELIVERY',
        isActive: true,
        ...(req.user?.role !== 'SUPER_ADMIN' && restaurantId ? { location: { restaurantId } } : {}),
      },
    });
    // Una ruta abierta (endAt null) que lleva horas sin un solo ping GPS es
    // basura: el repartidor cerró la app o nunca llamó a /route/end. Antes esto
    // dejaba "En ruta desde hace 73h" pegado para siempre. Aquí se auto-cierra
    // (self-healing) para que el contador "en ruta" refleje la realidad.
    const STALE_ROUTE_MS = 6 * 60 * 60 * 1000; // 6 h sin señal => ruta muerta
    const now = Date.now();
    const result = await Promise.all(drivers.map(async d => {
      const last = await prisma.driverLocation.findFirst({
        where: { driverId: d.id },
        orderBy: { createdAt: 'desc' },
      });
      let route = await prisma.driverRoute.findFirst({
        where: { driverId: d.id, endAt: null },
        orderBy: { startAt: 'desc' },
      });
      if (route) {
        const lastSignal = last ? new Date(last.createdAt).getTime() : new Date(route.startAt).getTime();
        if (now - lastSignal > STALE_ROUTE_MS) {
          await prisma.driverRoute.update({
            where: { id: route.id },
            data: { endAt: new Date() },
          });
          route = null; // deja de contar como "en ruta"
        }
      }
      return {
        driver: { id: d.id, name: d.name, photo: d.photo },
        location: last,
        activeRoute: route,
        online: last ? (now - new Date(last.createdAt).getTime()) < 3 * 60 * 1000 : false,
      };
    }));
    res.json({ drivers: result, origin: getOrigin() });
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.get('/:driverId/route/:routeId/points', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const route = await prisma.driverRoute.findFirst({ where: { id: req.params.routeId, driverId: driver.id } });
    if (!route) return res.status(404).json({ error: 'Ruta no encontrada' });
    const points = await prisma.driverLocation.findMany({
      where: {
        driverId: driver.id,
        createdAt: { gte: route.startAt, ...(route.endAt ? { lte: route.endAt } : {}) },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ route, points });
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.get('/:driverId/routes', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const routes = await prisma.driverRoute.findMany({
      where: { driverId: driver.id },
      orderBy: { startAt: 'desc' },
      take: 20,
    });
    res.json(routes);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.put('/origin', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const nLat = Number(req.body?.lat);
    const nLng = Number(req.body?.lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng) || Math.abs(nLat) > 90 || Math.abs(nLng) > 180) {
      return res.status(400).json({ error: 'Coordenadas invalidas' });
    }
    // NOTA: persiste sólo en process.env (se pierde al reiniciar) y es global al
    // proceso, no por sucursal. Para origen persistente y por-sucursal hay que
    // mover esto a un campo en Location (gpsLat/gpsLng) — follow-up pendiente.
    process.env.RESTAURANT_LAT = String(nLat);
    process.env.RESTAURANT_LNG = String(nLng);
    res.json({ ok: true, lat: nLat, lng: nLng });
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

module.exports = router;
