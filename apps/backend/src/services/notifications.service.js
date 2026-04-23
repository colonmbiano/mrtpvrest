require('dotenv').config();
const webpush = require('web-push');
const { prisma } = require('@mrtpvrest/database');
const axios = require('axios');

const vapidSubject = process.env.VAPID_EMAIL
  ? (process.env.VAPID_EMAIL.startsWith('mailto:') || process.env.VAPID_EMAIL.startsWith('https://')
      ? process.env.VAPID_EMAIL
      : `mailto:${process.env.VAPID_EMAIL}`)
  : 'mailto:admin@masterburguers.com';

webpush.setVapidDetails(
  vapidSubject,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const WHAPI_TOKEN = process.env.WHATSAPP_TOKEN;
const WHAPI_URL   = 'https://gate.whapi.cloud';

// ── Enviar notificación push al navegador ─────────────────────────────────
async function sendPushToOrder(orderId, payload) {
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

async function sendPushToUser(userId, payload) {
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

// ── Enviar WhatsApp ───────────────────────────────────────────────────────
async function sendWhatsApp(phone, message) {
  if (!phone || !WHAPI_TOKEN) return;
  try {
    const clean = phone.replace(/\D/g, '');
    const number = clean.startsWith('52') ? clean : '52' + clean;
    await axios.post(`${WHAPI_URL}/messages/text`, {
      to: number + '@s.whatsapp.net',
      body: message,
    }, { headers: { Authorization: `Bearer ${WHAPI_TOKEN}` } });
    console.log('✅ WhatsApp enviado a', number);
  } catch (e) { console.error('WhatsApp error:', e.response?.data || e.message); }
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
  // WhatsApp
  const phone = order.customerPhone || order.user?.phone;
  if (phone) await sendWhatsApp(phone, `*Master Burger's* \n${msg.emoji} ${text}`);
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
    await sendWhatsApp(phone,
      `*Master Burger's* \n⚠️ Aviso sobre tu pedido ${order.orderNumber}:\n` +
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

module.exports = { notifyOrderStatus, notifyIngredientShortage, notifyNewOrder, notifyLowStock, sendWhatsApp, sendPushToOrder };