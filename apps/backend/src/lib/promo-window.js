'use strict';

// ───────────────────────────────────────────────────────────────────────────
// promo-window.js — Ventana horaria DIARIA de los precios promocionales de
// platillos (MenuItem.isPromo/promoPrice).
//
// Hay DOS niveles de ventana, y el del producto gana:
//   1. GLOBAL (restaurante): RestaurantConfig.promoStartTime/promoEndTime.
//      "HH:mm" en la hora local de config.timezone. Es el corte por defecto de
//      TODAS las promos del restaurante (p.ej. "promos hasta las 21:00").
//   2. POR PRODUCTO (override): MenuItem.promoStartTime/promoEndTime. Si el item
//      define alguno de los dos, su ventana reemplaza a la global (permite, por
//      ejemplo, un combo de fin de semana que corre toda la noche mientras las
//      promos de entre semana siguen cortando a las 21:00). Ambos vacíos → el
//      item hereda la ventana global.
//
// Fuera de la ventana efectiva:
//   - CATÁLOGO: el platillo promo se oculta (TPV, tienda online, kiosko, bot) —
//     mismo criterio que la agenda por días (activeDays).
//   - DINERO (respaldo): si un pedido llega con un platillo promo (p.ej. menú
//     cacheado offline), se cobra a precio NORMAL (promoPrice se ignora).
//
// Sin ninguna ventana configurada (global e item en null) → las promos aplican
// todo el día, comportamiento histórico.
// ───────────────────────────────────────────────────────────────────────────

const { withinDailyWindow, localTimeHHmm } = require('./bulk-promo');

/** Campos de RestaurantConfig que necesita la ventana GLOBAL. */
const PROMO_WINDOW_SELECT = { promoStartTime: true, promoEndTime: true, timezone: true };

/** Campos del MenuItem que definen su override de ventana. */
const ITEM_PROMO_WINDOW_SELECT = { promoStartTime: true, promoEndTime: true };

/**
 * ¿La ventana GLOBAL de promos está abierta ahora? Pura (recibe la config ya
 * leída). Se conserva para flujos que no evalúan por item.
 * @param {{promoStartTime?:string|null, promoEndTime?:string|null, timezone?:string}|null} config
 * @param {Date} [now]
 */
function promoWindowOpen(config, now = new Date()) {
  const start = config?.promoStartTime || null;
  const end = config?.promoEndTime || null;
  if (!start && !end) return true;
  const tz = config?.timezone || 'America/Mexico_City';
  return withinDailyWindow(localTimeHHmm(now, tz), start, end);
}

/**
 * Ventana horaria EFECTIVA de un platillo: su override propio si define alguno
 * de los dos límites; si no, la ventana global del restaurante.
 * @param {{promoStartTime?:string|null, promoEndTime?:string|null}|null} item
 * @param {{promoStartTime?:string|null, promoEndTime?:string|null}|null} config
 * @returns {{start:string|null, end:string|null}}
 */
function effectivePromoWindow(item, config) {
  const itemStart = item?.promoStartTime || null;
  const itemEnd = item?.promoEndTime || null;
  if (itemStart || itemEnd) return { start: itemStart, end: itemEnd };
  return { start: config?.promoStartTime || null, end: config?.promoEndTime || null };
}

/**
 * ¿La promo de ESTE platillo aplica ahora? Pura. Considera el override por
 * producto y, en su defecto, la ventana global del restaurante.
 * @param {{promoStartTime?:string|null, promoEndTime?:string|null}|null} item
 * @param {{promoStartTime?:string|null, promoEndTime?:string|null, timezone?:string}|null} config
 * @param {Date} [now]
 */
function itemPromoWindowOpen(item, config, now = new Date()) {
  const { start, end } = effectivePromoWindow(item, config);
  if (!start && !end) return true;
  const tz = config?.timezone || 'America/Mexico_City';
  return withinDailyWindow(localTimeHHmm(now, tz), start, end);
}

/**
 * Variante con I/O: lee la config del restaurante y evalúa la ventana GLOBAL.
 * Sin config (o sin restaurantId) → abierta (no rompe ningún flujo).
 * @param {import('@prisma/client').PrismaClient} prisma  Cliente o `tx`.
 */
async function isPromoWindowOpen(prisma, restaurantId, now = new Date()) {
  return promoWindowOpen(await loadPromoWindowConfig(prisma, restaurantId), now);
}

/**
 * Lee (una sola vez) la config de ventana global del restaurante para luego
 * evaluar varios items con `itemPromoWindowOpen`. Sin restaurantId → null
 * (ventana global "todo el día"; el override por item sigue aplicando).
 * @param {import('@prisma/client').PrismaClient} prisma  Cliente o `tx`.
 */
async function loadPromoWindowConfig(prisma, restaurantId) {
  if (!restaurantId) return null;
  return prisma.restaurantConfig.findUnique({
    where: { restaurantId },
    select: PROMO_WINDOW_SELECT,
  });
}

/**
 * Normaliza un valor "HH:mm" (00:00–23:59) o devuelve null si viene vacío /
 * inválido. Se usa al guardar el override por producto desde el admin.
 * @param {unknown} v
 * @returns {string|null}
 */
function normalizePromoWindowTime(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = /^([0-1]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? s : null;
}

module.exports = {
  promoWindowOpen,
  isPromoWindowOpen,
  effectivePromoWindow,
  itemPromoWindowOpen,
  loadPromoWindowConfig,
  normalizePromoWindowTime,
  PROMO_WINDOW_SELECT,
  ITEM_PROMO_WINDOW_SELECT,
};
