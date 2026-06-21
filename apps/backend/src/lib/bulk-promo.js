'use strict';

// ───────────────────────────────────────────────────────────────────────────
// bulk-promo.js — Promociones por cantidad (NxM, p.ej. "3x2 en alitas").
//
// Lógica de dinero PURA y testeable (sin Prisma, sin I/O): recibe las líneas
// YA RESUELTAS EN SERVIDOR (precio real leído de DB) + las promos activas, y
// devuelve cuánto descontar. El cargador con Prisma vive en loadActiveBulkPromos.
//
// REGLA DEL NxM:
//   - "compra N, paga M" → por cada bloque de N unidades elegibles, (N−M) salen
//     gratis. 3x2: cada 3 unidades → 1 gratis.
//   - POOL COMBINADO: una promo agrupa varias categorías; sus unidades suman
//     JUNTAS para formar los bloques (2 alitas + 1 boneless = 1 bloque de 3).
//   - QUÉ SALE GRATIS: siempre la unidad MÁS BARATA de cada bloque. Operamos
//     sobre la lista de precios unitarios expandida (cantidad → repetición),
//     ordenada ascendente, y regalamos las `freeUnits` más baratas. Estándar de
//     industria: el cliente nunca se lleva gratis la pieza cara → protege margen.
//
// ANTI DOBLE-CONTEO: cada unidad se asigna a UNA sola promo (la primera, por
// orden determinista, cuya categoría la incluya). Sin esto, dos promos que
// compartan una categoría descontarían la misma unidad dos veces.
// ───────────────────────────────────────────────────────────────────────────

/** Redondeo contable a 2 decimales (mismo criterio que lib/money.js). */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula el descuento total por promos NxM sobre líneas resueltas.
 *
 * @param {{price:number, quantity:number, categoryId?:string}[]} items
 *        Líneas resueltas. `price` es el unitario YA con modificadores/variantes.
 * @param {{id:string, name:string, buyQuantity:number, payQuantity:number,
 *          categoryIds:(Set<string>|string[])}[]} promos
 *        Promos activas y vigentes (las filtra el cargador). El orden importa:
 *        determina a qué promo se asigna una unidad cuando varias la cubren.
 * @returns {{promoDiscount:number, applied:{promoId:string,name:string,freeUnits:number,amount:number}[]}}
 */
function computeBulkPromoDiscount(items, promos) {
  const safeItems = Array.isArray(items) ? items : [];
  const safePromos = Array.isArray(promos) ? promos : [];
  if (safeItems.length === 0 || safePromos.length === 0) {
    return { promoDiscount: 0, applied: [] };
  }

  // Normalizar las promos y construir el índice categoría → promo (la PRIMERA
  // promo de la lista que cubra esa categoría se queda con sus unidades).
  const norm = safePromos
    .map((p) => ({
      id: p.id,
      name: p.name,
      buy: Math.max(1, Math.floor(Number(p.buyQuantity) || 0)),
      pay: Math.max(0, Math.floor(Number(p.payQuantity) || 0)),
      cats: p.categoryIds instanceof Set ? p.categoryIds : new Set(p.categoryIds || []),
    }))
    // Solo promos con sentido: pagas menos de lo que compras (si no, no descuenta).
    .filter((p) => p.pay < p.buy && p.cats.size > 0);
  if (norm.length === 0) return { promoDiscount: 0, applied: [] };

  const categoryToPromo = new Map(); // categoryId → promo normalizada
  for (const promo of norm) {
    for (const catId of promo.cats) {
      if (!categoryToPromo.has(catId)) categoryToPromo.set(catId, promo);
    }
  }

  // Repartir las unidades (expandidas por cantidad) en su promo correspondiente.
  const unitsByPromo = new Map(); // promoId → number[] (precios unitarios)
  for (const item of safeItems) {
    const promo = item.categoryId ? categoryToPromo.get(item.categoryId) : null;
    if (!promo) continue;
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    const price = Number(item.price) || 0;
    if (qty <= 0 || price <= 0) continue;
    const bucket = unitsByPromo.get(promo.id) || [];
    for (let i = 0; i < qty; i++) bucket.push(price);
    unitsByPromo.set(promo.id, bucket);
  }

  let promoDiscount = 0;
  const applied = [];
  for (const promo of norm) {
    const units = unitsByPromo.get(promo.id);
    if (!units || units.length === 0) continue;
    const blocks = Math.floor(units.length / promo.buy);
    const freeUnits = blocks * (promo.buy - promo.pay);
    if (freeUnits <= 0) continue;
    // Las `freeUnits` MÁS BARATAS salen gratis.
    units.sort((a, b) => a - b);
    let amount = 0;
    for (let i = 0; i < freeUnits && i < units.length; i++) amount += units[i];
    amount = round2(amount);
    if (amount <= 0) continue;
    promoDiscount += amount;
    applied.push({ promoId: promo.id, name: promo.name, freeUnits, amount });
  }

  return { promoDiscount: round2(promoDiscount), applied };
}

/**
 * Carga las promos NxM activas y vigentes de un restaurante, listas para
 * `computeBulkPromoDiscount`. Determinista (orden por createdAt) para que el
 * reparto anti doble-conteo sea estable entre crear-orden y agregar-ronda.
 *
 * @param {import('@prisma/client').PrismaClient} prisma  Cliente o `tx`.
 * @param {string} restaurantId
 * @param {Date}   [now]  Momento de evaluación (default: ahora).
 * @returns {Promise<{id,name,buyQuantity,payQuantity,categoryIds:Set<string>}[]>}
 */
async function loadActiveBulkPromos(prisma, restaurantId, now = new Date()) {
  if (!restaurantId) return [];
  const rows = await prisma.bulkPromo.findMany({
    where: {
      restaurantId,
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: 'asc' },
    include: { categories: { select: { categoryId: true } } },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    buyQuantity: p.buyQuantity,
    payQuantity: p.payQuantity,
    categoryIds: new Set((p.categories || []).map((c) => c.categoryId)),
  }));
}

module.exports = {
  computeBulkPromoDiscount,
  loadActiveBulkPromos,
  round2,
};
