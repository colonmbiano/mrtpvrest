// /api/admin/logs — observabilidad super-admin.
//
// Combina dos fuentes:
//   - Buffer in-memory (lib/log-buffer): logs estructurados del logger,
//     últimos 500. Incluye INFO/DEBUG/WARN además de errores. Útil para
//     stream rápido en /super/errors.
//   - Tabla SystemLog (Prisma): persistencia durable de errores y
//     eventos críticos capturados por el middleware global.
//
// Endpoints (todos SUPER_ADMIN-only):
//   GET /api/admin/logs              → buffer in-memory con cursor + filtros
//   GET /api/admin/logs/db           → últimos N rows de SystemLog (DB)
//   GET /api/admin/logs/export       → JSON MCP-friendly (Claude Code, etc.)

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const buffer = require('../lib/log-buffer');
const { prisma } = require('@mrtpvrest/database');

const router = express.Router();

function requireSuperAdmin(req, res, next) {
  if (req.user?.role === 'SUPER_ADMIN') return next();
  return res.status(403).json({ error: 'Solo SUPER_ADMIN puede consultar logs' });
}

// ── Buffer in-memory ──────────────────────────────────────────────────────

router.get('/', authenticate, requireSuperAdmin, (req, res) => {
  const sinceStr = typeof req.query.since === 'string' ? req.query.since : null;
  const sinceTs  = sinceStr ? Date.parse(sinceStr) : 0;
  const limit    = Math.max(1, Math.min(500, Number(req.query.limit) || 200));
  const levels   = parseCsv(req.query.level);
  const modules  = parseCsv(req.query.module);

  let snapshot = buffer.getSnapshot();
  if (sinceTs > 0) snapshot = snapshot.filter((r) => Date.parse(r.t) > sinceTs);
  if (levels)      snapshot = snapshot.filter((r) => levels.includes(r.level));
  if (modules)     snapshot = snapshot.filter((r) => modules.includes(r.module));

  res.json({
    capacity: buffer.capacity,
    total:    snapshot.length,
    serverNow: new Date().toISOString(),
    records:  snapshot.slice(-limit),
  });
});

// ── DB (SystemLog) — persistente ──────────────────────────────────────────

router.get('/db', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
    const level = parseCsv(req.query.level);
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : null;
    const since = typeof req.query.since === 'string' ? req.query.since : null;

    const where = {};
    if (level)    where.level = { in: level.map((l) => l.toUpperCase()) };
    if (tenantId) where.tenantId = tenantId;
    if (since && !Number.isNaN(Date.parse(since))) {
      where.createdAt = { gt: new Date(since) };
    }

    const rows = await prisma.systemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ total: rows.length, records: rows });
  } catch (err) {
    next(err);
  }
});

// ── Export MCP ────────────────────────────────────────────────────────────
//
// Devuelve los últimos errores en formato optimizado para que Claude Code
// y otras herramientas MCP los procesen. El JSON incluye metadata de la
// plataforma + array de eventos compactados sin campos null.

router.get('/export', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 200));
    const minLevel = (typeof req.query.minLevel === 'string'
      ? req.query.minLevel.toUpperCase()
      : 'ERROR');
    const allowedLevels = filterByMinLevel(minLevel);

    const rows = await prisma.systemLog.findMany({
      where: { level: { in: allowedLevels } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Compactar para minimizar tokens al pasarlo por LLM.
    const events = rows.map((r) => stripNulls({
      id: r.id,
      ts: r.createdAt.toISOString(),
      level: r.level,
      message: r.message,
      path: r.path,
      method: r.method,
      tenantId: r.tenantId,
      stack: r.stack ? truncate(r.stack, 4000) : null,
      metadata: r.metadata,
    }));

    res.json({
      schemaVersion: 1,
      kind: 'mrtpvrest.system-log.export',
      generatedAt: new Date().toISOString(),
      backend: 'api.mrtpvrest.com',
      filters: { minLevel, limit },
      counts: countByLevel(rows),
      events,
      claudeHint: [
        'Cada evento es un error capturado por el middleware global del backend',
        'Express en api.mrtpvrest.com. Para diagnosticar:',
        '1) Agrupa por path+method para encontrar endpoints con más fallos.',
        '2) Lee stack si está presente; identifica el módulo origen.',
        '3) Si metadata.status >= 500, es probable bug de servidor.',
        '4) Si metadata.tenantId varía mucho en un mismo path, puede ser bug',
        '   de multi-tenancy. Si es siempre el mismo tenant, es config.',
      ].join(' '),
    });
  } catch (err) {
    next(err);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────

function parseCsv(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function stripNulls(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function filterByMinLevel(min) {
  const order = ['INFO', 'WARN', 'ERROR', 'CRITICAL'];
  const idx = order.indexOf(min);
  return idx >= 0 ? order.slice(idx) : ['ERROR', 'CRITICAL'];
}

function countByLevel(rows) {
  const c = { INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 0 };
  for (const r of rows) if (r.level in c) c[r.level] += 1;
  return c;
}

module.exports = router;
