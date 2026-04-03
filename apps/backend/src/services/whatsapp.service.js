require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.WHATSAPP_API_URL || 'https://gate.whapi.cloud';
const TOKEN   = process.env.WHATSAPP_TOKEN;

function formatPhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  // Extraer siempre los ultimos 10 digitos y agregar 521
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    return '521' + last10;
  }
  return '521' + digits;
}

async function sendWhatsApp(rawPhone, event, order) {
  if (!TOKEN) { console.warn('WhatsApp: TOKEN no configurado'); return; }
  if (!rawPhone) { console.warn('WhatsApp: telefono no disponible'); return; }

  const phone = formatPhone(rawPhone);

  const messages = {
    confirmacion: `🍔 *Master Burger's*
\n¡Hola! Tu pedido *${order.orderNumber}* fue recibido.
\n📋 *Resumen:*
${(order.items || []).map(i => `• ${i.quantity}x ${i.name}`).join('\n')}
\n💰 *Total: $${order.total}*
\n⏱️ Tiempo estimado: 40 minutos
\n¡Gracias por tu pedido! 🎉`,

    en_preparacion: `👨‍🍳 *Master Burger's*
\nTu pedido *${order.orderNumber}* está siendo preparado.
\n¡Ya casi está listo! 🔥`,

    listo: `✅ *Master Burger's*
\nTu pedido *${order.orderNumber}* está listo.
\nSaldrá en camino muy pronto 🛵`,

    en_camino: `🛵 *Master Burger's*
\nTu pedido *${order.orderNumber}* va en camino.
\n📍 Dirección: ${order.address?.street || ''} ${order.address?.extNumber || ''}
\n¡Llega pronto! 🍔`,

    entregado: `🏠 *Master Burger's*
\n¡Tu pedido *${order.orderNumber}* fue entregado!
\n¡Buen provecho! 😋
\nGracias por preferirnos ⭐`,

    cancelado: `❌ *Master Burger's*
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
