'use strict';

const { MemoryStore } = require('express-rate-limit');

const INCREMENT = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {hits, ttl}
`;
const DECREMENT = `
local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
if hits > 0 then redis.call('DECR', KEYS[1]) end
return 1
`;

function createIdentityRedis(url = process.env.REDIS_URL) {
  if (!url) return null;
  try {
    const Redis = require('ioredis');
    const redis = new Redis(url, {
      maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 3000,
    });
    redis.on('error', () => {});
    return redis;
  } catch {
    return null;
  }
}

class IdentityRateStore {
  constructor(prefix, redis = null) {
    this.prefix = 'marketplace:identity:' + prefix + ':';
    this.redis = redis;
    this.localKeys = false;
    this.memory = new MemoryStore();
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  async increment(key) {
    // Se cuenta también en memoria cuando Redis funciona para conservar los
    // intentos de esta instancia si el servicio cae a mitad de la ventana.
    const local = await this.memory.increment(key);
    if (!this.redis) return local;
    try {
      const [hits, ttl] = await this.redis.eval(INCREMENT, 1, this.prefix + key, this.windowMs);
      if (!Number.isSafeInteger(Number(hits)) || Number(hits) < 1 || Number(ttl) < 0) return local;
      return Number(hits) >= local.totalHits
        ? { totalHits: Number(hits), resetTime: new Date(Date.now() + Number(ttl)) }
        : local;
    } catch {
      return local;
    }
  }

  async decrement(key) {
    await this.memory.decrement(key);
    try { await this.redis?.eval(DECREMENT, 1, this.prefix + key); } catch {}
  }

  async resetKey(key) {
    await this.memory.resetKey(key);
    try { await this.redis?.del(this.prefix + key); } catch {}
  }

  shutdown() {
    this.memory.shutdown();
  }
}

module.exports = { IdentityRateStore, createIdentityRedis };
