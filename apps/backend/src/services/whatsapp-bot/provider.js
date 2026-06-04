// provider.js — Capa de transporte de WhatsApp para el chatbot.
//
// Normaliza los webhooks ENTRANTES de distintos proveedores a una forma común
// y envía mensajes SALIENTES con el token del restaurante (BYOK) o, como
// fallback, el token de plataforma en env.
//
// Proveedores soportados:
//   - WHAPI (gate.whapi.cloud)  ← default, consistente con las notificaciones
//     salientes que ya usa el sistema (notifications.service.js).
//   - META  (WhatsApp Cloud API, graph.facebook.com)
//
// La config por restaurante vive en IntegrationConfig (type='WHATSAPP') como
// JSON: { provider?, token, phoneNumberId?, apiUrl?, verifyToken? }.

const axios = require('axios');
const { decryptSecret } = require('../../lib/secret-crypto');

const WHAPI_DEFAULT_URL = 'https://gate.whapi.cloud';
const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

// Un secreto puede estar cifrado (formato `ivHex:tagHex:dataHex`) o en claro.
// Detectamos el formato y desciframos solo si aplica.
function readSecret(value) {
  if (!value || typeof value !== 'string') return value || null;
  const looksEncrypted = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i.test(value);
  if (!looksEncrypted) return value;
  try {
    const plain = decryptSecret(value);
    return plain || value;
  } catch {
    return value;
  }
}

// Solo dígitos (E.164 sin '+'). Acepta "5215512345678@s.whatsapp.net".
function toDigits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * Lee y descifra la configuración de WhatsApp de un restaurante.
 * @returns {{ provider:string, token:string|null, phoneNumberId:string|null, apiUrl:string, verifyToken:string|null }}
 */
function resolveConfig(integration) {
  let parsed = {};
  try {
    parsed = integration?.config ? JSON.parse(integration.config) : {};
  } catch {
    parsed = {};
  }

  const provider = String(parsed.provider || 'WHAPI').toUpperCase();
  const token = readSecret(parsed.token) || process.env.WHATSAPP_TOKEN || null;
  const verifyToken = parsed.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || null;
  const phoneNumberId = parsed.phoneNumberId || null;
  const apiUrl = parsed.apiUrl
    || (provider === 'META' ? META_GRAPH_URL : process.env.WHATSAPP_API_URL || WHAPI_DEFAULT_URL);

  return { provider, token, phoneNumberId, apiUrl, verifyToken };
}

/**
 * Normaliza el body de un webhook entrante a una lista de mensajes comunes.
 * Ignora eventos que no son mensajes de usuario (status, ack, mensajes propios).
 * @returns {Array<{ id, from, fromName, type:'text'|'location'|'other', text, location:{lat,lng}|null }>}
 */
function normalizeInbound(body) {
  if (!body || typeof body !== 'object') return [];

  // ── Formato META (WhatsApp Cloud API) ──────────────────────────────────
  if (body.object === 'whatsapp_business_account' && Array.isArray(body.entry)) {
    const out = [];
    for (const entry of body.entry) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const contacts = value.contacts || [];
        for (const m of value.messages || []) {
          const contact = contacts.find((c) => c.wa_id === m.from);
          out.push(normalizeOne({
            id: m.id,
            from: m.from,
            fromName: contact?.profile?.name || null,
            type: m.type,
            textBody: m.text?.body,
            location: m.location
              ? { lat: m.location.latitude, lng: m.location.longitude }
              : null,
          }));
        }
      }
    }
    return out.filter(Boolean);
  }

  // ── Formato WHAPI ───────────────────────────────────────────────────────
  if (Array.isArray(body.messages)) {
    return body.messages
      .filter((m) => !m.from_me) // ignorar mensajes enviados por nosotros mismos
      .map((m) =>
        normalizeOne({
          id: m.id,
          from: m.chat_id || m.from,
          fromName: m.from_name || null,
          type: m.type,
          textBody: m.text?.body,
          location: m.location
            ? { lat: m.location.latitude, lng: m.location.longitude }
            : null,
        })
      )
      .filter(Boolean);
  }

  return [];
}

function normalizeOne({ id, from, fromName, type, textBody, location }) {
  const phone = toDigits(from);
  if (!phone) return null;
  if (type === 'location' && location && location.lat != null && location.lng != null) {
    return { id, from: phone, fromName, type: 'location', text: '', location };
  }
  if (type === 'text' && textBody != null) {
    return { id, from: phone, fromName, type: 'text', text: String(textBody), location: null };
  }
  // Tipos no soportados (imagen, audio, sticker...) → marcador para reprompt.
  return { id, from: phone, fromName, type: 'other', text: '', location: null };
}

/**
 * Envía un mensaje de texto al cliente usando el proveedor del restaurante.
 * Best-effort: no lanza (loguea y sigue) para no romper el flujo del webhook.
 */
async function sendText(cfg, toPhone, body) {
  const phone = toDigits(toPhone);
  if (!cfg?.token) {
    console.warn('[wa-bot] sin token de WhatsApp configurado — no se envía respuesta');
    return false;
  }
  if (!phone || !body) return false;

  try {
    if (cfg.provider === 'META') {
      if (!cfg.phoneNumberId) {
        console.warn('[wa-bot] META requiere phoneNumberId — no se envía');
        return false;
      }
      await axios.post(
        `${cfg.apiUrl}/${cfg.phoneNumberId}/messages`,
        { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body } },
        { headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' }, timeout: 10000 }
      );
    } else {
      // WHAPI
      await axios.post(
        `${cfg.apiUrl}/messages/text`,
        { to: `${phone}@s.whatsapp.net`, body },
        { headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' }, timeout: 10000 }
      );
    }
    return true;
  } catch (err) {
    console.error('[wa-bot] error enviando mensaje:', err.response?.data || err.message);
    return false;
  }
}

module.exports = {
  resolveConfig,
  normalizeInbound,
  sendText,
  toDigits,
  WHAPI_DEFAULT_URL,
  META_GRAPH_URL,
};
