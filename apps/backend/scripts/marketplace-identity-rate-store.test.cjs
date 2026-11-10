'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IdentityRateStore, createIdentityRedis } = require('../src/lib/marketplace-identity-rate-store');

function store(name, redis) {
  const value = new IdentityRateStore(name, redis);
  value.init({ windowMs: 60_000 });
  return value;
}

test('sin Redis aplica el límite en memoria y permite restablecer una clave', async () => {
  assert.equal(createIdentityRedis(''), null);
  const s = store('signup');
  try {
    assert.equal((await s.increment('ip')).totalHits, 1);
    assert.equal((await s.increment('ip')).totalHits, 2);
    await s.resetKey('ip');
    assert.equal((await s.increment('ip')).totalHits, 1);
  } finally { s.shutdown(); }
});

test('la caída de Redis conserva los intentos de la ventana local', async () => {
  let hits = 0, fail = false;
  const s = store('auth', { eval: async () => {
    if (fail) throw Error('redis unavailable');
    return [++hits, 60_000];
  } });
  try {
    assert.equal((await s.increment('ip')).totalHits, 1);
    assert.equal((await s.increment('ip')).totalHits, 2);
    fail = true;
    assert.equal((await s.increment('ip')).totalHits, 3);
    fail = false;
    assert.equal((await s.increment('ip')).totalHits, 4);
  } finally { s.shutdown(); }
});

test('dos instancias comparten contador Redis y separan los cuatro límites', async () => {
  const keys = new Map();
  const redis = { eval: async (_script, count, key, ttl) => {
    assert.equal(count, 1);
    keys.set(key, (keys.get(key) || 0) + 1);
    return [keys.get(key), ttl];
  } };
  const a = store('auth', redis), b = store('auth', redis);
  const others = ['signup', 'mail', 'token'].map(name => store(name, redis));
  try {
    assert.equal((await a.increment('ip')).totalHits, 1);
    assert.equal((await b.increment('ip')).totalHits, 2);
    for (const other of others) assert.equal((await other.increment('ip')).totalHits, 1);
    assert.equal(keys.size, 4);
  } finally { [a, b, ...others].forEach(s => s.shutdown()); }
});
