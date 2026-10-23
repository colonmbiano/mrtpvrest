// Portada del marketplace: tiendas y productos en secciones independientes.
// Server component sin estado propio: búsqueda, filtros y páginas viven en la
// URL (formulario GET y enlaces), así funciona sin JS y "atrás" restaura todo.
// Los enlaces a tienda son <a> de documento completo a propósito: el carrito
// (cartStore) es un singleton en memoria y no debe viajar entre tiendas.
import { Search, Store, Package, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import ScrollToHash from '@/components/ScrollToHash';
import {
  BUSINESS_TYPE_LABELS, MAX_QUERY_LENGTH,
  catalogHref, catalogSearchParams, storeHref, totalPages, formatPrice,
  type BusinessType, type CatalogState, type CatalogPage, type SectionResult,
  type SectionError, type StoreSummary, type ProductSummary,
} from '@/lib/marketplace';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a3412]';
const LINK = `font-bold text-[#9a3412] underline underline-offset-2 hover:text-[#7c2d12] ${FOCUS}`;
const BUTTON = `inline-flex items-center justify-center gap-2 rounded-xl bg-[#c2410c] px-5 py-3 font-black text-white hover:bg-[#9a3412] ${FOCUS}`;

type Props = {
  state: CatalogState;
  stores: SectionResult<StoreSummary>;
  products: SectionResult<ProductSummary>;
  isolated: boolean;
};

export default function MarketplaceCatalog({ state, stores, products, isolated }: Props) {
  const hasFilters = Boolean(state.q || state.type || state.store);

  return (
    <div className="min-h-[100dvh] bg-[#f8f8f6] text-[#1a1a1a]">
      <ScrollToHash />
      <a href="#contenido" className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 ${LINK}`}>
        Saltar al contenido
      </a>
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <p className="text-sm font-black uppercase tracking-widest text-[#9a3412]">MRTPVREST Marketplace</p>
          <h1 className="mt-1 text-3xl font-black sm:text-4xl">Descubre tiendas y productos</h1>
          {isolated && (
            <p className="mt-3 inline-block rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-900">
              Entorno local aislado: solo aparecen las tiendas habilitadas en esta copia.
            </p>
          )}
        </div>
      </header>

      <main id="contenido" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <SearchForm state={state} hasFilters={hasFilters} />

        <CatalogSection
          id="tiendas"
          title="Tiendas"
          icon={<Store aria-hidden="true" className="h-6 w-6" />}
          result={stores}
          state={state}
          pageKey="storesPage"
          noun={{ one: 'tienda', many: 'tiendas' }}
          emptyAll="Todavía no hay tiendas publicadas en el marketplace."
          emptyFiltered={state.q || state.type ? describeStoreFilters(state) : null}
          renderItems={(items) => (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((store) => <StoreCard key={store.slug} store={store} state={state} />)}
            </ul>
          )}
        />

        <CatalogSection
          id="productos"
          title="Productos"
          icon={<Package aria-hidden="true" className="h-6 w-6" />}
          result={products}
          state={state}
          pageKey="productsPage"
          noun={{ one: 'producto', many: 'productos' }}
          emptyAll="Todavía no hay productos publicados en el marketplace."
          emptyFiltered={state.q || state.store ? describeProductFilters(state) : null}
          before={state.store ? <StoreFilterChip state={state} /> : null}
          renderItems={(items) => (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((product) => <ProductCard key={product.id} product={product} />)}
            </ul>
          )}
        />
      </main>
    </div>
  );
}

function SearchForm({ state, hasFilters }: { state: CatalogState; hasFilters: boolean }) {
  // Sin campos sp/pp: cualquier búsqueda nueva vuelve a la página 1 de ambas
  // secciones. El filtro de tienda activo se conserva como campo oculto.
  return (
    <form method="get" action="/" role="search" aria-label="Buscar en el marketplace"
      className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="grid gap-4 md:grid-cols-[1fr_16rem_auto] md:items-end">
        <div>
          <label htmlFor="catalog-q" className="mb-1.5 block font-bold">Buscar tiendas o productos</label>
          <input
            id="catalog-q"
            name="q"
            type="search"
            defaultValue={state.q}
            maxLength={MAX_QUERY_LENGTH}
            aria-describedby="catalog-q-hint"
            className={`w-full rounded-xl border border-gray-400 px-4 py-3 text-base ${FOCUS}`}
          />
          <p id="catalog-q-hint" className="mt-1 text-sm text-gray-600">
            Busca por nombre. Hasta {MAX_QUERY_LENGTH} caracteres.
          </p>
        </div>
        <div>
          <label htmlFor="catalog-type" className="mb-1.5 block font-bold">Tipo de negocio</label>
          <select
            id="catalog-type"
            name="type"
            defaultValue={state.type}
            aria-describedby="catalog-type-hint"
            className={`w-full rounded-xl border border-gray-400 bg-white px-4 py-3 text-base ${FOCUS}`}
          >
            <option value="">Todos</option>
            {(Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map((type) => (
              <option key={type} value={type}>{BUSINESS_TYPE_LABELS[type]}</option>
            ))}
          </select>
          <p id="catalog-type-hint" className="mt-1 text-sm text-gray-600">Solo filtra la sección de tiendas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 md:pb-7">
          {state.store && <input type="hidden" name="store" value={state.store} />}
          <button type="submit" className={BUTTON}>
            <Search aria-hidden="true" className="h-5 w-5" />
            Buscar
          </button>
          {hasFilters && <Link href="/" className={LINK}>Limpiar filtros</Link>}
        </div>
      </div>
    </form>
  );
}

function StoreFilterChip({ state }: { state: CatalogState }) {
  return (
    <p className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-orange-50 px-4 py-3">
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
  icon: React.ReactNode;
  result: SectionResult<T>;
  state: CatalogState;
  pageKey: 'storesPage' | 'productsPage';
  noun: { one: string; many: string };
  emptyAll: string;
  emptyFiltered: string | null;
  before?: React.ReactNode;
  renderItems: (items: T[]) => React.ReactNode;
};

function CatalogSection<T>({
  id, title, icon, result, state, pageKey, noun, emptyAll, emptyFiltered, before, renderItems,
}: SectionProps<T>) {
  const headingId = `${id}-titulo`;
  return (
    <section id={id} aria-labelledby={headingId} className="mt-10 scroll-mt-4">
      <h2 id={headingId} className="mb-4 flex items-center gap-2 text-2xl font-black">
        {icon}
        {title}
      </h2>
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
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6">
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
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6">
        <p className="font-bold">Esta página no tiene {noun.many}.</p>
        <a href={catalogHref(state, pagePatch(pageKey, 1), id)} className={`mt-2 inline-block ${LINK}`}>
          Ir a la primera página
        </a>
      </div>
    );
  }
  return (
    <>
      <p className="mb-4 text-gray-700">
        Resultados: {data.total} {data.total === 1 ? noun.one : noun.many}
      </p>
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
  const disabled = 'rounded-xl px-4 py-2 font-bold text-gray-400';
  const active = `rounded-xl border border-gray-300 bg-white px-4 py-2 ${LINK} no-underline`;
  return (
    <nav aria-label={`Paginación de ${label}`} className="mt-6 flex flex-wrap items-center gap-3">
      {current > 1
        ? <a href={catalogHref(state, pagePatch(pageKey, current - 1), id)} className={active} rel="prev">Anterior</a>
        : <span className={disabled} aria-disabled="true">Anterior</span>}
      <span className="font-bold">Página {current} de {pages}</span>
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
      <p className="flex items-center gap-2 font-black">
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

function StoreCard({ store, state }: { store: StoreSummary; state: CatalogState }) {
  const href = storeHref(store.slug);
  return (
    <li className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="text-lg font-black">{store.name}</h3>
      <p className="text-sm text-gray-600">{BUSINESS_TYPE_LABELS[store.businessType]}</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {href && (
          <a href={href} className={LINK} aria-label={`Ver la tienda ${store.name}`}>Ver tienda</a>
        )}
        <a
          href={catalogHref(state, { store: store.slug, productsPage: 1 }, 'productos')}
          className={LINK}
          aria-label={`Ver productos de ${store.name}`}
        >
          Ver sus productos
        </a>
      </div>
    </li>
  );
}

function ProductCard({ product }: { product: ProductSummary }) {
  const href = storeHref(product.store.slug);
  return (
    <li className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="text-lg font-black">{product.name}</h3>
      <p className="text-sm text-gray-600">
        {product.store.name}{product.categoryName ? ` · ${product.categoryName}` : ''}
      </p>
      <p className="mt-3">
        <span className="text-xl font-black">{formatPrice(product.price, product.currency)}</span>
        <span className="ml-2 text-sm text-gray-600">precio base</span>
      </p>
      {href && (
        <a href={href} className={`mt-4 ${LINK}`} aria-label={`Ir a ${product.store.name} para pedir ${product.name}`}>
          Ir a la tienda
        </a>
      )}
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
