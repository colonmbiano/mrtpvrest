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

// ── Anti-fraude: rate limit por kiosko ───────────────────────────────────
// Cache en memoria de pedidos PENDING por terminal. Si un mismo terminal
// crea muchas órdenes sin pagar en ventana corta, lo bloqueamos. Para
// multi-instancia en Railway necesitaríamos Redis, pero 1 instancia
// alcanza para el caso típico.
//
// Ajustable via env:
//   KIOSK_RATE_LIMIT_PENDING (default 8)
//   KIOSK_RATE_WINDOW_MS     (default 10 min = 600000)
const KIOSK_RATE_LIMIT = parseInt(process.env.KIOSK_RATE_LIMIT_PENDING || '8', 10);
const KIOSK_RATE_WINDOW_MS = parseInt(process.env.KIOSK_RATE_WINDOW_MS || '600000', 10);
const kioskPendingCache = new Map(); // terminalId → number[] (timestamps)

function checkKioskRate(terminalId) {
  if (!terminalId) return { ok: true };
  const now = Date.now();
  const list = (kioskPendingCache.get(terminalId) || []).filter((t) => now - t < KIOSK_RATE_WINDOW_MS);
  if (list.length >= KIOSK_RATE_LIMIT) {
    return { ok: false, count: list.length };
  }
  list.push(now);
  kioskPendingCache.set(terminalId, list);
  return { ok: true, count: list.length };
}

// Limpieza periódica del cache (cada 15 min) — evita crecimiento ilimitado.
setInterval(() => {
  const now = Date.now();
  for (const [id, list] of kioskPendingCache.entries()) {
    const filtered = list.filter((t) => now - t < KIOSK_RATE_WINDOW_MS);
    if (filtered.length === 0) kioskPendingCache.delete(id);
    else kioskPendingCache.set(id, filtered);
  }
}, 15 * 60 * 1000).unref?.();

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

  // Cargamos la configuración específica del restaurante (marca)
  const config = await prisma.restaurantConfig.findUnique({ where: { restaurantId: restaurant.id } });

  // Cargamos el Tenant padre para flags globales (hasWebStore)
  let tenantConfig = { hasWebStore: false, whatsappNumber: null };
  if (restaurant.tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: restaurant.tenantId },
      select: { hasWebStore: true, whatsappNumber: true },
    });
    if (tenant) tenantConfig = tenant;
  }

  res.json({
    id:       restaurant.id,
    name:     restaurant.name,
    slug:     restaurant.slug,
    logo:     restaurant.logoUrl  || null,
    phone:    config?.phone       || restaurant.phone    || null,
    address:  config?.address     || restaurant.address  || null,
    location: location ? { id: location.id, name: location.name, address: location.address } : null,
    hasWebStore:    tenantConfig.hasWebStore,
    whatsappNumber: config?.whatsappNumber || tenantConfig.whatsappNumber,
    storefrontTheme: (() => { const t = config?.storefrontTheme; const map = { MOCHI: "KAWAII", BENTO: "HALO", POCKET: "BRUTALIST" }; return map[t] || t || "KAWAII"; })(),
    primaryColor:    restaurant.accentColor || "#ff5c35",
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
        select: { id: true, name: true, description: true, imageUrl: true, sortOrder: true },
      }),
      prisma.menuItem.findMany({
        where: { restaurantId: restaurant.id, isAvailable: true },
        select: {
          id: true, name: true, description: true, price: true,
          isPromo: true, imageUrl: true,
          categoryId: true,
          variants: {
            where: { isAvailable: true },
            select: { id: true, name: true, price: true },
            orderBy: { price: 'asc' },
          },
          complements: {
            where: { isAvailable: true },
            select: { id: true, name: true, price: true },
          },
          modifierGroups: {
            select: {
              id: true, name: true,
              required: true, multiSelect: true,
              minSelection: true, maxSelection: true,
              modifiers: {
                where: { isAvailable: true },
                select: { id: true, name: true, priceAdd: true },
              },
            },
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

// ── GET /api/store/locations ─────────────────────────────────────────────────
router.get('/locations', async (req, res) => {
  const restaurantSlug = req.query.r;
  if (!restaurantSlug) return res.status(400).json({ error: 'Slug (r) requerido.' });

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      include: {
        locations: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            slug: true,
            address: true,
            phone: true,
            businessType: true,
            autoPromoEnabled: true,
          }
        }
      }
    });

    if (!restaurant) return res.status(404).json({ error: 'Restaurante no encontrado.' });
    res.json(restaurant.locations);
  } catch (e) {
    console.error('[store] GET /locations error:', e.message);
    res.status(500).json({ error: 'Error al obtener sucursales.' });
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
    tip: rawTip,
    couponCode: rawCouponCode,
    loyaltyQrCode: rawLoyaltyQr,
  } = req.body;
  const tip = Math.max(0, Number(rawTip) || 0);
  const couponCode = typeof rawCouponCode === 'string' ? rawCouponCode.trim().toUpperCase() : '';
  const loyaltyQrCode = typeof rawLoyaltyQr === 'string' ? rawLoyaltyQr.trim() : '';

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

  // Anti-fraude para kioskos: si el terminalId envía más de N órdenes en
  // ventana corta sin pagar, bloqueamos. Identificamos el terminal por
  // header (kiosko lo manda al hacer setup).
  if (source === 'KIOSK') {
    const terminalId = req.headers['x-kiosk-terminal-id'] || req.body?.terminalId || null;
    if (!terminalId) {
      return res.status(400).json({ error: 'terminalId requerido para pedidos de kiosko', code: 'KIOSK_TERMINAL_REQUIRED' });
    }
    const rate = checkKioskRate(terminalId);
    if (!rate.ok) {
      return res.status(429).json({
        error: 'Demasiadas órdenes desde este kiosko. Intenta de nuevo en unos minutos.',
        code: 'KIOSK_RATE_LIMIT',
        terminalId,
        currentCount: rate.count,
        limit: KIOSK_RATE_LIMIT,
      });
    }
  }
  if (resolvedOrderType === 'DELIVERY' && !deliveryAddress?.trim()) {
    return res.status(400).json({ error: 'La dirección de entrega es requerida.' });
  }

  // Resolver sucursal final (body tiene prioridad sobre query)
  let resolvedLocationId = location?.id || bodyLocationId || null;

  try {
    // Verificar y calcular items desde la BD (nunca confiar en precios del cliente)
    const itemsData = await Promise.all(
      items.map(async ({ menuItemId, variantId, quantity = 1, notes: itemNotes, modifierIds }) => {
        if (!menuItemId) throw new Error('menuItemId requerido en cada item.');

        const menuItem = await prisma.menuItem.findUnique({
          where: { id: menuItemId, restaurantId: restaurant.id, isAvailable: true },
          include: {
            variants: true,
            modifierGroups: { include: { modifiers: true } },
          },
        });
        if (!menuItem) throw new Error(`Producto ${menuItemId} no disponible.`);

        let basePrice = menuItem.isPromo && menuItem.promoPrice ? menuItem.promoPrice : menuItem.price;
        let variantName = null;

        if (variantId) {
          const variant = menuItem.variants.find(v => v.id === variantId && v.isActive);
          if (!variant) throw new Error(`Variante ${variantId} no disponible.`);
          basePrice = variant.price;
          variantName = variant.name;
        }

        // Modificadores con priceAdd — backend valida que pertenezcan al
        // menuItem y suma priceAdd al precio unitario del item.
        const allowedModifierIds = new Set(
          (menuItem.modifierGroups || []).flatMap(g => g.modifiers.map(m => m.id))
        );
        const requestedModIds = Array.isArray(modifierIds) ? modifierIds.filter(Boolean) : [];
        const selectedModifiers = [];
        for (const mid of requestedModIds) {
          if (!allowedModifierIds.has(mid)) {
            throw new Error(`Modificador ${mid} no pertenece a ${menuItem.name}.`);
          }
          const mod = (menuItem.modifierGroups || [])
            .flatMap(g => g.modifiers)
            .find(m => m.id === mid);
          if (mod) selectedModifiers.push(mod);
        }
        const modifiersAdd = selectedModifiers.reduce((s, m) => s + Number(m.priceAdd || 0), 0);
        const unitPrice = basePrice + modifiersAdd;

        const qty = Math.max(1, parseInt(quantity) || 1);
        const displayName = variantName ? `${menuItem.name} (${variantName})` : menuItem.name;

        return {
          menuItemId,
          name: displayName,
          price: unitPrice,
          quantity: qty,
          subtotal: unitPrice * qty,
          notes: itemNotes || null,
          // Modificadores como relación anidada — se persisten en OrderItemModifier
          ...(selectedModifiers.length > 0 && {
            modifiers: {
              create: selectedModifiers.map(m => ({
                modifierId: m.id,
                name: m.name,
                priceAdd: Number(m.priceAdd || 0),
              })),
            },
          }),
        };
      })
    );

    const subtotal    = itemsData.reduce((s, i) => s + i.subtotal, 0);
    const deliveryFee = resolvedOrderType === 'DELIVERY' ? (restaurant.deliveryFee || 0) : 0;

    // Cupón opcional. Si es inválido, NO bloquea el pedido — solo se ignora
    // y se manda warning en respuesta. Mejor experiencia que rechazar todo.
    let coupon = null;
    let discount = 0;
    const couponWarnings = [];
    if (couponCode) {
      coupon = await prisma.coupon.findFirst({
        where: { code: couponCode, restaurantId: restaurant.id, isActive: true },
      });
      if (!coupon) {
        couponWarnings.push('Cupón no encontrado, ignorado');
      } else if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        couponWarnings.push('Cupón expirado, ignorado');
        coupon = null;
      } else if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
        couponWarnings.push('Cupón agotado, ignorado');
        coupon = null;
      } else if (subtotal < (coupon.minOrderAmount || 0)) {
        couponWarnings.push(`Cupón requiere mínimo $${coupon.minOrderAmount}, ignorado`);
        coupon = null;
      } else {
        discount = coupon.discountType === 'PERCENTAGE'
          ? subtotal * (coupon.discountValue / 100)
          : Math.min(coupon.discountValue, subtotal);
        discount = Math.round(discount * 100) / 100;
      }
    }

    const total = Math.max(0, subtotal - discount + deliveryFee + tip);

    // Loyalty: si el cliente proveyó qrCode, buscar y asociar la order al
    // userId del LoyaltyAccount. Los puntos se otorgan en otro paso (al
    // confirmar pago). No bloquea si el qr es inválido.
    let loyaltyUserId = null;
    if (loyaltyQrCode) {
      const account = await prisma.loyaltyAccount.findFirst({
        where: { qrCode: loyaltyQrCode, restaurantId: restaurant.id },
        select: { userId: true },
      });
      loyaltyUserId = account?.userId || null;
    }
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
        tip,
        total,
        discount,
        couponId:        coupon?.id || null,
        source,
        customerName:    customerName.trim(),
        customerPhone:   customerPhone?.trim() || null,
        deliveryAddress: resolvedOrderType === 'DELIVERY' ? deliveryAddress.trim() : null,
        notes:           notes?.trim() || null,
        userId:          loyaltyUserId,
        items: { create: itemsData },
      },
      include: {
        items: { include: { menuItem: { select: { name: true } } } },
      },
    });

    // Incrementar usedCount del cupón (best-effort, no bloquea)
    if (coupon) {
      prisma.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      }).catch(() => null);
    }

    // Notificar al TPV / KDS vía Socket.io.
    // BACKUP IMPRESORA: emitimos SIEMPRE al canal de cocina/KDS, no solo
    // a admins. Si la impresora LAN falla en la sucursal, la orden sigue
    // visible en pantalla KDS y nadie pierde el pedido. Para evitar
    // ruido en restaurantes que no usan KDS, el cliente KDS filtra por
    // restaurantId.
    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${restaurant.id}`).emit('order:new', order);
      io.to(`restaurant:${restaurant.id}:kitchen`).emit('order:new', order);
      if (resolvedLocationId) {
        io.to(`restaurant:${restaurant.id}:location:${resolvedLocationId}:admins`).emit('order:new', order);
        io.to(`restaurant:${restaurant.id}:location:${resolvedLocationId}:kitchen`).emit('order:new', order);
      }
    }

    res.status(201).json({
      id:          order.id,
      orderNumber: order.orderNumber,
      status:      order.status,
      total:       order.total,
      discount,
      tip:         order.tip,
      estimatedMinutes: order.estimatedMinutes || 30,
      couponWarnings,
    });
  } catch (e) {
    console.error('[store] POST /orders error:', e.message);
    res.status(400).json({ error: e.message || 'Error al crear el pedido.' });
  }
});

// ── GET /api/store/orders/:id ────────────────────────────────────────────────
router.get('/orders/:id', async (req, res) => {
  try {
    const phoneProof = String(req.query.phone || '').replace(/\D/g, '');
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, orderNumber: true, status: true, orderType: true,
        subtotal: true, deliveryFee: true, total: true,
        estimatedMinutes: true, createdAt: true, paidAt: true,
        paymentMethod: true, paymentStatus: true,
        customerName: true, deliveryAddress: true, notes: true,
        items: {
          select: { name: true, quantity: true, price: true, subtotal: true, notes: true }
        },
      },
    });

    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });

    const customerPhone = String(order.customerPhone || '').replace(/\D/g, '');
    const canSeePrivate = phoneProof && customerPhone && customerPhone.endsWith(phoneProof.slice(-4));
    if (!canSeePrivate) {
      const { customerName, customerPhone: _phone, deliveryAddress, notes, items, ...publicOrder } = order;
      return res.json({
        ...publicOrder,
        items: items.map(({ notes: _notes, ...item }) => item),
      });
    }

    res.json(order);
  } catch (e) {
    console.error('[store] GET /orders/:id error:', e.message);
    res.status(500).json({ error: 'Error al obtener el pedido.' });
  }
});

// ── POST /api/store/kiosk/session ────────────────────────────────────────
// Registra apertura/cierre del kiosko. Audita en SystemLog para que el
// admin pueda ver cuándo se prendió/apagó cada terminal y conciliar
// pedidos contra horario de operación.
// Body: { event: "OPEN" | "CLOSE", terminalId, notes? }
router.post('/kiosk/session', async (req, res) => {
  const store = await resolveStore(req, res);
  if (!store) return;
  const { restaurant, location } = store;

  const event = String(req.body?.event || '').toUpperCase();
  const terminalId = req.headers['x-kiosk-terminal-id'] || req.body?.terminalId || null;
  const notes = req.body?.notes || null;

  if (!['OPEN', 'CLOSE'].includes(event)) {
    return res.status(400).json({ error: 'event debe ser OPEN o CLOSE' });
  }
  if (!terminalId) return res.status(400).json({ error: 'terminalId requerido' });

  try {
    // Intentamos persistir en SystemLog si existe. Si no, fallback a
    // simplemente responder OK (no crítico).
    try {
      await prisma.systemLog.create({
        data: {
          level: 'INFO',
          message: `Kiosko ${event}`,
          path: '/api/store/kiosk/session',
          method: 'POST',
          tenantId: restaurant.tenantId || null,
          metadata: {
            kioskEvent: event,
            terminalId,
            restaurantId: restaurant.id,
            locationId: location?.id || null,
            notes,
          },
        },
      });
    } catch { /* tabla no existe o esquema distinto — no bloquea */ }
    res.json({ ok: true, event, terminalId, at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/store/loyalty/lookup ───────────────────────────────────────
// El cliente del kiosko/store escanea o teclea su QR code de loyalty.
// Devuelve datos básicos para confirmar al cliente que se identificó OK
// y para que el backend asocie la futura order con su LoyaltyAccount.
router.post('/loyalty/lookup', async (req, res) => {
  const store = await resolveStore(req, res);
  if (!store) return;
  const { restaurant } = store;

  const qrCode = String(req.body?.qrCode || '').trim();
  if (!qrCode) return res.status(400).json({ error: 'qrCode requerido' });

  try {
    const account = await prisma.loyaltyAccount.findFirst({
      where: { qrCode, restaurantId: restaurant.id },
      include: { user: { select: { id: true, name: true, phone: true } } },
    });
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json({
      accountId: account.id,
      userId: account.userId,
      userName: account.user?.name || 'Cliente',
      userPhone: account.user?.phone || null,
      points: account.points,
      tier: account.tier,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/store/coupon/validate ──────────────────────────────────────
// Validación pública de cupón scoped al restaurant del store (kiosko + web).
// Body: { code, orderAmount }
router.post('/coupon/validate', async (req, res) => {
  const store = await resolveStore(req, res);
  if (!store) return;
  const { restaurant } = store;

  const code = String(req.body?.code || '').trim().toUpperCase();
  const orderAmount = Number(req.body?.orderAmount || 0);
  if (!code) return res.status(400).json({ error: 'code requerido' });

  try {
    const coupon = await prisma.coupon.findFirst({
      where: { code, restaurantId: restaurant.id, isActive: true },
    });
    if (!coupon) return res.status(404).json({ error: 'Cupón no válido' });
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Cupón expirado' });
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ error: 'Cupón agotado' });
    }
    if (orderAmount < (coupon.minOrderAmount || 0)) {
      return res.status(400).json({ error: `Compra mínima $${coupon.minOrderAmount || 0}` });
    }
    const discount = coupon.discountType === 'PERCENTAGE'
      ? orderAmount * (coupon.discountValue / 100)
      : coupon.discountValue;
    res.json({
      valid: true,
      coupon: { id: coupon.id, code: coupon.code, description: coupon.description },
      discount: Math.round(discount * 100) / 100,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/store/orders/by-number/:orderNumber ─────────────────────────
// Endpoint específico para polling de kiosko (post-pago). Devuelve solo
// status + estimatedMinutes — payload mínimo para no saturar al pollear.
router.get('/orders/by-number/:orderNumber', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { orderNumber: req.params.orderNumber },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        estimatedMinutes: true,
        paymentStatus: true,
        createdAt: true,
      },
    });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
