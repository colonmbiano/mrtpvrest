'use strict';

// Recibe alertas del worker del bot de WhatsApp (sesión perdida / QR requerido /
// auth_failure) y las reenvía por CORREO al dueño. El bot lo llama vía
// WHATSAPP_BOT_ALERT_WEBHOOK (POST con ?token=...). Público, así que va gateado
// por BOT_ALERT_TOKEN. Envía a BOT_ALERT_EMAIL usando Resend (utils/mailer).

const express = require('express');
const router = express.Router();
const { sendEmail } = require('../utils/mailer');

const QR_URL = 'https://whatsapp-bot-production-adfe.up.railway.app/qr';

// Throttle global: máx 1 correo/min (defensa ante spam si el token se filtra;
// el bot ya limita a 1/5min por tipo, así que no perdemos alertas reales).
let lastSentAt = 0;

router.post('/', async (req, res) => {
  const token = process.env.BOT_ALERT_TOKEN;
  if (!token || req.query.token !== token) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const to = process.env.BOT_ALERT_EMAIL;
  if (!to) return res.status(200).json({ ok: false, reason: 'BOT_ALERT_EMAIL no configurado' });
  if (Date.now() - lastSentAt < 60 * 1000) {
    return res.status(200).json({ ok: true, throttled: true });
  }
  lastSentAt = Date.now();

  // Contenido viene del propio bot (confiable). Se recorta por sanidad.
  const event = String(req.body?.event || 'alerta').replace(/[<>]/g, '').slice(0, 200);
  const detail = String(req.body?.detail || '').replace(/[<>]/g, '').slice(0, 500);
  const subject = `⚠️ Bot WhatsApp necesita atención: ${event}`;
  const html = `
    <div style="font-family:system-ui,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:8px">
      <h2 style="color:#dc2626;margin:0 0 12px">⚠️ Alerta del Bot de WhatsApp</h2>
      <p style="margin:0 0 8px"><strong>Evento:</strong> ${event}</p>
      ${detail ? `<p style="margin:0 0 8px"><strong>Detalle:</strong> ${detail}</p>` : ''}
      <p style="margin:12px 0">El bot necesita atención. Si pide reconectar, escanea el QR aquí:</p>
      <p><a href="${QR_URL}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">Abrir /qr para re-escanear</a></p>
      <p style="color:#888;font-size:12px;margin-top:16px">${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</p>
    </div>`;

  try {
    await sendEmail(to, subject, html);
    res.json({ ok: true });
  } catch (e) {
    console.error('[bot-alert] error enviando correo:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
