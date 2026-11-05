const { Client, LocalAuth } = require('whatsapp-web.js');
const crypto = require('crypto');
const { validateModelReply, conversationReply, missingOrderData } = require('./responsePolicy');
const { followupIntent, followupReply } = require('./orderFollowup');
const { getStateStore } = require('./stateStore');
const { createOutbox } = require('./outbox');
const { readGroup, normalizedName } = require('./ignoredGroup');
const { processWhatsAppMessage } = require('./gemini');
const { isExplicitConfirmation, updateSession, applyFacts, SESSION_TTL } = require('./orderConversation');
const { createOrderFromGemini, chatRefFor, normalizeCustomerPhone } = require('./orderProcessor');
const { isAudioMessage, transcribeWhatsAppAudio } = require('./audioTranscription');
const { prisma } = require('@mrtpvrest/database');
const botConfig = require('./botConfig');
const botApi = require('./botApi');

let whatsappClient = null;

// Último QR emitido (string). Lo usa el worker de Railway para exponerlo en un
// endpoint HTTP y poder escanearlo sin depender de los logs. Se limpia al
// conectar ('ready') o al autenticar.
let latestQr = null;

// Estado REAL de la sesión (client.info queda rancio tras desconectar, así que
// no sirve para saber si el bot está vivo). Lo usa /livez del worker para que un
// monitor externo (UptimeRobot) avise si el bot necesita atención.
// 'connecting' → arrancando | 'qr' → esperando escaneo | 'ready' → operando |
// 'lost' → sesión caída (antes de reiniciar).
let sessionState = 'connecting';

// Momento (ms) en que el bot terminó de conectar, cargar config/grupos y pasar
// el enfriamiento de sincronización inicial. NINGÚN mensaje previo a este
// instante (ni durante la fase connecting/qr) se procesa jamás.
let lastReadyAt = 0;
// Enfriamiento tras 'ready': al escanear QR o reconectar, WhatsApp Web vuelca
// decenas de eventos 'message' del historial durante los primeros segundos.
const POST_READY_SYNC_COOLDOWN_MS = 15 * 1000;
const MAX_MSG_AGE_MS = 90 * 1000;
// Cortafuegos global de salida: impide enviar a >3 chats distintos en 10s o >6 envíos/min total.
const stateStore = getStateStore();
let outbox = null;
let inFlight = 0;

// Alerta best-effort al dueño cuando el bot necesita atención (sesión perdida /
// QR requerido). Se dispara a un webhook configurable WHATSAPP_BOT_ALERT_WEBHOOK
// (Slack/Discord/Telegram/n8n). Throttled por tipo para no spamear con el QR que
// rota. Si la env no está seteada, no hace nada.
const alertThrottle = new Map();
async function notifyAlert(event, detail) {
  const url = process.env.WHATSAPP_BOT_ALERT_WEBHOOK;
  const token = process.env.BOT_ALERT_TOKEN;
  if (!url || !token) return;
  const now = Date.now();
  if (now - (alertThrottle.get(event) || 0) < 5 * 60 * 1000) return; // máx 1/5min por tipo
  alertThrottle.set(event, now);
  const text = `⚠️ Bot WhatsApp (${process.env.WHATSAPP_BOT_RESTAURANT_ID || 'restaurante'}): ${event}${detail ? ` — ${detail}` : ''}`;
  try {
    const endpoint = new URL(url);
    endpoint.searchParams.delete('token');
    await fetch(endpoint.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      // text=Slack, content=Discord: cubre ambos sin configurar.
      body: JSON.stringify({ text, content: text, event, detail: String(detail || '') }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.error('[WhatsApp Bot] No se pudo enviar alerta:', e?.message || e);
  }
}

// Mapa para guardar el historial corto de conversaciones por número
// Formato: { "5215551234567": [ { role: "user", text: "hola" }, { role: "model", text: "Hola soy el mesero" } ] }
const chatHistory = new Map();
const customerProfiles = new Map();
const MAX_HISTORY_MESSAGES = 12;

// Mapa para guardar órdenes recientes confirmadas por número. Permite añadir items.
// Formato: { "5215551234567": { orderId: "abc", timestamp: 123456789 } }
const recentOrders = new Map();
// Throttle de la REHIDRATACIÓN desde BD (GET /api/bot/chat-order): cuando un
// chat escribe y no hay entrada en recentOrders (restart del bot o ventana
// vencida), se consulta el backend una vez y no de nuevo por 3 min — evita un
// GET por CADA mensaje de chats sin pedido. Formato: { chatRef: ms }.
const chatOrderLookups = new Map();
const CHAT_ORDER_LOOKUP_TTL_MS = 3 * 60 * 1000;
const recentOrderChats = new Map();
const humanHandoffs = new Map();
const botOutgoingIntents = new Map();
const botSentMessages = new Map();
const seenInbound = new Map();
const pendingDrafts = new Map();
const orderSessions = new Map();
// Staff summaries wait for the next inbound message, keyed by exact chat ID.
const resumeContexts = new Map();
const saved = stateStore.get('conversations', {});
const persistedMaps = { chatHistory, customerProfiles, recentOrders, recentOrderChats, humanHandoffs, seenInbound, pendingDrafts, orderSessions, resumeContexts };
if (Date.now() - (saved.savedAt || 0) < 6 * 60 * 60 * 1000) {
  for (const [name, map] of Object.entries(persistedMaps)) {
    for (const [key, value] of (saved[name] || [])) map.set(key, value);
  }
}
function saveConversations() {
  stateStore.set('conversations', { savedAt: Date.now(), ...Object.fromEntries(Object.entries(persistedMaps).map(([key, map]) => [key, [...map]])) });
}
// Anti-spam / anti-baneo: último texto enviado por chat { chatKey: {text, at} }.
// safeSend lo usa para NO reenviar el mismo mensaje al mismo chat en una ventana
// corta (evita ráfagas de idénticos que disparan el bloqueo de whatsapp-web.js).
const lastBotSendByChat = new Map();
const HUMAN_HANDOFF_MS = parseInt(process.env.WHATSAPP_HUMAN_HANDOFF_MIN || '2', 10) * 60 * 1000;
const BOT_OUTGOING_INTENT_MS = 2 * 60 * 1000;
const PROFILE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 días: perfiles inactivos se purgan

// Rate-limit por remitente: corta ráfagas (un troll, o un loop bot-contra-bot).
// Al exceder se IGNORA en silencio — responder alimentaría el loop, y al dejar
// de responder el ping-pong se muere. Ventanas: 10/min y 60/hora por número.
const rateBuckets = new Map(); // phone → number[] (timestamps ms)
function allowMessage(phone) {
  const now = Date.now();
  const arr = (rateBuckets.get(phone) || []).filter(t => now - t < 60 * 60 * 1000);
  arr.push(now);
  rateBuckets.set(phone, arr);
  const lastMin = arr.filter(t => now - t < 60 * 1000).length;
  return lastMin <= 10 && arr.length <= 60;
}
// Limpieza periódica para que rateBuckets no crezca sin límite.
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of rateBuckets.entries()) {
    const keep = arr.filter(t => now - t < 60 * 60 * 1000);
    if (keep.length === 0) rateBuckets.delete(k); else rateBuckets.set(k, keep);
  }
}, 10 * 60 * 1000).unref?.();

// Red de seguridad: aunque el prompt le prohíbe a Gemini mostrar los IDs
// internos, a veces los copia al texto (clientes reales vieron
// "PROMO kfc 2 X 110: $110 (ID: cmpvrw5xl...)"). Se limpian SIEMPRE antes
// de enviar: tokens [ID: x]/(ID: x)/[V: x]/[M: x]/variantId/modifierId, @G... y cuids sueltos.
function sanitizeReply(text) {
  return String(text)
    .replace(/\s*[\[(]\s*(?:ID|variantId|modifierId|V|M)\s*:\s*[^\])]+[\])]/gi, '')
    .replace(/\s*@G\d+\b/g, '')
    .replace(/\bcomplement:[a-z0-9]+\b/gi, '')
    .replace(/\bcm[a-z0-9]{20,}\b/g, '')
    .replace(/[ \t]{2,}/g, ' ');
}

function isValidPhoneNumber(phone) {
  return /^\d{10,14}$/.test(String(phone || '').replace(/\D/g, ''));
}

function extractPhoneFromText(text) {
  // Coordenadas GPS NO son teléfonos: del mensaje sintético "[...latitud
  // 19.1772226, longitud -100.2112801]" el run "100.2112801" daba 10 dígitos
  // y acababa como customerPhone del pedido (y del CRM) — auditoría 2026-07-05:
  // 3 contactos con lat/lng como teléfono. Se quitan los decimales ANTES.
  const clean = String(text || '').replace(/-?\d{1,3}\.\d{4,}/g, ' ');
  const match = clean.match(/(?:\+?\d[\d\s().-]{8,}\d)/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, '');
  return isValidPhoneNumber(digits) ? digits : null;
}

function updateCustomerProfile(phone, patch = {}) {
  const current = customerProfiles.get(phone) || {};
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && value !== undefined && String(value).trim?.() !== '') next[key] = value;
  }
  next.updatedAt = Date.now();
  customerProfiles.set(phone, next);
  return next;
}

function pruneHistory(history) {
  if (history.length > MAX_HISTORY_MESSAGES) {
    history.splice(0, history.length - MAX_HISTORY_MESSAGES);
  }
}

// Lista negra: números que el bot NO debe contestar (staff, proveedores,
// contactos que atiendes a mano). Se configuran en WHATSAPP_BOT_IGNORE_NUMBERS
// (separados por coma) y se comparan por los ÚLTIMOS 10 DÍGITOS (tolera lada
// 52/521 y formatos varios). Se lee por-mensaje para que un cambio de la
// variable aplique con solo reiniciar (sin tocar código).
function last10Digits(s) { return String(s || '').replace(/\D/g, '').slice(-10); }

function chatKeyForMessage(msg) {
  return msg?.fromMe ? (msg.to || msg.from || '') : (msg.from || msg.to || '');
}

function isCustomerChatId(chatId) {
  return !!chatId &&
    !chatId.includes('@g.us') &&
    chatId !== 'status@broadcast' &&
    !chatId.includes('@broadcast') &&
    !chatId.includes('@newsletter');
}

function phoneHandoffKey(phone) {
  const p = last10Digits(phone);
  return p.length >= 10 ? `phone:${p}` : null;
}

function rememberRecentOrderChat(chatKey, phone, orderId) {
  if (!chatKey) return;
  recentOrderChats.set(chatKey, { phone, orderId, timestamp: Date.now() });
}

function cleanupExpiredHandoffs() {
  const now = Date.now();
  for (const [key, entry] of humanHandoffs.entries()) {
    if (!entry?.until || entry.until <= now) humanHandoffs.delete(key);
  }
}

function pauseBotForChat(chatKey, phone, reason = 'human_message_after_order') {
  const until = Date.now() + HUMAN_HANDOFF_MS;
  const entry = { phone, reason, until };
  if (chatKey) humanHandoffs.set(chatKey, entry);
  const phoneKey = phoneHandoffKey(phone);
  if (phoneKey) humanHandoffs.set(phoneKey, entry);
  for (const key of new Set([phone, chatKey?.split('@')[0]].filter(Boolean))) {
    pendingDrafts.delete(key);
    orderSessions.delete(key);
  }
  saveConversations();
  return entry;
}

function unpauseBotForChat(chatKey, phone) {
  let cleared = false;
  if (chatKey && humanHandoffs.has(chatKey)) {
    humanHandoffs.delete(chatKey);
    cleared = true;
  }
  const phoneKey = phoneHandoffKey(phone);
  if (phoneKey && humanHandoffs.has(phoneKey)) {
    humanHandoffs.delete(phoneKey);
    cleared = true;
  }
  if (cleared) saveConversations();
  return cleared;
}

function getActiveHandoff(chatKey, phone) {
  cleanupExpiredHandoffs();
  const phoneKey = phoneHandoffKey(phone);
  return humanHandoffs.get(chatKey) || (phoneKey ? humanHandoffs.get(phoneKey) : null) || null;
}

function messageId(msg) {
  return msg?.id?._serialized || msg?.id?.id || null;
}

function normalizeOutgoingBody(body) {
  return String(body || '').replace(/\s+/g, ' ').trim().slice(0, 400);
}

function outgoingIntentKey(chatKey, body) {
  return `${chatKey || ''}::${normalizeOutgoingBody(body)}`;
}

function rememberBotOutgoingIntent(chatKey, body) {
  if (!chatKey) return;
  const now = Date.now();
  botOutgoingIntents.set(outgoingIntentKey(chatKey, body), now);
  botOutgoingIntents.set(`any::${normalizeOutgoingBody(body)}`, now);
  botOutgoingIntents.set(`chat::${chatKey}`, now);
}

function rememberBotSentMessage(msg) {
  const id = messageId(msg);
  if (id) botSentMessages.set(id, Date.now());
  if (msg?.id?.id) botSentMessages.set(msg.id.id, Date.now());
}

function isWhatsAppBusinessAutoMessage(body) {
  const b = String(body || '').toLowerCase();
  if (!b) return false;
  return (
    b.includes('haz tu pedido directo en nuestra tienda en línea') ||
    b.includes('haz tu pedido directo en nuestra tienda en linea') ||
    b.includes('master-burguer-s.mrtpvrest.com') ||
    b.includes('soy tu asistente virtual') ||
    b.includes('bienvenido a master burguer') ||
    b.includes('bienvenido a master burger') ||
    b.includes('en este momento tengo mucha demanda') ||
    b.includes('recibí tu comprobante') ||
    b.includes('*¡pedido confirmado!*')
  );
}

function isBotAuthoredOutgoing(msg, chatKey) {
  const id = messageId(msg);
  if (id && botSentMessages.has(id)) return true;
  if (msg?.id?.id && botSentMessages.has(msg.id.id)) return true;
  if (isWhatsAppBusinessAutoMessage(msg?.body)) return true;

  const now = Date.now();
  const key = outgoingIntentKey(chatKey, msg?.body);
  const timestamp = botOutgoingIntents.get(key);
  if (!timestamp) return false;
  if (now - timestamp > BOT_OUTGOING_INTENT_MS) {
    botOutgoingIntents.delete(key);
    return false;
  }
  return true;
}

setInterval(() => {
  const now = Date.now();
  cleanupExpiredHandoffs();
  for (const [key, timestamp] of botOutgoingIntents.entries()) {
    if (now - timestamp > BOT_OUTGOING_INTENT_MS) botOutgoingIntents.delete(key);
  }
  for (const [key, timestamp] of botSentMessages.entries()) {
    if (now - timestamp > BOT_OUTGOING_INTENT_MS) botSentMessages.delete(key);
  }
  for (const [key, entry] of recentOrderChats.entries()) {
    if (!entry?.timestamp || now - entry.timestamp > HUMAN_HANDOFF_MS) recentOrderChats.delete(key);
  }
  // Perfiles de cliente: purgar inactivos para que el Map no crezca sin límite.
  for (const [key, entry] of customerProfiles.entries()) {
    if (!entry?.updatedAt || now - entry.updatedAt > PROFILE_TTL_MS) customerProfiles.delete(key);
  }
}, 10 * 60 * 1000).unref?.();

function isIgnoredNumber(phone) {
  const p = last10Digits(phone);
  if (p.length < 10) return false;
  // Lista editable desde el admin (BD, fallback a env). Ver botConfig.js.
  const list = botConfig.getIgnoreNumbers()
    .map(last10Digits).filter(d => d.length >= 10);
  return list.includes(p);
}

// ── Ignorar por GRUPO ────────────────────────────────────────────────────────
// WHATSAPP_BOT_IGNORE_GROUP_NAME = nombre de un grupo (p.ej. "Master Burguers
// works"). El bot carga sus miembros y no responde a ninguno. Se refresca solo,
// así que agregar/quitar a alguien del grupo lo activa/desactiva sin tocar nada.
// Guardamos DOS llaves por miembro para casar tanto @lid como @c.us: el id
// serializado y los últimos 10 dígitos del "user".
const groupSnapshot = stateStore.get('ignoredGroup', {});
let ignoredGroup = { name: null, count: 0, loadedAt: 0, error: null, ...groupSnapshot, ids: new Set(groupSnapshot.ids || []), phones: new Set(groupSnapshot.phones || []) };
function exclusionsReady() {
  const name = botConfig.getIgnoreGroupName();
  return !name || (normalizedName(name) === normalizedName(ignoredGroup.name) && ignoredGroup.count > 0 && Date.now() - ignoredGroup.loadedAt < 24 * 60 * 60000);
}
async function refreshIgnoredGroup() {
  const name = botConfig.getIgnoreGroupName();
  if (!name) { ignoredGroup = { name: null, ids: new Set(), phones: new Set(), count: 0, loadedAt: Date.now(), error: null }; return; }
  if (!whatsappClient) return;
  try {
    const result = await readGroup(whatsappClient, name);
    ignoredGroup = { ...result, ids: new Set(result.ids), phones: new Set(result.phones), name, loadedAt: Date.now(), error: null };
    stateStore.set('ignoredGroup', { ...ignoredGroup, ids: [...ignoredGroup.ids], phones: [...ignoredGroup.phones] });
    console.log('[WhatsApp Bot] Exclusiones cargadas: ' + ignoredGroup.count + ' miembros.');
  } catch (error) {
    ignoredGroup.error = error.message;
    console.error('[WhatsApp Bot] No se pudo actualizar el grupo excluido:', error.message);
    if (!exclusionsReady()) notifyAlert('Respuestas pausadas: falta cargar exclusiones del equipo', null);
  }
}

// ¿El remitente pertenece al grupo ignorado? Casa por id serializado (msg.from o
// el id del contacto) o por los últimos 10 dígitos del teléfono resuelto.
function isInIgnoredGroup(msgFrom, contactId, phone) {
  if (ignoredGroup.ids.size === 0 && ignoredGroup.phones.size === 0) return false;
  if (msgFrom && ignoredGroup.ids.has(msgFrom)) return true;
  if (contactId && ignoredGroup.ids.has(contactId)) return true;
  const p = last10Digits(phone);
  return p.length >= 10 && ignoredGroup.phones.has(p);
}

function getIgnoredGroupInfo() {
  return {
    name: ignoredGroup.name,
    count: ignoredGroup.count,
    ids: ignoredGroup.ids.size,
    phones: ignoredGroup.phones.size,
    loadedAt: ignoredGroup.loadedAt,
    error: ignoredGroup.error,
    availableGroups: ignoredGroup.availableGroups || undefined,
    sampleIds: Array.from(ignoredGroup.ids).slice(0, 5),
    samplePhones: Array.from(ignoredGroup.phones).slice(0, 5),
  };
}

// Detalle del pedido para el ticket de WhatsApp. Vía Prisma directo: el endpoint
// /api/store/orders/:id OCULTA las notes y NO trae los modifiers sin "prueba de
// teléfono", y justo ahí viven las variantes (término/sabor) y los extras. Filtra
// por restaurantId para cumplir el tenant-guard.
async function fetchOrderTicketDetail(orderId, restaurantId) {
  try {
    if (botApi.useApi()) return await botApi.getOrderDetail(orderId);
    return await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: {
        orderNumber: true, status: true, subtotal: true, deliveryFee: true, total: true, discount: true,
        items: {
          select: {
            name: true, quantity: true, subtotal: true, notes: true,
            modifiers: { select: { name: true, priceAdd: true } },
          },
        },
      },
    });
  } catch (e) {
    console.error('[WhatsApp Bot] No se pudo traer el detalle (Prisma) de la orden:', e?.message || e);
    return null;
  }
}

// Variantes/extras de una línea: junta los modifiers (término, sabor, extras que
// viven como filas) con lo que venga en notes ("Complementos: X", "Variantes: Y",
// o texto libre). Devuelve nombres únicos en orden.
function itemExtrasText(it) {
  const parts = [];
  if (Array.isArray(it.modifiers)) {
    for (const m of it.modifiers) if (m && m.name) parts.push(String(m.name).trim());
  }
  const n = (it.notes || '').trim();
  if (n) {
    n.split(/\n|;/).map((s) => s.trim()).filter(Boolean).forEach((seg) => {
      const val = seg.replace(/^(Complementos?|Variantes?|Extras?|Modificadores?|Notas?)\s*:\s*/i, '').trim();
      if (val) parts.push(val);
    });
  }
  return [...new Set(parts.filter(Boolean))];
}

function resolveBrowserExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.platform === 'win32') {
    const fs = require('fs');
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    for (const p of candidates) {
      try { if (fs.existsSync(p)) return p; } catch {}
    }
  }
  return undefined;
}

function initWhatsApp(io) {
  console.log('[WhatsApp Bot] Inicializando cliente...');
  sessionState = 'connecting';
  lastReadyAt = 0;
  const execPath = resolveBrowserExecutable();
  if (execPath) {
    console.log(`[WhatsApp Bot] Usando navegador: ${execPath}`);
  }

  whatsappClient = new Client({
    // dataPath: en el worker de Railway apunta a un VOLUMEN persistente
    // (WWEBJS_DATA_PATH, p.ej. /data) para que la sesión sobreviva a los
    // redeploys y no haya que re-escanear el QR. Sin la env, LocalAuth usa el
    // cwd (comportamiento local de siempre).
    authStrategy: new LocalAuth({
      clientId: "mrtpvrest-bot",
      ...(process.env.WWEBJS_DATA_PATH ? { dataPath: process.env.WWEBJS_DATA_PATH } : {}),
    }),
    puppeteer: {
      ...(execPath ? { executablePath: execPath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        ...(process.platform === 'win32' ? [] : ['--no-zygote']),
      ],
    },
  });

  outbox = createOutbox({
    store: stateStore,
    eligibility: entry => getActiveHandoff(entry.chat, null) || !botConfig.getActive() ? 'cancel' : (sessionState === 'ready' && whatsappClient && exclusionsReady() ? 'send' : 'wait'),
    send: async entry => {
      rememberBotOutgoingIntent(entry.chat, entry.text);
      const sent = await whatsappClient.sendMessage(entry.chat, entry.text);
      rememberBotSentMessage(sent);
      console.log('[WhatsApp Bot] Respuesta enviada.');
    },
    onFailure: (_entry, error) => { console.error('[WhatsApp Bot] Respuesta pendiente de revisión:', error); notifyAlert('Respuesta pendiente de revisión', error); },
  });
  outbox.resume();
  whatsappClient.on('qr', (qr) => {
    latestQr = qr;
    sessionState = 'qr';
    // En prod con sesión en volumen NO debería aparecer QR salvo desvinculación:
    // avisar (throttled) para que alguien lo escanee en /qr.
    notifyAlert('QR requerido — escanéalo en /qr', null);
    console.log('[WhatsApp Bot] Vinculación pendiente: abre el visor QR local o autenticado.');
  });

  whatsappClient.on('authenticated', () => {
    latestQr = null;
  });

  whatsappClient.on('ready', async () => {
    latestQr = null;
    console.log('[WhatsApp Bot] Cliente WhatsApp conectado; cargando config y esperando fin de sync inicial (15s)...');
    if (io) {
      io.emit('whatsapp:ready');
    }
    await botConfig.init();
    await refreshIgnoredGroup();
    setInterval(refreshIgnoredGroup, 10 * 60 * 1000).unref?.();
    await backfillUnread();

    // Esperar 15s tras conectar/escanear QR para que whatsapp-web.js termine de
    // volcar todos los eventos 'message' del historial sincronizado.
    await new Promise((r) => setTimeout(r, POST_READY_SYNC_COOLDOWN_MS));

    lastReadyAt = Date.now();
    sessionState = 'ready';
    console.log(`[WhatsApp Bot] Listo y operando (corte anti-blast=${new Date(lastReadyAt).toISOString()}, active=${botConfig.getActive()}).`);
  });

  // Procesa UN mensaje entrante. Se usa desde el evento 'message' y desde el
  // backfill de no-leídos al reconectar (misma lógica, sin duplicar).
  const processMessage = async (msg) => {
   try {
    // El bot es ESTRICTAMENTE SOLO-RESPONDER: nunca inicia, solo contesta un
    // mensaje 1-a-1 recibido. Todo lo demás se ignora (reduce el riesgo de
    // baneo de whatsapp-web.js, que se dispara con actividad no solicitada).
    //  - fromMe: jamás reaccionar a mensajes propios (evita cualquier bucle).
    //  - grupos (@g.us), estados (status@broadcast), difusiones (@broadcast) y
    //    canales/newsletters (@newsletter): no son clientes 1-a-1.
    if (msg.fromMe) return;
    const chatKey = chatKeyForMessage(msg);
    // DENYLIST (no allowlist): excluimos lo que NO es un cliente 1-a-1. Un
    // allowlist estricto a @c.us rompía las respuestas, porque WhatsApp entrega
    // muchos DMs como @lid (linked-device id), no @c.us → se caían todos los
    // mensajes. Aquí solo bloqueamos grupos/estados/difusiones/canales y
    // dejamos pasar cualquier chat individual (@c.us o @lid).
    if (!isCustomerChatId(chatKey)) return;

    // GUARD ANTI-BLAST (crítico): al reconectar, whatsapp-web.js re-entrega por
    // el evento 'message' los mensajes que llegaron mientras el bot estuvo
    // offline (backlog). Si respondemos, sale una ráfaga a decenas de clientes
    // de golpe → riesgo de baneo. Solo atendemos mensajes cuyo timestamp sea
    // posterior a que el bot quedó 'ready' (con 60s de gracia). Los del backlog
    // se ignoran en silencio (el humano los ve en el chat y los atiende).
    if (sessionState !== 'ready' || !lastReadyAt || Date.now() < lastReadyAt) {
      console.log(`[WhatsApp Bot] Mensaje ignorado durante sync inicial de ${msg.from} (state=${sessionState}).`);
      return;
    }

    if (!botConfig.getActive()) return;

    const rawTs = Number(msg.timestamp);
    if (!Number.isFinite(rawTs) || rawTs <= 0) {
      console.log(`[WhatsApp Bot] Mensaje sin timestamp valido de ${msg.from} ignorado.`);
      return;
    }
    const msgTsMs = rawTs * 1000;
    const nowMs = Date.now();
    if (msgTsMs < lastReadyAt) {
      console.log(`[WhatsApp Bot] Backlog/mensaje viejo ignorado (anti-blast) de ${msg.from}: ts=${new Date(msgTsMs).toISOString()} vs ready=${new Date(lastReadyAt).toISOString()}.`);
      return;
    }

    // EnvÃ­o robusto (sendMessage anda mejor con @lid que msg.reply).
    const safeSend = async text => {
      const id = crypto.createHash('sha256').update(String(messageId(msg) || msg.timestamp) + '\0' + chatKey + '\0' + text).digest('hex');
      const delivery = await outbox.enqueue({ chat: chatKey, text, id });
      const sentHistory = chatHistory.get(phone);
      if (sentHistory && delivery.status === 'sent') {
        sentHistory.push({ role: 'model', text });
        pruneHistory(sentHistory);
        saveConversations();
      }
      return delivery;
    };

    // AHORRO DE TOKENS: Ignorar stickers, reacciones, notificaciones del sistema
    // o mensajes eliminados. Antes un sticker tenía msg.body === '' y aun así
    // viajaba hasta Gemini con todo el menú e historial.
    const msgType = String(msg.type || '').toLowerCase();
    const IGNORED_MSG_TYPES = new Set([
      'sticker',
      'reaction',
      'e2e_notification',
      'notification_template',
      'gp2',
      'call_log',
      'revoked',
      'ciphertext',
      'poll_creation',
    ]);
    if (IGNORED_MSG_TYPES.has(msgType)) {
      console.log(`[WhatsApp Bot] Mensaje tipo "${msgType}" de ${msg.from} ignorado (ahorro de tokens).`);
      return;
    }

    // Obtener texto o ubicación
    let messageText = msg.body;
    let locationData = null;
    
    if (msg.type === 'location' && msg.location) {
      locationData = { lat: msg.location.latitude, lng: msg.location.longitude };
      messageText = `[El cliente ha enviado su ubicación por GPS: latitud ${locationData.lat}, longitud ${locationData.lng}]`;
    }

    console.log(`[WhatsApp Bot] Mensaje recibido de ${msg.from} (type=${msgType}): ${messageText}`);
    
    // Obtener número limpio usando la API de contactos de WhatsApp
    let phone = msg.from.replace('@c.us', '');
    let contactId = null;
    try {
      const contact = await msg.getContact();
      if (contact) {
        contactId = contact.id?._serialized || null;
        if (contact.number) {
          // WhatsApp en México a veces agrega un '1' después del 52. Lo limpiamos si es necesario,
          // o simplemente usamos el contact.number directo.
          phone = contact.number;
          if (phone.startsWith('521') && phone.length === 13) {
            phone = '52' + phone.substring(3);
          }
        }
      }
    } catch (e) {
      console.error('[WhatsApp Bot] No se pudo obtener el contacto limpio', e);
    }

    // Ignorados: por lista de números (WHATSAPP_BOT_IGNORE_NUMBERS) o por
    // pertenecer al grupo ignorado (WHATSAPP_BOT_IGNORE_GROUP_NAME). En ambos
    // casos el bot NO responde (lo atiendes tú a mano).
    if (!exclusionsReady()) return;
    if (isIgnoredNumber(phone)) {
      console.log(`[WhatsApp Bot] Número en lista de ignorados (${phone}); no se responde.`);
      return;
    }
    if (isInIgnoredGroup(msg.from, contactId, phone)) {
      console.log(`[WhatsApp Bot] Remitente pertenece al grupo ignorado "${ignoredGroup.name}" (${msg.from}); no se responde.`);
      return;
    }

    // Rate-limit: cortar ráfagas / loops. Al exceder, silencio (rompe el loop).
    const activeHandoff = getActiveHandoff(chatKey, phone);
    if (activeHandoff) {
      const minutesLeft = Math.ceil((activeHandoff.until - Date.now()) / 60000);
      console.log(`[WhatsApp Bot] Chat en handoff humano (${chatKey}); silencio ${minutesLeft} min restantes.`);
      return;
    }

    if (!allowMessage(phone)) {
      console.warn(`[WhatsApp Bot] Rate limit para ${phone}; se ignora este mensaje.`);
      return;
    }

    if (isAudioMessage(msg)) {
      console.log(`[WhatsApp Bot] Audio recibido de ${msg.from}; transcribiendo...`);
      const transcription = await transcribeWhatsAppAudio(msg);
      if (!transcription.ok) {
        console.warn(`[WhatsApp Bot] No se pudo transcribir audio de ${msg.from}: ${transcription.code}`);
        await safeSend('No pude escuchar bien el audio 🙏. ¿Me escribes tu pedido en texto? Así no se me va ningún producto.');
        return;
      }
      messageText = transcription.text;
      console.log(`[WhatsApp Bot] Audio transcrito de ${msg.from}: ${messageText}`);
    }

    if (msg.from.includes('@lid') && whatsappClient.getContactLidAndPhone) {
      try {
        const linked = await whatsappClient.getContactLidAndPhone([msg.from]);
        const pn = linked.find(x => x.pn)?.pn;
        if (pn) updateCustomerProfile(phone, { customerPhone: pn.replace('@c.us', '') });
      } catch { /* A contact phone will be requested if it cannot be resolved. */ }
    }
    const detectedPhone = extractPhoneFromText(messageText);
    if (detectedPhone) updateCustomerProfile(phone, { customerPhone: detectedPhone });
    const profile = customerProfiles.get(phone) || {};
    if (isIgnoredNumber(profile.customerPhone) || isInIgnoredGroup(msg.from, contactId, profile.customerPhone)) return;
    const isLidChat = msg.from.includes('@lid') || String(contactId || '').includes('@lid');
    const hasReliableChatPhone = !isLidChat && isValidPhoneNumber(phone);
    const isInvalidPhone = !hasReliableChatPhone && !isValidPhoneNumber(profile.customerPhone);
    // Tenant del bot: FIJO por env (WHATSAPP_BOT_RESTAURANT_ID). El fallback
    // "primer restaurante activo" era una ruleta en prod (~85+ tenants: el más
    // viejo de la BD, no necesariamente el tuyo) — se conserva solo para dev
    // con BD limpia, con advertencia.
    const pinnedRestaurantId = process.env.WHATSAPP_BOT_RESTAURANT_ID;
    let restaurant;
    if (botApi.useApi()) {
      // API-only: el tenant sale del token (sin BD). El nombre real lo usa el
      // prompt vía /context (businessName); aquí solo se necesita id.
      const rid = botApi.restaurantId();
      restaurant = rid ? { id: rid, name: 'tu negocio', isActive: true } : null;
    } else {
      restaurant = pinnedRestaurantId
        ? await prisma.restaurant.findFirst({ where: { id: pinnedRestaurantId, isActive: true } })
        : await prisma.restaurant.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    }

    if (!restaurant) {
      console.log('[WhatsApp Bot] No se encontró un restaurante activo' + (pinnedRestaurantId ? ` con id ${pinnedRestaurantId}.` : '.'));
      return;
    }
    if (!pinnedRestaurantId) {
      console.warn(`[WhatsApp Bot] ADVERTENCIA: WHATSAPP_BOT_RESTAURANT_ID no está seteado; usando "${restaurant.name}" (${restaurant.id}) por ser el restaurante activo más viejo. Fíjalo en el .env.`);
    }

    // Inicializar historial
    if (!chatHistory.has(phone)) {
      chatHistory.set(phone, []);
    }
    const history = chatHistory.get(phone);
    const resumed = resumeContexts.get(chatKey);
    if (resumed) {
      resumeContexts.delete(chatKey);
      if (Date.now() - resumed.at < SESSION_TTL) {
        history.push({ role: 'model', text: resumed.text });
        pruneHistory(history);
        pendingDrafts.delete(phone);
        orderSessions.set(phone, updateSession(orderSessions.get(phone), resumed.text, null, Date.now()).session);
        console.log('[WhatsApp Bot] Resumen del personal aplicado al chat reactivado.');
      }
      saveConversations();
    }
    if (profile.customerName && history.length === 0) {
      history.push({
        role: 'model',
        text: `Contexto recordado: cliente ${profile.customerName}${profile.customerPhone ? `, telefono ${profile.customerPhone}` : ''}${profile.deliveryAddress ? `, ultima direccion ${profile.deliveryAddress}` : ''}${profile.paymentMethod ? `, ultimo pago ${profile.paymentMethod}` : ''}.`,
      });
    }

    // Orden reciente de este teléfono. DOS fuentes:
    //  - Memoria local (recentOrders): la escribe el propio proceso al crear el
    //    pedido. Ventanas: activeOrderId 15 min (ADD_TO_ORDER) y
    //    recentConfirmedId 45 min (contexto para Gemini + acuse de comprobantes).
    //  - REHIDRATACIÓN desde BD (API-only): si no hay entrada local (restart del
    //    bot, o pasaron >45 min), se pregunta al backend por el último pedido del
    //    chat (GET /api/bot/chat-order). El server dice además si el ticket sigue
    //    vivo para AGREGAR (canAdd por status, no por reloj). Así "agrégame X"
    //    funciona horas después y sobrevive reinicios.
    let activeOrderId = null;
    let recentConfirmedId = null;
    let recentOrder = recentOrders.get(phone);
    if (recentOrder) {
      const age = Date.now() - recentOrder.timestamp;
      // Local: 45 min (como siempre). Rehidratada: 120 min = la ventana del
      // server (timestamp = createdAt del pedido); después se re-consulta la BD.
      const maxAge = recentOrder.hydrated ? 120 * 60 * 1000 : 45 * 60 * 1000;
      if (age >= maxAge) {
        recentOrders.delete(phone);
        recentOrder = null;
      }
    }
    if (!recentOrder && botApi.useApi()) {
      const ref = chatRefFor(chatKey);
      const lastLookup = chatOrderLookups.get(ref) || 0;
      if (ref && Date.now() - lastLookup >= CHAT_ORDER_LOOKUP_TTL_MS) {
        chatOrderLookups.set(ref, Date.now());
        if (chatOrderLookups.size > 2000) chatOrderLookups.clear(); // tope de memoria
        try {
          const remote = await botApi.getChatOrder(ref);
          if (remote) {
            recentOrder = {
              orderId: remote.id,
              orderNumber: remote.orderNumber,
              total: remote.total ?? null,
              summary: (remote.items || []).map((it) => `${it.quantity}x ${it.name}`).join(', '),
              timestamp: new Date(remote.createdAt).getTime() || Date.now(),
              hydrated: true,
              canAddDb: remote.canAdd === true,
            };
            recentOrders.set(phone, recentOrder);
            console.log(`[WhatsApp Bot] Pedido ${remote.orderNumber} rehidratado de BD para ${phone} (canAdd=${recentOrder.canAddDb}).`);
          }
        } catch (err) {
          console.error('[WhatsApp Bot] No se pudo rehidratar el pedido del chat:', err?.response?.status || err?.message || err);
        }
      }
    }
    if (recentOrder) {
      const age = Date.now() - recentOrder.timestamp;
      // Entrada local: ADD solo en los primeros 15 min (no sabemos el status).
      // Entrada rehidratada: manda el status real del server (canAddDb).
      if (recentOrder.hydrated ? recentOrder.canAddDb : age < 15 * 60 * 1000) {
        activeOrderId = recentOrder.orderId;
      }
      recentConfirmedId = recentOrder.orderId;
    }

    // Datos del pedido reciente para el prompt de Gemini: sin esto, cuando el
    // historial se poda, Gemini "olvida" que el cliente YA tiene pedido y vuelve a
    // pedirle nombre/dirección o lo re-toma (incidente Abraham 2026-07-02). Con
    // esto le damos folio/resumen/total y le prohibimos re-tomar.
    const activeOrderInfo = recentConfirmedId ? {
      orderNumber: recentOrder?.orderNumber || null,
      total: recentOrder?.total ?? null,
      summary: recentOrder?.summary || '',
      canAdd: !!activeOrderId, // solo dentro de 15 min entra ADD_TO_ORDER
    } : null;

    // Follow-up is read-only and never enters the product-generating model.
    const followup = followupIntent(messageText, { recentOrder, hasDraft: pendingDrafts.get(phone)?.presented === true });
    if (followup) {
      let detail = null;
      if (recentOrder?.orderId) {
        detail = await fetchOrderTicketDetail(recentOrder.orderId, restaurant.id);
      } else if (!botApi.useApi()) {
        try {
          const ref = chatRefFor(chatKey);
          if (ref) detail = await prisma.order.findFirst({
            where: { restaurantId: restaurant.id, clientOrderId: { startsWith: 'wa:' + ref + ':' }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60000) } },
            orderBy: { createdAt: 'desc' },
            select: { id: true, orderNumber: true, status: true, total: true, createdAt: true },
          });
          if (detail?.id) {
            recentOrder = { orderId: detail.id, orderNumber: detail.orderNumber, total: detail.total, timestamp: new Date(detail.createdAt).getTime(), hydrated: true, canAddDb: false };
            recentOrders.set(phone, recentOrder);
          }
        } catch (error) { console.warn('[WhatsApp Bot] No se pudo consultar el seguimiento:', error?.message); }
      }
      // A follow-up must not leave an old generated cart ready for a bare yes.
      const interruptedDraft = pendingDrafts.get(phone);
      if (interruptedDraft) interruptedDraft.presented = false;
      const interruptedSession = orderSessions.get(phone);
      if (interruptedSession) interruptedSession.cartNeedsReview = true;
      history.push({ role: 'user', text: messageText });
      pruneHistory(history);
      saveConversations();
      if (getActiveHandoff(chatKey, phone) || !botConfig.getActive() || !exclusionsReady()) return;
      await safeSend(followupReply(detail, recentOrder));
      return;
    }

    // COMPROBANTE DE PAGO / imagen: el bot NO lee imágenes ni PDFs. Si ya hay un
    // pedido activo reciente, acusar recibo y NO mandar a Gemini (un mensaje vago
    // + el historial con el pedido hacía que Gemini re-confirmara y duplicara la
    // orden — incidente Gissel 2026-07-02). Con la guarda de arriba tampoco se
    // duplicaría, pero así el cliente recibe una respuesta útil en vez de que
    // Gemini reaccione raro a una imagen "vacía".
    if ((msg.type === 'image' || msg.type === 'document') && recentConfirmedId) {
      console.log(`[WhatsApp Bot] Imagen/documento con pedido reciente ${recentConfirmedId} de ${phone}; se acusa recibo sin reprocesar.`);
      recentOrders.set(phone, { ...recentOrder, orderId: recentConfirmedId, timestamp: Date.now() });
      await safeSend('Recibí tu archivo. El pago y la aceptación del pedido deben ser revisados por la caja.');
      return;
    }

    // AHORRO DE TOKENS: Si es imagen, documento, video o contacto SIN texto y
    // sin pedido reciente, no llamar a Gemini con messageText="" (mandaría todo
    // el menú para nada).
    if (!String(messageText || '').trim()) {
      if (msgType === 'image' || msgType === 'document' || msgType === 'video') {
        console.log(`[WhatsApp Bot] Media (${msgType}) sin texto ni pedido activo de ${phone}; respuesta rápida sin IA.`);
        await safeSend('Recibí tu archivo 🙌. Si deseas realizar un pedido, ¿me escribes por texto qué te gustaría ordenar?');
      } else {
        console.log(`[WhatsApp Bot] Mensaje vacío (${msgType}) de ${phone} ignorado sin llamar a IA.`);
      }
      return;
    }

    // Procesar con Gemini
    console.log(`[WhatsApp Bot] Procesando con Gemini (phone=${phone}, invalid=${isInvalidPhone}, tenant=${restaurant.id})...`);
    const draft = pendingDrafts.get(phone);
    if (draft?.rejectionMessage && isExplicitConfirmation(messageText)) {
      await safeSend(draft.rejectionMessage);
      return;
    }
    const previousSession = orderSessions.get(phone);
    const { session, update, reset } = updateSession(previousSession, messageText, locationData, Date.now());
    if (!previousSession && !reset && draft && draft.presented === undefined && Date.now() - draft.createdAt < SESSION_TTL) {
      session.requests = [...history.filter(turn => turn.role === 'user').map(turn => String(turn.text).slice(0, 600)).slice(-8), ...session.requests];
    }
    if (reset) pendingDrafts.delete(phone);
    const acceptsDraft = !reset && !!draft && draft.presented === true && draft.pricingPolicyVersion === 'catalog-extras-v1' && Date.now() - draft.createdAt < 15 * 60000 && isExplicitConfirmation(messageText);
    const metadataOnly = Object.keys(update).length > 0;
    const knownOrder = !session.cartNeedsReview && (session.order || (!reset && draft?.presented === true && Date.now() - draft.createdAt < SESSION_TTL ? draft.order : null));
    if (!metadataOnly && !isExplicitConfirmation(messageText)) session.cartNeedsReview = true;
    if (!acceptsDraft && draft) draft.presented = false;
    orderSessions.set(phone, session);
    let geminiResponse = acceptsDraft ? draft.order
      : metadataOnly && knownOrder && !recentConfirmedId ? applyFacts(knownOrder, session.facts)
      : await processWhatsAppMessage(phone, messageText, restaurant.id, history, activeOrderId, isInvalidPhone, { ...profile, currentOrder: session }, activeOrderInfo);
    if (geminiResponse?.status !== 'AI_ERROR') geminiResponse = validateModelReply(geminiResponse);
    if (geminiResponse?.status === 'CONFIRMED' && !acceptsDraft) {
      geminiResponse = applyFacts(geminiResponse, session.facts);
      session.order = geminiResponse;
      session.cartNeedsReview = false;
    }
    if (geminiResponse?.status === 'AI_ERROR' && metadataOnly) {
      const acknowledgment = update.cashTendered ? `Anoté que pagarás con $${update.cashTendered}.` : update.paymentMethod ? 'Anoté tu forma de pago.' : 'Anoté el dato de entrega.';
      geminiResponse = { ...geminiResponse, replyMessage: acknowledgment + ' No pude completar la revisión de los productos. El pedido aún requiere revisión con la caja; no lo he registrado.' };
    }
    console.log(`[WhatsApp Bot] Gemini status=${geminiResponse?.status}, reply=${!!geminiResponse?.replyMessage}`);
    if (getActiveHandoff(chatKey, phone) || !botConfig.getActive() || !exclusionsReady()) {
      console.log(`[WhatsApp Bot] Intervención humana ocurrió mientras se procesaba (${chatKey}); se omite respuesta del bot.`);
      return;
    }

    // Actualizar historial localmente
    history.push({ role: 'user', text: messageText });
    // safeSend records only the response actually delivered to the customer.

    // Mantener memoria suficiente para pedidos grandes sin crecer sin límite.
    pruneHistory(history);

    const status = geminiResponse.status;
    const items = Array.isArray(geminiResponse.items) ? geminiResponse.items : [];

    // NOTA: la vieja guarda LOCAL anti-duplicado (bloquear CONFIRMED si había
    // recentConfirmedId) se quitó a propósito: bloqueaba en silencio también las
    // CORRECCIONES (incidente #1230/#1244: el cliente reenvió el pedido con las
    // papas gajo correctas y no había forma de enterarse). Ahora TODO CONFIRMED
    // re-emitido viaja al backend, cuyo dedupe por chat (a) corta el duplicado,
    // (b) detecta si el carrito CAMBIÓ y marca el ticket original con nota
    // "⚠️ POSIBLE CORRECCIÓN" avisando a la caja, y (c) corre ANTES de los gates
    // de tienda cerrada/turno, así el eco de un comprobante tardío recibe acuse
    // aunque ya hayan cerrado.
    const hasValidOrderItems = Array.isArray(items) && items.some(it => it && it.menuItemId && (it.quantity == null || parseInt(it.quantity, 10) > 0));
    if (status === 'CONFIRMED' && hasValidOrderItems) {
      // CREAR LA ORDEN PRIMERO; confirmar SOLO si el TPV la registró. Antes se
      // enviaba "¡confirmado!" y DESPUÉS se creaba: si el POST fallaba, el
      // cliente esperaba un pedido que nunca existió. Además el folio y el total
      // se arman en CÓDIGO desde la respuesta del server (nunca lo que alucine
      // Gemini) — cumple "totales siempre server-side".
      // chatKey viaja al backend como llave de dedupe persistente (hasheada):
      // si este CONFIRMED duplica un pedido reciente del MISMO chat, el server
      // devuelve el existente con dedupReason=CHAT_WINDOW en vez de crear otro.
      // Teléfono del cliente: Gemini solo lo pone si el cliente lo dictó (en
      // chats @lid suele viajar el placeholder → null y el pedido queda SIN
      // cliente en el CRM). Fallback duro en código: chat normal (@c.us) → el
      // número del chat ES el teléfono; @lid → lo que el cliente haya escrito.
      if (!normalizeCustomerPhone(geminiResponse.customerPhone)) {
        geminiResponse.customerPhone = (hasReliableChatPhone ? phone : null)
          || profile.customerPhone || detectedPhone || null;
      }
      const missing = missingOrderData(geminiResponse);
      if (missing) { await safeSend(missing); return; }
      if (!acceptsDraft) {
        let names = new Map();
        const choices = new Map();
        if (botApi.useApi()) {
          const context = await botApi.getContext();
          for (const match of String(context.menuString || '').matchAll(/([^,\n\[\]]+)\s*\[(?:variantId|modifierId):\s*([^\]]+)\]/g)) {
            choices.set(match[2].trim(), match[1].replace(/^.*(?:->|:)\s*/, '').trim());
          }
          for (const line of String(context.menuString || '').split('\n')) {
            const id = line.match(/\[ID:\s*([^\]]+)\]/)?.[1];
            if (id) names.set(id.trim(), line.split('[ID:')[0].replace(/^[-\s]+/, '').trim());
          }
        } else {
          const products = await prisma.menuItem.findMany({ where: { restaurantId: restaurant.id, id: { in: items.map(x => x.menuItemId) } }, include: { variants: true, complements: true, modifierGroups: { include: { modifiers: true } }, comboComponents: { include: { options: { include: { optionMenuItem: { select: { name: true } } } } } } } });
          names = new Map(products.map(p => [p.id, p.name]));
          for (const product of products) {
            for (const v of product.variants || []) choices.set(v.id, v.name);
            for (const c of product.complements || []) choices.set('complement:' + c.id, c.name + (Number(c.price) > 0 ? ` (+$${c.price} c/u)` : ''));
            for (const group of product.modifierGroups || []) for (const m of group.modifiers || []) choices.set(m.id, m.name + (Number(m.priceAdd) > 0 ? ` (+$${m.priceAdd} c/u)` : ''));
            for (const component of product.comboComponents || []) for (const option of component.options || []) choices.set(option.id, option.optionMenuItem.name);
          }
        }
        if (items.some(item => !names.has(item.menuItemId))) { await safeSend('Necesito revisar los productos del pedido. ¿Me confirmas cuáles deseas?'); return; }
        const optionIds = item => [item.variantId, ...(item.modifierIds || []), ...(item.comboSelections || []).map(s => s.optionId)].filter(Boolean);
        if (items.some(item => optionIds(item).some(id => !choices.has(id)))) { await safeSend('Necesito revisar las opciones del pedido con la caja antes de registrarlo.'); return; }
        const lines = items.map(item => {
          const extras = [...optionIds(item).map(id => choices.get(id)), item.notes].filter(Boolean);
          return '• ' + item.quantity + 'x ' + names.get(item.menuItemId) + (extras.length ? ' (' + extras.join(', ') + ')' : '');
        }).join('\n');
        const nextDraft = { order: geminiResponse, createdAt: Date.now(), pricingPolicyVersion: 'catalog-extras-v1', presented: false };
        pendingDrafts.set(phone, nextDraft);
        saveConversations();
        const delivery = geminiResponse.orderType === 'DELIVERY' ? 'Domicilio: ' + geminiResponse.deliveryAddress + '\nEnvío pendiente de cotizar.' : 'Para recoger.';
        const payment = { CASH: 'efectivo', CASH_ON_DELIVERY: 'efectivo', TRANSFER: 'transferencia', CARD: 'tarjeta' }[geminiResponse.paymentMethod] || geminiResponse.paymentMethod;
        const summaryDelivery = await safeSend('Revisa tu solicitud:\n' + lines + '\n' + delivery + '\nPago: ' + payment + (geminiResponse.notes ? '\nNotas: ' + geminiResponse.notes : '') + '\nLa caja revisa importe y disponibilidad antes de aceptar. ¿La registro? Responde SÍ.');
        nextDraft.presented = summaryDelivery.status === 'sent';
        return;
      }
      if (!draft.submissionId) { draft.submissionId = messageId(msg); saveConversations(); }
      const orderCreated = await createOrderFromGemini(restaurant.id, geminiResponse, process.env.PORT || 3001, chatKey, draft.submissionId);
      if (orderCreated?.id) { pendingDrafts.delete(phone); orderSessions.delete(phone); }
      if (orderCreated && orderCreated.id && orderCreated.dedupReason === 'CHAT_WINDOW') {
        // Red SERVER-SIDE anti-duplicado (vive en BD: sobrevive restarts y
        // ventanas largas — el duplicado #1230/#1244 del 2026-07-05 entró a los
        // 59 min y costó $926 reembolsados). Acusamos el pedido existente y NO
        // confirmamos uno "nuevo". Si el backend detectó CAMBIOS en el carrito
        // (correctionFlagged), ya marcó el ticket y avisó a la caja: al cliente
        // se le dice eso en vez del acuse genérico.
        console.warn(`[WhatsApp Bot] Backend dedupeó CONFIRMED de ${phone} contra el pedido #${orderCreated.orderNumber} del mismo chat${orderCreated.correctionFlagged ? ' (posible corrección, caja avisada)' : ''}; no se duplica.`);
        recentOrders.set(phone, { orderId: orderCreated.id, orderNumber: orderCreated.orderNumber, total: orderCreated.total ?? null, summary: '', timestamp: Date.now() });
        rememberRecentOrderChat(chatKey, phone, orderCreated.id);
        // AHORRO DE TOKENS: compactar historial tras confirmar/dedupear para no
        // reenviar los 8-14 turnos previos de armado del carrito en mensajes posteriores.
        history.length = 0;
        history.push({
          role: 'model',
          text: `El pedido ya estaba registrado antes: folio ${orderCreated.orderNumber}. NO se creó uno nuevo.${orderCreated.correctionFlagged ? ' Se avisó a la caja de un posible cambio.' : ''}`,
        });
        if (orderCreated.correctionFlagged) {
          await safeSend(`Ya tenía registrado tu pedido *#${orderCreated.orderNumber}* y noté cambios en lo que me enviaste 👀. Le avisé a la caja para que lo revise y ajuste — no creé un pedido duplicado. Si quieres AGREGAR algo más, dime qué y lo sumo.`);
        } else {
          await safeSend(`Tu solicitud *#${orderCreated.orderNumber}* ya está registrada. La caja confirma su aceptación y cualquier cambio.`);
        }
      } else if (orderCreated && orderCreated.id) {
        recentOrders.set(phone, { orderId: orderCreated.id, orderNumber: orderCreated.orderNumber, total: orderCreated.total ?? null, summary: '', timestamp: Date.now() });
        rememberRecentOrderChat(chatKey, phone, orderCreated.id);
        updateCustomerProfile(phone, {
          customerName: geminiResponse.customerName,
          customerPhone: extractPhoneFromText(geminiResponse.customerPhone) || detectedPhone || profile.customerPhone,
          orderType: geminiResponse.orderType,
          deliveryAddress: geminiResponse.deliveryAddress,
          paymentMethod: geminiResponse.paymentMethod,
        });
        const totalLine = orderCreated.total != null ? `\n💵 Importe registrado: $${orderCreated.total} (envío pendiente si aún no fue cotizado)` : '';
        const accepted = ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(orderCreated.status);
        const orderLabel = accepted ? 'Pedido confirmado' : 'Solicitud registrada; pendiente de aceptación por el negocio';
        const timing = accepted && orderCreated.estimatedMinutes ? 'Tiempo estimado: ~' + orderCreated.estimatedMinutes + ' min.' : 'La caja confirma el importe final y el tiempo de entrega.';
        // AHORRO DE TOKENS: limpiar los turnos anteriores del armado de pedido y
        // dejar únicamente el resumen compacto de la orden recién creada.
        history.length = 0;
        history.push({
          role: 'model',
          text: `Pedido registrado en TPV: folio ${orderCreated.orderNumber}, total ${orderCreated.total ?? 'pendiente'}, pago ${geminiResponse.paymentMethod || 'no especificado'}.`,
        });
        // Ticket DETALLADO con variantes (término/sabor) y extras. Vía Prisma
        // (fetchOrderTicketDetail) porque el endpoint HTTP oculta notes/modifiers.
        const detail = await fetchOrderTicketDetail(orderCreated.id, restaurant.id);
        let ticket;
        if (detail && Array.isArray(detail.items) && detail.items.length > 0) {
          // Guardar resumen de items (con variantes) para el contexto de Gemini.
          const cur = recentOrders.get(phone);
          if (cur && cur.orderId === orderCreated.id) {
            const sumText = detail.items.map(it => {
              const ex = itemExtrasText(it);
              return `${it.quantity}x ${it.name}${ex.length ? ` (${ex.join(', ')})` : ''}`;
            }).join(', ');
            recentOrders.set(phone, { ...cur, summary: sumText, total: detail.total ?? cur.total });
          }
          const lineas = detail.items.map(it => {
            const ex = itemExtrasText(it);
            const exLn = ex.length ? `\n   ↳ ${ex.join(', ')}` : '';
            return `• ${it.quantity}x ${it.name} — $${it.subtotal}${exLn}`;
          }).join('\n');
          const isDelivery = String(orderCreated.orderType || geminiResponse.orderType || '').toUpperCase() === 'DELIVERY';
          const hasDeliveryFee = Number(detail.deliveryFee) > 0;
          let envioLn = '';
          let notaEnvio = '';
          if (hasDeliveryFee) {
            envioLn = `\n🛵 Envío: ${detail.deliveryFee}`;
          } else if (isDelivery) {
            envioLn = `\n🛵 Envío: *Se calcula según tu ubicación*`;
            notaEnvio = `\n📍 *Nota:* El costo de envío se confirmará y sumará de acuerdo a tu ubicación.\n`;
          }
          const descLn = Number(orderCreated.discount) > 0 ? `\nDescuento: -${orderCreated.discount}` : '';
          const totalLabel = isDelivery && !hasDeliveryFee ? `*Total comida: ${detail.total}* (+ envío)` : `*Total: ${detail.total}*`;
          ticket = `✅ *${orderLabel}* — Folio *#${orderCreated.orderNumber}*\n\n🧾 *Tu ticket:*\n${lineas}\n━━━━━━━━━━━━━\nSubtotal: ${detail.subtotal}${envioLn}${descLn}\n${totalLabel}${notaEnvio}\n${timing}\n¡Gracias! 🍔`;
        } else {
          const isDelivery = String(orderCreated.orderType || geminiResponse.orderType || '').toUpperCase() === 'DELIVERY';
          const notaEnvio = isDelivery ? '\n🛵 *Envío:* Se calculará con base en tu ubicación al despacharlo.' : '';
          ticket = `✅ ${orderLabel}. Folio *#${orderCreated.orderNumber}*${totalLine}${notaEnvio}\n${timing}\n¡Gracias! 🍔`;
        }
        await safeSend(ticket);
        // Recompensa por hitos de compra (el backend la genera cada N compras).
        const reward = orderCreated.reward;
        if (reward && reward.couponCode) {
          const pct = reward.discountValue;
          const vence = reward.expiresAt ? new Date(reward.expiresAt).toLocaleDateString('es-MX') : '';
          await safeSend(`🎉 ¡Y esta es tu compra #${reward.ordersCount} con nosotros! Te ganaste un cupón:\n🎟️ *${reward.couponCode}* — ${pct}% de descuento en tu próximo pedido${vence ? `\n📅 Vence el ${vence}` : ''}.\n¡Gracias por tu preferencia! 🙌`);
        }
      } else if (orderCreated?.code === 'MIN_ORDER_AMOUNT') {
        draft.presented = false;
        draft.rejectionMessage = orderCreated.message;
        saveConversations();
        await safeSend(orderCreated.message);
      } else if (orderCreated?.code === 'INVALID_ORDER_DATA') {
        await safeSend(orderCreated.message);
      } else if (orderCreated?.code === 'NO_ACTIVE_SHIFT') {
        // La caja aún no está abierta: NO es un error técnico, es "todavía no
        // abrimos". No confirmamos ni prometemos; invitamos a esperar la apertura.
        console.warn(`[WhatsApp Bot] Pedido de ${phone} sin turno de caja abierto; no se crea (NO_ACTIVE_SHIFT).`);
        await safeSend(orderCreated.message || '¡Ya casi! Todavía no abrimos la caja 🙏. En cuanto abramos tomo tu pedido enseguida.');
      } else {
        // Falla al registrar: NUNCA decir "confirmado". Dejar el hilo abierto.
        console.error(`[WhatsApp Bot] FALLO al crear orden CONFIRMED de ${phone}. items=${JSON.stringify(items)}`);
        await safeSend('No pude comprobar el registro del pedido. Aún no está confirmado; contacta a la caja antes de repetirlo.');
      }
    } else if (status === 'ADD_TO_ORDER' && items.length > 0) {
      if (!activeOrderId) {
        // Gemini quiso agregar pero ya no hay orden activa (expiró / restart).
        await safeSend('No encuentro un pedido activo reciente para agregarle 🙏. ¿Te lo confirmo como un pedido nuevo?');
      } else {
        // Si la orden vino REHIDRATADA de BD, su canAdd pudo quedar rancio (el
        // ticket puede haber salido a reparto o cobrado desde la consulta).
        // Re-validar contra el backend justo antes de agregar.
        if (recentOrder?.hydrated && botApi.useApi()) {
          let fresh = null;
          try {
            fresh = await botApi.getChatOrder(chatRefFor(chatKey));
          } catch { /* si la validación falla, se intenta agregar igual: el backend valida */ }
          if (fresh && (fresh.id !== activeOrderId || !fresh.canAdd)) {
            await safeSend('Tu pedido anterior ya salió o ya está cobrado 🙏, así que no puedo agregarle nada. ¿Te lo confirmo como un pedido nuevo?');
            return;
          }
        }
        const addResponse = await require('./orderProcessor').addItemsToOrder(activeOrderId, geminiResponse, restaurant.id, process.env.PORT || 3001);
        if (addResponse) {
          recentOrders.set(phone, { ...recentOrder, orderId: activeOrderId, timestamp: Date.now() });
          history.length = 0;
          history.push({
            role: 'model',
            text: `Productos adicionales agregados al pedido activo #${recentOrder?.orderNumber || activeOrderId}.`,
          });
          await safeSend('Productos adicionales registrados. La caja confirma el nuevo total.');
        } else {
          console.error(`[WhatsApp Bot] FALLO al agregar items a la orden ${activeOrderId} de ${phone}.`);
          await safeSend('No pude agregarlo a tu pedido anterior 🙏. ¿Te lo pongo como un pedido nuevo?');
        }
      }
    } else if (status === 'AI_ERROR') {
      // La IA no pudo procesar el mensaje (cuota/caída del proveedor o parseo).
      // Si fue caída del proveedor (aiDown), alertamos al dueño (correo vía
      // WHATSAPP_BOT_ALERT_WEBHOOK, throttled 1/5min) para que un humano tome el
      // chat. Esto es justo lo que faltó el 12–13 jul: el bot quedó respondiendo
      // "problema técnico" ~2 días por el tope de Gemini sin que nadie se enterara.
      if (geminiResponse.aiDown) {
        notifyAlert('IA no disponible (cuota/proveedor)', geminiResponse.errorDetail || 'todos los modelos fallaron');
      }
      if (geminiResponse.replyMessage) {
        await safeSend(sanitizeReply(geminiResponse.replyMessage));
      }
    } else {
      // Conversational responses cannot assert a write or kitchen state.
      if (geminiResponse.replyMessage) {
        await safeSend(sanitizeReply(conversationReply(geminiResponse.replyMessage)));
      }
    }
   } catch (handlerErr) {
      // Red de seguridad: un throw aquí (p.ej. blip de Prisma) sería
      // unhandledRejection y en Node 22 MATA el proceso. Lo contenemos.
      console.error('[WhatsApp Bot] Error no capturado en el handler de mensaje:', handlerErr?.message || handlerErr);
   } finally {
      saveConversations();
   }
  };

  // Mutex por chat: serializa los mensajes del MISMO remitente para que dos
  // mensajes casi simultáneos no corran en paralelo mutando el mismo historial
  // ni disparen doble CONFIRMED (orden duplicada). Encadena por msg.from.
  const chatLocks = new Map();
  const handleIncomingMessage = (msg) => {
    // Cortar ANTES de encolar en chatLocks: si se encolara durante los 15s de
    // sync inicial, la promesa correría después de que lastReadyAt se active.
    if (sessionState !== 'ready' || !lastReadyAt || Date.now() < lastReadyAt) return;
    if (!botConfig.getActive()) return;
    const rawTs = Number(msg?.timestamp);
    if (!Number.isFinite(rawTs) || rawTs <= 0 || rawTs * 1000 < lastReadyAt || Date.now() - rawTs * 1000 > MAX_MSG_AGE_MS) return;
    if (msg.fromMe || !isCustomerChatId(msg.from)) return;
    const id = messageId(msg);
    if (!id || seenInbound.has(id)) return;
    for (const [key, at] of seenInbound) if (Date.now() - at > 24 * 60 * 60000) seenInbound.delete(key);
    seenInbound.set(id, Date.now());
    saveConversations();

    const key = msg.from || 'unknown';
    const prev = chatLocks.get(key) || Promise.resolve();
    const process = async () => { inFlight++; try { await processMessage(msg); } finally { inFlight--; } };
    const run = prev.then(process, process);
    const tail = run.catch(() => {});
    chatLocks.set(key, tail);
    tail.then(() => { if (chatLocks.get(key) === tail) chatLocks.delete(key); });
    return run;
  };

  whatsappClient.on('message_create', (msg) => {
    try {
      if (!msg.fromMe) return;
      if (sessionState !== 'ready' || !lastReadyAt) return;
      const mType = String(msg.type || '').toLowerCase();
      if (
        mType === 'notification_template' ||
        mType === 'e2e_notification' ||
        mType === 'gp2' ||
        mType === 'call_log' ||
        mType === 'revoked' ||
        mType === 'ciphertext' ||
        mType === 'protocol' ||
        mType === 'system' ||
        mType === 'poll_creation' ||
        mType === 'reaction'
      ) {
        return;
      }
      const chatKey = chatKeyForMessage(msg);
      if (!isCustomerChatId(chatKey)) return;
      if (isBotAuthoredOutgoing(msg, chatKey)) return;

      // Intervención humana: si TÚ (u otro humano) respondes MANUALMENTE en un
      // chat de cliente, el bot se calla 1h en ESE chat — con o sin pedido
      // reciente. Antes solo pausaba dentro de 1h de un pedido que el bot había
      // tomado (recentOrderChats); en chats atendidos a mano sin pedido, el bot
      // seguía contestando encima del humano ("Gracias" → "De nada" repetido).
      const bodyText = String(msg.body || '').trim();
      const lowerBody = bodyText.toLowerCase();

      // Comandos de control para el personal desde el chat:
      // #bot, !bot, /bot, #activar -> Reactiva el bot inmediatamente en este chat
      const isReactivateCmd =
        /^(?:#|!|\/)(?:bot|activar|tomarpedido)\b/i.test(bodyText) ||
        lowerBody.includes('#bot') ||
        lowerBody.includes('!bot') ||
        lowerBody.includes('/bot');

      if (isReactivateCmd) {
        const recent = recentOrderChats.get(chatKey);
        unpauseBotForChat(chatKey, recent?.phone || null);
        console.log(`[WhatsApp Bot] Chat ${chatKey} RE-ACTIVADO por comando de personal ("${bodyText}").`);

        // Si el mensaje fue exclusivamente el comando (ej. "#bot"), el bot saluda e invita a pedir:
        if (/^(?:#|!|\/)(?:bot|activar|tomarpedido)$/i.test(bodyText)) {
          const target = msg.to || msg.from;
          if (target && whatsappClient) {
            whatsappClient.sendMessage(target, '¡Hola! 😊 Con gusto sigo tomando tu pedido por aquí. ¿Qué se te antoja ordenar? 🍔🌮')
              .then(sent => rememberBotSentMessage(sent))
              .catch(e => console.error('[WhatsApp Bot] Error enviando saludo de reactivación:', e?.message));
          }
        } else {
          // Si el mensaje era una respuesta con #bot (ej. "El envío son $25 #bot"):
          // guardamos el texto limpio en el historial del bot para que conozca el contexto:
          const cleanText = bodyText.replace(/(?:#|!|\/)bot\b/gi, '').trim();
          // A @lid is not a phone number. Resolve the conversation only when
          // its next inbound message supplies the same identity as normal processing.
          if (cleanText) {
            resumeContexts.set(chatKey, { text: cleanText, at: Date.now() });
            saveConversations();
          }
        }
        return;
      }

      // #pausa, #stop -> Pausa explícita por 2 horas si el personal quiere atender a mano
      const isPauseCmd = /^(?:#|!|\/)(?:pausa|stop|humano|manual)$/i.test(bodyText);
      if (isPauseCmd) {
        const recent = recentOrderChats.get(chatKey);
        const until = Date.now() + 2 * 60 * 60 * 1000;
        humanHandoffs.set(chatKey, { phone: recent?.phone || null, reason: 'explicit_pause_cmd', until });
        saveConversations();
        console.log(`[WhatsApp Bot] Chat ${chatKey} pausado MANUALMENTE por comando por 2 horas.`);
        return;
      }

      const recent = recentOrderChats.get(chatKey);
      const handoff = pauseBotForChat(chatKey, recent?.phone || null, 'human_message');
      const until = new Date(handoff.until).toISOString();
      console.log(`[WhatsApp Bot] Intervencion humana detectada en ${chatKey}; bot pausado hasta ${until}.`);
    } catch (err) {
      console.error('[WhatsApp Bot] Error detectando handoff humano:', err?.message || err);
    }
  });

  whatsappClient.on('message', handleIncomingMessage);

  // Backfill DESACTIVADO (2026-07-03 — incidente de envío masivo). Antes, al
  // reconectar, respondía a todos los chats con no-leídos recientes → disparaba
  // una RÁFAGA de "bienvenidas" a ~20 contactos DE GOLPE en cada reconexión
  // (con los múltiples restarts del día se repitió). Eso es envío no solicitado
  // masivo → riesgo REAL de BANEO del número en WhatsApp. Se desactiva: al
  // reconectar el bot NO auto-responde NADA del backlog; solo atiende mensajes
  // NUEVOS por el evento 'message'. Los no-leídos quedan para que el humano los
  // vea/atienda. NO reactivar sin dedupe robusto POR-MENSAJE en BD (el dedupe en
  // memoria se pierde al reiniciar, y customerPhone suele venir null desde @lid).
  const backfillUnread = async () => {
    console.log('[WhatsApp Bot] Backfill de no-leídos DESACTIVADO (anti-blast): el backlog NO se auto-responde; solo se atienden mensajes nuevos.');
  };

  // Sesión perdida (WhatsApp desvinculó el dispositivo, o cerró el navegador):
  // salimos con código 1 para que Railway reinicie; LocalAuth reintenta con la
  // sesión del volumen y, si fue desvinculación real, /qr mostrará QR nuevo.
  whatsappClient.on('disconnected', (reason) => {
    sessionState = 'lost';
    notifyAlert('Sesión desconectada', reason);
    console.error('[WhatsApp Bot] DESCONECTADO:', reason, '→ saliendo para que Railway reinicie.');
    setTimeout(() => process.exit(1), 1500);
  });
  whatsappClient.on('auth_failure', (m) => {
    sessionState = 'lost';
    notifyAlert('Fallo de autenticación', m);
    console.error('[WhatsApp Bot] AUTH_FAILURE:', m, '→ saliendo para reintentar/re-vincular.');
    setTimeout(() => process.exit(1), 1500);
  });

  whatsappClient.initialize().catch(err => {
    console.error('[WhatsApp Bot] Error al inicializar:', err, '→ saliendo para que Railway reintente.');
    setTimeout(() => process.exit(1), 1500);
  });
}

async function destroyWhatsApp() {
  const c = whatsappClient;
  whatsappClient = null;
  latestQr = null;
  lastReadyAt = 0;
  sessionState = 'standby';
  outbox?.stop();
  if (c) {
    try {
      c.removeAllListeners();
      await c.destroy();
      console.log('[WhatsApp Bot] Sesión de WhatsApp cerrada (modo STANDBY).');
    } catch (e) {
      console.warn('[WhatsApp Bot] Error cerrando sesión en standby:', e?.message || e);
    }
  }
}

function clearAllHandoffs() {
  const count = humanHandoffs.size;
  humanHandoffs.clear();
  saveConversations();
  console.log(`[WhatsApp Bot] ${count} pausa(s) por intervención humana limpiadas manualmente.`);
  return count;
}

module.exports = {
  initWhatsApp,
  destroyWhatsApp,
  clearAllHandoffs,
  unpauseBotForChat,
  getWhatsAppClient: () => whatsappClient,
  getLatestQr: () => latestQr,
  getSessionState: () => sessionState,
  getOperationalStatus: () => ({ active: botConfig.getActive(), exclusionsReady: exclusionsReady(), inFlight, outbox: outbox?.status() || { pending: 0, needsReview: 0 } }),
  getIgnoredGroupInfo,
  refreshIgnoredGroup,
};
