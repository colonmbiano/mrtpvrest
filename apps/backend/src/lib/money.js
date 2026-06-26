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

/** Redondeo contable a 2 decimales (evita el clásico 0.1+0.2 de floats). */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Totales de una orden a partir de sus líneas YA RESUELTAS EN SERVIDOR.
 *
 * FUENTE DE VERDAD DEL COBRO: nunca se confía en el subtotal/total del cliente.
 * Cada `item.subtotal` ya incluye el delta de los modificadores con precio
 * (`priceAdd`), porque se calculó como `lineSubtotal(basePrice + ΣpriceAdd, qty)`.
 * Antes el create-order persistía el total del payload del TPV; si el cliente lo
 * calculaba mal (p.ej. omitía un modificador) la orden se cobraba de menos. Este
 * helper se usa tanto al crear la orden como al agregar rondas para que ambas
 * rutas no puedan desincronizarse jamás.
 *
 *   subtotal      = Σ(item.subtotal)
 *   promoDiscount = clamp(promoDiscount, 0, subtotal)            (promo NxM, automática)
 *   discount      = clamp(discount, 0, subtotal − promoDiscount) (descuento manual del cajero)
 *   total         = max(0, subtotal − discount − promoDiscount + deliveryFee)
 *
 * La promo se acota PRIMERO y el descuento manual sobre el remanente, así nunca
 * se descuenta más que el subtotal aunque ambos coincidan en una orden chica.
 *
 * @param {{subtotal:number}[]} items  Líneas resueltas (cada una con su subtotal).
 * @param {object} [opts]
 * @param {number} [opts.discount=0]       Descuento manual (se acota a [0, subtotal − promo]).
 * @param {number} [opts.deliveryFee=0]    Cargo de envío.
 * @param {number} [opts.promoDiscount=0]  Descuento automático por promos NxM (ver lib/bulk-promo.js).
 * @returns {{subtotal:number, discount:number, promoDiscount:number, total:number}}
 */
function computeOrderTotals(items, { discount = 0, deliveryFee = 0, promoDiscount = 0 } = {}) {
  const subtotal = round2((items || []).reduce((sum, item) => sum + Number(item?.subtotal || 0), 0));
  const safePromo = round2(Math.min(Math.max(0, Number(promoDiscount) || 0), subtotal));
  const safeDiscount = round2(Math.min(Math.max(0, Number(discount) || 0), subtotal - safePromo));
  const total = round2(Math.max(0, subtotal - safeDiscount - safePromo + (Number(deliveryFee) || 0)));
  return { subtotal, discount: safeDiscount, promoDiscount: safePromo, total };
}

/**
 * Cobro "a cuenta de empleado": aplica el descuento de empleado sobre el subtotal
 * (después de la promo automática) y devuelve el descuento y el total a cargar a
 * su cuenta. Server-side y puro — el TPV nunca decide el monto. El % se acota a
 * [0, 100] y el total nunca queda por debajo de 0.
 *
 *   base     = max(0, subtotal − promoDiscount)
 *   discount = round2(base × pct/100)
 *   total    = max(0, subtotal − promoDiscount − discount + deliveryFee)
 *
 * @param {object} p
 * @param {number} [p.subtotal=0]
 * @param {number} [p.promoDiscount=0]
 * @param {number} [p.deliveryFee=0]
 * @param {number} [p.discountPct=0]   Descuento de empleado en % (0-100).
 * @returns {{discount:number, total:number}}
 */
function computeEmployeeDiscount({ subtotal = 0, promoDiscount = 0, deliveryFee = 0, discountPct = 0 } = {}) {
  const sub = round2(Number(subtotal) || 0);
  const promo = round2(Math.min(Math.max(0, Number(promoDiscount) || 0), sub));
  const pct = Math.min(Math.max(0, Number(discountPct) || 0), 100);
  const base = Math.max(0, sub - promo);
  const discount = round2(base * (pct / 100));
  const total = round2(Math.max(0, sub - promo - discount + (Number(deliveryFee) || 0)));
  return { discount, total };
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
 *   expectedCash = openingFloat + totalCash + totalCashIn − totalExpenses
 *   variance     = countedCash − expectedCash   (negativo = faltante)
 *
 * @param {object} p
 * @param {number} p.openingFloat   Fondo de apertura.
 * @param {number} p.totalCash      Ventas en efectivo del turno.
 * @param {number} p.totalExpenses  Gastos pagados de la caja.
 * @param {number} [p.totalCashIn]  Ingresos de efectivo a caja (cambio/feria).
 * @param {number} [p.countedCash]  Efectivo contado al cierre (closingFloat).
 * @returns {{expectedCash:number, variance:number|null}}
 */
function cashCutSummary({ openingFloat = 0, totalCash = 0, totalExpenses = 0, totalCashIn = 0, countedCash } = {}) {
  const expectedCash = Number(openingFloat) + Number(totalCash) + Number(totalCashIn) - Number(totalExpenses);
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
  round2,
  computeOrderTotals,
  computeEmployeeDiscount,
  summarizePayments,
  cashCutSummary,
  PAYMENT_METHOD_MAP,
};
