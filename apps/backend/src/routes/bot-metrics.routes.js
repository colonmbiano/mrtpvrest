'use strict';

// Tablero de métricas del bot de WhatsApp. GET /api/bot-metrics?token=...
// Devuelve HTML (o JSON con &format=json). Gateado por BOT_METRICS_TOKEN.
// Restaurante: ?r=<id> o, por defecto, el primero de LOYALTY_MILESTONE_RESTAURANT_IDS.

const express = require('express');
const router = express.Router();
const { prisma } = require('@mrtpvrest/database');
const { computeBotMetrics, renderMetricsHtml, defaultRestaurantId } = require('../services/whatsapp-bot-metrics.service');

router.get('/', async (req, res) => {
  const token = process.env.BOT_METRICS_TOKEN;
  if (!token || req.query.token !== token) return res.status(403).json({ error: 'forbidden' });

  const restaurantId = req.query.r || defaultRestaurantId();
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId requerido (?r=)' });

  try {
    const m = await computeBotMetrics(restaurantId);
    if (req.query.format === 'json') return res.json(m);
    const rest = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }).catch(() => null);
    res.set('Content-Type', 'text/html; charset=utf-8').send(renderMetricsHtml(m, rest?.name));
  } catch (e) {
    console.error('[bot-metrics] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
