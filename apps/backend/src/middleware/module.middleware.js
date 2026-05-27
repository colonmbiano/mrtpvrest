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

const MODULE_ALIASES = {
  WEBSTORE: ['client_menu', 'webstore'],
  CLIENT_MENU: ['client_menu', 'webstore'],
  LOYALTY: ['loyalty_advanced', 'loyalty'],
  KIOSK: ['kiosk'],
  DELIVERY: ['delivery'],
  KDS: ['kds'],
  REPORTS: ['reports'],
  INVENTORY: ['inventory'],
  FINANCE: ['finance'],
}

function aliasesFor(moduleKey) {
  const raw = String(moduleKey || '')
  const aliasKey = raw.toUpperCase()
  return [raw, raw.toLowerCase(), ...(MODULE_ALIASES[aliasKey] ?? [])]
    .map((key) => String(key).toLowerCase())
}

function setHasAny(set, moduleKey) {
  return aliasesFor(moduleKey).some((key) => set.has(key))
}

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

  const allowed = new Set((restaurant?.tenant?.subscription?.plan?.allowedModules ?? []).map((key) => String(key).toLowerCase()))
  const enabled = new Set((restaurant?.tenant?.enabledModules ?? []).map((key) => String(key).toLowerCase()))

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
      if (!setHasAny(allowed, key)) {
        return res.status(403).json({
          error: 'MODULE_NOT_IN_PLAN',
          module: key,
          message: `El módulo "${key}" no está incluido en tu plan actual.`,
        })
      }
      if (!setHasAny(enabled, key) && !setHasAny(allowed, key)) {
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
