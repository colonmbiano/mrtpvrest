'use strict';

// Métricas del bot de WhatsApp (Cajero Estrella). Alimenta el endpoint
// /api/bot-metrics y el correo diario. Queries con Prisma tipado (sin SQL crudo
// → pasa por el tenant-guard; además se filtra por restaurantId a mano).

const { prisma } = require('@mrtpvrest/database');

// Marca en notes con la que el bot crea sus órdenes (lo distingue de otras
// capturas WHATSAPP, como la captura manual del TPV).
const BOT_NOTE = 'Pedido generado por asistente de IA de WhatsApp';

// Restaurante por defecto para las métricas: el primero de la allowlist de
// milestones (ya seteada a Master Burguer's en el backend).
function defaultRestaurantId() {
  return (process.env.LOYALTY_MILESTONE_RESTAURANT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)[0] || null;
}

async function computeBotMetrics(restaurantId) {
  if (!restaurantId) throw new Error('restaurantId requerido');
  const now = Date.now();
  const d1 = new Date(now - 24 * 3600 * 1000);
  const d7 = new Date(now - 7 * 24 * 3600 * 1000);
  const botWhere = { restaurantId, source: 'WHATSAPP', notes: BOT_NOTE };

  const [total, last24h, last7d, agg, byStatus, sources7d, customersTotal, customersRewardable, lastOrder] = await Promise.all([
    prisma.order.count({ where: botWhere }),
    prisma.order.count({ where: { ...botWhere, createdAt: { gte: d1 } } }),
    prisma.order.count({ where: { ...botWhere, createdAt: { gte: d7 } } }),
    prisma.order.aggregate({ where: botWhere, _sum: { total: true }, _avg: { total: true } }),
    prisma.order.groupBy({ by: ['status'], where: botWhere, _count: { _all: true } }),
    prisma.order.groupBy({ by: ['source'], where: { restaurantId, createdAt: { gte: d7 } }, _count: { _all: true }, _sum: { total: true } }),
    prisma.customer.count({ where: { restaurantId } }),
    prisma.customer.count({ where: { restaurantId, ordersCount: { gte: 10 } } }),
    prisma.order.findFirst({ where: botWhere, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);

  return {
    restaurantId,
    generatedAt: new Date().toISOString(),
    bot: {
      total,
      last24h,
      last7d,
      revenue: Math.round(Number(agg._sum.total) || 0),
      avgTicket: Math.round(Number(agg._avg.total) || 0),
      byStatus: byStatus.map((s) => ({ status: s.status, n: s._count._all })).sort((a, b) => b.n - a.n),
      lastOrderAt: lastOrder?.createdAt || null,
    },
    sources7d: sources7d
      .map((s) => ({ source: s.source, n: s._count._all, revenue: Math.round(Number(s._sum.total) || 0) }))
      .sort((a, b) => b.n - a.n),
    customers: { total: customersTotal, rewardable: customersRewardable },
  };
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

// HTML con estilos inline → sirve igual para el navegador (endpoint) y el correo.
function renderMetricsHtml(m, restaurantName) {
  const b = m.bot;
  const statusRows = b.byStatus.map((s) => `<tr><td style="padding:4px 12px">${esc(s.status)}</td><td style="padding:4px 12px;text-align:right"><b>${s.n}</b></td></tr>`).join('') || '<tr><td colspan="2" style="padding:4px 12px;color:#888">Sin pedidos aún</td></tr>';
  const srcRows = m.sources7d.map((s) => `<tr><td style="padding:4px 12px">${esc(s.source)}</td><td style="padding:4px 12px;text-align:right">${s.n}</td><td style="padding:4px 12px;text-align:right">$${s.revenue.toLocaleString('es-MX')}</td></tr>`).join('') || '<tr><td colspan="3" style="padding:4px 12px;color:#888">—</td></tr>';
  const card = (label, val) => `<div style="flex:1;min-width:120px;background:#f6f8fa;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px"><div style="font-size:12px;color:#64748b">${label}</div><div style="font-size:22px;font-weight:800;color:#0f172a">${val}</div></div>`;
  const fecha = new Date(m.generatedAt).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<div style="font-family:system-ui,Segoe UI,DM Sans,sans-serif;max-width:640px;margin:0 auto;padding:16px;color:#0f172a">
  <h1 style="font-size:20px;margin:0 0 4px">🤖 Bot WhatsApp — Métricas${restaurantName ? ` · ${esc(restaurantName)}` : ''}</h1>
  <p style="color:#64748b;font-size:13px;margin:0 0 16px">Generado: ${esc(fecha)}</p>
  <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px">
    ${card('Pedidos (total)', b.total)}
    ${card('Últimas 24h', b.last24h)}
    ${card('Últimos 7 días', b.last7d)}
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px">
    ${card('Ingresos', '$' + b.revenue.toLocaleString('es-MX'))}
    ${card('Ticket prom.', '$' + b.avgTicket.toLocaleString('es-MX'))}
    ${card('Clientes', m.customers.total + (m.customers.rewardable ? ` (${m.customers.rewardable} c/premio)` : ''))}
  </div>
  <h3 style="font-size:15px;margin:0 0 6px">Pedidos del bot por estado</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:20px"><tbody>${statusRows}</tbody></table>
  <h3 style="font-size:15px;margin:0 0 6px">Canales (últimos 7 días)</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <thead><tr style="color:#64748b;font-size:12px"><th style="text-align:left;padding:4px 12px">Fuente</th><th style="text-align:right;padding:4px 12px">Pedidos</th><th style="text-align:right;padding:4px 12px">Ingresos</th></tr></thead>
    <tbody>${srcRows}</tbody>
  </table>
  <p style="color:#94a3b8;font-size:12px;margin-top:20px">MRTPVREST · métricas del asistente de WhatsApp</p>
</div>`;
}

module.exports = { computeBotMetrics, renderMetricsHtml, defaultRestaurantId, BOT_NOTE };
