// Contadores in-memory de eventos del middleware de autenticación.
// Se exponen vía GET /health/auth para diagnosticar tasas de:
//   - token_missing       → request sin Bearer header
//   - token_expired       → JWT con exp pasado
//   - token_malformed     → JWT no parseable o firma inválida
//   - user_not_found      → JWT válido pero el id ya no existe en DB
//   - user_inactive       → usuario/empleado deshabilitado
//   - success             → autenticación exitosa
//
// El reset es manual (process restart limpia los contadores). Si más adelante
// se conecta Prometheus, basta exportar `getAuthCounters()` como gauges.

const counters = {
  token_missing:    0,
  token_expired:    0,
  token_malformed:  0,
  user_not_found:   0,
  user_inactive:    0,
  success:          0,
};

const startedAt = Date.now();

function increment(key) {
  if (key in counters) counters[key] += 1;
}

function getAuthCounters() {
  return {
    counters: { ...counters },
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    startedAt: new Date(startedAt).toISOString(),
  };
}

module.exports = { increment, getAuthCounters };
