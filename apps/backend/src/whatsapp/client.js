const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { processWhatsAppMessage } = require('./gemini');
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

// Momento (ms) en que el bot quedó 'ready' por última vez. Lo usa el guard
// ANTI-BLAST: al reconectar, whatsapp-web.js re-entrega por el evento 'message'
// los mensajes que llegaron mientras estuvo offline (backlog); si los
// contestamos, sale una RÁFAGA de respuestas a decenas de clientes de golpe →
// envío no solicitado → riesgo REAL de baneo (incidentes 2026-07-03/04). Solo
// atendemos mensajes cuyo timestamp sea posterior a este 'ready' (con gracia).
let lastReadyAt = 0;
// Gracia para no descartar un mensaje legítimo enviado justo antes de reconectar.
const BACKLOG_GRACE_MS = 60 * 1000;

// Alerta best-effort al dueño cuando el bot necesita atención (sesión perdida /
// QR requerido). Se dispara a un webhook configurable WHATSAPP_BOT_ALERT_WEBHOOK
// (Slack/Discord/Telegram/n8n). Throttled por tipo para no spamear con el QR que
// rota. Si la env no está seteada, no hace nada.
const alertThrottle = new Map();
async function notifyAlert(event, detail) {
  const url = process.env.WHATSAPP_BOT_ALERT_WEBHOOK;
  if (!url) return;
  const now = Date.now();
  if (now - (alertThrottle.get(event) || 0) < 5 * 60 * 1000) return; // máx 1/5min por tipo
  alertThrottle.set(event, now);
  const text = `⚠️ Bot WhatsApp (${process.env.WHATSAPP_BOT_RESTAURANT_ID || 'restaurante'}): ${event}${detail ? ` — ${detail}` : ''}`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
const MAX_HISTORY_MESSAGES = 24;

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
// Anti-spam / anti-baneo: último texto enviado por chat { chatKey: {text, at} }.
// safeSend lo usa para NO reenviar el mismo mensaje al mismo chat en una ventana
// corta (evita ráfagas de idénticos que disparan el bloqueo de whatsapp-web.js).
const lastBotSendByChat = new Map();
const HUMAN_HANDOFF_MS = 60 * 60 * 1000;
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
// de enviar: tokens [ID: x]/(ID: x)/variantId/modifierId y cuids sueltos.
function sanitizeReply(text) {
  return String(text)
    .replace(/\s*[\[(]\s*(?:ID|variantId|modifierId)\s*:\s*[^\])]+[\])]/gi, '')
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
  return entry;
}

function getActiveHandoff(chatKey, phone) {
  cleanupExpiredHandoffs();
  const phoneKey = phoneHandoffKey(phone);
  return humanHandoffs.get(chatKey) || (phoneKey ? humanHandoffs.get(phoneKey) : null) || null;
}

function messageId(msg) {
  return msg?.id?._serialized || msg?.id?.id || null;
}

function outgoingIntentKey(chatKey, body) {
  return `${chatKey || ''}::${String(body || '').slice(0, 800)}`;
}

function rememberBotOutgoingIntent(chatKey, body) {
  if (!chatKey) return;
  botOutgoingIntents.set(outgoingIntentKey(chatKey, body), Date.now());
}

function rememberBotSentMessage(msg) {
  const id = messageId(msg);
  if (id) botSentMessages.set(id, Date.now());
}

function isBotAuthoredOutgoing(msg, chatKey) {
  const id = messageId(msg);
  if (id && botSentMessages.has(id)) return true;
  const key = outgoingIntentKey(chatKey, msg?.body);
  const timestamp = botOutgoingIntents.get(key);
  if (!timestamp) return false;
  if (Date.now() - timestamp > BOT_OUTGOING_INTENT_MS) {
    botOutgoingIntents.delete(key);
    return false;
  }
  botOutgoingIntents.delete(key);
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
let ignoredGroup = { name: null, ids: new Set(), phones: new Set(), count: 0, loadedAt: 0, error: null };

async function refreshIgnoredGroup() {
  // Nombre del grupo editable desde el admin (BD, fallback a env). Ver botConfig.js.
  const name = botConfig.getIgnoreGroupName();
  if (!name || !whatsappClient) {
    ignoredGroup = { name: null, ids: new Set(), phones: new Set(), count: 0, loadedAt: Date.now(), error: null };
    return;
  }
  try {
    const chats = await whatsappClient.getChats();
    const group = chats.find(c => c.isGroup && String(c.name || '').trim().toLowerCase() === name.toLowerCase());
    if (!group) {
      const availableGroups = chats.filter(c => c.isGroup).map(c => c.name).slice(0, 50);
      ignoredGroup = { name, ids: new Set(), phones: new Set(), count: 0, loadedAt: Date.now(), error: 'grupo no encontrado', availableGroups };
      console.warn(`[WhatsApp Bot] Grupo a ignorar "${name}" no encontrado. Grupos: ${availableGroups.join(' | ')}`);
      return;
    }
    const ids = new Set();
    const phones = new Set();
    for (const part of (group.participants || [])) {
      const sid = part.id?._serialized;
      if (sid) ids.add(sid);
      const ph = last10Digits(part.id?.user || sid || '');
      if (ph.length >= 10) phones.add(ph);
    }
    ignoredGroup = { name, ids, phones, count: (group.participants || []).length, loadedAt: Date.now(), error: null };
    console.log(`[WhatsApp Bot] Grupo ignorado "${name}": ${ignoredGroup.count} miembros (${ids.size} ids, ${phones.size} tel).`);
  } catch (e) {
    ignoredGroup.error = e.message;
    console.error('[WhatsApp Bot] Error cargando el grupo a ignorar:', e.message);
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
        orderNumber: true, subtotal: true, deliveryFee: true, total: true, discount: true,
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

function initWhatsApp(io) {
  console.log('[WhatsApp Bot] Inicializando cliente...');

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
      // executablePath: en contenedor usamos el Chromium del sistema
      // (PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium) en vez del bundled.
      ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
      // Flags container-safe: sin sandbox (root en Docker) y sin /dev/shm
      // (limitado en contenedores → Chromium crashea sin --disable-dev-shm-usage).
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
      ],
    },
  });

  whatsappClient.on('qr', (qr) => {
    latestQr = qr;
    sessionState = 'qr';
    // En prod con sesión en volumen NO debería aparecer QR salvo desvinculación:
    // avisar (throttled) para que alguien lo escanee en /qr.
    notifyAlert('QR requerido — escanéalo en /qr', null);
    console.log('[WhatsApp Bot] Escanea este código QR con tu WhatsApp:');
    qrcode.generate(qr, { small: true });

    // Generar un link para verlo en el navegador (útil si la consola lo corta)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    console.log('\n[WhatsApp Bot] Si no puedes escanearlo en consola, abre este enlace en tu navegador:');
    console.log(qrUrl, '\n');

    // Opcional: Emitir el QR vía socket para mostrarlo en el panel TPV de Admin
    if (io) {
      io.emit('whatsapp:qr', qr);
    }
  });

  whatsappClient.on('authenticated', () => {
    latestQr = null;
  });

  whatsappClient.on('ready', async () => {
    latestQr = null;
    sessionState = 'ready';
    // Marca de corte para el guard anti-blast: a partir de aquí solo se
    // atienden mensajes con timestamp >= (lastReadyAt - gracia). Todo lo que
    // whatsapp-web.js re-entregue del backlog (mensajes viejos que llegaron
    // mientras estuvo offline) queda por debajo del corte y se ignora.
    lastReadyAt = Date.now();
    console.log('[WhatsApp Bot] Cliente WhatsApp listo y conectado!');
    if (io) {
      io.emit('whatsapp:ready');
    }
    // Cargar la config editable del admin (BD, fallback a env; auto-siembra en
    // el primer arranque) ANTES de leer el grupo a ignorar, que sale de ahí.
    await botConfig.init();
    // Cargar el grupo a ignorar ANTES del backfill (para no responder a staff),
    // y refrescarlo cada 10 min (recoge altas/bajas de miembros sin redeploy).
    await refreshIgnoredGroup();
    setInterval(refreshIgnoredGroup, 10 * 60 * 1000).unref?.();
    // Atender lo que entró mientras el bot estuvo caído (redeploy/restart).
    await backfillUnread();
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
    const msgTsMs = Number(msg.timestamp) > 0 ? Number(msg.timestamp) * 1000 : Date.now();
    if (lastReadyAt && msgTsMs < lastReadyAt - BACKLOG_GRACE_MS) {
      console.log(`[WhatsApp Bot] Backlog ignorado (anti-blast) de ${msg.from}: ts=${new Date(msgTsMs).toISOString()} < ready=${new Date(lastReadyAt).toISOString()}.`);
      return;
    }

    // Interruptor global desde el admin: si el bot está en pausa (enabled=false
    // en IntegrationConfig), no responde a nadie hasta reactivarlo. Ver botConfig.js.
    if (!botConfig.getActive()) return;

    // EnvÃ­o robusto (sendMessage anda mejor con @lid que msg.reply).
    const safeSend = async (text) => {
      try {
        // Anti-baneo: no reenviar el MISMO texto al mismo chat dentro de 60s.
        // Corta las rafagas de mensajes identicos (p.ej. varios "problema
        // tecnico" seguidos al reprocesar no-leidos), que disparan el bloqueo.
        const prevSend = lastBotSendByChat.get(chatKey);
        if (prevSend && prevSend.text === text && Date.now() - prevSend.at < 60000) {
          console.log(`[WhatsApp Bot] Envio duplicado suprimido (anti-spam) a ${msg.from}`);
          return;
        }
        lastBotSendByChat.set(chatKey, { text, at: Date.now() });
        rememberBotOutgoingIntent(chatKey, text);
        const sent = await whatsappClient.sendMessage(msg.from, text);
        rememberBotSentMessage(sent);
        console.log(`[WhatsApp Bot] Respuesta enviada a ${msg.from}`);
      } catch (err) {
        console.error('[WhatsApp Bot] Error enviando respuesta:', err?.message || err);
      }
    };

    // Obtener texto o ubicación
    let messageText = msg.body;
    let locationData = null;
    
    if (msg.type === 'location' && msg.location) {
      locationData = { lat: msg.location.latitude, lng: msg.location.longitude };
      messageText = `[El cliente ha enviado su ubicación por GPS: latitud ${locationData.lat}, longitud ${locationData.lng}]`;
    }

    console.log(`[WhatsApp Bot] Mensaje recibido de ${msg.from}: ${messageText}`);
    
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

    const detectedPhone = extractPhoneFromText(messageText);
    if (detectedPhone) updateCustomerProfile(phone, { customerPhone: detectedPhone });
    const profile = customerProfiles.get(phone) || {};
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

    // COMPROBANTE DE PAGO / imagen: el bot NO lee imágenes ni PDFs. Si ya hay un
    // pedido activo reciente, acusar recibo y NO mandar a Gemini (un mensaje vago
    // + el historial con el pedido hacía que Gemini re-confirmara y duplicara la
    // orden — incidente Gissel 2026-07-02). Con la guarda de arriba tampoco se
    // duplicaría, pero así el cliente recibe una respuesta útil en vez de que
    // Gemini reaccione raro a una imagen "vacía".
    if ((msg.type === 'image' || msg.type === 'document') && recentConfirmedId) {
      console.log(`[WhatsApp Bot] Imagen/documento con pedido reciente ${recentConfirmedId} de ${phone}; se acusa recibo sin reprocesar.`);
      recentOrders.set(phone, { ...recentOrder, orderId: recentConfirmedId, timestamp: Date.now() });
      await safeSend('¡Gracias! Recibí tu comprobante 🙌. Tu pedido ya está registrado y en preparación; enseguida validamos el pago. Si necesitas algo más, aquí estoy.');
      return;
    }

    // Procesar con Gemini
    console.log(`[WhatsApp Bot] Procesando con Gemini (phone=${phone}, invalid=${isInvalidPhone}, tenant=${restaurant.id})...`);
    const geminiResponse = await processWhatsAppMessage(phone, messageText, restaurant.id, history, activeOrderId, isInvalidPhone, profile, activeOrderInfo);
    console.log(`[WhatsApp Bot] Gemini status=${geminiResponse?.status}, reply=${!!geminiResponse?.replyMessage}`);

    // Actualizar historial localmente
    history.push({ role: 'user', text: messageText });
    // Guardamos la respuesta generada (si existe) para que Gemini recuerde
    if (geminiResponse.replyMessage) {
       history.push({ role: 'model', text: geminiResponse.replyMessage });
    }

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
    if (status === 'CONFIRMED' && items.length > 0) {
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
      const orderCreated = await createOrderFromGemini(restaurant.id, geminiResponse, process.env.PORT || 3001, chatKey);
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
        history.push({
          role: 'model',
          text: `El pedido ya estaba registrado antes: folio ${orderCreated.orderNumber}. NO se creó uno nuevo.${orderCreated.correctionFlagged ? ' Se avisó a la caja de un posible cambio.' : ''}`,
        });
        pruneHistory(history);
        if (orderCreated.correctionFlagged) {
          await safeSend(`Ya tenía registrado tu pedido *#${orderCreated.orderNumber}* y noté cambios en lo que me enviaste 👀. Le avisé a la caja para que lo revise y ajuste — no creé un pedido duplicado. Si quieres AGREGAR algo más, dime qué y lo sumo.`);
        } else {
          await safeSend(`¡Tu pedido *#${orderCreated.orderNumber}* ya está registrado y en preparación! 🙌 No creé uno nuevo para no duplicarlo. Si quieres AGREGAR algo dime qué y lo sumo; y si de verdad es OTRO pedido igual, un asesor te lo confirma en un momento.`);
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
        const totalLine = orderCreated.total != null ? `\n💵 Total: $${orderCreated.total} (incluye envío si aplica)` : '';
        const mins = orderCreated.estimatedMinutes || 30;
        history.push({
          role: 'model',
          text: `Pedido registrado en TPV: folio ${orderCreated.orderNumber}, total ${orderCreated.total ?? 'pendiente'}, pago ${geminiResponse.paymentMethod || 'no especificado'}.`,
        });
        pruneHistory(history);
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
          const envioLn = Number(detail.deliveryFee) > 0 ? `\nEnvío: $${detail.deliveryFee}` : '';
          const descLn = Number(orderCreated.discount) > 0 ? `\nDescuento: -$${orderCreated.discount}` : '';
          ticket = `✅ *¡Pedido confirmado!* — Folio *#${orderCreated.orderNumber}*\n\n🧾 *Tu ticket:*\n${lineas}\n━━━━━━━━━━━━━\nSubtotal: $${detail.subtotal}${envioLn}${descLn}\n*Total: $${detail.total}*\n\n⏱️ Entrega estimada: ~${mins} min.\n¡Gracias por tu compra! 🍔`;
        } else {
          ticket = `✅ ¡Pedido confirmado! Folio *#${orderCreated.orderNumber}*${totalLine}\n⏱️ Tiempo estimado: ~${mins} min.\n¡Gracias por tu compra! 🍔`;
        }
        await safeSend(ticket);
        // Recompensa por hitos de compra (el backend la genera cada N compras).
        const reward = orderCreated.reward;
        if (reward && reward.couponCode) {
          const pct = reward.discountValue;
          const vence = reward.expiresAt ? new Date(reward.expiresAt).toLocaleDateString('es-MX') : '';
          await safeSend(`🎉 ¡Y esta es tu compra #${reward.ordersCount} con nosotros! Te ganaste un cupón:\n🎟️ *${reward.couponCode}* — ${pct}% de descuento en tu próximo pedido${vence ? `\n📅 Vence el ${vence}` : ''}.\n¡Gracias por tu preferencia! 🙌`);
        }
      } else if (orderCreated?.code === 'NO_ACTIVE_SHIFT') {
        // La caja aún no está abierta: NO es un error técnico, es "todavía no
        // abrimos". No confirmamos ni prometemos; invitamos a esperar la apertura.
        console.warn(`[WhatsApp Bot] Pedido de ${phone} sin turno de caja abierto; no se crea (NO_ACTIVE_SHIFT).`);
        await safeSend(orderCreated.message || '¡Ya casi! Todavía no abrimos la caja 🙏. En cuanto abramos tomo tu pedido enseguida.');
      } else {
        // Falla al registrar: NUNCA decir "confirmado". Dejar el hilo abierto.
        console.error(`[WhatsApp Bot] FALLO al crear orden CONFIRMED de ${phone}. items=${JSON.stringify(items)}`);
        await safeSend('Uy, tuve un detalle registrando tu pedido 🙏. Un asesor te confirma en un momento; si gustas, escríbeme de nuevo tu pedido para reintentar.');
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
          await safeSend(geminiResponse.replyMessage ? sanitizeReply(geminiResponse.replyMessage) : '¡Listo! Lo agregué a tu pedido. 🍔');
        } else {
          console.error(`[WhatsApp Bot] FALLO al agregar items a la orden ${activeOrderId} de ${phone}.`);
          await safeSend('No pude agregarlo a tu pedido anterior 🙏. ¿Te lo pongo como un pedido nuevo?');
        }
      }
    } else {
      // CONVERSING (o cualquier otro estado): responder normal, sanitizado.
      if (geminiResponse.replyMessage) {
        await safeSend(sanitizeReply(geminiResponse.replyMessage));
      }
    }
   } catch (handlerErr) {
      // Red de seguridad: un throw aquí (p.ej. blip de Prisma) sería
      // unhandledRejection y en Node 22 MATA el proceso. Lo contenemos.
      console.error('[WhatsApp Bot] Error no capturado en el handler de mensaje:', handlerErr?.message || handlerErr);
   }
  };

  // Mutex por chat: serializa los mensajes del MISMO remitente para que dos
  // mensajes casi simultáneos no corran en paralelo mutando el mismo historial
  // ni disparen doble CONFIRMED (orden duplicada). Encadena por msg.from.
  const chatLocks = new Map();
  const handleIncomingMessage = (msg) => {
    const key = msg.from || 'unknown';
    const prev = chatLocks.get(key) || Promise.resolve();
    const run = prev.then(() => processMessage(msg), () => processMessage(msg));
    const tail = run.catch(() => {});
    chatLocks.set(key, tail);
    tail.then(() => { if (chatLocks.get(key) === tail) chatLocks.delete(key); });
    return run;
  };

  whatsappClient.on('message_create', (msg) => {
    try {
      if (!msg.fromMe) return;
      const chatKey = chatKeyForMessage(msg);
      if (!isCustomerChatId(chatKey)) return;
      if (isBotAuthoredOutgoing(msg, chatKey)) return;

      // Intervención humana: si TÚ (u otro humano) respondes MANUALMENTE en un
      // chat de cliente, el bot se calla 1h en ESE chat — con o sin pedido
      // reciente. Antes solo pausaba dentro de 1h de un pedido que el bot había
      // tomado (recentOrderChats); en chats atendidos a mano sin pedido, el bot
      // seguía contestando encima del humano ("Gracias" → "De nada" repetido).
      const recent = recentOrderChats.get(chatKey);
      const handoff = pauseBotForChat(chatKey, recent?.phone || null, 'human_message');
      const until = new Date(handoff.until).toISOString();
      console.log(`[WhatsApp Bot] Intervencion humana detectada en ${chatKey}; bot pausado hasta ${until}.`);
    } catch (err) {
      console.error('[WhatsApp Bot] Error detectando handoff humano:', err?.message || err);
    }
  });

  whatsappClient.on('message', (msg) => { handleIncomingMessage(msg); });

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

module.exports = {
  initWhatsApp,
  getWhatsAppClient: () => whatsappClient,
  getLatestQr: () => latestQr,
  getSessionState: () => sessionState,
  getIgnoredGroupInfo,
  refreshIgnoredGroup,
};
