'use strict';

// ───────────────────────────────────────────────────────────────────────────
// order-confirmation-mailer.js — Correo de confirmación al CLIENTE cuando su
// pedido de la tienda en línea queda pagado.
//
// Best-effort por diseño: el pago YA está confirmado en la BD antes de llamar
// aquí. Quien llama NO debe await-earlo (fire-and-forget con .catch) para que
// un fallo de correo nunca afecte el procesamiento del webhook de pago.
//
// Destinatario: el correo que el invitado dejó en el checkout (order.customerEmail)
// o, si el pedido está ligado a un cliente registrado, el de su cuenta. Si no
// hay ninguno, no se envía (la mayoría de pedidos de invitado no dejan correo).
// ───────────────────────────────────────────────────────────────────────────

const { prisma } = require('@mrtpvrest/database');
const { sendEmail, orderPaidEmailHtml } = require('../utils/mailer');

const ORDER_TYPE_LABEL = {
  DELIVERY: 'Entrega a domicilio',
  TAKEOUT: 'Para llevar',
  DINE_IN: 'En restaurante',
};

async function sendOrderPaidEmail(orderId) {
  if (!orderId) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true, customerName: true, customerEmail: true,
      total: true, deliveryFee: true, discount: true, orderType: true,
      estimatedMinutes: true, restaurantId: true,
      user: { select: { email: true } },
      items: { select: { name: true, quantity: true, price: true } },
    },
  });
  if (!order) return;

  const recipient = order.customerEmail || order.user?.email || null;
  if (!recipient) return; // sin correo del cliente → nada que enviar

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: order.restaurantId },
    select: { name: true },
  });

  const html = orderPaidEmailHtml({
    restaurantName: restaurant?.name,
    orderNumber: order.orderNumber ? `#${order.orderNumber}` : '',
    customerName: order.customerName,
    items: order.items,
    deliveryFee: order.deliveryFee,
    discount: order.discount,
    total: order.total,
    orderTypeLabel: ORDER_TYPE_LABEL[order.orderType] || null,
    etaLabel: order.estimatedMinutes ? `${order.estimatedMinutes} min` : null,
  });

  await sendEmail(
    recipient,
    `Pago confirmado · ${restaurant?.name || 'Tu pedido'} ${order.orderNumber ? '#' + order.orderNumber : ''}`.trim(),
    html,
  );
}

module.exports = { sendOrderPaidEmail };
