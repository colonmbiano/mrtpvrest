const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { processWhatsAppMessage } = require('./gemini');
const { createOrderFromGemini } = require('./orderProcessor');
const { prisma } = require('@mrtpvrest/database');

let whatsappClient = null;

// Último QR emitido (string). Lo usa el worker de Railway para exponerlo en un
// endpoint HTTP y poder escanearlo sin depender de los logs. Se limpia al
// conectar ('ready') o al autenticar.
let latestQr = null;

// Mapa para guardar el historial corto de conversaciones por número
// Formato: { "5215551234567": [ { role: "user", text: "hola" }, { role: "model", text: "Hola soy el mesero" } ] }
const chatHistory = new Map();

// Mapa para guardar órdenes recientes confirmadas por número. Permite añadir items.
// Formato: { "5215551234567": { orderId: "abc", timestamp: 123456789 } }
const recentOrders = new Map();

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

// Lista negra: números que el bot NO debe contestar (staff, proveedores,
// contactos que atiendes a mano). Se configuran en WHATSAPP_BOT_IGNORE_NUMBERS
// (separados por coma) y se comparan por los ÚLTIMOS 10 DÍGITOS (tolera lada
// 52/521 y formatos varios). Se lee por-mensaje para que un cambio de la
// variable aplique con solo reiniciar (sin tocar código).
function last10Digits(s) { return String(s || '').replace(/\D/g, '').slice(-10); }
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

  whatsappClient.on('ready', () => {
    latestQr = null;
    console.log('[WhatsApp Bot] Cliente WhatsApp listo y conectado!');
    if (io) {
      io.emit('whatsapp:ready');
    }
    // Cargar el grupo a ignorar y refrescarlo cada 10 min (recoge altas/bajas
    // de miembros sin redeploy). Best-effort: si falla, el bot sigue operando.
    refreshIgnoredGroup();
    setInterval(refreshIgnoredGroup, 10 * 60 * 1000).unref?.();
  });

  whatsappClient.on('message', async msg => {
    // El bot es ESTRICTAMENTE SOLO-RESPONDER: nunca inicia, solo contesta un
    // mensaje 1-a-1 recibido. Todo lo demás se ignora (reduce el riesgo de
    // baneo de whatsapp-web.js, que se dispara con actividad no solicitada).
    //  - fromMe: jamás reaccionar a mensajes propios (evita cualquier bucle).
    //  - grupos (@g.us), estados (status@broadcast), difusiones (@broadcast) y
    //    canales/newsletters (@newsletter): no son clientes 1-a-1.
    if (msg.fromMe) return;
    // DENYLIST (no allowlist): excluimos lo que NO es un cliente 1-a-1. Un
    // allowlist estricto a @c.us rompía las respuestas, porque WhatsApp entrega
    // muchos DMs como @lid (linked-device id), no @c.us → se caían todos los
    // mensajes. Aquí solo bloqueamos grupos/estados/difusiones/canales y
    // dejamos pasar cualquier chat individual (@c.us o @lid).
    if (
      msg.from.includes('@g.us') ||
      msg.from === 'status@broadcast' ||
      msg.from.includes('@broadcast') ||
      msg.from.includes('@newsletter')
    ) return;

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

    const isInvalidPhone = !/^\d{10,14}$/.test(phone);
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
    const geminiResponse = await processWhatsAppMessage(phone, messageText, restaurant.id, history, activeOrderId, isInvalidPhone);
    console.log(`[WhatsApp Bot] Gemini status=${geminiResponse?.status}, reply=${!!geminiResponse?.replyMessage}`);

    // Actualizar historial localmente
    history.push({ role: 'user', text: messageText });
    // Guardamos la respuesta generada (si existe) para que Gemini recuerde
    if (geminiResponse.replyMessage) {
       history.push({ role: 'model', text: geminiResponse.replyMessage });
    }

    // Mantener solo los últimos 10 mensajes para ahorrar tokens
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }

    // Enviar respuesta al cliente (sanitizada: nunca exponer IDs internos).
    // sendMessage (no msg.reply) es más robusto con chats @lid; awaited y con
    // captura de error para no tragarnos fallos de envío silenciosamente.
    if (geminiResponse.replyMessage) {
      const out = sanitizeReply(geminiResponse.replyMessage);
      try {
        await whatsappClient.sendMessage(msg.from, out);
        console.log(`[WhatsApp Bot] Respuesta enviada a ${msg.from}`);
      } catch (err) {
        console.error('[WhatsApp Bot] Error enviando respuesta:', err?.message || err);
      }
    }

    // Si el JSON indica que se confirmó un pedido, lo procesamos
    if (geminiResponse.status === 'CONFIRMED' && geminiResponse.items && geminiResponse.items.length > 0) {
      const orderCreated = await createOrderFromGemini(restaurant.id, geminiResponse, process.env.PORT || 3001);
      if (orderCreated && orderCreated.id) {
        // Guardamos el ID de la orden en memoria por 15 minutos para permitir agregar platillos
        recentOrders.set(phone, { orderId: orderCreated.id, timestamp: Date.now() });
        // Limpiamos el historial de charla para que empiece de cero, pero el prompt recordará que tiene una orden activa
        chatHistory.delete(phone);
      }
    }
    
    // Si el JSON indica que quiere agregar items a un pedido existente
    if (geminiResponse.status === 'ADD_TO_ORDER' && geminiResponse.items && geminiResponse.items.length > 0 && activeOrderId) {
      const addResponse = await require('./orderProcessor').addItemsToOrder(activeOrderId, geminiResponse, restaurant.id, process.env.PORT || 3001);
      if (addResponse) {
        // Refrescamos el tiempo
        recentOrders.set(phone, { orderId: activeOrderId, timestamp: Date.now() });
        chatHistory.delete(phone);
      }
    }
  });

  whatsappClient.initialize().catch(err => {
    console.error('[WhatsApp Bot] Error al inicializar:', err);
  });
}

module.exports = {
  initWhatsApp,
  getWhatsAppClient: () => whatsappClient,
  getLatestQr: () => latestQr,
  getIgnoredGroupInfo,
  refreshIgnoredGroup,
};
