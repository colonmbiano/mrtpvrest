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
  employeeAccountEnabled: false,
};

// El cobro "a cuenta de empleado" se habilita en el TPV cuando el tenant tiene
// el módulo de nómina ('payroll') activo. Fuente única: tenant.enabledModules
// (no un flag aparte). Devolvemos false ante cualquier error para no romper el
// arranque del APK por una query de módulos.
async function resolveEmployeeAccountEnabled(locationId) {
  try {
    const loc = await prisma.location.findUnique({
      where: { id: locationId },
      select: { restaurant: { select: { tenant: { select: { enabledModules: true } } } } },
    });
    const mods = loc?.restaurant?.tenant?.enabledModules || [];
    return mods.map((m) => String(m).toLowerCase()).includes('payroll');
  } catch {
    return false;
  }
}

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
    const [cfg, employeeAccountEnabled] = await Promise.all([
      prisma.tpvRemoteConfig.findUnique({ where: { locationId: req.locationId } }),
      resolveEmployeeAccountEnabled(req.locationId),
    ]);

    // Si no hay fila, devolvemos defaults para que el APK pueda continuar.
    const resolved = cfg
      ? {
          apiUrl:            cfg.apiUrl,
          allowedOrderTypes: normalizeOrderTypes(cfg.allowedOrderTypes),
          lockTimeoutSec:    cfg.lockTimeoutSec,
          accentColor:       cfg.accentColor,
          extra:             cfg.extra ?? {},
          employeeAccountEnabled,
          updatedAt:         cfg.updatedAt,
        }
      : { ...DEFAULTS, employeeAccountEnabled, updatedAt: null };

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
