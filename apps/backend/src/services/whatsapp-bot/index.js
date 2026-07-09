// index.js — Orquestador del chatbot de WhatsApp.
//
// Une las piezas: resuelve la sesión persistida, ejecuta el motor de la
// conversación (engine), persiste el nuevo estado y envía las respuestas por
// el proveedor. Es el único módulo que toca BD + red para una conversación.

const { prisma } = require('@mrtpvrest/database');
const provider = require('./provider');
const catalog = require('./catalog');
const engine = require('./engine');
const orderSvc = require('./order');
const nlu = require('./nlu');
const inbox = require('./inbox');
const upsell = require('./upsell');
const promoGames = require('../promo-games.service');
const { computeOpenState } = require('../../utils/storeHours');
const m = require('./messages');

const NLU_ENABLED = process.env.WHATSAPP_NLU_ENABLED === 'true';

// Vida de una conversación inactiva (se reinicia tras este lapso sin actividad).
const SESSION_TTL_MS = parseInt(process.env.WHATSAPP_SESSION_TTL_MS || `${6 * 60 * 60 * 1000}`, 10);

// Dedupe de message IDs ya procesados (los proveedores reintentan si no ven 200
// a tiempo). En memoria: suficiente para 1 instancia; multi-instancia requeriría
// Redis. Cap simple por tamaño para no crecer sin límite.
const processedIds = new Map(); // id → timestamp
const PROCESSED_MAX = 5000;
function alreadyProcessed(id) {
  if (!id) return false;
  if (processedIds.has(id)) return true;
  processedIds.set(id, Date.now());
  if (processedIds.size > PROCESSED_MAX) {
    // Borra el 20% más antiguo.
    const entries = [...processedIds.entries()].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < Math.floor(PROCESSED_MAX * 0.2); i++) processedIds.delete(entries[i][0]);
  }
  return false;
}

// Verificación del webhook estilo Meta (GET hub.challenge).
function verifyMetaChallenge(query, integration) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode !== 'subscribe' || !challenge) return null;
  const cfg = provider.resolveConfig(integration);
  if (token && cfg.verifyToken && token === cfg.verifyToken) return challenge;
  return null;
}

// Envía la respuesta al cliente y la deja registrada en la bandeja de entrada.
// El registro es best-effort y solo ocurre si el envío tuvo éxito.
async function sendAndRecord(cfg, restaurantId, phone, body, sentBy = 'BOT') {
  const ok = await provider.sendText(cfg, phone, body);
  if (ok) {
    try {
      await inbox.recordOutbound(prisma, restaurantId, phone, body, { sentBy });
    } catch (err) {
      console.error('[wa-bot] inbox outbound:', err.message);
    }
  }
  return ok;
}

/**
 * Procesa un único mensaje entrante normalizado.
 */
async function processMessage({ restaurant, integration, message, io }) {
  const cfg = provider.resolveConfig(integration);
  const phone = message.from;

  // Registrar el entrante en la bandeja (best-effort) y conocer el estado del hilo.
  let conversation = null;
  try {
    conversation = await inbox.recordInbound(prisma, restaurant.id, message);
  } catch (err) {
    console.error('[wa-bot] inbox inbound:', err.message);
  }

  // Handoff humano activo: el mensaje ya quedó guardado para el panel, pero el
  // bot NO contesta — el dueño está atendiendo y sus respuestas no deben
  // mezclarse con las del bot. Al marcar la conversación como resuelta en el
  // panel, el bot retoma.
  if (conversation && conversation.status === inbox.STATUS.NEEDS_HUMAN) return;

  // El cliente pide hablar con una persona → escalar, avisar al dueño y pausar el bot.
  if (message.type === 'text' && inbox.wantsHuman(engine.norm(message.text))) {
    try {
      await inbox.escalate({
        prisma,
        cfg,
        restaurant,
        phone,
        reason: `El cliente escribió: "${String(message.text).slice(0, 120)}"`,
      });
    } catch (err) {
      console.error('[wa-bot] escalate:', err.message);
    }
    await sendAndRecord(cfg, restaurant.id, phone, m.humanHandoff);
    return;
  }

  // Config, sucursales y disponibilidad de pago en línea (scope por restaurantId).
  const [config, locations, onlinePayment] = await Promise.all([
    prisma.restaurantConfig.findUnique({ where: { restaurantId: restaurant.id } }),
    prisma.location.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, address: true, hasDelivery: true, hasTakeaway: true },
    }),
    orderSvc.hasOnlinePayment(prisma, restaurant.id),
  ]);

  // Modo ZONES: adjuntamos las zonas activas para que computeDeliveryFee (en el
  // engine y al crear la orden) ubique el pin del cliente en su polígono.
  if (config && config.deliveryMode === 'ZONES') {
    config.deliveryZones = await prisma.deliveryZone.findMany({
      where: { restaurantId: restaurant.id, active: true },
      orderBy: { priority: 'asc' },
    });
  }

  // Tienda cerrada → no tomamos pedidos nuevos. Respeta el override manual y el
  // horario automático; el mensaje dinámico indica cuándo volvemos a abrir.
  if (config) {
    const storeState = computeOpenState(config);
    if (!storeState.isOpen) {
      await sendAndRecord(cfg, restaurant.id, phone, m.storeClosed(storeState.message || config.closedMessage));
      return;
    }
  }

  // Cargar sesión existente (o arrancar nueva). Caduca por inactividad.
  const existing = await prisma.whatsappSession.findUnique({
    where: { restaurantId_phone: { restaurantId: restaurant.id, phone } },
  });
  let session = null;
  if (existing && existing.expiresAt > new Date()) {
    let parsed = {};
    try { parsed = JSON.parse(existing.data); } catch { parsed = {}; }
    session = { state: existing.state, data: { ...parsed, phone } };
  } else {
    session = { state: engine.STATES.GREETING, data: engine.freshData(phone, existing?.lastOrderId || null) };
  }

  // Memoizamos el menú: el motor puede pedirlo más de una vez por turno.
  let menuCache = null;
  const deps = {
    loadMenu: async () => {
      if (!menuCache) menuCache = await catalog.loadMenu(prisma, restaurant.id);
      return menuCache;
    },
    createOrder: (data) => orderSvc.createBotOrder({ prisma, io, restaurant, config, data }),
    createCheckout: (order) => orderSvc.createCheckoutLink({ prisma, restaurant, order }),
    playGame: (trigger) => promoGames.playGame({ restaurantId: restaurant.id, phone, trigger }),
    loadUpsellOffer: (cart) =>
      upsell.pickOffer({ prisma, restaurantId: restaurant.id, cart, loadMenu: deps.loadMenu }),
    recordUpsellAccept: (ruleId, amount) =>
      upsell.recordAccept({ prisma, restaurantId: restaurant.id, ruleId, amount }),
    ...(NLU_ENABLED && {
      parseOrderText: (text, menu) => nlu.parseOrderText({ restaurantId: restaurant.id, text, menu }),
    }),
  };

  let outcome;
  try {
    outcome = await engine.handleInbound({ restaurant, config, locations, session, message, deps, onlinePayment });
  } catch (err) {
    console.error('[wa-bot] engine error:', err);
    await sendAndRecord(cfg, restaurant.id, phone, m.genericError);
    return;
  }

  // Persistir el nuevo estado de la conversación.
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const dataToSave = { ...outcome.data, phone };
  try {
    await prisma.whatsappSession.upsert({
      where: { restaurantId_phone: { restaurantId: restaurant.id, phone } },
      create: {
        restaurantId: restaurant.id,
        phone,
        state: outcome.state,
        data: JSON.stringify(dataToSave),
        lastOrderId: dataToSave.lastOrderId || null,
        expiresAt,
      },
      update: {
        state: outcome.state,
        data: JSON.stringify(dataToSave),
        lastOrderId: dataToSave.lastOrderId || null,
        expiresAt,
      },
    });
  } catch (err) {
    console.error('[wa-bot] error guardando sesión:', err.message);
  }

  // Enviar respuestas en orden.
  for (const reply of outcome.replies) {
    if (reply) await sendAndRecord(cfg, restaurant.id, phone, reply);
  }
}

/**
 * Punto de entrada desde la ruta del webhook. Resuelve el restaurante y su
 * integración, normaliza el body y procesa cada mensaje. No lanza.
 */
async function handleWebhook({ restaurantId, body, io }) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, slug: true, isActive: true },
  });
  if (!restaurant || !restaurant.isActive) return;

  const integration = await prisma.integrationConfig.findFirst({
    where: { restaurantId: restaurant.id, type: 'WHATSAPP', enabled: true },
  });
  if (!integration) {
    console.warn(`[wa-bot] restaurante ${restaurantId} sin integración WHATSAPP habilitada`);
    return;
  }

  // Gate del add-on facturable: el plan del tenant debe incluir el módulo
  // 'whatsapp_bot'. Rollout suave (ENFORCE_BOT_MODULE off → deja pasar) para no
  // romper bots ya activos; con enforce on, un tenant sin el módulo no procesa.
  const { botModuleAllowed } = require('../../lib/modules');
  if (!(await botModuleAllowed(restaurant.id))) {
    console.warn(`[wa-bot] restaurante ${restaurantId} sin el módulo whatsapp_bot en su plan — ignorando webhook`);
    return;
  }

  const messages = provider.normalizeInbound(body);
  for (const message of messages) {
    if (alreadyProcessed(message.id)) continue;
    try {
      await processMessage({ restaurant, integration, message, io });
    } catch (err) {
      console.error('[wa-bot] error procesando mensaje:', err);
    }
  }
}

module.exports = { handleWebhook, verifyMetaChallenge, processMessage };
