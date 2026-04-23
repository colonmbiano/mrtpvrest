// routes/kiosk.routes.js — API del Kiosko de pedidos (MercadoPago QR)
require('dotenv').config()
const express = require('express')
const router  = express.Router()
const { prisma } = require('@mrtpvrest/database')
const { requireModule, MODULES } = require('../lib/modules')

// MercadoPago SDK v2
const { MercadoPagoConfig, Preference } = require('mercadopago')

function getMPClient() {
  if (!process.env.MP_ACCESS_TOKEN) throw new Error('MP_ACCESS_TOKEN no configurado')
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
}

// ─── Middleware: solo restaurantes con módulo KIOSK activo ──────────────────
router.use(requireModule(MODULES.MODULE_KIOSK))

// ─── GET /api/kiosk/menu ────────────────────────────────────────────────────
// Devuelve categorías + items activos del restaurante (mismo filtro que la tienda pública)
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
// Crea la orden en estado PENDING y devuelve el link de pago QR de MP
router.post('/orders', async (req, res) => {
  try {
    const { restaurantId } = req
    const { items, tableNumber, customerName, customerPhone, notes, locationId } = req.body

    if (!items?.length) return res.status(400).json({ error: 'El carrito está vacío' })

    // Calcular totales
    let subtotal = 0
    const orderItems = []

    for (const item of items) {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: item.menuItemId },
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
        modifiers: { create: modItems },
      })
    }

    const orderNumber = `K-${Date.now()}`

    // Crear orden en BD con paymentMethod QR_CODE
    const order = await prisma.order.create({
      data: {
        restaurantId,
        locationId:    locationId || null,
        orderNumber,
        status:        'PENDING',
        paymentMethod: 'QR_CODE',
        paymentStatus: 'PENDING',
        orderType:     'KIOSK',
        source:        'KIOSK',
        tableNumber:   tableNumber || null,
        customerName:  customerName || null,
        customerPhone: customerPhone || null,
        notes:         notes || null,
        subtotal,
        total: subtotal,
        items: { create: orderItems },
      },
    })

    // Crear preferencia de pago en MercadoPago
    let initPoint = null
    let mpPreferenceId = null

    try {
      const mp = getMPClient()
      const preference = new Preference(mp)

      const backUrl = process.env.TPV_URL
        ? `${process.env.TPV_URL}/kiosk`
        : 'https://tpv.masterburguers.com/kiosk'

      const prefData = await preference.create({
        body: {
          external_reference: order.id,
          items: items.map((item, idx) => ({
            id:          item.menuItemId,
            title:       orderItems[idx]?.name ?? 'Producto',
            quantity:    item.quantity || 1,
            unit_price:  orderItems[idx]
              ? (orderItems[idx].price + (item.modifiers?.reduce((s, m) => {
                  // precio de modifiers ya acumulado en subtotal, aproximamos
                  return s
                }, 0)))
              : 0,
            currency_id: 'MXN',
          })),
          back_urls: {
            success: `${backUrl}?status=success&orderId=${order.id}`,
            failure: `${backUrl}?status=failure&orderId=${order.id}`,
            pending: `${backUrl}?status=pending&orderId=${order.id}`,
          },
          auto_return:          'approved',
          notification_url:     `${process.env.BACKEND_URL}/api/kiosk/mp-webhook`,
          statement_descriptor: 'KIOSKO',
        },
      })

      initPoint    = prefData.init_point
      mpPreferenceId = prefData.id

      await prisma.order.update({
        where: { id: order.id },
        data:  { mpPreferenceId: prefData.id },
      })
    } catch (mpErr) {
      console.error('[kiosk] MercadoPago preference error:', mpErr.message)
      // Seguimos: la orden queda creada, el link de pago falla sin bloquear
    }

    // Emitir socket para cocina
    const io = req.app.get('io')
    if (io) {
      io.to(`restaurant:${restaurantId}`).emit('new:order', { orderId: order.id, source: 'KIOSK' })
    }

    res.status(201).json({ order, initPoint, mpPreferenceId })
  } catch (err) {
    console.error('[kiosk] POST /orders error:', err)
    res.status(500).json({ error: 'Error al crear la orden' })
  }
})

// ─── GET /api/kiosk/orders/:id ──────────────────────────────────────────────
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, restaurantId: req.restaurantId },
      include: { items: { include: { modifiers: true } } },
    })
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' })
    res.json(order)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la orden' })
  }
})

module.exports = router
