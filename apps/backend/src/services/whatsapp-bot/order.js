// order.js — Creación del pedido a partir del carrito de la conversación.
//
// NUNCA confía en los precios guardados en la sesión: revalida cada línea
// contra la BD (precio, disponibilidad, variante) antes de cobrar, igual que
// hace la tienda web. El envío se calcula con la misma fuente de verdad
// (lib/delivery-fee) para que WhatsApp y la web cobren idéntico.

const { computeDeliveryFee } = require('../../lib/delivery-fee');
const { resolveProviderForRestaurant } = require('../../lib/payment-providers');
const { nextOrderNumber } = require('../../lib/order-number');
const { effectivePrice } = require('./catalog');
const { itemPromoActive } = require('../../lib/promo-window');
const { upsertContact } = require('./contacts');
const { createStoreDeliveryPin } = require('../../lib/store-delivery-pin');

// Código de entrega del pedido propio a domicilio (STORE_DELIVERY_PIN_MODE).
const storeDeliveryPin = createStoreDeliveryPin();

class BotOrderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Cotización sin efectos secundarios. Se obtiene antes del resumen y se vuelve
// a calcular justo antes de crear el pedido, incluidas las ventanas de promos.
async function quoteBotOrder({ prisma, restaurant, config, data }) {
  const cart = Array.isArray(data.cart) ? data.cart : [];
  if (cart.length === 0) throw new BotOrderError('CART_EMPTY', 'El carrito está vacío.');

  const orderType = data.orderType === 'TAKEOUT' ? 'TAKEOUT' : 'DELIVERY';

  // Revalidación de cada línea contra la BD (precio + disponibilidad).
  const itemsData = [];
  const quotedCart = [];
  for (const line of cart) {
    const menuItem = await prisma.menuItem.findFirst({
      where: { id: line.menuItemId, restaurantId: restaurant.id, isAvailable: true },
      include: { variants: { where: { isAvailable: true } } },
    });
    if (!menuItem || (menuItem.isPromo && !itemPromoActive(menuItem, config))) {
      throw new BotOrderError('ITEM_UNAVAILABLE', `El producto ${line.name || 'seleccionado'} ya no está disponible. Revisa tu carrito antes de continuar.`);
    }

    let unitPrice = effectivePrice(menuItem);
    let displayName = menuItem.name;
    if (!line.variantId && menuItem.variants.length > 0) {
      throw new BotOrderError('ITEM_UNAVAILABLE', `Elige una variante disponible de ${menuItem.name} desde el menú.`);
    }
    if (line.variantId) {
      const variant = menuItem.variants.find((v) => v.id === line.variantId);
      if (!variant) throw new BotOrderError('ITEM_UNAVAILABLE', `La variante ${line.name || 'seleccionada'} ya no está disponible. Revisa tu carrito antes de continuar.`);
      unitPrice = variant.price;
      displayName = `${menuItem.name} (${variant.name})`;
    }

    const quantity = Number(line.quantity);
    unitPrice = Number(unitPrice);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new BotOrderError('INVALID_CART', 'Hay una cantidad o precio inválido. Revisa tu carrito antes de continuar.');
    }
    unitPrice = Math.round(unitPrice * 100) / 100;
    quotedCart.push({ menuItemId: menuItem.id, variantId: line.variantId || null, name: displayName, unitPrice, quantity });
    itemsData.push({
      menuItemId: menuItem.id,
      name: displayName,
      price: unitPrice,
      quantity,
      subtotal: Math.round(unitPrice * quantity * 100) / 100,
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

  return { cart: quotedCart, itemsData, orderType, subtotal, deliveryFee, deliveryDistanceKm, total };
}

// Comparar solo los campos que determinan lo que el cliente acepta. Los precios
// salen de la BD en ambos pasos, nunca de la salida del modelo o del cliente.
function quoteSignature(quote) {
  if (!quote || !Array.isArray(quote.cart)) return null;
  return JSON.stringify({
    cart: quote.cart.map(({ menuItemId, variantId, name, unitPrice, quantity }) =>
      ({ menuItemId, variantId: variantId || null, name, unitPrice, quantity })),
    orderType: quote.orderType,
    subtotal: quote.subtotal,
    deliveryFee: quote.deliveryFee,
    total: quote.total,
  });
}

async function createBotOrder({ prisma, io, restaurant, config, data }) {
  const quote = await quoteBotOrder({ prisma, restaurant, config, data });
  if (quoteSignature(data.confirmedQuote) !== quoteSignature(quote)) {
    const err = new BotOrderError('QUOTE_CHANGED', 'Actualizamos el resumen de tu pedido. Revisa productos, cantidades y total y confirma de nuevo.');
    err.quote = quote;
    throw err;
  }
  const { itemsData, orderType, subtotal, deliveryFee, deliveryDistanceKm, total } = quote;

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
  // Folio secuencial continuo por restaurante (misma serie que TPV/web/kiosko).
  const orderNumber = await nextOrderNumber(prisma, restaurant.id);

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

  // CRM: registrar/actualizar el contacto del cliente (best-effort).
  await upsertContact(prisma, restaurant.id, {
    phone: data.phone,
    name: order.customerName,
    orderTotal: order.total,
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

  return { order, estimatedMinutes, deliveryPin: storeDeliveryPin.pinForCustomer(order) };
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

module.exports = { createBotOrder, quoteBotOrder, createCheckoutLink, hasOnlinePayment, BotOrderError };
