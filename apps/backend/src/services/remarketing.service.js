// remarketing.service.js — Campañas de WhatsApp a la base de clientes.
//
// Permite segmentar contactos (todos, inactivos, recientes, frecuentes) y
// enviarles un mensaje masivo usando la integración WHATSAPP del restaurante.
// Respeta el consentimiento (`optIn`) y registra `lastContactedAt`.

const { prisma } = require('@mrtpvrest/database');
const { resolveConfig, sendText } = require('./whatsapp-bot/provider');

const DAY_MS = 24 * 60 * 60 * 1000;

const SEGMENTS = ['ALL', 'INACTIVE', 'RECENT', 'FREQUENT'];

/**
 * Construye el filtro Prisma para un segmento. PURO (recibe `now`) para test.
 *   - ALL       → todos los que aceptan marketing.
 *   - INACTIVE  → sin pedidos en los últimos 30 días (incluye los que nunca).
 *   - RECENT    → con pedido en los últimos 7 días.
 *   - FREQUENT  → 3 o más pedidos.
 */
function buildSegmentWhere(restaurantId, segment, now = new Date()) {
  const base = { restaurantId, optIn: true };
  switch (segment) {
    case 'INACTIVE':
      return { ...base, OR: [{ lastOrderAt: null }, { lastOrderAt: { lt: new Date(now.getTime() - 30 * DAY_MS) } }] };
    case 'RECENT':
      return { ...base, lastOrderAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } };
    case 'FREQUENT':
      return { ...base, orderCount: { gte: 3 } };
    case 'ALL':
    default:
      return base;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Envía un mensaje a un segmento de contactos. No lanza por cada fallo de
 * envío (los contabiliza). Lanza solo si falta config/parámetros.
 * @returns {Promise<{ total:number, sent:number, failed:number, segment:string }>}
 */
async function sendCampaign({ restaurantId, segment = 'ALL', message, limit = 500, throttleMs = 150 }) {
  if (!restaurantId) {
    const e = new Error('restaurantId requerido'); e.code = 'BAD_REQUEST'; throw e;
  }
  if (!message || !String(message).trim()) {
    const e = new Error('El mensaje de la campaña no puede estar vacío'); e.code = 'BAD_REQUEST'; throw e;
  }
  const seg = SEGMENTS.includes(segment) ? segment : 'ALL';

  const integration = await prisma.integrationConfig.findFirst({
    where: { restaurantId, type: 'WHATSAPP', enabled: true },
  });
  if (!integration) {
    const e = new Error('El restaurante no tiene una integración de WhatsApp habilitada');
    e.code = 'NO_WHATSAPP'; throw e;
  }
  const cfg = resolveConfig(integration);
  if (!cfg.token) {
    const e = new Error('La integración de WhatsApp no tiene token configurado');
    e.code = 'NO_WHATSAPP'; throw e;
  }

  const contacts = await prisma.whatsappContact.findMany({
    where: buildSegmentWhere(restaurantId, seg),
    take: Math.max(1, Math.min(2000, limit)),
    orderBy: { lastOrderAt: 'desc' },
    select: { id: true, phone: true, name: true },
  });

  let sent = 0;
  let failed = 0;
  for (const c of contacts) {
    // Personalización simple: {nombre} → nombre del contacto.
    const body = String(message).replace(/\{nombre\}/gi, c.name || '');
    const ok = await sendText(cfg, c.phone, body);
    if (ok) {
      sent++;
      await prisma.whatsappContact.update({
        where: { id: c.id },
        data: { lastContactedAt: new Date() },
      }).catch(() => {});
    } else {
      failed++;
    }
    if (throttleMs > 0) await sleep(throttleMs);
  }

  return { total: contacts.length, sent, failed, segment: seg };
}

module.exports = { buildSegmentWhere, sendCampaign, SEGMENTS };
