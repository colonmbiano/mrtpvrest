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

// Clave estable de teléfono para la lealtad de invitado. Solo dígitos; si trae
// lada/país (más de 10) nos quedamos con los últimos 10, así "+52 55…", "52 55…"
// y "55…" caen en la misma cuenta. Menos de 7 dígitos = no es un teléfono usable.
function normalizeLoyaltyPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length < 7) return null
  return digits.length > 10 ? digits.slice(-10) : digits
}

// Resuelve (o crea) la cuenta de lealtad por User identificado o por teléfono de
// invitado. Devuelve null si no hay con qué identificar (ni userId ni teléfono
// válido) o si la creación falló (best-effort; nunca lanza).
async function resolveLoyaltyAccount({ userId, phone, restaurantId }) {
  if (userId) {
    const key = { userId_restaurantId: { userId, restaurantId } }
    const existing = await prisma.loyaltyAccount.findUnique({ where: key }).catch(() => null)
    if (existing) return existing
    // Si el cliente no tenía cuenta, la creamos al vuelo (antes esto perdía los
    // puntos en silencio).
    return prisma.loyaltyAccount.create({
      data: { userId, restaurantId, qrCode: genLoyaltyQr(), points: 0, totalEarned: 0, tier: 'BRONZE' },
    }).catch(() => null)
  }

  const normPhone = normalizeLoyaltyPhone(phone)
  if (!normPhone) return null
  const key = { restaurantId_phone: { restaurantId, phone: normPhone } }
  const existing = await prisma.loyaltyAccount.findUnique({ where: key }).catch(() => null)
  if (existing) return existing
  return prisma.loyaltyAccount.create({
    data: { restaurantId, phone: normPhone, qrCode: genLoyaltyQr(), points: 0, totalEarned: 0, tier: 'BRONZE' },
  }).catch(async (e) => {
    // Carrera: otro pedido del mismo teléfono creó la cuenta a la vez (único por
    // restaurantId+phone). La recuperamos en vez de perder los puntos.
    if (e?.code === 'P2002') return prisma.loyaltyAccount.findUnique({ where: key }).catch(() => null)
    return null
  })
}

// Acumula puntos por un pedido. Acepta:
//   addLoyaltyPoints(userId, order)            — cliente identificado (compat)
//   addLoyaltyPoints({ userId }, order)        — idem, explícito
//   addLoyaltyPoints({ phone }, order)         — invitado de la tienda por teléfono
// Best-effort: nunca lanza; un fallo de lealtad no debe tumbar el pedido.
async function addLoyaltyPoints(target, order) {
  try {
    const opts = typeof target === 'string' ? { userId: target } : (target || {})
    const restaurantId = order.restaurantId
    if (!restaurantId) return
    const account = await resolveLoyaltyAccount({ userId: opts.userId, phone: opts.phone, restaurantId })
    if (!account) return

    const config = await prisma.restaurantConfig.findUnique({ where: { restaurantId } })
    const pointsPerTen = config?.pointsPerTen || 1
    const base = order.subtotal - order.discount
    const pointsEarned = Math.floor(base / 10) * pointsPerTen
    if (pointsEarned <= 0) return

    const newTotal = account.totalEarned + pointsEarned
    const newTier  = getTier(newTotal)
    await prisma.$transaction([
      prisma.loyaltyAccount.update({
        where: { id: account.id },
        data: { points: { increment: pointsEarned }, totalEarned: { increment: pointsEarned }, tier: newTier },
      }),
      prisma.loyaltyTransaction.create({
        data: {
          accountId:   account.id,
          type:        'EARNED',
          points:      pointsEarned,
          description: `Puntos por pedido ${order.orderNumber}`,
          orderId:     order.id,
        },
      }),
      // increment: una cuenta de mesa puede sumar varias rondas web (store.routes).
      prisma.order.update({ where: { id: order.id }, data: { pointsEarned: { increment: pointsEarned } } }),
    ])
    console.log(`Puntos agregados: ${pointsEarned} (rest ${restaurantId}, ${opts.userId ? `user ${opts.userId}` : `tel ${account.phone}`})`)
    return pointsEarned
  } catch (error) {
    console.error('Error al agregar puntos:', error)
  }
}

module.exports = { addLoyaltyPoints, getTier, genLoyaltyQr, normalizeLoyaltyPhone }
