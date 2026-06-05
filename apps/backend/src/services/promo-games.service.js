// promo-games.service.js — Juegos promocionales ("ruleta de premios").
//
// El cliente juega desde el chatbot; si gana, se emite un Coupon real (mismo
// sistema de cupones que la tienda/TPV) con su código. Soporta límite de
// jugadas por número y premios con peso (probabilidad).

const { prisma } = require('@mrtpvrest/database');

/**
 * Selección de premio por peso. PURA (rng inyectable) para test determinista.
 * @param {Array<{label,type,value,weight}>} prizes
 * @returns {object|null} el premio elegido, o null si no hay premios válidos.
 */
function pickPrize(prizes, rng = Math.random) {
  const list = (Array.isArray(prizes) ? prizes : []).filter((p) => p && p.label);
  if (list.length === 0) return null;
  const weights = list.map((p) => Math.max(0, Number(p.weight) || 0));
  const total = weights.reduce((s, w) => s + w, 0);
  // Si nadie definió peso, equiprobable.
  if (total <= 0) return list[Math.floor(rng() * list.length)] || list[0];
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r < 0) return list[i];
  }
  return list[list.length - 1];
}

function isWinningPrize(prize) {
  return !!prize && prize.type !== 'NONE' && Number(prize.value) > 0;
}

function generateCouponCode() {
  return 'PRZ-' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function createPrizeCoupon(restaurantId, prize) {
  const expiresInDays = Number(prize.expiresInDays) > 0 ? Number(prize.expiresInDays) : 7;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  // Reintenta ante colisión del código (Coupon.code es único global).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCouponCode();
    try {
      const coupon = await prisma.coupon.create({
        data: {
          restaurantId,
          code,
          description: prize.label,
          discountType: prize.type === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
          discountValue: Number(prize.value),
          minOrderAmount: Number(prize.minOrderAmount) || 0,
          maxUses: 1,
          expiresAt,
          isActive: true,
        },
      });
      return coupon;
    } catch (e) {
      if (attempt === 4) throw e; // agotados los reintentos
    }
  }
  return null;
}

/**
 * Juega el juego activo del restaurante para un número de teléfono.
 * @returns {Promise<{ played:boolean, won?:boolean, prizeLabel?:string,
 *   couponCode?:string, expiresAt?:Date, reason?:string }>}
 */
async function playGame({ restaurantId, phone, trigger = 'ON_COMMAND', gameId = null }) {
  if (!restaurantId || !phone) return { played: false, reason: 'BAD_REQUEST' };

  const game = gameId
    ? await prisma.promoGame.findFirst({ where: { id: gameId, restaurantId, enabled: true } })
    : await prisma.promoGame.findFirst({ where: { restaurantId, enabled: true, trigger } });
  if (!game) return { played: false, reason: 'NO_GAME' };

  // Límite de jugadas por contacto.
  if (game.maxPerContact > 0) {
    const plays = await prisma.promoGamePlay.count({ where: { gameId: game.id, phone } });
    if (plays >= game.maxPerContact) return { played: false, reason: 'MAX_REACHED' };
  }

  let prizes = [];
  try { prizes = JSON.parse(game.prizes || '[]'); } catch { prizes = []; }
  const prize = pickPrize(prizes);
  if (!prize) return { played: false, reason: 'NO_PRIZES' };

  const won = isWinningPrize(prize);
  let coupon = null;
  if (won) {
    try {
      coupon = await createPrizeCoupon(restaurantId, prize);
    } catch (e) {
      console.error('[promo-games] createPrizeCoupon:', e.message);
    }
  }

  await prisma.promoGamePlay.create({
    data: {
      gameId: game.id,
      restaurantId,
      phone,
      prizeLabel: prize.label,
      couponId: coupon?.id || null,
    },
  }).catch((e) => console.error('[promo-games] record play:', e.message));

  return {
    played: true,
    won: won && !!coupon,
    prizeLabel: prize.label,
    couponCode: coupon?.code || null,
    expiresAt: coupon?.expiresAt || null,
  };
}

module.exports = { pickPrize, isWinningPrize, playGame, generateCouponCode };
