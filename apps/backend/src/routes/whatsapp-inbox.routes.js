// whatsapp-inbox.routes.js — Bandeja de entrada de WhatsApp del panel admin.
//
// Endpoints (todos admin + scoped al restaurante del token):
//   GET  /conversations              → lista de hilos con filtros y contexto CRM
//   GET  /conversations/:id          → hilo completo (y marca como leído)
//   POST /conversations/:id/reply    → responder como humano (respeta ventana 24h)
//   POST /conversations/:id/status   → cambiar estado (OPEN | NEEDS_HUMAN | RESOLVED)
//
// La ventana de 24h de Meta se calcula desde `lastInboundAt`: fuera de ella la
// respuesta libre se rechaza con 409 WINDOW_EXPIRED (la vía oficial exigiría
// una plantilla aprobada, que aún no manejamos).

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const provider = require('../services/whatsapp-bot/provider');
const inbox = require('../services/whatsapp-bot/inbox');
const router = express.Router();

function rid(req) {
  return req.user?.restaurantId || req.restaurantId || null;
}

const VALID_STATUSES = ['OPEN', 'NEEDS_HUMAN', 'RESOLVED'];

function serializeConversation(c, contact = null) {
  return {
    id: c.id,
    phone: c.phone,
    name: c.name || contact?.name || null,
    status: c.status,
    lastMessageAt: c.lastMessageAt,
    lastInboundAt: c.lastInboundAt,
    lastOutboundAt: c.lastOutboundAt,
    unreadCount: c.unreadCount,
    needsHumanReason: c.needsHumanReason,
    escalatedAt: c.escalatedAt,
    windowOpen: inbox.windowOpen(c.lastInboundAt),
    contact: contact
      ? {
          orderCount: contact.orderCount,
          totalSpent: contact.totalSpent,
          lastOrderAt: contact.lastOrderAt,
          optIn: contact.optIn,
        }
      : null,
  };
}

// ── Lista de conversaciones ──────────────────────────────────────────────────
router.get('/conversations', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
    const status = String(req.query.status || '').toUpperCase();
    const q = String(req.query.q || '').trim();

    const where = {
      restaurantId,
      ...(VALID_STATUSES.includes(status) ? { status } : {}),
      ...(q
        ? { OR: [{ phone: { contains: q.replace(/\D/g, '') || q } }, { name: { contains: q, mode: 'insensitive' } }] }
        : {}),
    };

    const [conversations, counts] = await Promise.all([
      prisma.whatsappConversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        take: limit,
      }),
      prisma.whatsappConversation.groupBy({
        by: ['status'],
        where: { restaurantId },
        _count: { _all: true },
      }),
    ]);

    // Contexto CRM y preview del último mensaje (queries únicas, no N+1).
    const phones = conversations.map((c) => c.phone);
    const ids = conversations.map((c) => c.id);
    const [contacts, lastMessages] = await Promise.all([
      phones.length
        ? prisma.whatsappContact.findMany({
            where: { restaurantId, phone: { in: phones } },
            select: { phone: true, name: true, orderCount: true, totalSpent: true, lastOrderAt: true, optIn: true },
          })
        : [],
      ids.length
        ? prisma.whatsappMessage.findMany({
            where: { restaurantId, conversationId: { in: ids } },
            orderBy: { createdAt: 'desc' },
            distinct: ['conversationId'],
            select: { conversationId: true, direction: true, body: true, createdAt: true },
          })
        : [],
    ]);
    const byPhone = new Map(contacts.map((c) => [c.phone, c]));
    const lastByConversation = new Map(lastMessages.map((msg) => [msg.conversationId, msg]));

    const stats = { OPEN: 0, NEEDS_HUMAN: 0, RESOLVED: 0 };
    for (const row of counts) {
      if (stats[row.status] !== undefined) stats[row.status] = row._count._all;
    }

    res.json({
      conversations: conversations.map((c) => {
        const last = lastByConversation.get(c.id) || null;
        return {
          ...serializeConversation(c, byPhone.get(c.phone) || null),
          lastMessage: last ? { direction: last.direction, body: String(last.body).slice(0, 140) } : null,
        };
      }),
      stats,
    });
  } catch (e) {
    console.error('[wa-inbox] conversations:', e.message);
    res.status(500).json({ error: 'Error al obtener conversaciones' });
  }
});

// ── Hilo completo (marca como leído) ─────────────────────────────────────────
router.get('/conversations/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const conversation = await prisma.whatsappConversation.findFirst({
      where: { id: req.params.id, restaurantId },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' });

    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 200));
    const [messages, contact] = await Promise.all([
      prisma.whatsappMessage.findMany({
        where: { conversationId: conversation.id, restaurantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, direction: true, type: true, body: true, sentBy: true, createdAt: true },
      }),
      prisma.whatsappContact.findUnique({
        where: { restaurantId_phone: { restaurantId, phone: conversation.phone } },
        select: { phone: true, name: true, orderCount: true, totalSpent: true, lastOrderAt: true, optIn: true },
      }),
    ]);

    if (conversation.unreadCount > 0) {
      await prisma.whatsappConversation.update({
        where: { id: conversation.id },
        data: { unreadCount: 0 },
      });
      conversation.unreadCount = 0;
    }

    res.json({
      conversation: serializeConversation(conversation, contact),
      messages: messages.reverse(), // cronológico ascendente para pintar el hilo
    });
  } catch (e) {
    console.error('[wa-inbox] conversation:', e.message);
    res.status(500).json({ error: 'Error al obtener la conversación' });
  }
});

// ── Responder como humano ─────────────────────────────────────────────────────
router.post('/conversations/:id/reply', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const message = String(req.body?.message || '').trim().slice(0, 4000);
    if (!message) return res.status(400).json({ error: 'Escribe un mensaje' });

    const conversation = await prisma.whatsappConversation.findFirst({
      where: { id: req.params.id, restaurantId },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' });

    if (!inbox.windowOpen(conversation.lastInboundAt)) {
      return res.status(409).json({
        error: 'La ventana de 24 horas cerró: WhatsApp solo permite responder con una plantilla aprobada. Espera a que el cliente vuelva a escribir.',
        code: 'WINDOW_EXPIRED',
      });
    }

    const integration = await prisma.integrationConfig.findFirst({
      where: { restaurantId, type: 'WHATSAPP', enabled: true },
    });
    if (!integration) {
      return res.status(409).json({ error: 'No hay integración de WhatsApp habilitada', code: 'NO_WHATSAPP' });
    }

    const cfg = provider.resolveConfig(integration);
    const sent = await provider.sendText(cfg, conversation.phone, message);
    if (!sent) return res.status(502).json({ error: 'El proveedor de WhatsApp rechazó el envío' });

    await inbox.recordOutbound(prisma, restaurantId, conversation.phone, message, { sentBy: 'HUMAN' });

    res.json({ ok: true });
  } catch (e) {
    console.error('[wa-inbox] reply:', e.message);
    res.status(500).json({ error: 'Error al enviar la respuesta' });
  }
});

// ── Cambiar estado del hilo ───────────────────────────────────────────────────
router.post('/conversations/:id/status', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const status = String(req.body?.status || '').toUpperCase();
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Estado inválido' });

    const conversation = await prisma.whatsappConversation.findFirst({
      where: { id: req.params.id, restaurantId },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' });

    const updated = await prisma.whatsappConversation.update({
      where: { id: conversation.id },
      data: {
        status,
        // Al resolver (o reabrir para el bot) se limpia el motivo de escalación.
        ...(status === 'NEEDS_HUMAN'
          ? { needsHumanReason: 'Marcada por el equipo desde el panel', escalatedAt: new Date() }
          : { needsHumanReason: null, escalatedAt: null }),
      },
    });

    res.json({ ok: true, conversation: serializeConversation(updated) });
  } catch (e) {
    console.error('[wa-inbox] status:', e.message);
    res.status(500).json({ error: 'Error al actualizar la conversación' });
  }
});

module.exports = router;
