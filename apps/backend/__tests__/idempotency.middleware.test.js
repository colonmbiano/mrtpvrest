// Tests del middleware de idempotencia (camino en memoria, sin REDIS_URL).
// El camino Redis comparte toda la lógica salvo el GET/SET remoto y cae a
// memoria ante cualquier fallo, así que esto cubre el contrato completo.

const idempotency = require('../src/middleware/idempotency.middleware');

function makeReq({ key, method = 'POST', restaurantId = 'rest-1' } = {}) {
  return {
    method,
    restaurantId,
    headers: key ? { 'idempotency-key': key } : {},
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return res;
}

async function run(req, res) {
  let called = false;
  await idempotency(req, res, () => { called = true; });
  return called;
}

describe('idempotencyMiddleware (memoria)', () => {
  test('sin header pasa directo', async () => {
    const res = makeRes();
    expect(await run(makeReq({}), res)).toBe(true);
  });

  test('GET no aplica aunque traiga key', async () => {
    expect(await run(makeReq({ key: 'k-get', method: 'GET' }), makeRes())).toBe(true);
    expect(await run(makeReq({ key: 'k-get', method: 'GET' }), makeRes())).toBe(true);
  });

  test('replay devuelve la respuesta original sin re-ejecutar el handler', async () => {
    const key = `k-${Date.now()}-replay`;
    const res1 = makeRes();
    expect(await run(makeReq({ key }), res1)).toBe(true);
    res1.status(201).json({ orderId: 'abc' }); // el handler responde 2xx

    const res2 = makeRes();
    expect(await run(makeReq({ key }), res2)).toBe(false); // NO llega al handler
    expect(res2.statusCode).toBe(201);
    expect(res2.body).toEqual({ orderId: 'abc' });
    expect(res2.headers['X-Idempotent-Replay']).toBe('true');
  });

  test('errores (no-2xx) NO se cachean — el cliente puede reintentar', async () => {
    const key = `k-${Date.now()}-err`;
    const res1 = makeRes();
    await run(makeReq({ key }), res1);
    res1.status(422).json({ error: 'inválido' });

    const res2 = makeRes();
    expect(await run(makeReq({ key }), res2)).toBe(true); // sí re-ejecuta
  });

  test('misma key en tenants distintos NO colisiona', async () => {
    const key = `k-${Date.now()}-tenant`;
    const res1 = makeRes();
    await run(makeReq({ key, restaurantId: 'rest-A' }), res1);
    res1.status(200).json({ from: 'A' });

    const res2 = makeRes();
    expect(await run(makeReq({ key, restaurantId: 'rest-B' }), res2)).toBe(true);
  });
});
