'use strict';

// Resumen diario del bot de WhatsApp por correo. Reusa el servicio de métricas
// y el mailer (Resend). Se envía a BOT_ALERT_EMAIL. No-op si no está configurado
// (BOT_ALERT_EMAIL o la allowlist de restaurantes vacías).

const cron = require('node-cron');
const { prisma } = require('@mrtpvrest/database');
const { computeBotMetrics, renderMetricsHtml, defaultRestaurantId } = require('../services/whatsapp-bot-metrics.service');
const { sendEmail } = require('../utils/mailer');

async function sendDailyReport() {
  const to = process.env.BOT_ALERT_EMAIL;
  const restaurantId = defaultRestaurantId();
  if (!to || !restaurantId) return; // apagado si falta config
  try {
    const m = await computeBotMetrics(restaurantId);
    const rest = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }).catch(() => null);
    const html = renderMetricsHtml(m, rest?.name);
    await sendEmail(to, `📊 Resumen diario Bot WhatsApp${rest?.name ? ` · ${rest.name}` : ''}`, html);
    console.log('[bot-report] resumen diario enviado a', to);
  } catch (e) {
    console.error('[bot-report] error:', e.message);
  }
}

function startWhatsappBotReportJob() {
  // Diario a las 22:00 hora de México (configurable con BOT_REPORT_CRON).
  cron.schedule(process.env.BOT_REPORT_CRON || '0 22 * * *', sendDailyReport, {
    scheduled: true,
    timezone: 'America/Mexico_City',
  });
  console.log('[bot-report] resumen diario del bot programado (22:00 MX)');
}

module.exports = { startWhatsappBotReportJob, sendDailyReport };
