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
