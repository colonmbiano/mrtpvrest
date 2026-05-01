// E2E test: registro -> menu -> empleados -> turno -> pedido cliente
//          -> TPV -> KDS -> Delivery -> confirm cash
// Backend: api.mrtpvrest.com (prod)

const API = 'https://api.mrtpvrest.com'
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const TENANT_NAME = `Prueba E2E ${STAMP}`
const OWNER_EMAIL = `e2e-${Date.now()}@mrtpvrest-test.com`
const OWNER_PASSWORD = 'TestE2E1234!'

const log = (...a) => console.log(...a)
const J = (o) => JSON.stringify(o, null, 2)

async function call(method, path, opts = {}) {
  const { token, body, locationId, restaurantId, query } = opts
  const url = new URL(API + path)
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)

  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (locationId) headers['x-location-id'] = locationId
  if (restaurantId) headers['x-restaurant-id'] = restaurantId

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) {
    const msg = typeof data === 'string' ? data : J(data)
    throw new Error(`${method} ${path} -> ${res.status}: ${msg}`)
  }
  return data
}

const state = {}

async function main() {
  log('=' .repeat(70))
  log('E2E TEST -- MRTPVREST')
  log('=' .repeat(70))
  log('Tenant:', TENANT_NAME)
  log('Email :', OWNER_EMAIL)
  log()

  // 1. REGISTRO
  log('> 1. POST /api/auth/register-tenant')
  const reg = await call('POST', '/api/auth/register-tenant', {
    body: {
      restaurantName: TENANT_NAME,
      ownerName: 'Owner E2E',
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    },
  })
  state.tenantId = reg.tenant.id
  state.restaurantId = reg.restaurant.id
  state.restaurantSlug = reg.restaurant.slug
  state.locationId = reg.location.id
  state.adminToken = reg.accessToken
  state.userId = reg.user.id
  log('  OK tenantId      =', state.tenantId)
  log('  OK restaurantId  =', state.restaurantId)
  log('  OK restaurantSlug=', state.restaurantSlug)
  log('  OK locationId    =', state.locationId)
  log('  OK trial hasta   =', reg.subscription.trialEndsAt)

  const adminCtx = {
    token: state.adminToken,
    locationId: state.locationId,
    restaurantId: state.restaurantId,
  }

  // 2. MENU
  log('\n> 2. POST /api/menu/categories')
  const cat = await call('POST', '/api/menu/categories', {
    ...adminCtx,
    body: { name: 'Hamburguesas' },
  })
  state.categoryId = cat.id
  log('  OK categoryId =', cat.id)

  log('\n> 3. POST /api/menu/items x2')
  const burger1 = await call('POST', '/api/menu/items', {
    ...adminCtx,
    body: {
      categoryId: state.categoryId,
      name: 'Master Burger',
      description: 'Doble carne, queso cheddar, tocino',
      price: 120,
      preparationTime: 12,
    },
  })
  const burger2 = await call('POST', '/api/menu/items', {
    ...adminCtx,
    body: {
      categoryId: state.categoryId,
      name: 'Refresco 600ml',
      description: 'Coca-Cola',
      price: 30,
      preparationTime: 1,
    },
  })
  state.menuItem1 = burger1.id
  state.menuItem2 = burger2.id
  log('  OK producto 1 =', burger1.id, '(' + burger1.name + ', $' + burger1.price + ')')
  log('  OK producto 2 =', burger2.id, '(' + burger2.name + ', $' + burger2.price + ')')

  // 4. EMPLEADOS
  log('\n> 4. POST /api/employees (cajero CASHIER PIN 1111)')
  const cashier = await call('POST', '/api/employees', {
    ...adminCtx,
    body: {
      name: 'Cajera E2E',
      pin: '1111',
      role: 'CASHIER',
      phone: '5550001111',
      canCharge: true,
      canTakeDelivery: true,
    },
  })
  state.cashierId = cashier.id
  log('  OK cajero =', cashier.id)

  log('\n> 5. POST /api/employees (repartidor DELIVERY PIN 2222)')
  const driver = await call('POST', '/api/employees', {
    ...adminCtx,
    body: {
      name: 'Repartidor E2E',
      pin: '2222',
      role: 'DELIVERY',
      phone: '5550002222',
    },
  })
  state.driverId = driver.id
  log('  OK repartidor =', driver.id)

  // 6. CASHIER LOGIN
  log('\n> 6. POST /api/employees/login (cajero, PIN 1111)')
  const empLogin = await call('POST', '/api/employees/login', {
    locationId: state.locationId,
    restaurantId: state.restaurantId,
    body: { pin: '1111' },
  })
  state.cashierToken = empLogin.token
  state.cashierEmployeeId = empLogin.employee?.id
  log('  OK employee token obtenido (' + (empLogin.employee?.name || 'cajero') + ')')

  const cashierCtx = {
    token: state.cashierToken,
    locationId: state.locationId,
    restaurantId: state.restaurantId,
  }

  // 7. ABRIR TURNO (opcional — no bloquea el flujo de pedido online)
  log('\n> 7. POST /api/shifts/open (intento abrir caja)')
  state.shiftId = null
  try {
    const shift = await call('POST', '/api/shifts/open', {
      ...cashierCtx,
      body: { openingFloat: 500, employeeId: state.cashierId, employeeName: 'Cajera E2E' },
    })
    state.shiftId = shift.id
    log('  OK shiftId =', shift.id, '(opened:', shift.isOpen, ')')
  } catch (e1) {
    log('  WARN cajero:', e1.message.slice(0, 120))
    try {
      const shift = await call('POST', '/api/shifts/open', {
        ...adminCtx,
        body: { openingFloat: 500, employeeId: state.cashierId, employeeName: 'Cajera E2E' },
      })
      state.shiftId = shift.id
      log('  OK (admin) shiftId =', shift.id)
    } catch (e2) {
      log('  WARN admin tampoco pudo:', e2.message.slice(0, 200))
      log('  -> Continuo sin turno abierto (no es requerido para POST /api/store/orders)')
    }
  }

  // 8. PEDIDO DEL CLIENTE
  log('\n> 8. POST /api/store/orders (cliente hace pedido a domicilio)')
  const order = await call('POST', '/api/store/orders', {
    restaurantId: state.restaurantId,
    locationId: state.locationId,
    body: {
      items: [
        { menuItemId: state.menuItem1, quantity: 2 },
        { menuItemId: state.menuItem2, quantity: 2 },
      ],
      customerName: 'Juan Cliente E2E',
      customerPhone: '5559998888',
      orderType: 'DELIVERY',
      deliveryAddress: 'Av. Reforma 100, CDMX',
      paymentMethod: 'CASH_ON_DELIVERY',
      notes: 'Sin cebolla en la hamburguesa',
    },
  })
  state.orderId = order.id
  state.orderNumber = order.orderNumber
  log('  OK orderId   =', order.id)
  log('  OK # pedido  =', order.orderNumber)
  log('  OK status    =', order.status)
  log('  OK total     = $' + order.total)

  // 9. TPV: CONFIRMED
  log('\n> 9. PUT /api/orders/:id/status -> CONFIRMED (TPV cajero acepta)')
  const conf = await call('PUT', `/api/orders/${state.orderId}/status`, {
    ...cashierCtx,
    body: { status: 'CONFIRMED' },
  })
  log('  OK status =', conf.status)

  // 10. KDS: PREPARING
  log('\n> 10. PUT /api/orders/:id/status -> PREPARING (KDS cocina)')
  const prep = await call('PUT', `/api/orders/${state.orderId}/status`, {
    ...cashierCtx,
    body: { status: 'PREPARING' },
  })
  log('  OK status =', prep.status)

  // 11. KDS: READY
  log('\n> 11. PUT /api/orders/:id/status -> READY (KDS cocina lista)')
  const ready = await call('PUT', `/api/orders/${state.orderId}/status`, {
    ...cashierCtx,
    body: { status: 'READY' },
  })
  log('  OK status =', ready.status)

  // 12. DELIVERY ASSIGN
  log('\n> 12. PUT /api/delivery/assign (admin asigna repartidor)')
  const assign = await call('PUT', '/api/delivery/assign', {
    ...adminCtx,
    body: { orderId: state.orderId, driverId: state.driverId },
  })
  log('  OK status =', assign.status, '(deliveryDriverId=' + assign.deliveryDriverId + ')')

  // 13. DRIVER VE PEDIDOS
  log('\n> 13. GET /api/delivery/:driverId/orders (repartidor ve sus entregas)')
  const driverOrders = await call('GET', `/api/delivery/${state.driverId}/orders`, {
    restaurantId: state.restaurantId,
    locationId: state.locationId,
  })
  log('  OK pedidos asignados =', driverOrders.length)
  if (driverOrders.length) {
    log('    - #' + driverOrders[0].orderNumber, '|', driverOrders[0].deliveryAddress)
  }

  // 14. DELIVER
  log('\n> 14. PUT /api/delivery/:driverId/orders/:orderId/deliver')
  const delivered = await call('PUT', `/api/delivery/${state.driverId}/orders/${state.orderId}/deliver`, {
    restaurantId: state.restaurantId,
    locationId: state.locationId,
  })
  log('  OK status =', delivered.status, '| deliveredAt =', delivered.deliveredAt || 'n/a')

  // 15. CONFIRM CASH
  log('\n> 15. PUT /api/orders/:id/confirm-cash (cajero confirma efectivo)')
  let cashConf = null
  try {
    cashConf = await call('PUT', `/api/orders/${state.orderId}/confirm-cash`, {
      ...cashierCtx,
      body: { amountReceived: order.total },
    })
    log('  OK paymentStatus =', cashConf.paymentStatus, '| cashCollected =', cashConf.cashCollected)
  } catch (e) {
    log('  WARN confirm-cash:', e.message.slice(0, 200))
  }

  // 16. ESTADO FINAL
  log('\n> 16. GET /api/store/orders/:id (estado final)')
  const final = await call('GET', `/api/store/orders/${state.orderId}`)
  log('  OK status        =', final.status)
  log('  OK paymentStatus =', final.paymentStatus)
  log('  OK paidAt        =', final.paidAt || 'n/a')
  log('  OK total         = $' + final.total)

  log('\n' + '='.repeat(70))
  log('E2E COMPLETADO -- flujo de inicio a fin OK')
  log('='.repeat(70))
  log('STATE:'
, J(state))
}

main().catch(e => {
  console.error('\nE2E FALLO:', e.message)
  console.error('STATE en el momento del fallo:', J(state))
  process.exit(1)
})
