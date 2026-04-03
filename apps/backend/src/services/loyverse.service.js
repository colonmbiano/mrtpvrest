// src/services/loyverse.service.js
// Crea un recibo en Loyverse cuando llega un pedido online
const axios = require('axios')

const LOYVERSE_BASE = 'https://api.loyverse.com/v1.0'
const headers = () => ({
  Authorization: `Bearer ${process.env.LOYVERSE_API_TOKEN}`,
  'Content-Type': 'application/json',
})

/**
 * Crea un Receipt en Loyverse con los items del pedido
 * @param {Object} order - Pedido completo con items
 * @returns {string|null} - ID del recibo en Loyverse
 */
async function createLoyverseReceipt(order) {
  try {
    if (!process.env.LOYVERSE_API_TOKEN) {
      console.log('⚠️  Loyverse no configurado, saltando sync')
      return null
    }

    // Mapear método de pago al tipo de Loyverse
    const paymentTypeMap = {
      CARD:             'CARD',
      OXXO:             'CASH',
      SPEI:             'CUSTOM', // Configurar tipo de pago personalizado en Loyverse
      CASH_ON_DELIVERY: 'CASH',
    }

    const receipt = {
      store_id: process.env.LOYVERSE_STORE_ID,
      // Nota que identifica el pedido online
      note: `🌐 PEDIDO ONLINE ${order.orderNumber} | ${order.user?.name || 'Cliente'}`,
      line_items: order.items.map(item => ({
        item_id:     item.menuItem?.loyverseId || null,
        variant_id:  null, // si tienes variantes
        item_name:   item.name,
        quantity:    item.quantity,
        price:       item.price,
        gross_total_money: item.subtotal,
        total_money: item.subtotal,
        cost:        0,
      })),
      payments: [{
        payment_type_id: null, // null = tipo predeterminado
        name:  paymentTypeMap[order.paymentMethod] || 'CASH',
        money_amount: order.total,
      }],
      total_money:     order.total,
      total_tax:       0,
      points_earned:   order.pointsEarned || 0,
      points_deducted: order.pointsUsed || 0,
      points_balance:  0,
    }

    // Aplicar descuento si existe
    if (order.discount > 0) {
      receipt.discounts = [{
        name:   order.couponId ? 'Cupón' : 'Puntos',
        type:   'FIXED_AMOUNT',
        value:  order.discount,
        money_amount: order.discount,
      }]
    }

    const { data } = await axios.post(`${LOYVERSE_BASE}/receipts`, receipt, { headers: headers() })
    console.log(`✅ Loyverse receipt creado: ${data.receipt_number}`)
    return data.id

  } catch (error) {
    console.error('❌ Error al crear receipt en Loyverse:', error.response?.data || error.message)
    return null
  }
}

/**
 * Obtiene el inventario de un producto en Loyverse
 */
async function getLoyverseStock(loyverseItemId) {
  try {
    const { data } = await axios.get(
      `${LOYVERSE_BASE}/inventory?item_ids=${loyverseItemId}`,
      { headers: headers() }
    )
    return data.inventory_levels || []
  } catch (error) {
    console.error('Error al obtener stock Loyverse:', error.message)
    return []
  }
}

module.exports = { createLoyverseReceipt, getLoyverseStock }
