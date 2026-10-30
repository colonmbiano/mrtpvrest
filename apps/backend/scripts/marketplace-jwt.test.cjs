'use strict';

// Confianza JWT del marketplace separada por contexto (G8): claves dedicadas, emisor y
// destinatario, rechazo cruzado y transición con el JWT de la tienda.
//   node --test apps/backend/scripts/marketplace-jwt.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { ISSUER, CONTEXTS, dedicatedSecret, storeSecret, signMarketplaceToken } = require('../src/lib/marketplace-jwt');
const { createBuyerAccountResolver } = require('../src/lib/marketplace-buyer-identity');
const { createStaffActorResolver } = require('../src/lib/marketplace-staff-identity');

const NOW = new Date('2026-10-27T12:00:00.000Z');
const SECONDS = Math.floor(NOW.getTime() / 1000);
const STORE = 's'.repeat(40);
const BUYER = 'b'.repeat(40);
const STAFF = 'f'.repeat(40);
const ENV = { JWT_SECRET: STORE, JWT_REFRESH_SECRET: 'r'.repeat(40), MARKETPLACE_BUYER_JWT_SECRET: BUYER,
  MARKETPLACE_STAFF_JWT_SECRET: STAFF };
const bearer = token => ({ headers: { authorization: `Bearer ${token}` } });
const buyer = (options = {}) => createBuyerAccountResolver({ jwtSecret: () => STORE, marketplaceSecret: () => BUYER,
  now: () => NOW, ...options });
const staff = (options = {}) => createStaffActorResolver({ jwtSecret: () => STORE, marketplaceSecret: () => STAFF,
  now: () => NOW, ...options });
// Tokens que hoy emite la tienda (sin emisor ni destinatario).
const storeCustomer = (extra = {}) => jwt.sign({ userId: 'c1', restaurantId: 'r1', role: 'CUSTOMER', exp: SECONDS + 600, ...extra }, STORE);
const storeAdmin = () => jwt.sign({ userId: 'u1', restaurantId: 'r1', role: 'SUPER_ADMIN', exp: SECONDS + 600 }, STORE);
const mpToken = (kind, claims, env = ENV) => jwt.sign({ ...claims, exp: SECONDS + 600 }, dedicatedSecret(kind, env),
  { algorithm: 'HS256', issuer: ISSUER, audience: CONTEXTS[kind].audience });
const invalid = code => error => error.code === code;

test('clave dedicada: 32+ bytes y nunca igual a las claves de la tienda', () => {
  assert.equal(dedicatedSecret('buyer', ENV), BUYER);
  assert.equal(dedicatedSecret('staff', ENV), STAFF);
  assert.equal(dedicatedSecret('buyer', { ...ENV, MARKETPLACE_BUYER_JWT_SECRET: undefined }), undefined);
  assert.equal(dedicatedSecret('buyer', { ...ENV, MARKETPLACE_BUYER_JWT_SECRET: 'corta' }), undefined);
  assert.equal(dedicatedSecret('buyer', { ...ENV, MARKETPLACE_BUYER_JWT_SECRET: STORE }), undefined);
  assert.equal(dedicatedSecret('staff', { ...ENV, MARKETPLACE_STAFF_JWT_SECRET: ENV.JWT_REFRESH_SECRET }), undefined);
  assert.throws(() => dedicatedSecret('otro', ENV), /desconocido/);
});

test('emisión: solo con clave dedicada, con emisor y destinatario, y la tienda no la acepta', () => {
  assert.throws(() => signMarketplaceToken('buyer', { userId: 'c1' }, { env: { JWT_SECRET: STORE } }), /MARKETPLACE_BUYER_JWT_SECRET requerido/);
  assert.throws(() => signMarketplaceToken('staff', { userId: 'u1' }, { env: { ...ENV, MARKETPLACE_STAFF_JWT_SECRET: STORE } }),
    /MARKETPLACE_STAFF_JWT_SECRET requerido/);
  const token = signMarketplaceToken('buyer', { userId: 'c1', role: 'CUSTOMER' }, { env: ENV });
  const claims = jwt.decode(token);
  assert.equal(claims.iss, ISSUER); assert.equal(claims.aud, CONTEXTS.buyer.audience); assert.ok(claims.exp > claims.iat);
  // Los verificadores de la tienda (JWT_SECRET) no lo aceptan.
  assert.throws(() => jwt.verify(token, STORE), /invalid signature/);
});

test('comprador: acepta su token del marketplace y, en transición, la sesión de cliente de la tienda', async () => {
  assert.equal(await buyer()(bearer(mpToken('buyer', { userId: 'mp-c1', role: 'CUSTOMER' }))), 'mp-c1');
  assert.equal(await buyer()(bearer(storeCustomer())), 'c1');
  // Sin clave dedicada configurada, sigue aceptando la sesión de la tienda como hasta hoy.
  assert.equal(await buyer({ marketplaceSecret: () => undefined })(bearer(storeCustomer())), 'c1');
});

test('rechazo cruzado: un token de comprador no es de personal ni al revés, aunque compartan clave', async () => {
  const buyerToken = mpToken('buyer', { userId: 'mp-c1', role: 'SUPER_ADMIN' });
  await assert.rejects(staff()(bearer(buyerToken)), invalid('INVALID_STAFF_IDENTITY'));
  await assert.rejects(staff({ marketplaceSecret: () => BUYER })(bearer(buyerToken)), invalid('INVALID_STAFF_IDENTITY'));
  const staffToken = mpToken('staff', { userId: 'mp-u1', role: 'CUSTOMER' });
  await assert.rejects(buyer()(bearer(staffToken)), invalid('INVALID_BUYER_IDENTITY'));
  await assert.rejects(buyer({ marketplaceSecret: () => STAFF })(bearer(staffToken)), invalid('INVALID_BUYER_IDENTITY'));
  // Y el personal sí acepta el suyo.
  const actor = await staff()(bearer(mpToken('staff', { userId: 'mp-u1', role: 'SUPER_ADMIN' })));
  assert.equal(actor.accountId, 'mp-u1');
});

test('con la clave de la tienda no se falsifica un token "del marketplace" ni pasa uno de otro propósito', async () => {
  const forged = jwt.sign({ userId: 'x', role: 'CUSTOMER', exp: SECONDS + 600 }, STORE,
    { issuer: ISSUER, audience: CONTEXTS.buyer.audience });
  await assert.rejects(buyer()(bearer(forged)), invalid('INVALID_BUYER_IDENTITY'));
  // Como los respaldos retail: firmados con la clave de la tienda pero con destinatario propio.
  const otherPurpose = jwt.sign({ userId: 'x', role: 'SUPER_ADMIN', exp: SECONDS + 600 }, STORE, { audience: 'mrtpv-retail-offline-backup' });
  await assert.rejects(staff()(bearer(otherPurpose)), invalid('INVALID_STAFF_IDENTITY'));
  // Un token del marketplace sin emisor/destinatario, firmado con la clave dedicada, tampoco.
  const bare = jwt.sign({ userId: 'x', role: 'CUSTOMER', exp: SECONDS + 600 }, BUYER);
  await assert.rejects(buyer()(bearer(bare)), invalid('INVALID_BUYER_IDENTITY'));
});

test('MARKETPLACE_ACCEPT_STORE_JWT=false retira la sesión de la tienda; sin ninguna clave, 503', async () => {
  assert.equal(storeSecret(ENV), STORE);
  assert.equal(storeSecret({ ...ENV, MARKETPLACE_ACCEPT_STORE_JWT: 'false' }), undefined);
  await assert.rejects(buyer({ jwtSecret: () => undefined })(bearer(storeCustomer())), invalid('INVALID_BUYER_IDENTITY'));
  await assert.rejects(staff({ jwtSecret: () => undefined })(bearer(storeAdmin())), invalid('INVALID_STAFF_IDENTITY'));
  assert.equal(await buyer({ jwtSecret: () => undefined })(bearer(mpToken('buyer', { userId: 'mp-c1', role: 'CUSTOMER' }))), 'mp-c1');
  await assert.rejects(buyer({ jwtSecret: () => undefined, marketplaceSecret: () => undefined })(bearer(storeCustomer())),
    invalid('BUYER_AUTH_UNAVAILABLE'));
  await assert.rejects(staff({ jwtSecret: () => undefined, marketplaceSecret: () => undefined })(bearer(storeAdmin())),
    invalid('STAFF_AUTH_UNAVAILABLE'));
});

test('vencido o de otro emisor: rechazado', async () => {
  const expired = jwt.sign({ userId: 'mp-c1', role: 'CUSTOMER', exp: SECONDS - 1 }, BUYER,
    { issuer: ISSUER, audience: CONTEXTS.buyer.audience });
  await assert.rejects(buyer()(bearer(expired)), invalid('INVALID_BUYER_IDENTITY'));
  const otherIssuer = jwt.sign({ userId: 'mp-c1', role: 'CUSTOMER', exp: SECONDS + 600 }, BUYER,
    { issuer: 'otro', audience: CONTEXTS.buyer.audience });
  await assert.rejects(buyer()(bearer(otherIssuer)), invalid('INVALID_BUYER_IDENTITY'));
});
