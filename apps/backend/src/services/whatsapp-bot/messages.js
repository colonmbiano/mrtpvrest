// messages.js — Plantillas de texto del chatbot de WhatsApp (español).
//
// Todo el "copy" vive aquí para mantener el motor (engine.js) enfocado en la
// lógica de la conversación y para poder ajustar el tono sin tocar el flujo.

function money(n) {
  const value = Number(n) || 0;
  return '$' + value.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Resumen de una línea del carrito (sin numerar).
function cartLine(item) {
  return `• ${item.quantity}x ${item.name} — ${money(item.unitPrice * item.quantity)}`;
}

function cartSummary(cart) {
  if (!cart || cart.length === 0) return '🛒 Tu carrito está vacío.';
  const lines = cart.map(cartLine).join('\n');
  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  return `🛒 *Tu carrito:*\n${lines}\n\n*Subtotal: ${money(subtotal)}*`;
}

const HELP = [
  '🤖 *Comandos disponibles:*',
  '• *menú* — ver las categorías',
  '• *carrito* — ver lo que llevas',
  '• *finalizar* — cerrar tu pedido',
  '• *cancelar* — empezar de nuevo',
].join('\n');

module.exports = {
  money,
  cartLine,
  cartSummary,
  HELP,

  welcome: (restaurantName) =>
    `👋 ¡Hola! Bienvenid@ a *${restaurantName}*.\n\nSoy tu asistente de pedidos. ¿Cómo quieres tu pedido?\n\n*1.* 🛵 Entrega a domicilio\n*2.* 🥡 Recoger en sucursal\n\n_Responde con el número de tu elección._`,

  askOrderTypeAgain:
    'No entendí 🤔. Responde *1* para entrega a domicilio o *2* para recoger en sucursal.',

  chooseLocation: (locations) =>
    `📍 ¿En qué sucursal?\n\n${locations
      .map((l, i) => `*${i + 1}.* ${l.name}${l.address ? ` — ${l.address}` : ''}`)
      .join('\n')}\n\n_Responde con el número._`,

  invalidLocation: 'Elige una sucursal válida respondiendo con su número, por favor.',

  categories: (cats, cart) => {
    const list = cats.map((c, i) => `*${i + 1}.* ${c.name}`).join('\n');
    const cartHint = cart && cart.length
      ? `\n\n${cartSummary(cart)}\n\nEscribe *finalizar* para cerrar tu pedido.`
      : '';
    return `📋 *Nuestro menú* — elige una categoría:\n\n${list}${cartHint}\n\n_Responde con el número de la categoría._`;
  },

  emptyMenu:
    '😔 Por ahora no hay productos disponibles en el menú. Intenta más tarde, por favor.',

  items: (categoryName, lines) =>
    `🍽️ *${categoryName}*\n\n${lines
      .map((l, i) => `*${i + 1}.* ${l.name} — ${money(l.unitPrice)}`)
      .join('\n')}\n\n_Responde con el número del producto, o *0* para volver a las categorías._`,

  askQuantity: (name) => `¿Cuántas unidades de *${name}* quieres? _(responde con un número)_`,

  invalidQuantity: 'Indica una cantidad válida entre 1 y 50, por favor.',

  added: (qty, name) =>
    `✅ Agregué *${qty}x ${name}* a tu carrito.\n\n¿Algo más? Elige otra categoría, o escribe *carrito* / *finalizar*.`,

  invalidCategory:
    'No reconozco esa opción. Responde con el número de una categoría, *carrito* o *finalizar*.',

  nluAdded: (summary) =>
    `✅ Entendí tu pedido: *${summary}*. Lo agregué a tu carrito.`,

  invalidItem: 'Responde con el número de un producto, o *0* para volver.',

  cartEmpty:
    '🛒 Aún no has agregado nada. Escribe *menú* para ver los productos.',

  minOrder: (min, subtotal) =>
    `El pedido mínimo es de ${money(min)} y llevas ${money(subtotal)}. Agrega algo más para continuar 🙂.`,

  askName: '📝 ¿A nombre de quién va el pedido?',

  askAddress:
    '🏠 Escríbeme tu *dirección completa* (calle, número, colonia y referencias).',

  askLocationPin:
    '📍 Para calcular tu envío, *comparte tu ubicación* desde WhatsApp (📎 → Ubicación).\n\nSi no puedes, escribe *omitir* y usaremos la tarifa base.',

  outOfRange: (km) =>
    `😔 Tu ubicación está a ${km} km y queda fuera de nuestra zona de cobertura. Escribe *cambiar* para mandar otra dirección o *cancelar*.`,

  askPayment: (orderType, onlinePayment) => {
    const cashLabel =
      orderType === 'DELIVERY' ? 'Efectivo (contra entrega)' : 'Efectivo (al recoger)';
    let opts = `*1.* 💵 ${cashLabel}\n*2.* 🏦 Transferencia`;
    if (onlinePayment) opts += '\n*3.* 💳 Pago en línea (tarjeta)';
    return `💳 ¿Cómo vas a pagar?\n\n${opts}\n\n_Responde con el número._`;
  },

  invalidPayment: (onlinePayment) =>
    onlinePayment
      ? 'Responde *1* (efectivo), *2* (transferencia) o *3* (pago en línea), por favor.'
      : 'Responde *1* para efectivo o *2* para transferencia, por favor.',

  payOnline: (url) =>
    `💳 Para completar tu pago, abre este link seguro:\n${url}\n\nEn cuanto recibamos tu pago confirmamos tu pedido. 🙌`,

  payOnlinePending:
    'No pudimos generar tu link de pago en este momento 😕. No te preocupes: puedes pagar en efectivo al recibir tu pedido, o escríbenos y lo resolvemos.',

  confirm: ({ cart, orderType, deliveryFee, address, locationName, customerName, paymentLabel }) => {
    const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const total = subtotal + (deliveryFee || 0);
    const lines = cart.map(cartLine).join('\n');
    const typeLine =
      orderType === 'DELIVERY'
        ? `🛵 *Entrega a:* ${address}`
        : `🥡 *Recoger en:* ${locationName || 'sucursal'}`;
    const feeLine = orderType === 'DELIVERY' ? `Envío: ${money(deliveryFee || 0)}\n` : '';
    return [
      '🧾 *Resumen de tu pedido*',
      '',
      lines,
      '',
      `Subtotal: ${money(subtotal)}`,
      feeLine + `*Total: ${money(total)}*`,
      '',
      typeLine,
      `👤 *Nombre:* ${customerName}`,
      `💳 *Pago:* ${paymentLabel}`,
      '',
      'Responde *SÍ* para enviar tu pedido o *NO* para cancelar.',
    ].join('\n');
  },

  invalidConfirm: 'Responde *SÍ* para confirmar tu pedido o *NO* para cancelar.',

  orderCreated: ({ orderNumber, total, orderType, estimatedMinutes }) => {
    const eta =
      orderType === 'DELIVERY'
        ? `🕒 Tiempo estimado de entrega: *${estimatedMinutes} min*.`
        : `🕒 Estará listo para recoger en aprox. *${estimatedMinutes} min*.`;
    return [
      '🎉 ¡Pedido recibido!',
      '',
      `📦 *Folio:* ${orderNumber}`,
      `💰 *Total:* ${money(total)}`,
      eta,
      '',
      'Te avisaremos cuando cambie el estado de tu pedido. ¡Gracias por tu compra! 🙌',
    ].join('\n');
  },

  cancelled:
    '❌ Tu pedido fue cancelado. Cuando quieras empezar de nuevo, solo escríbeme 🙂.',

  storeClosed: (msg) =>
    `😴 ${msg || 'La tienda está cerrada en este momento.'} Vuelve a escribirnos en nuestro horario, ¡con gusto te atenderemos!`,

  genericError:
    '⚠️ Ocurrió un problema procesando tu mensaje. Escribe *menú* para reintentar o *cancelar* para empezar de nuevo.',

  // ── Juegos promocionales ──────────────────────────────────────────────────
  prizeWon: (label, code, expiresAt) => {
    const vence = expiresAt
      ? `\n_Válido hasta el ${new Date(expiresAt).toLocaleDateString('es-MX')}._`
      : '';
    return `🎉 ¡Felicidades! Ganaste: *${label}* 🎁\n\nUsa el código *${code}* en tu próximo pedido.${vence}`;
  },

  prizeKeepPlaying: (label) =>
    `🎰 ${label || 'Esta vez no hubo premio'}. ¡Sigue participando en tu próximo pedido! 🍀`,

  gameUnavailable:
    '🎰 Por ahora no tenemos un juego de premios disponible. ¡Haz tu pedido y atento a nuestras promos!',

  gameMaxReached:
    '🙌 Ya participaste en nuestro juego de premios. ¡Gracias! Atento a las próximas promociones.',
};
