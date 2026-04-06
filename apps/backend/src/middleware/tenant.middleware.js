const { prisma } = require('@mrtpvrest/database');
const jwt = require('jsonwebtoken');

const IGNORED_SUBDOMAINS = new Set(['www', 'api', 'admin', 'localhost', '127']);

const tenantMiddleware = async (req, res, next) => {
  // ── 1. HEADERS (mayor prioridad) ──────────────────────────────────────────
  let restaurantId   = req.headers['x-restaurant-id']   || req.query.restaurantId;
  let restaurantSlug = req.headers['x-restaurant-slug'] || req.query.r || req.query.restaurant;
  let locationId     = req.headers['x-location-id']     || req.query.l || req.query.locationId;
  let locationSlug   = req.headers['x-location-slug'];

  // ── 2. SUBDOMINIO ─────────────────────────────────────────────────────────
  // masterburguer.mrtpvrest.com → slug = "masterburguer"
  if (!restaurantId && !restaurantSlug) {
    const hostname = req.hostname || '';
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      const sub = parts[0].toLowerCase();
      if (!IGNORED_SUBDOMAINS.has(sub)) {
        restaurantSlug = sub;
      }
    }
  }

  // ── 3. JWT (solo decode, sin verify) ─────────────────────────────────────
  // Solo aplica si todavía no tenemos restaurantId
  if (!restaurantId) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const payload = jwt.decode(token);
        if (payload?.restaurantId) {
          restaurantId = payload.restaurantId;
        }
      } catch (_) {
        // token malformado — ignorar, no bloquear
      }
    }
  }

  // ── RUTAS GLOBALES (sin validación de tenant) ─────────────────────────────
  const globalPaths = [
    '/api/auth',
    '/health',
    '/api/admin/setup',
    '/api/admin/tenants',
    '/api/admin/global-config',
    '/api/admin/config',
    '/api/saas/register',
    '/api/saas/plans',
    '/api/saas',
    '/api/ai'
  ];

  if (globalPaths.some(p => req.path.startsWith(p))) return next();

  try {
    let restaurant = null;

    // ── RESOLVER RESTAURANTE ──────────────────────────────────────────────
    const include = {
      config: true,
      // subscription eliminado: pertenece a Tenant, no a Restaurant
    };

    if (restaurantId) {
      restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        include
      });
    } else if (restaurantSlug) {
      restaurant = await prisma.restaurant.findUnique({
        where: { slug: restaurantSlug },
        include
      });
    }

    if (!restaurant) {
      return res.status(404).json({
        error: 'Restaurante no identificado. Proporcione x-restaurant-id/slug, subdominio o token con restaurantId.'
      });
    }

    // ── OBTENER TENANT CON SUBSCRIPTION ──────────────────────────────────
    const tenant = await prisma.tenant.findUnique({
      where: { id: restaurant.tenantId },
      select: {
        id: true,
        subscription: {
          select: {
            status: true,
            currentPeriodEnd: true,
            plan: { select: { name: true, displayName: true } }
          }
        }
      }
    })

    // ── VALIDACIÓN DE SUSCRIPCIÓN ─────────────────────────────────────────
    if (!restaurant.isActive) {
      return res.status(403).json({ error: 'Este restaurante ha sido suspendido.' });
    }

    const sub = tenant?.subscription;

    if (sub) {
      if (sub.status === 'SUSPENDED') {
        return res.status(403).json({ error: 'Servicio suspendido por falta de pago.' });
      }

      if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED') {
        return res.status(403).json({ error: 'La suscripción está cancelada o expirada. Por favor renueve su servicio.' });
      }

      if (sub.currentPeriodEnd && new Date() > new Date(sub.currentPeriodEnd)) {
        return res.status(403).json({
          error: 'Su suscripción venció el ' + new Date(sub.currentPeriodEnd).toLocaleDateString('es-MX') + '. Por favor renueve su servicio.'
        });
      }
    }

    // ── ADJUNTAR AL REQUEST ───────────────────────────────────────────────
    req.restaurantId = restaurant.id;
    req.restaurant   = restaurant;
    req.tenant       = { ...restaurant, tenant };
    req.plan         = sub?.plan ?? null; // controllers: req.plan.hasKDS, req.plan.maxLocations

    // ── RESOLVER SUCURSAL (sin cambios) ──────────────────────────────────
    let location = null;
    if (locationId) {
      location = await prisma.location.findUnique({
        where: { id: locationId, restaurantId: restaurant.id }
      });
    } else if (locationSlug) {
      location = await prisma.location.findFirst({
        where: { slug: locationSlug, restaurantId: restaurant.id }
      });
    }

    if (location) {
      if (!location.isActive) {
        return res.status(403).json({ error: 'Esta sucursal se encuentra temporalmente inactiva.' });
      }
      req.locationId = location.id;
      req.location   = location;
    }

    next();
  } catch (error) {
    console.error('Error en Tenant Middleware:', error);
    res.status(500).json({ error: 'Error al identificar el contexto del restaurante' });
  }
};

module.exports = tenantMiddleware;
