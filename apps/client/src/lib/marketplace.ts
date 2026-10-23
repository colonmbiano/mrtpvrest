/**
 * Catálogo global del marketplace (server-side).
 *
 * Contrato: docs/marketplace/contrato-catalogo.md. Módulo puro y sin imports
 * para poder probarlo con Node sin instalar dependencias: la URL de la API y
 * el fetch se inyectan. Cada sección (tiendas/productos) se carga y falla por
 * separado; un error NUNCA se presenta como lista vacía.
 */

export type BusinessType = 'RESTAURANT' | 'RETAIL' | 'GROCERY';

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  RESTAURANT: 'Restaurante',
  RETAIL: 'Tienda',
  GROCERY: 'Abarrotes',
};

export const MAX_QUERY_LENGTH = 80;
export const PAGE_SIZE = 12;
export const MAX_PAGE = 10000;
const SLUG_RE = /^[a-z0-9-]{1,100}$/;
const PAGE_RE = /^[1-9]\d{0,4}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

export type StoreSummary = {
  slug: string;
  name: string;
  businessType: BusinessType;
  isOpen: boolean;
  closedMessage: string | null;
  estimatedDelivery: number | null; // minutos
  deliveryFee: number | null; // null = depende de la distancia
  freeDeliveryFrom: number | null;
  minOrderAmount: number | null;
};
export type ProductSummary = {
  id: string;
  name: string;
  categoryName: string;
  price: number;
  promoPrice: number | null; // solo si la promo está vigente ahora
  likes: number;
  currency: string;
  store: { slug: string; name: string };
};
export type CatalogPage<T> = { items: T[]; page: number; pageSize: number; total: number };

// config: falta la URL de API; invalid: la API rechazó la búsqueda (400) o es
// demasiado larga; unavailable: red, 5xx o respuesta fuera de contrato.
export type SectionError = 'config' | 'invalid' | 'unavailable';
export type SectionResult<T> =
  | { status: 'ok'; data: CatalogPage<T> }
  | { status: 'error'; reason: SectionError };

export type CatalogState = {
  q: string;
  type: BusinessType | '';
  store: string;
  storesPage: number;
  productsPage: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function isBusinessType(value: unknown): value is BusinessType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BUSINESS_TYPE_LABELS, value);
}

export function isValidSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_RE.test(value);
}

// Un parámetro repetido (?q=a&q=b) llega como array: se descarta, igual que
// cualquier valor fuera de formato, y se usa el default de ese campo.
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parsePage(value: string | string[] | undefined): number {
  const raw = single(value);
  if (!raw || !PAGE_RE.test(raw)) return 1;
  const page = Number(raw);
  return page <= MAX_PAGE ? page : 1;
}

export function parseCatalogParams(raw: RawParams): { state: CatalogState; queryTooLong: boolean } {
  const q = (single(raw.q) ?? '').trim();
  const type = single(raw.type);
  const store = single(raw.store);
  return {
    state: {
      q,
      type: isBusinessType(type) ? type : '',
      store: isValidSlug(store) ? store : '',
      storesPage: parsePage(raw.sp),
      productsPage: parsePage(raw.pp),
    },
    // No se recorta en silencio: el contrato responde 400 a más de 80 caracteres.
    queryTooLong: q.length > MAX_QUERY_LENGTH,
  };
}

// Parámetros de la portada para un estado. Omite defaults para que los enlaces
// sean estables y compartibles.
export function catalogSearchParams(state: CatalogState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.type) params.set('type', state.type);
  if (state.store) params.set('store', state.store);
  if (state.storesPage > 1) params.set('sp', String(state.storesPage));
  if (state.productsPage > 1) params.set('pp', String(state.productsPage));
  return params;
}

export function catalogHref(state: CatalogState, patch: Partial<CatalogState> = {}, hash = ''): string {
  const qs = catalogSearchParams({ ...state, ...patch }).toString();
  return `/${qs ? `?${qs}` : ''}${hash ? `#${hash}` : ''}`;
}

// Enlace relativo de mismo origen a la tienda; null si el slug no es de un
// solo segmento seguro.
export function storeHref(slug: unknown): string | null {
  return isValidSlug(slug) ? `/${encodeURIComponent(slug)}` : null;
}

export function totalPages(page: CatalogPage<unknown>): number {
  return Math.min(MAX_PAGE, Math.max(1, Math.ceil(page.total / page.pageSize)));
}

export function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(price);
  } catch {
    return `${price.toFixed(2)} ${currency}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isAmountOrNull(value: unknown): value is number | null {
  return value === null || isAmount(value);
}

export function isStoreSummary(value: unknown): value is StoreSummary {
  return isRecord(value) && isValidSlug(value.slug) && isNonEmptyString(value.name)
    && isBusinessType(value.businessType)
    && typeof value.isOpen === 'boolean'
    && (value.closedMessage === null || typeof value.closedMessage === 'string')
    && (value.estimatedDelivery === null || (Number.isInteger(value.estimatedDelivery) && (value.estimatedDelivery as number) > 0))
    && isAmountOrNull(value.deliveryFee) && isAmountOrNull(value.freeDeliveryFrom) && isAmountOrNull(value.minOrderAmount);
}

export function isProductSummary(value: unknown): value is ProductSummary {
  return isRecord(value) && isNonEmptyString(value.id) && isNonEmptyString(value.name)
    && typeof value.categoryName === 'string'
    && isAmount(value.price)
    && (value.promoPrice === null || (isAmount(value.promoPrice) && value.promoPrice < value.price))
    && Number.isInteger(value.likes) && (value.likes as number) >= 0
    && typeof value.currency === 'string' && CURRENCY_RE.test(value.currency)
    && isRecord(value.store) && isValidSlug(value.store.slug) && isNonEmptyString(value.store.name);
}

// Ventana de entrega mostrada al comprador: ±5 min alrededor del estimado.
export function etaWindow(minutes: number | null): string | null {
  if (minutes === null) return null;
  return `${Math.max(10, minutes - 5)}–${minutes + 5} min`;
}

// Descuento entero para insignias ("−15%"); null si no hay promo vigente.
export function discountPercent(product: ProductSummary): number | null {
  if (product.promoPrice === null || product.price <= 0) return null;
  return Math.round((1 - product.promoPrice / product.price) * 100);
}

// Tinte estable por tienda para la portada ilustrada (sin imágenes externas).
export function storeHue(slug: string): number {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

function isCount(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

// Valida el envelope completo. Un item fuera de contrato invalida la respuesta
// entera: descartarlo en silencio dejaría `total` y la paginación incoherentes.
export function parseCatalogPage<T>(json: unknown, isItem: (item: unknown) => item is T): CatalogPage<T> | null {
  if (!isRecord(json) || !Array.isArray(json.items)) return null;
  if (!isCount(json.page, 1) || !isCount(json.pageSize, 1) || !isCount(json.total, 0)) return null;
  if (json.items.length > json.pageSize || !json.items.every(isItem)) return null;
  return { items: json.items, page: json.page, pageSize: json.pageSize, total: json.total };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchCatalogSection<T>(
  apiUrl: string | null,
  section: 'stores' | 'products',
  query: Record<string, string | number>,
  isItem: (item: unknown) => item is T,
  { fetchImpl = fetch, timeoutMs = 8000 }: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<SectionResult<T>> {
  if (!apiUrl) return { status: 'error', reason: 'config' };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== '') params.set(key, String(value));
  }
  try {
    const res = await fetchImpl(`${apiUrl}/api/marketplace/${section}?${params.toString()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 400) return { status: 'error', reason: 'invalid' };
    if (!res.ok) return { status: 'error', reason: 'unavailable' };
    const data = parseCatalogPage(await res.json(), isItem);
    return data ? { status: 'ok', data } : { status: 'error', reason: 'unavailable' };
  } catch {
    return { status: 'error', reason: 'unavailable' };
  }
}

export async function loadCatalog(
  apiUrl: string | null,
  state: CatalogState,
  queryTooLong: boolean,
  options?: { fetchImpl?: FetchLike; timeoutMs?: number },
): Promise<{ stores: SectionResult<StoreSummary>; products: SectionResult<ProductSummary> }> {
  if (queryTooLong) {
    const invalid = { status: 'error', reason: 'invalid' } as const;
    return { stores: invalid, products: invalid };
  }
  // El filtro de tipo solo aplica a tiendas y el de tienda solo a productos.
  const [stores, products] = await Promise.all([
    fetchCatalogSection(apiUrl, 'stores',
      { q: state.q, businessType: state.type, page: state.storesPage, pageSize: PAGE_SIZE },
      isStoreSummary, options),
    fetchCatalogSection(apiUrl, 'products',
      { q: state.q, store: state.store, page: state.productsPage, pageSize: PAGE_SIZE },
      isProductSummary, options),
  ]);
  return { stores, products };
}
