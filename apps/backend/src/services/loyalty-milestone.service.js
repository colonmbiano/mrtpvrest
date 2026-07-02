'use strict';

// Registro por cliente (directorio Customer por teléfono) + recompensa por HITOS
// de compra. Se llama best-effort DESPUÉS de crear la orden en POST /store/orders
// (nunca bloquea ni pone en riesgo la orden).
//
// GATEADO por env, APAGADO por defecto → cero impacto para los demás tenants:
//   LOYALTY_MILESTONE_RESTAURANT_IDS  lista de restaurantIds (coma) donde aplica
//   LOYALTY_MILESTONE_EVERY           cada cuántas compras (default 10)
//   LOYALTY_MILESTONE_DISCOUNT_PCT    % de descuento del cupón (default 15)
//   LOYALTY_MILESTONE_EXPIRES_DAYS    vigencia del cupón (default 30)

const crypto = require('crypto');
const { prisma } = require('@mrtpvrest/database');
const { normalizePhone } = require('@mrtpvrest/config/phone');

function milestoneRestaurants() {
  return (process.env.LOYALTY_MILESTONE_RESTAURANT_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

function isMilestoneEnabled(restaurantId) {
  return !!restaurantId && milestoneRestaurants().includes(restaurantId);
}

function intEnv(name, def) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

/**
 * Upsert del cliente por teléfono (+1 compra) y, si cae en el múltiplo de N,
 * genera un cupón de recompensa. Devuelve { customerId, ordersCount, reward|null }.
 * El reward (si existe) trae { couponCode, discountType, discountValue, expiresAt, ordersCount }.
 */
async function processCustomerMilestone(restaurantId, { phone, name, total, orderId } = {}) {
  const normPhone = normalizePhone(phone);
  if (!normPhone) return null; // sin teléfono no hay registro por cliente

  const customer = await prisma.customer.upsert({
    where: { restaurantId_phone: { restaurantId, phone: normPhone } },
    create: {
      restaurantId,
      phone: normPhone,
      name: name || null,
      ordersCount: 1,
      totalSpent: Number(total) || 0,
      lastOrderAt: new Date(),
    },
    update: {
      ...(name ? { name } : {}),
      ordersCount: { increment: 1 },
      totalSpent: { increment: Number(total) || 0 },
      lastOrderAt: new Date(),
    },
  });

  // Vincular la orden al cliente (best-effort; no crítico si falla).
  if (orderId) {
    await prisma.order.update({ where: { id: orderId }, data: { customerId: customer.id } }).catch(() => null);
  }

  const every = intEnv('LOYALTY_MILESTONE_EVERY', 10);
  if (customer.ordersCount <= 0 || customer.ordersCount % every !== 0) {
    return { customerId: customer.id, ordersCount: customer.ordersCount, reward: null };
  }

  // Hito alcanzado → cupón de recompensa (código único, 1 uso, vence en N días).
  const pct = Math.min(90, intEnv('LOYALTY_MILESTONE_DISCOUNT_PCT', 15));
  const days = intEnv('LOYALTY_MILESTONE_EXPIRES_DAYS', 30);
  const code = 'VIP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const coupon = await prisma.coupon.create({
    data: {
      restaurantId,
      code,
      description: `Recompensa por ${customer.ordersCount} compras`,
      discountType: 'PERCENTAGE',
      discountValue: pct,
      minOrderAmount: 0,
      maxUses: 1,
      expiresAt,
      isActive: true,
    },
  });

  return {
    customerId: customer.id,
    ordersCount: customer.ordersCount,
    reward: {
      couponCode: coupon.code,
      discountType: 'PERCENTAGE',
      discountValue: pct,
      expiresAt,
      ordersCount: customer.ordersCount,
    },
  };
}

module.exports = { isMilestoneEnabled, processCustomerMilestone };
