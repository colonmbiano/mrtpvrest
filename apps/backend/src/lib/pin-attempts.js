'use strict';

// Freno de fuerza bruta de los PIN de entrega: 10 fallos por ventana de 15 min
// bloquean nuevos intentos hasta que la ventana expira. Lo usan el PIN del reparto
// propio (lib/store-delivery-pin.js) y las transiciones del adaptador legado
// (lib/marketplace-orders.js). Dos almacenes con la misma regla:
//   createPrismaPinAttempts  el del backend; compartido entre procesos y reinicios.
//   createMemoryPinAttempts  por proceso; respaldo fuera del backend (pruebas).
// La llave es { restaurantId, orderId }; quien necesite contadores por etapa los
// separa en orderId (por ejemplo `${orderId}:pickup`).

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

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

module.exports = { MAX_FAILURES, FAILURE_WINDOW_MS, createMemoryPinAttempts, createPrismaPinAttempts };
