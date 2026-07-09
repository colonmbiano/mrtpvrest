// inbox.js — Bandeja de entrada del canal WhatsApp.
//
// Persiste el historial de la conversación (WhatsappConversation +
// WhatsappMessage) y maneja el handoff a humano. Complementa a
// WhatsappSession (estado efímero de la máquina de estados): aquí queda lo
// que el dueño ve en el panel. Todo es best-effort: un fallo aquí nunca debe
// tumbar el flujo del bot (mismo criterio que contacts.js).

const provider = require('./provider');
const m = require('./messages');

const STATUS = {
  OPEN: 'OPEN',
  NEEDS_HUMAN: 'NEEDS_HUMAN',
  RESOLVED: 'RESOLVED',
};

// Ventana de 24h de Meta: solo se puede responder con texto libre mientras el
// último mensaje DEL CLIENTE tenga menos de 24 horas. Fuera de la ventana la
// vía oficial exige plantillas aprobadas (aún no soportadas), así que el panel
// bloquea la respuesta.
const WINDOW_MS = 24 * 60 * 60 * 1000;

function windowOpen(lastInboundAt) {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < WINDOW_MS;
}

// Frases (ya normalizadas por engine.norm: minúsculas, sin acentos) con las
// que el cliente pide ser atendido por una persona.
const HUMAN_PATTERNS =
  /\b(humano|persona|asesor|agente|encargado|dueno|gerente|operador)\b|hablar con alguien|atencion humana|que me atienda/;

function wantsHuman(normText) {
  return !!normText && HUMAN_PATTERNS.test(normText);
}

// Cuerpo legible para tipos no-texto (el hilo del panel siempre muestra algo).
function messageBody(message) {
  if (message.type === 'location' && message.location) {
    return `📍 Ubicación compartida (${message.location.lat}, ${message.location.lng})`;
  }
  if (message.type === 'text') return String(message.text || '');
  return '[mensaje no soportado: imagen, audio o sticker]';
}

/**
 * Registra un mensaje entrante del cliente. Reabre hilos RESOLVED (mensaje
 * nuevo = conversación viva otra vez) y suma al contador de no leídos.
 * @returns {object|null} la conversación actualizada.
 */
async function recordInbound(prisma, restaurantId, message) {
  const now = new Date();
  const conversation = await prisma.whatsappConversation.upsert({
    where: { restaurantId_phone: { restaurantId, phone: message.from } },
    create: {
      restaurantId,
      phone: message.from,
      name: message.fromName || null,
      lastMessageAt: now,
      lastInboundAt: now,
      unreadCount: 1,
    },
    update: {
      ...(message.fromName ? { name: message.fromName } : {}),
      lastMessageAt: now,
      lastInboundAt: now,
      unreadCount: { increment: 1 },
    },
  });

  if (conversation.status === STATUS.RESOLVED) {
    await prisma.whatsappConversation.update({
      where: { id: conversation.id },
      data: { status: STATUS.OPEN, needsHumanReason: null, escalatedAt: null },
    });
    conversation.status = STATUS.OPEN;
  }

  await prisma.whatsappMessage.create({
    data: {
      conversationId: conversation.id,
      restaurantId,
      direction: 'IN',
      type: message.type || 'text',
      body: messageBody(message),
      waMessageId: message.id || null,
      sentBy: 'CUSTOMER',
    },
  });

  return conversation;
}

/**
 * Registra un mensaje saliente (del bot o del dueño desde el panel).
 * @returns {object|null} la conversación actualizada.
 */
async function recordOutbound(prisma, restaurantId, phone, body, { sentBy = 'BOT' } = {}) {
  const now = new Date();
  const conversation = await prisma.whatsappConversation.upsert({
    where: { restaurantId_phone: { restaurantId, phone } },
    create: { restaurantId, phone, lastMessageAt: now, lastOutboundAt: now },
    update: { lastMessageAt: now, lastOutboundAt: now },
  });

  await prisma.whatsappMessage.create({
    data: {
      conversationId: conversation.id,
      restaurantId,
      direction: 'OUT',
      type: 'text',
      body: String(body || ''),
      sentBy,
    },
  });

  return conversation;
}

/**
 * Escala la conversación a atención humana: marca NEEDS_HUMAN (el bot deja de
 * contestar hasta que el dueño la resuelva) y, si hay `ownerPhone` en la
 * config de la integración, le avisa al dueño en su WhatsApp personal.
 */
async function escalate({ prisma, cfg, restaurant, phone, reason }) {
  const now = new Date();
  const conversation = await prisma.whatsappConversation.upsert({
    where: { restaurantId_phone: { restaurantId: restaurant.id, phone } },
    create: {
      restaurantId: restaurant.id,
      phone,
      status: STATUS.NEEDS_HUMAN,
      needsHumanReason: reason || null,
      escalatedAt: now,
      lastMessageAt: now,
    },
    update: {
      status: STATUS.NEEDS_HUMAN,
      needsHumanReason: reason || null,
      escalatedAt: now,
    },
  });

  if (cfg?.ownerPhone) {
    // Best-effort: el aviso al dueño no debe bloquear la respuesta al cliente.
    await provider.sendText(
      cfg,
      cfg.ownerPhone,
      m.ownerEscalation({ restaurantName: restaurant.name, phone, reason })
    );
  }

  return conversation;
}

module.exports = { STATUS, WINDOW_MS, windowOpen, wantsHuman, recordInbound, recordOutbound, escalate };
