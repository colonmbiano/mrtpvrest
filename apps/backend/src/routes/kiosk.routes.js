// routes/kiosk.routes.js — API del Kiosko de pedidos (MercadoPago QR)
require('dotenv').config()
const express = require('express')
const router  = express.Router()
const { prisma } = require('@mrtpvrest/database')
const { requireModule, MODULES } = require('../lib/modules')

// MercadoPago SDK v2
const { MercadoPagoConfig, Preference } = require('mercadopago')

/**
 * Obtiene el cliente MP con el accessToken configurado por el restaurante.
 * Cae al env var global solo si el restaurante no tiene integración activa.
 */
async function getMPClientForRestaurant(restaurantId) {
  const integration = await prisma.integrationConfig.findUnique({
    where: { restaurantId_type: { restaurantId, type: 'MERCADOPAGO' } },
  })

  let accessToken = null

  if (integration?.enabled && integration.config) {
    try {
      const cfg = typeof integration.config === 'string'
        ? JSON.parse(integration.config)
        : integration.config
      accessToken = cfg.accessToken || null
    } catch (_) {}
  }

  if (!accessToken) accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) throw new Error('MercadoPago no configurado para este restaurante. Ve a Admin → Integraciones → MercadoPago.')

  return {
    client: new MercadoPagoConfig({ accessToken }),
    mode:   integration?.mode ?? 'sandbox',
  }
}

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
    const { items, tableNumber, customerName, customerPhone, notes, locationId } = req.body

    if (!items?.length) return res.status(400).json({ error: 'El carrito está vacío' })

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

    // Crear orden con paymentMethod QR_CODE
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

    // Obtener config del restaurante para la URL de retorno
    const tpvConfig = await prisma.tpvRemoteConfig.findFirst({
      where: { restaurantId },
    }).catch(() => null)

    const backUrl = tpvConfig?.kioskUrl
      || process.env.TPV_URL
      || 'https://tpv.masterburguers.com'

    // Crear preferencia de pago en MercadoPago usando token del restaurante
    let initPoint    = null
    let mpPreferenceId = null

    try {
      const { client } = await getMPClientForRestaurant(restaurantId)
      const preference = new Preference(client)

      const prefData = await preference.create({
        body: {
          external_reference: order.id,
          items: orderItems.map((oi, idx) => ({
            id:         items[idx]?.menuItemId ?? oi.menuItemId,
            title:      oi.name,
            quantity:   oi.quantity,
            unit_price: oi.price,
            currency_id: 'MXN',
          })),
          back_urls: {
            success: `${backUrl}/kiosk?status=success&orderId=${order.id}`,
            failure: `${backUrl}/kiosk?status=failure&orderId=${order.id}`,
            pending: `${backUrl}/kiosk?status=pending&orderId=${order.id}`,
          },
          auto_return:          'approved',
          notification_url:     `${process.env.BACKEND_URL}/api/kiosk/mp-webhook`,
          statement_descriptor: 'KIOSKO',
        },
      })

      initPoint      = prefData.init_point
      mpPreferenceId = prefData.id

      await prisma.order.update({
        where: { id: order.id },
        data:  { mpPreferenceId: prefData.id },
      })
    } catch (mpErr) {
      console.error('[kiosk] MercadoPago preference error:', mpErr.message)
      // Orden creada; link de pago fallido no bloquea la respuesta
    }

    // Notificar cocina vía socket
    const io = req.app.get('io')
    if (io) io.to(`restaurant:${restaurantId}`).emit('new:order', { orderId: order.id, source: 'KIOSK' })

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
      where:   { id: req.params.id, restaurantId: req.restaurantId },
      include: { items: { include: { modifiers: true } } },
    })
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' })
    res.json(order)
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la orden' })
  }
})

// ─── GET /api/kiosk/mp-config ───────────────────────────────────────────────
// Devuelve si el restaurante tiene MP activo (sin exponer el token)
router.get('/mp-config', async (req, res) => {
  try {
    const integration = await prisma.integrationConfig.findUnique({
      where:  { restaurantId_type: { restaurantId: req.restaurantId, type: 'MERCADOPAGO' } },
      select: { enabled: true, mode: true },
    })
    res.json({
      configured: !!integration?.enabled,
      mode:       integration?.mode ?? null,
    })
  } catch (err) {
    res.status(500).json({ error: 'Error al verificar configuración MP' })
  }
})

module.exports = router
