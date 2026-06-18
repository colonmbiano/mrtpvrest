'use strict';

// ───────────────────────────────────────────────────────────────────────────
// order-number.js — Folio secuencial y CONTINUO por restaurante (1, 2, 3...).
//
// Reemplaza el viejo 'TPV-' + fragmento del timestamp, que no contaba nada real
// y podía colisionar (mismo milisegundo) o saltarse números. Ahora el folio es
// el N-ésimo de la vida del negocio, venga del canal que venga (TPV, web,
// kiosko, WhatsApp). El canal de origen sigue guardándose en Order.source.
//
// CONCURRENCIA: el número se asigna con un UPDATE atómico sobre la fila del
// contador (model Counter, único por [restaurantId, scope]). Postgres toma un
// lock de fila en el incremento que se sostiene hasta el commit de la
// transacción; un segundo cobro simultáneo se serializa detrás y obtiene N+1.
// Por eso DEBE llamarse con el MISMO `tx` que crea la orden cuando se crea
// dentro de una $transaction: así el folio hace rollback junto con la orden si
// algo falla (sin huecos por creaciones abortadas).
//
// Para canales que crean la orden sin transacción (kiosko/WhatsApp) se puede
// pasar el cliente `prisma` normal: el folio es igual de único, con el único
// matiz de que una creación que falle DESPUÉS de pedir folio dejaría un hueco
// en la serie. Es aceptable (un hueco no es un error de integridad).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Asigna y devuelve el siguiente folio (entero) para un restaurante.
 * @param {import('@prisma/client').Prisma.TransactionClient|object} client - `tx` (preferido) o `prisma`.
 * @param {string} restaurantId
 * @param {string} [scope='order'] - serie del contador (por ahora siempre 'order').
 * @returns {Promise<number>} el folio asignado (>= 1).
 */
async function nextOrderSeq(client, restaurantId, scope = 'order') {
  if (!restaurantId) throw new Error('nextOrderSeq: restaurantId requerido');

  // Camino rápido: el contador ya existe → incremento atómico y leemos nuestro
  // propio write dentro de la transacción.
  const bumped = await client.counter.updateMany({
    where: { restaurantId, scope },
    data: { value: { increment: 1 } },
  });
  if (bumped.count > 0) {
    const c = await client.counter.findFirst({
      where: { restaurantId, scope },
      select: { value: true },
    });
    return c.value;
  }

  // Camino frío: primera vez para este restaurante. Sembramos desde el histórico
  // para que la serie sea CONTINUA (incluye órdenes con folio viejo 'TPV-xxxxxx').
  const seedBase = await client.order.count({ where: { restaurantId } });
  try {
    const created = await client.counter.create({
      data: { restaurantId, scope, value: seedBase + 1 },
      select: { value: true },
    });
    return created.value;
  } catch (e) {
    // Perdimos la carrera del create (otra creación sembró primero) → la fila ya
    // existe; incrementamos y leemos.
    const retry = await client.counter.updateMany({
      where: { restaurantId, scope },
      data: { value: { increment: 1 } },
    });
    if (retry.count > 0) {
      const c = await client.counter.findUnique({
        where: { restaurantId_scope: { restaurantId, scope } },
        select: { value: true },
      });
      return c.value;
    }
    throw e;
  }
}

/**
 * Igual que nextOrderSeq pero devuelve el folio ya formateado como string para
 * guardar en Order.orderNumber. Hoy es el número pelón ("501"); si algún día se
 * quiere prefijo por sucursal, se centraliza aquí.
 * @returns {Promise<string>}
 */
async function nextOrderNumber(client, restaurantId, scope = 'order') {
  const seq = await nextOrderSeq(client, restaurantId, scope);
  return String(seq);
}

module.exports = { nextOrderSeq, nextOrderNumber };
