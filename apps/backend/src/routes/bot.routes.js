'use strict';

// API-only del bot de WhatsApp (Fase 2 SaaS). El bot se autentica con su token
// por-tenant (botAuth) y opera SOLO por aquí, sin tocar la BD ni tener secretos de
// la plataforma. Ver docs/whatsapp-bot-saas-plan.md §9. Montado en la sección
// pública de index.js (NO usa tenantMiddleware: el tenant sale del token).

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { prisma } = require('@mrtpvrest/database');
const { botAuth } = require('../lib/bot-auth.middleware');

// Base para self-call interno (reusa handlers probados con su cadena de middleware).
const selfBase = () => `http://127.0.0.1:${process.env.PORT || 3001}`;

// Todas las rutas exigen el token del bot → req.restaurantId es el tenant del token.
router.use(botAuth);

// ── Contexto para el prompt (menú + negocio) ─────────────────────────────────
// Reemplaza los prisma.menuItem/restaurant/restaurantConfig que hoy hace gemini.js.
// Devuelve el MISMO menuString (con [ID:]/[variantId:]/[modifierId:]) para que el
// prompt sea idéntico. Caché en proceso 60s por restaurante (igual que el bot).
const contextCache = new Map(); // restaurantId → { data, ts }

async function buildBotContext(restaurantId) {
  const [menuItems, restaurant, cfg, primaryLocation] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId, isAvailable: true },
      include: { variants: true, complements: true, modifierGroups: { include: { modifiers: true } } },
    }),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
    prisma.restaurantConfig.findUnique({ where: { restaurantId } }),
    prisma.location.findFirst({ where: { restaurantId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } }),
  ]);

  // Día de hoy en INGLÉS mayúsculas (casa con MenuItem.activeDays). Mismo cálculo
  // que gemini.js/menu.routes.js.
  const todayStr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', weekday: 'long' })
    .format(new Date()).toUpperCase();

  const activeMenuItems = menuItems.filter((item) => {
    const activeDays = Array.isArray(item.activeDays) ? item.activeDays : [];
    if (item.isPromo) {
      if (activeDays.length === 0) return false;
      return activeDays.includes(todayStr);
    }
    return true;
  });

  const menuString = activeMenuItems.map((item) => {
    const price = item.isPromo && item.promoPrice ? item.promoPrice : item.price;
    const promoText = item.isPromo ? ' (¡PROMOCIÓN DEL DÍA!)' : '';
    let str = `- ${item.name}: $${price}${promoText} (${item.description || ''}) [ID: ${item.id}]`;
    const availableVariants = item.variants.filter((v) => v.isAvailable);
    if (availableVariants.length > 0) {
      str += `\n  Variantes (elige 1): ` + availableVariants.map((v) => `${v.name} ($${v.price}) [variantId: ${v.id}]`).join(', ');
    }
    const availableComplements = item.complements.filter((c) => c.isAvailable);
    if (availableComplements.length > 0) {
      str += `\n  Extras/Complementos: ` + availableComplements.map((c) => `${c.name} (+$${c.price}) [modifierId: complement:${c.id}]`).join(', ');
    }
    item.modifierGroups.forEach((g) => {
      str += `\n  Grupo: ${g.name} -> ` + g.modifiers.map((m) => `${m.name} (+$${m.priceAdd || 0}) [modifierId: ${m.id}]`).join(', ');
    });
    return str;
  }).join('\n\n');

  const promosHoy = activeMenuItems
    .filter((i) => i.isPromo)
    .map((i) => `- ${i.name}: $${i.promoPrice || i.price}`)
    .join('\n');

  return {
    businessName: restaurant?.name || 'nuestro restaurante',
    locationId: primaryLocation?.id || null, // sucursal principal (payload de pedido)
    menuString,
    promosHoy,
    // Solo los campos de negocio que el bot necesita (computeOpenState +
    // formatBusinessHours + estimatedDelivery). NADA de secretos.
    config: cfg ? {
      isOpen: cfg.isOpen,
      scheduleEnabled: cfg.scheduleEnabled,
      businessHours: cfg.businessHours,
      timezone: cfg.timezone,
      estimatedDelivery: cfg.estimatedDelivery,
    } : null,
  };
}

router.get('/context', async (req, res) => {
  try {
    const rid = req.restaurantId;
    const cached = contextCache.get(rid);
    let data;
    if (cached && Date.now() - cached.ts < 60 * 1000) {
      data = cached.data;
    } else {
      data = await buildBotContext(rid);
      contextCache.set(rid, { data, ts: Date.now() });
    }
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (e) {
    console.error('[bot] context error:', e?.message || e);
    res.status(500).json({ error: 'Error al armar el contexto del bot' });
  }
});

// ── Detalle de una orden para el ticket (con variantes + extras) ─────────────
// Reemplaza fetchOrderTicketDetail (client.js). Scoped por restaurantId del token.
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, restaurantId: req.restaurantId },
      select: {
        id: true, orderNumber: true, status: true, paymentStatus: true,
        subtotal: true, deliveryFee: true, discount: true, total: true,
        estimatedMinutes: true, locationId: true,
        items: {
          select: {
            name: true, quantity: true, subtotal: true, notes: true,
            modifiers: { select: { name: true, priceAdd: true } },
          },
        },
      },
    });
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    res.set('Cache-Control', 'no-store');
    res.json(order);
  } catch (e) {
    console.error('[bot] order detail error:', e?.message || e);
    res.status(500).json({ error: 'Error al obtener la orden' });
  }
});

// ── Último pedido del CHAT (memoria persistente del bot) ─────────────────────
// `ref` = hash del chat (los 16 hex de sha1 que el bot usa en el clientOrderId
// `wa:<ref>:<uuid>`). Devuelve el pedido MÁS RECIENTE de ese chat dentro de la
// ventana de dedupe, con `canAdd` calculado server-side: solo se puede AGREGAR
// a un ticket que sigue vivo en cocina (PENDING/CONFIRMED/PREPARING) y sin
// cobrar. Sustituye la memoria de 15 min del bot como fuente para ADD_TO_ORDER:
// esa memoria muere con cada restart y no sabe si el ticket ya salió a reparto.
router.get('/chat-order', async (req, res) => {
  try {
    const ref = String(req.query.ref || '').toLowerCase();
    if (!/^[a-f0-9]{8,40}$/.test(ref)) return res.status(400).json({ error: 'ref inválido' });
    const windowMin = parseInt(process.env.WHATSAPP_CHAT_DEDUP_MINUTES, 10) || 120;
    const order = await prisma.order.findFirst({
      where: {
        restaurantId: req.restaurantId,
        source: 'WHATSAPP',
        status: { not: 'CANCELLED' },
        clientOrderId: { startsWith: `wa:${ref}:` },
        createdAt: { gte: new Date(Date.now() - windowMin * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, orderNumber: true, status: true, paymentStatus: true,
        total: true, createdAt: true,
        items: { select: { name: true, quantity: true } },
      },
    });
    res.set('Cache-Control', 'no-store');
    if (!order) return res.json({ order: null });
    const canAdd = ['PENDING', 'CONFIRMED', 'PREPARING'].includes(order.status)
      && order.paymentStatus === 'PENDING';
    res.json({ order: { ...order, canAdd } });
  } catch (e) {
    console.error('[bot] chat-order error:', e?.message || e);
    res.status(500).json({ error: 'Error al buscar el pedido del chat' });
  }
});

// Diagnóstico: confirma que el token es válido y a qué restaurante pertenece.
router.get('/whoami', async (req, res) => {
  try {
    const r = await prisma.restaurant.findFirst({
      where: { id: req.restaurantId },
      select: { id: true, name: true, isActive: true },
    });
    if (!r) return res.status(404).json({ error: 'Restaurante no encontrado' });
    res.set('Cache-Control', 'no-store');
    res.json({ restaurantId: r.id, name: r.name, isActive: r.isActive, enabled: req.botEnabled });
  } catch (e) {
    console.error('[bot] whoami error:', e?.message || e);
    res.status(500).json({ error: 'Error' });
  }
});

// Config editable del asistente (lo que hoy botConfig.js lee directo de la BD).
// Sale de req.botConfig que ya cargó botAuth → sin query extra.
router.get('/config', (req, res) => {
  const cfg = req.botConfig || {};
  res.set('Cache-Control', 'no-store');
  res.json({
    active: req.botEnabled,
    extraInstructions: typeof cfg.extraInstructions === 'string' ? cfg.extraInstructions : '',
    ignoreNumbers: Array.isArray(cfg.ignoreNumbers) ? cfg.ignoreNumbers : [],
    ignoreGroupName: typeof cfg.ignoreGroupName === 'string' ? cfg.ignoreGroupName : '',
  });
});

// ── Agregar items a una orden (ADD_TO_ORDER) ─────────────────────────────────
// Mueve al BACKEND lo que hoy hace orderProcessor.addItemsToOrder (el único punto
// que forja un JWT y necesita JWT_SECRET). Así el bot deja de necesitar el secreto.
// Resuelve el empleado-bot + la sucursal server-side y reusa el handler probado
// /api/orders/:id/items vía self-call interno (misma validación de siempre).
const botEmployeeCache = new Map(); // restaurantId → employeeId

async function resolveBotEmployeeId(restaurantId) {
  const cached = botEmployeeCache.get(restaurantId);
  if (cached) return cached;
  const location = await prisma.location.findFirst({
    where: { restaurantId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true },
  });
  if (!location) throw new Error(`Sin sucursal activa para ${restaurantId}`);
  let emp = await prisma.employee.findFirst({
    where: { locationId: location.id, name: 'Bot WhatsApp' }, select: { id: true, isActive: true },
  });
  if (emp && !emp.isActive) await prisma.employee.update({ where: { id: emp.id }, data: { isActive: true } });
  if (!emp) {
    emp = await prisma.employee.create({
      data: {
        locationId: location.id, name: 'Bot WhatsApp', role: 'CASHIER',
        // PIN irrecuperable (hash de 32 bytes aleatorios): el campo es obligatorio
        // pero no habilita login por PIN.
        pin: bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10),
        isActive: true, canTakeDelivery: true, canTakeTakeout: true,
      },
    });
  }
  botEmployeeCache.set(restaurantId, emp.id);
  return emp.id;
}

router.post('/orders/:id/items', async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'items requerido' });
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, restaurantId }, select: { locationId: true },
    });
    if (!order || !order.locationId) return res.status(404).json({ error: 'Orden no encontrada o sin sucursal' });

    const botEmployeeId = await resolveBotEmployeeId(restaurantId);
    const token = jwt.sign({ id: botEmployeeId, restaurantId, role: 'CASHIER' }, process.env.JWT_SECRET, { expiresIn: '2m' });
    const r = await axios.post(`${selfBase()}/api/orders/${encodeURIComponent(req.params.id)}/items`, { items }, {
      headers: { 'x-restaurant-id': restaurantId, 'x-location-id': order.locationId, 'Authorization': `Bearer ${token}` },
      timeout: 12000,
    });
    res.json(r.data);
  } catch (e) {
    const code = e?.response?.status;
    console.error('[bot] add-items error:', code || '', e?.response?.data || e?.message || e);
    // Propaga 4xx del handler (validación); el resto → 502.
    res.status(code && code >= 400 && code < 500 ? code : 502)
      .json({ error: 'No se pudieron agregar los items', detail: e?.response?.data?.error });
  }
});

module.exports = router;
