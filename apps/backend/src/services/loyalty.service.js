const prisma = require('@mrtpvrest/database').prisma

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
    const config = await prisma.restaurantConfig.findUnique({ where: { id: 'main' } })
    const pointsPerTen = config?.pointsPerTen || 1
    const base = order.subtotal - order.discount
    const pointsEarned = Math.floor(base / 10) * pointsPerTen
    if (pointsEarned <= 0) return
    const loyalty = await prisma.loyaltyAccount.findUnique({ where: { userId } })
    if (!loyalty) return
    const newTotal = loyalty.totalEarned + pointsEarned
    const newTier  = getTier(newTotal)
    await prisma.$transaction([
      prisma.loyaltyAccount.update({
        where: { userId },
        data: { points: { increment: pointsEarned }, totalEarned: { increment: pointsEarned }, tier: newTier },
      }),
      prisma.loyaltyTransaction.create({
        data: {
          account:     { connect: { userId } },
          type:        'EARNED',
          points:      pointsEarned,
          description: `Puntos por pedido ${order.orderNumber}`,
          orderId:     order.id,
        },
      }),
      prisma.order.update({ where: { id: order.id }, data: { pointsEarned } }),
    ])
    console.log(`Puntos agregados: ${pointsEarned} a usuario ${userId}`)
  } catch (error) {
    console.error('Error al agregar puntos:', error)
  }
}

module.exports = { addLoyaltyPoints, getTier }
