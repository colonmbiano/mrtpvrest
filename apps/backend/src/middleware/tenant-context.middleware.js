'use strict';

const { runWithTenant } = require('@mrtpvrest/database');

// ───────────────────────────────────────────────────────────────────────────
// tenantContextMiddleware
//
// Abre un scope de AsyncLocalStorage con el restaurante resuelto por
// `tenantMiddleware` y ejecuta TODO el resto del request dentro de él. El
// guard de Prisma (packages/database/tenant-guard.js) lee ese contexto para
// aislar automáticamente las queries por `restaurantId`.
//
// Debe montarse INMEDIATAMENTE DESPUÉS de `tenantMiddleware` (que setea
// `req.restaurantId`) y ANTES de los routers. Como envolvemos `next()` dentro
// de `als.run(...)`, el contexto se propaga a toda la cadena de middlewares y
// handlers async aguas abajo.
//
// Nota de seguridad: NO derivamos el rol de un JWT sin verificar. El bypass de
// SUPER_ADMIN para operaciones cross-tenant se hace explícitamente con
// `runWithBypass()` en los puntos que lo necesitan (p.ej. resolución de
// identidad en auth.middleware), no confiando en un rol no verificado aquí.
// ───────────────────────────────────────────────────────────────────────────
const tenantContextMiddleware = (req, res, next) => {
  const ctx = {
    restaurantId: req.restaurantId || null,
    locationId: req.locationId || null,
  };
  runWithTenant(ctx, () => next());
};

module.exports = tenantContextMiddleware;
