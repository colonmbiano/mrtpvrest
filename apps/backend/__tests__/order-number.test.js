'use strict';

const { nextOrderSeq, nextOrderNumber } = require('../src/lib/order-number');

// Cliente Prisma falso: simula counter.{updateMany,findUnique,create} y
// order.count con una "tabla" en memoria keyed por restaurantId+scope.
function makeFakeClient(initial = {}) {
  // initial: { [restaurantId]: { counter?: number, orderCount?: number } }
  const counters = new Map(); // key `${rid}:${scope}` → { value }
  const orderCounts = new Map(); // rid → number
  for (const [rid, cfg] of Object.entries(initial)) {
    if (typeof cfg.counter === 'number') counters.set(`${rid}:order`, { value: cfg.counter });
    if (typeof cfg.orderCount === 'number') orderCounts.set(rid, cfg.orderCount);
  }

  const calls = { updateMany: 0, create: 0, findUnique: 0, count: 0 };

  const client = {
    counter: {
      async updateMany({ where, data }) {
        calls.updateMany++;
        const key = `${where.restaurantId}:${where.scope}`;
        const row = counters.get(key);
        if (!row) return { count: 0 };
        row.value += data.value.increment;
        return { count: 1 };
      },
      async findFirst({ where }) {
        calls.findUnique++;
        const { restaurantId, scope } = where;
        const row = counters.get(`${restaurantId}:${scope}`);
        return row ? { value: row.value } : null;
      },
      async create({ data }) {
        calls.create++;
        const key = `${data.restaurantId}:${data.scope}`;
        if (counters.has(key)) {
          const e = new Error('Unique constraint');
          e.code = 'P2002';
          throw e;
        }
        counters.set(key, { value: data.value });
        return { value: data.value };
      },
    },
    order: {
      async count({ where }) {
        calls.count++;
        return orderCounts.get(where.restaurantId) || 0;
      },
    },
    __calls: calls,
    __counters: counters,
  };
  return client;
}

describe('order-number :: nextOrderSeq', () => {
  test('camino rápido: contador existente se incrementa atómicamente', async () => {
    const client = makeFakeClient({ r1: { counter: 41 } });
    const seq = await nextOrderSeq(client, 'r1');
    expect(seq).toBe(42);
    expect(client.__calls.create).toBe(0); // no toca el camino frío
    expect(client.__calls.count).toBe(0);  // no cuenta órdenes si ya hay contador
  });

  test('camino frío: sin contador, siembra desde el histórico de órdenes', async () => {
    // 500 órdenes históricas → el primer folio nuevo es 501 (conteo continuo).
    const client = makeFakeClient({ r1: { orderCount: 500 } });
    const seq = await nextOrderSeq(client, 'r1');
    expect(seq).toBe(501);
    expect(client.__calls.create).toBe(1);
  });

  test('restaurante nuevo sin órdenes arranca en 1', async () => {
    const client = makeFakeClient({});
    const seq = await nextOrderSeq(client, 'nuevo');
    expect(seq).toBe(1);
  });

  test('folios consecutivos sin repetir (serie monótona)', async () => {
    const client = makeFakeClient({ r1: { orderCount: 0 } });
    const a = await nextOrderSeq(client, 'r1'); // siembra → 1
    const b = await nextOrderSeq(client, 'r1'); // incrementa → 2
    const c = await nextOrderSeq(client, 'r1'); // incrementa → 3
    expect([a, b, c]).toEqual([1, 2, 3]);
  });

  test('contadores independientes por restaurante (multi-tenant)', async () => {
    const client = makeFakeClient({ r1: { counter: 10 }, r2: { counter: 99 } });
    expect(await nextOrderSeq(client, 'r1')).toBe(11);
    expect(await nextOrderSeq(client, 'r2')).toBe(100);
    expect(await nextOrderSeq(client, 'r1')).toBe(12);
  });

  test('sin restaurantId lanza error', async () => {
    const client = makeFakeClient({});
    await expect(nextOrderSeq(client, '')).rejects.toThrow(/restaurantId/);
  });
});

describe('order-number :: nextOrderNumber', () => {
  test('devuelve el folio como string ("solo número")', async () => {
    const client = makeFakeClient({ r1: { counter: 999 } });
    const num = await nextOrderNumber(client, 'r1');
    expect(num).toBe('1000');
    expect(typeof num).toBe('string');
  });
});
