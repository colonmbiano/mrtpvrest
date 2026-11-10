'use strict';

// G1/G6: los mapas son una copia transaccional efímera, nunca la fuente durable.
//
// C6 (9/nov/2026) — escala:
//   · Cada transacción carga solo el trabajo VIVO: tareas no terminadas (más las que la petición
//     nombra), sus ofertas vigentes o aceptadas (más la que la petición nombra), sus asignaciones,
//     sus órdenes y las órdenes nuevas con política de red que
//     aún no tienen tarea. Lo entregado/cancelado/fallido queda "archivado" en su tabla y ya no se
//     carga; Ops lo lee directo de la tabla, por páginas (archived()). Antes se cargaba TODO el
//     histórico y a las 5000 tareas la red respondía 503 para siempre.
//   · Los bloqueos FOR UPDATE de órdenes son solo de las órdenes cargadas, no de todas las de la red.
//   · La presencia GPS del repartidor ya no pasa por el motor: updatePresence() escribe solo la fila
//     propia, sin el bloqueo de la red, así 50 repartidores mandando ubicación no hacen fila.
//   · Se conserva UN bloqueo asesor para las decisiones del motor (ofertas, aceptar, recoger,
//     entregar, Ops): esas decisiones cruzan tareas (un repartidor con una sola asignación activa,
//     olas de ofertas entre repartidores), así que un bloqueo por tarea permitiría asignar dos
//     pedidos al mismo repartidor. Con la carga acotada a lo vivo, ese bloqueo dura milisegundos.
// Límites que quedan: 2000 tareas vivas y 5000 filas por catálogo (repartidores, comercios,
// afiliaciones); pasarlos es señal de partir la red por zona, no de quitar el bloqueo.
const { createHybridDispatchEngine, DispatchError } = require('./marketplace-dispatch');
const { createMultiStopEngine } = require('./marketplace-multistop');
const { runWithBypass } = require('../../../../packages/database/tenant-guard');
const json = value => JSON.parse(JSON.stringify(value));
const same = require('node:util').isDeepStrictEqual;
const error = (code, status = 409) => new DispatchError(code, code, status);
const PIN_ERRORS = new Set(['INVALID_PIN', 'INVALID_PICKUP_PIN', 'INVALID_DELIVERY_PIN', 'DELIVERY_PIN_LOCKED']);
const NETWORK_POLICIES = ['OWN_ONLY', 'SHARED_ONLY', 'OWN_THEN_SHARED'];
const TABLES = {
  tasks: 'marketplaceNetworkTask', offers: 'marketplaceNetworkOffer', assignments: 'marketplaceNetworkAssignment',
  couriers: 'marketplaceNetworkCourier', merchants: 'marketplaceNetworkMerchant', affiliations: 'marketplaceNetworkAffiliation',
};
const allowedOrder = o => o?.source === 'MARKETPLACE' && o.orderType === 'DELIVERY'
  && !['PENDING_PAYMENT', 'PENDING_MERCHANT', 'CANCELLED', 'REFUNDED'].includes(o.status);

const TERMINAL_TASKS = ['DELIVERED', 'CANCELLED', 'FAILED'];
// Lista positiva de estados vivos (TASK_STATUS sin los terminales) para usar el índice (status, id).
const LIVE_TASKS = ['WAITING_READY', 'OFFERING', 'ASSIGNED', 'PICKED_UP', 'REASSIGNING'];
// Estados de orden (enum OrderStatus) en los que una orden con política de red puede recibir su
// tarea: los mismos que acepta allowedOrder() salvo DELIVERED. Lista positiva para usar el índice.
const SEED_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PACKING', 'ON_THE_WAY', 'OPEN'];
// Ofertas que el motor necesita: las vigentes y la aceptada. Las expiradas/rechazadas son historia.
const LIVE_OFFERS = ['OFFERED', 'ACCEPTED'];
const MAX_LIVE = 2000;
const MAX_CATALOG = 5000;
const MAX_OFFERS = 50000;
const ID = /^[A-Za-z0-9_:-]{1,160}$/;
const ORDER_SELECT = { id: true, restaurantId: true, locationId: true, source: true, orderType: true, status: true,
  marketplacePipeline: true, location: { select: { id: true, latitude: true, longitude: true } } };

// Fila FIFO por cliente Prisma (ver run()). Si el turno no llega antes del plazo, responde
// NETWORK_BUSY (503) sin romper el orden de los demás.
const queues = new WeakMap();
function inProcessQueue(key, deadline, fn) {
  const previous = queues.get(key) || Promise.resolve();
  let release;
  const mine = new Promise(resolve => { release = resolve; });
  queues.set(key, previous.then(() => mine));
  let timer;
  const turn = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(error('NETWORK_BUSY', 503)), Math.max(0, deadline - Date.now()));
    previous.then(resolve);
  });
  return turn.then(() => { clearTimeout(timer); return fn(); })
    .finally(() => { clearTimeout(timer); previous.then(release); });
}

function createNetworkPersistence({ prisma, now = () => new Date() } = {}) {
  if (!prisma?.$transaction) throw error('NETWORK_STORE_UNAVAILABLE', 503);
  async function bounded(model, args = {}, max = MAX_CATALOG) {
    const rows = await model.findMany({ ...args, take: max + 1 });
    if (rows.length > max) throw error('NETWORK_CAPACITY_REVIEW_REQUIRED', 503);
    return rows;
  }
  const toMap = rows => new Map(rows.map(r => [r.id, json(r.payload)]));
  async function load(tx, { taskIds = [], offerIds = [] } = {}) {
    const store = {}, originals = {};
    // 1) Tareas vivas y las que la petición nombra (p. ej. consultar una ya entregada).
    const named = [...new Set(taskIds)].filter(id => typeof id === 'string' && ID.test(id)).slice(0, 20);
    const taskRows = await bounded(tx.marketplaceNetworkTask, { where: { OR: [{ status: { in: LIVE_TASKS } },
      ...(named.length ? [{ id: { in: named } }] : [])] } }, MAX_LIVE);
    const ids = taskRows.map(r => r.id);
    // 2) Órdenes nuevas con política de red explícita que aún no tienen tarea.
    const seeds = await bounded(tx.order, { where: { source: 'MARKETPLACE', orderType: 'DELIVERY',
      status: { in: SEED_ORDER_STATUSES }, marketplaceNetworkTask: { is: null },
      OR: NETWORK_POLICIES.map(policy => ({ marketplacePipeline: { is: { dispatch: { path: ['task', 'deliveryPolicy'], equals: policy } } } })) },
      select: { id: true } }, MAX_LIVE);
    const orderIds = [...new Set([...taskRows.map(r => r.orderId), ...seeds.map(o => o.id)])].sort();
    // El TPV no toma el bloqueo asesor de la red. Bloquear estas órdenes impide aceptar una oferta
    // mientras otro escritor cancela o cambia el estado de la orden. Solo las cargadas.
    if (orderIds.length) await tx.$queryRaw`SELECT o.id FROM orders o WHERE o.id = ANY(${orderIds}::text[]) ORDER BY o.id FOR UPDATE OF o`;
    const orders = orderIds.length ? await tx.order.findMany({ where: { id: { in: orderIds } }, select: ORDER_SELECT }) : [];
    originals.orders = new Map(orders.map(o => [o.id, json(o)]));
    store.orders = new Map(orders.map(o => [o.id, json(o)]));
    const namedOffers = [...new Set(offerIds)].filter(id => typeof id === 'string' && ID.test(id)).slice(0, 20);
    const live = {
      tasks: taskRows,
      // La oferta que la petición nombra se carga aunque ya no esté vigente, para responder 409/410
      // como antes en vez de "no encontrada".
      offers: ids.length ? await bounded(tx.marketplaceNetworkOffer, { where: { taskId: { in: ids },
        OR: [{ status: { in: LIVE_OFFERS } }, ...(namedOffers.length ? [{ id: { in: namedOffers } }] : [])] } }, MAX_OFFERS) : [],
      assignments: ids.length ? await bounded(tx.marketplaceNetworkAssignment, { where: { taskId: { in: ids } } }, MAX_OFFERS) : [],
      couriers: await bounded(tx.marketplaceNetworkCourier),
      merchants: await bounded(tx.marketplaceNetworkMerchant),
      affiliations: await bounded(tx.marketplaceNetworkAffiliation),
    };
    for (const key of Object.keys(TABLES)) { originals[key] = toMap(live[key]); store[key] = toMap(live[key]); }
    for (const key of ['multiTrips', 'multiOffers']) {
      const rows = await bounded(tx.marketplaceNetworkTrip, { where: { kind: key } });
      originals[key] = toMap(rows); store[key] = toMap(rows);
    }
    for (const courier of store.couriers.values()) {
      courier.isActive = courier.status === 'ACTIVE' && courier.verificationStatus === 'VERIFIED';
    }
    const presence = await bounded(tx.marketplaceNetworkPresence);
    originals.presence = new Map(presence.map(p => [p.courierId, json(p)]));
    for (const p of presence) {
      const courier = store.couriers.get(p.courierId);
      if (courier) { courier.presence = json(p.payload); courier.isOnline = p.payload.isOnline === true; }
    }
    // Solo importar decisiones de política ya existentes del servidor. Nunca
    // convertir órdenes MANUAL ni habilitar la red a un comercio por inferencia.
    const withTask = new Set(taskRows.map(r => r.orderId));
    for (const order of store.orders.values()) {
      if (withTask.has(order.id)) continue;
      const pipeline = order.marketplacePipeline;
      const seed = pipeline?.dispatch?.task;
      if (!seed || !NETWORK_POLICIES.includes(seed.deliveryPolicy) || !allowedOrder(order)
        || ['DELIVERED'].includes(order.status)) continue;
      if (seed.orderId !== order.id || seed.restaurantId !== order.restaurantId) throw error('NETWORK_PIPELINE_SCOPE', 503);
      const merchantId = seed.merchantId || order.locationId;
      if (!store.merchants.has(merchantId)) store.merchants.set(merchantId, {
        id: merchantId, restaurantId: order.restaurantId, locationId: order.locationId,
        deliveryPolicy: seed.deliveryPolicy, fallbackSeconds: seed.fallbackSeconds ?? 30, maxDistanceKm: seed.maxDistanceKm ?? 10,
      });
      if (!store.tasks.has(seed.id)) store.tasks.set(seed.id, { ...seed, merchantId,
        locationId: order.locationId, pickupLat: order.location?.latitude, pickupLng: order.location?.longitude,
        payoutAmount: seed.payoutAmount ?? Number(pipeline.settlement?.courierPayoutCents) / 100,
        currency: pipeline.currency || 'MXN', version: seed.version ?? 0,
        status: 'WAITING_READY', currentAssignment: null, currentAssignmentId: null,
      });
    }
    // Los cambios de estado del TPV prevalecen. No exponer ni ofertar una tarea
    // que por datos inconsistentes haya acabado ligada a reparto propio.
    for (const [id, task] of store.tasks) {
      const order = store.orders.get(task.orderId);
      if (!order || order.marketplacePipeline?.dispatch?.task?.deliveryPolicy === 'MANUAL') {
        throw error('NETWORK_MANUAL_BOUNDARY', 503);
      }
      // Tablas normalizadas autoritativas; los arrays de Ops son solo una vista.
      delete task.assignments; delete task.offers;
      // Las coordenadas se pueden completar después de recibir el pedido.
      if (task.status === 'WAITING_READY' && !task.offeringStartedAt) {
        task.pickupLat = order.location?.latitude ?? null;
        task.pickupLng = order.location?.longitude ?? null;
      }
      if (task.currentAssignmentId) task.currentAssignment = store.assignments.get(task.currentAssignmentId) || null;
      if (['CANCELLED', 'REFUNDED', 'DELIVERED'].includes(order.status) && !TERMINAL_TASKS.includes(task.status)) {
        task.status = order.status === 'DELIVERED' ? 'DELIVERED' : 'CANCELLED';
        // C8: entregado desde la caja también lleva fecha, para el corte diario del repartidor.
        if (order.status === 'DELIVERED' && !task.deliveredAt) task.deliveredAt = now().toISOString();
        if (task.currentAssignment?.status === 'ACTIVE') task.currentAssignment.status = order.status === 'DELIVERED' ? 'COMPLETED' : 'CANCELLED';
        for (const offer of store.offers.values()) if (offer.taskId===id && offer.status==='OFFERED') offer.status='EXPIRED';
      }
    }
    return { store, originals };
  }
  // Lo que se guarda de cada fila. La presencia y "en línea" de un repartidor son derivados de su
  // tabla de presencia (load los copia al objeto): no se guardan en su payload, así un GPS nuevo no
  // reescribe ni sube de versión a todos los repartidores en cada corrida.
  function persisted(key, value) {
    const copy = json(value);
    if (key === 'couriers') { delete copy.presence; delete copy.isOnline; }
    return copy;
  }
  function onlyStatusChanged(previous, value) {
    if (previous.status === value.status) return false;
    const { status: a, ...restPrevious } = previous; const { status: b, ...restValue } = value;
    return same(restPrevious, restValue);
  }
  function columns(key, v) {
    const common = { id: v.id, payload: json(v) };
    if (key === 'tasks') return { ...common, orderId: v.orderId, restaurantId: v.restaurantId,
      locationId: v.locationId, merchantId: v.merchantId, status: v.status, version: v.version || 0 };
    if (key === 'offers') return { ...common, taskId: v.taskId, restaurantId: v.restaurantId,
      courierId: v.courierId, status: v.status, expiresAt: new Date(v.expiresAt) };
    if (key === 'assignments') return { ...common, taskId: v.taskId, restaurantId: v.restaurantId,
      courierId: v.courierId, status: v.status };
    if (key === 'couriers') return { ...common, accountId: v.accountId, status: v.status,
      verificationStatus: v.verificationStatus, version: v.version || 0 };
    if (key === 'merchants') return { ...common, restaurantId: v.restaurantId, locationId: v.locationId };
    return { ...common, courierId: v.courierId, merchantId: v.merchantId, restaurantId: v.restaurantId, status: v.status };
  }
  async function save(tx, store, originals) {
    // La asignación agregada se mantiene en su tabla y en el pipeline, para que
    // incidentes y saldo existentes lean la misma autoridad sin cambiar MANUAL.
    for (const task of store.tasks.values()) {
      for (const a of task.currentAssignment ? [task.currentAssignment] : []) {
        store.assignments.set(a.id, { ...a, restaurantId: task.restaurantId, merchantId: task.merchantId });
      }
    }
    const inserts = { offers: [], assignments: [] };
    const expiries = new Map();
    for (const [key, table] of Object.entries(TABLES)) for (const [id, current] of store[key]) {
      const previous = originals[key].has(id) ? persisted(key, originals[key].get(id)) : undefined;
      const value = persisted(key, current);
      if (same(previous, value)) continue;
      if (['tasks', 'couriers'].includes(key) && previous && (value.version || 0) <= (previous.version || 0)) {
        value.version = (previous.version || 0) + 1;
        current.version = value.version;
      }
      // C6: una oferta que solo cambió de estado (p. ej. expiró en una ola) va en un UPDATE por lotes.
      if (key === 'offers' && previous && onlyStatusChanged(previous, value)) {
        if (!expiries.has(value.status)) expiries.set(value.status, []);
        expiries.get(value.status).push(id);
        continue;
      }
      const data = columns(key, value);
      if (previous) {
        const changed = await tx[table].updateMany({ where: { id,
          ...(['tasks', 'couriers'].includes(key) ? { version: previous.version || 0 } : {}) }, data });
        if (changed.count !== 1) throw error('NETWORK_CONFLICT');
      } else if (inserts[key]) inserts[key].push(data);
      else await tx[table].create({ data });
      if (key === 'tasks') {
        const order = originals.orders.get(value.orderId);
        if (!order || order.restaurantId !== value.restaurantId) throw error('NETWORK_ORDER_SCOPE', 503);
        const dispatch = order.marketplacePipeline?.dispatch;
        if (!dispatch || dispatch.task?.deliveryPolicy === 'MANUAL') throw error('NETWORK_MANUAL_BOUNDARY', 503);
        const changed = await tx.marketplaceOrderPipeline.updateMany({ where: { orderId: value.orderId,
          restaurantId: value.restaurantId, dispatch: { equals: dispatch } },
          data: { dispatch: json({ ...dispatch, task: value, assignment: value.currentAssignment || null }) } });
        if (changed.count !== 1) throw error('NETWORK_PIPELINE_CONFLICT');
      }
    }
    // Una ola de ofertas son decenas de filas nuevas: un INSERT por tabla, no uno por fila.
    for (const [key, rows] of Object.entries(inserts)) {
      for (let from = 0; from < rows.length; from += 1000) await tx[TABLES[key]].createMany({ data: rows.slice(from, from + 1000) });
    }
    // Cambios de solo estado en ofertas: el estado vive en la columna y en el payload (SQL acotado a
    // los ids de esta transacción; la red es de plataforma y corre sin scope de tenant).
    for (const [status, ids] of expiries) {
      for (let from = 0; from < ids.length; from += 1000) {
        const chunk = ids.slice(from, from + 1000);
        const changed = await tx.$executeRaw`UPDATE marketplace_network_offers SET status = ${status},
          payload = jsonb_set(payload, '{status}', to_jsonb(${status}::text)) WHERE id = ANY(${chunk}::text[])`;
        if (changed !== chunk.length) throw error('NETWORK_CONFLICT');
      }
    }
    for (const key of ['multiTrips', 'multiOffers']) for (const [id, value] of store[key]) {
      if (same(originals[key].get(id), json(value))) continue;
      await tx.marketplaceNetworkTrip.upsert({ where: { id }, create: { id, kind: key, payload: json(value) }, update: { payload: json(value) } });
    }
    for (const [id, order] of store.orders) {
      const before = originals.orders.get(id);
      if (order.status === before.status) continue;
      const changed = await tx.order.updateMany({ where: { id, restaurantId: order.restaurantId, status: before.status }, data: { status: order.status } });
      if (changed.count !== 1) throw error('NETWORK_ORDER_CONFLICT');
    }
    for (const courier of store.couriers.values()) {
      if (!courier.presence) continue;
      const p = { ...json(courier.presence), isOnline: courier.isOnline === true };
      if (same(originals.presence.get(courier.id)?.payload, p)) continue;
      const task = [...store.tasks.values()].find(t => t.currentAssignment?.courierId === courier.id && t.currentAssignment.status === 'ACTIVE');
      const data = { courierId: courier.id, assignmentId: task?.currentAssignmentId || null,
        taskId: task?.id || null, orderId: task?.orderId || null, restaurantId: task?.restaurantId || null,
        locationId: task?.locationId || null, lastSeenAt: new Date(p.lastSeenAt), payload: p };
      await tx.marketplaceNetworkPresence.upsert({ where: { courierId: courier.id }, create: data, update: data });
    }
  }
  // Dos niveles de espera, ninguno ocupa conexiones del pool mientras espera:
  //   1) En el proceso, una fila FIFO por cliente Prisma: una sola transacción de la red a la vez
  //      por instancia (las peticiones crean su propio adaptador, por eso la fila es del módulo).
  //   2) Entre instancias, pg_try_advisory_xact_lock: si otra instancia lo tiene, se revierte (suelta
  //      la conexión) y se reintenta con espera corta.
  // Con el bloqueo bloqueante de antes, 50 peticiones en fila tenían tomadas todas las conexiones.
  const BUSY = Symbol('NETWORK_LOCK_BUSY');
  const LOCK_DEADLINE_MS = 15000;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function run(work, options = {}) {
    const deadline = Date.now() + LOCK_DEADLINE_MS;
    return inProcessQueue(prisma, deadline, () => runLocked(work, options, deadline));
  }
  async function runLocked(work, options, deadline) {
    let result;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await runWithBypass(() => prisma.$transaction(async tx => {
          // Constante interna compartida con Ops: serializa las decisiones del motor (ver cabecera).
          const [lock] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(643216, 1) AS locked`;
          if (lock?.locked !== true) throw BUSY;
          const { store, originals } = await load(tx, options);
          const engine = createHybridDispatchEngine({ store, now });
          const multiStop = createMultiStopEngine({ store, now });
          let value, failure;
          try { value = await work({ tx, store, engine, multiStop }); }
          catch (e) {
            if (!PIN_ERRORS.has(e.code)) throw e;
            // Un PIN fallido también es un cambio durable. El error se devuelve
            // DESPUÉS de confirmar la transacción, sin revertir el contador.
            failure = e;
          }
          await save(tx, store, originals);
          return { value, failure };
        }, { isolationLevel: 'ReadCommitted', maxWait: 15000, timeout: 30000 }));
        break;
      } catch (e) {
        if (e !== BUSY) throw e;
        if (Date.now() >= deadline) throw error('NETWORK_BUSY', 503);
        await sleep(3 + Math.floor(Math.random() * 7 * Math.min(attempt + 1, 6)));
      }
    }
    if (result.failure) throw result.failure;
    return result.value;
  }
  async function tick(runtime) {
    const { store, engine } = runtime;
    for (const task of store.tasks.values()) {
      if (task.status === 'WAITING_READY' && !task.offeringStartedAt && store.orders.get(task.orderId)?.status === 'READY') {
        try { engine.startDispatch({ taskId: task.id }); }
        catch (e) {
          // Un pedido incompleto queda visible para Ops sin bloquear otros comercios.
          if (e.code !== 'INVALID_TASK') throw e;
        }
      }
    }
    engine.tick();
  }
  // Tareas terminadas, leídas directo de su tabla (no entran al motor). Para Ops: mismo filtro y
  // orden por id que la lista viva; `exclude` son las tareas vivas ya resueltas en memoria.
  async function archived(tx, { filters = {}, afterId = null, limit = 50, exclude = [] } = {}) {
    if (filters.status !== undefined && !TERMINAL_TASKS.includes(filters.status)) return [];
    const and = [{ status: filters.status !== undefined ? filters.status : { in: TERMINAL_TASKS } }];
    if (filters.merchantId !== undefined) and.push({ merchantId: filters.merchantId });
    if (filters.dispatchMode !== undefined) and.push({ payload: { path: ['dispatchMode'], equals: filters.dispatchMode } });
    if (afterId) and.push({ id: { gt: afterId } });
    if (exclude.length) and.push({ id: { notIn: exclude } });
    const rows = await tx.marketplaceNetworkTask.findMany({ where: { AND: and }, orderBy: { id: 'asc' }, take: limit });
    if (!rows.length) return [];
    const ids = rows.map(r => r.id);
    const [offers, assignments] = await Promise.all([
      tx.marketplaceNetworkOffer.findMany({ where: { taskId: { in: ids } } }),
      tx.marketplaceNetworkAssignment.findMany({ where: { taskId: { in: ids } } })]);
    return rows.map(r => ({ ...json(r.payload), assignments: assignments.filter(a => a.taskId === r.id).map(a => json(a.payload)),
      offers: offers.filter(o => o.taskId === r.id).map(o => json(o.payload)), auditTrail: r.payload?.auditTrail || [] }));
  }
  // Presencia GPS de UN repartidor, sin el bloqueo de la red: solo su fila. El enlace con la
  // asignación activa se calcula igual que en save(), desde la tarea que lo tiene asignado.
  async function updatePresence(courierId, input) {
    return runWithBypass(() => prisma.$transaction(async tx => {
      const courier = await tx.marketplaceNetworkCourier.findUnique({ where: { id: courierId } });
      if (!courier || courier.status !== 'ACTIVE' || courier.verificationStatus !== 'VERIFIED') throw error('COURIER_FORBIDDEN', 403);
      const previous = await tx.marketplaceNetworkPresence.findUnique({ where: { courierId } });
      const assignment = await tx.marketplaceNetworkAssignment.findFirst({ where: { courierId, status: 'ACTIVE' } });
      const task = assignment ? await tx.marketplaceNetworkTask.findFirst({ where: { id: assignment.taskId,
        status: { notIn: TERMINAL_TASKS } } }) : null;
      const linked = task && task.payload?.currentAssignmentId === assignment.id ? task : null;
      const at = now();
      const payload = { lat: input.isOnline ? input.lat : null, lng: input.isOnline ? input.lng : null,
        accuracy: input.accuracy ?? 10, lastSeenAt: at.toISOString(),
        acceptingShared: input.acceptingShared ?? previous?.payload?.acceptingShared ?? false, isOnline: input.isOnline === true };
      const data = { courierId, assignmentId: linked ? assignment.id : null, taskId: linked?.id || null,
        orderId: linked?.orderId || null, restaurantId: linked?.restaurantId || null, locationId: linked?.locationId || null,
        lastSeenAt: at, payload };
      await tx.marketplaceNetworkPresence.upsert({ where: { courierId }, create: data, update: data });
      const { isOnline, ...presence } = payload;
      return { ...presence, lastSeenAt: at };
    }, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 }));
  }
  const presenceStore = {
    async findForAssignment(scope) {
      if (!['courierId', 'assignmentId', 'taskId', 'orderId', 'restaurantId', 'locationId'].every(k => typeof scope[k] === 'string' && scope[k])) return null;
      return runWithBypass(async () => {
        const [row, task] = await Promise.all([
          prisma.marketplaceNetworkPresence.findUnique({ where: { courierId: scope.courierId } }),
          prisma.marketplaceNetworkTask.findFirst({ where: { id: scope.taskId, orderId: scope.orderId, restaurantId: scope.restaurantId, locationId: scope.locationId } }),
        ]);
        const a = task?.payload?.currentAssignment;
        if (!row || !task || task.status !== 'PICKED_UP' || a?.status !== 'ACTIVE' || a.id !== scope.assignmentId || a.courierId !== scope.courierId
          || Object.entries(scope).some(([k,v]) => row[k] !== v)) return null;
        return { ...row.payload, ...scope, lastSeenAt: row.lastSeenAt };
      });
    },
  };
  return { run, tick, presenceStore, archived, updatePresence };
}

function createNetworkOpsPorts(persistence) {
  const aggregate = (r, id) => {
    const task = r.store.tasks.get(id);
    return task ? { ...json(task), assignments: [...r.store.assignments.values()].filter(a => a.taskId === id),
      offers: [...r.store.offers.values()].filter(o => o.taskId === id), auditTrail: task.auditTrail || [] } : null;
  };
  return {
    unitOfWork: { run: work => persistence.run(work) },
    taskStore: {
      list: ({ filters, afterId, limit }) => persistence.run(async r => {
        await persistence.tick(r);
        const byId = (a, b) => (a.id < b.id ? -1 : 1);
        const live = [...r.store.tasks.values()].filter(t => (!afterId || t.id > afterId) && Object.entries(filters).every(([k,v]) => t[k] === v))
          .sort(byId).slice(0,limit).map(t => aggregate(r,t.id));
        // Lo terminado que no está en memoria se lee de su tabla (C6).
        const done = persistence.archived ? await persistence.archived(r.tx, { filters, afterId, limit, exclude: [...r.store.tasks.keys()] }) : [];
        return [...live, ...done].sort(byId).slice(0, limit);
      }),
      findById: (id, {tx}) => aggregate(tx, id),
      compareAndSwap: async (r, {id, expectedVersion, expectedStatus, record}) => {
        const old = r.store.tasks.get(id);
        if (!old || (old.version || 0) !== expectedVersion || old.status !== expectedStatus) return {count:0};
        const next=json(record);
        for (const assignment of next.assignments || []) r.store.assignments.set(assignment.id,assignment);
        for (const offer of next.offers || []) r.store.offers.set(offer.id,offer);
        delete next.assignments; delete next.offers;
        r.store.tasks.set(id,next); return {count:1};
      },
    },
    courierStore: {
      findById: (id, {tx}) => json(tx.store.couriers.get(id) || null),
      compareAndSwap: async (r, {id, expectedVersion, expectedStatus, expectedVerificationStatus, record}) => {
        const old=r.store.couriers.get(id);
        if (!old || (old.version||0)!==expectedVersion || old.status!==expectedStatus || old.verificationStatus!==expectedVerificationStatus) return {count:0};
        r.store.couriers.set(id,json(record)); return {count:1};
      },
    },
    dispatchEngine: { prepareReassignment: ({task}) => ({status: task.pickedUpAt ? 'REASSIGNING' : 'OFFERING'}) },
  };
}

function createNetworkCourierPorts(persistence) {
  const find = (key, predicate) => persistence.run(r => json([...r.store[key].values()].find(predicate) || null));
  return {
    courierStore: {
      findById: id => find('couriers', c => c.id === id),
      findByAccountId: id => find('couriers', c => c.accountId === id),
      create: record => persistence.run(r => {
        if ([...r.store.couriers.values()].some(c => c.accountId === record.accountId)) throw Object.assign(error('DUPLICATE'),{code:'DUPLICATE'});
        // Alta no concede participación en la red hasta aprobación de Ops.
        r.store.couriers.set(record.id, { ...json(record), version: 0, isShared: false, isOnline: false, isActive: false });
      }),
      update: (id, fields) => persistence.run(r => {
        const c=r.store.couriers.get(id); if (!c) throw error('COURIER_NOT_FOUND',404);
        Object.assign(c,json(fields)); return json(c);
      }),
    },
    affiliationStore: {
      findByPair: (courierId,merchantId) => find('affiliations', a => a.courierId===courierId && a.merchantId===merchantId),
      listByCourier: courierId => persistence.run(r => json([...r.store.affiliations.values()].filter(a=>a.courierId===courierId))),
      create: record => persistence.run(r => {
        if ([...r.store.affiliations.values()].some(a=>a.courierId===record.courierId && a.merchantId===record.merchantId)) throw error('DUPLICATE');
        const m=r.store.merchants.get(record.merchantId); if (!m) throw error('MERCHANT_NOT_FOUND',404);
        r.store.affiliations.set(record.id,{...json(record), restaurantId:m.restaurantId, locationId:m.locationId});
      }),
      update: (id,fields) => persistence.run(r=> { const a=r.store.affiliations.get(id); if(!a) throw error('AFFILIATION_NOT_FOUND',404); Object.assign(a,json(fields));return json(a); }),
    },
    merchantDirectory: { findById: id => find('merchants',m=>m.id===id) },
    merchantAccess: { canManage: (actor,id) => persistence.run(r => {
      const m=r.store.merchants.get(id); return !!m && actor.isActive===true && actor.isDevice!==true
        && (actor.roles?.includes('SUPER_ADMIN') || actor.roles?.some(role=>['OWNER','ADMIN','MERCHANT_OWNER'].includes(role))
          && actor.restaurantId===m.restaurantId && (!actor.locationId || actor.locationId===m.locationId));
    }) },
  };
}

function createNetworkActorResolver({prisma, now=()=>new Date(), env=process.env}) {
  return async req => {
    if (req.user) {
      if (req.user.isActive!==true || req.user.isDevice) throw error('UNAUTHENTICATED',401);
      return {...req.user,accountId:req.user.id,roles:req.user.roles || [req.user.role]};
    }
    if (req.headers?.authorization) {
      // APK: Bearer de courier (clave dedicada). Si no es un token de courier, cae al token de personal.
      const courier = await require('./marketplace-courier-identity').createCourierActorResolver({ now })(req);
      if (courier) return courier;
      return require('./marketplace-staff-identity').createStaffActorResolver()(req);
    }
    const name=env.MARKETPLACE_ISOLATED==='true'?'mrtpv_market_staging':'__Host-mrtpv_market';
    const value=(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
    if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
    if (!['GET','HEAD'].includes(req.method) && (!env.MARKETPLACE_IDENTITY_ORIGIN || req.headers.origin!==env.MARKETPLACE_IDENTITY_ORIGIN)) throw error('ORIGIN_FORBIDDEN',403);
    const hash=require('node:crypto').createHash('sha256').update(value).digest('hex');
    const session=await prisma.marketplaceSession.findUnique({where:{tokenHash:hash},include:{account:{include:{applications:true}}}});
    if (!session || session.revokedAt || new Date(session.expiresAt)<=now() || session.account.disabledAt || !session.account.emailVerifiedAt) throw error('UNAUTHENTICATED',401);
    const roles=session.account.applications.filter(a=>a.status==='APPROVED').map(a=>a.role);
    return {id:session.accountId,accountId:session.accountId,roles,isActive:true,isDevice:false};
  };
}

module.exports = { createNetworkPersistence, createNetworkOpsPorts, createNetworkCourierPorts, createNetworkActorResolver, NETWORK_POLICIES };
