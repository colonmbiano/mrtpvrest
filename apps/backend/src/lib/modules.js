// lib/modules.js — Helper para verificar módulos opcionales y flags por tenant.
//
// Dos formas de feature gating:
//   1. requireModule(MODULE_X)        — string-based, gate via plan.allowedModules
//                                       o tenant.enabledModules (override manual).
//   2. requireFeatureFlag('hasX')     — boolean del Plan (hasKDS, hasInventory,
//                                       hasLoyalty, hasReports, hasAPIAccess).
//
// El backend rechaza con 403 si la feature no está en el plan. Para evitar
// regresiones en clientes activos cuyo plan aún no tiene el flag, hay un
// modo "warn-only" controlado por env ENFORCE_PLAN_FLAGS:
//   - "true"  → bloquea con 403
//   - default → solo loguea (warn), deja pasar (graceful rollout)

const { prisma } = require('@mrtpvrest/database')

const MODULE_POS_STANDARD = 'pos_standard'
const MODULE_KIOSK        = 'kiosk'
const MODULE_DELIVERY     = 'delivery'
const MODULE_WEBSTORE     = 'client_menu'   // alias frontend
const MODULE_LOYALTY      = 'loyalty_advanced'
const MODULE_KDS          = 'kds'
const MODULE_REPORTS      = 'reports'
const MODULE_INVENTORY    = 'inventory'
const MODULE_WAITERS      = 'waiters'
const MODULE_CASH_SHIFT   = 'cash_shift'
const MODULE_EMPLOYEES    = 'employee_management'
const MODULE_MULTICURRENCY = 'multi_currency'
const MODULE_PAYROLL      = 'payroll'
const MODULE_WHATSAPP_BOT = 'whatsapp_bot'

const MODULES = {
  MODULE_POS_STANDARD, MODULE_KIOSK, MODULE_DELIVERY, MODULE_WEBSTORE,
  MODULE_LOYALTY, MODULE_KDS, MODULE_REPORTS, MODULE_INVENTORY,
  MODULE_WAITERS, MODULE_CASH_SHIFT, MODULE_EMPLOYEES, MODULE_MULTICURRENCY,
  MODULE_PAYROLL, MODULE_WHATSAPP_BOT,
}

const ENFORCE = String(process.env.ENFORCE_PLAN_FLAGS || '').toLowerCase() === 'true'
// Gate específico del bot de WhatsApp (add-on facturable). Separado de ENFORCE
// para poder cobrar el bot SIN endurecer aún el resto de módulos. Rollout suave:
// apagado por default → no rompe los bots ya activos al desplegar. El operador
// pone ENFORCE_BOT_MODULE=true en Railway cuando los planes ya incluyen el módulo.
const ENFORCE_BOT = String(process.env.ENFORCE_BOT_MODULE || '').toLowerCase() === 'true'

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
  WHATSAPP_BOT: ['whatsapp_bot'],
}

function moduleKeys(moduleKey) {
  const raw = String(moduleKey || '')
  const lower = raw.toLowerCase()
  const aliasKey = raw.toUpperCase()
  return new Set([lower, raw, ...(MODULE_ALIASES[aliasKey] ?? [])].map((key) => String(key).toLowerCase()))
}

function includesModule(values, moduleKey) {
  const wanted = moduleKeys(moduleKey)
  return (values ?? []).some((value) => wanted.has(String(value).toLowerCase()))
}

/**
 * Verifica si el restaurante tiene un módulo habilitado.
 * Prioridad: enabledModules del tenant (override manual) → allowedModules del plan.
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
  if (includesModule(tenant.enabledModules, moduleKey)) return true

  const allowedByPlan = tenant.subscription?.plan?.allowedModules ?? []
  return includesModule(allowedByPlan, moduleKey)
}

/**
 * Verifica si el plan del tenant tiene un feature flag boolean activado.
 * @param {string} flagName ej. 'hasInventory', 'hasKDS', 'hasLoyalty'
 */
async function restaurantHasFeatureFlag(restaurantId, flagName) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      tenant: {
        select: {
          subscription: { select: { plan: { select: { [flagName]: true } } } },
        },
      },
    },
  })
  const plan = restaurant?.tenant?.subscription?.plan
  if (!plan) {
    // Sin subscription: en modo enforce, NO; sin enforce, permitir (legacy).
    return !ENFORCE
  }
  return Boolean(plan[flagName])
}

/**
 * Middleware Express: rechaza con 403 si el restaurante no tiene el módulo.
 */
function requireModule(moduleKey) {
  return async (req, res, next) => {
    try {
      const restaurantId = req.restaurantId
      if (!restaurantId) return res.status(401).json({ error: 'Sin tenant' })

      const allowed = await restaurantHasModule(restaurantId, moduleKey)
      if (!allowed) {
        if (ENFORCE) {
          return res.status(403).json({
            error: `El módulo "${moduleKey}" no está habilitado en tu plan.`,
            module: moduleKey,
            code: 'MODULE_NOT_IN_PLAN',
          })
        }
        console.warn(`[plan-gate] tenant sin módulo "${moduleKey}" — dejando pasar (ENFORCE off)`)
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}

/**
 * Middleware: rechaza si el plan del tenant NO tiene el feature flag boolean.
 */
function requireFeatureFlag(flagName, friendlyName) {
  return async (req, res, next) => {
    try {
      const restaurantId = req.restaurantId
      if (!restaurantId) return res.status(401).json({ error: 'Sin tenant' })

      const allowed = await restaurantHasFeatureFlag(restaurantId, flagName)
      if (!allowed) {
        if (ENFORCE) {
          return res.status(403).json({
            error: `Tu plan no incluye "${friendlyName || flagName}".`,
            feature: flagName,
            code: 'FEATURE_NOT_IN_PLAN',
          })
        }
        console.warn(`[plan-gate] tenant sin feature "${flagName}" — dejando pasar (ENFORCE off)`)
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}

/**
 * ¿El tenant puede correr el bot de WhatsApp? Gate del add-on facturable.
 * Rollout suave: con ENFORCE_BOT_MODULE apagado siempre deja pasar (no rompe
 * bots activos). Con enforce on, exige el módulo 'whatsapp_bot' en el plan
 * (o el override manual del tenant). Best-effort: ante error, deja pasar.
 */
async function botModuleAllowed(restaurantId) {
  if (!ENFORCE_BOT) return true
  try {
    return await restaurantHasModule(restaurantId, MODULE_WHATSAPP_BOT)
  } catch (err) {
    console.error('[plan-gate] botModuleAllowed error:', err.message)
    return true
  }
}

module.exports = {
  MODULES,
  restaurantHasModule, restaurantHasFeatureFlag, botModuleAllowed,
  requireModule, requireFeatureFlag,
  isEnforceMode: () => ENFORCE,
  isBotEnforceMode: () => ENFORCE_BOT,
}
