// Portada del marketplace: tiendas y productos en secciones independientes.
// Server component sin estado propio: búsqueda, filtros y páginas viven en la
// URL (formulario GET y enlaces), así funciona sin JS y "atrás" restaura todo.
// Los enlaces a tienda son <a> de documento completo a propósito: el carrito
// (cartStore) es un singleton en memoria y no debe viajar entre tiendas.
// Diseño portado del prototipo "MRTPVREST Marketplace" (portadas ilustradas,
// datos de entrega en cada tarjeta, promos vigentes con su descuento).
import type { CSSProperties } from 'react';
import { AlertTriangle, Bike, Clock, Heart, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import ScrollToHash from '@/components/ScrollToHash';
import { productEmoji } from '@/lib/productEmoji';
import {
  BUSINESS_TYPE_LABELS, MAX_QUERY_LENGTH,
  catalogHref, catalogSearchParams, storeHref, totalPages, formatPrice, etaWindow, discountPercent, storeHue,
  type BusinessType, type CatalogState, type CatalogPage, type SectionResult,
  type SectionError, type StoreSummary, type ProductSummary,
} from '@/lib/marketplace';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a3412]';
const LINK = `font-bold text-[#9a3412] underline underline-offset-2 hover:text-[#7c2d12] ${FOCUS}`;
const BUTTON = `inline-flex items-center justify-center gap-2 rounded-xl bg-[#c2410c] px-5 py-3 font-bold text-white hover:bg-[#9a3412] ${FOCUS}`;

const TYPE_TILES: { value: BusinessType | ''; label: string; glyph: string }[] = [
  { value: '', label: 'Todo', glyph: '🧺' },
  { value: 'RESTAURANT', label: 'Restaurantes', glyph: '🍽️' },
  { value: 'GROCERY', label: 'Súper y frescos', glyph: '🥑' },
  { value: 'RETAIL', label: 'Tiendas', glyph: '🛍️' },
  { value: 'HARDWARE', label: 'Ferreterías', glyph: '🔨' },
  { value: 'AUTOPARTS', label: 'Refaccionarias', glyph: '🚗' },
];
const TYPE_GLYPH: Record<BusinessType, string> = { RESTAURANT: '🍽️', GROCERY: '🥑', RETAIL: '🛍️', HARDWARE: '🔨', AUTOPARTS: '🚗' };

// Portada ilustrada: tinte estable por tienda, sin imágenes externas.
function coverStyle(hue: number): CSSProperties {
  return {
    background: [
      `radial-gradient(circle at 85% 20%, hsl(${hue} 70% 93%) 0 22%, transparent 23%)`,
      `radial-gradient(circle at 12% 110%, hsl(${hue} 55% 80%) 0 30%, transparent 31%)`,
      `hsl(${hue} 65% 87%)`,
    ].join(','),
  };
}

function storeGlyph(store: StoreSummary): string {
  const guess = productEmoji(store.name);
  return guess === '🍽️' ? TYPE_GLYPH[store.businessType] : guess;
}

type Props = {
  state: CatalogState;
  stores: SectionResult<StoreSummary>;
  products: SectionResult<ProductSummary>;
  isolated: boolean;
};

export default function MarketplaceCatalog({ state, stores, products, isolated }: Props) {
  const hasFilters = Boolean(state.q || state.type || state.store);

  return (
    <div className="min-h-[100dvh] bg-[#f8f7f5] text-[#1c1917]">
      <ScrollToHash />
      <a href="#contenido" className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 ${LINK}`}>
        Saltar al contenido
      </a>
      <header className="border-b border-[#e7e2dc] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="flex items-baseline gap-1.5">
              <span className="font-display text-xl font-extrabold tracking-tight">MRTPVREST</span>
              <span className="text-sm font-bold text-[#c2410c]">mercado</span>
            </p>
            {isolated && (
              <p className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                Entorno local aislado: solo aparecen las tiendas habilitadas en esta copia
              </p>
            )}
          </div>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">¿Qué se te antoja hoy?</h1>
          <SearchForm state={state} hasFilters={hasFilters} />
        </div>
      </header>

      <main id="contenido" className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6">
        <nav aria-label="Tipo de negocio" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TYPE_TILES.map((tile) => {
            const active = state.type === tile.value;
            return (
              <Link
                key={tile.label}
                href={catalogHref(state, { type: tile.value, storesPage: 1 }, 'tiendas')}
                aria-current={active ? 'true' : undefined}
                className={`flex items-center justify-between gap-2 rounded-2xl border p-4 transition ${FOCUS} ${
                  active ? 'border-[#c2410c] bg-[#fff1e8]' : 'border-[#e7e2dc] bg-white hover:border-[#a8a29e]'}`}
              >
                <span className="font-bold">{tile.label}</span>
                <span aria-hidden="true" className="text-3xl drop-shadow">{tile.glyph}</span>
              </Link>
            );
          })}
        </nav>

        <CatalogSection
          id="tiendas"
          title="Tiendas"
          result={stores}
          state={state}
          pageKey="storesPage"
          noun={{ one: 'tienda', many: 'tiendas' }}
          emptyAll="Todavía no hay tiendas publicadas en el marketplace."
          emptyFiltered={state.q || state.type ? describeStoreFilters(state) : null}
          hint={state.type ? `Tipo: ${BUSINESS_TYPE_LABELS[state.type]}` : undefined}
          renderItems={(items) => (
            <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((store) => <StoreCard key={store.slug} store={store} state={state} />)}
            </ul>
          )}
        />

        <CatalogSection
          id="productos"
          title="Productos"
          result={products}
          state={state}
          pageKey="productsPage"
          noun={{ one: 'producto', many: 'productos' }}
          emptyAll="Todavía no hay productos publicados en el marketplace."
          emptyFiltered={state.q || state.store ? describeProductFilters(state) : null}
          before={state.store ? <StoreFilterChip state={state} /> : null}
          renderItems={(items) => (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((product) => <ProductTile key={product.id} product={product} />)}
            </ul>
          )}
        />
      </main>

      <footer className="border-t border-[#e7e2dc] px-4 py-6 text-center text-sm text-[#57534e]">
        MRTPVREST Marketplace · el precio final se confirma en cada tienda
      </footer>
    </div>
  );
}

function SearchForm({ state, hasFilters }: { state: CatalogState; hasFilters: boolean }) {
  // Sin campos sp/pp: cualquier búsqueda nueva vuelve a la página 1 de ambas
  // secciones. Los filtros activos de tipo y tienda se conservan ocultos.
  return (
    <form method="get" action="/" role="search" aria-label="Buscar en el marketplace" className="flex flex-col gap-2">
      <label htmlFor="catalog-q" className="sr-only">Buscar tiendas o productos</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#78716c]" />
          <input
            id="catalog-q"
            name="q"
            type="search"
            defaultValue={state.q}
            maxLength={MAX_QUERY_LENGTH}
            placeholder="Tacos, aguacate, café de olla…"
            aria-describedby="catalog-q-hint"
            className={`h-14 w-full rounded-2xl border border-[#d6d0c9] bg-[#f8f7f5] pl-12 pr-4 text-base ${FOCUS}`}
          />
        </div>
        {state.type && <input type="hidden" name="type" value={state.type} />}
        {state.store && <input type="hidden" name="store" value={state.store} />}
        <button type="submit" className={`${BUTTON} h-14`}>
          <Search aria-hidden="true" className="h-5 w-5" />
          Buscar
        </button>
      </div>
      <p id="catalog-q-hint" className="flex flex-wrap items-center gap-x-4 text-sm text-[#57534e]">
        Busca por nombre de tienda o de producto. Hasta {MAX_QUERY_LENGTH} caracteres.
        {hasFilters && <Link href="/" className={LINK}>Limpiar filtros</Link>}
      </p>
    </form>
  );
}

function StoreFilterChip({ state }: { state: CatalogState }) {
  return (
    <p className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#fff1e8] px-4 py-3">
      <span>
        Mostrando solo productos de la tienda <strong>{state.store}</strong>.
      </span>
      <a href={catalogHref(state, { store: '', productsPage: 1 }, 'productos')} className={LINK}>
        Ver productos de todas las tiendas
      </a>
    </p>
  );
}

type SectionProps<T> = {
  id: string;
  title: string;
  result: SectionResult<T>;
  state: CatalogState;
  pageKey: 'storesPage' | 'productsPage';
  noun: { one: string; many: string };
  emptyAll: string;
  emptyFiltered: string | null;
  hint?: string;
  before?: React.ReactNode;
  renderItems: (items: T[]) => React.ReactNode;
};

function CatalogSection<T>({
  id, title, result, state, pageKey, noun, emptyAll, emptyFiltered, hint, before, renderItems,
}: SectionProps<T>) {
  const headingId = `${id}-titulo`;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-4">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="font-display text-2xl font-extrabold">{title}</h2>
        {result.status === 'ok' && result.data.total > 0 && (
          <p className="text-sm text-[#57534e]">
            {hint ? `${hint} · ` : ''}{result.data.total} {result.data.total === 1 ? noun.one : noun.many}
          </p>
        )}
      </div>
      {before}
      {result.status === 'error'
        ? <SectionErrorMessage reason={result.reason} title={title.toLowerCase()} state={state} />
        : <SectionBody
            data={result.data} state={state} id={id} pageKey={pageKey} noun={noun}
            emptyAll={emptyAll} emptyFiltered={emptyFiltered} renderItems={renderItems}
          />}
    </section>
  );
}

function SectionBody<T>({
  data, state, id, pageKey, noun, emptyAll, emptyFiltered, renderItems,
}: {
  data: CatalogPage<T>;
  state: CatalogState;
  id: string;
  pageKey: 'storesPage' | 'productsPage';
  noun: { one: string; many: string };
  emptyAll: string;
  emptyFiltered: string | null;
  renderItems: (items: T[]) => React.ReactNode;
}) {
  if (data.total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d6d0c9] bg-white p-6">
        <p className="font-bold">{emptyFiltered ?? emptyAll}</p>
        {emptyFiltered && (
          <Link href="/" className={`mt-2 inline-block ${LINK}`}>Limpiar filtros</Link>
        )}
      </div>
    );
  }
  // Página válida pero más allá del último resultado: el contrato devuelve 200
  // con items=[] y el total real.
  if (data.items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d6d0c9] bg-white p-6">
        <p className="font-bold">Esta página no tiene {noun.many}.</p>
        <a href={catalogHref(state, pagePatch(pageKey, 1), id)} className={`mt-2 inline-block ${LINK}`}>
          Ir a la primera página
        </a>
      </div>
    );
  }
  return (
    <>
      {renderItems(data.items)}
      <Pagination data={data} state={state} id={id} pageKey={pageKey} label={noun.many} />
    </>
  );
}

function Pagination({
  data, state, id, pageKey, label,
}: {
  data: CatalogPage<unknown>;
  state: CatalogState;
  id: string;
  pageKey: 'storesPage' | 'productsPage';
  label: string;
}) {
  const pages = totalPages(data);
  if (pages <= 1) return null;
  const current = data.page;
  const disabled = 'rounded-xl px-4 py-2 font-bold text-[#a8a29e]';
  const active = `rounded-xl border border-[#d6d0c9] bg-white px-4 py-2 font-bold text-[#9a3412] hover:border-[#9a3412] ${FOCUS}`;
  return (
    <nav aria-label={`Paginación de ${label}`} className="mt-8 flex flex-wrap items-center gap-3">
      {current > 1
        ? <a href={catalogHref(state, pagePatch(pageKey, current - 1), id)} className={active} rel="prev">Anterior</a>
        : <span className={disabled} aria-disabled="true">Anterior</span>}
      <span className="font-bold tabular-nums">Página {current} de {pages}</span>
      {current < pages
        ? <a href={catalogHref(state, pagePatch(pageKey, current + 1), id)} className={active} rel="next">Siguiente</a>
        : <span className={disabled} aria-disabled="true">Siguiente</span>}
    </nav>
  );
}

// Cada sección pagina por separado: solo cambia su propio parámetro.
function pagePatch(pageKey: 'storesPage' | 'productsPage', page: number): Partial<CatalogState> {
  return pageKey === 'storesPage' ? { storesPage: page } : { productsPage: page };
}

const ERROR_TEXT: Record<SectionError, string> = {
  config: 'El catálogo no está configurado en este entorno. Falta una dirección de API válida.',
  invalid: `Revisa la búsqueda: admite hasta ${MAX_QUERY_LENGTH} caracteres y solo los filtros disponibles.`,
  unavailable: 'El servicio no respondió o devolvió datos inesperados.',
};

function SectionErrorMessage({ reason, title, state }: { reason: SectionError; title: string; state: CatalogState }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
      <p className="flex items-center gap-2 font-bold">
        <AlertTriangle aria-hidden="true" className="h-5 w-5" />
        No pudimos cargar {title}
      </p>
      <p className="mt-1">{ERROR_TEXT[reason]}</p>
      {reason === 'unavailable' && <RetryForm state={state} />}
      {reason === 'invalid' && (
        <Link href="/" className={`mt-3 inline-block ${LINK}`}>Limpiar búsqueda</Link>
      )}
    </div>
  );
}

// Reintento como formulario GET y no como enlace: un <a> a la misma URL que solo
// cambia el #hash es navegación dentro del documento y no vuelve a pedir datos.
// Reenvía el estado actual completo (filtros y páginas de ambas secciones).
function RetryForm({ state }: { state: CatalogState }) {
  return (
    <form method="get" action="/" className="mt-3">
      {[...catalogSearchParams(state).entries()].map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className={BUTTON}>Reintentar</button>
    </form>
  );
}

function DeliveryLine({ store }: { store: StoreSummary }) {
  const eta = etaWindow(store.estimatedDelivery);
  const fee = store.deliveryFee === null
    ? <span>Envío según distancia</span>
    : store.deliveryFee === 0
      ? <span className="font-bold text-[#15803d]">Envío gratis</span>
      : <span className="tabular-nums">Envío {formatPrice(store.deliveryFee, 'MXN')}</span>;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-[#57534e]">
      {eta && <span className="inline-flex items-center gap-1 tabular-nums"><Clock aria-hidden="true" className="h-3.5 w-3.5" />{eta}</span>}
      {eta && <span aria-hidden="true">·</span>}
      <span className="inline-flex items-center gap-1"><Bike aria-hidden="true" className="h-3.5 w-3.5" />{fee}</span>
    </p>
  );
}

function StoreCard({ store, state }: { store: StoreSummary; state: CatalogState }) {
  const href = storeHref(store.slug);
  const extras = [
    store.minOrderAmount ? `Mínimo ${formatPrice(store.minOrderAmount, 'MXN')}` : null,
    store.deliveryFee && store.freeDeliveryFrom ? `Envío gratis desde ${formatPrice(store.freeDeliveryFrom, 'MXN')}` : null,
  ].filter(Boolean);
  const cover = (
    <span className={`relative block aspect-[16/9] overflow-hidden rounded-2xl ${store.isOpen ? '' : 'grayscale-[.7]'}`} style={coverStyle(storeHue(store.slug))}>
      <span aria-hidden="true" className="absolute bottom-3 right-4 text-6xl drop-shadow-md">{storeGlyph(store)}</span>
      {!store.isOpen && (
        <span className="absolute inset-x-3 bottom-3 rounded-lg bg-white/95 px-3 py-2 text-xs font-bold text-[#1c1917]">
          Cerrada{store.closedMessage ? ` · ${store.closedMessage}` : ''}
        </span>
      )}
    </span>
  );
  return (
    <li className="flex min-w-0 flex-col gap-2.5">
      {href ? (
        <a href={href} className={`group flex flex-col gap-2.5 rounded-2xl ${FOCUS}`} aria-label={`Ver la tienda ${store.name}`}>
          {cover}
          <span className="flex flex-col gap-0.5">
            <span className="truncate text-lg font-bold group-hover:underline">{store.name}</span>
            <span className="text-xs font-bold uppercase tracking-wider text-[#78716c]">{BUSINESS_TYPE_LABELS[store.businessType]}</span>
          </span>
        </a>
      ) : cover}
      <DeliveryLine store={store} />
      {extras.length > 0 && <p className="text-xs text-[#57534e]">{extras.join(' · ')}</p>}
      <a
        href={catalogHref(state, { store: store.slug, productsPage: 1 }, 'productos')}
        className={`w-fit text-sm ${LINK}`}
        aria-label={`Ver productos de ${store.name}`}
      >
        Ver sus productos
      </a>
    </li>
  );
}

function ProductTile({ product }: { product: ProductSummary }) {
  const href = storeHref(product.store.slug);
  const off = discountPercent(product);
  const body = (
    <>
      <span className="relative grid aspect-square place-items-center rounded-2xl" style={coverStyle(storeHue(product.store.slug))}>
        <span aria-hidden="true" className="text-6xl drop-shadow-md">{productEmoji(product.name)}</span>
        {off !== null && (
          <span className="absolute left-2 top-2 rounded-full bg-[#c2410c] px-2 py-0.5 text-xs font-bold text-white tabular-nums">−{off}%</span>
        )}
        {href && (
          <span aria-hidden="true" className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-white shadow">
            <Plus className="h-4 w-4" />
          </span>
        )}
      </span>
      <span className="line-clamp-2 font-bold leading-snug group-hover:underline">{product.name}</span>
      <span className="flex items-baseline gap-1.5 tabular-nums">
        <span className={`font-bold ${product.promoPrice !== null ? 'text-[#c2410c]' : ''}`}>
          {formatPrice(product.promoPrice ?? product.price, product.currency)}
        </span>
        {product.promoPrice !== null && (
          <s className="text-xs text-[#78716c]">{formatPrice(product.price, product.currency)}</s>
        )}
        {product.promoPrice === null && <span className="text-xs text-[#78716c]">precio base</span>}
      </span>
      <span className="flex items-center justify-between gap-2 text-xs text-[#57534e]">
        <span className="truncate">{product.store.name}{product.categoryName ? ` · ${product.categoryName}` : ''}</span>
        {product.likes > 0 && (
          <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums" aria-label={`${product.likes} me gusta`}>
            <Heart aria-hidden="true" className="h-3 w-3" />{product.likes}
          </span>
        )}
      </span>
    </>
  );
  return (
    <li className="min-w-0">
      {href ? (
        <a href={href} className={`group flex flex-col gap-2 rounded-2xl ${FOCUS}`} aria-label={`${product.name} en ${product.store.name}: ir a la tienda`}>
          {body}
        </a>
      ) : <div className="flex flex-col gap-2">{body}</div>}
    </li>
  );
}

function describeStoreFilters(state: CatalogState): string {
  const parts: string[] = [];
  if (state.q) parts.push(`“${state.q}”`);
  if (state.type) parts.push(`tipo ${BUSINESS_TYPE_LABELS[state.type]}`);
  return `No encontramos tiendas para ${parts.join(' y ')}.`;
}

function describeProductFilters(state: CatalogState): string {
  const parts: string[] = [];
  if (state.q) parts.push(`“${state.q}”`);
  if (state.store) parts.push(`la tienda ${state.store}`);
  return `No encontramos productos para ${parts.join(' en ')}.`;
}
