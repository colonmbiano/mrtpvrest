'use strict';

// Libreta de direcciones del comprador (API v1) y su ruta. Sin BD: Prisma es un
// fake en memoria con la llave única (accountId, fingerprint) de la tabla.
//   node --test apps/backend/scripts/marketplace-buyer-addresses.test.cjs

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BuyerAddressError, createBuyerAddressBook, MAX_ADDRESSES } = require('../src/lib/marketplace-buyer-addresses');
const createRouter = require('../src/routes/marketplace-addresses-v1.routes');
const { createBuyerAccountResolver } = require('../src/lib/marketplace-buyer-identity');

globalThis.fetch = async () => { throw new Error('Network forbidden by offline suite'); };

const NOW = new Date('2026-10-24T18:00:00.000Z');
const HOME = { address: 'Av. Juárez 10, Centro, CDMX', lat: 19.4326, lng: -99.1332 };

function fakePrisma() {
  const rows = [];
  let seq = 0;
  const pick = row => row && ({ id: row.id, accountId: row.accountId, address: row.address, lat: row.lat, lng: row.lng });
  const model = {
    rows,
    async findMany({ where, take }) {
      return rows.filter(r => r.accountId === where.accountId)
        .sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1)).slice(0, take).map(pick);
    },
    async findUnique({ where }) {
      const { accountId, fingerprint } = where.accountId_fingerprint;
      return pick(rows.find(r => r.accountId === accountId && r.fingerprint === fingerprint)) ?? null;
    },
    async findFirst({ where }) { return pick(rows.find(r => r.id === where.id && r.accountId === where.accountId)) ?? null; },
    async update({ where, data }) { const row = rows.find(r => r.id === where.id); Object.assign(row, data); return { id: row.id }; },
    async count({ where }) { return rows.filter(r => r.accountId === where.accountId).length; },
    async create({ data }) {
      if (rows.some(r => r.accountId === data.accountId && r.fingerprint === data.fingerprint)) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const row = { id: `a${++seq}`, ...data, updatedAt: new Date(NOW.getTime() + seq) };
      rows.push(row);
      return pick(row);
    },
    async deleteMany({ where }) {
      const index = rows.findIndex(r => r.id === where.id && r.accountId === where.accountId);
      if (index === -1) return { count: 0 };
      rows.splice(index, 1);
      return { count: 1 };
    },
  };
  return { marketplaceBuyerAddress: model };
}

function rejects(promise, code, statusCode) {
  return assert.rejects(promise, error => error instanceof BuyerAddressError && error.code === code
    && (statusCode === undefined || error.statusCode === statusCode));
}

test('guardar, listar y quitar: cada cuenta ve solo sus direcciones', async () => {
  const prisma = fakePrisma();
  const book = createBuyerAddressBook({ prismaClient: prisma, now: () => NOW });
  const { address, created } = await book.save('guest:a', HOME);
  assert.equal(created, true);
  assert.deepEqual(address, { id: 'a1', ...HOME });
  // La huella es sha256 de [dirección, lat, lng]; nunca se devuelve.
  assert.match(prisma.marketplaceBuyerAddress.rows[0].fingerprint, /^[0-9a-f]{64}$/);
  assert.equal('fingerprint' in address, false);
  assert.deepEqual(await book.list('guest:a'), [{ id: 'a1', ...HOME }]);
  assert.deepEqual(await book.list('guest:b'), []);
  await rejects(book.remove('guest:b', 'a1'), 'ADDRESS_NOT_FOUND', 404);
  await book.remove('guest:a', 'a1');
  assert.deepEqual(await book.list('guest:a'), []);
  await rejects(book.remove('guest:a', 'a1'), 'ADDRESS_NOT_FOUND', 404);
});

test('guardar la misma dirección otra vez la reutiliza y la sube al principio', async () => {
  const prisma = fakePrisma();
  const later = new Date(NOW.getTime() + 60000);
  const book = createBuyerAddressBook({ prismaClient: prisma, now: () => later });
  const first = await book.save('guest:a', HOME);
  await book.save('guest:a', { address: 'Calle 5 #20, Roma Norte', lat: 19.41, lng: -99.16 });
  const again = await book.save('guest:a', { ...HOME, address: `  ${HOME.address.replace(' ', '\n ')} ` });
  assert.equal(again.created, false);
  assert.equal(again.address.id, first.address.id);
  assert.equal(prisma.marketplaceBuyerAddress.rows.length, 2);
  assert.equal((await book.list('guest:a'))[0].id, first.address.id);
  // Otro punto del mapa con el mismo texto es otra dirección.
  assert.equal((await book.save('guest:a', { ...HOME, lat: 19.4327 })).created, true);
  // La misma dirección en otra cuenta es otra fila.
  assert.equal((await book.save('guest:b', HOME)).created, true);
});

test('una carrera con la misma dirección devuelve la fila ganadora', async () => {
  const prisma = fakePrisma();
  const book = createBuyerAddressBook({ prismaClient: prisma, now: () => NOW });
  const model = prisma.marketplaceBuyerAddress;
  await book.save('guest:a', HOME); // la fila de la otra petición
  const findUnique = model.findUnique;
  let calls = 0;
  // La primera lectura no la ve (llegaron a la vez) y el insert choca con la llave única.
  model.findUnique = async args => (++calls === 1 ? null : findUnique(args));
  const raced = await book.save('guest:a', HOME);
  assert.equal(raced.created, false);
  assert.equal(raced.address.id, 'a1');
  assert.equal(model.rows.length, 1);
});

test('la dirección exige texto y un punto del mapa válidos; el cuerpo no admite otros campos', async () => {
  const book = createBuyerAddressBook({ prismaClient: fakePrisma(), now: () => NOW });
  await rejects(book.save('guest:a', { ...HOME, address: 'abc' }), 'INVALID_ADDRESS', 400);
  await rejects(book.save('guest:a', { ...HOME, address: 'x'.repeat(501) }), 'INVALID_ADDRESS', 400);
  await rejects(book.save('guest:a', { ...HOME, address: 42 }), 'INVALID_ADDRESS', 400);
  await rejects(book.save('guest:a', { address: HOME.address }), 'INVALID_LOCATION', 400);
  await rejects(book.save('guest:a', { ...HOME, lat: 91 }), 'INVALID_LOCATION', 400);
  await rejects(book.save('guest:a', { ...HOME, lng: '-99.1' }), 'INVALID_LOCATION', 400);
  await rejects(book.save('guest:a', { ...HOME, lat: Number.NaN }), 'INVALID_LOCATION', 400);
  await rejects(book.save('guest:a', { ...HOME, accountId: 'guest:b' }), 'INVALID_ADDRESS', 400);
  await rejects(book.save('guest:a', null), 'INVALID_ADDRESS', 400);
  await rejects(book.save(undefined, HOME), 'UNAUTHENTICATED', 401);
  await rejects(createBuyerAddressBook({}).list('guest:a'), 'ADDRESSES_UNAVAILABLE', 503);
});

test(`tope de ${MAX_ADDRESSES} direcciones por cuenta; repetir una existente no cuenta`, async () => {
  const book = createBuyerAddressBook({ prismaClient: fakePrisma(), now: () => NOW, maxAddresses: 2 });
  await book.save('guest:a', HOME);
  await book.save('guest:a', { ...HOME, lat: 19.5 });
  await rejects(book.save('guest:a', { ...HOME, lat: 19.6 }), 'ADDRESS_LIMIT', 409);
  assert.equal((await book.save('guest:a', HOME)).created, false);
  assert.equal(MAX_ADDRESSES, 20);
});

test('resolve es el puerto de la cotización y la orden: dueño, id y transacción', async () => {
  const prisma = fakePrisma();
  const book = createBuyerAddressBook({ prismaClient: prisma, now: () => NOW });
  await book.save('guest:a', HOME);
  assert.deepEqual(await book.resolve('guest:a', 'a1'), { id: 'a1', ...HOME, accountId: 'guest:a' });
  assert.equal(await book.resolve('guest:b', 'a1'), null);
  assert.equal(await book.resolve('guest:a', 'nope'), null);
  assert.equal(await book.resolve('', 'a1'), null);
  assert.equal(await book.resolve('guest:a', ' a1'), null);
  let used = false;
  const tx = { marketplaceBuyerAddress: { findFirst: async args => { used = true; return prisma.marketplaceBuyerAddress.findFirst(args); } } };
  assert.equal((await book.resolve('guest:a', 'a1', { tx })).id, 'a1');
  assert.equal(used, true);
});

// ── Ruta /api/marketplace/v1/addresses ─────────────────────────────────────

function routes(options) {
  const handlers = new Map();
  const Router = () => ({
    get: (p, fn) => handlers.set(`GET ${p}`, fn),
    post: (p, fn) => handlers.set(`POST ${p}`, fn),
    delete: (p, fn) => handlers.set(`DELETE ${p}`, fn),
  });
  createRouter({ Router, ...options });
  return handlers;
}
async function invoke(handler, req = {}) {
  const res = { statusCode: 200, headers: {}, body: undefined, ended: false,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { this.ended = true; return this; } };
  await handler({ params: {}, ...req, headers: req.headers || {} }, res);
  return res;
}

test('ruta: alta 201, repetición 200, lista y baja 204 con la identidad X-Buyer-Id', async () => {
  const service = createBuyerAddressBook({ prismaClient: fakePrisma(), now: () => NOW });
  const handlers = routes({ service });
  const headers = { 'x-buyer-id': 'buyer-session-0123456789' };
  const created = await invoke(handlers.get('POST /'), { headers, body: HOME });
  assert.equal(created.statusCode, 201);
  assert.deepEqual(created.body, { id: 'a1', ...HOME });
  assert.equal(created.headers['Cache-Control'], 'no-store');
  assert.equal((await invoke(handlers.get('POST /'), { headers, body: HOME })).statusCode, 200);
  const listed = await invoke(handlers.get('GET /'), { headers });
  assert.deepEqual(listed.body, { addresses: [{ id: 'a1', ...HOME }] });
  // Otro invitado no ve ni puede quitar la dirección.
  const other = { 'x-buyer-id': 'another-session-012345' };
  assert.deepEqual((await invoke(handlers.get('GET /'), { headers: other })).body, { addresses: [] });
  assert.equal((await invoke(handlers.get('DELETE /:id'), { headers: other, params: { id: 'a1' } })).statusCode, 404);
  const removed = await invoke(handlers.get('DELETE /:id'), { headers, params: { id: 'a1' } });
  assert.equal(removed.statusCode, 204);
  assert.equal(removed.ended, true);
});

test('ruta: la identidad es la misma de la orden (X-Buyer-Id), no la del invitado de la cotización', async () => {
  const seen = [];
  const service = { list: async accountId => { seen.push(accountId); return []; } };
  const handlers = routes({ service });
  const noHeader = await invoke(handlers.get('GET /'));
  assert.equal(noHeader.statusCode, 401);
  assert.equal(noHeader.body.errorCode, 'UNAUTHENTICATED');
  assert.equal((await invoke(handlers.get('GET /'), { headers: { 'x-guest-id': 'buyer-session-0123456789' } })).statusCode, 401);
  assert.equal((await invoke(handlers.get('GET /'), { headers: { 'x-buyer-id': 'bad\nid' } })).statusCode, 401);
  await invoke(handlers.get('GET /'), { headers: { 'x-buyer-id': 'buyer-session-0123456789' } });
  // Mismo namespace que el resolvedor de la orden: la orden lee esta dirección.
  const orderAccount = await createBuyerAccountResolver({ allowGuest: false })({ headers: { 'x-buyer-id': 'buyer-session-0123456789' } });
  assert.deepEqual(seen, [orderAccount]);
});

test('ruta: errores de validación salen con su código y los inesperados no filtran detalles', async () => {
  const service = createBuyerAddressBook({ prismaClient: fakePrisma(), now: () => NOW });
  const handlers = routes({ service, resolveAccount: () => 'guest:a' });
  const bad = await invoke(handlers.get('POST /'), { body: { ...HOME, lat: 200 } });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.errorCode, 'INVALID_LOCATION');
  const broken = routes({ service: { list: async () => { throw new Error('connection to db-internal failed'); } }, resolveAccount: () => 'guest:a' });
  const res = await invoke(broken.get('GET /'));
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.stringify(res.body).includes('db-internal'), false);
});

test('ruta: sin la bandera v1 la libreta responde 503 y se monta en /api/marketplace/v1/addresses', async () => {
  const saved = process.env.MARKETPLACE_V1_ORDERS_ENABLED;
  delete process.env.MARKETPLACE_V1_ORDERS_ENABLED;
  try {
    const res = await invoke(routes({ resolveAccount: () => 'guest:a' }).get('GET /'));
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.errorCode, 'ADDRESSES_UNAVAILABLE');
  } finally {
    if (saved !== undefined) process.env.MARKETPLACE_V1_ORDERS_ENABLED = saved;
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.match(source, /app\.use\('\/api\/marketplace\/v1\/addresses',\s*require\('\.\/routes\/marketplace-addresses-v1\.routes'\)\(\)\)/);
});
