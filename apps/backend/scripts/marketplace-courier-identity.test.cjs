'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCourierActorResolver, COURIER_TOKEN_TTL_S } = require('../src/lib/marketplace-courier-identity');
const { signMarketplaceToken } = require('../src/lib/marketplace-jwt');

const SECRET = 'c'.repeat(48);
const bearer = token => ({ headers: { authorization: `Bearer ${token}` } });

test('courier resolver: a valid courier token resolves to a COURIER actor', async () => {
  const token = signMarketplaceToken('courier', { accountId: 'acc-1', role: 'COURIER' },
    { env: { MARKETPLACE_COURIER_JWT_SECRET: SECRET }, expiresIn: COURIER_TOKEN_TTL_S });
  const resolve = createCourierActorResolver({ marketplaceSecret: () => SECRET });
  assert.deepEqual(await resolve(bearer(token)),
    { id: 'acc-1', accountId: 'acc-1', roles: ['COURIER'], isActive: true, isDevice: false });
});

test('courier resolver: returns null (never throws) when it is not a courier token', async () => {
  const resolve = createCourierActorResolver({ marketplaceSecret: () => SECRET });
  assert.equal(await resolve({ headers: {} }), null);                               // sin Authorization
  assert.equal(await resolve({ headers: { authorization: 'Basic x' } }), null);     // no Bearer
  assert.equal(await resolve(bearer('not.a.jwt')), null);                           // basura
  // Token de otro contexto (buyer): audiencia/clave distintas -> no verifica -> null (cae a otra credencial).
  const buyerToken = signMarketplaceToken('buyer', { accountId: 'acc-1', role: 'BUYER' },
    { env: { MARKETPLACE_BUYER_JWT_SECRET: 'b'.repeat(48) } });
  assert.equal(await resolve(bearer(buyerToken)), null);
  // Sin clave configurada: null, nunca lanza.
  const noKey = createCourierActorResolver({ marketplaceSecret: () => undefined });
  const token = signMarketplaceToken('courier', { accountId: 'a', role: 'COURIER' },
    { env: { MARKETPLACE_COURIER_JWT_SECRET: SECRET } });
  assert.equal(await noKey(bearer(token)), null);
});

test('courier resolver: rejects wrong role and expired tokens', async () => {
  const resolve = createCourierActorResolver({ marketplaceSecret: () => SECRET });
  const wrongRole = signMarketplaceToken('courier', { accountId: 'a', role: 'BUYER' },
    { env: { MARKETPLACE_COURIER_JWT_SECRET: SECRET } });
  assert.equal(await resolve(bearer(wrongRole)), null);
  const expired = signMarketplaceToken('courier', { accountId: 'a', role: 'COURIER' },
    { env: { MARKETPLACE_COURIER_JWT_SECRET: SECRET }, expiresIn: -10 });
  assert.equal(await resolve(bearer(expired)), null);
});
