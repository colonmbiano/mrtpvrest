// Pruebas offline del catálogo del cliente (M05). Sin dependencias instaladas:
// Node >= 22.18 elimina los tipos de los módulos .ts importados.
//   node --test apps/client/scripts/marketplace.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Los módulos de la app importan './config' sin extensión (resolución de
// bundler). Este hook añade '.ts' solo a especificadores relativos sin extensión.
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
      return next(specifier + '.ts', context);
    }
    return next(specifier, context);
  }
`)}`);
import {
  parseCatalogParams, catalogHref, catalogSearchParams, storeHref, parseCatalogPage, isStoreSummary,
  isProductSummary, fetchCatalogSection, etaWindow, discountPercent, storeHue, loadCatalog, formatPrice, totalPages, PAGE_SIZE,
} from '../src/lib/marketplace.ts';
import {
  BLOCKED_API_URL, getApiUrl, getMarketplaceApiUrl, getStorePublicUrl,
  isMarketplaceCatalogEnabled, parseOrigin,
} from '../src/lib/config.ts';

const API = 'http://127.0.0.1:4100';
const STORE = { slug: 'tienda-a', name: 'Tienda A', businessType: 'RESTAURANT', isOpen: true, closedMessage: null,
  estimatedDelivery: 30, deliveryFee: 19, freeDeliveryFrom: 250, minOrderAmount: 80 };
const PRODUCT = {
  id: 'p1', name: 'Taco', categoryName: 'Tacos', price: 25, promoPrice: null, likes: 3, currency: 'MXN',
  store: { slug: 'tienda-a', name: 'Tienda A' },
};
const page = (items, extra = {}) => ({ items, page: 1, pageSize: PAGE_SIZE, total: items.length, ...extra });
const base = { q: '', type: '', store: '', storesPage: 1, productsPage: 1 };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function recordingFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: new URL(url), init }); return handler(new URL(url)); };
  return { calls, fetchImpl };
}

function withEnv(vars, fn) {
  const keys = ['NEXT_PUBLIC_MARKETPLACE_ISOLATED', 'NEXT_PUBLIC_MARKETPLACE_CATALOG', 'NEXT_PUBLIC_API_URL',
    'API_URL', 'NEXT_PUBLIC_SITE_URL', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, vars);
  try { return fn(); } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
}

// ── Parámetros de URL ──────────────────────────────────────────────────────

test('parseCatalogParams: defaults sin parámetros', () => {
  assert.deepEqual(parseCatalogParams({}), { state: base, queryTooLong: false });
});

test('parseCatalogParams: recorta q y marca más de 80 caracteres sin truncar', () => {
  assert.equal(parseCatalogParams({ q: '  taco  ' }).state.q, 'taco');
  const long = parseCatalogParams({ q: 'x'.repeat(81) });
  assert.equal(long.queryTooLong, true);
  assert.equal(long.state.q.length, 81);
  assert.equal(parseCatalogParams({ q: 'x'.repeat(80) }).queryTooLong, false);
});

test('parseCatalogParams: descarta arrays, tipos y slugs fuera de formato', () => {
  const { state } = parseCatalogParams({ q: ['a', 'b'], type: 'BAR', store: '../admin', sp: ['2', '3'] });
  assert.deepEqual(state, base);
  assert.equal(parseCatalogParams({ type: 'GROCERY' }).state.type, 'GROCERY');
  assert.equal(parseCatalogParams({ type: 'HARDWARE' }).state.type, 'HARDWARE');
  assert.equal(parseCatalogParams({ type: 'AUTOPARTS' }).state.type, 'AUTOPARTS');
  assert.equal(parseCatalogParams({ store: 'tienda-a' }).state.store, 'tienda-a');
  assert.equal(parseCatalogParams({ store: 'Tienda-A' }).state.store, '');
});

test('parseCatalogParams: páginas inválidas vuelven a 1, sin clamp', () => {
  for (const bad of ['0', '-1', '1.5', 'abc', '10001', '01', '']) {
    assert.equal(parseCatalogParams({ sp: bad }).state.storesPage, 1, bad);
  }
  assert.equal(parseCatalogParams({ sp: '3', pp: '10000' }).state.storesPage, 3);
  assert.equal(parseCatalogParams({ sp: '3', pp: '10000' }).state.productsPage, 10000);
});

test('catalogHref: omite defaults, codifica y conserva la página de la otra sección', () => {
  assert.equal(catalogHref(base), '/');
  const state = { ...base, q: 'pan dulce', storesPage: 2, productsPage: 3 };
  assert.equal(catalogHref(state, { storesPage: 3 }, 'tiendas'), '/?q=pan+dulce&sp=3&pp=3#tiendas');
  assert.equal(catalogHref(state, { store: 'tienda-a', productsPage: 1 }), '/?q=pan+dulce&store=tienda-a&sp=2');
  // Ida y vuelta: lo que genera el enlace se vuelve a leer igual.
  const href = catalogHref({ ...base, q: 'a&b=c', type: 'RETAIL', storesPage: 4 });
  const parsed = parseCatalogParams(Object.fromEntries(new URL(href, 'http://x').searchParams));
  assert.deepEqual(parsed.state, { ...base, q: 'a&b=c', type: 'RETAIL', storesPage: 4 });
});

test('catalogSearchParams: el reintento reenvía filtros y páginas de ambas secciones', () => {
  assert.deepEqual([...catalogSearchParams(base).entries()], []);
  const state = { q: 'pan', type: 'GROCERY', store: 'tienda-a', storesPage: 2, productsPage: 4 };
  assert.deepEqual(Object.fromEntries(catalogSearchParams(state)),
    { q: 'pan', type: 'GROCERY', store: 'tienda-a', sp: '2', pp: '4' });
});

test('storeHref: solo slugs de un segmento, enlace relativo de mismo origen', () => {
  assert.equal(storeHref('tienda-a'), '/tienda-a');
  for (const bad of ['', 'a/b', '../x', 'Tienda', '//evil.com', 'https://x', 'a'.repeat(101), null, 42]) {
    assert.equal(storeHref(bad), null, String(bad));
  }
});

// ── Validación de respuesta ────────────────────────────────────────────────

test('parseCatalogPage: acepta el envelope del contrato', () => {
  assert.deepEqual(parseCatalogPage(page([STORE]), isStoreSummary), page([STORE]));
  // Página más allá del final: items vacíos con total real.
  assert.deepEqual(parseCatalogPage(page([], { page: 5, total: 3 }), isStoreSummary), page([], { page: 5, total: 3 }));
});

test('parseCatalogPage: un item fuera de contrato invalida toda la respuesta', () => {
  assert.equal(parseCatalogPage(page([STORE, { ...STORE, slug: 'Mala/Ruta' }]), isStoreSummary), null);
  assert.equal(parseCatalogPage(page([STORE], { pageSize: 0 }), isStoreSummary), null);
  assert.equal(parseCatalogPage(page([STORE], { total: -1 }), isStoreSummary), null);
  assert.equal(parseCatalogPage(page([STORE, STORE], { pageSize: 1 }), isStoreSummary), null);
  assert.equal(parseCatalogPage({ items: 'x', page: 1, pageSize: 12, total: 0 }, isStoreSummary), null);
  assert.equal(parseCatalogPage(null, isStoreSummary), null);
});

test('isProductSummary: precio finito no negativo, moneda ISO y tienda válida', () => {
  assert.equal(isProductSummary(PRODUCT), true);
  assert.equal(isProductSummary({ ...PRODUCT, price: Number.NaN }), false);
  assert.equal(isProductSummary({ ...PRODUCT, price: -1 }), false);
  assert.equal(isProductSummary({ ...PRODUCT, price: '25' }), false);
  assert.equal(isProductSummary({ ...PRODUCT, currency: 'mxn' }), false);
  assert.equal(isProductSummary({ ...PRODUCT, store: { slug: 'x/y', name: 'X' } }), false);
  assert.equal(isProductSummary({ ...PRODUCT, store: undefined }), false);
});

test('totalPages y formatPrice', () => {
  assert.equal(totalPages(page([], { total: 0 })), 1);
  assert.equal(totalPages(page([], { total: 25 })), 3);
  assert.match(formatPrice(25, 'MXN'), /^\$25$/);
  assert.match(formatPrice(49.5, 'MXN'), /^\$49\.50$/);
  assert.equal(formatPrice(25, 'ZZZZ'), '25 ZZZZ');
  assert.equal(formatPrice(49.5, 'ZZZZ'), '49.50 ZZZZ');
});

// ── Fetch por sección ──────────────────────────────────────────────────────

test('fetchCatalogSection: sin URL de API devuelve config y no llama a la red', async () => {
  const { calls, fetchImpl } = recordingFetch(() => jsonResponse(page([])));
  assert.deepEqual(await fetchCatalogSection(null, 'stores', {}, isStoreSummary, { fetchImpl }),
    { status: 'error', reason: 'config' });
  assert.equal(calls.length, 0);
});

test('fetchCatalogSection: construye la URL del contrato sin parámetros vacíos y sin caché', async () => {
  const { calls, fetchImpl } = recordingFetch(() => jsonResponse(page([STORE])));
  const result = await fetchCatalogSection(API, 'stores',
    { q: 'café & pan', businessType: '', page: 2, pageSize: 12 }, isStoreSummary, { fetchImpl });
  assert.equal(result.status, 'ok');
  const { url, init } = calls[0];
  assert.equal(url.origin + url.pathname, `${API}/api/marketplace/stores`);
  assert.deepEqual(Object.fromEntries(url.searchParams), { q: 'café & pan', page: '2', pageSize: '12' });
  assert.equal(init.cache, 'no-store');
  assert.ok(init.signal instanceof AbortSignal);
});

test('fetchCatalogSection: 400 es invalid; 5xx, red y JSON roto son unavailable', async () => {
  const run = (handler) => fetchCatalogSection(API, 'products', {}, isProductSummary,
    { fetchImpl: async () => handler() });
  assert.deepEqual(await run(() => jsonResponse({ errorCode: 'INVALID_QUERY' }, 400)), { status: 'error', reason: 'invalid' });
  assert.deepEqual(await run(() => jsonResponse({ errorCode: 'CATALOG_UNAVAILABLE' }, 503)), { status: 'error', reason: 'unavailable' });
  assert.deepEqual(await run(() => { throw new TypeError('fetch failed'); }), { status: 'error', reason: 'unavailable' });
  assert.deepEqual(await run(() => new Response('<html>', { status: 200 })), { status: 'error', reason: 'unavailable' });
  assert.deepEqual(await run(() => jsonResponse(page([{ ...PRODUCT, secretCost: 1, price: -5 }]))), { status: 'error', reason: 'unavailable' });
});

test('fetchCatalogSection: un timeout se reporta como unavailable', async () => {
  const fetchImpl = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  // AbortSignal.timeout no retiene el event loop (en el servidor sí hay sockets
  // abiertos); este timer lo mantiene vivo mientras dura la prueba.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    assert.deepEqual(await fetchCatalogSection(API, 'stores', {}, isStoreSummary, { fetchImpl, timeoutMs: 10 }),
      { status: 'error', reason: 'unavailable' });
  } finally {
    clearTimeout(keepAlive);
  }
});

// ── Carga de la portada ────────────────────────────────────────────────────

test('loadCatalog: tipo solo filtra tiendas y tienda solo filtra productos', async () => {
  const { calls, fetchImpl } = recordingFetch((url) =>
    jsonResponse(url.pathname.endsWith('/stores') ? page([STORE]) : page([PRODUCT])));
  const state = { ...base, q: 'taco', type: 'RESTAURANT', store: 'tienda-a', storesPage: 2, productsPage: 3 };
  const result = await loadCatalog(API, state, false, { fetchImpl });
  assert.equal(result.stores.status, 'ok');
  assert.equal(result.products.status, 'ok');
  const byPath = Object.fromEntries(calls.map(({ url }) => [url.pathname, Object.fromEntries(url.searchParams)]));
  assert.deepEqual(byPath['/api/marketplace/stores'], { q: 'taco', businessType: 'RESTAURANT', page: '2', pageSize: '12' });
  assert.deepEqual(byPath['/api/marketplace/products'], { q: 'taco', store: 'tienda-a', page: '3', pageSize: '12' });
});

test('loadCatalog: errores independientes por sección', async () => {
  const fetchImpl = async (url) => (new URL(url).pathname.endsWith('/stores')
    ? jsonResponse({}, 503) : jsonResponse(page([PRODUCT])));
  const result = await loadCatalog(API, base, false, { fetchImpl });
  assert.deepEqual(result.stores, { status: 'error', reason: 'unavailable' });
  assert.equal(result.products.status, 'ok');
});

test('loadCatalog: búsqueda demasiado larga no llama a la API', async () => {
  const { calls, fetchImpl } = recordingFetch(() => jsonResponse(page([])));
  const result = await loadCatalog(API, base, true, { fetchImpl });
  assert.equal(calls.length, 0);
  assert.deepEqual(result.stores, { status: 'error', reason: 'invalid' });
  assert.deepEqual(result.products, { status: 'error', reason: 'invalid' });
});

// ── Configuración y aislamiento ────────────────────────────────────────────

test('parseOrigin: origen exacto; https fuera de loopback', () => {
  assert.equal(parseOrigin('http://127.0.0.1:4100', { loopbackOnly: true }), 'http://127.0.0.1:4100');
  assert.equal(parseOrigin('http://127.0.0.1:4100/', { loopbackOnly: true }), 'http://127.0.0.1:4100');
  assert.equal(parseOrigin('https://api.mrtpvrest.com', { loopbackOnly: true }), null);
  assert.equal(parseOrigin('https://api.example.com', { loopbackOnly: false }), 'https://api.example.com');
  assert.equal(parseOrigin('http://api.example.com', { loopbackOnly: false }), null);
  for (const bad of ['http://127.0.0.1:4100/api', 'http://u:p@127.0.0.1', 'http://127.0.0.1?x=1', 'ftp://127.0.0.1', 'nope', undefined]) {
    assert.equal(parseOrigin(bad, { loopbackOnly: false }), null, String(bad));
  }
});

test('modo aislado: nunca usa producción; sin config apunta al destino bloqueado', () => {
  withEnv({ NEXT_PUBLIC_MARKETPLACE_ISOLATED: 'true', NODE_ENV: 'production' }, () => {
    assert.equal(getMarketplaceApiUrl(), null);
    assert.equal(getApiUrl(), BLOCKED_API_URL);
    assert.equal(isMarketplaceCatalogEnabled(), true);
  });
  withEnv({ NEXT_PUBLIC_MARKETPLACE_ISOLATED: 'true', NEXT_PUBLIC_API_URL: 'https://api.mrtpvrest.com' }, () => {
    assert.equal(getMarketplaceApiUrl(), null);
    assert.equal(getApiUrl(), BLOCKED_API_URL);
  });
  withEnv({ NEXT_PUBLIC_MARKETPLACE_ISOLATED: 'true', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4100' }, () => {
    assert.equal(getMarketplaceApiUrl(), 'http://127.0.0.1:4100');
    assert.equal(getApiUrl(), 'http://127.0.0.1:4100');
  });
});

test('sin banderas: se conserva el comportamiento productivo y el catálogo queda apagado', () => {
  withEnv({ NODE_ENV: 'production' }, () => {
    assert.equal(isMarketplaceCatalogEnabled(), false);
    assert.equal(getApiUrl(), 'https://api.mrtpvrest.com');
    // El catálogo global nunca hereda el default productivo.
    assert.equal(getMarketplaceApiUrl(), null);
    assert.equal(getStorePublicUrl('tienda-a'), 'https://tienda-a.mrtpvrest.com');
  });
  withEnv({ NODE_ENV: 'development' }, () => {
    assert.equal(getApiUrl(), 'http://localhost:3001');
  });
});

test('cartShareUrl: en el marketplace apunta a /<slug>, no a la raíz del catálogo', async () => {
  const { cartShareUrl } = await import('../src/lib/cartLink.ts');
  const lines = [{ menuItemId: 'm1', quantity: 2 }];
  withEnv({ NEXT_PUBLIC_MARKETPLACE_ISOLATED: 'true', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:4103' }, () => {
    assert.match(cartShareUrl('tienda-a', lines), /^http:\/\/127\.0\.0\.1:4103\/tienda-a\?cart=[\w-]+$/);
  });
  withEnv({ NEXT_PUBLIC_MARKETPLACE_ISOLATED: 'true' }, () => {
    assert.match(cartShareUrl('tienda-a', lines), /^\/tienda-a\?cart=[\w-]+$/);
  });
  withEnv({}, () => {
    assert.match(cartShareUrl('tienda-a', lines), /^https:\/\/tienda-a\.mrtpvrest\.com\/\?cart=[\w-]+$/);
  });
});

test('getStorePublicUrl: mismo origen en el marketplace, nunca el subdominio productivo', () => {
  withEnv({ NEXT_PUBLIC_MARKETPLACE_ISOLATED: 'true', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:4103' }, () => {
    assert.equal(getStorePublicUrl('tienda-a'), 'http://127.0.0.1:4103/tienda-a');
  });
  withEnv({ NEXT_PUBLIC_MARKETPLACE_ISOLATED: 'true' }, () => {
    assert.equal(getStorePublicUrl('tienda-a'), null);
  });
  withEnv({ NEXT_PUBLIC_MARKETPLACE_ISOLATED: 'true', NEXT_PUBLIC_SITE_URL: 'https://mrtpvrest.com' }, () => {
    assert.equal(getStorePublicUrl('tienda-a'), null);
  });
  withEnv({ NEXT_PUBLIC_MARKETPLACE_CATALOG: 'true', NEXT_PUBLIC_SITE_URL: 'https://staging.example.com' }, () => {
    assert.equal(getStorePublicUrl('tienda-a'), 'https://staging.example.com/tienda-a');
  });
});

test('contrato extendido: datos de entrega, promo vigente y me gusta', () => {
  assert.equal(isStoreSummary({ ...STORE, deliveryFee: null, estimatedDelivery: null, isOpen: false, closedMessage: 'Abre 9:00' }), true);
  assert.equal(isStoreSummary({ ...STORE, isOpen: 'true' }), false);
  assert.equal(isStoreSummary({ ...STORE, deliveryFee: -1 }), false);
  assert.equal(isStoreSummary({ ...STORE, estimatedDelivery: 12.5 }), false);
  const { isOpen, ...withoutOpen } = STORE;
  assert.equal(isStoreSummary(withoutOpen), false);
  assert.equal(isProductSummary({ ...PRODUCT, promoPrice: 20 }), true);
  assert.equal(isProductSummary({ ...PRODUCT, promoPrice: 30 }), false);
  assert.equal(isProductSummary({ ...PRODUCT, likes: -2 }), false);
  assert.equal(etaWindow(30), '25–35 min');
  assert.equal(etaWindow(null), null);
  assert.equal(discountPercent({ ...PRODUCT, promoPrice: 20 }), 20);
  assert.equal(discountPercent(PRODUCT), null);
  assert.equal(storeHue('tienda-a'), storeHue('tienda-a'));
  assert.ok(storeHue('tienda-a') >= 0 && storeHue('tienda-a') < 360);
});

test('nuevos tipos de negocio: HARDWARE y AUTOPARTS', () => {
  const hardwareStore = { ...STORE, slug: 'ferreteria-1', name: 'Ferretería Central', businessType: 'HARDWARE' };
  const autopartsStore = { ...STORE, slug: 'refaccionaria-1', name: 'Repuestos Express', businessType: 'AUTOPARTS' };
  assert.equal(isStoreSummary(hardwareStore), true);
  assert.equal(isStoreSummary(autopartsStore), true);
  assert.equal(parseCatalogParams({ type: 'HARDWARE' }).state.type, 'HARDWARE');
  assert.equal(parseCatalogParams({ type: 'AUTOPARTS' }).state.type, 'AUTOPARTS');
  const href = catalogHref({ ...base, type: 'HARDWARE' }, {}, 'tiendas');
  assert.ok(href.includes('type=HARDWARE'));
  const storeLink = storeHref(hardwareStore.slug);
  assert.equal(storeLink, '/ferreteria-1');
});
