'use strict';

const crypto = require('node:crypto');
const { TASK_STATUS, DISPATCH_MODES } = require('./marketplace-dispatch');

const STATUSES = Object.values(TASK_STATUS);
const DISPATCH_PERMISSION = 'marketplace.dispatch.manage';
const APPROVE_PERMISSION = 'marketplace.couriers.approve';
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = value => structuredClone(value);

class MarketplaceOpsDispatchError extends Error {
  constructor(code, message, statusCode = 422) {
    super(message); this.name = 'MarketplaceOpsDispatchError'; this.code = code; this.statusCode = statusCode;
  }
}
function check(ok, code, message, status = 422) {
  if (!ok) throw new MarketplaceOpsDispatchError(code, message, status);
}
function text(value, max = 128) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
}
function plain(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
}
function authorize(actor, action) {
  const id = actor?.id ?? actor?.accountId;
  check(text(id) && actor.isActive === true && actor.isDevice !== true, 'UNAUTHENTICATED', 'Sesion humana activa requerida', 401);
  const roles = actor.roles ?? [actor.role];
  check(Array.isArray(roles) && roles.every(role => typeof role === 'string'), 'OPS_FORBIDDEN', 'Operacion no autorizada', 403);
  const allowedRoles = action === 'approve' ? ['SUPERVISOR'] : ['DISPATCHER', 'SUPERVISOR', 'SUPPORT'];
  const permission = action === 'approve' ? APPROVE_PERMISSION : DISPATCH_PERMISSION;
  check(roles.includes('SUPER_ADMIN') || roles.some(role => allowedRoles.includes(role))
    && Array.isArray(actor.permissions) && actor.permissions.includes(permission), 'OPS_FORBIDDEN', 'Operacion no autorizada', 403);
  return { id, roles: [...roles] };
}
function version(value) {
  check(Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER, 'OPS_STORE_INTEGRITY', 'Version persistente invalida', 503);
  return value;
}
function expectedVersion(body, actual) {
  if (body.expectedVersion !== undefined) check(body.expectedVersion === actual, 'OPS_CONFLICT', 'El recurso cambio; actualiza la vista', 409);
}
function mutation(body, keys) {
  check(plain(body, keys), 'INVALID_REQUEST', 'Campos de solicitud invalidos');
  check(body.expectedVersion === undefined || Number.isSafeInteger(body.expectedVersion) && body.expectedVersion >= 0,
    'INVALID_VERSION', 'expectedVersion invalido');
  return body;
}
function dateView(value) {
  if (value === undefined || value === null) return null;
  check(value instanceof Date || typeof value === 'string', 'OPS_STORE_INTEGRITY', 'Fecha persistente invalida', 503);
  const date = new Date(value);
  check(Number.isFinite(date.getTime()), 'OPS_STORE_INTEGRITY', 'Fecha persistente invalida', 503);
  return date.toISOString();
}
function assertTask(task) {
  check(task && text(task.id) && text(task.orderId) && text(task.merchantId) && STATUSES.includes(task.status)
    && (task.dispatchMode === null || DISPATCH_MODES.includes(task.dispatchMode)), 'OPS_STORE_INTEGRITY', 'Tarea persistente invalida', 503);
  const attempts = task.attempts ?? 0;
  version(task.version ?? 0);
  check(Number.isSafeInteger(attempts) && attempts >= 0 && attempts < Number.MAX_SAFE_INTEGER, 'OPS_STORE_INTEGRITY', 'Intentos invalidos', 503);
  const a = task.currentAssignment;
  check(!task.currentAssignmentId && !a || a && text(a.id) && task.currentAssignmentId === a.id
    && a.taskId === task.id && text(a.courierId) && DISPATCH_MODES.includes(a.source)
    && ['ACTIVE', 'COMPLETED', 'CANCELLED', 'REASSIGNED'].includes(a.status)
    && Number.isFinite(a.payoutAmount) && a.payoutAmount >= 0 && /^[A-Z]{3}$/.test(a.currency),
  'OPS_STORE_INTEGRITY', 'Asignacion inconsistente', 503);
}
function taskView(task) {
  assertTask(task);
  const a = task.currentAssignment;
  return { id: task.id, orderId: task.orderId, merchantId: task.merchantId, status: task.status,
    dispatchMode: task.dispatchMode, attempts: task.attempts ?? 0,
    currentAssignment: a ? { id: a.id, courierId: a.courierId, source: a.source, status: a.status,
      payoutAmount: a.payoutAmount, currency: a.currency } : null,
    readyAt: dateView(task.readyAt), pickedUpAt: dateView(task.pickedUpAt), version: task.version ?? 0 };
}
function listQuery(query) {
  check(plain(query, ['status', 'merchantId', 'dispatchMode', 'limit', 'cursor']), 'INVALID_QUERY', 'Filtros invalidos');
  const filters = {};
  if (query.status !== undefined) { check(STATUSES.includes(query.status), 'INVALID_QUERY', 'Estado invalido'); filters.status = query.status; }
  if (query.merchantId !== undefined) { check(text(query.merchantId), 'INVALID_QUERY', 'Comercio invalido'); filters.merchantId = query.merchantId; }
  if (query.dispatchMode !== undefined) { check(DISPATCH_MODES.includes(query.dispatchMode), 'INVALID_QUERY', 'Modo invalido'); filters.dispatchMode = query.dispatchMode; }
  const limit = query.limit ?? 50;
  check((Number.isInteger(limit) || typeof limit === 'string' && /^[1-9]\d{0,2}$/.test(limit)) && Number(limit) >= 1 && Number(limit) <= 100,
    'INVALID_QUERY', 'limit debe estar entre 1 y 100');
  let afterId = null;
  if (query.cursor !== undefined) {
    check(typeof query.cursor === 'string' && query.cursor.length <= 512 && /^[A-Za-z0-9_-]+$/.test(query.cursor), 'INVALID_CURSOR', 'Cursor invalido');
    let cursor;
    try { cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')); } catch { check(false, 'INVALID_CURSOR', 'Cursor invalido'); }
    check(plain(cursor, ['id', 'filters']) && text(cursor.id) && cursor.filters === digest(filters), 'INVALID_CURSOR', 'Cursor no corresponde a los filtros');
    afterId = cursor.id;
  }
  return { filters, limit: Number(limit), afterId };
}

/** Transactional ports, no default DB/network/global actor:
 * unitOfWork.run(work) -> work(tx); rollback on any failure.
 * taskStore.list({filters,afterId,limit}) -> rows ordered by unique id ascending.
 * taskStore.findById(id,{tx}) -> task aggregate: assignments[], offers[], auditTrail[].
 * taskStore.compareAndSwap(tx,{id,expectedVersion,expectedStatus,record}) -> {count}.
 *   The same CAS atomically persists task, assignment history, expired offers and
 *   append-only audit (including normalized assignment/offer/audit tables, if used).
 * courierStore.findById(id,{tx}) and compareAndSwap(tx,{id,expectedVersion,
 *   expectedStatus,expectedVerificationStatus,record}) have the same guarantees.
 * dispatchEngine.prepareReassignment({task,reason,actor,at}) is a PURE planner;
 *   only its next status is accepted. It cannot alter the approved money/policy.
 *   Default holds REASSIGNING for a later dispatch wave/human custody decision.
 * Every writer, including courier acceptance, must participate in the version CAS.
 */
function createMarketplaceOpsDispatchService({ taskStore, courierStore, unitOfWork,
  dispatchEngine = { prepareReassignment: () => ({ status: TASK_STATUS.REASSIGNING }) },
  now = () => new Date(), newId = () => crypto.randomUUID() } = {}) {
  function at() {
    const value = now();
    check(value instanceof Date && Number.isFinite(value.getTime()), 'INVALID_CLOCK', 'Reloj no disponible', 503);
    return value.toISOString();
  }
  function audit(action, actor, data) {
    const id = newId(); check(text(id), 'INVALID_AUDIT_ID', 'Auditoria no disponible', 503);
    return { id, action, actorId: actor.id, actorRoles: actor.roles, at: at(), ...data };
  }
  function writable(store) {
    check(typeof unitOfWork?.run === 'function' && typeof store?.findById === 'function' && typeof store?.compareAndSwap === 'function',
      'OPS_UNAVAILABLE', 'Almacen transaccional no disponible', 503);
  }
  async function listDispatch(actor, query = {}) {
    authorize(actor, 'dispatch'); const { filters, limit, afterId } = listQuery(query);
    check(typeof taskStore?.list === 'function', 'OPS_UNAVAILABLE', 'Despacho no disponible', 503);
    const rows = await taskStore.list({ filters, afterId, limit: limit + 1 });
    check(Array.isArray(rows) && rows.length <= limit + 1, 'OPS_STORE_INTEGRITY', 'Pagina invalida', 503);
    let previous = afterId;
    for (const row of rows) {
      assertTask(row);
      check((previous === null || row.id > previous) && Object.entries(filters).every(([key, value]) => row[key] === value),
        'OPS_STORE_INTEGRITY', 'Orden o filtros de pagina inconsistentes', 503);
      previous = row.id;
    }
    const items = rows.slice(0, limit).map(taskView);
    const nextCursor = rows.length > limit ? Buffer.from(JSON.stringify({ id: items.at(-1).id, filters: digest(filters) })).toString('base64url') : null;
    return { items, nextCursor };
  }
  async function reassign(actor, taskId, body) {
    const operator = authorize(actor, 'dispatch');
    check(text(taskId), 'INVALID_TASK_ID', 'Tarea invalida');
    mutation(body, ['reason', 'expectedVersion']); check(text(body.reason, 500), 'REASON_REQUIRED', 'Motivo requerido (1-500 caracteres)');
    writable(taskStore);
    check(typeof dispatchEngine?.prepareReassignment === 'function', 'OPS_UNAVAILABLE', 'Motor de despacho no disponible', 503);
    return unitOfWork.run(async tx => {
      const loaded = await taskStore.findById(taskId, { tx });
      check(loaded?.id === taskId, 'TASK_NOT_FOUND', 'Tarea no encontrada', 404);
      const task = clone(loaded); assertTask(task);
      check(![TASK_STATUS.DELIVERED, TASK_STATUS.CANCELLED, TASK_STATUS.WAITING_READY].includes(task.status), 'TASK_NOT_REASSIGNABLE', 'La tarea no admite reasignacion', 409);
      const previousVersion = version(task.version ?? 0); expectedVersion(body, previousVersion);
      const plan = await dispatchEngine.prepareReassignment({ task: clone(task), reason: body.reason, actor: clone(operator), at: at() });
      const pickedUp = Boolean(task.pickedUpAt || task.currentAssignment?.pickedUpAt || task.status === TASK_STATUS.PICKED_UP);
      check([TASK_STATUS.OFFERING, TASK_STATUS.REASSIGNING].includes(plan?.status) && (!pickedUp || plan.status === TASK_STATUS.REASSIGNING),
        'INVALID_DISPATCH_PLAN', 'Plan de reasignacion invalido', 503);
      const event = audit('TASK_REASSIGNED', operator, { taskId, orderId: task.orderId, merchantId: task.merchantId, reason: body.reason,
        previousStatus: task.status, nextStatus: plan.status, previousAssignmentId: task.currentAssignmentId ?? null,
        attempts: (task.attempts ?? 0) + 1, previousVersion, nextVersion: previousVersion + 1 });
      const assignments = clone(task.assignments ?? []); const current = task.currentAssignment;
      check(Array.isArray(assignments) && Array.isArray(task.offers ?? []) && Array.isArray(task.auditTrail ?? []), 'OPS_STORE_INTEGRITY', 'Historial invalido', 503);
      check(assignments.every(a => a.taskId === task.id && (a.status !== 'ACTIVE' || a.id === current?.id)), 'OPS_STORE_INTEGRITY', 'Asignaciones activas inconsistentes', 503);
      check(new Set(assignments.map(a => a.id)).size === assignments.length, 'OPS_STORE_INTEGRITY', 'Historial de asignaciones duplicado', 503);
      if (current) {
        check(current.status === 'ACTIVE', 'OPS_STORE_INTEGRITY', 'Asignacion actual inactiva', 503);
        const index = assignments.findIndex(a => a.id === current.id);
        const cancelled = { ...(index >= 0 ? assignments[index] : {}), ...current, status: 'REASSIGNED', endedAt: event.at,
          endReason: body.reason, endedBy: operator.id };
        if (index >= 0) assignments[index] = cancelled; else assignments.push(cancelled);
      }
      const next = { ...task, status: plan.status, attempts: event.attempts, version: event.nextVersion,
        currentAssignment: null, currentAssignmentId: null, selectedCourierId: null, assignments,
        offers: (task.offers ?? []).map(offer => {
          check(offer.taskId === taskId, 'OPS_STORE_INTEGRITY', 'Oferta de otra tarea', 503);
          return offer.status === 'OFFERED' ? { ...offer, status: 'EXPIRED' } : offer;
        }), auditTrail: [...(task.auditTrail ?? []), event], updatedAt: event.at };
      const changed = await taskStore.compareAndSwap(tx, { id: taskId, expectedVersion: previousVersion, expectedStatus: task.status, record: next });
      check(changed?.count === 1, 'OPS_CONFLICT', 'La tarea cambio; actualiza la vista', 409);
      return { task: taskView(next), auditId: event.id };
    });
  }
  async function approveCourier(actor, courierId, body = {}) {
    const operator = authorize(actor, 'approve');
    check(text(courierId), 'INVALID_COURIER_ID', 'Repartidor invalido'); mutation(body, ['expectedVersion']); writable(courierStore);
    return unitOfWork.run(async tx => {
      const loaded = await courierStore.findById(courierId, { tx });
      check(loaded?.id === courierId, 'COURIER_NOT_FOUND', 'Repartidor no encontrado', 404);
      const courier = clone(loaded); const previousVersion = version(courier.version ?? 0); expectedVersion(body, previousVersion);
      if (courier.verificationStatus === 'VERIFIED' && courier.status === 'ACTIVE') {
        return { courierId, verificationStatus: 'VERIFIED', status: 'ACTIVE', version: previousVersion, idempotent: true };
      }
      check(['PENDING_VERIFICATION', 'PENDING'].includes(courier.verificationStatus) && ['ACTIVE', 'PENDING'].includes(courier.status),
        'COURIER_NOT_PENDING', 'El repartidor no esta pendiente de aprobacion', 409);
      check(Array.isArray(courier.auditTrail ?? []), 'OPS_STORE_INTEGRITY', 'Historial invalido', 503);
      const event = audit('COURIER_APPROVED', operator, { courierId, previousStatus: courier.status,
        previousVerificationStatus: courier.verificationStatus, nextStatus: 'ACTIVE', nextVerificationStatus: 'VERIFIED' });
      const next = { ...courier, verificationStatus: 'VERIFIED', status: 'ACTIVE', isShared: true, isActive: true, verifiedAt: event.at, verifiedBy: operator.id,
        version: previousVersion + 1, updatedAt: event.at, auditTrail: [...(courier.auditTrail ?? []), event] };
      const changed = await courierStore.compareAndSwap(tx, { id: courierId, expectedVersion: previousVersion,
        expectedStatus: courier.status, expectedVerificationStatus: courier.verificationStatus, record: next });
      check(changed?.count === 1, 'OPS_CONFLICT', 'El repartidor cambio; actualiza la vista', 409);
      return { courierId, verificationStatus: 'VERIFIED', status: 'ACTIVE', version: next.version, auditId: event.id, idempotent: false };
    });
  }
  return { listDispatch, reassign, approveCourier };
}

module.exports = { MarketplaceOpsDispatchError, createMarketplaceOpsDispatchService };
