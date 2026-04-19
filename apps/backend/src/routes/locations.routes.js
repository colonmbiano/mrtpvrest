// locations.routes.js — Sucursales (Locations)
// Incluye endpoints para el "Cerebro Adaptativo" (Magic Onboarding)

const express = require('express')
const prisma  = require('@mrtpvrest/database').prisma
const { authenticate, requireAdmin } = require('../middleware/auth.middleware')

const router = express.Router()

const VALID_BUSINESS_TYPES = ['RESTAURANT', 'RETAIL', 'BAR', 'CAFE']

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/locations/:id — Detalles de la sucursal (incluye businessType)
// Requiere autenticación. Sólo la sucursal del restaurante del usuario.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
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

    // Aislamiento multi-tenant: sólo permitimos leer sucursales del propio restaurante
    if (req.user.restaurantId && location.restaurantId !== req.user.restaurantId) {
      return res.status(403).json({ error: 'Acceso denegado a esta sucursal' })
    }

    res.json(location)
  } catch (err) {
    console.error('GET /locations/:id:', err)
    res.status(500).json({ error: 'Error al obtener la sucursal' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/locations/:id/business-type — Cambia el modo de la sucursal
// Sólo ADMIN / SUPER_ADMIN. Acepta: RESTAURANT | RETAIL | BAR | CAFE
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/business-type', authenticate, requireAdmin, async (req, res) => {
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

    const updated = await prisma.location.update({
      where:  { id },
      data:   { businessType },
      select: {
        id: true,
        name: true,
        slug: true,
        businessType: true,
        restaurantId: true,
      },
    })

    res.json(updated)
  } catch (err) {
    console.error('PUT /locations/:id/business-type:', err)
    res.status(500).json({ error: 'Error al actualizar el tipo de negocio' })
  }
})

module.exports = router
