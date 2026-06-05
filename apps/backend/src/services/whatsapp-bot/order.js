// order.js — Creación del pedido a partir del carrito de la conversación.
//
// NUNCA confía en los precios guardados en la sesión: revalida cada línea
// contra la BD (precio, disponibilidad, variante) antes de cobrar, igual que
// hace la tienda web. El envío se calcula con la misma fuente de verdad
// (lib/delivery-fee) para que WhatsApp y la web cobren idéntico.

const { computeDeliveryFee } = require('../../lib/delivery-fee');
const { resolveProviderForRestaurant } = require('../../lib/payment-providers');
const { effectivePrice } = require('./catalog');

class BotOrderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Crea el pedido en la BD y notifica a cocina/admin por Socket.io.
 * @param {object} args
 * @param {import('@prisma/client').PrismaClient} args.prisma
 * @param {object} args.io - instancia Socket.io (puede ser null)
 * @param {object} args.restaurant - { id }
 * @param {object} args.config - RestaurantConfig
 * @param {object} args.data - contexto de la sesión (cart, orderType, ...)
 * @returns {Promise<{ order, estimatedMinutes }>}
 */
async function createBotOrder({ prisma, io, restaurant, config, data }) {
  const cart = Array.isArray(data.cart) ? data.cart : [];
  if (cart.length === 0) throw new BotOrderError('CART_EMPTY', 'El carrito está vacío.');

  const orderType = data.orderType === 'TAKEOUT' ? 'TAKEOUT' : 'DELIVERY';

  // Revalidación de cada línea contra la BD (precio + disponibilidad).
  const itemsData = [];
  for (const line of cart) {
    const menuItem = await prisma.menuItem.findFirst({
      where: { id: line.menuItemId, restaurantId: restaurant.id, isAvailable: true },
      include: { variants: { where: { isAvailable: true } } },
    });
    if (!menuItem) continue; // producto retirado del menú → se omite

    let unitPrice = effectivePrice(menuItem);
    let displayName = menuItem.name;
    if (line.variantId) {
      const variant = menuItem.variants.find((v) => v.id === line.variantId);
      if (!variant) continue; // variante retirada → se omite
      unitPrice = variant.price;
      displayName = `${menuItem.name} (${variant.name})`;
    }

    const quantity = Math.max(1, Math.min(50, parseInt(line.quantity, 10) || 1));
    itemsData.push({
      menuItemId: menuItem.id,
      name: displayName,
      price: unitPrice,
      quantity,
      subtotal: unitPrice * quantity,
    });
  }

  if (itemsData.length === 0) {
    throw new BotOrderError('NO_VALID_ITEMS', 'Ninguno de los productos sigue disponible.');
  }

  const subtotal = Math.round(itemsData.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;

  // Mínimo de compra.
  if (config?.minOrderAmount > 0 && subtotal < config.minOrderAmount) {
    throw new BotOrderError('MIN_ORDER', `El pedido mínimo es de $${config.minOrderAmount}.`);
  }

  // Envío (solo DELIVERY).
  let deliveryFee = 0;
  let deliveryDistanceKm = null;
  if (orderType === 'DELIVERY') {
    const dest = (data.deliveryLat != null && data.deliveryLng != null)
      ? { lat: data.deliveryLat, lng: data.deliveryLng }
      : null;
    const calc = computeDeliveryFee(config, subtotal, dest);
    if (calc.error === 'OUT_OF_RANGE') {
      throw new BotOrderError('OUT_OF_RANGE', 'Ubicación fuera del área de cobertura.');
    }
    deliveryFee = calc.fee;
    deliveryDistanceKm = calc.distanceKm;
  }

  const total = Math.round((subtotal + deliveryFee) * 100) / 100;

  // Mapeo del método de pago elegido al enum del modelo.
  const paymentMethod =
    data.paymentMethod === 'ONLINE'
      ? 'CARD'
      : data.paymentMethod === 'TRANSFER'
        ? 'TRANSFER'
        : orderType === 'DELIVERY'
          ? 'CASH_ON_DELIVERY'
          : 'CASH';

  const estimatedMinutes = Number(config?.estimatedDelivery) || 30;
  const orderNumber = 'WA-' + Date.now().toString().slice(-6);

  const order = await prisma.order.create({
    data: {
      restaurantId: restaurant.id,
      locationId: data.locationId || null,
      orderNumber,
      status: 'PENDING',
      orderType,
      paymentMethod,
      paymentStatus: 'PENDING',
      subtotal,
      deliveryFee,
      total,
      source: 'WHATSAPP',
      customerName: (data.customerName || 'Cliente WhatsApp').trim(),
      customerPhone: data.phone || null,
      deliveryAddress: orderType === 'DELIVERY' ? (data.deliveryAddress || null) : null,
      deliveryLat: orderType === 'DELIVERY' ? data.deliveryLat ?? null : null,
      deliveryLng: orderType === 'DELIVERY' ? data.deliveryLng ?? null : null,
      deliveryDistanceKm: orderType === 'DELIVERY' ? deliveryDistanceKm : null,
      estimatedMinutes,
      items: { create: itemsData },
    },
    include: { items: { include: { menuItem: { select: { name: true } } } } },
  });

  // Notificación en tiempo real a TPV / KDS / admin (mismo patrón que la tienda).
  if (io) {
    io.to(`restaurant:${restaurant.id}`).emit('order:new', order);
    io.to(`restaurant:${restaurant.id}:kitchen`).emit('order:new', order);
    if (order.locationId) {
      io.to(`restaurant:${restaurant.id}:location:${order.locationId}:admins`).emit('order:new', order);
      io.to(`restaurant:${restaurant.id}:location:${order.locationId}:kitchen`).emit('order:new', order);
    }
  }

  return { order, estimatedMinutes };
}

/**
 * ¿El restaurante tiene alguna pasarela de pago en línea habilitada?
 * Determina si el chatbot ofrece la opción "Pago en línea (tarjeta)".
 */
async function hasOnlinePayment(prisma, restaurantId) {
  const found = await prisma.integrationConfig.findFirst({
    where: { restaurantId, enabled: true, type: { in: ['MERCADOPAGO', 'STRIPE'] } },
    select: { id: true },
  });
  return !!found;
}

/**
 * Genera un link de checkout para un pedido ya creado y guarda la referencia.
 * El pago se confirma de forma asíncrona vía el webhook público existente
 * (/api/store/webhook/<provider>), que pone el pedido en PAID/CONFIRMED.
 * @returns {Promise<string|null>} checkoutUrl o null si no hay pasarela.
 */
async function createCheckoutLink({ prisma, restaurant, order }) {
  const resolved = await resolveProviderForRestaurant(restaurant.id);
  if (!resolved) return null;

  const items = (order.items || []).map((oi) => ({
    id: oi.menuItemId,
    title: oi.name,
    quantity: oi.quantity,
    unitPrice: oi.price,
  }));
  if ((order.deliveryFee || 0) > 0) {
    items.push({ id: 'envio', title: 'Envío', quantity: 1, unitPrice: order.deliveryFee });
  }

  const backUrl = restaurant.slug
    ? `https://${restaurant.slug}.mrtpvrest.com/`
    : (process.env.FRONTEND_URL || '');
  const notificationUrl = `${process.env.BACKEND_URL || 'https://api.mrtpvrest.com'}/api/store/webhook/${resolved.key.toLowerCase()}`;

  const result = await resolved.provider.createCheckout({
    order,
    items,
    backUrl,
    notificationUrl,
    currency: 'MXN',
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { paymentProvider: resolved.key, paymentProviderRef: result.providerRef },
  });

  return result.checkoutUrl || null;
}

module.exports = { createBotOrder, createCheckoutLink, hasOnlinePayment, BotOrderError };
