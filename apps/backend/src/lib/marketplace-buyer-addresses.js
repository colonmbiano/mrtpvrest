'use strict';

// Libreta de direcciones del comprador del marketplace (API v1). La cuenta es la
// misma identidad de la cotización y la orden (lib/marketplace-buyer-identity.js),
// así una dirección solo la ve y la usa quien la guardó.
// Las direcciones no se editan: la cotización y la orden leen la misma fila, y
// cambiarla entre ambas movería un envío ya cotizado. Guardar otra vez la misma
// dirección (texto y punto del mapa) reutiliza la fila, así un reintento no duplica.
// La coordenada es obligatoria: el envío por distancia o por zonas y el
// repartidor la necesitan.
const crypto = require('node:crypto');

const MAX_ADDRESSES = 20;
const SELECT = { id: true, accountId: true, address: true, lat: true, lng: true };

class BuyerAddressError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message); this.name = 'BuyerAddressError'; this.code = code; this.statusCode = statusCode;
  }
}
function check(ok, code, message, statusCode = 400) {
  if (!ok) throw new BuyerAddressError(code, message, statusCode);
}
function text(value, max = 64) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
}
function plain(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
}
function coordinate(value, limit) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

function normalize(body) {
  check(plain(body, ['address', 'lat', 'lng']), 'INVALID_ADDRESS', 'Direccion invalida');
  // Un solo renglón: el TPV y el repartidor la leen tal cual.
  const address = typeof body.address === 'string' ? body.address.replace(/\s+/g, ' ').trim() : '';
  check(address.length >= 5 && address.length <= 500, 'INVALID_ADDRESS', 'Escribe la direccion de entrega (de 5 a 500 caracteres)');
  check(coordinate(body.lat, 90) && coordinate(body.lng, 180), 'INVALID_LOCATION', 'Marca tu ubicacion en el mapa');
  return { address, lat: body.lat, lng: body.lng };
}
const fingerprintOf = input => crypto.createHash('sha256').update(JSON.stringify([input.address, input.lat, input.lng])).digest('hex');
const view = row => ({ id: row.id, address: row.address, lat: row.lat, lng: row.lng });

function createBuyerAddressBook({ prismaClient, now = () => new Date(), maxAddresses = MAX_ADDRESSES } = {}) {
  function account(accountId) {
    check(text(accountId), 'UNAUTHENTICATED', 'Cuenta de comprador requerida', 401);
    check(prismaClient?.marketplaceBuyerAddress, 'ADDRESSES_UNAVAILABLE', 'Direcciones no disponibles', 503);
    return prismaClient.marketplaceBuyerAddress;
  }
  async function list(accountId) {
    const rows = await account(accountId).findMany({ where: { accountId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: maxAddresses, select: SELECT });
    return rows.map(view);
  }
  // { address, created }: created=false cuando la misma dirección ya estaba guardada.
  async function save(accountId, body) {
    const model = account(accountId);
    const input = normalize(body);
    const fingerprint = fingerprintOf(input);
    const where = { accountId_fingerprint: { accountId, fingerprint } };
    const existing = await model.findUnique({ where, select: SELECT });
    if (existing) {
      await model.update({ where: { id: existing.id }, data: { updatedAt: now() }, select: { id: true } });
      return { address: view(existing), created: false };
    }
    // Tope suave: dos altas simultáneas pueden pasarlo por una fila.
    check(await model.count({ where: { accountId } }) < maxAddresses, 'ADDRESS_LIMIT',
      `Puedes guardar hasta ${maxAddresses} direcciones; quita una para agregar otra`, 409);
    try {
      return { address: view(await model.create({ data: { accountId, fingerprint, ...input }, select: SELECT })), created: true };
    } catch (error) {
      // Otra petición guardó la misma dirección al mismo tiempo.
      if (error?.code !== 'P2002') throw error;
      const row = await model.findUnique({ where, select: SELECT });
      check(row, 'ADDRESS_CONFLICT', 'Repite la solicitud', 409);
      return { address: view(row), created: false };
    }
  }
  async function remove(accountId, addressId) {
    const model = account(accountId);
    check(text(addressId), 'ADDRESS_NOT_FOUND', 'Direccion no encontrada', 404);
    const { count } = await model.deleteMany({ where: { id: addressId, accountId } });
    check(count === 1, 'ADDRESS_NOT_FOUND', 'Direccion no encontrada', 404);
  }
  // Puerto addresses.resolve de la cotización (lib/marketplace-quote.js) y de la
  // orden (lib/marketplace-order-orchestrator.js, dentro de su transacción).
  async function resolve(accountId, addressId, { tx } = {}) {
    if (!text(accountId) || !text(addressId)) return null;
    const row = await (tx || prismaClient).marketplaceBuyerAddress.findFirst({ where: { id: addressId, accountId }, select: SELECT });
    return row ? { ...view(row), accountId: row.accountId } : null;
  }
  return { list, save, remove, resolve };
}

module.exports = { BuyerAddressError, createBuyerAddressBook, MAX_ADDRESSES };
