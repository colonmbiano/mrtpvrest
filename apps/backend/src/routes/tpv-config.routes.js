const express = require('express');
const { prisma } = require('@mrtpvrest/database');

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

function normalizeOrderTypes(raw) {
  const allowed = ['DINE_IN', 'TAKEOUT', 'DELIVERY'];
  if (!Array.isArray(raw)) return allowed;
  const filtered = raw.filter(t => allowed.includes(t));
  return filtered.length > 0 ? filtered : allowed;
}

module.exports = router;
