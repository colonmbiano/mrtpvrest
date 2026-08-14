// ─────────────────────────────────────────────────────────────────────────────
// staleTableOrders.job.js — Libera mesas con pedido de QR nunca aceptado.
//
// Un pedido que entra por el QR de mesa nace en PENDING y ocupa la mesa (ver
// store.routes). Si caja nunca lo acepta ni lo cancela, la mesa queda trabada:
// el mapa de piso la pinta ocupada y el TPV se niega a abrir una cuenta nueva
// encima. Este barrido cancela esos pedidos rezagados y libera su mesa.
//
// Es deliberadamente conservador — cancelar una cuenta viva sería peor que la
// mesa trabada:
//   · Solo PENDING. Una cuenta que caja ya aceptó pasa a CONFIRMED y no se toca.
//   · Nunca pagadas (paymentStatus != PAID): si el comensal pagó en línea, la
//     orden es intocable pase el tiempo que pase.
//   · Solo canales remotos (ONLINE/KIOSK/WHATSAPP). Las cuentas abiertas desde
//     el TPV nacen en OPEN, así que nunca entran aquí.
//   · createdAt Y updatedAt más viejos que el TTL: cualquier actividad sobre la
//     cuenta (agregar una ronda, editar) reinicia el reloj.
//   · La cancelación es un updateMany condicional sobre el estado: si caja
//     acepta el pedido en el mismo instante, gana caja y el barrido no hace nada.
//
// TTL en dos niveles, porque no todos los negocios rotan mesa igual:
//   · Por restaurante: RestaurantConfig.tablePendingTtlMin (lo edita el dueño
//     desde el panel). 0 = barrido apagado para ese restaurante.
//   · Global de la instancia: env TABLE_PENDING_TTL_MIN, default 180 min (3 h).
//     Aplica a los restaurantes que no configuraron el suyo (columna null).
//     0 o negativo apaga el job entero.
//
// Corre sin contexto de tenant a propósito (barre todos los restaurantes): el
// tenant-guard hace passthrough cuando no hay contexto, ver docs/TENANCY.md.
// ─────────────────────────────────────────────────────────────────────────────

const cron   = require('node-cron')
const prisma = require('@mrtpvrest/database').prisma
const log    = require('../lib/logger')('staleTableOrders')
const { OPEN_TABLE_STATUSES } = require('../lib/table-status')

// Canales que crean pedidos de mesa en PENDING. El TPV no está: sus cuentas
// dine-in nacen en OPEN.
const REMOTE_SOURCES = ['ONLINE', 'KIOSK', 'WHATSAPP']

const DEFAULT_TTL_MIN = 180

// Tope por corrida: si algo se acumuló (job apagado un tiempo, TTL recién
// bajado), preferimos varias corridas cortas a una que muerda la BD 20 min.
const BATCH_LIMIT = 200

// TTL global de la instancia — el que aplica a los restaurantes sin ajuste
// propio, y el interruptor maestro del job.
function ttlMinutes() {
  const raw = Number(process.env.TABLE_PENDING_TTL_MIN)
  return Number.isFinite(raw) ? raw : DEFAULT_TTL_MIN
}

// TTL por restaurante (RestaurantConfig.tablePendingTtlMin). Devuelve:
//   · byRestaurant: Map restaurantId → minutos (>0), los que sí barremos
//   · disabled: ids con el barrido apagado a mano (0)
//   · minTtl: el TTL más corto en juego, para no traer de la BD más de lo justo
async function loadTenantTtls(defaultTtl) {
  const result = { byRestaurant: new Map(), disabled: [], minTtl: defaultTtl }
  let rows = []
  try {
    rows = await prisma.restaurantConfig.findMany({
      where: { tablePendingTtlMin: { not: null } },
      select: { restaurantId: true, tablePendingTtlMin: true },
    })
  } catch (e) {
    // Sin la columna (migración no aplicada aún) el job sigue con el global.
    log.error('staleTableOrders.tenantTtl.failed', { err: e && e.message })
    return result
  }
  for (const row of rows) {
    const ttl = Number(row.tablePendingTtlMin)
    if (!Number.isFinite(ttl) || ttl <= 0) { result.disabled.push(row.restaurantId); continue }
    result.byRestaurant.set(row.restaurantId, ttl)
    if (ttl < result.minTtl) result.minTtl = ttl
  }
  return result
}

// Nota visible en el ticket/panel para que nadie se pregunte quién canceló.
function cancelNote(notes, ttl) {
  const stamp = `⏱ Cancelado automáticamente: pedido de mesa sin aceptar por más de ${ttl} min.`
  return [notes?.trim(), stamp].filter(Boolean).join(' — ')
}

async function runStaleTableOrdersJob(io = null) {
  const defaultTtl = ttlMinutes()
  const result = { cancelled: 0, released: 0, skipped: 0 }
  if (defaultTtl <= 0) return result

  const { byRestaurant, disabled, minTtl } = await loadTenantTtls(defaultTtl)

  // Traemos candidatos con el TTL MÁS CORTO en juego y afinamos por restaurante
  // en el bucle: una sola query cubre a todos los tenants sin barrer de más.
  const now = Date.now()
  const widestCutoff = new Date(now - minTtl * 60000)

  let stale = []
  try {
    stale = await prisma.order.findMany({
      where: {
        status:        'PENDING',
        orderType:     'DINE_IN',
        tableId:       { not: null },
        paymentStatus: { not: 'PAID' },
        source:        { in: REMOTE_SOURCES },
        createdAt:     { lt: widestCutoff },
        updatedAt:     { lt: widestCutoff },
        // Restaurantes que apagaron el barrido a mano (tablePendingTtlMin = 0).
        ...(disabled.length ? { restaurantId: { notIn: disabled } } : {}),
      },
      select: {
        id: true, orderNumber: true, notes: true, updatedAt: true,
        restaurantId: true, locationId: true, tableId: true,
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_LIMIT,
    })
  } catch (e) {
    log.error('staleTableOrders.query.failed', { err: e && e.message })
    return result
  }

  for (const order of stale) {
    // TTL efectivo del restaurante: el suyo si lo configuró, el global si no.
    const ttl = byRestaurant.get(order.restaurantId) ?? defaultTtl
    if (order.updatedAt.getTime() > now - ttl * 60000) continue // aún no vence
    try {
      // Condicional en el WHERE: si caja aceptó (o cobró) entre el SELECT y este
      // UPDATE, count === 0 y no tocamos nada más — ni el stock ni la mesa.
      const updated = await prisma.order.updateMany({
        where: { id: order.id, status: 'PENDING', paymentStatus: { not: 'PAID' } },
        data:  { status: 'CANCELLED', notes: cancelNote(order.notes, ttl) },
      })
      if (updated.count === 0) {
        result.skipped++
        continue
      }
      result.cancelled++

      // Reponer stock por el mismo camino que la cancelación manual (regla de
      // CLAUDE.md). En pedidos web suele ser no-op: no descontaron inventario.
      await require('../routes/orders.routes')
        .restoreInventoryForCancelledOrder(prisma, order.id)
        .catch((e) => log.error('staleTableOrders.restoreInventory.failed', {
          orderId: order.id, err: e && e.message,
        }))

      // Liberar la mesa solo si no quedó otra cuenta viva encima (el comensal
      // pudo pedir dos veces, o el mesero abrió cuenta sobre la misma mesa).
      const otherTab = await prisma.order.findFirst({
        where: {
          tableId:       order.tableId,
          status:        { in: OPEN_TABLE_STATUSES },
          paymentStatus: { not: 'PAID' },
        },
        select: { id: true },
      })
      if (!otherTab) {
        // Idempotente: si la mesa se borró o ya estaba libre, no debe tumbar
        // el barrido del resto de pedidos.
        await prisma.table
          .update({ where: { id: order.tableId }, data: { status: 'AVAILABLE' } })
          .then(() => { result.released++ })
          .catch((e) => log.error('staleTableOrders.releaseTable.failed', {
            tableId: order.tableId, err: e && e.message,
          }))
      }

      // Refresco en vivo del TPV/KDS (mapa de piso y panel de pedidos web).
      if (io) {
        const payload = {
          id: order.id,
          orderNumber: order.orderNumber,
          status: 'CANCELLED',
          orderType: 'DINE_IN',
          tableId: order.tableId,
        }
        io.to(`restaurant:${order.restaurantId}:kitchen`).emit('order:updated', payload)
        if (order.locationId) {
          io.to(`restaurant:${order.restaurantId}:location:${order.locationId}:admins`)
            .emit('order:updated', payload)
          io.to(`restaurant:${order.restaurantId}:location:${order.locationId}:kitchen`)
            .emit('order:updated', payload)
        }
      }

      log.info('staleTableOrders.cancelled', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        restaurantId: order.restaurantId,
        tableId: order.tableId,
        ttlMin: ttl,
      })
    } catch (e) {
      log.error('staleTableOrders.order.failed', { orderId: order.id, err: e && e.message })
    }
  }

  if (result.cancelled || result.skipped) {
    log.info('staleTableOrders.done', { ...result, defaultTtlMin: defaultTtl, tenantOverrides: byRestaurant.size })
  }
  return result
}

function startStaleTableOrdersJob(io = null) {
  const ttl = ttlMinutes()
  if (ttl <= 0) {
    log.info('staleTableOrders.disabled', { msg: 'TABLE_PENDING_TTL_MIN <= 0' })
    return null
  }
  const task = cron.schedule('*/15 * * * *', () => runStaleTableOrdersJob(io))
  log.info('staleTableOrders.cron', { defaultTtlMin: ttl, msg: 'registrado — cada 15 min' })
  return task
}

module.exports = { startStaleTableOrdersJob, runStaleTableOrdersJob }
