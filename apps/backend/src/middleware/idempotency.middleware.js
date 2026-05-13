// idempotency.middleware.js
//
// Idempotencia para replays de la cola offline del TPV. El cliente
// puede llamar 2x al mismo endpoint con la misma Idempotency-Key
// (ej: el sync corrió, registró éxito en el server pero murió antes
// de llamar markSynced; al próximo tick reintenta). Aquí dedupeamos
// para no crear órdenes/cobros duplicados.
//
// Implementación deliberadamente simple: Map en memoria con TTL de
// 1 hora. Para multi-instancia (Railway scaling) hay que migrar a
// Redis — TODO documentado.
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

function idempotencyMiddleware(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) return next();

  // Solo aplica a métodos que mutan estado.
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  // Scope tenant: misma key + distinto restaurant NO colisiona.
  const scoped = `${req.restaurantId || req.user?.restaurantId || 'anon'}::${key}`;

  const cached = cache.get(scoped);
  if (cached && cached.expiresAt > Date.now()) {
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
    }
    return originalJson(body);
  };

  next();
}

module.exports = idempotencyMiddleware;
