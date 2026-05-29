// locations.routes.js — Sucursales (Locations)
// Incluye endpoints para el "Cerebro Adaptativo" (Magic Onboarding)

const express = require('express')
const prisma  = require('@mrtpvrest/database').prisma
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware')
const log = require('../lib/logger')('locations')

const router = express.Router()

const VALID_BUSINESS_TYPES = ['RESTAURANT', 'RETAIL', 'BAR', 'CAFE']

// Cerebro Adaptativo · presets operativos por tipo de negocio.
// Al elegir el tipo, el TPV se adapta automáticamente: define qué flags de
// sucursal se encienden y qué tipos de orden acepta (allowedOrderTypes en la
// TpvRemoteConfig). Así, p.ej., un bar deja de mostrar Delivery/Para Llevar
// sin que el admin tenga que tocar nada más.
//   · RESTAURANT → flujo completo (mesa + para llevar + domicilio).
//   · BAR        → solo consumo en mesa + cuentas abiertas; sin delivery/takeaway.
//   · CAFE       → mostrador rápido: para llevar + mesa, sin delivery.
//   · RETAIL     → venta de mostrador: solo para llevar.
const BUSINESS_TYPE_PRESETS = {
  RESTAURANT: { hasDelivery: true,  hasTakeaway: true,  hasTableMap: true,  hasOpenTabs: false, allowedOrderTypes: ['DINE_IN', 'TAKEOUT', 'DELIVERY'] },
  BAR:        { hasDelivery: false, hasTakeaway: false, hasTableMap: false, hasOpenTabs: true,  allowedOrderTypes: ['DINE_IN'] },
  CAFE:       { hasDelivery: false, hasTakeaway: true,  hasTableMap: false, hasOpenTabs: false, allowedOrderTypes: ['TAKEOUT', 'DINE_IN'] },
  RETAIL:     { hasDelivery: false, hasTakeaway: true,  hasTableMap: false, hasOpenTabs: false, allowedOrderTypes: ['TAKEOUT'] },
}

// Listado de sucursales consolidado en GET /api/admin/locations (audit M1).
// Este router mantiene sólo detalle (:id) y mutaciones específicas de location.

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/locations/:id — Detalles de la sucursal (incluye businessType)
// Nota: Se permite acceso sin authenticate para que el TPV cargue config inicial.
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const location = await prisma.location.findUnique({
      where:  { id },
      select: {
        id: true,
        restaurantId: true,
        name: true,
        slug: true,
        address: true,
        phone: true,
        isActive: true,
        businessType: true,
      },
    })

    if (!location) {
      return res.status(404).json({ error: 'Sucursal no encontrada' })
    }

    // Aislamiento multi-tenant: sólo permitimos leer sucursales del propio restaurante si hay un usuario logueado
    if (req.user?.restaurantId && location.restaurantId !== req.user.restaurantId) {
      return res.status(403).json({ error: 'Acceso denegado a esta sucursal' })
    }

    res.json(location)
  } catch (err) {
    log.error('location.get.failed', { err, id: req.params.id, userId: req.user?.id })
    res.status(500).json({ error: 'Error al obtener la sucursal' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/locations/:id/business-type — Cambia el modo de la sucursal
// Sólo ADMIN / SUPER_ADMIN. Acepta: RESTAURANT | RETAIL | BAR | CAFE
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/business-type', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { businessType } = req.body || {}

    if (!businessType || !VALID_BUSINESS_TYPES.includes(businessType)) {
      return res.status(400).json({
        error: `businessType inválido. Valores permitidos: ${VALID_BUSINESS_TYPES.join(', ')}`,
      })
    }

    const existing = await prisma.location.findUnique({
      where: { id },
      select: { id: true, restaurantId: true },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Sucursal no encontrada' })
    }

    if (req.user.restaurantId && existing.restaurantId !== req.user.restaurantId) {
      return res.status(403).json({ error: 'No puedes modificar una sucursal ajena' })
    }

    // Aplicamos el preset operativo del tipo elegido. Cambiar el tipo de
    // negocio es una acción deliberada ("adapta tu terminal al flujo
    // perfecto"), así que sobrescribimos las capacidades de la sucursal y los
    // allowedOrderTypes del TPV para reflejar el modelo del negocio.
    const preset = BUSINESS_TYPE_PRESETS[businessType]

    const updated = await prisma.$transaction(async (tx) => {
      const loc = await tx.location.update({
        where: { id },
        data: {
          businessType,
          ...(preset
            ? {
                hasDelivery: preset.hasDelivery,
                hasTakeaway: preset.hasTakeaway,
                hasTableMap: preset.hasTableMap,
                hasOpenTabs: preset.hasOpenTabs,
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          businessType: true,
          restaurantId: true,
          hasDelivery: true,
          hasTakeaway: true,
          hasTableMap: true,
          hasOpenTabs: true,
        },
      })

      // Sincronizamos los tipos de orden que el TPV mostrará (upsert porque la
      // sucursal puede no tener fila de config remota todavía).
      if (preset) {
        await tx.tpvRemoteConfig.upsert({
          where:  { locationId: id },
          create: { locationId: id, allowedOrderTypes: preset.allowedOrderTypes },
          update: { allowedOrderTypes: preset.allowedOrderTypes },
        })
      }

      return loc
    })

    log.info('location.businessType.changed', {
      id: updated.id,
      restaurantId: updated.restaurantId,
      businessType: updated.businessType,
      allowedOrderTypes: preset?.allowedOrderTypes,
      actor: req.user?.id,
    })
    res.json({ ...updated, allowedOrderTypes: preset?.allowedOrderTypes })
  } catch (err) {
    log.error('location.businessType.failed', { err, id: req.params.id, userId: req.user?.id })
    res.status(500).json({ error: 'Error al actualizar el tipo de negocio' })
  }
})

module.exports = router
