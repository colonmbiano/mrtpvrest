const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { processWhatsAppMessage } = require('./gemini');
const { createOrderFromGemini } = require('./orderProcessor');
const { isAudioMessage, transcribeWhatsAppAudio } = require('./audioTranscription');
const { prisma } = require('@mrtpvrest/database');

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
const recentOrderChats = new Map();
const humanHandoffs = new Map();
const botOutgoingIntents = new Map();
const botSentMessages = new Map();
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
  const match = String(text || '').match(/(?:\+?\d[\d\s().-]{8,}\d)/);
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
  const list = (process.env.WHATSAPP_BOT_IGNORE_NUMBERS || '')
    .split(',').map(last10Digits).filter(d => d.length >= 10);
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
  const name = (process.env.WHATSAPP_BOT_IGNORE_GROUP_NAME || '').trim();
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
    console.log('[WhatsApp Bot] Cliente WhatsApp listo y conectado!');
    if (io) {
      io.emit('whatsapp:ready');
    }
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

    // EnvÃ­o robusto (sendMessage anda mejor con @lid que msg.reply).
    const safeSend = async (text) => {
      try {
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
    const restaurant = pinnedRestaurantId
      ? await prisma.restaurant.findFirst({ where: { id: pinnedRestaurantId, isActive: true } })
      : await prisma.restaurant.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });

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

    // Revisar si tiene una orden reciente (menos de 15 minutos)
    let activeOrderId = null;
    const recentOrder = recentOrders.get(phone);
    if (recentOrder && (Date.now() - recentOrder.timestamp < 15 * 60 * 1000)) {
      activeOrderId = recentOrder.orderId;
    } else if (recentOrder) {
      // Expiró
      recentOrders.delete(phone);
    }

    // Procesar con Gemini
    console.log(`[WhatsApp Bot] Procesando con Gemini (phone=${phone}, invalid=${isInvalidPhone}, tenant=${restaurant.id})...`);
    const geminiResponse = await processWhatsAppMessage(phone, messageText, restaurant.id, history, activeOrderId, isInvalidPhone, profile);
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

    if (status === 'CONFIRMED' && items.length > 0) {
      // CREAR LA ORDEN PRIMERO; confirmar SOLO si el TPV la registró. Antes se
      // enviaba "¡confirmado!" y DESPUÉS se creaba: si el POST fallaba, el
      // cliente esperaba un pedido que nunca existió. Además el folio y el total
      // se arman en CÓDIGO desde la respuesta del server (nunca lo que alucine
      // Gemini) — cumple "totales siempre server-side".
      const orderCreated = await createOrderFromGemini(restaurant.id, geminiResponse, process.env.PORT || 3001);
      if (orderCreated && orderCreated.id) {
        recentOrders.set(phone, { orderId: orderCreated.id, timestamp: Date.now() });
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
        await safeSend(`✅ ¡Pedido confirmado! Folio *#${orderCreated.orderNumber}*${totalLine}\n⏱️ Tiempo estimado: ~${mins} min.\n¡Gracias por tu compra! 🍔`);
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
        const addResponse = await require('./orderProcessor').addItemsToOrder(activeOrderId, geminiResponse, restaurant.id, process.env.PORT || 3001);
        if (addResponse) {
          recentOrders.set(phone, { orderId: activeOrderId, timestamp: Date.now() });
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

      const recent = recentOrderChats.get(chatKey);
      if (!recent) return;
      if (Date.now() - recent.timestamp > HUMAN_HANDOFF_MS) {
        recentOrderChats.delete(chatKey);
        return;
      }

      const handoff = pauseBotForChat(chatKey, recent.phone, 'human_message_after_order');
      const until = new Date(handoff.until).toISOString();
      console.log(`[WhatsApp Bot] Intervencion humana detectada en ${chatKey}; bot pausado hasta ${until}.`);
    } catch (err) {
      console.error('[WhatsApp Bot] Error detectando handoff humano:', err?.message || err);
    }
  });

  whatsappClient.on('message', (msg) => { handleIncomingMessage(msg); });

  // Backfill de no-leídos al reconectar: whatsapp-web.js NO emite 'message' por
  // el backlog anterior a que se registre el listener, así que los mensajes que
  // entran durante un redeploy/restart se PERDERÍAN. Aquí, tras conectar, se
  // procesan los chats individuales con no-leídos RECIENTES (< 30 min) por el
  // mismo pipeline y se marcan como vistos. Esto elimina la pérdida de pedidos
  // en cada deploy.
  const backfillUnread = async () => {
    try {
      const chats = await whatsappClient.getChats();
      const cutoffSec = Math.floor(Date.now() / 1000) - 30 * 60; // wwebjs: timestamp en segundos
      let procesados = 0;
      for (const chat of chats) {
        if (chat.isGroup || (chat.unreadCount || 0) <= 0) continue;
        let msgs = [];
        try { msgs = await chat.fetchMessages({ limit: Math.min(chat.unreadCount, 10) }); } catch { continue; }
        for (const m of msgs) {
          if (m.fromMe || (m.timestamp || 0) < cutoffSec) continue;
          await handleIncomingMessage(m);
          procesados++;
        }
        try { await chat.sendSeen(); } catch {}
      }
      if (procesados > 0) console.log(`[WhatsApp Bot] Backfill: ${procesados} mensaje(s) no leído(s) atendido(s) tras reconectar.`);
    } catch (e) {
      console.error('[WhatsApp Bot] Error en backfill de no-leídos:', e?.message || e);
    }
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
