// idempotency.middleware.js
//
// Idempotencia para replays de la cola offline del TPV. El cliente
// puede llamar 2x al mismo endpoint con la misma Idempotency-Key
// (ej: el sync corrió, registró éxito en el server pero murió antes
// de llamar markSynced; al próximo tick reintenta). Aquí dedupeamos
// para no crear órdenes/cobros duplicados.
//
// Backend de almacenamiento en capas:
//   - Con REDIS_URL: Redis (compartido entre instancias — apto para
//     multi-instancia en Railway), con la memoria local como respaldo
//     si Redis está caído (mejor dedupe por-instancia que ninguno).
//   - Sin REDIS_URL: Map en memoria con TTL de 1 hora (una instancia).
//
// Header esperado: 'Idempotency-Key' (RFC draft idempotency-header).
// Cuando la key ya está vista, devolvemos el status+body original
// guardado (no re-ejecutamos el handler).

const TTL_MS = 60 * 60 * 1000; // 1 hora
const cache = new Map(); // key → { status, body, expiresAt }

// Limpieza periódica para que el Map no crezca sin límite.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt < now) cache.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

// Cliente Redis opcional. enableOfflineQueue:false = si Redis no está
// disponible los comandos fallan al instante (y caemos a memoria) en
// vez de encolar y colgar requests.
let redis = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
    });
    redis.on('error', (e) => {
      // Un listener evita el crash por 'error' no manejado; el detalle
      // de cada fallo ya se maneja por-request con fallback a memoria.
      console.error('[idempotency] Redis:', e.message);
    });
  } catch (e) {
    console.error('[idempotency] ioredis no disponible, usando memoria:', e.message);
    redis = null;
  }
}

async function idempotencyMiddleware(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) return next();

  // Solo aplica a métodos que mutan estado.
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  // Scope tenant: misma key + distinto restaurant NO colisiona.
  const scoped = `${req.restaurantId || req.user?.restaurantId || 'anon'}::${key}`;

  // Lookup: Redis primero (si hay), memoria como respaldo.
  let cached = null;
  if (redis) {
    try {
      const raw = await redis.get(`idem:${scoped}`);
      if (raw) cached = JSON.parse(raw);
    } catch { /* Redis caído/corrupto → probamos memoria */ }
  }
  if (!cached) {
    const local = cache.get(scoped);
    if (local && local.expiresAt > Date.now()) cached = local;
  }
  if (cached) {
    res.setHeader('X-Idempotent-Replay', 'true');
    return res.status(cached.status).json(cached.body);
  }

  // Interceptamos res.json para snapshotear la respuesta del handler.
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    // Solo cacheamos 2xx — errores no son idempotentes (el cliente
    // probablemente quiera reintentar con datos corregidos).
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cache.set(scoped, {
        status: res.statusCode,
        body,
        expiresAt: Date.now() + TTL_MS,
      });
      if (redis) {
        // Write-behind: si Redis falla, la entrada en memoria ya dedupea
        // en esta instancia; no bloqueamos la respuesta por el SET.
        redis
          .set(`idem:${scoped}`, JSON.stringify({ status: res.statusCode, body }), 'PX', TTL_MS)
          .catch(() => {});
      }
    }
    return originalJson(body);
  };

  next();
}

module.exports = idempotencyMiddleware;
