const axios = require('axios');
const { prisma } = require('@mrtpvrest/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const MAX_ORDER_ITEMS = 15;
const MAX_ITEM_QUANTITY = 20;

function normalizeBotItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item && item.menuItemId)
    .slice(0, MAX_ORDER_ITEMS)
    .map(item => ({
      menuItemId: item.menuItemId,
      variantId: item.variantId || null,
      quantity: Math.max(1, Math.min(MAX_ITEM_QUANTITY, parseInt(item.quantity, 10) || 1)),
      modifierIds: Array.isArray(item.modifierIds) ? item.modifierIds : [],
      notes: item.notes || ''
    }));
}

function normalizePaymentMethod(method, orderType = 'DELIVERY') {
  const value = String(method || '').toUpperCase();
  if (['TRANSFER', 'SPEI', 'BANK_TRANSFER', 'TRANSFERENCIA'].includes(value)) return 'TRANSFER';
  if (['CARD', 'CARD_PRESENT', 'TARJETA', 'CREDIT_CARD', 'DEBIT_CARD'].includes(value)) return 'CARD';
  if (['CASH', 'CASH_ON_DELIVERY', 'EFECTIVO'].includes(value)) {
    return orderType === 'DELIVERY' ? 'CASH_ON_DELIVERY' : 'CASH';
  }
  return orderType === 'DELIVERY' ? 'CASH_ON_DELIVERY' : 'CASH';
}

function normalizeCustomerPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return /^\d{10,14}$/.test(digits) ? digits : null;
}

// Empleado de servicio del bot, por restaurante. authenticate SIEMPRE resuelve
// el actor contra la BD (User/Employee por id) — un JWT con id inventado
// ('whatsapp-bot') da 401 "Sesión no válida". El fix honesto: un Employee REAL
// "Bot WhatsApp" (rol CASHIER, PIN aleatorio hasheado con bcrypt → nadie puede
// loguearse con él), creado lazy y cacheado. Bonus: order.createdById queda
// auditable como el bot.
const botEmployeeCache = new Map(); // restaurantId → employeeId

// Base del API para crear/editar pedidos. Cuando el bot corre como servicio
// SEPARADO (worker de Railway) localhost NO apunta al backend: se resuelve por
// WHATSAPP_BOT_API_BASE (p.ej. https://api.mrtpvrest.com). Si no está seteada
// (bot dentro del mismo proceso del backend, dev local) cae al localhost del
// puerto dado. Se le quita el slash final para no generar `//api`.
function apiBase(port) {
  const base = process.env.WHATSAPP_BOT_API_BASE;
  return base ? base.replace(/\/+$/, '') : `http://localhost:${port}`;
}

async function getBotEmployeeId(restaurantId) {
  const cached = botEmployeeCache.get(restaurantId);
  if (cached) return cached;

  const location = await prisma.location.findFirst({
    where: { restaurantId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!location) throw new Error(`Sin sucursal activa para ${restaurantId}`);

  let emp = await prisma.employee.findFirst({
    where: { locationId: location.id, name: 'Bot WhatsApp' },
    select: { id: true, isActive: true },
  });
  if (emp && !emp.isActive) {
    await prisma.employee.update({ where: { id: emp.id }, data: { isActive: true } });
  }
  if (!emp) {
    emp = await prisma.employee.create({
      data: {
        locationId: location.id,
        name: 'Bot WhatsApp',
        role: 'CASHIER',
        // PIN irrecuperable: hash bcrypt de 32 bytes aleatorios. Existe solo
        // porque el campo es obligatorio; no habilita login por PIN.
        pin: bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10),
        isActive: true,
        canTakeDelivery: true,
        canTakeTakeout: true,
      },
      select: { id: true },
    });
  }
  botEmployeeCache.set(restaurantId, emp.id);
  return emp.id;
}

/**
 * Recibe el JSON de Gemini y crea la orden en el TPV
 */
async function createOrderFromGemini(restaurantId, parsedJson, port = 3001) {
  const items = normalizeBotItems(parsedJson.items);
  if (parsedJson.status !== 'CONFIRMED' || items.length === 0) {
    return null;
  }

  try {
    // Buscar la sucursal principal del restaurante para asignarle el pedido
    const primaryLocation = await prisma.location.findFirst({
      where: { restaurantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    // Formatear el payload para /api/store/orders
    const orderType = parsedJson.orderType || 'DELIVERY';
    const payload = {
      customerName: parsedJson.customerName || "Cliente WhatsApp",
      customerPhone: normalizeCustomerPhone(parsedJson.customerPhone),
      orderType,
      deliveryAddress: parsedJson.deliveryAddress || 'Dirección a confirmar por WhatsApp',
      deliveryLat: parsedJson.deliveryLat || null,
      deliveryLng: parsedJson.deliveryLng || null,
      locationId: primaryLocation?.id,
      source: 'WHATSAPP',
      paymentMethod: normalizePaymentMethod(parsedJson.paymentMethod, orderType),
      notes: 'Pedido generado por asistente de IA de WhatsApp',
      items
    };

    // Petición al backend (mismo proceso en dev; servicio API en el worker).
    const response = await axios.post(`${apiBase(port)}/api/store/orders`, payload, {
      headers: {
        'x-restaurant-id': restaurantId
      }
    });

    console.log(`[WhatsApp Bot] Orden creada exitosamente: ${response.data.orderNumber}`);
    return response.data;

  } catch (error) {
    console.error('[WhatsApp Bot] Error creando la orden:', error?.response?.data || error.message);
    return null;
  }
}

/**
 * Agrega platillos a una orden existente
 */
async function addItemsToOrder(orderId, parsedJson, restaurantId, port = 3001) {
  const items = normalizeBotItems(parsedJson.items);
  if (parsedJson.status !== 'ADD_TO_ORDER' || items.length === 0) {
    return null;
  }

  try {
    // La sucursal debe salir de la ORDEN, no del empleado: addRoundHandler exige
    // req.locationId (de x-location-id) y valida que == order.locationId. Sin
    // este header el endpoint responde 400 "Sucursal no identificada".
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { locationId: true },
    });
    if (!order || !order.locationId) {
      console.error(`[WhatsApp Bot] Orden ${orderId} no encontrada o sin sucursal; no se agregan items.`);
      return null;
    }

    const payload = { items };

    // JWT del empleado de servicio REAL del bot (authenticate lo resuelve en
    // BD; un id inventado daba 401). Rol CASHIER: suficiente para
    // POST /api/orders/:id/items.
    const botEmployeeId = await getBotEmployeeId(restaurantId);
    const token = jwt.sign(
      { id: botEmployeeId, restaurantId, role: 'CASHIER' },
      process.env.JWT_SECRET,
      { expiresIn: '2m' }
    );

    const response = await axios.post(`${apiBase(port)}/api/orders/${orderId}/items`, payload, {
      headers: {
        'x-restaurant-id': restaurantId,
        'x-location-id': order.locationId,
        'Authorization': `Bearer ${token}`
      }
    });

    console.log(`[WhatsApp Bot] Items agregados exitosamente a la orden ${orderId}`);
    return response.data;
  } catch (error) {
    console.error('[WhatsApp Bot] Error agregando items a la orden:', error?.response?.data || error.message);
    return null;
  }
}

module.exports = {
  createOrderFromGemini,
  addItemsToOrder,
  normalizeBotItems,
  normalizePaymentMethod,
  normalizeCustomerPhone
};
