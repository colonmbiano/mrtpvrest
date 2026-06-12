// src/lib/socket-guard.js — defensas del servidor Socket.io.
//
// 1. Tope de conexiones simultáneas por IP (anti-abuso / leak de sockets).
// 2. Rate limit de eventos entrantes por socket (los join:* eran ilimitados;
//    el rate limit de Express no aplica a Socket.io).
// 3. Sweep periódico que desconecta sockets cuyo principal (User/Employee/
//    Device) fue desactivado: REST revalida isActive en cada request, pero un
//    socket vivía con los permisos del handshake indefinidamente.
// 4. Validación de pertenencia para joins de location y order: el guard del
//    handshake ya ata el socket a su restaurante, pero los ids del payload
//    no se verificaban contra ese restaurante.
const { prisma, runWithBypass } = require('@mrtpvrest/database')

const MAX_CONN_PER_IP = Number(process.env.SOCKET_MAX_CONN_PER_IP || 40)
const EVENTS_PER_MIN  = Number(process.env.SOCKET_EVENTS_PER_MIN || 60)
const REVALIDATE_MS   = Number(process.env.SOCKET_REVALIDATE_MS || 5 * 60 * 1000)

// ── 1. Tope de conexiones por IP ──────────────────────────────────────────
const ipConnections = new Map() // ip → conexiones vivas

function attachConnectionCap(io) {
  io.use((socket, next) => {
    const ip = socket.handshake.address || 'unknown'
    if ((ipConnections.get(ip) || 0) >= MAX_CONN_PER_IP) {
      console.warn(`[socket-guard] tope de conexiones por IP: ${ip}`)
      return next(new Error('Demasiadas conexiones'))
    }
    next()
  })
  io.on('connection', (socket) => {
    const ip = socket.handshake.address || 'unknown'
    ipConnections.set(ip, (ipConnections.get(ip) || 0) + 1)
    socket.on('disconnect', () => {
      const left = (ipConnections.get(ip) || 1) - 1
      if (left <= 0) ipConnections.delete(ip)
      else ipConnections.set(ip, left)
    })
  })
}

// ── 2. Rate limit de eventos por socket ───────────────────────────────────
// Ventana fija de 60s. Devuelve false cuando el socket excede el cupo; el
// handler simplemente ignora el evento (no desconectamos: un TPV con un bug
// de reintentos no debe perder la conexión de notificaciones por esto).
function createEventLimiter(socketId, limit = EVENTS_PER_MIN) {
  let windowStart = Date.now()
  let count = 0
  return function allowEvent() {
    const now = Date.now()
    if (now - windowStart > 60_000) { windowStart = now; count = 0 }
    count += 1
    if (count === limit + 1) {
      console.warn(`[socket-guard] rate limit de eventos: socket ${socketId}`)
    }
    return count <= limit
  }
}

// ── 3. Revalidación periódica del principal ───────────────────────────────
// Espeja la resolución de auth.middleware: Device (payload.isDevice) → User →
// Employee. Errores de BD no tumban sockets sanos (return true).
async function isPrincipalActive(payload) {
  const id = payload?.userId || payload?.id
  if (!id) return true // socket anónimo: el guard del handshake ya lo dejó sin rooms
  try {
    if (payload.isDevice) {
      const d = await runWithBypass(() => prisma.device.findUnique({
        where: { id }, select: { isActive: true },
      }))
      return !!d?.isActive
    }
    const u = await runWithBypass(() => prisma.user.findUnique({
      where: { id }, select: { isActive: true },
    }))
    if (u) return !!u.isActive
    const e = await runWithBypass(() => prisma.employee.findUnique({
      where: { id }, select: { isActive: true },
    }))
    if (e) return !!e.isActive
    return false // principal borrado → fuera
  } catch (err) {
    console.error('[socket-guard] revalidación falló:', err.message)
    return true
  }
}

function startRevalidationSweep(io, intervalMs = REVALIDATE_MS) {
  const timer = setInterval(async () => {
    let sockets
    try { sockets = await io.fetchSockets() } catch { return }
    for (const socket of sockets) {
      const user = socket.data?.user
      if (!user) continue
      // Secuencial a propósito: pocas conexiones por instancia y no queremos
      // ráfagas de queries cada sweep.
      const active = await isPrincipalActive(user)
      if (!active) {
        console.warn(`[socket-guard] principal inactivo, desconectando: ${user.userId || user.id}`)
        socket.disconnect(true)
      }
    }
  }, intervalMs)
  timer.unref?.()
  return timer
}

// ── 4. Validación de pertenencia en joins ─────────────────────────────────
function isSaneId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 64
}

async function locationBelongsToRestaurant(locationId, restaurantId) {
  if (!isSaneId(locationId) || !restaurantId) return false
  try {
    const loc = await prisma.location.findFirst({
      where: { id: locationId, restaurantId },
      select: { id: true },
    })
    return !!loc
  } catch { return false }
}

async function orderBelongsToRestaurant(orderId, restaurantId) {
  if (!isSaneId(orderId) || !restaurantId) return false
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { id: true },
    })
    return !!order
  } catch { return false }
}

module.exports = {
  attachConnectionCap,
  createEventLimiter,
  startRevalidationSweep,
  isPrincipalActive,
  locationBelongsToRestaurant,
  orderBelongsToRestaurant,
}
