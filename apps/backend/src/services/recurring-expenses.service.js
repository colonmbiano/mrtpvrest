'use strict';

// Servicio de gastos recurrentes: materializa las plantillas RecurringExpense
// vencidas en cuentas por pagar (OperatingExpense PENDING) y avanza nextDueAt.
// Fuente unica de verdad usada por la ruta admin (POST /api/payables/recurring/run,
// acotada a un restaurantId) y por el cron diario (todos los tenants).

const { prisma } = require('@mrtpvrest/database');

// Avanza la proxima fecha de generacion segun la frecuencia. MONTHLY ancla al
// dayOfMonth (acotado a 28 para que exista en todos los meses).
function advanceDue(date, freq, dayOfMonth) {
  const d = new Date(date);
  if (freq === 'WEEKLY') { d.setDate(d.getDate() + 7); return d; }
  if (freq === 'BIWEEKLY') { d.setDate(d.getDate() + 14); return d; }
  const day = dayOfMonth || d.getDate();
  d.setMonth(d.getMonth() + 1, Math.min(day, 28));
  return d;
}

/**
 * Genera las cuentas por pagar de las plantillas recurrentes vencidas.
 * @param {object} [opts]
 * @param {string|null} [opts.restaurantId] Acota a un tenant (uso ruta admin).
 *        null/omitido = TODOS los tenants (uso cron; el tenant-guard hace
 *        passthrough cuando no hay contexto de tenant).
 * @param {Date} [opts.now] Inyectable para pruebas.
 * @returns {Promise<{generated:number, scanned:number}>}
 */
async function generateDueRecurring({ restaurantId = null, now = new Date() } = {}) {
  const due = await prisma.recurringExpense.findMany({
    where: { isActive: true, nextDueAt: { lte: now }, ...(restaurantId ? { restaurantId } : {}) },
  });

  let generated = 0;
  for (const t of due) {
    // Aislamiento de fallas: una plantilla corrupta (locationId null, FK
    // colgante en categoria/proveedor, etc.) NO debe abortar la corrida del
    // resto de tenants. Se loguea y se continua.
    try {
      if (!t.locationId) {
        console.warn(`[recurring] plantilla ${t.id} (rest ${t.restaurantId}) sin locationId; omitida`);
        continue;
      }
      const next = advanceDue(t.nextDueAt, t.frequency, t.dayOfMonth);
      // Idempotente: el WHERE condicional sobre nextDueAt evita doble generacion
      // si el cron y un disparo manual coinciden.
      const ok = await prisma.$transaction(async (tx) => {
        const upd = await tx.recurringExpense.updateMany({
          where: { id: t.id, nextDueAt: t.nextDueAt },
          data: { nextDueAt: next, lastGeneratedAt: now },
        });
        if (upd.count === 0) return false;
        await tx.operatingExpense.create({
          data: {
            restaurantId: t.restaurantId,
            locationId: t.locationId,
            categoryId: t.categoryId || null,
            supplierId: t.supplierId || null,
            concept: t.concept,
            amount: t.amount,
            paymentMethod: 'TRANSFER',     // intencion; se define al liquidar
            settlementStatus: 'PENDING',
            dueDate: t.nextDueAt,
            notes: 'Generado de gasto recurrente',
          },
        });
        return true;
      });
      if (ok) generated++;
    } catch (e) {
      console.error(`[recurring] error en plantilla ${t.id} (rest ${t.restaurantId}):`, e.message);
    }
  }
  return { generated, scanned: due.length };
}

module.exports = { advanceDue, generateDueRecurring };
