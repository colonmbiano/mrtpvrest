// Unidades de venta y cobro por peso. Centraliza la validación/normalización
// para que TODOS los canales (TPV, tienda online, kiosko, bot de WhatsApp)
// compartan la misma noción de "qué es pesable" y cómo se parsea la cantidad.
//
// Modelo: unit ∈ {pz, unidad, g, kg}. pz/unidad son enteros; g/kg son pesables
// (cantidad decimal). El precio se interpreta literal por la unidad elegida, así
// que subtotal = price × quantity en todos los casos.

const VALID_UNITS = ['pz', 'unidad', 'g', 'kg'];

/** Normaliza una unidad arbitraria al set válido; default "pz" si inválida/ausente. */
function normUnit(u) {
  return VALID_UNITS.includes(u) ? u : 'pz';
}

/** ¿La unidad se cobra por peso (cantidad decimal)? */
function isWeighable(unit) {
  return unit === 'g' || unit === 'kg';
}

/**
 * Parsea la cantidad respetando la unidad:
 *  - pesable    → parseFloat(raw); NO se redondea el peso. Devuelve 0 si es
 *                 inválido (<= 0 o NaN); el caller debe rechazar ese caso.
 *  - no pesable → Math.max(1, parseInt(raw, 10)).
 */
function parseQty(raw, unit) {
  if (isWeighable(unit)) {
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  const n = parseInt(raw, 10);
  return Math.max(1, Number.isFinite(n) ? n : 1);
}

/** Redondeo monetario a 2 decimales (evita 153.60000001 al persistir el subtotal). */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Mensaje único para los canales que NO soportan cobro por peso (todo menos TPV).
const WEIGHABLE_REJECT_MESSAGE =
  'Este producto se vende por peso y solo puede cobrarse desde el TPV.';

module.exports = {
  VALID_UNITS,
  normUnit,
  isWeighable,
  parseQty,
  round2,
  WEIGHABLE_REJECT_MESSAGE,
};
