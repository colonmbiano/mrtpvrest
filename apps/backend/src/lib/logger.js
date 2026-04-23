// Logger estructurado mínimo. Emite JSON por stdout para que cualquier
// colector (Railway, Datadog, Loki, etc.) pueda parsear sin regex.
// Uso: const log = require('../lib/logger')('auth'); log.info('event', {...})

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LEVEL_THRESHOLD = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function emit(level, module, event, fields) {
  if ((LEVELS[level] ?? LEVELS.info) < LEVEL_THRESHOLD) return;
  const record = {
    t: new Date().toISOString(),
    level,
    module,
    event,
    ...(fields && typeof fields === 'object' ? fields : {}),
  };
  const line = JSON.stringify(record, (_k, v) => v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v);
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(line + '\n');
}

function createLogger(moduleName) {
  return {
    debug: (event, fields) => emit('debug', moduleName, event, fields),
    info:  (event, fields) => emit('info',  moduleName, event, fields),
    warn:  (event, fields) => emit('warn',  moduleName, event, fields),
    error: (event, fields) => emit('error', moduleName, event, fields),
  };
}

module.exports = createLogger;
