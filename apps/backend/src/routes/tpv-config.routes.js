const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess, requireAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

// Defaults que el TPV usa si la sucursal aún no tiene fila en tpv_remote_configs.
// Coincide con los `@default` del modelo Prisma.
const DEFAULTS = {
  apiUrl: null,
  allowedOrderTypes: ['DINE_IN', 'TAKEOUT', 'DELIVERY'],
  lockTimeoutSec: 0,
  accentColor: null,
  extra: {},
};

// GET /api/tpv/config
// Endpoint pseudo-público: lee `req.locationId` inyectado por tenantMiddleware
// desde el header x-location-id. No requiere token de usuario porque el TPV lo
// consulta antes del login por PIN y los campos devueltos son no sensibles
// (URL pública del backend, tipos de orden, color, timeout). El acceso sigue
// protegido por la validación de tenant/location del middleware.
router.get('/', async (req, res) => {
  if (!req.locationId) {
    return res.status(400).json({ error: 'Sucursal no identificada. Falta x-location-id.' });
  }

  try {
    const cfg = await prisma.tpvRemoteConfig.findUnique({
      where: { locationId: req.locationId },
    });

    // Si no hay fila, devolvemos defaults para que el APK pueda continuar.
    const resolved = cfg
      ? {
          apiUrl:            cfg.apiUrl,
          allowedOrderTypes: normalizeOrderTypes(cfg.allowedOrderTypes),
          lockTimeoutSec:    cfg.lockTimeoutSec,
          accentColor:       cfg.accentColor,
          extra:             cfg.extra ?? {},
          updatedAt:         cfg.updatedAt,
        }
      : { ...DEFAULTS, updatedAt: null };

    res.set('Cache-Control', 'no-store');
    res.json(resolved);
  } catch (e) {
    // Degradamos a defaults si la tabla todavía no existe (migración pendiente)
    if (e?.code === 'P2021' || /does not exist/i.test(e?.message || '')) {
      return res.json({ ...DEFAULTS, updatedAt: null });
    }
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/tpv/config
// Actualiza flags operativos de la sucursal guardados en `extra` (JSON).
// Por ahora soporta `autoPrintOnline`: si está activo, la tablet TPV imprime
// sola la comanda de cocina + ticket del cliente al recibir un pedido de la
// tienda online. Scope POR SUCURSAL (locationId del header x-location-id).
// Requiere ADMIN — a diferencia del GET (pseudo-público pre-login), escribir
// config sí exige sesión con rol admin.
router.put('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  if (!req.locationId) {
    return res.status(400).json({ error: 'Sucursal no identificada. Falta x-location-id.' });
  }

  try {
    // Whitelist de claves editables dentro de `extra`. Nunca hacemos spread
    // ciego del body para no permitir inyectar claves arbitrarias.
    const patch = {};
    if (typeof req.body?.autoPrintOnline !== 'undefined') {
      patch.autoPrintOnline = Boolean(req.body.autoPrintOnline);
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar.' });
    }

    // Merge sobre el `extra` existente para no pisar otras claves.
    const existing = await prisma.tpvRemoteConfig.findUnique({
      where:  { locationId: req.locationId },
      select: { extra: true },
    });
    const prevExtra = existing?.extra && typeof existing.extra === 'object' ? existing.extra : {};
    const mergedExtra = { ...prevExtra, ...patch };

    const cfg = await prisma.tpvRemoteConfig.upsert({
      where:  { locationId: req.locationId },
      create: { locationId: req.locationId, extra: mergedExtra },
      update: { extra: mergedExtra },
    });

    res.set('Cache-Control', 'no-store');
    res.json({
      apiUrl:            cfg.apiUrl,
      allowedOrderTypes: normalizeOrderTypes(cfg.allowedOrderTypes),
      lockTimeoutSec:    cfg.lockTimeoutSec,
      accentColor:       cfg.accentColor,
      extra:             cfg.extra ?? {},
      updatedAt:         cfg.updatedAt,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function normalizeOrderTypes(raw) {
  const allowed = ['DINE_IN', 'TAKEOUT', 'DELIVERY'];
  if (!Array.isArray(raw)) return allowed;
  const filtered = raw.filter(t => allowed.includes(t));
  return filtered.length > 0 ? filtered : allowed;
}

module.exports = router;
