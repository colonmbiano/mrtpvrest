// whatsapp-webhook.routes.js — Webhook público del chatbot de WhatsApp.
//
// Montado SIN tenantMiddleware (igual que kiosk-webhook): el proveedor de
// WhatsApp no manda x-restaurant-id. El restaurante se resuelve por el
// :restaurantId de la URL, que cada cliente configura como su webhook en su
// panel de Whapi / Meta:
//
//   https://api.mrtpvrest.com/api/whatsapp/webhook/<restaurantId>
//
// El procesamiento de mensajes es asíncrono: respondemos 200 de inmediato
// (los proveedores reintentan si no ven 200 a tiempo) y el bot trabaja en
// segundo plano.

const express = require('express');
const router = express.Router();
const { prisma } = require('@mrtpvrest/database');
const bot = require('../services/whatsapp-bot');

// ── GET — verificación de webhook estilo Meta (hub.challenge) ────────────────
router.get('/:restaurantId', async (req, res) => {
  try {
    const integration = await prisma.integrationConfig.findFirst({
      where: { restaurantId: req.params.restaurantId, type: 'WHATSAPP', enabled: true },
    });
    if (integration) {
      const challenge = bot.verifyMetaChallenge(req.query, integration);
      if (challenge) return res.status(200).send(String(challenge));
    }
    // Fallback al verify token global de plataforma.
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && challenge && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(String(challenge));
    }
    return res.sendStatus(403);
  } catch (err) {
    console.error('[wa-webhook] GET verify error:', err.message);
    return res.sendStatus(403);
  }
});

// ── POST — recepción de mensajes ─────────────────────────────────────────────
router.post('/:restaurantId', (req, res) => {
  const { restaurantId } = req.params;
  const body = req.body;
  const io = req.app.get('io');

  // Ack inmediato — el bot procesa en segundo plano.
  res.status(200).json({ received: true });

  bot.handleWebhook({ restaurantId, body, io }).catch((err) => {
    console.error('[wa-webhook] handleWebhook error:', err);
  });
});

module.exports = router;
