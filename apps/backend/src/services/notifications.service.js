require('dotenv').config();
const webpush = require('web-push');
const { prisma } = require('@mrtpvrest/database');
const axios = require('axios');
const { resolveConfig, sendText } = require('./whatsapp-bot/provider');
const { toWhatsappNumber } = require('@mrtpvrest/config/phone');

const vapidSubject = process.env.VAPID_EMAIL
  ? (process.env.VAPID_EMAIL.startsWith('mailto:') || process.env.VAPID_EMAIL.startsWith('https://')
      ? process.env.VAPID_EMAIL
      : `mailto:${process.env.VAPID_EMAIL}`)
  : 'mailto:admin@masterburguers.com';

// Sin llaves VAPID (CI/E2E, entornos nuevos) el web push queda deshabilitado
// en vez de tumbar el backend en el boot — setVapidDetails lanza si faltan.
const PUSH_ENABLED = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (PUSH_ENABLED) {
  webpush.setVapidDetails(
    vapidSubject,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('[notifications] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes — web push deshabilitado');
}

const WHAPI_TOKEN = process.env.WHATSAPP_TOKEN;
const WHAPI_URL   = 'https://gate.whapi.cloud';

// ── Enviar notificación push al navegador ─────────────────────────────────
async function sendPushToOrder(orderId, payload) {
  if (!PUSH_ENABLED) return 0;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { orderId } });
    const results = await Promise.allSettled(subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      ).catch(async e => {
        if (e.statusCode === 410) await prisma.pushSubscription.delete({ where: { id: sub.id } });
      })
    ));
    return results.length;
  } catch (e) { console.error('Push error:', e.message); return 0; }
}

// ── Push a un REPARTIDOR (Employee, no User) ───────────────────────────────
// Los repartidores no tienen fila en users: su suscripción se guarda en
// PushSubscription.userId con el prefijo `driver:<employeeId>` (la columna es
// String sin FK, así que no choca con ids de User). La registra la app de
// reparto tras el login (POST /api/notifications/subscribe).
async function sendPushToDriver(driverId, payload) {
  if (!PUSH_ENABLED || !driverId) return 0;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId: `driver:${driverId}` } });
    await Promise.allSettled(subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      ).catch(async e => {
        // 410 Gone = suscripción muerta (app desinstalada / permiso revocado).
        if (e.statusCode === 410 || e.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      })
    ));
    return subs.length;
  } catch (e) { console.error('Push driver error:', e.message); return 0; }
}

// ── Aviso a TODOS los repartidores: nuevo pedido DELIVERY disponible ───────
// Se dispara al crear un pedido a domicilio SIN repartidor asignado (TPV,
// tienda online, bot de WhatsApp) y al desasignar uno. Push a cada repartidor
// activo del restaurante para que abran la app y lo tomen del pool
// (el socket 'newAvailableOrder' cubre a los que ya la tienen abierta).
// Best-effort: nunca afecta la creación del pedido.
async function notifyDriversNewDeliveryOrder(order) {
  if (!PUSH_ENABLED || !order?.restaurantId) return 0;
  try {
    const drivers = await prisma.employee.findMany({
      where: {
        role: 'DELIVERY',
        isActive: true,
        location: { restaurantId: order.restaurantId },
        ...(order.locationId ? { locationId: order.locationId } : {}),
      },
      select: { id: true },
    });
    if (!drivers.length) return 0;
    const totalTxt = order.total != null ? ` · $${Number(order.total).toFixed(2)}` : '';
    const payload = {
      title: `🛵 Pedido disponible #${order.orderNumber || ''}`,
      body: `${order.customerName || 'Cliente'}${totalTxt}\n${order.deliveryAddress || ''}`.trim(),
      tag: `available-${order.id}`, // reemplaza la notificación si se re-emite
      url: '/',
    };
    await Promise.allSettled(drivers.map(d => sendPushToDriver(d.id, payload)));
    return drivers.length;
  } catch (e) { console.error('Push drivers error:', e.message); return 0; }
}

async function sendPushToUser(userId, payload) {
  if (!PUSH_ENABLED) return;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    await Promise.allSettled(subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
    ));
  } catch (e) { console.error('Push error:', e.message); }
}

// ── Enviar WhatsApp (legacy / fallback de plataforma) ─────────────────────
// Usa el token GLOBAL de la plataforma. Se mantiene como fallback para
// restaurantes que aún no configuraron su propia integración WHATSAPP.
async function sendWhatsApp(phone, message, countryCode) {
  if (!phone || !WHAPI_TOKEN) return;
  try {
    // Lada según el país del restaurante (default MX). Ver packages/config/phone.js.
    const number = toWhatsappNumber(phone, countryCode);
    if (!number) return;
    await axios.post(`${WHAPI_URL}/messages/text`, {
      to: number + '@s.whatsapp.net',
      body: message,
    }, { headers: { Authorization: `Bearer ${WHAPI_TOKEN}` } });
    console.log('✅ WhatsApp enviado a', number);
  } catch (e) { console.error('WhatsApp error:', e.response?.data || e.message); }
}

// ── Enviar WhatsApp con la config PROPIA del restaurante ──────────────────
// Resuelve la integración WHATSAPP del restaurante (mismo proveedor que usa
// el chatbot) y envía con su token. Si el restaurante no tiene integración
// habilitada, cae al token global de plataforma (sendWhatsApp). Best-effort.
async function sendOrderWhatsApp(restaurantId, phone, message) {
  if (!phone) return;
  // País del restaurante → lada correcta para el fallback de plataforma.
  let countryCode = 'MX';
  try {
    if (restaurantId) {
      const cfg = await prisma.restaurantConfig.findUnique({
        where: { restaurantId },
        select: { countryCode: true },
      });
      if (cfg?.countryCode) countryCode = cfg.countryCode;
    }
    const integration = restaurantId
      ? await prisma.integrationConfig.findFirst({
          where: { restaurantId, type: 'WHATSAPP', enabled: true },
        })
      : null;
    if (integration) {
      const cfg = resolveConfig(integration);
      if (cfg.token) {
        await sendText(cfg, phone, message);
        return;
      }
    }
  } catch (e) {
    console.error('sendOrderWhatsApp error:', e.message);
  }
  // Fallback: token global de plataforma.
  await sendWhatsApp(phone, message, countryCode);
}

// ── Notificaciones por estado ─────────────────────────────────────────────
const MESSAGES = {
  CONFIRMED: {
    title: '✅ Pedido confirmado',
    body: (num) => `Tu pedido ${num} fue confirmado. ¡Lo estamos preparando!`,
    emoji: '✅'
  },
  PREPARING: {
    title: '👨‍🍳 En preparación',
    body: (num) => `Tu pedido ${num} está siendo preparado en cocina.`,
    emoji: '👨‍🍳'
  },
  READY: {
    title: '🎉 ¡Listo para recoger!',
    body: (num) => `Tu pedido ${num} está listo. ¡Pasa a recogerlo!`,
    emoji: '🎉'
  },
  ON_THE_WAY: {
    title: '🛵 Repartidor en camino',
    body: (num) => `Tu pedido ${num} ya va en camino. ¡Prepárate!`,
    emoji: '🛵'
  },
  DELIVERED: {
    title: '🏠 Pedido entregado',
    body: (num) => `Tu pedido ${num} fue entregado. ¡Que lo disfrutes!`,
    emoji: '🏠'
  },
  CANCELLED: {
    title: '❌ Pedido cancelado',
    body: (num) => `Tu pedido ${num} fue cancelado. Contáctanos para más información.`,
    emoji: '❌'
  },
};

async function notifyOrderStatus(order, status) {
  const msg = MESSAGES[status];
  if (!msg) return;
  const text = msg.body(order.orderNumber);
  // Push
  await sendPushToOrder(order.id, {
    title: msg.title,
    body: text,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: order.id,
    data: { orderId: order.id, url: `/pedido/${order.id}` }
  });
  if (order.userId) await sendPushToUser(order.userId, { title: msg.title, body: text, tag: order.id, data: { url: `/pedido/${order.id}` } });
  // WhatsApp — con la config propia del restaurante y su nombre real.
  const phone = order.customerPhone || order.user?.phone;
  if (phone) {
    const restaurant = order.restaurantId
      ? await prisma.restaurant.findUnique({ where: { id: order.restaurantId }, select: { name: true } })
      : null;
    const name = restaurant?.name || 'Tu pedido';
    await sendOrderWhatsApp(order.restaurantId, phone, `*${name}*\n${msg.emoji} ${text}`);
  }
}

// ── Notificar falta de ingrediente ────────────────────────────────────────
async function notifyIngredientShortage(order, missingItem, options) {
  const phone = order.customerPhone || order.user?.phone;
  const pushPayload = {
    title: '⚠️ Aviso sobre tu pedido',
    body: `Nos falta ${missingItem}. Te contactaremos pronto.`,
    tag: 'shortage-' + order.id,
    data: { orderId: order.id, url: `/pedido/${order.id}?shortage=1` }
  };
  await sendPushToOrder(order.id, pushPayload);
  if (order.userId) await sendPushToUser(order.userId, pushPayload);
  if (phone) {
    const optText = options?.length > 0
      ? `\nOpciones:\n${options.map((o,i) => `${i+1}. ${o}`).join('\n')}`
      : '';
    const restaurant = order.restaurantId
      ? await prisma.restaurant.findUnique({ where: { id: order.restaurantId }, select: { name: true } })
      : null;
    const name = restaurant?.name || 'Tu pedido';
    await sendOrderWhatsApp(order.restaurantId, phone,
      `*${name}*\n⚠️ Aviso sobre tu pedido ${order.orderNumber}:\n` +
      `Nos falta *${missingItem}* para preparar tu pedido.${optText}\n` +
      `Responde con el número de tu opción o escríbenos para ayudarte.`
    );
  }
}

// ── Notificaciones internas ────────────────────────────────────────────────
async function notifyNewOrder(order) {
  // Buscar suscripciones del admin
  const adminSubs = await prisma.pushSubscription.findMany({
    where: { userId: { not: null } }
  });
  const payload = JSON.stringify({
    title: '🔔 Nuevo pedido',
    body: `${order.orderNumber} · $${order.total} · ${order.orderType === 'DELIVERY' ? '🛵 Delivery' : order.orderType === 'DINE_IN' ? '🪑 Mesa' : '🥡 Para llevar'}`,
    tag: 'new-order',
    data: { url: '/admin/pedidos' }
  });
  await Promise.allSettled(adminSubs.map(sub =>
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload
    ).catch(() => {})
  ));
}

// ── Alerta de stock bajo ───────────────────────────────────────────────────
async function notifyLowStock(ingredient, locationId) {
  try {
    // Push a suscripciones registradas en esta sucursal
    const subs = await prisma.pushSubscription.findMany({ where: { locationId } });
    const payload = JSON.stringify({
      title: '⚠️ Stock bajo',
      body: `${ingredient.name}: ${ingredient.stock} ${ingredient.unit} (mín: ${ingredient.minStock})`,
      tag: 'low-stock-' + ingredient.id,
      data: { url: '/admin/inventario' },
    });
    await Promise.allSettled(subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      ).catch(() => {})
    ));

    // Email al admin de la sucursal (si RESEND_API_KEY disponible)
    if (process.env.RESEND_API_KEY) {
      const { sendEmail } = require('../utils/mailer');
      const location = await prisma.location.findUnique({
        where: { id: locationId },
        select: { name: true, restaurant: { select: { name: true, users: { where: { role: { in: ['ADMIN', 'OWNER'] } }, select: { email: true }, take: 3 } } } },
      });
      const emails = location?.restaurant?.users?.map(u => u.email).filter(Boolean) ?? [];
      if (emails.length > 0) {
        const loc = location?.name ?? locationId;
        const rest = location?.restaurant?.name ?? '';
        await sendEmail(emails, `⚠️ Stock bajo — ${ingredient.name}`,
          `<p>El ingrediente <strong>${ingredient.name}</strong> en <strong>${rest} / ${loc}</strong> está por debajo del mínimo.<br>
          Stock actual: <strong>${ingredient.stock} ${ingredient.unit}</strong> · Mínimo: <strong>${ingredient.minStock} ${ingredient.unit}</strong></p>
          <p><a href="${process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.mrtpvrest.com'}/inventario">Ver inventario</a></p>`
        ).catch(() => {});
      }
    }
  } catch (e) { console.error('notifyLowStock:', e.message); }
}

module.exports = { notifyOrderStatus, notifyIngredientShortage, notifyNewOrder, notifyLowStock, sendWhatsApp, sendOrderWhatsApp, sendPushToOrder, sendPushToDriver, notifyDriversNewDeliveryOrder };