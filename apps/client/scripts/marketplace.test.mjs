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
  isMarketplaceCatalogEnabled, isMarketplacePreviewDemo, parseOrigin,
} from '../src/lib/config.ts';
// marketplace-preview.ts importa './marketplace' sin extensión: se carga con
// import() dinámico para que el hook de resolución ya esté registrado (los
// import estáticos se evalúan antes de register()).
const { loadPreviewCatalog } = await import('../src/lib/marketplace-preview.ts');

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
    'API_URL', 'NEXT_PUBLIC_SITE_URL', 'NODE_ENV', 'VERCEL_ENV', 'VERCEL_GIT_COMMIT_REF'];
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

test('imagen pública opcional: solo URL HTTPS válida', () => {
  assert.equal(isStoreSummary({ ...STORE, logoUrl: 'https://cdn.example.com/store.jpg' }), true);
  assert.equal(isStoreSummary({ ...STORE, logoUrl: 'javascript:alert(1)' }), false);
  assert.equal(isProductSummary({ ...PRODUCT, imageUrl: 'https://cdn.example.com/item.png' }), true);
  assert.equal(isProductSummary({ ...PRODUCT, imageUrl: 'data:image/svg+xml;base64,xxx' }), false);
  assert.equal(isProductSummary({ ...PRODUCT, imageUrl: 'http://localhost/private.jpg' }), false);
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

test('Vercel Preview de la rama Marketplace habilita solo demo y no producción', () => {
  withEnv({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feature/marketplace-hibrido' }, () => {
    assert.equal(isMarketplacePreviewDemo(), true);
    assert.equal(isMarketplaceCatalogEnabled(), true);
    assert.equal(getMarketplaceApiUrl(), null);
    const result = loadPreviewCatalog(base, false);
    assert.equal(result.stores.status, 'ok');
    assert.equal(result.products.status, 'ok');
    assert.ok(result.stores.data.items.length > 0);
    assert.ok(result.products.data.items.every(p => p.store.slug.startsWith('demo-')));
  });
  for (const vars of [
    { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'feature/marketplace-hibrido' },
    { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'master' },
    { VERCEL_ENV: 'preview' },
  ]) withEnv(vars, () => {
    assert.equal(isMarketplacePreviewDemo(), false);
    assert.equal(isMarketplaceCatalogEnabled(), false);
  });
});

test('Master Burguer’s y Tokki Boba aparecen primero como fichas de muestra', () => {
  const result = loadPreviewCatalog(base, false);
  assert.equal(result.stores.status, 'ok');
  if (result.stores.status !== 'ok') return;
  assert.deepEqual(result.stores.data.items.slice(0, 2).map(s => [s.slug, s.name]), [
    ['master-burguer-s', 'Master Burguer’s'],
    ['tokki-bobba', 'Tokki Boba'],
  ]);
  const searchMaster = loadPreviewCatalog({ ...base, q: 'master' }, false);
  const searchTokki = loadPreviewCatalog({ ...base, q: 'tokki' }, false);
  assert.equal(searchMaster.stores.status, 'ok');
  assert.equal(searchTokki.stores.status, 'ok');
  if (searchMaster.stores.status === 'ok' && searchTokki.stores.status === 'ok') {
    assert.deepEqual(searchMaster.stores.data.items.map(s => s.slug), ['master-burguer-s']);
    assert.deepEqual(searchTokki.stores.data.items.map(s => s.slug), ['tokki-bobba']);
  }
  const restaurantFilter = loadPreviewCatalog({ ...base, type: 'RESTAURANT' }, false);
  assert.equal(restaurantFilter.stores.status, 'ok');
  if (restaurantFilter.stores.status === 'ok') {
    const slugs = restaurantFilter.stores.data.items.map(s => s.slug);
    assert.ok(slugs.includes('master-burguer-s'));
    assert.ok(slugs.includes('tokki-bobba'));
  }
  // El preview no inventa precios, horario ni productos de estos negocios reales.
  assert.equal(result.products.status, 'ok');
  if (result.products.status === 'ok') {
    assert.ok(!result.products.data.items.some(p => ['master-burguer-s', 'tokki-bobba'].includes(p.store.slug)));
  }
});

test('demo de portada respeta búsqueda, giro, tienda y página sin tocar la API', () => {
  const noResults = loadPreviewCatalog({ ...base, q: 'esta tienda no existe' }, false);
  assert.equal(noResults.stores.data.total, 0);
  assert.equal(noResults.products.data.total, 0);
  const hardware = loadPreviewCatalog({ ...base, type: 'HARDWARE' }, false);
  assert.equal(hardware.stores.data.items.length, 1);
  assert.equal(hardware.stores.data.items[0].businessType, 'HARDWARE');
  const filtered = loadPreviewCatalog({ ...base, store: 'demo-hamburguesas' }, false);
  assert.ok(filtered.products.data.items.length > 0);
  assert.ok(filtered.products.data.items.every(p => p.store.slug === 'demo-hamburguesas'));
  const paged = loadPreviewCatalog({ ...base, storesPage: 2 }, false);
  assert.equal(paged.stores.data.items.length, 0);
  assert.ok(paged.stores.data.total > 0);
  assert.equal(loadPreviewCatalog(base, true).stores.status, 'error');
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

// ── Catálogo v1 y alcance mono-tienda del carrito ─────────────────────────────
import { storeFromV1, fetchV1Stores, V1_MERCHANTS_LIMIT } from '../src/lib/marketplace.ts';
import { bindCartToStore } from '../src/lib/cartScope.ts';

const v1Item = (over = {}) => ({ slug: 'taqueria-centro', name: 'Taqueria Centro', categories: ['RESTAURANT', 'TACOS'],
  open: true, estimatedReadyMinutes: 20, minOrder: '50.00', ...over });
const v1Json = items => new Response(JSON.stringify({ items, total: items.length, limit: V1_MERCHANTS_LIMIT }),
  { status: 200, headers: { 'content-type': 'application/json' } });
const catalogState = (over = {}) => ({ q: '', type: '', store: '', storesPage: 1, productsPage: 1, ...over });

test('v1 merchant maps to the store summary and needs a known business type', () => {
  assert.deepEqual(storeFromV1(v1Item()), { slug: 'taqueria-centro', name: 'Taqueria Centro', businessType: 'RESTAURANT',
    isOpen: true, closedMessage: null, estimatedDelivery: 20, deliveryFee: null, freeDeliveryFrom: null, minOrderAmount: 50, merchantId: null });
  assert.equal(storeFromV1(v1Item({ categories: ['TACOS'] })), null);
  assert.equal(storeFromV1(v1Item({ slug: 'Bad Slug' })), null);
  assert.equal(storeFromV1(v1Item({ minOrder: 50 })).minOrderAmount, null, 'money must arrive as a decimal string');
  assert.equal(storeFromV1(v1Item({ estimatedReadyMinutes: null })).estimatedDelivery, null);
});

test('fetchV1Stores calls the v1 merchants endpoint with the server limit and category', async () => {
  let url = '';
  const result = await fetchV1Stores('https://api.example', catalogState({ type: 'HARDWARE' }),
    { fetchImpl: async u => { url = u; return v1Json([]); } });
  assert.equal(url, `https://api.example/api/marketplace/v1/merchants?limit=${V1_MERCHANTS_LIMIT}&category=HARDWARE`);
  assert.equal(result.status, 'ok');
});

test('fetchV1Stores applies text search and pagination on the client', async () => {
  const items = Array.from({ length: 15 }, (_, i) => v1Item({ slug: `tienda-${i}`, name: `Tienda ${i}` }));
  items.push(v1Item({ slug: 'otra', name: 'Panaderia Sol' }));
  const first = await fetchV1Stores('https://api.example', catalogState(), { fetchImpl: async () => v1Json(items) });
  assert.equal(first.data.items.length, 12);
  assert.equal(first.data.total, 16);
  const second = await fetchV1Stores('https://api.example', catalogState({ storesPage: 2 }), { fetchImpl: async () => v1Json(items) });
  assert.equal(second.data.items.length, 4);
  const search = await fetchV1Stores('https://api.example', catalogState({ q: 'sol' }), { fetchImpl: async () => v1Json(items) });
  assert.deepEqual(search.data.items.map(s => s.slug), ['otra']);
});

test('fetchV1Stores maps 400, 5xx, malformed and missing config to section errors', async () => {
  assert.deepEqual(await fetchV1Stores(null, catalogState()), { status: 'error', reason: 'config' });
  const reason = async fetchImpl => (await fetchV1Stores('https://a', catalogState(), { fetchImpl })).reason;
  assert.equal(await reason(async () => new Response('{}', { status: 400 })), 'invalid');
  assert.equal(await reason(async () => new Response('{}', { status: 503 })), 'unavailable');
  assert.equal(await reason(async () => new Response('{"x":1}', { status: 200 })), 'unavailable');
  assert.equal(await reason(async () => { throw new Error('network'); }), 'unavailable');
});

test('loadCatalog uses the v1 stores source only when asked and keeps the products section', async () => {
  const urls = [];
  const fetchImpl = async u => {
    urls.push(u);
    return u.includes('/api/marketplace/v1/merchants') ? v1Json([])
      : new Response(JSON.stringify({ items: [], page: 1, pageSize: 12, total: 0 }), { status: 200 });
  };
  await loadCatalog('https://a', catalogState(), false, { fetchImpl, storesSource: 'v1' });
  assert.ok(urls.some(u => u.includes('/api/marketplace/v1/merchants?')));
  assert.ok(urls.some(u => u.includes('/api/marketplace/products?')), 'products stay on the legacy API');
  urls.length = 0;
  await loadCatalog('https://a', catalogState(), false, { fetchImpl });
  assert.ok(urls.some(u => u.includes('/api/marketplace/stores?')));
  assert.equal(urls.some(u => u.includes('/v1/')), false);
});

test('bindCartToStore keeps lines for the same or an unbound cart and drops them when the store changes', () => {
  assert.deepEqual(bindCartToStore(null, 'tienda-a'), { storeSlug: 'tienda-a', clearLines: false });
  assert.deepEqual(bindCartToStore('tienda-a', 'tienda-a'), { storeSlug: 'tienda-a', clearLines: false });
  assert.deepEqual(bindCartToStore('tienda-a', 'tienda-b'), { storeSlug: 'tienda-b', clearLines: true });
  assert.throws(() => bindCartToStore('tienda-a', 'Tienda B'), /invalido/);
  assert.throws(() => bindCartToStore('tienda-a', ''), /invalido/);
});

// ── Referencia del comercio (id) para el checkout de la tienda ────────────────
import { fetchMerchantRef } from '../src/lib/marketplace.ts';

test('fetchMerchantRef returns the merchant id, falls back to null id, and rejects other slugs', async () => {
  const detail = (json, status = 200) => async () => new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
  assert.deepEqual(await fetchMerchantRef('https://a', 'taqueria', { fetchImpl: detail({ id: 'm-1', slug: 'taqueria', name: 'T' }) }),
    { merchantId: 'm-1', slug: 'taqueria' });
  assert.deepEqual(await fetchMerchantRef('https://a', 'taqueria', { fetchImpl: detail({ slug: 'taqueria', name: 'T' }) }),
    { merchantId: null, slug: 'taqueria' }, 'without an id the slug is still usable');
  assert.equal(await fetchMerchantRef('https://a', 'taqueria', { fetchImpl: detail({ slug: 'otra', name: 'O', id: 'x' }) }), null);
  assert.equal(await fetchMerchantRef('https://a', 'taqueria', { fetchImpl: detail({}, 404) }), null, 'a tenant store is not a marketplace merchant');
  assert.equal(await fetchMerchantRef(null, 'taqueria'), null);
  assert.equal(await fetchMerchantRef('https://a', 'Bad Slug'), null);
});

// Importación dinámica después del hook de resolución .ts del test runner.
const { loadLivePreviewCatalog } = await import('../src/lib/marketplace-live-preview.ts');

test('vista local real: solo GET publicos para los dos slugs permitidos, sin secretos', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.href, init });
    const slug = parsed.searchParams.get('r');
    assert.ok(['master-burguer-s', 'tokki-bobba'].includes(slug));
    assert.equal(parsed.origin, 'https://api.mrtpvrest.com');
    if (parsed.pathname.endsWith('/info')) {
      return jsonResponse({ slug, name: slug === 'tokki-bobba' ? 'Tokki Boba' : 'Master Burguer’s',
        logo: 'https://images.example.org/logo.png', isOpen: true, estimatedDelivery: 40,
        delivery: { mode: 'FLAT', flatFee: 0 }, minOrderAmount: 0 });
    }
    return jsonResponse({ categories: [{ id: 'c', name: 'Menú' }], items: [
      { id: 'p1', name: 'Angus de prueba', price: 0, categoryId: 'c',
        variants: [{ name: 'Chica', price: 135 }, { name: 'Grande', price: 190 }], imageUrl: 'https://images.example.org/photo.jpg' },
      { id: 'p2', name: 'Promoción real', price: 200, isPromo: true, promoPrice: 150,
        categoryId: 'c', reactionCount: 3 },
    ] });
  };
  const { stores, products } = await loadLivePreviewCatalog(base, false, { fetchImpl });
  assert.equal(stores.status, 'ok'); assert.equal(products.status, 'ok');
  assert.equal(stores.data.total, 2); assert.equal(products.data.total, 4);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(c => c.init.method === 'GET' && c.init.credentials === 'omit' &&
    !('Authorization' in c.init.headers) && c.url.includes('/api/store/')));
  const Angus = products.data.items.find(i => i.name === 'Angus de prueba');
  assert.equal(Angus.price, 135); assert.equal(Angus.fromVariant, true);
  assert.equal(Angus.promoPrice, null);
  assert.equal(products.data.items.find(i => i.name === 'Promoción real').promoPrice, 150);
  const tokki = await loadLivePreviewCatalog({ ...base, store: 'tokki-bobba' }, false, { fetchImpl });
  assert.equal(tokki.products.data.total, 2);
});

test('vista real: falla de API o contrato inválido nunca muestra precios ficticios', async () => {
  const fetchImpl = async (url) => url.includes('tokki-bobba') ? jsonResponse({}, 503) :
    jsonResponse({ slug: 'master-burguer-s', name: 'Master Burguer’s', isOpen: true });
  const value = await loadLivePreviewCatalog(base, false, { fetchImpl });
  assert.deepEqual(value.stores, { status: 'error', reason: 'unavailable' });
  assert.deepEqual(value.products, { status: 'error', reason: 'unavailable' });
  const invalid = await loadLivePreviewCatalog(base, true, { fetchImpl: () => { throw Error('should not request'); } });
  assert.equal(invalid.products.reason, 'invalid');
});
