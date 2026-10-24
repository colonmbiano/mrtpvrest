/**
 * Vista local de catálogos reales en SOLO LECTURA.
 *
 * Fuente: API PÚBLICA existente del storefront (respaldada por la BD real).
 * No conecta credenciales ni acceso directo a PostgreSQL, y no consulta
 * clientes, pedidos, repartidores ni estadísticas privadas.
 * Solo los dos slugs permitidos; nunca aceptar URLs desde la petición.
 */
import {
  PAGE_SIZE, type CatalogState, type ProductSummary, type SectionResult, type StoreSummary,
} from './marketplace';

const PUBLIC_STORES_API = 'https://api.mrtpvrest.com';
const ALLOWED = ['master-burguer-s', 'tokki-bobba'] as const;
const MAX_ITEMS_PER_STORE = 300;
type JsonRecord = Record<string, unknown>;
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const object = (v: unknown): v is JsonRecord => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const decimal = (v: unknown): number | null => {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (typeof v === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1e9 ? n : null;
};
const image = (v: unknown): string | undefined => {
  if (typeof v !== 'string' || v.length > 2048) return;
  try {
    const u = new URL(v);
    if (u.protocol === 'https:' && !u.username && !u.password) return v;
  } catch { /* ignore invalid public image */ }
};
function page<T>(all: T[], current: number): SectionResult<T> {
  const offset = (current - 1) * PAGE_SIZE;
  return { status: 'ok', data: {
    items: all.slice(offset, offset + PAGE_SIZE), page: current,
    pageSize: PAGE_SIZE, total: all.length,
  } };
}
async function publicGet(path: 'info' | 'menu', slug: typeof ALLOWED[number], fetchImpl: FetchLike): Promise<unknown> {
  // No user-supplied URLs, headers, cookies, tokens or credentials.
  const url = PUBLIC_STORES_API + '/api/store/' + path + '?r=' + slug;
  const result = await fetchImpl(url, {
    method: 'GET', cache: 'no-store', credentials: 'omit',
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000),
  });
  if (!result.ok) throw new Error('Public store API unavailable');
  return result.json();
}
function parsedStore(slug: typeof ALLOWED[number], value: unknown): StoreSummary | null {
  if (!object(value) || value.slug !== slug || !nonempty(value.name)) return null;
  const delivery = object(value.delivery) ? value.delivery : {};
  const est = decimal(value.estimatedDelivery);
  return {
    slug, name: value.name, businessType: 'RESTAURANT',
    ...(image(value.logo) ? { logoUrl: image(value.logo) } : {}),
    isOpen: value.isOpen === true,
    closedMessage: typeof value.closedMessage === 'string' ? value.closedMessage : null,
    estimatedDelivery: est && Number.isInteger(est) ? est : null,
    deliveryFee: delivery.mode === 'FLAT' ? decimal(delivery.flatFee) : null,
    freeDeliveryFrom: decimal(delivery.freeFrom),
    minOrderAmount: decimal(value.minOrderAmount),
  };
}
function parsedProducts(slug: typeof ALLOWED[number], storeName: string, value: unknown): ProductSummary[] | null {
  if (!object(value) || !Array.isArray(value.categories) || !Array.isArray(value.items)
    || value.items.length > MAX_ITEMS_PER_STORE) return null;
  const categories = new Map<string, string>();
  for (const category of value.categories) {
    if (object(category) && typeof category.id === 'string' && typeof category.name === 'string') {
      categories.set(category.id, category.name);
    }
  }
  const result: ProductSummary[] = [];
  for (const row of value.items) {
    if (!object(row) || !nonempty(row.id) || !nonempty(row.name)) continue;
    let price = decimal(row.price);
    let fromVariant = false;
    // Base 0 is common for variant-only menus. Use their publicly advertised minimum.
    if (price === 0 && Array.isArray(row.variants)) {
      const valid = row.variants.map((variant: unknown) =>
        object(variant) ? decimal(variant.price) : null)
        .filter((n: number | null): n is number => n !== null && n > 0);
      if (valid.length) { price = Math.min(...valid); fromVariant = true; }
    }
    if (price === null || price === 0) continue; // Never display fictitious free meals.
    const promo = row.isPromo === true && !fromVariant ? decimal(row.promoPrice) : null;
    const promoPrice = promo !== null && promo < price ? promo : null;
    const categoryName = typeof row.categoryId === 'string'
      ? categories.get(row.categoryId) || 'Menú' : 'Menú';
    const photo = image(row.imageUrl);
    result.push({
      id: slug + ':' + row.id, name: row.name, categoryName, price,
      promoPrice, likes: typeof row.reactionCount === 'number'
        && Number.isInteger(row.reactionCount) && row.reactionCount >= 0 ? row.reactionCount : 0,
      currency: 'MXN',
      ...(photo ? { imageUrl: photo } : {}),
      ...(fromVariant ? { fromVariant: true } : {}),
      store: { slug, name: storeName },
    });
  }
  return result;
}
export async function loadLivePreviewCatalog(
  state: CatalogState, queryTooLong: boolean, { fetchImpl = fetch }: { fetchImpl?: FetchLike } = {},
): Promise<{ stores: SectionResult<StoreSummary>; products: SectionResult<ProductSummary> }> {
  if (queryTooLong) {
    const invalid = { status: 'error', reason: 'invalid' } as const;
    return { stores: invalid, products: invalid };
  }
  // One store failure does not masquerade as a store with zero products.
  const results = await Promise.allSettled(ALLOWED.map(async slug => {
    const [info, menu] = await Promise.all([
      publicGet('info', slug, fetchImpl), publicGet('menu', slug, fetchImpl),
    ]);
    const store = parsedStore(slug, info);
    const products = store && parsedProducts(slug, store.name, menu);
    if (!store || !products) throw new Error('Invalid public catalog contract');
    return { store, products };
  }));
  if (results.some(r => r.status === 'rejected')) {
    return {
      stores: { status: 'error', reason: 'unavailable' },
      products: { status: 'error', reason: 'unavailable' },
    };
  }
  const entries = results.filter((r): r is PromiseFulfilledResult<{
    store: StoreSummary; products: ProductSummary[];
  }> => r.status === 'fulfilled').map(r => r.value);
  const needle = state.q.trim().toLocaleLowerCase('es-MX');
  const stores = entries.map(r => r.store)
    .filter(s => (!state.type || s.businessType === state.type)
      && (!needle || s.name.toLocaleLowerCase('es-MX').includes(needle)));
  const products = entries.flatMap(r => r.products)
    .filter(p => (!state.store || p.store.slug === state.store)
      && (!needle || (p.name + ' ' + p.categoryName + ' ' + p.store.name).toLocaleLowerCase('es-MX').includes(needle)));
  return { stores: page(stores, state.storesPage), products: page(products, state.productsPage) };
}
