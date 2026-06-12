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
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('@mrtpvrest/database');
const {
  resolveProviderForRestaurant,
  getProviderForRestaurant,
  instantiateFromIntegration,
} = require('../lib/payment-providers');
// Cálculo de envío: fuente única compartida con el chatbot de WhatsApp.
const { computeDeliveryFee } = require('../lib/delivery-fee');
const { computeOpenState } = require('../utils/storeHours');
const { authenticate } = require('../middleware/auth.middleware');
const { addLoyaltyPoints, genLoyaltyQr } = require('../services/loyalty.service');
const { runOrderDictationSmart } = require('../services/order-dictation.service');
const router = express.Router();

// Throttle ligero del parseo de pedidos por IA (público). Protege la cuota de
// Groq del restaurante (BYOK) ante abuso. En memoria, por restaurante.
const parseRate = new Map();
function checkParseRate(restaurantId, limit = 200, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const r = parseRate.get(restaurantId);
  if (!r || now > r.resetAt) {
    parseRate.set(restaurantId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  r.count += 1;
  return r.count <= limit;
}

// Resuelve el cliente final autenticado a partir del header Authorization
// (opcional). No bloquea si falta o es inválido — el storefront permite pedir
// como invitado. Solo acepta usuarios role CUSTOMER de ESTE restaurante.
async function resolveCustomerId(req, restaurantId) {
  try {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return null;
    const payload = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    const userId = payload.userId || payload.id;
    if (!userId) return null;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, restaurantId: true, isActive: true },
    });
    if (!user || !user.isActive || user.role !== 'CUSTOMER') return null;
    if (user.restaurantId !== restaurantId) return null;
    return user.id;
  } catch { return null; }
}

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

  // ¿Hay alguna pasarela de pago en línea habilitada para este restaurante?
  const onlinePaymentEnabled = !!(await prisma.integrationConfig.findFirst({
    where: { restaurantId: restaurant.id, enabled: true, type: { in: ['MERCADOPAGO', 'STRIPE'] } },
    select: { id: true },
  }));

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
    storefrontTheme: (() => { const t = config?.storefrontTheme; const map = { MOCHI: "KAWAII", BENTO: "HALO", POCKET: "BRUTALIST", WAGBA: "ANTOJO" }; return map[t] || t || "KAWAII"; })(),
    primaryColor:    restaurant.accentColor || "#ff5c35",

    // Estado de la tienda — el storefront debe bloquear pedidos si está cerrada.
    // isOpen se calcula combinando el override manual y el horario automático.
    // El mensaje dinámico (cierre por horario) tiene prioridad sobre el manual.
    ...(() => {
      const openState = computeOpenState(config);
      return {
        isOpen:        openState.isOpen,
        closedMessage: openState.message || config?.closedMessage || null,
        nextOpen:      openState.nextOpen,
      };
    })(),

    // ¿Se puede pagar en línea (tarjeta) en esta tienda?
    onlinePayment: onlinePaymentEnabled,

    // Reglas de pedido visibles para el cliente
    minOrderAmount:    config?.minOrderAmount ?? 0,
    estimatedDelivery: config?.estimatedDelivery ?? 40,

    // Configuración de envío (el storefront calcula la vista previa; el backend
    // recalcula y manda la verdad al crear la orden).
    delivery: {
      mode:         config?.deliveryMode || 'FLAT',
      flatFee:      config?.deliveryFee ?? 0,
      freeFrom:     config?.freeDeliveryFrom ?? null, // envío gratis por monto de compra
      baseFee:      config?.deliveryBaseFee ?? 0,
      perKm:        config?.deliveryPerKm ?? 0,
      freeRadiusKm: config?.deliveryFreeRadiusKm ?? null,
      maxKm:        config?.deliveryMaxKm ?? null,
      origin: (config?.originLat != null && config?.originLng != null)
        ? { lat: config.originLat, lng: config.originLng }
        : null,
    },
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
          isPromo: true, promoPrice: true, imageUrl: true,
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
              // NOTA: el modelo Modifier NO tiene campo isAvailable; filtrar por
              // él hacía que toda la consulta del menú fallara con 500.
              modifiers: {
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

    // Items disponibles que NO quedaron en ninguna categoría activa (categoría
    // inactiva, eliminada o sin categoría). Sin esto, los temas que solo
    // renderizan category.items los ocultaban → "la tienda no muestra productos".
    const shownIds = new Set(categoriesWithItems.flatMap(c => c.items.map(i => i.id)));
    const orphanItems = items.filter(i => !shownIds.has(i.id));
    if (orphanItems.length > 0) {
      categoriesWithItems.push({
        id: '__sin_categoria__',
        name: 'Menú',
        description: null,
        imageUrl: null,
        sortOrder: 9999,
        items: orphanItems,
      });
    }

    res.json({ categories: categoriesWithItems, items });
  } catch (e) {
    console.error('[store] GET /menu error:', e.message);
    res.status(500).json({ error: 'Error al obtener el menú.' });
  }
});

// ── POST /api/store/parse-order ──────────────────────────────────────────────
// Interpreta texto libre (p.ej. un mensaje de WhatsApp) y lo convierte en items
// del menú. Reusa el MISMO motor del dictado por voz del TPV
// (runOrderDictationSmart): usa la Groq key BYOK del restaurante con fallback a
// reglas. Público (identifica la tienda por ?r=slug), para que el bridge de
// WhatsApp (packages/wa-orders) no tenga que manejar ninguna API key.
//
// Body: { text }
// Resp: { items: [{ menuItemId, quantity, name? }], unmatched: [string], ok }
router.post('/parse-order', async (req, res) => {
  const store = await resolveStore(req, res);
  if (!store) return;
  const { restaurant } = store;

  const text = typeof req.body?.text === 'string' ? req.body.text : req.body?.prompt;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text requerido' });
  }
  if (!checkParseRate(restaurant.id)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes de parseo. Intenta más tarde.', code: 'PARSE_RATE_LIMIT' });
  }

  try {
    // Modelo grande (70b) para pedidos escritos de WhatsApp: acierta mucho mejor
    // el matching contra el menú que el 8b del dictado por voz.
    const result = await runOrderDictationSmart({
      prompt: text,
      restaurantId: restaurant.id,
      model: process.env.WA_PARSE_MODEL || process.env.ORDER_PARSE_MODEL || 'llama-3.3-70b-versatile',
    });
    return res.json({
      ok: !!result.ok,
      items: Array.isArray(result.items) ? result.items : [],
      unmatched: Array.isArray(result.unresolved) ? result.unresolved : [],
    });
  } catch (e) {
    // Nunca rompemos el flujo del bot por un fallo de IA; devolvemos vacío.
    console.error('[store] POST /parse-order:', e?.message || e);
    return res.json({ ok: false, items: [], unmatched: [text.trim()], error: e?.message });
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
            // Tipos de pedido habilitados por sucursal (gating en el checkout).
            hasDelivery: true,
            hasTakeaway: true,
            hasTableMap: true,
            // Banners de promociones de la sucursal. Los temas del storefront
            // los leen en locations[].banners para mostrar el carrusel.
            banners: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true, imageUrl: true, title: true, description: true,
                linkType: true, linkValue: true,
                scheduleDays: true, scheduleStart: true, scheduleEnd: true,
                dateFrom: true, dateTo: true,
              },
            },
          }
        }
      }
    });

    if (!restaurant) return res.status(404).json({ error: 'Restaurante no encontrado.' });

    // Filtrado por programación (día de la semana, rango horario y de fechas).
    // IMPORTANTE: el servidor corre en UTC, pero la programación se define en
    // hora local de México. Calculamos día/hora en America/Mexico_City para que
    // un banner "miércoles 15:00-21:00" se muestre a esa hora local, no UTC.
    const now = new Date();
    const tz = process.env.STORE_TIMEZONE || 'America/Mexico_City';
    const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const dayOfWeek = local.getDay();
    const timeStr = String(local.getHours()).padStart(2, '0') + ':' + String(local.getMinutes()).padStart(2, '0');
    const bannerIsLive = (b) => {
      try {
        const days = JSON.parse(b.scheduleDays || '[]');
        if (Array.isArray(days) && days.length > 0 && !days.includes(dayOfWeek)) return false;
      } catch {}
      if (b.dateFrom && now < new Date(b.dateFrom)) return false;
      if (b.dateTo && now > new Date(b.dateTo)) return false;
      if (b.scheduleStart && b.scheduleEnd && (timeStr < b.scheduleStart || timeStr > b.scheduleEnd)) return false;
      return true;
    };

    const locations = restaurant.locations.map((loc) => ({
      ...loc,
      banners: (loc.banners || []).filter(bannerIsLive),
    }));

    res.json(locations);
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

  // Configuración del restaurante: fuente de verdad para envío, mínimos y
  // estado abierto/cerrado. El bug previo usaba restaurant.deliveryFee (campo
  // inexistente) → el envío siempre cobraba $0.
  const config = await prisma.restaurantConfig.findUnique({ where: { restaurantId: restaurant.id } });

  const {
    items,
    customerName,
    customerPhone,
    orderType = 'DELIVERY',
    deliveryAddress,
    deliveryLat: rawLat,
    deliveryLng: rawLng,
    paymentMethod = 'CASH_ON_DELIVERY',
    notes,
    locationId: bodyLocationId,
    source: rawSource,
    tableNumber: rawTableNumber,
    tip: rawTip,
    couponCode: rawCouponCode,
    loyaltyQrCode: rawLoyaltyQr,
    redeemPoints: rawRedeemPoints,
  } = req.body;
  const deliveryLat = (rawLat != null && !Number.isNaN(Number(rawLat))) ? Number(rawLat) : null;
  const deliveryLng = (rawLng != null && !Number.isNaN(Number(rawLng))) ? Number(rawLng) : null;
  const tip = Math.max(0, Number(rawTip) || 0);
  const couponCode = typeof rawCouponCode === 'string' ? rawCouponCode.trim().toUpperCase() : '';
  const loyaltyQrCode = typeof rawLoyaltyQr === 'string' ? rawLoyaltyQr.trim() : '';
  // Fase 2 lealtad: puntos que el cliente quiere canjear como descuento.
  const redeemPoints = Math.max(0, Math.floor(Number(rawRedeemPoints) || 0));

  const VALID_ORDER_TYPES = ['DELIVERY', 'TAKEOUT', 'DINE_IN'];
  const resolvedOrderType = VALID_ORDER_TYPES.includes(orderType) ? orderType : 'DELIVERY';
  // WHATSAPP: pedidos creados por el bridge de WhatsApp (packages/wa-orders).
  // Se comportan como ONLINE (respetan tienda abierta/cerrada y mínimo de
  // compra) y caen en el panel "Pedidos Web" del TPV como PENDING para que el
  // cajero los confirme antes de mandarlos a cocina.
  const VALID_SOURCES = ['ONLINE', 'KIOSK', 'WHATSAPP'];
  const source = VALID_SOURCES.includes(rawSource) ? rawSource : 'ONLINE';
  const tableNumber = resolvedOrderType === 'DINE_IN' && rawTableNumber
    ? (Math.max(1, Math.min(999, parseInt(rawTableNumber) || 0)) || null)
    : null;

  // Tienda cerrada: bloquear pedidos online (kioskos operan presencialmente y
  // no dependen de este flag). Considera override manual Y horario automático.
  // 423 Locked = recurso temporalmente no disponible.
  if (rawSource !== 'KIOSK' && config) {
    const storeState = computeOpenState(config);
    if (!storeState.isOpen) {
      return res.status(423).json({
        error: storeState.message || config.closedMessage || 'La tienda está cerrada en este momento.',
        code: 'STORE_CLOSED',
      });
    }
  }

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

  // Sin sucursal explícita (caso típico de WhatsApp y de tiendas con un solo
  // local que no mandan ?l): caer en la sucursal principal del restaurante. Si
  // la dejáramos en null, el pedido (a) no llega al room Socket de la caja
  // (restaurant:<id>:location:<loc>:admins) y (b) se filtra del panel del TPV
  // cuando la tablet tiene una sucursal activa (orders/admin filtra por
  // locationId) → el cajero NUNCA lo ve, ni en vivo ni al refrescar.
  if (!resolvedLocationId) {
    const primary = await prisma.location.findFirst({
      where: { restaurantId: restaurant.id, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (primary) resolvedLocationId = primary.id;
  }

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
            complements: true,
          },
        });
        if (!menuItem) throw new Error(`Producto ${menuItemId} no disponible.`);

        let basePrice = menuItem.isPromo && menuItem.promoPrice ? menuItem.promoPrice : menuItem.price;
        let variantName = null;

        if (variantId) {
          // El modelo MenuItemVariant usa `isAvailable` (no existe `isActive`).
          // Antes se filtraba por `v.isActive` -> siempre undefined -> TODO pedido
          // con variante fallaba con "Variante no disponible". Alinear con el campo
          // real y con el filtro del menú (variants where isAvailable: true).
          const variant = menuItem.variants.find(v => v.id === variantId && v.isAvailable);
          if (!variant) throw new Error(`Variante ${variantId} no disponible.`);
          basePrice = variant.price;
          variantName = variant.name;
        }

        // El cliente envía complementos dentro de modifierIds con prefijo
        // "complement:" (mismo convenio que el TPV). Los separamos de los
        // modificadores reales antes de validar.
        const COMPLEMENT_PREFIX = 'complement:';
        const rawRequestedIds = Array.isArray(modifierIds) ? modifierIds.filter(Boolean) : [];
        const requestedComplementIds = rawRequestedIds
          .filter(id => typeof id === 'string' && id.startsWith(COMPLEMENT_PREFIX))
          .map(id => id.slice(COMPLEMENT_PREFIX.length));
        const requestedModIds = rawRequestedIds.filter(
          id => typeof id === 'string' && !id.startsWith(COMPLEMENT_PREFIX)
        );

        // Modificadores con priceAdd — backend valida que pertenezcan al
        // menuItem y suma priceAdd al precio unitario del item.
        const allowedModifierIds = new Set(
          (menuItem.modifierGroups || []).flatMap(g => g.modifiers.map(m => m.id))
        );
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

        // Complementos (extras/acompañamientos). No existe OrderItemComplement:
        // se cobran en el precio unitario y se anexan al campo notes, igual que
        // hace el TPV. Validamos que pertenezcan al producto y estén disponibles.
        const complementsById = new Map((menuItem.complements || []).map(c => [c.id, c]));
        const selectedComplements = [];
        for (const cid of requestedComplementIds) {
          const complement = complementsById.get(cid);
          if (!complement || complement.isAvailable === false) {
            throw new Error(`Complemento ${cid} no pertenece a ${menuItem.name}.`);
          }
          selectedComplements.push(complement);
        }
        const complementsAdd = selectedComplements.reduce((s, c) => s + Number(c.price || 0), 0);

        const unitPrice = basePrice + modifiersAdd + complementsAdd;

        const qty = Math.max(1, parseInt(quantity) || 1);
        const displayName = variantName ? `${menuItem.name} (${variantName})` : menuItem.name;

        // Complementos al texto de notas (no hay tabla relacional para ellos).
        const complementNote = selectedComplements.length > 0
          ? `Complementos: ${selectedComplements.map(c => c.name).filter(Boolean).join(', ')}`
          : '';
        const finalNotes = [
          typeof itemNotes === 'string' ? itemNotes.trim() : '',
          complementNote,
        ].filter(Boolean).join('\n') || null;

        return {
          menuItemId,
          name: displayName,
          price: unitPrice,
          quantity: qty,
          subtotal: unitPrice * qty,
          notes: finalNotes,
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

    // Mínimo de compra (solo pedidos online; el TPV/kiosko no lo aplica).
    if (rawSource !== 'KIOSK' && config?.minOrderAmount > 0 && subtotal < config.minOrderAmount) {
      return res.status(400).json({
        error: `El pedido mínimo es de $${config.minOrderAmount}.`,
        code: 'MIN_ORDER_NOT_MET',
        minOrderAmount: config.minOrderAmount,
      });
    }

    // Envío: calculado en el backend (fuente de verdad). Para DELIVERY usa el
    // modo configurado (FLAT o DISTANCE) con las coordenadas del cliente.
    let deliveryFee = 0;
    let deliveryDistanceKm = null;
    if (resolvedOrderType === 'DELIVERY') {
      const dest = (deliveryLat != null && deliveryLng != null) ? { lat: deliveryLat, lng: deliveryLng } : null;
      const calc = computeDeliveryFee(config, subtotal, dest);
      if (calc.error === 'OUT_OF_RANGE') {
        return res.status(400).json({
          error: 'Tu ubicación está fuera del área de cobertura de envío.',
          code: 'OUT_OF_DELIVERY_RANGE',
          distanceKm: calc.distanceKm,
        });
      }
      deliveryFee = calc.fee;
      deliveryDistanceKm = calc.distanceKm;
    }

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

    // Loyalty: asociar el pedido a la cuenta del cliente (por QR o por sesión).
    // Los puntos GANADOS se otorgan tras crear el pedido; aquí resolvemos
    // además el CANJE de puntos como descuento (Fase 2).
    let loyaltyUserId = null;
    if (loyaltyQrCode) {
      const account = await prisma.loyaltyAccount.findFirst({
        where: { qrCode: loyaltyQrCode, restaurantId: restaurant.id },
        select: { userId: true },
      });
      loyaltyUserId = account?.userId || null;
    }
    if (!loyaltyUserId) {
      loyaltyUserId = await resolveCustomerId(req, restaurant.id);
    }

    // Canje de puntos → descuento. Solo para clientes identificados. Nunca deja
    // los productos en negativo ni canjea más puntos de los que tiene la cuenta.
    let redeemAccount = null;
    let pointsUsed = 0;
    let pointsDiscount = 0;
    if (redeemPoints > 0 && loyaltyUserId) {
      redeemAccount = await prisma.loyaltyAccount.findUnique({
        where: { userId_restaurantId: { userId: loyaltyUserId, restaurantId: restaurant.id } },
        select: { id: true, points: true },
      });
      const ppv = config?.pointsValuePesos || 0;
      if (redeemAccount && ppv > 0) {
        const maxDiscount = Math.max(0, subtotal - discount); // tope: lo cobrable de productos
        const desired = Math.min(redeemPoints, redeemAccount.points);
        pointsUsed = Math.min(desired, Math.floor(maxDiscount / ppv + 1e-9));
        pointsDiscount = Math.round(pointsUsed * ppv * 100) / 100;
      }
    }
    const orderNumberPrefix = source === 'KIOSK' ? 'KIOSK-' : 'WEB-';
    const orderNumber = orderNumberPrefix + Date.now().toString().slice(-6);

    // Crear la orden CON el consumo de cupón y puntos en la misma transacción:
    // si algo falla, no queda orden con descuento aplicado pero cupón/puntos
    // sin consumir (ni al revés). Los consumos son condicionales en el WHERE
    // del UPDATE — la validación de arriba fue un READ y dos pedidos
    // simultáneos podrían pasarla a la vez; aquí gana solo uno y el otro
    // degrada a warning sin bloquear el pedido (misma UX que un cupón inválido).
    const order = await prisma.$transaction(async (tx) => {
      if (coupon) {
        const consumed = await tx.coupon.updateMany({
          where: {
            id: coupon.id,
            isActive: true,
            ...(coupon.maxUses ? { usedCount: { lt: coupon.maxUses } } : {}),
          },
          data: { usedCount: { increment: 1 } },
        });
        if (consumed.count === 0) {
          couponWarnings.push('Cupón agotado, ignorado');
          discount = 0;
          coupon = null;
        }
      }

      if (pointsUsed > 0 && redeemAccount) {
        const redeemed = await tx.loyaltyAccount.updateMany({
          where: { id: redeemAccount.id, points: { gte: pointsUsed } },
          data: { points: { decrement: pointsUsed } },
        });
        if (redeemed.count === 0) {
          couponWarnings.push('Puntos insuficientes, canje ignorado');
          pointsUsed = 0;
          pointsDiscount = 0;
        }
      }

      const finalDiscount = Math.round((discount + pointsDiscount) * 100) / 100;
      const finalTotal = Math.max(0, subtotal - finalDiscount + deliveryFee + tip);

      const created = await tx.order.create({
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
          total:           finalTotal,
          discount:        finalDiscount,
          couponId:        coupon?.id || null,
          source,
          customerName:    customerName.trim(),
          customerPhone:   customerPhone?.trim() || null,
          deliveryAddress: resolvedOrderType === 'DELIVERY' ? deliveryAddress.trim() : null,
          deliveryLat:     resolvedOrderType === 'DELIVERY' ? deliveryLat : null,
          deliveryLng:     resolvedOrderType === 'DELIVERY' ? deliveryLng : null,
          deliveryDistanceKm: resolvedOrderType === 'DELIVERY' ? deliveryDistanceKm : null,
          notes:           notes?.trim() || null,
          userId:          loyaltyUserId,
          pointsUsed,
          items: { create: itemsData },
        },
        include: {
          items: { include: { menuItem: { select: { name: true } } } },
        },
      });

      // Movimiento REDEEMED en la misma tx que el decremento de saldo: si
      // falla, el rollback también devuelve los puntos.
      if (pointsUsed > 0 && redeemAccount) {
        await tx.loyaltyTransaction.create({
          data: { accountId: redeemAccount.id, type: 'REDEEMED', points: -pointsUsed, description: `Canje en pedido ${created.orderNumber}`, orderId: created.id },
        });
      }

      return created;
    });

    discount = order.discount;

    // Lealtad: si el pedido está ligado a un cliente, acumulamos puntos sobre el
    // subtotal (crea la cuenta si no existía). Best-effort: no bloquea la orden.
    if (loyaltyUserId) {
      addLoyaltyPoints(loyaltyUserId, order).catch(() => null);
    }

    // Notificar al TPV / KDS vía Socket.io.
    // BACKUP IMPRESORA: emitimos SIEMPRE al canal de cocina/KDS, no solo
    // a admins. Si la impresora LAN falla en la sucursal, la orden sigue
    // visible en pantalla KDS y nadie pierde el pedido. Para evitar
    // ruido en restaurantes que no usan KDS, el cliente KDS filtra por
    // restaurantId.
    const io = req.app.get('io');
    if (io) {
      // Cocina/KDS: SIEMPRE al canal general del restaurante como respaldo de
      // impresora (si la impresora LAN falla, la orden sigue visible en la
      // pantalla KDS y nadie pierde el pedido). El KDS refresca con fetchOrders
      // filtrado por sucursal, así que esto NO muestra pedidos de otra sucursal
      // en pantalla: solo dispara un refresco.
      io.to(`restaurant:${restaurant.id}:kitchen`).emit('order:new', order);

      if (resolvedLocationId) {
        // Caja: SOLO la sucursal del pedido. Así la notificación NO cruza a las
        // cajas de otras sucursales y, de paso, la caja la recibe una sola vez
        // (antes el room general + el de sucursal la duplicaban).
        io.to(`restaurant:${restaurant.id}:location:${resolvedLocationId}:admins`).emit('order:new', order);
        io.to(`restaurant:${restaurant.id}:location:${resolvedLocationId}:kitchen`).emit('order:new', order);
      } else {
        // Pedido sin sucursal resuelta: no hay ubicación a la cual dirigirlo, así
        // que emitimos al room general como red de seguridad para que ninguna
        // caja pierda el pedido (caso raro; no hay sucursal que "cruzar").
        io.to(`restaurant:${restaurant.id}`).emit('order:new', order);
      }
    }

    res.status(201).json({
      id:          order.id,
      orderNumber: order.orderNumber,
      status:      order.status,
      total:       order.total,
      discount,
      pointsUsed,
      pointsDiscount,
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

// ─────────────────────────────────────────────────────────────────────────────
// PAGO EN LÍNEA (tarjeta) — Checkout Pro de la pasarela del restaurante
// ─────────────────────────────────────────────────────────────────────────────

// Aplica el resultado de un pago a la orden y notifica a cocina/cliente.
async function applyStorePaymentResult(orderId, { status, rawStatus, providerId }, io) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentProviderId:     providerId,
      paymentProviderStatus: rawStatus,
      paymentStatus:         status,
      status:                status === 'PAID' ? 'CONFIRMED' : order.status,
      paidAt:                status === 'PAID' ? new Date() : undefined,
    },
  });
  if (io && status === 'PAID') {
    // Payload enriquecido para que el push nativo del TPV muestre folio y monto.
    const paidPayload = {
      orderId,
      orderNumber: order.orderNumber,
      total: order.total,
      paymentMethod: order.paymentMethod || 'ONLINE',
      source: 'ONLINE',
    };
    // Sala base del restaurante: el TPV se auto-une ahí al conectar (ver
    // index.js), así que un solo emit basta. NO emitir también a la sala
    // location-admins o el TPV (que está en ambas) recibiría el push doble.
    io.to(`restaurant:${order.restaurantId}`).emit('order:paid', paidPayload);
    io.to(`restaurant:${order.restaurantId}`).emit('order:new', { orderId, source: 'ONLINE' });
    io.to(`restaurant:${order.restaurantId}:kitchen`).emit('order:new', { orderId, source: 'ONLINE' });
  }
}

// ── POST /api/store/payment/create ───────────────────────────────────────────
// Inicia el checkout en línea para un pedido ya creado (paymentStatus PENDING).
// Body: { orderId, returnUrl }  → devuelve { checkoutUrl }
router.post('/payment/create', async (req, res) => {
  const store = await resolveStore(req, res);
  if (!store) return;
  const { restaurant } = store;

  const orderId = String(req.body?.orderId || '');
  const returnUrl = String(req.body?.returnUrl || '').trim();
  if (!orderId) return res.status(400).json({ error: 'orderId requerido.' });

  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId: restaurant.id },
      include: { items: { select: { menuItemId: true, name: true, quantity: true, price: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (order.paymentStatus === 'PAID') return res.status(400).json({ error: 'El pedido ya está pagado.' });

    const resolved = await resolveProviderForRestaurant(restaurant.id, req.body?.provider || 'MERCADOPAGO');
    if (!resolved) return res.status(400).json({ error: 'Esta tienda no tiene pagos en línea configurados.', code: 'NO_PAYMENT_PROVIDER' });

    // Construimos los items para la pasarela. Incluimos envío/propina como
    // conceptos extra para que el total cobrado coincida con el de la orden.
    const items = order.items.map(oi => ({ id: oi.menuItemId, title: oi.name, quantity: oi.quantity, unitPrice: oi.price }));
    const extras = order.total - order.items.reduce((s, i) => s + i.price * i.quantity, 0) + (order.discount || 0);
    if ((order.deliveryFee || 0) > 0) items.push({ id: 'envio', title: 'Envío', quantity: 1, unitPrice: order.deliveryFee });
    if ((order.tip || 0) > 0) items.push({ id: 'propina', title: 'Propina', quantity: 1, unitPrice: order.tip });
    if ((order.discount || 0) > 0) items.push({ id: 'descuento', title: 'Descuento', quantity: 1, unitPrice: -order.discount });

    const backUrl = returnUrl || (restaurant.slug ? `https://${restaurant.slug}.mrtpvrest.com/` : (process.env.FRONTEND_URL || ''));
    const notificationUrl = `${process.env.BACKEND_URL || 'https://api.mrtpvrest.com'}/api/store/webhook/${resolved.key.toLowerCase()}`;

    const result = await resolved.provider.createCheckout({ order, items, backUrl, notificationUrl, currency: 'MXN' });

    await prisma.order.update({
      where: { id: order.id },
      data: { paymentProvider: resolved.key, paymentProviderRef: result.providerRef, paymentMethod: 'CARD' },
    });

    res.json({ checkoutUrl: result.checkoutUrl, provider: resolved.key });
  } catch (e) {
    console.error('[store] POST /payment/create error:', e.message);
    res.status(500).json({ error: 'No se pudo iniciar el pago en línea.' });
  }
});

// ── POST /api/store/webhook/mercadopago ──────────────────────────────────────
// Receptor público de notificaciones de MercadoPago para pedidos de la tienda.
// Esta es la URL que se configura en el panel de MercadoPago.
router.post('/webhook/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body || {};
    if (type !== 'payment' || !data?.id) return res.status(200).json({ received: true });

    // MP solo manda payment.id; consultamos el pago para obtener el orderId.
    const fallback = await prisma.integrationConfig.findFirst({ where: { type: 'MERCADOPAGO', enabled: true } });
    if (!fallback) return res.status(200).json({ received: true });
    const tempProvider = instantiateFromIntegration(fallback);
    const firstLookup = await tempProvider.getPayment(data.id);
    const orderId = firstLookup.externalReference;
    if (!orderId) return res.status(200).json({ received: true });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(200).json({ received: true });

    // Re-verificar con el token del restaurante dueño (autoridad real).
    let verified = firstLookup;
    const restaurantProvider = await getProviderForRestaurant(order.restaurantId, 'MERCADOPAGO');
    if (restaurantProvider) {
      try {
        verified = await restaurantProvider.getPayment(data.id);
        if (verified.externalReference !== orderId) return res.status(200).json({ received: true });
      } catch (_) { /* usa firstLookup */ }
    }

    await applyStorePaymentResult(orderId, verified, req.app.get('io'));
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[store-webhook:mercadopago] error:', err.message);
    res.status(200).json({ received: true });
  }
});

// ── POST /api/store/webhook/stripe ───────────────────────────────────────────
router.post('/webhook/stripe', async (req, res) => {
  try {
    const event = req.body || {};
    const relevant = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'payment_intent.succeeded', 'payment_intent.payment_failed'];
    if (!relevant.includes(event?.type)) return res.status(200).json({ received: true });
    const session = event.data?.object ?? {};
    const orderId = session.client_reference_id || session.metadata?.orderId;
    if (!orderId) return res.status(200).json({ received: true });
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(200).json({ received: true });
    const provider = await getProviderForRestaurant(order.restaurantId, 'STRIPE');
    if (!provider) return res.status(200).json({ received: true });
    const result = await provider.getPayment(session.payment_intent || session.id).catch(() => null);
    if (!result || result.externalReference !== orderId) return res.status(200).json({ received: true });
    await applyStorePaymentResult(orderId, result, req.app.get('io'));
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[store-webhook:stripe] error:', err.message);
    res.status(200).json({ received: true });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  CLIENTE FINAL — registro/login (correo+contraseña), historial y lealtad
// ════════════════════════════════════════════════════════════════════════════

// Token largo (30d): el storefront no implementa refresh; prioriza comodidad.
function signCustomerToken(user) {
  return jwt.sign(
    { userId: user.id, restaurantId: user.restaurantId, role: 'CUSTOMER', tenantId: user.tenantId || null },
    process.env.JWT_SECRET,
    { expiresIn: '30d' },
  );
}

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Guard: cliente final autenticado. Reusa `authenticate` y exige role CUSTOMER.
function requireCustomer(req, res, next) {
  if (req.user?.role !== 'CUSTOMER') return res.status(403).json({ error: 'Solo para clientes.' });
  next();
}

// POST /api/store/customer/register  { name, email, password, phone }
router.post('/customer/register', async (req, res) => {
  const store = await resolveStore(req, res);
  if (!store) return;
  const { restaurant } = store;
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const phone = String(req.body?.phone || '').trim() || null;

    if (!name) return res.status(400).json({ error: 'Tu nombre es requerido.' });
    if (!isEmail(email)) return res.status(400).json({ error: 'Correo no válido.' });
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return res.status(409).json({ error: 'Ese correo ya está registrado. Inicia sesión.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name, email, phone, passwordHash, role: 'CUSTOMER', isActive: true,
        restaurantId: restaurant.id, tenantId: restaurant.tenantId || null,
        loyalty: { create: { restaurantId: restaurant.id, qrCode: genLoyaltyQr() } },
      },
      select: { id: true, name: true, email: true, phone: true, restaurantId: true, tenantId: true },
    });
    res.status(201).json({ token: signCustomerToken(user), customer: { id: user.id, name: user.name, email: user.email, phone: user.phone } });
  } catch (e) {
    console.error('[store] customer register error:', e.message);
    res.status(400).json({ error: 'No se pudo crear la cuenta.' });
  }
});

// POST /api/store/customer/login  { email, password }
router.post('/customer/login', async (req, res) => {
  const store = await resolveStore(req, res);
  if (!store) return;
  const { restaurant } = store;
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos.' });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, phone: true, role: true, restaurantId: true, tenantId: true, isActive: true, passwordHash: true },
    });
    if (!user || !user.isActive || user.role !== 'CUSTOMER' || user.restaurantId !== restaurant.id) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas.' });

    res.json({ token: signCustomerToken(user), customer: { id: user.id, name: user.name, email: user.email, phone: user.phone } });
  } catch (e) {
    console.error('[store] customer login error:', e.message);
    res.status(500).json({ error: 'No se pudo iniciar sesión.' });
  }
});

// GET /api/store/customer/me  → perfil + saldo de puntos
router.get('/customer/me', authenticate, requireCustomer, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true, phone: true,
        loyalty: { where: { restaurantId: req.user.restaurantId }, select: { points: true, tier: true, totalEarned: true, qrCode: true }, take: 1 },
      },
    });
    const config = await prisma.restaurantConfig.findUnique({ where: { restaurantId: req.user.restaurantId }, select: { pointsValuePesos: true } });
    const loyalty = user?.loyalty?.[0] || null;
    res.json({
      id: user.id, name: user.name, email: user.email, phone: user.phone,
      loyalty: loyalty ? { ...loyalty, valuePesos: Math.round(loyalty.points * (config?.pointsValuePesos || 0) * 100) / 100 } : null,
    });
  } catch (e) { res.status(500).json({ error: 'Error al obtener el perfil.' }); }
});

// GET /api/store/customer/orders  → historial de compras del cliente
router.get('/customer/orders', authenticate, requireCustomer, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id, restaurantId: req.user.restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true, orderNumber: true, status: true, orderType: true, total: true,
        paymentStatus: true, pointsEarned: true, createdAt: true,
        items: { select: { name: true, price: true, quantity: true } },
      },
    });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: 'Error al obtener tus pedidos.' }); }
});

// GET /api/store/customer/loyalty  → puntos, tier y movimientos
router.get('/customer/loyalty', authenticate, requireCustomer, async (req, res) => {
  try {
    const account = await prisma.loyaltyAccount.findUnique({
      where: { userId_restaurantId: { userId: req.user.id, restaurantId: req.user.restaurantId } },
      select: { id: true, points: true, tier: true, totalEarned: true, qrCode: true },
    });
    const config = await prisma.restaurantConfig.findUnique({ where: { restaurantId: req.user.restaurantId }, select: { pointsValuePesos: true, pointsPerTen: true } });
    let transactions = [];
    if (account) {
      transactions = await prisma.loyaltyTransaction.findMany({
        where: { accountId: account.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { type: true, points: true, description: true, createdAt: true },
      });
    }
    res.json({
      points: account?.points || 0,
      tier: account?.tier || 'BRONZE',
      totalEarned: account?.totalEarned || 0,
      qrCode: account?.qrCode || null,
      valuePesos: Math.round((account?.points || 0) * (config?.pointsValuePesos || 0) * 100) / 100,
      pointsValuePesos: config?.pointsValuePesos || 0,
      pointsPerTen: config?.pointsPerTen || 1,
      transactions,
    });
  } catch (e) { res.status(500).json({ error: 'Error al obtener tus puntos.' }); }
});

module.exports = router;
