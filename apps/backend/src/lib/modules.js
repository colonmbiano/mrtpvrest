// lib/modules.js — Helper para verificar módulos opcionales por tenant
const { prisma } = require('@mrtpvrest/database')

const MODULE_KIOSK    = 'KIOSK'
const MODULE_DELIVERY = 'DELIVERY'
const MODULE_WEBSTORE = 'WEBSTORE'
const MODULE_LOYALTY  = 'LOYALTY'
const MODULE_KDS      = 'KDS'
const MODULE_REPORTS  = 'REPORTS'

const MODULES = { MODULE_KIOSK, MODULE_DELIVERY, MODULE_WEBSTORE, MODULE_LOYALTY, MODULE_KDS, MODULE_REPORTS }

/**
 * Verifica si el restaurante tiene un módulo habilitado.
 * Prioridad: enabledModules del tenant (toggle manual) → allowedModules del plan.
 */
async function restaurantHasModule(restaurantId, moduleKey) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
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
  if (!restaurant?.tenant) return false

  const { tenant } = restaurant
  if (tenant.enabledModules?.includes(moduleKey)) return true

  const allowedByPlan = tenant.subscription?.plan?.allowedModules ?? []
  return allowedByPlan.includes(moduleKey)
}

/**
 * Middleware Express: rechaza con 403 si el restaurante no tiene el módulo.
 * Requiere que tenantMiddleware ya haya adjuntado req.restaurantId.
 */
function requireModule(moduleKey) {
  return async (req, res, next) => {
    try {
      const restaurantId = req.restaurantId
      if (!restaurantId) return res.status(401).json({ error: 'Sin tenant' })

      const allowed = await restaurantHasModule(restaurantId, moduleKey)
      if (!allowed) {
        return res.status(403).json({
          error: `El módulo "${moduleKey}" no está habilitado en tu plan.`,
          module: moduleKey,
        })
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}

module.exports = { MODULES, restaurantHasModule, requireModule }
