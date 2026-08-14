'use strict';

// ───────────────────────────────────────────────────────────────────────────
// Definición canónica de "mesa con cuenta abierta".
//
// Una cuenta de mesa NO se queda en 'OPEN': cocina la avanza a
// CONFIRMED/PREPARING/READY sin que esté pagada, y los pedidos que entran por
// el QR de mesa (tienda online / kiosko) nacen en PENDING hasta que el cajero
// los acepta. Filtrar por un subconjunto rompe de tres formas:
//   (a) duplica cuentas — la mesa "ocupada" no se detecta al re-entrar,
//   (b) hace inconsistente la fusión por tableId,
//   (c) el mapa de piso pinta como libre una mesa que ya pidió por QR.
//
// Este set + `paymentStatus != PAID` debe usarse en TODO lookup de
// cuenta-por-mesa (órdenes, mapa de piso, meseros, borrado de mesa).
// ───────────────────────────────────────────────────────────────────────────
const OPEN_TABLE_STATUSES = ['PENDING', 'OPEN', 'CONFIRMED', 'PREPARING', 'READY'];

// Where reutilizable para "la cuenta viva de esta mesa".
function openTabWhere(tableId) {
  return {
    tableId,
    status: { in: OPEN_TABLE_STATUSES },
    paymentStatus: { not: 'PAID' },
  };
}

module.exports = { OPEN_TABLE_STATUSES, openTabWhere };
