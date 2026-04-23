// routes/modules.routes.js — Toggle de módulos opcionales por tenant (super-admin / owner)
const express = require('express')
const router  = express.Router()
const { prisma } = require('@mrtpvrest/database')
const { authenticate, requireRole } = require('../middleware/auth.middleware')

// Módulos válidos en la plataforma
const VALID_MODULES = ['KIOSK', 'DELIVERY', 'WEBSTORE', 'LOYALTY', 'KDS', 'REPORTS']

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
          select: { plan: { select: { name: true, displayName: true, allowedModules: true } } },
        },
      },
    })

    const allowedByPlan  = tenant?.subscription?.plan?.allowedModules ?? []
    const enabledModules = tenant?.enabledModules ?? []

    const modules = VALID_MODULES.map(key => ({
      key,
      allowedByPlan: allowedByPlan.includes(key),
      enabled:       enabledModules.includes(key) || allowedByPlan.includes(key),
      toggledOn:     enabledModules.includes(key),
    }))

    res.json({
      plan:    tenant?.subscription?.plan ?? null,
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

    if (!VALID_MODULES.includes(key.toUpperCase())) {
      return res.status(400).json({ error: `Módulo inválido: ${key}` })
    }
    const moduleKey = key.toUpperCase()

    const restaurant = await prisma.restaurant.findUnique({
      where:  { id: req.restaurantId },
      select: { tenantId: true },
    })
    if (!restaurant) return res.status(404).json({ error: 'Restaurante no encontrado' })

    // Verificar que el plan permita este módulo antes de activarlo
    if (enabled) {
      const tenant = await prisma.tenant.findUnique({
        where:  { id: restaurant.tenantId },
        select: { subscription: { select: { plan: { select: { allowedModules: true } } } } },
      })
      const allowedByPlan = tenant?.subscription?.plan?.allowedModules ?? []
      if (!allowedByPlan.includes(moduleKey)) {
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

    let updatedModules
    if (enabled) {
      updatedModules = [...new Set([...currentModules, moduleKey])]
    } else {
      updatedModules = currentModules.filter(m => m !== moduleKey)
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id: restaurant.tenantId },
      data:  { enabledModules: updatedModules },
      select: { enabledModules: true },
    })

    res.json({ enabledModules: updatedTenant.enabledModules })
  } catch (err) {
    console.error('[modules] PATCH /:key error:', err)
    res.status(500).json({ error: 'Error al actualizar módulo' })
  }
})

module.exports = router
