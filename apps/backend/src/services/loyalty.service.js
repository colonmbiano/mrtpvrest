const prisma = require('@mrtpvrest/database').prisma
const crypto = require('crypto')

// Genera un código QR/identificador único para una cuenta de lealtad nueva.
function genLoyaltyQr() {
  return `LYL-${crypto.randomBytes(6).toString('hex').toUpperCase()}`
}

const TIERS = [
  { name: 'GOLD',   min: 1500 },
  { name: 'SILVER', min: 500  },
  { name: 'BRONZE', min: 0    },
]

function getTier(totalEarned) {
  return TIERS.find(t => totalEarned >= t.min)?.name || 'BRONZE'
}

async function addLoyaltyPoints(userId, order) {
  try {
    const restaurantId = order.restaurantId
    if (!restaurantId) return
    const config = await prisma.restaurantConfig.findUnique({ where: { restaurantId } })
    const pointsPerTen = config?.pointsPerTen || 1
    const base = order.subtotal - order.discount
    const pointsEarned = Math.floor(base / 10) * pointsPerTen
    if (pointsEarned <= 0) return
    const key = { userId_restaurantId: { userId, restaurantId } }
    let loyalty = await prisma.loyaltyAccount.findUnique({ where: key })
    // Si el cliente no tenía cuenta de lealtad, la creamos al vuelo. Antes esto
    // hacía `return` y los puntos se perdían en silencio.
    if (!loyalty) {
      loyalty = await prisma.loyaltyAccount.create({
        data: { userId, restaurantId, qrCode: genLoyaltyQr(), points: 0, totalEarned: 0, tier: 'BRONZE' },
      }).catch(() => null)
      if (!loyalty) return
    }
    const newTotal = loyalty.totalEarned + pointsEarned
    const newTier  = getTier(newTotal)
    await prisma.$transaction([
      prisma.loyaltyAccount.update({
        where: key,
        data: { points: { increment: pointsEarned }, totalEarned: { increment: pointsEarned }, tier: newTier },
      }),
      prisma.loyaltyTransaction.create({
        data: {
          accountId:   loyalty.id,
          type:        'EARNED',
          points:      pointsEarned,
          description: `Puntos por pedido ${order.orderNumber}`,
          orderId:     order.id,
        },
      }),
      prisma.order.update({ where: { id: order.id }, data: { pointsEarned } }),
    ])
    console.log(`Puntos agregados: ${pointsEarned} a usuario ${userId} (rest ${restaurantId})`)
  } catch (error) {
    console.error('Error al agregar puntos:', error)
  }
}

module.exports = { addLoyaltyPoints, getTier, genLoyaltyQr }
