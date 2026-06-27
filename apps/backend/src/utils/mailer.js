// ─────────────────────────────────────────────────────────────────────────────
// mailer.js — Servicio de email via Resend (HTTP API, no SMTP)
// Railway bloquea puertos SMTP (465/587) — Resend usa HTTPS
// ─────────────────────────────────────────────────────────────────────────────

const { Resend } = require('resend')

let resend = null
function getResend() {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY)
  return resend
}

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[mailer] Skipped (no RESEND_API_KEY): ${to} — ${subject}`)
    return
  }
  const from = `${process.env.SMTP_FROM_NAME || 'MRTPVREST'} <${process.env.SMTP_FROM_EMAIL || 'noreply@mrtpvrest.com'}>`
  const { data, error } = await getResend().emails.send({ from, to, subject, html })
  if (error) throw new Error(error.message)
  console.log(`[mailer] Enviado → ${to} (id: ${data.id})`)
  return data
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Parsea una lista de correos escrita por el dueño (separada por coma, punto y
// coma, espacios o saltos de línea) y devuelve solo los que tienen forma válida,
// deduplicados y en minúsculas. Pura/testeable — sin I/O.
function parseEmailList(str) {
  if (!str || typeof str !== 'string') return [];
  const seen = new Set();
  const out = [];
  for (const raw of str.split(/[\s,;]+/)) {
    const e = raw.trim().toLowerCase();
    if (!e) continue;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

// Formato de dinero para los correos (MXN por defecto). Robusto ante null/NaN.
function pesos(n) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Templates ─────────────────────────────────────────────────────────────────

// Corte de caja al cierre del turno. Va al correo del dueño (vista privilegiada),
// así que incluye el arqueo completo aunque el turno sea ciego para el cajero.
// payload: { restaurantName, locationName, closedAtLabel, closedByName,
//   ordersCount, totalCash, totalCard, totalTransfer, totalCourtesy, totalSales,
//   openingFloat, totalCashIn, totalExpenses, expectedCash, closingFloat,
//   variance, notes, adminUrl }
function cashCutEmailHtml(p) {
  const row = (label, value, opts = {}) => `
    <tr>
      <td style="padding:9px 0;color:${opts.muted ? '#64748b' : '#334155'};font-size:14px;${opts.strong ? 'font-weight:800;' : ''}">${label}</td>
      <td style="padding:9px 0;text-align:right;color:${opts.color || '#0f172a'};font-size:14px;font-weight:${opts.strong ? '800' : '600'};font-variant-numeric:tabular-nums;">${value}</td>
    </tr>`;
  const divider = `<tr><td colspan="2" style="padding:0;"><div style="height:1px;background:#e2e8f0;margin:6px 0;"></div></td></tr>`;

  const variance = Number(p.variance);
  const hasVariance = Number.isFinite(variance) && (p.closingFloat !== null && p.closingFloat !== undefined);
  const varColor = !hasVariance ? '#0f172a' : variance < -0.005 ? '#dc2626' : variance > 0.005 ? '#d97706' : '#16a34a';
  const varLabel = !hasVariance ? '—' : variance < -0.005 ? `Faltante ${pesos(Math.abs(variance))}` : variance > 0.005 ? `Sobrante ${pesos(variance)}` : 'Cuadra exacto';

  return `
    <div style="font-family:'DM Sans',Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#0f172a;border-radius:20px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:linear-gradient(135deg,#7c3aed,#9f67ff);padding:24px 32px;">
        <h1 style="margin:0;font-size:18px;font-weight:900;letter-spacing:-0.5px;color:#fff;">CORTE DE CAJA${p.moduleLabel ? ' · ' + String(p.moduleLabel).toUpperCase() : ''}</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${p.restaurantName || 'Restaurante'}${p.locationName ? ' · ' + p.locationName : ''}</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="margin:0 0 2px;font-size:13px;color:#64748b;">Turno cerrado</p>
        <p style="margin:0 0 4px;font-size:20px;font-weight:900;letter-spacing:-0.4px;">${p.closedAtLabel || ''}</p>
        <p style="margin:0 0 24px;font-size:13px;color:#64748b;">
          Cerró: <strong style="color:#334155;">${p.closedByName || 'Cajero'}</strong> · ${p.ordersCount || 0} ${p.ordersCount === 1 ? 'orden' : 'órdenes'}
        </p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:8px 18px;margin-bottom:18px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td colspan="2" style="padding:10px 0 2px;color:#94a3b8;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Ventas por método</td></tr>
            ${row('Efectivo', pesos(p.totalCash))}
            ${row('Tarjeta', pesos(p.totalCard))}
            ${row('Transferencia', pesos(p.totalTransfer))}
            ${Number(p.totalCourtesy) ? row('Cortesías', pesos(p.totalCourtesy), { muted: true }) : ''}
            ${divider}
            ${row('Venta total', pesos(p.totalSales), { strong: true, color: '#7c3aed' })}
          </table>
        </div>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:8px 18px;margin-bottom:18px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td colspan="2" style="padding:10px 0 2px;color:#94a3b8;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Arqueo de efectivo</td></tr>
            ${row('Fondo de apertura', pesos(p.openingFloat))}
            ${row('+ Ventas en efectivo', pesos(p.totalCash))}
            ${row('+ Ingresos a caja', pesos(p.totalCashIn))}
            ${row('− Gastos de caja', pesos(p.totalExpenses))}
            ${divider}
            ${row('Efectivo esperado', pesos(p.expectedCash), { strong: true })}
            ${row('Efectivo contado', (p.closingFloat === null || p.closingFloat === undefined) ? '—' : pesos(p.closingFloat))}
            ${row('Diferencia', varLabel, { strong: true, color: varColor })}
          </table>
        </div>

        ${p.notes ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px 16px;margin-bottom:18px;">
          <p style="margin:0;font-size:12px;color:#92400e;"><strong>Notas:</strong> ${String(p.notes).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>` : ''}

        ${p.adminUrl ? `<a href="${p.adminUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:13px 26px;border-radius:12px;font-weight:800;text-decoration:none;font-size:14px;">Ver cortes en el panel →</a>` : ''}
      </div>
      <div style="padding:16px 32px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;">
        MRTPVREST · Resumen automático al cierre de caja
      </div>
    </div>
  `;
}

// Confirmación de pago de un pedido de tienda en línea, enviada al CLIENTE.
// payload: { restaurantName, orderNumber, customerName, items:[{name,quantity,price}],
//   subtotal, deliveryFee, discount, total, orderTypeLabel, etaLabel }
function orderPaidEmailHtml(p) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const itemRow = (it) => `
    <tr>
      <td style="padding:8px 0;color:#334155;font-size:14px;">
        <span style="display:inline-block;min-width:26px;font-weight:800;color:#0f172a;">${Number(it.quantity) || 1}×</span> ${esc(it.name)}
      </td>
      <td style="padding:8px 0;text-align:right;color:#0f172a;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;">${pesos((Number(it.price) || 0) * (Number(it.quantity) || 1))}</td>
    </tr>`;
  const sumRow = (label, value, opts = {}) => `
    <tr>
      <td style="padding:6px 0;color:${opts.strong ? '#0f172a' : '#64748b'};font-size:${opts.strong ? '16' : '13'}px;font-weight:${opts.strong ? '800' : '500'};">${label}</td>
      <td style="padding:6px 0;text-align:right;color:${opts.strong ? '#16a34a' : '#334155'};font-size:${opts.strong ? '16' : '13'}px;font-weight:${opts.strong ? '800' : '600'};font-variant-numeric:tabular-nums;">${value}</td>
    </tr>`;
  const items = Array.isArray(p.items) ? p.items : [];
  return `
    <div style="font-family:'DM Sans',Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;color:#0f172a;border-radius:20px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:linear-gradient(135deg,#16a34a,#22c55e);padding:24px 32px;">
        <h1 style="margin:0;font-size:18px;font-weight:900;letter-spacing:-0.5px;color:#fff;">✓ Pago confirmado</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">${esc(p.restaurantName) || 'Tu pedido'}</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="margin:0 0 2px;font-size:13px;color:#64748b;">Pedido</p>
        <p style="margin:0 0 4px;font-size:24px;font-weight:900;letter-spacing:-0.4px;">${esc(p.orderNumber)}</p>
        <p style="margin:0 0 22px;font-size:14px;color:#334155;">
          ¡Gracias${p.customerName ? ', ' + esc(p.customerName) : ''}! Tu pago se recibió y tu pedido está confirmado${p.orderTypeLabel ? ' · ' + esc(p.orderTypeLabel) : ''}.
        </p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:8px 18px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td colspan="2" style="padding:10px 0 2px;color:#94a3b8;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Tu pedido</td></tr>
            ${items.map(itemRow).join('')}
            <tr><td colspan="2" style="padding:0;"><div style="height:1px;background:#e2e8f0;margin:6px 0;"></div></td></tr>
            ${Number(p.deliveryFee) ? sumRow('Envío', pesos(p.deliveryFee)) : ''}
            ${Number(p.discount) ? sumRow('Descuento', '−' + pesos(p.discount)) : ''}
            ${sumRow('Total pagado', pesos(p.total), { strong: true })}
          </table>
        </div>

        ${p.etaLabel ? `<p style="margin:18px 0 0;font-size:13px;color:#64748b;">Tiempo estimado: <strong style="color:#334155;">${esc(p.etaLabel)}</strong></p>` : ''}
      </div>
      <div style="padding:16px 32px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;">
        ${esc(p.restaurantName) || 'MRTPVREST'} · Confirmación automática de tu pedido en línea
      </div>
    </div>
  `;
}

function verificationEmailHtml(ownerName, tenantName, verifyUrl) {
  return `
    <div style="font-family:'DM Sans',Inter,sans-serif;max-width:560px;margin:0 auto;background:#080810;color:#f0f0f8;border-radius:16px;overflow:hidden;border:1px solid #1e1e30;">
      <div style="background:linear-gradient(135deg,#7c3aed,#9f67ff);padding:24px 32px;">
        <h1 style="margin:0;font-size:20px;font-weight:900;letter-spacing:-0.5px;color:#fff;">
          MRTPVREST
        </h1>
      </div>
      <div style="padding:32px;">
        <p style="font-size:24px;font-weight:900;margin:0 0 8px;">Hola, ${ownerName} 👋</p>
        <p style="color:#6b6b90;margin:0 0 8px;">
          Tu cuenta de <strong style="color:#f0f0f8">${tenantName}</strong> fue creada. Solo falta verificar tu email para activarla.
        </p>
        <p style="color:#4a4a6a;font-size:13px;margin:0 0 32px;">
          Este enlace expira en <strong style="color:#f0f0f8">24 horas</strong>.
        </p>
        <a href="${verifyUrl}"
          style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#9f67ff);color:#fff;padding:16px 32px;border-radius:12px;font-weight:900;text-decoration:none;font-size:15px;letter-spacing:-0.3px;box-shadow:0 4px 20px rgba(124,58,237,0.4);">
          VERIFICAR MI CUENTA →
        </a>
        <p style="color:#4a4a6a;font-size:12px;margin:32px 0 0;">
          Si no creaste esta cuenta, ignora este mensaje.
        </p>
      </div>
      <div style="padding:16px 32px;border-top:1px solid #1e1e30;color:#4a4a6a;font-size:12px;">
        MRTPVREST · Sistema de punto de venta para restaurantes
      </div>
    </div>
  `
}

function trialReminderHtml(tenantName, daysLeft, billingUrl) {
  const urgency = daysLeft === 1 ? 'Último día' : daysLeft === 3 ? 'Quedan 3 días' : 'Quedan 7 días'
  return `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:16px;overflow:hidden;">
      <div style="background:#f97316;padding:24px 32px;">
        <h1 style="margin:0;font-size:20px;font-weight:900;letter-spacing:-0.5px;">MRTPV<span style="color:#000">REST</span></h1>
      </div>
      <div style="padding:32px;">
        <p style="font-size:24px;font-weight:900;margin:0 0 8px;">${urgency}</p>
        <p style="color:#9ca3af;margin:0 0 24px;">Tu prueba gratuita de <strong style="color:#fff">${tenantName}</strong> vence en <strong style="color:#f97316">${daysLeft} día${daysLeft > 1 ? 's' : ''}</strong>.</p>
        <p style="color:#9ca3af;margin:0 0 32px;">Para seguir usando MRTPVREST sin interrupciones, elige tu plan ahora.</p>
        <a href="${billingUrl}"
          style="display:inline-block;background:#f97316;color:#000;padding:14px 28px;border-radius:12px;font-weight:900;text-decoration:none;font-size:14px;">
          VER PLANES →
        </a>
      </div>
    </div>
  `
}

function trialExpiredHtml(tenantName, billingUrl) {
  return `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:16px;overflow:hidden;">
      <div style="background:#dc2626;padding:24px 32px;">
        <h1 style="margin:0;font-size:20px;font-weight:900;letter-spacing:-0.5px;">MRTPV<span style="color:#fff">REST</span></h1>
      </div>
      <div style="padding:32px;">
        <p style="font-size:24px;font-weight:900;margin:0 0 8px;">Tu período de prueba venció</p>
        <p style="color:#9ca3af;margin:0 0 24px;">El acceso de <strong style="color:#fff">${tenantName}</strong> ha sido pausado.</p>
        <p style="color:#9ca3af;margin:0 0 32px;">Reactiva tu cuenta eligiendo un plan para seguir recibiendo pedidos.</p>
        <a href="${billingUrl}"
          style="display:inline-block;background:#dc2626;color:#fff;padding:14px 28px;border-radius:12px;font-weight:900;text-decoration:none;font-size:14px;">
          REACTIVAR AHORA →
        </a>
      </div>
    </div>
  `
}

function welcomeEmailHtml(ownerName, tenantName, downloadsUrl) {
  return `
    <div style="font-family:'DM Sans',Inter,sans-serif;max-width:560px;margin:0 auto;background:#080810;color:#f0f0f8;border-radius:16px;overflow:hidden;border:1px solid #1e1e30;">
      <div style="background:linear-gradient(135deg,#7c3aed,#9f67ff);padding:24px 32px;">
        <h1 style="margin:0;font-size:20px;font-weight:900;letter-spacing:-0.5px;color:#fff;">
          MRTPVREST
        </h1>
      </div>
      <div style="padding:32px;">
        <p style="font-size:24px;font-weight:900;margin:0 0 8px;">¡Bienvenido, ${ownerName}! 🎉</p>
        <p style="color:#6b6b90;margin:0 0 8px;">
          Gracias por verificar tu cuenta de <strong style="color:#f0f0f8">${tenantName}</strong>.
        </p>
        <p style="color:#6b6b90;margin:0 0 24px;">
          Ya puedes descargar nuestras aplicaciones móviles (TPV, KDS, Delivery y Kiosko) directamente desde tu panel de administración.
        </p>
        <a href="${downloadsUrl}"
          style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#9f67ff);color:#fff;padding:16px 32px;border-radius:12px;font-weight:900;text-decoration:none;font-size:15px;letter-spacing:-0.3px;box-shadow:0 4px 20px rgba(124,58,237,0.4);">
          IR AL PANEL DE DESCARGAS →
        </a>
        <p style="color:#4a4a6a;font-size:12px;margin:32px 0 0;">
          Para cualquier consulta, no dudes en contactarnos.
        </p>
      </div>
      <div style="padding:16px 32px;border-top:1px solid #1e1e30;color:#4a4a6a;font-size:12px;">
        MRTPVREST · Sistema de punto de venta para restaurantes
      </div>
    </div>
  `
}

module.exports = { sendEmail, parseEmailList, verificationEmailHtml, trialReminderHtml, trialExpiredHtml, welcomeEmailHtml, cashCutEmailHtml, orderPaidEmailHtml }
