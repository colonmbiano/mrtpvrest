'use strict';

// ───────────────────────────────────────────────────────────────────────────
// cash-cut-mailer.js — Envío del corte de caja por correo al cierre del turno.
//
// Compartido por el cierre del TPV de restaurante (shifts.routes) y el del
// módulo de tienda/retail (retail.routes). Cada cierre normaliza sus campos a
// la forma `cut` (ver abajo) y llama a sendCashCutEmail; toda la resolución de
// config, destinatarios, nombres y plantilla vive aquí una sola vez.
//
// Es best-effort por diseño: el cierre YA está confirmado en la BD antes de
// llamar aquí. Quien llama NO debe await-earlo (fire-and-forget con .catch) para
// que un fallo de correo nunca bloquee la respuesta al cajero ni revierta nada.
// ───────────────────────────────────────────────────────────────────────────

const { prisma } = require('@mrtpvrest/database');
const { sendEmail, parseEmailList, cashCutEmailHtml } = require('../utils/mailer');

/**
 * @param {object} p
 * @param {string}  p.restaurantId  Restaurante dueño del corte (tenant).
 * @param {string} [p.locationId]   Sucursal (para mostrar su nombre).
 * @param {string} [p.closedByName] Quién cerró (para el encabezado).
 * @param {Date|string} [p.closedAt] Momento del cierre.
 * @param {string} [p.moduleLabel]  Etiqueta del origen ("Tienda" para retail).
 * @param {string|null} [p.adminUrl] Enlace "ver cortes" (null → sin botón).
 * @param {object} p.cut            Cifras YA normalizadas del corte:
 *   { ordersCount, totalCash, totalCard, totalTransfer, totalCourtesy,
 *     totalSales, openingFloat, totalCashIn, totalExpenses, expectedCash,
 *     closingFloat, variance, notes }
 */
async function sendCashCutEmail({ restaurantId, locationId, closedByName, closedAt, moduleLabel, adminUrl, cut }) {
  if (!restaurantId) return;

  const config = await prisma.restaurantConfig.findUnique({
    where: { restaurantId },
    select: { cashCutEmailEnabled: true, cashCutEmails: true, timezone: true },
  });
  if (!config?.cashCutEmailEnabled) return;

  let recipients = parseEmailList(config.cashCutEmails);
  if (recipients.length === 0) {
    // Fallback: correos de los admins del restaurante (Role.ADMIN). SUPER_ADMIN
    // se excluye a propósito — es la plataforma, no el dueño del negocio.
    const admins = await prisma.user.findMany({
      where: { restaurantId, role: 'ADMIN', isActive: true },
      select: { email: true },
      take: 5,
    });
    recipients = parseEmailList(admins.map((u) => u.email).join(','));
  }
  if (recipients.length === 0) {
    console.warn(`[cash-cut-email] Sin destinatarios para restaurante ${restaurantId} — corte no enviado`);
    return;
  }

  const [location, restaurant] = await Promise.all([
    locationId
      ? prisma.location.findUnique({ where: { id: locationId }, select: { name: true } })
      : null,
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
  ]);

  const tz = config.timezone || 'America/Mexico_City';
  const when = new Date(closedAt || Date.now());
  const closedAtLabel = when.toLocaleString('es-MX', {
    timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
  const shortDate = when.toLocaleDateString('es-MX', {
    timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const html = cashCutEmailHtml({
    restaurantName: restaurant?.name,
    locationName: location?.name,
    moduleLabel,
    closedAtLabel,
    closedByName: closedByName || 'Cajero',
    adminUrl,
    ...cut,
  });

  const subjectModule = moduleLabel ? ` · ${moduleLabel}` : '';
  await sendEmail(
    recipients,
    `Corte de caja${subjectModule} — ${restaurant?.name || 'Restaurante'} · ${shortDate}`,
    html,
  );
}

module.exports = { sendCashCutEmail };
