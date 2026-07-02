const axios = require('axios');
const { prisma } = require('@mrtpvrest/database');
// Estado abierto/cerrado: misma fuente de verdad que el storefront y el
// endpoint POST /api/store/orders (que rechaza pedidos con tienda cerrada).
const { computeOpenState } = require('../utils/storeHours');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Convierte el JSON businessHours (una franja por día) a texto legible para el
// prompt. Agrupa nada: una línea por día habilitado. Silencioso si no parsea.
function formatBusinessHours(businessHoursJson) {
  try {
    const arr = JSON.parse(businessHoursJson || '[]');
    if (!Array.isArray(arr) || arr.length === 0) return '';
    const lines = arr
      .filter(d => d && d.enabled && d.open && d.close)
      .map(d => `${DIAS[d.day] || `día ${d.day}`}: ${d.open}–${d.close}`);
    return lines.join('; ');
  } catch {
    return '';
  }
}

/**
 * Handles the conversation with Gemini directly via Axios.
 */
async function processWhatsAppMessage(phone, text, restaurantId, conversationHistory, activeOrderId = null, isInvalidPhone = false) {
  try {
    // Obtener menú del restaurante para el contexto (con variantes y complementos)
    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId, isAvailable: true },
      include: {
        variants: true,
        complements: true,
        modifierGroups: { include: { modifiers: true } }
      }
    });

    // Identidad + contexto del negocio (multi-tenant: sale de la BD, NO
    // hardcodeado). Da calidez y datos reales (dirección, horario, envío) sin
    // desfasarse cuando el admin los cambia.
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true },
    });
    const config = await prisma.restaurantConfig.findUnique({ where: { restaurantId } });
    const openState = config ? computeOpenState(config) : { isOpen: true, message: '' };
    const businessName = restaurant?.name || 'nuestro restaurante';
    const horarioTexto = config ? formatBusinessHours(config.businessHours) : '';
    // Instrucciones extra AFINABLES sin reconstruir la imagen: se editan en la
    // variable de entorno del servicio (WHATSAPP_BOT_EXTRA_INSTRUCTIONS) y con
    // un restart toman efecto. Para ir ajustando tono/políticas en caliente.
    const extraInstructions = (process.env.WHATSAPP_BOT_EXTRA_INSTRUCTIONS || '').trim();

    // Determinar qué día es hoy en México
    const todayStr = new Date().toLocaleString('es-MX', { weekday: 'long', timeZone: 'America/Mexico_City' }).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Filtrar items y aplicar promos según el día
    const activeMenuItems = menuItems.filter(item => {
      const activeDays = Array.isArray(item.activeDays) ? item.activeDays : [];
      if (item.isPromo) {
        if (activeDays.length === 0) return false; // Promos sin día están ocultas
        return activeDays.includes(todayStr); // Solo visible si el día coincide
      }
      return true; // Si no es promo, es un producto normal
    });

    const menuString = activeMenuItems.map(item => {
      const price = item.isPromo && item.promoPrice ? item.promoPrice : item.price;
      const promoText = item.isPromo ? " (¡PROMOCIÓN DEL DÍA!)" : "";
      let str = `- ${item.name}: $${price}${promoText} (${item.description || ''}) [ID: ${item.id}]`;
      
      const availableVariants = item.variants.filter(v => v.isAvailable);
      if (availableVariants.length > 0) {
        str += `\n  Variantes (elige 1): ` + availableVariants.map(v => `${v.name} ($${v.price}) [variantId: ${v.id}]`).join(', ');
      }
      
      const availableComplements = item.complements.filter(c => c.isAvailable);
      if (availableComplements.length > 0) {
        str += `\n  Extras/Complementos: ` + availableComplements.map(c => `${c.name} (+$${c.price}) [modifierId: complement:${c.id}]`).join(', ');
      }

      item.modifierGroups.forEach(g => {
        str += `\n  Grupo: ${g.name} -> ` + g.modifiers.map(m => `${m.name} (+$${m.priceAdd || 0}) [modifierId: ${m.id}]`).join(', ');
      });

      return str;
    }).join('\n\n');

    const systemPrompt = `
      Eres el asistente virtual de ${businessName}, atendiendo por WhatsApp. Tu objetivo es dar una atención cálida y tomar el pedido del cliente logrando la mejor conversión de ventas.

      ## Contexto del negocio (úsalo para responder dudas; NO lo repitas entero a menos que lo pregunten)
      - Nombre: ${businessName}
      ${config?.address ? `- Dirección: ${config.address}` : ''}
      ${(config?.whatsappNumber || config?.phone) ? `- Teléfono: ${config.whatsappNumber || config.phone}` : ''}
      ${horarioTexto ? `- Horario: ${horarioTexto}` : ''}
      - Estado ahora mismo: ${openState.isOpen ? 'ABIERTO ✅' : 'CERRADO ⛔'}${!openState.isOpen && openState.message ? ` (${openState.message})` : ''}
      - Tiempo estimado de entrega: ~${config?.estimatedDelivery || 40} minutos.
      - Formas de pago: efectivo, tarjeta o transferencia (si hay duda de pago, dile que un asesor lo confirma).
      - Un asesor humano confirma el pedido y el tiempo de entrega.

      Reglas:
      1. TONO empático y cálido: saluda con calidez ("¡Qué gusto saludarte!", "Con mucho gusto te ayudo"), muestra interés genuino y usa emojis con MODERACIÓN (🍔🌮🥤). Cercano pero respetuoso, conciso y directo.
      ${!openState.isOpen ? '1b. ESTAMOS CERRADOS AHORA MISMO: NO confirmes pedidos (nunca uses "CONFIRMED"). Informa amablemente el horario e invita al cliente a ordenar cuando abramos. Usa "CONVERSING".' : ''}
      2. Si el cliente pide el menú, muéstrale los platos disponibles. IMPORTANTE: ¡NUNCA muestres los [ID: ...], [variantId: ...] ni [modifierId: ...] al cliente en el texto! Esos IDs son exclusivamente para tu uso interno en el JSON final.
      3. TÉCNICAS DE VENTA (UPSELLING): Antes de confirmar el pedido, sugiere amablemente algún complemento, bebida o postre que combine con lo que el cliente pidió (ej. "¿Te gustaría agregar papas o un refresco a tu orden?").
      4. TOMA DE DATOS OBLIGATORIA: Antes de confirmar la orden, debes preguntarle al cliente:
         - Su nombre.
         - Si el pedido es para "Envío a domicilio" (DELIVERY) o "Pasar a recoger" (TAKEOUT).
         - Si es envío a domicilio, pregúntale su dirección de entrega (o que te envíe su ubicación por GPS de WhatsApp).
         ${isInvalidPhone ? '- OBLIGATORIO: Pídele su número de teléfono a 10 dígitos (no lo pudimos detectar).' : ''}
      5. CUANDO EL CLIENTE CONFIRME EL PEDIDO y hayas recabado todos los datos, DEBES generar una respuesta en formato JSON puro con la siguiente estructura, para que el sistema lo procese automáticamente:
      
      {
        "status": "CONFIRMED",
        "customerName": "Nombre del Cliente",
        "customerPhone": "${isInvalidPhone ? 'NÚMERO_DE_TELEFONO_DADO_POR_CLIENTE' : phone}",
        "orderType": "DELIVERY", // o "TAKEOUT"
        "deliveryAddress": "Calle 123, Colonia Centro", // Obligatorio si es DELIVERY
        "deliveryLat": 19.432608, // Extraer del mensaje si el cliente envía su ubicación por GPS
        "deliveryLng": -99.133209, // Extraer del mensaje si el cliente envía su ubicación por GPS
        "items": [
          { 
            "menuItemId": "ID_DEL_PLATO", 
            "variantId": "ID_DE_VARIANTE", // Solo si aplica
            "quantity": 1, 
            "modifierIds": ["ID_MODIFICADOR", "complement:ID_COMPLEMENTO"], // Solo si pidió extras
            "notes": "Sin cebolla" 
          }
        ],
        "replyMessage": "¡Excelente [Nombre]! Tu pedido ha sido confirmado y está en preparación. El total se calculará e incluirá envío si aplica. ¡Gracias por tu compra!"
      }
      
      ${activeOrderId ? `
      6. IMPORTANTE (PEDIDO ACTIVO): El cliente ya acaba de hacer un pedido recientemente. Si el cliente pide AGREGAR MÁS COSAS a su pedido, debes usar el estado "ADD_TO_ORDER" en lugar de "CONFIRMED", e incluir SOLAMENTE los platillos NUEVOS que está agregando.
      Ejemplo si el cliente dice "Mejor agregale unas papas y un chesco":
      {
        "status": "ADD_TO_ORDER",
        "items": [
          { "menuItemId": "ID_PAPAS", "quantity": 1 },
          { "menuItemId": "ID_REFRESCO", "quantity": 1 }
        ],
        "replyMessage": "¡Listo! He agregado las papas y el refresco a tu pedido en cocina."
      }
      
      7. CIERRE DE CONVERSACIÓN: Si el cliente simplemente dice "Gracias", "Ok", "Vale" o se despide, NO le ofrezcas el menú ni le intentes vender más. Simplemente usa el estado "CONVERSING" para despedirte amablemente.
      ` : ''}

      Si el cliente aún está preguntando, armando el pedido o falta algún dato (como el nombre o tipo de envío), responde normalmente en texto:
      {
        "status": "CONVERSING",
        "replyMessage": "Texto de respuesta persuasivo al cliente..."
      }
      
      SIEMPRE responde estrictamente en JSON válido con esa estructura.
      IMPORTANTE: Si escribes texto largo en "replyMessage", usa \\n para los saltos de línea. NUNCA uses saltos de línea reales (enter) dentro de las cadenas de texto del JSON, porque romperás el formato.
      ${extraInstructions ? `
      ## Instrucciones adicionales del negocio (prioritarias)
      ${extraInstructions}
      ` : ''}
      Menú disponible hoy:
      ${menuString}
    `;

    // Convert history to Gemini format
    const contents = conversationHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    contents.push({ role: 'user', parts: [{ text }] });

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${process.env.GOOGLE_AI_API_KEY}`,
      {
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: contents,
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const replyText = response.data.candidates[0].content.parts[0].text;
    let parsedReply;
    try {
      parsedReply = JSON.parse(replyText.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
      console.error('Failed to parse Gemini JSON:', replyText);
      throw e;
    }

    return parsedReply;

  } catch (error) {
    console.error('Error in Gemini processing:', error?.response?.data || error.message);
    return {
      status: 'CONVERSING',
      replyMessage: 'Lo siento, tuve un problema técnico procesando tu mensaje. ¿Podrías repetirlo?'
    };
  }
}

module.exports = {
  processWhatsAppMessage
};
