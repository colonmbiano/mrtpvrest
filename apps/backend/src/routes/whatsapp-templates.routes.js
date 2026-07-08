// whatsapp-templates.routes.js — Plantillas de mensaje de WhatsApp (Meta).
//
// Fuera de la ventana de 24h, la API oficial solo permite iniciar conversación
// con una plantilla APROBADA por Meta. Estas rutas administran las plantillas
// del WABA del restaurante directo contra la Graph API, sin salir del panel:
//
//   GET    /            → listar plantillas con su estado (APPROVED/PENDING/REJECTED)
//   POST   /            → crear una plantilla (categoría UTILITY/MARKETING)
//   DELETE /:name       → eliminar una plantilla por nombre
//
// Requiere proveedor META con `wabaId` y token en IntegrationConfig WHATSAPP.
// Con Whapi no aplica (no usa plantillas): respondemos 409 NOT_META y el panel
// lo explica. Todos los endpoints admin + scoped al restaurante del token.

const express = require('express');
const axios = require('axios');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const provider = require('../services/whatsapp-bot/provider');
const router = express.Router();

function rid(req) {
  return req.user?.restaurantId || req.restaurantId || null;
}

const VALID_CATEGORIES = ['UTILITY', 'MARKETING'];
const VALID_LANGUAGES = ['es_MX', 'es', 'es_AR', 'es_ES', 'en_US'];

// Resuelve credenciales Meta del restaurante o responde el error adecuado.
// Devuelve null si ya respondió.
async function resolveMeta(req, res) {
  const restaurantId = rid(req);
  if (!restaurantId) {
    res.status(400).json({ error: 'Restaurante no identificado' });
    return null;
  }
  const integration = await prisma.integrationConfig.findFirst({
    where: { restaurantId, type: 'WHATSAPP', enabled: true },
  });
  if (!integration) {
    res.status(409).json({ error: 'No hay integración de WhatsApp habilitada', code: 'NO_WHATSAPP' });
    return null;
  }
  const cfg = provider.resolveConfig(integration);
  let parsed = {};
  try { parsed = integration.config ? JSON.parse(integration.config) : {}; } catch { parsed = {}; }
  const wabaId = String(parsed.wabaId || '').trim();

  if (cfg.provider !== 'META' || !wabaId || !cfg.token) {
    res.status(409).json({
      error: 'Las plantillas requieren la API oficial de Meta (WhatsApp Cloud API) con WABA ID y token configurados en Integraciones.',
      code: 'NOT_META',
    });
    return null;
  }
  return { token: cfg.token, wabaId, graphUrl: provider.META_GRAPH_URL };
}

function graphError(res, err, fallback) {
  const detail = err.response?.data?.error;
  console.error('[wa-templates]', fallback, detail || err.message);
  // Meta manda mensajes útiles (nombre duplicado, formato inválido...): re-exponerlos.
  return res.status(err.response?.status === 400 ? 400 : 502).json({
    error: detail?.error_user_msg || detail?.message || fallback,
  });
}

// ── Listar ───────────────────────────────────────────────────────────────────
router.get('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const meta = await resolveMeta(req, res);
    if (!meta) return;

    const { data } = await axios.get(`${meta.graphUrl}/${meta.wabaId}/message_templates`, {
      params: { fields: 'id,name,status,category,language,components', limit: 100 },
      headers: { Authorization: `Bearer ${meta.token}` },
      timeout: 15000,
    });

    const templates = (data.data || []).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status, // APPROVED | PENDING | REJECTED | ...
      category: t.category,
      language: t.language,
      bodyText: t.components?.find((c) => c.type === 'BODY')?.text || '',
      footerText: t.components?.find((c) => c.type === 'FOOTER')?.text || null,
    }));

    res.json({ templates });
  } catch (e) {
    if (res.headersSent) return;
    return graphError(res, e, 'Error al obtener plantillas de Meta');
  }
});

// ── Crear ────────────────────────────────────────────────────────────────────
router.post('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const meta = await resolveMeta(req, res);
    if (!meta) return;

    // Nombre estilo Meta: minúsculas, números y guiones bajos.
    const name = String(req.body?.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);
    const category = VALID_CATEGORIES.includes(req.body?.category) ? req.body.category : 'UTILITY';
    const language = VALID_LANGUAGES.includes(req.body?.language) ? req.body.language : 'es_MX';
    const bodyText = String(req.body?.bodyText || '').trim().slice(0, 1024);
    const footerText = String(req.body?.footerText || '').trim().slice(0, 60);

    if (!name) return res.status(400).json({ error: 'Ponle un nombre a la plantilla (minúsculas y guiones bajos)' });
    if (!bodyText) return res.status(400).json({ error: 'Escribe el cuerpo del mensaje' });

    const components = [{ type: 'BODY', text: bodyText }];
    if (footerText) components.push({ type: 'FOOTER', text: footerText });
    // Variables {{1}}, {{2}}... exigen ejemplo para la revisión de Meta.
    const variables = bodyText.match(/\{\{\d+\}\}/g) || [];
    if (variables.length > 0) {
      components[0].example = { body_text: [variables.map((_, i) => `ejemplo ${i + 1}`)] };
    }

    const { data } = await axios.post(
      `${meta.graphUrl}/${meta.wabaId}/message_templates`,
      { name, category, language, components },
      { headers: { Authorization: `Bearer ${meta.token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    res.json({ ok: true, id: data.id || null, status: data.status || 'PENDING', name });
  } catch (e) {
    if (res.headersSent) return;
    return graphError(res, e, 'Error al crear la plantilla en Meta');
  }
});

// ── Eliminar ─────────────────────────────────────────────────────────────────
router.delete('/:name', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const meta = await resolveMeta(req, res);
    if (!meta) return;

    const name = String(req.params.name || '').trim().toLowerCase();
    if (!name) return res.status(400).json({ error: 'Nombre de plantilla inválido' });

    await axios.delete(`${meta.graphUrl}/${meta.wabaId}/message_templates`, {
      params: { name },
      headers: { Authorization: `Bearer ${meta.token}` },
      timeout: 15000,
    });

    res.json({ ok: true });
  } catch (e) {
    if (res.headersSent) return;
    return graphError(res, e, 'Error al eliminar la plantilla en Meta');
  }
});

module.exports = router;
