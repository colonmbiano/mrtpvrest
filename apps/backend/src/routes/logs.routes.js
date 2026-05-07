// /api/admin/logs — visor de logs estructurados in-memory.
//
// El backend mantiene un ring buffer (lib/log-buffer.js) con los últimos
// 500 records emitidos por lib/logger. Estos endpoints lo exponen para
// que un panel admin pueda mostrarlos sin depender de Railway/Datadog.
//
// SUPER_ADMIN-only: los logs pueden contener metadata cross-tenant.
//
// Endpoints:
//   GET /api/admin/logs?since=ISO&limit=N&level=warn,error&module=auth
//     - since: solo records con t > since (cursor para polling incremental)
//     - limit: máx records devueltos (default 200, cap 500)
//     - level: lista CSV opcional para filtrar por nivel
//     - module: lista CSV opcional para filtrar por módulo

const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const buffer = require('../lib/log-buffer');

const router = express.Router();

function requireSuperAdmin(req, res, next) {
  if (req.user?.role === 'SUPER_ADMIN') return next();
  return res.status(403).json({ error: 'Solo SUPER_ADMIN puede consultar logs' });
}

router.get('/', authenticate, requireSuperAdmin, (req, res) => {
  const sinceStr = typeof req.query.since === 'string' ? req.query.since : null;
  const sinceTs  = sinceStr ? Date.parse(sinceStr) : 0;
  const limit    = Math.max(1, Math.min(500, Number(req.query.limit) || 200));
  const levels   = parseCsv(req.query.level);
  const modules  = parseCsv(req.query.module);

  let snapshot = buffer.getSnapshot();
  if (sinceTs > 0) {
    snapshot = snapshot.filter((r) => Date.parse(r.t) > sinceTs);
  }
  if (levels) {
    snapshot = snapshot.filter((r) => levels.includes(r.level));
  }
  if (modules) {
    snapshot = snapshot.filter((r) => modules.includes(r.module));
  }

  // Devuelve los más nuevos primero por defecto, pero acotado a `limit`.
  const out = snapshot.slice(-limit);
  res.json({
    capacity: buffer.capacity,
    total:    out.length,
    serverNow: new Date().toISOString(),
    records:  out,
  });
});

function parseCsv(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

module.exports = router;
