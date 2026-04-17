/**
 * store.routes.js — API Pública para la Tienda del Cliente
 *
 * Rutas:
 *   GET  /api/store/menu           → Menú público (categorías + productos activos)
 *   GET  /api/store/info           → Datos básicos del restaurante/sucursal
 *   POST /api/store/orders         → Crear pedido online
 *   GET  /api/store/orders/:id     → Seguimiento de pedido
 *
 * Identificación de restaurante (en orden de prioridad):
 *   1. Query ?r={slug}  |  ?restaurantId={id}
 *   2. Query ?l={id}    |  ?locationId={id}
 *   3. Header x-restaurant-id / x-restaurant-slug
 */

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const router = express.Router();

// ── Helper: resolver restaurante + sucursal desde query/headers ──────────────
async function resolveStore(req, res) {
  const restaurantId   = req.headers['x-restaurant-id']   || req.query.restaurantId;
  const restaurantSlug = req.headers['x-restaurant-slug'] || req.query.r;
  const locationId     = req.headers['x-location-id']     || req.query.l || req.query.locationId;

  if (!restaurantId && !restaurantSlug && !locationId) {
    res.status(400).json({ error: 'Se requiere restaurantId, slug (r) o locationId (l).' });
    return null;
  }

  let restaurant = null;

  try {
    if (restaurantId) {
      restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    } else if (restaurantSlug) {
      restaurant = await prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
    } else if (locationId) {
      const loc = await prisma.location.findUnique({ where: { id: locationId }, select: { restaurantId: true } });
      if (loc) restaurant = await prisma.restaurant.findUnique({ where: { id: loc.restaurantId } });
    }

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurante no encontrado.' });
      return null;
    }

    if (!restaurant.isActive) {
      res.status(403).json({ error: 'Este restaurante no está disponible.' });
      return null;
    }

    let location = null;
    if (locationId) {
      location = await prisma.location.findUnique({
        where: { id: locationId, restaurantId: restaurant.id }
      });
      if (location && !location.isActive) {
        res.status(403).json({ error: 'Esta sucursal se encuentra inactiva.' });
        return null;
      }
    }

    return { restaurant, location };
  } catch (e) {
    console.error('[store] resolveStore error:', e.message);
    res.status(500).json({ error: 'Error al identificar el restaurante.' });
    return null;
  }
}

// ── GET /api/store/info ──────────────────────────────────────────────────────
router.get('/info', async (req, res) => {
  const store = await resolveStore(req, res);
  if (!store) return;
  const { restaurant, location } = store;

  res.json({
    id:       restaurant.id,
    name:     restaurant.name,
    slug:     restaurant.slug,
    logo:     restaurant.logo     || null,
    phone:    restaurant.phone    || null,
    address:  restaurant.address  || null,
    location: location ? { id: location.id, name: location.name, address: location.address } : null,
  });
});

// ── GET /api/store/menu ──────────────────────────────────────────────────────
router.get('/menu', async (req, res) => {
  const store = await resolveStore(req, res);
  if (!store) return;
  const { restaurant } = store;

  try {
    const [categories, items] = await Promise.all([
      prisma.category.findMany({
        where: { restaurantId: restaurant.id, isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, description: true, image: true, sortOrder: true },
      }),
      prisma.menuItem.findMany({
        where: { restaurantId: restaurant.id, isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, name: true, description: true, price: true,
          promoPrice: true, isPromo: true, image: true,
          categoryId: true, sortOrder: true,
          variants: {
            where: { isActive: true },
            select: { id: true, name: true, price: true },
            orderBy: { price: 'asc' },
          },
          complements: {
            where: { isActive: true },
            select: { id: true, name: true, price: true, isRequired: true },
          },
        },
      }),
    ]);

    // Agrupar items por categoría
    const categoriesWithItems = categories.map(cat => ({
      ...cat,
      items: items.filter(i => i.categoryId === cat.id),
    }));

    res.json({ categories: categoriesWithItems, items });
  } catch (e) {
    console.error('[store] GET /menu error:', e.message);
    res.status(500).json({ error: 'Error al obtener el menú.' });
  }
});

// ── POST /api/store/orders ───────────────────────────────────────────────────
router.post('/orders', async (req, res) => {
  const store = await resolveStore(req, res);
  if (!store) return;
  const { restaurant, location } = store;

  const {
    items,
    customerName,
    customerPhone,
    orderType = 'DELIVERY',
    deliveryAddress,
    paymentMethod = 'CASH_ON_DELIVERY',
    notes,
    locationId: bodyLocationId,
    source: rawSource,
    tableNumber: rawTableNumber,
  } = req.body;

  const VALID_ORDER_TYPES = ['DELIVERY', 'TAKEOUT', 'DINE_IN'];
  const resolvedOrderType = VALID_ORDER_TYPES.includes(orderType) ? orderType : 'DELIVERY';
  const VALID_SOURCES = ['ONLINE', 'KIOSK'];
  const source = VALID_SOURCES.includes(rawSource) ? rawSource : 'ONLINE';
  const tableNumber = resolvedOrderType === 'DINE_IN' && rawTableNumber
    ? (Math.max(1, Math.min(999, parseInt(rawTableNumber) || 0)) || null)
    : null;

  // Validaciones básicas
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El pedido debe tener al menos un producto.' });
  }
  if (!customerName?.trim()) {
    return res.status(400).json({ error: 'El nombre del cliente es requerido.' });
  }
  if (resolvedOrderType === 'DELIVERY' && !deliveryAddress?.trim()) {
    return res.status(400).json({ error: 'La dirección de entrega es requerida.' });
  }

  // Resolver sucursal final (body tiene prioridad sobre query)
  let resolvedLocationId = location?.id || bodyLocationId || null;

  try {
    // Verificar y calcular items desde la BD (nunca confiar en precios del cliente)
    const itemsData = await Promise.all(
      items.map(async ({ menuItemId, variantId, quantity = 1, notes: itemNotes }) => {
        if (!menuItemId) throw new Error('menuItemId requerido en cada item.');

        const menuItem = await prisma.menuItem.findUnique({
          where: { id: menuItemId, restaurantId: restaurant.id, isActive: true },
          include: { variants: true },
        });
        if (!menuItem) throw new Error(`Producto ${menuItemId} no disponible.`);

        let unitPrice = menuItem.isPromo && menuItem.promoPrice ? menuItem.promoPrice : menuItem.price;
        let variantName = null;

        if (variantId) {
          const variant = menuItem.variants.find(v => v.id === variantId && v.isActive);
          if (!variant) throw new Error(`Variante ${variantId} no disponible.`);
          unitPrice = variant.price;
          variantName = variant.name;
        }

        const qty = Math.max(1, parseInt(quantity) || 1);
        return {
          menuItemId,
          name:     variantName ? `${menuItem.name} (${variantName})` : menuItem.name,
          price:    unitPrice,
          quantity: qty,
          subtotal: unitPrice * qty,
          notes:    itemNotes || null,
          variantId: variantId || null,
        };
      })
    );

    const subtotal    = itemsData.reduce((s, i) => s + i.subtotal, 0);
    const deliveryFee = resolvedOrderType === 'DELIVERY' ? (restaurant.deliveryFee || 0) : 0;
    const total       = subtotal + deliveryFee;
    const orderNumberPrefix = source === 'KIOSK' ? 'KIOSK-' : 'WEB-';
    const orderNumber = orderNumberPrefix + Date.now().toString().slice(-6);

    const order = await prisma.order.create({
      data: {
        restaurantId:    restaurant.id,
        locationId:      resolvedLocationId,
        orderNumber,
        status:          'PENDING',
        orderType:       resolvedOrderType,
        tableNumber,
        paymentMethod,
        paymentStatus:   'PENDING',
        subtotal,
        deliveryFee,
        total,
        discount:        0,
        source,
        customerName:    customerName.trim(),
        customerPhone:   customerPhone?.trim() || null,
        deliveryAddress: resolvedOrderType === 'DELIVERY' ? deliveryAddress.trim() : null,
        notes:           notes?.trim() || null,
        items: { create: itemsData },
      },
      include: {
        items: { include: { menuItem: { select: { name: true } } } },
      },
    });

    // Notificar al TPV / KDS vía Socket.io
    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${restaurant.id}`).emit('order:new', order);
      if (resolvedLocationId) {
        io.to(`restaurant:${restaurant.id}:location:${resolvedLocationId}:admins`).emit('order:new', order);
      }
    }

    res.status(201).json({
      id:          order.id,
      orderNumber: order.orderNumber,
      status:      order.status,
      total:       order.total,
      estimatedMinutes: order.estimatedMinutes || 30,
    });
  } catch (e) {
    console.error('[store] POST /orders error:', e.message);
    res.status(400).json({ error: e.message || 'Error al crear el pedido.' });
  }
});

// ── GET /api/store/orders/:id ────────────────────────────────────────────────
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, orderNumber: true, status: true, orderType: true,
        subtotal: true, deliveryFee: true, total: true,
        estimatedMinutes: true, createdAt: true, paidAt: true,
        customerName: true, deliveryAddress: true, notes: true,
        items: {
          select: { name: true, quantity: true, price: true, subtotal: true, notes: true }
        },
      },
    });

    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });

    res.json(order);
  } catch (e) {
    console.error('[store] GET /orders/:id error:', e.message);
    res.status(500).json({ error: 'Error al obtener el pedido.' });
  }
});

module.exports = router;
