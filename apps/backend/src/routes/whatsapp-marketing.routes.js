// whatsapp-marketing.routes.js — Panel del dueño para el canal WhatsApp.
//
// Endpoints (todos admin + scoped al restaurante del token):
//   GET  /contacts            → base de clientes (con stats)
//   POST /campaigns           → enviar remarketing a un segmento
//   GET  /games               → listar juegos promocionales
//   POST /games               → crear/actualizar un juego
//   DELETE /games/:id         → eliminar un juego
//   GET  /reports             → ventas del canal WhatsApp por sucursal y fuente

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { sendCampaign, SEGMENTS } = require('../services/remarketing.service');
const router = express.Router();

function rid(req) {
  return req.user?.restaurantId || req.restaurantId || null;
}

// ── Contactos ────────────────────────────────────────────────────────────────
router.get('/contacts', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 100));

    const [contacts, total, optedIn] = await Promise.all([
      prisma.whatsappContact.findMany({
        where: { restaurantId },
        orderBy: { lastOrderAt: 'desc' },
        take: limit,
        select: {
          id: true, phone: true, name: true, optIn: true,
          orderCount: true, totalSpent: true, lastOrderAt: true, lastContactedAt: true,
        },
      }),
      prisma.whatsappContact.count({ where: { restaurantId } }),
      prisma.whatsappContact.count({ where: { restaurantId, optIn: true } }),
    ]);

    res.json({ contacts, stats: { total, optedIn } });
  } catch (e) {
    console.error('[wa-marketing] contacts:', e.message);
    res.status(500).json({ error: 'Error al obtener contactos' });
  }
});

// ── Campañas de remarketing ──────────────────────────────────────────────────
router.post('/campaigns', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { segment = 'ALL', message, limit } = req.body || {};
    const result = await sendCampaign({ restaurantId, segment, message, limit });
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e.code === 'BAD_REQUEST') return res.status(400).json({ error: e.message });
    if (e.code === 'NO_WHATSAPP') return res.status(409).json({ error: e.message, code: e.code });
    console.error('[wa-marketing] campaign:', e.message);
    res.status(500).json({ error: 'Error al enviar la campaña' });
  }
});

router.get('/segments', authenticate, requireTenantAccess, requireAdmin, (req, res) => {
  res.json({ segments: SEGMENTS });
});

// ── Juegos promocionales ─────────────────────────────────────────────────────
const VALID_TRIGGERS = ['ON_COMMAND', 'ON_ORDER'];
const VALID_PRIZE_TYPES = ['PERCENTAGE', 'FIXED', 'NONE'];

function sanitizePrizes(prizes) {
  if (!Array.isArray(prizes)) return [];
  return prizes
    .filter((p) => p && typeof p.label === 'string' && p.label.trim())
    .map((p) => ({
      label: String(p.label).slice(0, 80),
      type: VALID_PRIZE_TYPES.includes(p.type) ? p.type : 'NONE',
      value: Math.max(0, Number(p.value) || 0),
      weight: Math.max(0, Number(p.weight) || 1),
      minOrderAmount: Math.max(0, Number(p.minOrderAmount) || 0),
      expiresInDays: Math.max(1, parseInt(p.expiresInDays, 10) || 7),
    }));
}

router.get('/games', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const games = await prisma.promoGame.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(games.map((g) => ({ ...g, prizes: safeParse(g.prizes) })));
  } catch (e) {
    console.error('[wa-marketing] games:', e.message);
    res.status(500).json({ error: 'Error al obtener juegos' });
  }
});

router.post('/games', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { id, name, enabled, trigger, prizes, maxPerContact } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre del juego es requerido' });

    const data = {
      name: String(name).slice(0, 80),
      enabled: !!enabled,
      trigger: VALID_TRIGGERS.includes(trigger) ? trigger : 'ON_COMMAND',
      prizes: JSON.stringify(sanitizePrizes(prizes)),
      maxPerContact: Math.max(0, parseInt(maxPerContact, 10) || 0),
    };

    let game;
    if (id) {
      // Scope: solo actualiza si el juego pertenece al restaurante.
      const existing = await prisma.promoGame.findFirst({ where: { id, restaurantId } });
      if (!existing) return res.status(404).json({ error: 'Juego no encontrado' });
      game = await prisma.promoGame.update({ where: { id }, data });
    } else {
      game = await prisma.promoGame.create({ data: { ...data, restaurantId } });
    }
    res.json({ ...game, prizes: safeParse(game.prizes) });
  } catch (e) {
    console.error('[wa-marketing] save game:', e.message);
    res.status(500).json({ error: 'Error al guardar el juego' });
  }
});

router.delete('/games/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    const existing = await prisma.promoGame.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!existing) return res.status(404).json({ error: 'Juego no encontrado' });
    await prisma.promoGame.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    console.error('[wa-marketing] delete game:', e.message);
    res.status(500).json({ error: 'Error al eliminar el juego' });
  }
});

// ── Reportes del canal WhatsApp ──────────────────────────────────────────────
router.get('/reports', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { from, to } = req.query;

    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const whereWa = { restaurantId, source: 'WHATSAPP', status: { not: 'CANCELLED' } };
    if (from || to) whereWa.createdAt = dateFilter;

    const [byLocationRaw, bySourceRaw, totals, locations] = await Promise.all([
      prisma.order.groupBy({
        by: ['locationId'],
        where: whereWa,
        _sum: { total: true, deliveryFee: true },
        _count: { id: true },
      }),
      prisma.order.groupBy({
        by: ['source'],
        where: { restaurantId, status: { not: 'CANCELLED' }, ...((from || to) ? { createdAt: dateFilter } : {}) },
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where: whereWa,
        _sum: { total: true, deliveryFee: true },
        _count: { id: true },
        _avg: { total: true },
      }),
      prisma.location.findMany({ where: { restaurantId }, select: { id: true, name: true } }),
    ]);

    const locName = Object.fromEntries(locations.map((l) => [l.id, l.name]));

    res.json({
      whatsapp: {
        totalRevenue: totals._sum.total || 0,
        totalOrders: totals._count.id || 0,
        averageTicket: totals._avg.total || 0,
        deliveryFees: totals._sum.deliveryFee || 0,
      },
      byLocation: byLocationRaw.map((r) => ({
        locationId: r.locationId,
        locationName: r.locationId ? (locName[r.locationId] || 'Sucursal') : 'Sin sucursal',
        revenue: r._sum.total || 0,
        deliveryFees: r._sum.deliveryFee || 0,
        orders: r._count.id || 0,
      })),
      bySource: bySourceRaw.map((r) => ({
        source: r.source,
        revenue: r._sum.total || 0,
        orders: r._count.id || 0,
      })),
    });
  } catch (e) {
    console.error('[wa-marketing] reports:', e.message);
    res.status(500).json({ error: 'Error al generar el reporte' });
  }
});

function safeParse(json) {
  try { return JSON.parse(json || '[]'); } catch { return []; }
}

module.exports = router;
