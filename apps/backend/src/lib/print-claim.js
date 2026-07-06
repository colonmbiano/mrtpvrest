// print-claim.js
//
// Reclamo atómico "imprime-una-vez" para la comanda de cocina de un pedido web.
// El backend cloud NO alcanza las impresoras LAN, así que imprime la tablet del
// TPV. Cuando hay VARIAS pantallas de caja abiertas, cada una recibe el mismo
// order:new y cada una imprimía su copia (su dedupe es por-pantalla, en memoria)
// → comandas DUPLICADAS. Aquí centralizamos: la PRIMERA tablet que reclama un
// pedido gana (imprime); las demás reciben false y NO imprimen.
//
// Backend en capas (igual que idempotency.middleware):
//   - Con REDIS_URL: Redis `SET NX` (atómico y compartido entre instancias).
//   - Sin REDIS_URL / Redis caído: Map en memoria con TTL (una instancia; el
//     check-and-set es atómico porque Node es single-thread).

const TTL_MS = 60 * 60 * 1000; // 1h: cubre el ciclo de vida de impresión de un pedido
const claims = new Map(); // scoped key → expiresAt (ms)

// Limpieza periódica para que el Map no crezca sin límite.
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of claims.entries()) if (exp < now) claims.delete(k);
}, 5 * 60 * 1000).unref?.();

let redis = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
    });
    redis.on('error', (e) => console.error('[print-claim] Redis:', e.message));
  } catch (e) {
    console.error('[print-claim] ioredis no disponible, usando memoria:', e.message);
    redis = null;
  }
}

// Devuelve true si ESTA llamada gana el reclamo (la tablet debe imprimir); false
// si otra pantalla ya lo tenía (no imprimir). `key` debe venir ya scopeado por
// tenant (ej. `${restaurantId}:${orderId}`) para no colisionar entre negocios.
async function claimKitchenPrint(key) {
  const scoped = `kprint:${key}`;
  if (redis) {
    try {
      // 'OK' = la key no existía y se creó (primero) | null = ya existía.
      const r = await redis.set(scoped, '1', 'PX', TTL_MS, 'NX');
      return r === 'OK';
    } catch {
      /* Redis caído/corrupto → caemos a memoria */
    }
  }
  const now = Date.now();
  const exp = claims.get(scoped);
  if (exp && exp > now) return false; // ya reclamado
  claims.set(scoped, now + TTL_MS);
  return true;
}

module.exports = { claimKitchenPrint };
