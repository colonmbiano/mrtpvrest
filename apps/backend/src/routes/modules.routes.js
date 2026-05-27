// routes/modules.routes.js — Toggle de módulos opcionales por tenant (super-admin / owner)
const express = require('express')
const router  = express.Router()
const { prisma } = require('@mrtpvrest/database')
const { authenticate, requireRole } = require('../middleware/auth.middleware')
const { invalidateModuleCache } = require('../middleware/module.middleware')

// Módulos válidos en la plataforma
const MODULE_DEFINITIONS = {
  KIOSK:    { planKeys: ['kiosk'] },
  DELIVERY: { planKeys: ['delivery'] },
  WEBSTORE: { planKeys: ['client_menu', 'webstore'] },
  LOYALTY:  { planKeys: ['loyalty_advanced', 'loyalty'], planFlag: 'hasLoyalty' },
  KDS:      { planKeys: ['kds'], planFlag: 'hasKDS' },
  REPORTS:  { planKeys: ['reports'], planFlag: 'hasReports' },
  FINANCE:  { planKeys: ['finance'] },
}
const VALID_MODULES = Object.keys(MODULE_DEFINITIONS)

function normalizeList(values) {
  return new Set((values ?? []).map((value) => String(value).toLowerCase()))
}

function hasAnyModule(values, planKeys) {
  const normalized = normalizeList(values)
  return planKeys.some((key) => normalized.has(String(key).toLowerCase()))
}

function isAllowedByPlan(plan, definition) {
  return hasAnyModule(plan?.allowedModules, definition.planKeys) || Boolean(plan?.[definition.planFlag])
}

function isEnabledForTenant(tenant, definition, allowedByPlan) {
  // Hoy no existe disabledModules: si el plan lo incluye, queda activo por default.
  return allowedByPlan || hasAnyModule(tenant?.enabledModules, definition.planKeys)
}

// ─── GET /api/modules — Estado de módulos del tenant ───────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const restaurantId = req.restaurantId
    const restaurant = await prisma.restaurant.findUnique({
      where:  { id: restaurantId },
      select: { tenantId: true },
    })
    if (!restaurant) return res.status(404).json({ error: 'Restaurante no encontrado' })

    const tenant = await prisma.tenant.findUnique({
      where:  { id: restaurant.tenantId },
      select: {
        enabledModules: true,
        subscription: {
          select: {
            plan: {
              select: {
                name: true,
                displayName: true,
                allowedModules: true,
                hasKDS: true,
                hasLoyalty: true,
                hasReports: true,
              },
            },
          },
        },
      },
    })

    const plan = tenant?.subscription?.plan ?? null
    const modules = VALID_MODULES.map(key => {
      const definition = MODULE_DEFINITIONS[key]
      const allowedByPlan = isAllowedByPlan(plan, definition)
      const enabled = isEnabledForTenant(tenant, definition, allowedByPlan)

      return {
        key,
        allowedByPlan,
        enabled,
        toggledOn: enabled,
        managedByPlan: allowedByPlan,
      }
    })

    res.json({
      plan,
      modules,
    })
  } catch (err) {
    console.error('[modules] GET / error:', err)
    res.status(500).json({ error: 'Error al obtener módulos' })
  }
})

// ─── PATCH /api/modules/:key — Activar / desactivar un módulo ──────────────
// Solo OWNER o ADMIN pueden hacer toggle
router.patch('/:key', authenticate, requireRole('OWNER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { key }    = req.params
    const { enabled } = req.body

    const moduleKey = key.toUpperCase()
    const definition = MODULE_DEFINITIONS[moduleKey]

    if (!definition) {
      return res.status(400).json({ error: `Módulo inválido: ${key}` })
    }
    const restaurant = await prisma.restaurant.findUnique({
      where:  { id: req.restaurantId },
      select: { tenantId: true },
    })
    if (!restaurant) return res.status(404).json({ error: 'Restaurante no encontrado' })

    // Verificar que el plan permita este módulo antes de activarlo
    if (enabled) {
      const tenant = await prisma.tenant.findUnique({
        where:  { id: restaurant.tenantId },
        select: {
          subscription: {
            select: {
              plan: {
                select: {
                  allowedModules: true,
                  hasKDS: true,
                  hasLoyalty: true,
                  hasReports: true,
                },
              },
            },
          },
        },
      })
      const allowedByPlan = isAllowedByPlan(tenant?.subscription?.plan, definition)
      if (!allowedByPlan) {
        return res.status(403).json({
          error: `Tu plan actual no incluye el módulo "${moduleKey}". Actualiza tu plan para activarlo.`,
          module: moduleKey,
        })
      }
    }

    const currentTenant = await prisma.tenant.findUnique({
      where:  { id: restaurant.tenantId },
      select: { enabledModules: true },
    })
    const currentModules = currentTenant?.enabledModules ?? []
    const moduleAliases = new Set([
      moduleKey,
      moduleKey.toLowerCase(),
      ...definition.planKeys,
      ...definition.planKeys.map((key) => String(key).toUpperCase()),
    ])
    const canonicalKey = definition.planKeys[0]

    let updatedModules
    if (enabled) {
      updatedModules = [...new Set([...currentModules, canonicalKey])]
    } else {
      updatedModules = currentModules.filter(m => !moduleAliases.has(String(m)))
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id: restaurant.tenantId },
      data:  { enabledModules: updatedModules },
      select: { enabledModules: true },
    })

    // Invalidar cache de requireModule para que el cambio surta efecto inmediato
    invalidateModuleCache(req.restaurantId)

    res.json({ enabledModules: updatedTenant.enabledModules })
  } catch (err) {
    console.error('[modules] PATCH /:key error:', err)
    res.status(500).json({ error: 'Error al actualizar módulo' })
  }
})

module.exports = router
