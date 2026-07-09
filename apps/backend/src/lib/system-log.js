// Persistencia de eventos de observabilidad (modelo Prisma SystemLog).
//
// API:
//   recordSystemLog({ level, message, stack?, path?, method?, tenantId?, metadata? })
//   notifyAdmin({ message, metadata })   ← stub: log + hook futuro (email/Slack)
//
// El middleware error global llama recordSystemLog en cada excepción.
// Los handlers que quieran loguear eventos importantes a la DB también
// pueden invocarlo directamente.

const { prisma } = require('@mrtpvrest/database');
const log = require('./logger')('system-log');

const VALID_LEVELS = new Set(['INFO', 'WARN', 'ERROR', 'CRITICAL']);

async function recordSystemLog({
  level = 'ERROR',
  message,
  stack = null,
  path = null,
  method = null,
  tenantId = null,
  metadata = null,
} = {}) {
  const norm = String(level).toUpperCase();
  if (!VALID_LEVELS.has(norm)) {
    log.warn('invalid_level', { level });
    return null;
  }
  if (!message || typeof message !== 'string') {
    log.warn('missing_message');
    return null;
  }

  try {
    const created = await prisma.systemLog.create({
      data: {
        level: norm,
        message: message.slice(0, 4000),
        stack: stack ? String(stack).slice(0, 12000) : null,
        path,
        method,
        tenantId,
        metadata: metadata ?? null,
      },
      select: { id: true, createdAt: true, level: true },
    });

    if (norm === 'CRITICAL') {
      // No await — el aviso es best-effort, no debe bloquear la respuesta
      // del request original.
      notifyAdmin({ message, metadata: { ...metadata, path, method, tenantId } })
        .catch((err) => log.error('notify_admin_failed', { err: err.message }));
    }

    return created;
  } catch (err) {
    // Log a stdout para no perder la traza si DB está caída.
    log.error('record_failed', { err: err.message });
    return null;
  }
}

// Notificación a admin de plataforma ante errores CRITICAL: log estructurado
// + email al SUPER_ADMIN (best-effort). El require es lazy para evitar cargar
// el mailer/Prisma en tests que sólo ejercitan recordSystemLog.
async function notifyAdmin({ message, metadata }) {
  log.error('CRITICAL_ALERT', { message, metadata });
  try {
    const { notifyPlatformAdmin } = require('./platform-notify');
    const lines = [
      String(message),
      metadata?.path ? `Ruta: ${metadata.method || ''} ${metadata.path}`.trim() : null,
      metadata?.tenantId ? `Tenant: ${metadata.tenantId}` : null,
    ].filter(Boolean);
    await notifyPlatformAdmin({
      subject: '🚨 Error crítico en MRTPVREST',
      title: 'Error crítico del sistema',
      lines,
    });
  } catch (err) {
    log.error('notify_email_failed', { err: err.message });
  }
  return true;
}

module.exports = { recordSystemLog, notifyAdmin };
