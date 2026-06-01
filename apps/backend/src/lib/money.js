'use strict';

// ───────────────────────────────────────────────────────────────────────────
// money.js — Lógica de dinero PURA y testeable (sin Prisma, sin I/O).
//
// Concentra los cálculos críticos donde un bug cuesta dinero real:
//   - Precio de variantes de producto.
//   - Modificadores con "N primeros gratis" (freeModifiersLimit).
//   - Subtotales de línea.
//   - Resumen de pagos por método y corte de caja (efectivo esperado / varianza).
//
// Antes esta lógica vivía duplicada e inline en orders.routes / shifts.routes,
// imposible de testear sin una BD. Extraerla aquí permite cubrirla con tests
// unitarios deterministas (apps/backend/__tests__/money.test.js) y elimina la
// duplicación entre "crear orden" y "agregar ronda".
//
// REGLA DE ORO: el precio SIEMPRE se re-lee del servidor (menuItem de DB),
// nunca del payload del cliente — previene manipulación de precios.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resuelve precio y nombre de un item según sus variantes seleccionadas.
 * Las variantes con precio >= precio base reemplazan el precio (se toma el
 * mayor); las de precio menor (>0) se suman como extra.
 *
 * @param {object} menuItem  Producto leído de DB (con .price/.promoPrice/.variants).
 * @param {object} item      Selección del cliente ({ variantId | variantIds }).
 * @returns {{ variants: object[], basePrice: number, name: string }}
 */
function resolveVariantSelection(menuItem, item) {
  const ids = Array.isArray(item.variantIds)
    ? item.variantIds.filter(Boolean)
    : item.variantId
      ? [item.variantId]
      : [];
  const variants = ids.map((variantId) => {
    const variant = (menuItem?.variants || []).find(
      (v) => v.id === variantId && v.isAvailable !== false,
    );
    if (!variant) throw new Error(`Variante ${variantId} no disponible para este producto`);
    return variant;
  });

  const defaultPrice = Number(menuItem?.promoPrice || menuItem?.price || 0);
  const fullPrice = variants
    .map((variant) => Number(variant.price || 0))
    .filter((price) => price >= defaultPrice);
  const extras = variants
    .map((variant) => Number(variant.price || 0))
    .filter((price) => price > 0 && price < defaultPrice)
    .reduce((sum, price) => sum + price, 0);

  const basePrice = Math.max(defaultPrice, ...fullPrice) + extras;
  const baseName = menuItem?.name || 'Producto';
  const name = variants.length > 0
    ? `${baseName} (${variants.map((variant) => variant.name).join(', ')})`
    : baseName;

  return { variants, basePrice, name };
}

/**
 * Aplica `freeModifiersLimit` por grupo: dentro de cada grupo, los modificadores
 * más baratos van gratis primero (los primeros `free` no se cobran).
 *
 * @param {Map<string, object[]>} selectedByGroup  groupId → modificadores elegidos.
 * @param {Map<string, object>}   groupsById       groupId → grupo (con freeModifiersLimit).
 * @returns {{ unitExtra: number, flatMods: {modifierId,name,priceAdd}[] }}
 */
function applyFreeModifiers(selectedByGroup, groupsById) {
  let unitExtra = 0;
  const flatMods = [];
  for (const [groupId, mods] of selectedByGroup.entries()) {
    const free = groupsById.get(groupId)?.freeModifiersLimit || 0;
    const sorted = [...mods].sort((a, b) => a.priceAdd - b.priceAdd);
    sorted.forEach((m, idx) => {
      const charge = idx >= free ? m.priceAdd : 0;
      unitExtra += charge;
      flatMods.push({ modifierId: m.id, name: m.name, priceAdd: charge });
    });
  }
  return { unitExtra, flatMods };
}

/** Subtotal de una línea = precio unitario × cantidad. */
function lineSubtotal(unitPrice, quantity) {
  return Number(unitPrice) * Number(quantity);
}

// Mapa por defecto de método de pago → bucket del corte de caja.
const PAYMENT_METHOD_MAP = {
  CASH: 'totalCash',
  CASH_ON_DELIVERY: 'totalCash',
  CARD_PRESENT: 'totalCard',
  CARD: 'totalCard',
  TRANSFER: 'totalTransfer',
  SPEI: 'totalTransfer',
  OXXO: 'totalTransfer',
  COURTESY: 'totalCourtesy',
};

/**
 * Agrupa los totales de órdenes por método de pago.
 * @param {{paymentMethod:string,total:number|string}[]} orders
 * @param {object} [pmMap] Mapa método→bucket (default PAYMENT_METHOD_MAP).
 * @returns {{totalCash:number,totalCard:number,totalTransfer:number,totalCourtesy:number}}
 */
function summarizePayments(orders, pmMap = PAYMENT_METHOD_MAP) {
  const totals = { totalCash: 0, totalCard: 0, totalTransfer: 0, totalCourtesy: 0 };
  for (const order of orders || []) {
    const key = pmMap[order.paymentMethod];
    if (key) totals[key] += Number(order.total);
  }
  return totals;
}

/**
 * Corte de caja: efectivo esperado y varianza.
 *   expectedCash = openingFloat + totalCash − totalExpenses
 *   variance     = countedCash − expectedCash   (negativo = faltante)
 *
 * @param {object} p
 * @param {number} p.openingFloat   Fondo de apertura.
 * @param {number} p.totalCash      Ventas en efectivo del turno.
 * @param {number} p.totalExpenses  Gastos pagados de la caja.
 * @param {number} [p.countedCash]  Efectivo contado al cierre (closingFloat).
 * @returns {{expectedCash:number, variance:number|null}}
 */
function cashCutSummary({ openingFloat = 0, totalCash = 0, totalExpenses = 0, countedCash } = {}) {
  const expectedCash = Number(openingFloat) + Number(totalCash) - Number(totalExpenses);
  const variance =
    countedCash === undefined || countedCash === null
      ? null
      : Number(countedCash) - expectedCash;
  return { expectedCash, variance };
}

module.exports = {
  resolveVariantSelection,
  applyFreeModifiers,
  lineSubtotal,
  summarizePayments,
  cashCutSummary,
  PAYMENT_METHOD_MAP,
};
