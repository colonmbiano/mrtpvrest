'use strict';

// Global couriers and merchant affiliations (plan §4, §6, §8). A courier is a platform identity,
// not a User or Employee, so every caller arrives as an actor resolved by an injected port.
// Ports: courierStore (create, findById, findByAccountId, update), affiliationStore (create,
// findByPair, update, listByCourier), merchantDirectory (findById) and merchantAccess
// (canManage). Without them the service fails closed with 503. Nothing here touches a network or database.
const crypto = require('node:crypto');

const VEHICLES = ['MOTO', 'BICI', 'AUTO'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?\d{10,15}$/;
const PLATE = /^[A-Z0-9]{5,8}$/;
const NAME = /^[\p{L}\p{M}' .-]{2,100}$/u;
const APPLY_FIELDS = ['name', 'phone', 'email', 'vehicleType', 'licensePlate'];

class CourierV1Error extends Error {
  constructor(code, message, statusCode = 422) {
    super(message);
    this.name = 'CourierV1Error';
    this.code = code;
    this.statusCode = statusCode;
  }
}
function fail(code, message, statusCode) {
  throw new CourierV1Error(code, message, statusCode);
}
function check(ok, code, message, statusCode = 422) {
  if (!ok) fail(code, message, statusCode);
}
function plain(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
}
function portsReady(ports) {
  check(ports.courierStore && ports.affiliationStore && ports.merchantDirectory && ports.merchantAccess,
    'COURIERS_UNAVAILABLE', 'Repartidores no disponibles', 503);
}
// The courier identity is the only place that may act as a courier. Staff or merchant members are rejected.
function requireCourier(actor) {
  check(actor && typeof actor.accountId === 'string' && Array.isArray(actor.roles), 'UNAUTHENTICATED', 'Sesion requerida', 401);
  check(actor.roles.includes('COURIER'), 'COURIER_FORBIDDEN', 'Solo repartidores pueden realizar esta accion', 403);
}
function requireActor(actor) {
  check(actor && typeof actor.accountId === 'string' && Array.isArray(actor.roles), 'UNAUTHENTICATED', 'Sesion requerida', 401);
}

// Strict, normalized applicant data. Money, status and verification never come from the client.
function normalizeApplication(body) {
  check(plain(body, APPLY_FIELDS), 'INVALID_APPLICATION', 'Solicitud invalida');
  check(typeof body.name === 'string' && body.name.trim() === body.name && NAME.test(body.name), 'INVALID_NAME', 'Nombre invalido');
  const phone = typeof body.phone === 'string' ? body.phone.replace(/[\s\-().]/g, '') : '';
  check(PHONE.test(phone), 'INVALID_PHONE', 'Telefono invalido');
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  check(email.length <= 254 && EMAIL.test(email), 'INVALID_EMAIL', 'Correo invalido');
  check(VEHICLES.includes(body.vehicleType), 'INVALID_VEHICLE', 'Tipo de vehiculo invalido');
  let licensePlate = null;
  if (body.vehicleType === 'BICI') {
    check(body.licensePlate === undefined || body.licensePlate === null, 'INVALID_PLATE', 'Una bicicleta no lleva placa');
  } else {
    const plate = typeof body.licensePlate === 'string' ? body.licensePlate.replace(/[\s-]/g, '').toUpperCase() : '';
    check(PLATE.test(plate), 'INVALID_PLATE', 'Placa invalida');
    licensePlate = plate;
  }
  return { name: body.name, phone, email, vehicleType: body.vehicleType, licensePlate };
}

const courierView = courier => ({
  courierId: courier.id,
  name: courier.name,
  vehicleType: courier.vehicleType,
  verificationStatus: courier.verificationStatus,
  status: courier.status,
  maxActiveTasks: courier.maxActiveTasks,
});
const affiliationView = (affiliation, merchantName) => ({
  affiliationId: affiliation.id,
  merchantId: affiliation.merchantId,
  merchantName,
  status: affiliation.status,
  canTakeOwnOrders: affiliation.canTakeOwnOrders === true,
});

function createCouriersV1Service(ports = {}) {
  const { courierStore, affiliationStore, merchantDirectory, merchantAccess, now = () => new Date() } = ports;
  const ready = () => portsReady({ courierStore, affiliationStore, merchantDirectory, merchantAccess });

  async function apply(actor, body) {
    requireActor(actor);
    ready();
    const application = normalizeApplication(body);
    const existing = await courierStore.findByAccountId(actor.accountId);
    check(!existing, 'COURIER_EXISTS', 'No se pudo completar el registro', 409);
    const at = now();
    const courier = {
      id: crypto.randomUUID(), accountId: actor.accountId, ...application,
      // Starts unverified. Status stays ACTIVE (account standing), so a pending courier can be
      // verified later but cannot be affiliated until verificationStatus is VERIFIED.
      verificationStatus: 'PENDING_VERIFICATION', status: 'ACTIVE', maxActiveTasks: 1,
      createdAt: at, updatedAt: at,
    };
    try {
      await courierStore.create(courier);
    } catch (error) {
      // Generic message: the response must not reveal which contact field is already registered.
      if (error?.code === 'DUPLICATE') fail('COURIER_EXISTS', 'No se pudo completar el registro', 409);
      throw error;
    }
    return courierView(courier);
  }

  async function profile(actor) {
    requireCourier(actor);
    ready();
    const courier = await courierStore.findByAccountId(actor.accountId);
    check(courier, 'COURIER_NOT_FOUND', 'Repartidor no encontrado', 404);
    return courierView(courier);
  }

  async function affiliations(actor) {
    requireCourier(actor);
    ready();
    const courier = await courierStore.findByAccountId(actor.accountId);
    check(courier, 'COURIER_NOT_FOUND', 'Repartidor no encontrado', 404);
    const rows = await affiliationStore.listByCourier(courier.id);
    const items = [];
    for (const row of rows) {
      const merchant = await merchantDirectory.findById(row.merchantId);
      // A merchant that no longer exists is left out rather than shown without a name.
      if (merchant) items.push(affiliationView(row, merchant.name));
    }
    return { items };
  }

  async function assertCanManage(actor, merchantId) {
    requireActor(actor);
    ready();
    check(typeof merchantId === 'string' && merchantId.length > 0 && merchantId.length <= 64, 'INVALID_MERCHANT', 'Comercio invalido');
    const allowed = await merchantAccess.canManage(actor, merchantId);
    check(allowed === true, 'MERCHANT_FORBIDDEN', 'No tienes permiso sobre este comercio', 403);
    const merchant = await merchantDirectory.findById(merchantId);
    check(merchant, 'MERCHANT_NOT_FOUND', 'Comercio no encontrado', 404);
    return merchant;
  }

  async function affiliate(actor, merchantId, body) {
    const merchant = await assertCanManage(actor, merchantId);
    check(plain(body, ['courierId', 'canTakeOwnOrders']), 'INVALID_AFFILIATION', 'Solicitud invalida');
    check(typeof body.courierId === 'string' && body.courierId.length > 0 && body.courierId.length <= 64, 'INVALID_AFFILIATION', 'Repartidor invalido');
    check(body.canTakeOwnOrders === undefined || typeof body.canTakeOwnOrders === 'boolean', 'INVALID_AFFILIATION', 'canTakeOwnOrders invalido');
    const courier = await courierStore.findById(body.courierId);
    check(courier, 'COURIER_NOT_FOUND', 'Repartidor no encontrado', 404);
    check(courier.verificationStatus === 'VERIFIED', 'COURIER_NOT_VERIFIED', 'El repartidor aun no esta verificado');
    check(courier.status === 'ACTIVE', 'COURIER_SUSPENDED', 'El repartidor esta suspendido');
    // Least privilege: own-order dispatch is off unless the merchant asks for it explicitly.
    const canTakeOwnOrders = body.canTakeOwnOrders === true;
    const current = await affiliationStore.findByPair(courier.id, merchant.id);
    if (current && current.status === 'ACTIVE') fail('AFFILIATION_EXISTS', 'El repartidor ya esta afiliado', 409);
    try {
      if (current) {
        // REVOKED rows are reused so the affiliation history keeps one row per pair.
        const row = await affiliationStore.update(current.id, { status: 'ACTIVE', canTakeOwnOrders, revokedAt: null, updatedAt: now() });
        return affiliationView(row, merchant.name);
      }
      const at = now();
      const row = { id: crypto.randomUUID(), courierId: courier.id, merchantId: merchant.id, status: 'ACTIVE',
        canTakeOwnOrders, createdAt: at, updatedAt: at, revokedAt: null };
      await affiliationStore.create(row);
      return affiliationView(row, merchant.name);
    } catch (error) {
      if (error?.code === 'DUPLICATE') fail('AFFILIATION_EXISTS', 'El repartidor ya esta afiliado', 409);
      throw error;
    }
  }

  async function revoke(actor, merchantId, courierId) {
    const merchant = await assertCanManage(actor, merchantId);
    check(typeof courierId === 'string' && courierId.length > 0 && courierId.length <= 64, 'INVALID_AFFILIATION', 'Repartidor invalido');
    const current = await affiliationStore.findByPair(courierId, merchant.id);
    check(current, 'AFFILIATION_NOT_FOUND', 'Afiliacion no encontrada', 404);
    // Revoking twice is a no-op. The row stays as history.
    if (current.status === 'REVOKED') return affiliationView(current, merchant.name);
    const row = await affiliationStore.update(current.id, { status: 'REVOKED', canTakeOwnOrders: false, revokedAt: now(), updatedAt: now() });
    return affiliationView(row, merchant.name);
  }

  return { apply, profile, affiliations, affiliate, revoke };
}

module.exports = { CourierV1Error, createCouriersV1Service, normalizeApplication, VEHICLES };
