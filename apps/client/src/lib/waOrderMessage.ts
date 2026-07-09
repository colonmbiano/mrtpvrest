export function generateWhatsAppOrderMessage(
  order: any, // Tipo Order o la respuesta del POST /api/store/orders
  storeName: string
): string {
  const isDelivery = order.orderType === 'DELIVERY';
  const typeText = isDelivery ? 'a domicilio' : 'para recoger';

  let msg = `Hola! Quiero hacer un pedido ${typeText} 👋\n\n`;
  msg += `*Folio:* #${order.orderNumber}\n`;
  
  if (isDelivery && order.deliveryAddress) {
    msg += `*Entrega:* ${order.deliveryAddress}\n`;
  }
  
  msg += `\n*Mi pedido:*\n`;
  
  const items = Array.isArray(order.items) ? order.items : [];
  for (const item of items) {
    const qty = Math.max(1, Number(item.quantity) || 1);
    msg += `• ${qty}x ${item.name || 'Producto'}`;
    
    // Mods and combos
    const details = [];
    if (Array.isArray(item.comboSelections) && item.comboSelections.length > 0) {
      details.push(...item.comboSelections.map((c: any) => c.name));
    }
    if (Array.isArray(item.modifiers) && item.modifiers.length > 0) {
      details.push(...item.modifiers.map((m: any) => m.name));
    }
    
    if (details.length > 0) {
      msg += ` (${details.join(', ')})`;
    }
    
    if (item.notes) {
      msg += `\n  _Nota: ${item.notes}_`;
    }
    msg += '\n';
  }
  
  msg += `\n*Total:* $${Number(order.total || 0).toFixed(2)}\n`;
  if (order.notes) {
    msg += `\n*Comentarios:* ${order.notes}\n`;
  }

  msg += `\n¡Gracias!`;
  
  return encodeURIComponent(msg);
}
