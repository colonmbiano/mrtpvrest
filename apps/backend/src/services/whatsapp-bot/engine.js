// engine.js — Máquina de estados de la conversación del chatbot.
//
// Función principal: handleInbound({ restaurant, config, locations, session,
// message, deps }) → { replies: string[], state, data }.
//
// Es PURA respecto a la BD: toda lectura/escritura se hace a través de `deps`
// (deps.loadMenu, deps.createOrder), inyectadas por index.js en producción y
// por fakes en los tests. Eso la hace determinista y fácil de probar.

const m = require('./messages');
const { pickByNumber, parseQuantity } = require('./catalog');
const { computeDeliveryFee } = require('../../lib/delivery-fee');

const STATES = {
  GREETING: 'GREETING',
  ORDER_TYPE: 'ORDER_TYPE',
  LOCATION: 'LOCATION',
  CATEGORY: 'CATEGORY',
  ITEM: 'ITEM',
  QUANTITY: 'QUANTITY',
  CART: 'CART',
  NAME: 'NAME',
  ADDRESS: 'ADDRESS',
  LOCATION_PIN: 'LOCATION_PIN',
  PAYMENT: 'PAYMENT',
  CONFIRM: 'CONFIRM',
};

// Normaliza texto para comparar comandos: minúsculas, sin acentos, sin espacios extremos.
function norm(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos/diacríticos
    .trim();
}

function freshData(phone, lastOrderId = null) {
  return {
    phone,
    orderType: null,
    locationId: null,
    cart: [],
    customerName: null,
    deliveryAddress: null,
    deliveryLat: null,
    deliveryLng: null,
    paymentMethod: null,
    nav: { categoryId: null },
    pending: null,
    lastOrderId,
  };
}

function cartSubtotal(cart) {
  return (cart || []).reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}

// Sucursales que pueden atender el tipo de pedido elegido (con fallback a todas).
function capableLocations(locations, orderType) {
  const all = locations || [];
  const flag = orderType === 'DELIVERY' ? 'hasDelivery' : 'hasTakeaway';
  const capable = all.filter((l) => l[flag] !== false);
  return capable.length > 0 ? capable : all;
}

async function handleInbound({ restaurant, config, locations = [], session, message, deps, onlinePayment = false }) {
  const data = { ...freshData(session?.data?.phone || message?.from), ...(session?.data || {}) };
  if (!data.nav) data.nav = { categoryId: null };
  let state = session?.state || STATES.GREETING;
  const text = message?.type === 'text' ? message.text : '';
  const command = norm(text);

  const result = (replies, nextState = state, nextData = data) => ({
    replies: Array.isArray(replies) ? replies : [replies],
    state: nextState,
    data: nextData,
  });

  // ── Comandos globales (texto) ─────────────────────────────────────────────
  if (message?.type === 'text') {
    if (['cancelar', 'salir', 'reiniciar'].includes(command)) {
      return result(m.cancelled, STATES.GREETING, freshData(data.phone, data.lastOrderId));
    }
    if (['ayuda', 'help', 'comandos', '?'].includes(command)) {
      return result(m.HELP);
    }
    if (['menu', 'carta'].includes(command)) {
      if (!data.orderType) return result(m.welcome(restaurant.name), STATES.ORDER_TYPE);
      return showCategories(deps, data, result, m);
    }
    if (command === 'carrito') {
      if (!data.cart || data.cart.length === 0) return result(m.cartEmpty, state);
      return result(`${m.cartSummary(data.cart)}\n\nEscribe *finalizar*, *menú* para agregar más, o *cancelar*.`, STATES.CART);
    }
  }

  // Mensajes no-texto solo se esperan en LOCATION_PIN. En otros estados, reprompt.
  if (message?.type === 'other') {
    return repromptCurrent(state, data, locations, config, deps, result, m);
  }

  switch (state) {
    case STATES.GREETING:
      return result(m.welcome(restaurant.name), STATES.ORDER_TYPE);

    case STATES.ORDER_TYPE: {
      let orderType = null;
      if (command === '1' || /domicili|entrega|delivery|envio|env[ií]o/.test(command)) orderType = 'DELIVERY';
      else if (command === '2' || /recoger|pickup|sucursal|llevar|paso/.test(command)) orderType = 'TAKEOUT';
      if (!orderType) return result(m.askOrderTypeAgain, STATES.ORDER_TYPE);

      data.orderType = orderType;
      const capable = capableLocations(locations, orderType);
      if (capable.length > 1) {
        return result(m.chooseLocation(capable), STATES.LOCATION);
      }
      data.locationId = capable[0]?.id || null;
      return showCategories(deps, data, result, m);
    }

    case STATES.LOCATION: {
      const capable = capableLocations(locations, data.orderType);
      const chosen = pickByNumber(capable, text);
      if (!chosen) return result(m.invalidLocation, STATES.LOCATION);
      data.locationId = chosen.id;
      return showCategories(deps, data, result, m);
    }

    case STATES.CATEGORY: {
      if (command === 'finalizar' || command === 'pagar') {
        return goToCheckout(data, config, result, m);
      }
      const menu = await deps.loadMenu();
      if (!menu || menu.length === 0) {
        return result(m.emptyMenu, STATES.GREETING, freshData(data.phone, data.lastOrderId));
      }
      const cat = pickByNumber(menu, text);
      if (!cat) return result(m.invalidCategory, STATES.CATEGORY);
      data.nav.categoryId = cat.id;
      return result(m.items(cat.name, cat.lines), STATES.ITEM);
    }

    case STATES.ITEM: {
      if (command === '0' || command === 'volver') {
        return showCategories(deps, data, result, m);
      }
      const menu = await deps.loadMenu();
      const cat = (menu || []).find((c) => c.id === data.nav.categoryId);
      if (!cat) return showCategories(deps, data, result, m);
      const line = pickByNumber(cat.lines, text);
      if (!line) return result(m.invalidItem, STATES.ITEM);
      data.pending = {
        menuItemId: line.menuItemId,
        variantId: line.variantId,
        name: line.name,
        unitPrice: line.unitPrice,
      };
      return result(m.askQuantity(line.name), STATES.QUANTITY);
    }

    case STATES.QUANTITY: {
      const qty = parseQuantity(text);
      if (!qty || !data.pending) {
        if (!data.pending) return showCategories(deps, data, result, m);
        return result(m.invalidQuantity, STATES.QUANTITY);
      }
      addToCart(data.cart, data.pending, qty);
      const name = data.pending.name;
      data.pending = null;
      const next = await showCategories(deps, data, (r, s, d) => ({ replies: [r], state: s, data: d }), m);
      // Prepend el "agregado" al prompt de categorías.
      return result([m.added(qty, name), ...next.replies], next.state, next.data);
    }

    case STATES.CART: {
      if (command === 'finalizar' || command === 'pagar') {
        return goToCheckout(data, config, result, m);
      }
      if (['menu', 'agregar', 'mas', 'carta'].includes(command)) {
        return showCategories(deps, data, result, m);
      }
      const removeMatch = command.match(/^quitar\s+(\d+)$/);
      if (removeMatch) {
        const idx = parseInt(removeMatch[1], 10) - 1;
        if (idx >= 0 && idx < data.cart.length) {
          const [removed] = data.cart.splice(idx, 1);
          const body = data.cart.length
            ? `🗑️ Quité *${removed.name}*.\n\n${m.cartSummary(data.cart)}\n\nEscribe *finalizar*, *menú* o *cancelar*.`
            : `🗑️ Quité *${removed.name}*. Tu carrito quedó vacío. Escribe *menú* para agregar productos.`;
          return result(body, STATES.CART);
        }
      }
      return result(`${m.cartSummary(data.cart)}\n\nEscribe *finalizar*, *menú* para agregar, *quitar N* o *cancelar*.`, STATES.CART);
    }

    case STATES.NAME: {
      const name = text.trim();
      if (!name) return result(m.askName, STATES.NAME);
      data.customerName = name.slice(0, 80);
      if (data.orderType === 'DELIVERY') return result(m.askAddress, STATES.ADDRESS);
      return result(m.askPayment(data.orderType, onlinePayment), STATES.PAYMENT);
    }

    case STATES.ADDRESS: {
      const addr = text.trim();
      if (!addr) return result(m.askAddress, STATES.ADDRESS);
      data.deliveryAddress = addr.slice(0, 300);
      if ((config?.deliveryMode || 'FLAT') === 'DISTANCE') {
        return result(m.askLocationPin, STATES.LOCATION_PIN);
      }
      return result(m.askPayment(data.orderType, onlinePayment), STATES.PAYMENT);
    }

    case STATES.LOCATION_PIN: {
      if (message?.type === 'location' && message.location) {
        const dest = { lat: message.location.lat, lng: message.location.lng };
        const calc = computeDeliveryFee(config, cartSubtotal(data.cart), dest);
        if (calc.error === 'OUT_OF_RANGE') {
          data.deliveryLat = null;
          data.deliveryLng = null;
          return result([m.outOfRange(calc.distanceKm), m.askAddress], STATES.ADDRESS);
        }
        data.deliveryLat = dest.lat;
        data.deliveryLng = dest.lng;
        return result(m.askPayment(data.orderType, onlinePayment), STATES.PAYMENT);
      }
      if (command === 'omitir' || command === 'saltar') {
        data.deliveryLat = null;
        data.deliveryLng = null;
        return result(m.askPayment(data.orderType, onlinePayment), STATES.PAYMENT);
      }
      if (command === 'cambiar') {
        return result(m.askAddress, STATES.ADDRESS);
      }
      return result(m.askLocationPin, STATES.LOCATION_PIN);
    }

    case STATES.PAYMENT: {
      let method = null;
      if (command === '1' || /efectivo|cash/.test(command)) method = 'CASH';
      else if (command === '2' || /transfer/.test(command)) method = 'TRANSFER';
      else if (onlinePayment && (command === '3' || /linea|tarjeta|online|card/.test(command))) method = 'ONLINE';
      if (!method) return result(m.invalidPayment(onlinePayment), STATES.PAYMENT);
      data.paymentMethod = method;
      return result(buildConfirm(data, config), STATES.CONFIRM);
    }

    case STATES.CONFIRM: {
      const yes = command === 'si' || command === 'sí' || command === '1' || /confirm/.test(command);
      const no = command === 'no' || command === '2' || command === 'cancelar';
      if (no) {
        return result(m.cancelled, STATES.GREETING, freshData(data.phone, data.lastOrderId));
      }
      if (!yes) return result(m.invalidConfirm, STATES.CONFIRM);

      try {
        const { order, estimatedMinutes } = await deps.createOrder(data);
        const fresh = freshData(data.phone, order.id);
        const replies = [
          m.orderCreated({
            orderNumber: order.orderNumber,
            total: order.total,
            orderType: order.orderType,
            estimatedMinutes,
          }),
        ];
        // Pago en línea: generamos el link de checkout y lo enviamos después.
        if (data.paymentMethod === 'ONLINE' && deps.createCheckout) {
          let url = null;
          try { url = await deps.createCheckout(order); } catch (_) { url = null; }
          replies.push(url ? m.payOnline(url) : m.payOnlinePending);
        }
        return result(replies, STATES.GREETING, fresh);
      } catch (err) {
        if (err.code === 'MIN_ORDER') {
          return result([err.message, m.cartEmpty].join('\n'), STATES.CATEGORY);
        }
        if (err.code === 'OUT_OF_RANGE') {
          return result([m.outOfRange(''), m.askAddress], STATES.ADDRESS);
        }
        if (err.code === 'NO_VALID_ITEMS' || err.code === 'CART_EMPTY') {
          return result('😔 Los productos de tu carrito ya no están disponibles. Empecemos de nuevo.', STATES.GREETING, freshData(data.phone, data.lastOrderId));
        }
        throw err;
      }
    }

    default:
      return result(m.welcome(restaurant.name), STATES.ORDER_TYPE);
  }
}

// ── Sub-rutinas ──────────────────────────────────────────────────────────────

async function showCategories(deps, data, result, msg) {
  const menu = await deps.loadMenu();
  if (!menu || menu.length === 0) {
    return result(msg.emptyMenu, STATES.GREETING, freshData(data.phone, data.lastOrderId));
  }
  data.nav.categoryId = null;
  return result(msg.categories(menu, data.cart), STATES.CATEGORY, data);
}

function goToCheckout(data, config, result, msg) {
  const subtotal = cartSubtotal(data.cart);
  if (!data.cart || data.cart.length === 0) {
    return result(msg.cartEmpty, STATES.CATEGORY);
  }
  if (config?.minOrderAmount > 0 && subtotal < config.minOrderAmount) {
    return result(msg.minOrder(config.minOrderAmount, subtotal), STATES.CATEGORY);
  }
  return result(msg.askName, STATES.NAME);
}

function addToCart(cart, pending, qty) {
  const existing = cart.find(
    (i) => i.menuItemId === pending.menuItemId && i.variantId === pending.variantId
  );
  if (existing) {
    existing.quantity = Math.min(99, existing.quantity + qty);
  } else {
    cart.push({
      menuItemId: pending.menuItemId,
      variantId: pending.variantId,
      name: pending.name,
      unitPrice: pending.unitPrice,
      quantity: qty,
    });
  }
}

function buildConfirm(data, config) {
  const subtotal = cartSubtotal(data.cart);
  let deliveryFee = 0;
  if (data.orderType === 'DELIVERY') {
    const dest = (data.deliveryLat != null && data.deliveryLng != null)
      ? { lat: data.deliveryLat, lng: data.deliveryLng }
      : null;
    deliveryFee = computeDeliveryFee(config, subtotal, dest).fee;
  }
  const paymentLabel =
    data.paymentMethod === 'TRANSFER'
      ? 'Transferencia'
      : data.paymentMethod === 'ONLINE'
        ? 'Pago en línea (tarjeta)'
        : 'Efectivo';
  return m.confirm({
    cart: data.cart,
    orderType: data.orderType,
    deliveryFee,
    address: data.deliveryAddress,
    locationName: null,
    customerName: data.customerName,
    paymentLabel,
  });
}

// Reenvía el prompt del estado actual (para entradas no soportadas).
function repromptCurrent(state, data, locations, config, deps, result, msg) {
  switch (state) {
    case STATES.LOCATION_PIN:
      return result(msg.askLocationPin, STATES.LOCATION_PIN);
    case STATES.ORDER_TYPE:
      return result(msg.askOrderTypeAgain, STATES.ORDER_TYPE);
    default:
      return result('Por favor, responde con *texto* siguiendo las instrucciones 🙂. Escribe *ayuda* si lo necesitas.', state);
  }
}

module.exports = { handleInbound, STATES, norm, freshData, addToCart, cartSubtotal, capableLocations };
