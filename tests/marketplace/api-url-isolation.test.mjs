// Bloqueos 1 y 2 de MARKETPLACE-STAGING.md: en la copia aislada ninguna app usa
// la API productiva ni el override de localStorage. Sin dependencias instaladas:
//   node --test tests/marketplace/api-url-isolation.test.mjs   (Node >= 22.18)
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// axios no está instalado: se sustituye por un stub que expone la config de
// create(). Los imports relativos sin extensión resuelven a .ts (bundler) y
// heredan el ?v= del padre, para que cada caso cargue también módulos frescos.
const AXIOS_STUB = `data:text/javascript,${encodeURIComponent(`
  const create = (defaults = {}) => ({ defaults, interceptors: { request: { use() {} }, response: { use() {} } } });
  export default { create };
`)}`;
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === 'axios') return { url: ${JSON.stringify(AXIOS_STUB)}, shortCircuit: true };
    if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]sx?(\\?.*)?$/.test(specifier)) {
      const query = context.parentURL ? new URL(context.parentURL).search : '';
      return next(specifier + '.ts' + query, context);
    }
    return next(specifier, context);
  }
`)}`);

const PROD = 'https://api.mrtpvrest.com';
const LOCAL = 'http://127.0.0.1:4100';
const BLOCKED = 'http://127.0.0.1:9';
const ENV_KEYS = ['NEXT_PUBLIC_MARKETPLACE_ISOLATED', 'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_BACKEND_URL'];

// Entorno y navegador simulados: un override productivo en localStorage y
// window en https (meseros-lite elige producción con https).
async function withEnv(vars, fn, { browser = false } = {}) {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, vars);
  if (browser) {
    globalThis.window = { location: { protocol: 'https:' }, dispatchEvent() {} };
    globalThis.localStorage = { getItem: () => PROD, setItem() {}, removeItem() {} };
  }
  try { return await fn(); } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
}

let bust = 0;
// Kiosk y SaaS resuelven la URL al cargar el módulo: import fresco por caso.
const fresh = (path) => import(`${new URL(path, import.meta.url).href}?v=${++bust}`);

const getters = {
  tpv: '../../apps/tpv/src/lib/config.ts',
  tokki: '../../apps/tokki/src/lib/config.ts',
  moda: '../../apps/moda/src/lib/config.ts',
  'meseros-lite': '../../apps/meseros-lite/src/lib/config.ts',
  kds: '../../apps/kds/src/lib/api.ts',
};
const moduleLevel = {
  kiosk: async () => (await fresh('../../apps/kiosk/src/lib/api.ts')).default.defaults.baseURL,
  'kiosk auth': async () => (await fresh('../../apps/kiosk/src/lib/auth-api.ts')).makeAuthApi('t').defaults.baseURL,
  saas: async () => (await fresh('../../apps/saas/lib/api.ts')).default.defaults.baseURL,
};

async function resolveAll() {
  const out = {};
  for (const [app, path] of Object.entries(getters)) out[app] = (await fresh(path)).getApiUrl();
  for (const [app, read] of Object.entries(moduleLevel)) out[app] = await read();
  return out;
}

const apps = [...Object.keys(getters), ...Object.keys(moduleLevel)];

test('aislado con API loopback: todas las apps la usan e ignoran el override productivo', async () => {
  const urls = await withEnv({ NEXT_PUBLIC_MARKETPLACE_ISOLATED: 'true', NEXT_PUBLIC_API_URL: `${LOCAL}/` },
    resolveAll, { browser: true });
  for (const app of apps) assert.equal(urls[app], LOCAL, app);
});

test('aislado sin API o con API productiva: destino bloqueado, nunca producción', async () => {
  for (const vars of [{}, { NEXT_PUBLIC_API_URL: PROD }, { NEXT_PUBLIC_API_URL: 'no-es-url' }]) {
    const urls = await withEnv({ NEXT_PUBLIC_MARKETPLACE_ISOLATED: 'true', ...vars }, resolveAll, { browser: true });
    for (const app of apps) assert.equal(urls[app], BLOCKED, `${app} ${JSON.stringify(vars)}`);
  }
});

test('sin bandera: se conserva el comportamiento previo (default productivo)', async () => {
  const urls = await withEnv({}, resolveAll);
  for (const app of ['tpv', 'tokki', 'moda', 'kds', 'kiosk', 'kiosk auth', 'saas']) {
    assert.equal(urls[app], PROD, app);
  }
  // meseros-lite fuera de navegador cae a su backend local de desarrollo.
  assert.equal(urls['meseros-lite'], 'http://localhost:3001');
});

test('sin bandera: el override de localStorage sigue ganando en TPV, Tokki, Moda y KDS', async () => {
  const urls = await withEnv({ NEXT_PUBLIC_API_URL: LOCAL }, resolveAll, { browser: true });
  for (const app of ['tpv', 'tokki', 'moda', 'kds']) assert.equal(urls[app], PROD, app);
  for (const app of ['meseros-lite', 'kiosk', 'kiosk auth', 'saas']) assert.equal(urls[app], LOCAL, app);
});
