'use strict';

// G1/G6: los mapas son una copia transaccional efímera, nunca la fuente durable.
// Un bloqueo asesor de PostgreSQL serializa TODOS los escritores de red (incluido
// Ops). Primera versión conservadora: máximo 5000 filas por colección; escalar
// mediante partición de colas antes de superar ese límite, no quitar el bloqueo.
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

function createNetworkPersistence({ prisma, now = () => new Date() } = {}) {
  if (!prisma?.$transaction) throw error('NETWORK_STORE_UNAVAILABLE', 503);
  async function bounded(model, args = {}) {
    const rows = await model.findMany({ ...args, take: 5001 });
    if (rows.length > 5000) throw error('NETWORK_CAPACITY_REVIEW_REQUIRED', 503);
    return rows;
  }
  async function load(tx) {
    // El TPV no toma el bloqueo asesor de la red. Estas filas impiden aceptar
    // una oferta mientras otro escritor cancela/cambia el estado de su orden.
    await tx.$queryRawUnsafe(`SELECT o.id FROM orders o JOIN marketplace_order_pipelines p ON p."orderId"=o.id
      WHERE p.dispatch->'task'->>'deliveryPolicy' IN ('OWN_ONLY','SHARED_ONLY','OWN_THEN_SHARED')
      ORDER BY o.id LIMIT 5001 FOR UPDATE OF o`);
    const store = {}, originals = {};
    for (const [key, table] of Object.entries(TABLES)) {
      const rows = await bounded(tx[table]);
      originals[key] = new Map(rows.map(r => [r.id, json(r.payload)]));
      store[key] = new Map(rows.map(r => [r.id, json(r.payload)]));
    }
    for (const key of ['multiTrips', 'multiOffers']) {
      const rows = await bounded(tx.marketplaceNetworkTrip, { where: { kind: key } });
      originals[key] = new Map(rows.map(r => [r.id, json(r.payload)]));
      store[key] = new Map(rows.map(r => [r.id, json(r.payload)]));
    }
    const orders = await bounded(tx.order, { where: { source: 'MARKETPLACE', orderType: 'DELIVERY',
      OR: [{ marketplaceNetworkTask: { isNot: null } }, ...NETWORK_POLICIES.map(policy => ({
        marketplacePipeline: { is: { dispatch: { path: ['task','deliveryPolicy'], equals: policy } } },
      }))] }, select: { id: true, restaurantId: true, locationId: true,
      source: true, orderType: true, status: true, marketplacePipeline: true,
      location: { select: { id: true, latitude: true, longitude: true } } } });
    originals.orders = new Map(orders.map(o => [o.id, json(o)]));
    store.orders = new Map(orders.map(o => [o.id, json(o)]));
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
    for (const order of store.orders.values()) {
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
      if (['CANCELLED', 'REFUNDED', 'DELIVERED'].includes(order.status)) {
        task.status = order.status === 'DELIVERED' ? 'DELIVERED' : 'CANCELLED';
        if (task.currentAssignment?.status === 'ACTIVE') task.currentAssignment.status = order.status === 'DELIVERED' ? 'COMPLETED' : 'CANCELLED';
        for (const offer of store.offers.values()) if (offer.taskId===id && offer.status==='OFFERED') offer.status='EXPIRED';
      }
    }
    return { store, originals };
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
    for (const [key, table] of Object.entries(TABLES)) for (const [id, value] of store[key]) {
      const previous = originals[key].get(id);
      if (same(previous, json(value))) continue;
      if (['tasks', 'couriers'].includes(key) && previous && (value.version || 0) <= (previous.version || 0)) {
        value.version = (previous.version || 0) + 1;
      }
      const data = columns(key, value);
      if (previous) {
        const changed = await tx[table].updateMany({ where: { id,
          ...(['tasks', 'couriers'].includes(key) ? { version: previous.version || 0 } : {}) }, data });
        if (changed.count !== 1) throw error('NETWORK_CONFLICT');
      } else await tx[table].create({ data });
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
  async function run(work) {
    const result = await runWithBypass(() => prisma.$transaction(async tx => {
      // Constante interna, no texto proporcionado por usuarios; compartida con Ops.
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(643216, 1)');
      const { store, originals } = await load(tx);
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
  return { run, tick, presenceStore };
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
        return [...r.store.tasks.values()].filter(t => (!afterId || t.id > afterId) && Object.entries(filters).every(([k,v]) => t[k] === v))
          .sort((a,b) => a.id < b.id ? -1 : 1).slice(0,limit).map(t => aggregate(r,t.id));
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
    if (req.headers?.authorization) return require('./marketplace-staff-identity').createStaffActorResolver()(req);
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
