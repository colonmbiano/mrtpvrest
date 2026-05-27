// middleware/module.middleware.js
// Gating de endpoints por módulo SaaS (FINANCE, KDS, LOYALTY, etc.). El módulo
// debe estar permitido por el plan del tenant y además estar activado en
// `Tenant.enabledModules`. Se cachean los módulos por restaurantId 60s para
// evitar martillar la DB en endpoints que se llaman a alta frecuencia (resumen
// del dashboard, polling de KDS).
//
// Uso:
//   const requireModule = require('../middleware/module.middleware')
//   router.use(authenticate, requireTenantAccess, requireAdmin, requireModule('FINANCE'))

const { prisma } = require('@mrtpvrest/database')

const CACHE_TTL_MS = 60 * 1000
const cache = new Map() // restaurantId -> { at, allowed: Set<string>, enabled: Set<string> }

async function loadModulesForRestaurant(restaurantId) {
  const cached = cache.get(restaurantId)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      tenantId: true,
      tenant: {
        select: {
          enabledModules: true,
          subscription: {
            select: { plan: { select: { allowedModules: true } } },
          },
        },
      },
    },
  })

  const allowed = new Set(restaurant?.tenant?.subscription?.plan?.allowedModules ?? [])
  const enabled = new Set(restaurant?.tenant?.enabledModules ?? [])

  const entry = { at: Date.now(), allowed, enabled }
  cache.set(restaurantId, entry)
  return entry
}

function invalidateModuleCache(restaurantId) {
  if (restaurantId) cache.delete(restaurantId)
  else cache.clear()
}

function requireModule(moduleKey) {
  const key = String(moduleKey).toUpperCase()
  return async (req, res, next) => {
    try {
      // SUPER_ADMIN puede acceder a cualquier módulo (operación cross-tenant).
      if (req.user?.role === 'SUPER_ADMIN') return next()

      const restaurantId = req.restaurantId || req.user?.restaurantId
      if (!restaurantId) {
        return res.status(401).json({ error: 'Restaurante no identificado' })
      }

      const { allowed, enabled } = await loadModulesForRestaurant(restaurantId)
      if (!allowed.has(key)) {
        return res.status(403).json({
          error: 'MODULE_NOT_IN_PLAN',
          module: key,
          message: `El módulo "${key}" no está incluido en tu plan actual.`,
        })
      }
      if (!enabled.has(key)) {
        return res.status(403).json({
          error: 'MODULE_NOT_ENABLED',
          module: key,
          message: `El módulo "${key}" está disponible en tu plan pero no está activado.`,
        })
      }
      return next()
    } catch (err) {
      console.error('[requireModule] error:', err)
      return res.status(500).json({ error: 'Error verificando módulo' })
    }
  }
}

module.exports = requireModule
module.exports.requireModule = requireModule
module.exports.invalidateModuleCache = invalidateModuleCache
