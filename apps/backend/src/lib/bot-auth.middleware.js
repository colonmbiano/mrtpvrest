'use strict';

// Auth del bot de WhatsApp en modo API-only (Fase 2 SaaS). El bot NO toca la BD ni
// tiene DATABASE_URL/JWT_SECRET: se autentica con un token por-tenant y opera
// SOLO contra los endpoints /api/bot/* (scope de UN restaurante).
//
// Token: "bt_<restaurantId>.<secret>". Se guarda solo el hash (sha256 del secret)
// en IntegrationConfig.config.botTokenHash. El prefijo trae el restaurantId → la
// verificación es O(1) (findUnique de esa fila) y no hay que iterar. Revocable al
// instante rotando el token (cambia el hash). Ver docs/whatsapp-bot-saas-plan.md §9.

const crypto = require('crypto');
const { prisma } = require('@mrtpvrest/database');

const WA_ASSISTANT_TYPE = 'WHATSAPP_ASSISTANT';

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

// Genera un token nuevo para un tenant. Devuelve el token EN CLARO (se muestra una
// sola vez, va al env del bot como WHATSAPP_BOT_TOKEN) y su hash (lo que se guarda).
function generateBotToken(restaurantId) {
  const secret = crypto.randomBytes(32).toString('hex');
  return { token: `bt_${restaurantId}.${secret}`, hash: sha256(secret) };
}

function parseBotToken(raw) {
  if (!raw || !raw.startsWith('bt_')) return null;
  const body = raw.slice(3);
  const dot = body.indexOf('.');
  if (dot < 1) return null;
  const restaurantId = body.slice(0, dot);
  const secret = body.slice(dot + 1);
  if (!restaurantId || !secret) return null;
  return { restaurantId, secret };
}

async function botAuth(req, res, next) {
  try {
    const hdr = String(req.headers['authorization'] || '');
    const raw = hdr.startsWith('Bearer ')
      ? hdr.slice(7).trim()
      : String(req.headers['x-bot-token'] || '').trim();
    const parsed = parseBotToken(raw);
    if (!parsed) return res.status(401).json({ error: 'Token de bot requerido' });

    const row = await prisma.integrationConfig.findUnique({
      where: { restaurantId_type: { restaurantId: parsed.restaurantId, type: WA_ASSISTANT_TYPE } },
      select: { config: true, enabled: true },
    });
    let cfg = {};
    try { cfg = row?.config ? JSON.parse(row.config) : {}; } catch { cfg = {}; }
    const stored = cfg.botTokenHash;
    if (!stored) return res.status(401).json({ error: 'Bot no provisionado' });

    // Comparación en tiempo constante (evita timing attacks sobre el hash).
    const a = Buffer.from(sha256(parsed.secret));
    const b = Buffer.from(String(stored));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Token de bot inválido' });
    }

    req.restaurantId = parsed.restaurantId;
    req.botAuthed = true;
    req.botConfig = cfg;
    req.botEnabled = row.enabled !== false;
    next();
  } catch (e) {
    console.error('botAuth error:', e?.message || e);
    res.status(500).json({ error: 'Error de autenticación del bot' });
  }
}

module.exports = { botAuth, generateBotToken, sha256, WA_ASSISTANT_TYPE };
