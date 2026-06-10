require('dotenv').config();
const axios = require('axios');
const { toWhatsappNumber } = require('@mrtpvrest/config/phone');

const API_URL = process.env.WHATSAPP_API_URL || 'https://gate.whapi.cloud';
const TOKEN   = process.env.WHATSAPP_TOKEN;

async function sendWhatsApp(rawPhone, event, order, countryCode) {
  if (!TOKEN) { console.warn('WhatsApp: TOKEN no configurado'); return; }
  if (!rawPhone) { console.warn('WhatsApp: telefono no disponible'); return; }

  // Lada según el país del restaurante (default MX). Ver packages/config/phone.js.
  const phone = toWhatsappNumber(rawPhone, countryCode);

  const messages = {
    confirmacion: `🍔 *Restaurante Demo*
\n¡Hola! Tu pedido *${order.orderNumber}* fue recibido.
\n📋 *Resumen:*
${(order.items || []).map(i => `• ${i.quantity}x ${i.name}`).join('\n')}
\n💰 *Total: $${order.total}*
\n⏱️ Tiempo estimado: 40 minutos
\n¡Gracias por tu pedido! 🎉`,

    en_preparacion: `👨‍🍳 *Restaurante Demo*
\nTu pedido *${order.orderNumber}* está siendo preparado.
\n¡Ya casi está listo! 🔥`,

    listo: `✅ *Restaurante Demo*
\nTu pedido *${order.orderNumber}* está listo.
\nSaldrá en camino muy pronto 🛵`,

    en_camino: `🛵 *Restaurante Demo*
\nTu pedido *${order.orderNumber}* va en camino.
\n📍 Dirección: ${order.address?.street || ''} ${order.address?.extNumber || ''}
\n¡Llega pronto! 🍔`,

    entregado: `🏠 *Restaurante Demo*
\n¡Tu pedido *${order.orderNumber}* fue entregado!
\n¡Buen provecho! 😋
\nGracias por preferirnos ⭐`,

    cancelado: `❌ *Restaurante Demo*
\nTu pedido *${order.orderNumber}* fue cancelado.
\nContactanos para mas informacion.`,
  };

  const body = messages[event];
  if (!body) { console.warn('WhatsApp: evento desconocido:', event); return; }

  try {
    const { data } = await axios.post(
      `${API_URL}/messages/text`,
      { to: phone, body },
      { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log(`WhatsApp [${event}] enviado a ${phone}:`, data.id);
    return data;
  } catch (err) {
    console.error('WhatsApp error:', err.response?.data || err.message);
  }
}

module.exports = { sendWhatsApp };
