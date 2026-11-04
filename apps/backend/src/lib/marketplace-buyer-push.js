'use strict';

// Avisos push de la cuenta del comprador del marketplace (app del cliente). Cada
// navegador suscrito queda en PushSubscription con userId "buyer:<accountId>" (como
// "driver:<id>" de los repartidores). Solo la cuenta del Bearer se suscribe o se da
// de baja: nunca un id que mande el cliente.

const ENDPOINT_MAX = 1000;
const KEY = /^[A-Za-z0-9_-]+={0,2}$/;

class BuyerPushError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message); this.name = 'BuyerPushError'; this.code = code; this.statusCode = statusCode;
  }
}

const buyerPushUser = accountId => `buyer:${accountId}`;

function parseSubscription(value) {
  const sub = value && typeof value === 'object' ? value : null;
  const endpoint = sub?.endpoint;
  let url = null;
  try { url = typeof endpoint === 'string' && endpoint.length <= ENDPOINT_MAX ? new URL(endpoint) : null; } catch { url = null; }
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!url || url.protocol !== 'https:' || url.username || url.password
    || typeof p256dh !== 'string' || p256dh.length < 20 || p256dh.length > 200 || !KEY.test(p256dh)
    || typeof auth !== 'string' || auth.length < 8 || auth.length > 100 || !KEY.test(auth)) {
    throw new BuyerPushError('INVALID_SUBSCRIPTION', 'Suscripcion de avisos invalida');
  }
  return { endpoint, p256dh, auth };
}

function createBuyerPushStore({ prisma }) {
  return {
    // El endpoint es único: si el navegador ya estaba suscrito (a otra cuenta o a un
    // pedido de la tienda), queda ahora con esta cuenta.
    async subscribe(accountId, rawSubscription, userAgent) {
      const { endpoint, p256dh, auth } = parseSubscription(rawSubscription);
      const userId = buyerPushUser(accountId);
      const ua = typeof userAgent === 'string' ? userAgent.slice(0, 300) : null;
      await prisma.pushSubscription.upsert({
        where: { endpoint },
        update: { userId, orderId: null, locationId: null, p256dh, auth, userAgent: ua },
        create: { endpoint, p256dh, auth, userId, userAgent: ua },
      });
    },
    // Solo borra la suscripción de esta cuenta.
    async unsubscribe(accountId, endpoint) {
      if (typeof endpoint !== 'string' || !endpoint || endpoint.length > ENDPOINT_MAX) {
        throw new BuyerPushError('INVALID_SUBSCRIPTION', 'Suscripcion de avisos invalida');
      }
      await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: buyerPushUser(accountId) } });
    },
  };
}

// Cuenta dueña de una orden del marketplace (la de la cotización que la creó), o
// null para pedidos de otro origen o de invitados.
async function buyerAccountForOrder(prisma, order) {
  if (!order?.id || order.source !== 'MARKETPLACE') return null;
  const quote = await prisma.marketplaceQuote.findFirst({ where: { orderId: order.id }, select: { accountId: true } });
  const accountId = quote?.accountId;
  return typeof accountId === 'string' && accountId && !accountId.startsWith('guest:') ? accountId : null;
}

module.exports = { BuyerPushError, buyerPushUser, parseSubscription, createBuyerPushStore, buyerAccountForOrder };
