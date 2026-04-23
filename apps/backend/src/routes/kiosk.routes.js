// routes/kiosk.routes.js — API del Kiosko de pedidos (pasarela agnóstica)
require('dotenv').config()
const express = require('express')
const router  = express.Router()
const { prisma } = require('@mrtpvrest/database')
const { requireModule, MODULES } = require('../lib/modules')
const {
  resolveProviderForRestaurant,
  SUPPORTED_KEYS,
} = require('../lib/payment-providers')

// ─── Middleware: solo restaurantes con módulo KIOSK activo ──────────────────
router.use(requireModule(MODULES.MODULE_KIOSK))

// ─── GET /api/kiosk/menu ────────────────────────────────────────────────────
router.get('/menu', async (req, res) => {
  try {
    const { restaurantId } = req
    const locationId = req.locationId || req.headers['x-location-id'] || null

    const categories = await prisma.category.findMany({
      where:   { restaurantId, isActive: true },
      orderBy: { position: 'asc' },
      include: {
        items: {
          where: {
            isActive:  true,
            isDeleted: false,
            ...(locationId ? {
              OR: [
                { locations: { some: { id: locationId } } },
                { locations: { none: {} } },
              ],
            } : {}),
          },
          orderBy: { position: 'asc' },
          include: {
            modifierGroups: {
              where:   { isActive: true },
              include: { modifiers: { where: { isActive: true }, orderBy: { position: 'asc' } } },
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    })

    res.json(categories)
  } catch (err) {
    console.error('[kiosk] GET /menu error:', err)
    res.status(500).json({ error: 'Error al cargar el menú' })
  }
})

// ─── POST /api/kiosk/orders ─────────────────────────────────────────────────
router.post('/orders', async (req, res) => {
  try {
    const { restaurantId } = req
    const {
      items,
      tableNumber,
      customerName,
      customerPhone,
      notes,
      locationId,
      paymentProvider,  // opcional: forzar una pasarela específica
    } = req.body

    if (!items?.length) return res.status(400).json({ error: 'El carrito está vacío' })

    // Resolver pasarela ANTES de crear la orden (si no hay pasarela, no sirve)
    const resolved = await resolveProviderForRestaurant(restaurantId, paymentProvider)
    if (!resolved) {
      return res.status(400).json({
        error: 'Este restaurante no tiene una pasarela de pago activa. Configúrala en Admin → Integraciones.',
      })
    }

    // Calcular totales
    let subtotal = 0
    const orderItems = []

    for (const item of items) {
      const menuItem = await prisma.menuItem.findUnique({
        where:   { id: item.menuItemId },
        include: { modifierGroups: { include: { modifiers: true } } },
      })
      if (!menuItem || !menuItem.isActive) {
        return res.status(400).json({ error: `Producto no disponible: ${item.menuItemId}` })
      }

      let itemTotal = menuItem.price * (item.quantity || 1)
      const modItems = []

      for (const mod of item.modifiers ?? []) {
        const modifier = await prisma.modifier.findUnique({ where: { id: mod.modifierId } })
        if (modifier) {
          itemTotal += modifier.price * (item.quantity || 1)
          modItems.push({ modifierId: modifier.id, name: modifier.name, price: modifier.price })
        }
      }

      subtotal += itemTotal
      orderItems.push({
        menuItemId: menuItem.id,
        name:       menuItem.name,
        price:      menuItem.price,
        quantity:   item.quantity || 1,
        notes:      item.notes || null,
        modifiers:  { create: modItems },
      })
    }

    const orderNumber = `K-${Date.now()}`

    // Crear orden con paymentMethod QR_CODE (provider-agnostic)
    const order = await prisma.order.create({
      data: {
        restaurantId,
        locationId:    locationId || null,
        orderNumber,
        status:          'PENDING',
        paymentMethod:   'QR_CODE',
        paymentStatus:   'PENDING',
        paymentProvider: resolved.key,
        orderType:       'KIOSK',
        source:          'KIOSK',
        tableNumber:     tableNumber || null,
        customerName:    customerName || null,
        customerPhone:   customerPhone || null,
        notes:           notes || null,
        subtotal,
        total: subtotal,
        items: { create: orderItems },
      },
    })

    // Resolver URL de retorno del kiosko
    const backUrl = `${process.env.TPV_URL || 'https://tpv.masterburguers.com'}/kiosk`
    const notificationUrl = `${process.env.BACKEND_URL || ''}/api/kiosk/webhook/${resolved.key.toLowerCase()}`

    // Crear checkout en la pasarela
    let checkoutUrl = null
    let providerRef = null

    try {
      const result = await resolved.provider.createCheckout({
        order,
        items: orderItems.map((oi, idx) => ({
          id:        items[idx]?.menuItemId ?? oi.menuItemId,
          title:     oi.name,
          quantity:  oi.quantity,
          unitPrice: oi.price,
        })),
        backUrl,
        notificationUrl,
        currency: 'MXN',
      })
      checkoutUrl = result.checkoutUrl
      providerRef = result.providerRef

      await prisma.order.update({
        where: { id: order.id },
        data:  { paymentProviderRef: providerRef },
      })
    } catch (payErr) {
      console.error(`[kiosk] ${resolved.key} checkout error:`, payErr.message)
      // Orden queda creada pero sin link; el usuario puede reintentar
    }

    // Notificar cocina vía socket
    const io = req.app.get('io')
    if (io) io.to(`restaurant:${restaurantId}`).emit('new:order', { orderId: order.id, source: 'KIOSK' })

    res.status(201).json({
      order,
      checkoutUrl,
      providerRef,
      provider: resolved.key,
    })
  } catch (err) {
    console.error('[kiosk] POST /orders error:', err)
    res.status(500).json({ error: 'Error al crear la orden' })
  }
})

// ─── GET /api/kiosk/orders/:id ──────────────────────────────────────────────
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where:   { id: req.params.id, restaurantId: req.restaurantId },
      include: { items: { include: { modifiers: true } } },
    })
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' })
    res.json(order)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la orden' })
  }
})

// ─── GET /api/kiosk/providers ───────────────────────────────────────────────
// Devuelve la(s) pasarelas activas para este restaurante (sin exponer tokens)
router.get('/providers', async (req, res) => {
  try {
    const integrations = await prisma.integrationConfig.findMany({
      where: { restaurantId: req.restaurantId, enabled: true, type: { in: SUPPORTED_KEYS } },
      select: { type: true, mode: true },
    })
    res.json({ providers: integrations })
  } catch (err) {
    res.status(500).json({ error: 'Error al listar pasarelas' })
  }
})

module.exports = router
