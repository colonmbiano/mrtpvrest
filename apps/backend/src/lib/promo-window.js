'use strict';

// ───────────────────────────────────────────────────────────────────────────
// promo-window.js — Ventana horaria DIARIA de los precios promocionales de
// platillos (MenuItem.isPromo/promoPrice).
//
// La ventana vive a nivel restaurante (RestaurantConfig.promoStartTime /
// promoEndTime, "HH:mm" en la hora local de config.timezone). Fuera de la
// ventana:
//   - CATÁLOGO: los platillos promo se ocultan (TPV, tienda online, kiosko,
//     bot) — mismo criterio que la agenda por días (activeDays).
//   - DINERO (respaldo): si un pedido llega con un platillo promo (p.ej. menú
//     cacheado offline), se cobra a precio NORMAL (promoPrice se ignora).
//
// Sin ventana configurada (ambos null) → las promos aplican todo el día,
// comportamiento histórico.
// ───────────────────────────────────────────────────────────────────────────

const { withinDailyWindow, localTimeHHmm } = require('./bulk-promo');

/** Campos de RestaurantConfig que necesita `promoWindowOpen`. */
const PROMO_WINDOW_SELECT = { promoStartTime: true, promoEndTime: true, timezone: true };

/**
 * ¿La ventana de promos está abierta ahora? Pura (recibe la config ya leída).
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
 * Variante con I/O: lee la config del restaurante y evalúa la ventana.
 * Sin config (o sin restaurantId) → abierta (no rompe ningún flujo).
 * @param {import('@prisma/client').PrismaClient} prisma  Cliente o `tx`.
 */
async function isPromoWindowOpen(prisma, restaurantId, now = new Date()) {
  if (!restaurantId) return true;
  const config = await prisma.restaurantConfig.findUnique({
    where: { restaurantId },
    select: PROMO_WINDOW_SELECT,
  });
  return promoWindowOpen(config, now);
}

module.exports = { promoWindowOpen, isPromoWindowOpen, PROMO_WINDOW_SELECT };
