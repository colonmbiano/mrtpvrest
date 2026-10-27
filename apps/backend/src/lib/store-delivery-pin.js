'use strict';

// PIN de entrega para pedidos a domicilio de la tienda propia (no marketplace).
// El comprador lo ve en su pedido y se lo dicta al repartidor; el servidor lo
// verifica al marcar la entrega. Igual que el PIN del marketplace, se DERIVA con
// HMAC del id del pedido y nunca se guarda en claro, así que no requiere columna
// ni migración. Usa un espacio de nombres propio ("store-delivery:") para no
// coincidir con los PIN del marketplace aunque compartan secreto.
//
// Despliegue gradual con STORE_DELIVERY_PIN_MODE:
//   off       (default) nada cambia.
//   optional  el comprador ve el PIN y la app lo pide; un PIN incorrecto se
//             rechaza, pero versiones viejas de la app pueden entregar sin él.
//   required  sin PIN correcto no se puede marcar la entrega.
// Requiere STORE_DELIVERY_PIN_SECRET (32+ bytes); sin él, el modo queda en off.
// Solo aplica a repartidores: el personal de la tienda conserva su override.
//
// Los pedidos del marketplace que entrega un repartidor propio de la tienda
// (lib/marketplace-store-delivery.js) también pasan por aquí, con el mismo freno de
// intentos: su código es el deliveryPin de la orden y es SIEMPRE obligatorio,
// sin importar STORE_DELIVERY_PIN_MODE.

const crypto = require('crypto');
const { storeDeliveredMarketplace, matchesMarketplacePin } = require('./marketplace-store-delivery');

const MODES = new Set(['off', 'optional', 'required']);
const PIN_RE = /^\d{6}$/;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const FINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED']);

class StoreDeliveryPinError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function storeDeliveryPinConfig(env = process.env) {
  const requested = String(env.STORE_DELIVERY_PIN_MODE || 'off').trim().toLowerCase();
  const secret = env.STORE_DELIVERY_PIN_SECRET;
  const usable = typeof secret === 'string' && Buffer.byteLength(secret) >= 32;
  const mode = MODES.has(requested) && usable ? requested : 'off';
  return { mode, secret: mode === 'off' ? null : secret, misconfigured: requested !== 'off' && mode === 'off' };
}

// Pedidos a domicilio que no son del marketplace (esos ya tienen su propio PIN).
function appliesTo(order) {
  return Boolean(order) && order.orderType === 'DELIVERY' && order.source !== 'MARKETPLACE';
}

function deriveStoreDeliveryPin(orderId, secret) {
  const code = crypto.createHmac('sha256', secret).update(`store-delivery:${orderId}`).digest().readUInt32BE(0) % 1000000;
  return String(code).padStart(6, '0');
}

// Texto para los WhatsApp al comprador (confirmación del chatbot y "en camino");
// vacío si no hay PIN que mostrar.
function customerPinText(pin) {
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) return '';
  return `🔐 *Código de entrega:* ${pin}\nDíctaselo al repartidor al recibir tu pedido. No lo compartas antes.`;
}

function samePin(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Freno de fuerza bruta por pedido: 10 fallos por ventana de 15 min bloquean
// nuevos intentos hasta que la ventana expira. Dos almacenes con la misma regla:
//   createPrismaPinAttempts  el del backend; compartido entre procesos y reinicios.
//   createMemoryPinAttempts  por proceso; respaldo fuera del backend (pruebas).
// La llave es { restaurantId, orderId }.
function createMemoryPinAttempts() {
  const failures = new Map();
  const id = ({ restaurantId, orderId }) => `${restaurantId}:${orderId}`;
  return {
    async isLocked(key, at) {
      const entry = failures.get(id(key));
      if (!entry || at - entry.since > FAILURE_WINDOW_MS) {
        failures.delete(id(key));
        return false;
      }
      return entry.count >= MAX_FAILURES;
    },
    async recordFailure(key, at) {
      const entry = failures.get(id(key));
      if (!entry || at - entry.since > FAILURE_WINDOW_MS) failures.set(id(key), { count: 1, since: at });
      else entry.count += 1;
    },
    async clear(key) { failures.delete(id(key)); },
  };
}

// Tabla delivery_pin_attempts. Usa el cliente general, NUNCA la transacción del
// pedido: el error que rechaza el PIN deshace esa transacción y el fallo debe
// quedar contado de todos modos.
function createPrismaPinAttempts({ prisma }) {
  return {
    async isLocked({ restaurantId, orderId }, at) {
      const row = await prisma.deliveryPinAttempt.findFirst({ where: { restaurantId, orderId },
        select: { failures: true, windowStart: true } });
      return Boolean(row) && at - row.windowStart.getTime() <= FAILURE_WINDOW_MS && row.failures >= MAX_FAILURES;
    },
    async recordFailure({ restaurantId, orderId }, at) {
      const current = new Date(at);
      const expired = new Date(at - FAILURE_WINDOW_MS);
      // Un solo INSERT … ON CONFLICT: dos fallos simultáneos suman los dos, y una
      // ventana vencida vuelve a empezar en 1.
      await prisma.$executeRaw`INSERT INTO "delivery_pin_attempts" ("restaurantId", "orderId", "failures", "windowStart", "updatedAt")
        VALUES (${restaurantId}, ${orderId}, 1, ${current}, ${current})
        ON CONFLICT ("restaurantId", "orderId") DO UPDATE SET
          "failures" = CASE WHEN "delivery_pin_attempts"."windowStart" < ${expired} THEN 1 ELSE "delivery_pin_attempts"."failures" + 1 END,
          "windowStart" = CASE WHEN "delivery_pin_attempts"."windowStart" < ${expired} THEN ${current} ELSE "delivery_pin_attempts"."windowStart" END,
          "updatedAt" = ${current}`;
    },
    async clear({ restaurantId, orderId }) {
      await prisma.deliveryPinAttempt.deleteMany({ where: { restaurantId, orderId } });
    },
  };
}

function createStoreDeliveryPin({ config = storeDeliveryPinConfig(), now = () => Date.now(),
  attempts = createMemoryPinAttempts() } = {}) {
  function enabledFor(order) {
    return config.mode !== 'off' && appliesTo(order);
  }

  // PIN que puede ver el dueño del pedido mientras siga activo.
  function pinForCustomer(order) {
    if (!enabledFor(order) || FINAL_STATUSES.has(order.status)) return null;
    return deriveStoreDeliveryPin(order.id, config.secret);
  }

  function requiresPin(order) {
    return storeDeliveredMarketplace(order) || enabledFor(order);
  }

  // Verifica el PIN que dicta el comprador. Rechaza con StoreDeliveryPinError si
  // no procede; resuelve true si el pedido no usa PIN o el PIN es correcto.
  async function assertCourierPin(order, pin) {
    const marketplace = storeDeliveredMarketplace(order);
    if (!marketplace && !enabledFor(order)) return true;
    if (pin === undefined || pin === null || pin === '') {
      if (marketplace || config.mode === 'required') {
        throw new StoreDeliveryPinError('DELIVERY_PIN_REQUIRED', 'Pide al cliente su código de entrega', 409);
      }
      return true;
    }
    const key = { restaurantId: order.restaurantId || '', orderId: order.id };
    const at = now();
    if (await attempts.isLocked(key, at)) {
      throw new StoreDeliveryPinError('DELIVERY_PIN_LOCKED', 'Demasiados intentos; espera unos minutos o pide ayuda a la tienda', 429);
    }
    const matches = typeof pin === 'string' && PIN_RE.test(pin) && (marketplace
      ? matchesMarketplacePin(order, pin) : samePin(pin, deriveStoreDeliveryPin(order.id, config.secret)));
    if (!matches) {
      await attempts.recordFailure(key, at);
      throw new StoreDeliveryPinError('INVALID_DELIVERY_PIN', 'El código de entrega no coincide', 400);
    }
    await attempts.clear(key);
    return true;
  }

  return { mode: config.mode, misconfigured: config.misconfigured, pinForCustomer, requiresPin, assertCourierPin };
}

module.exports = {
  StoreDeliveryPinError, storeDeliveryPinConfig, createStoreDeliveryPin, createMemoryPinAttempts,
  createPrismaPinAttempts, deriveStoreDeliveryPin, appliesTo, customerPinText,
  MAX_FAILURES, FAILURE_WINDOW_MS,
};
