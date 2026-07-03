'use strict';

// API-only del bot de WhatsApp (Fase 2 SaaS). El bot se autentica con su token
// por-tenant (botAuth) y opera SOLO por aquí, sin tocar la BD ni tener secretos de
// la plataforma. Ver docs/whatsapp-bot-saas-plan.md §9. Montado en la sección
// pública de index.js (NO usa tenantMiddleware: el tenant sale del token).

const express = require('express');
const router = express.Router();
const { prisma } = require('@mrtpvrest/database');
const { botAuth } = require('../lib/bot-auth.middleware');

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

module.exports = router;
