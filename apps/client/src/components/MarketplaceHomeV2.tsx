import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, Bike, ChevronLeft, ChevronRight, Clock3, Heart,
  LayoutGrid, MapPin, Menu, Search, ShoppingBag, Store, Tag, Truck, UserRound,
} from 'lucide-react';
import ScrollToHash from '@/components/ScrollToHash';
import MarketplaceCartShortcut from '@/components/MarketplaceCartShortcut';
import { productEmoji } from '@/lib/productEmoji';
import {
  BUSINESS_TYPE_LABELS, MAX_QUERY_LENGTH, catalogHref, catalogSearchParams,
  discountPercent, etaWindow, formatPrice, storeHref, storeHue, totalPages,
  type BusinessType, type CatalogState, type SectionResult, type SectionError,
  type CatalogPage, type StoreSummary, type ProductSummary,
} from '@/lib/marketplace';

type Props = {
  state: CatalogState;
  stores: SectionResult<StoreSummary>;
  products: SectionResult<ProductSummary>;
  isolated: boolean;
  previewDemo?: boolean;
  livePreview?: boolean;
};

type Category = {
  type: BusinessType | '';
  name: string;
  subtitle: string;
  emoji: string;
  color: string;
};
const CATEGORIES: Category[] = [
  { type: 'RESTAURANT', name: 'Restaurantes', subtitle: 'Comida para cada antojo', emoji: '🍔', color: 'from-[#ffe4d3] to-[#fff5df]' },
  { type: 'GROCERY', name: 'Supermercado', subtitle: 'Todo para tu hogar', emoji: '🥬', color: 'from-[#c8f1dc] to-[#efffeb]' },
  { type: 'RETAIL', name: 'Tiendas y retail', subtitle: 'Moda, tecnología y más', emoji: '🎧', color: 'from-[#f9d9eb] to-[#fff2f7]' },
  { type: 'HARDWARE', name: 'Ferretería', subtitle: 'Para todos tus proyectos', emoji: '🔨', color: 'from-[#ffe5a9] to-[#fff4d6]' },
  { type: 'AUTOPARTS', name: 'Autopartes', subtitle: 'Lo que tu auto necesita', emoji: '🛞', color: 'from-[#e1e5eb] to-[#fafafa]' },
];
const focus = 'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#166534]';
const link = 'font-bold text-[#dc4a13] hover:text-[#ae370b] hover:underline underline-offset-4 ' + focus;
const action = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#fa5a20] px-5 py-3 font-bold text-white shadow-[0_5px_14px_rgba(234,88,12,.18)] transition hover:bg-[#df4712] ' + focus;

function cardTint(slug: string): CSSProperties {
  const hue = storeHue(slug);
  return { background: 'radial-gradient(circle at 78% 20%,hsl(' + hue + ' 80% 92%) 0 18%,transparent 60%),linear-gradient(135deg,hsl(' + hue + ' 68% 89%),hsl(' + hue + ' 56% 97%))' };
}
function businessEmoji(type: BusinessType): string {
  return CATEGORIES.find((c) => c.type === type)?.emoji ?? '🛍️';
}
function sectionError(reason: SectionError): string {
  switch (reason) {
    case 'config': return 'El catálogo todavía no está configurado en este entorno.';
    case 'invalid': return 'El filtro o la búsqueda no es válido. Intenta con otro término.';
    case 'unavailable': return 'El catálogo no está disponible en este momento. Puedes volver a intentarlo.';
  }
}
function patchPage(key: 'storesPage' | 'productsPage', page: number): Partial<CatalogState> {
  return key === 'storesPage' ? { storesPage: page } : { productsPage: page };
}

export default function MarketplaceHomeV2({ state, stores, products, isolated, previewDemo = false, livePreview = false }: Props) {
  const readOnly = previewDemo || livePreview;
  const promotions = products.status === 'ok'
    ? products.data.items.filter((p) => p.promoPrice !== null)
    : [];
  const hasFilters = Boolean(state.q || state.type || state.store);

  return (
    <div className="min-h-[100dvh] bg-[#f7f9f8] pb-20 text-[#172a2a] sm:pb-0">
      <ScrollToHash />
      <a href="#contenido" className={'sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-xl focus:bg-white focus:p-3 ' + link}>
        Saltar al contenido
      </a>

      <header className="relative z-20 border-b border-[#e8eeeb] bg-white">
        <div className="mx-auto max-w-[1380px] px-4 sm:px-6">
          <div className="flex min-h-20 items-center justify-between gap-3 lg:gap-6">
            <Link href="/" aria-label="MRTPVREST Marketplace, inicio" className={'flex shrink-0 items-center gap-2 ' + focus}>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e9f4e9] text-2xl shadow-sm" aria-hidden="true">🛍️</span>
              <span className="flex flex-col leading-none">
                <span className="font-display text-xl font-extrabold tracking-tight text-[#14743b] sm:text-2xl">MRT<span className="text-[#ff6426]">PV</span>REST</span>
                <span className="mt-1 text-[11px] font-semibold tracking-[.13em] text-[#65766e]">MARKETPLACE</span>
              </span>
            </Link>

            <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
              <a href="#tiendas" className={'flex shrink-0 items-center gap-1 rounded-xl border border-[#edf0eb] px-3 py-3 text-xs font-bold text-[#435a52] lg:text-sm ' + focus}>
                <MapPin className="h-4 w-4 text-[#f05c25]" aria-hidden="true" />
                Tiendas locales
              </a>
              <SearchForm state={state} inputId="search-desktop" />
            </div>

            <nav aria-label="Accesos principales" className="flex items-center gap-2 sm:gap-5">
              <a href="#tiendas" className={'hidden items-center gap-2 text-sm font-semibold text-[#374e45] hover:text-[#e65320] lg:flex ' + focus}>
                <Store className="h-5 w-5" aria-hidden="true" /> Tiendas
              </a>
              <a href="#productos" className={'hidden items-center gap-2 text-sm font-semibold text-[#374e45] hover:text-[#e65320] sm:flex ' + focus}>
                <ShoppingBag className="h-5 w-5" aria-hidden="true" /> Productos
              </a>
              <Link href="/registro" className={'inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#f15a24] px-3 py-2 text-sm font-extrabold text-white hover:bg-[#dd4c16] sm:px-4 ' + focus}>
                <UserRound className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Registrarme</span><span className="sm:hidden">Registro</span>
              </Link>
              <a href="#categorias" className={'grid h-11 w-11 place-items-center rounded-xl border border-[#edf0eb] text-[#384b43] md:hidden ' + focus} aria-label="Ver categorías">
                <Menu className="h-6 w-6" aria-hidden="true" />
              </a>
            </nav>
          </div>

          <div className="pb-3 md:hidden">
            <SearchForm state={state} inputId="search-mobile" />
          </div>

          <nav aria-label="Categorías de negocios" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6">
            <Link href={catalogHref(state, { type: '', storesPage: 1 }, 'tiendas')} aria-current={!state.type ? 'page' : undefined}
              className={'inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ' + (!state.type ? 'bg-[#f65b24] text-white' : 'bg-[#f6f7f5] text-[#43584e] hover:bg-[#fdf0e9]') + ' ' + focus}>
              <LayoutGrid className="h-4 w-4" aria-hidden="true" /> Todas
            </Link>
            {CATEGORIES.map((c) => (
              <Link key={c.type} href={catalogHref(state, { type: c.type, storesPage: 1 }, 'tiendas')} aria-current={state.type === c.type ? 'page' : undefined}
                className={'inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ' + (state.type === c.type ? 'bg-[#fff0e7] text-[#bf4016] ring-1 ring-[#fbc3ac]' : 'bg-[#f6f7f5] text-[#43584e] hover:bg-[#fdf0e9]') + ' ' + focus}>
                <span aria-hidden="true">{c.emoji}</span>{c.name}
              </Link>
            ))}
            <a href="#promociones" className={'ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-[#df511e] ' + focus}>
              <Tag className="h-4 w-4" aria-hidden="true" /> Promociones
            </a>
          </nav>
        </div>
      </header>

      {isolated && <p className="mx-auto max-w-[1380px] px-4 pt-3 text-xs font-semibold text-[#83651f] sm:px-6" role="status">
        Vista aislada de pruebas · Solo tiendas habilitadas; no se procesan pagos reales.
      </p>}

      {livePreview && <MarketplaceCartShortcut />}
      {livePreview && <div id="preview-info" role="status" className="mx-auto mt-3 max-w-[1380px] px-4 sm:px-6"><p className="rounded-xl border border-[#a3d4b4] bg-[#edf9f0] px-4 py-3 text-sm font-semibold text-[#266642]"><strong>Catálogos reales · vista local de solo lectura:</strong> productos, fotografías y precios publicados de Master Burguer’s y Tokki Boba. Puedes armar una compra simulada multi-tienda; no se envían pedidos reales, no se cobra ni se asignan repartidores. Los precios y horarios pueden cambiar en las tiendas.</p></div>}
      {previewDemo && <div id="preview-info" role="status" className="mx-auto mt-3 max-w-[1380px] px-4 sm:px-6"><p className="rounded-xl border border-[#f0cf90] bg-[#fff6df] px-4 py-3 text-sm font-semibold text-[#7c5219]"><strong>Vista de demostración:</strong> Master Burguer’s y Tokki Boba aparecen con sus nombres reales. Los demás negocios, productos y precios son ejemplos ficticios. No se realizan pedidos ni pagos y no se consulta la base de datos real.</p></div>}

      <main id="contenido" className="mx-auto flex max-w-[1380px] flex-col gap-9 px-4 pb-12 pt-5 sm:gap-11 sm:px-6 sm:pt-7">
        <section aria-label="Bienvenida a MRTPVREST Marketplace" className="relative isolate overflow-hidden rounded-[1.5rem] bg-[#fff0e2] shadow-[0_12px_32px_rgba(37,56,43,.08)] sm:rounded-[1.75rem]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,#fff9eb,transparent_60%)]" aria-hidden="true" />
          <div className="absolute inset-y-0 right-0 w-[70%] bg-cover bg-center opacity-85 sm:w-[62%]" aria-hidden="true"
            style={{ backgroundImage: "linear-gradient(90deg,#fff0e2 0%,rgba(255,240,226,.35) 40%,rgba(36,53,34,.04) 100%),url('https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1300&q=82')" }} />
          <div className="relative flex min-h-[280px] flex-col justify-center gap-4 px-6 py-9 sm:min-h-[345px] sm:px-10 md:min-h-[380px] lg:px-14">
            <p className="text-xs font-extrabold uppercase tracking-[.15em] text-[#f45a21]">Compra local, vive mejor</p>
            <h1 className="max-w-[610px] font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-[#15332c] sm:text-5xl lg:text-[3.7rem]">
              Tus tiendas locales<br />en un solo <span className="text-[#f15a24]">lugar</span>
            </h1>
            <p className="max-w-[450px] text-sm font-medium leading-relaxed text-[#41564c] sm:text-base">
              Restaurantes, supermercados, ferreterías y mucho más. Encuentra negocios cercanos y compra directamente en su tienda.
            </p>
            <a className={action + ' w-fit'} href="#tiendas">Explorar tiendas <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
            <span className="mt-1 flex w-fit items-center gap-2 rounded-full bg-[#ffffffd9] px-3 py-2 text-xs font-extrabold text-[#217449] shadow-sm">
              <Heart className="h-4 w-4 fill-[#e9faf0]" aria-hidden="true" /> Apoyamos lo local
            </span>
          </div>
        </section>

        {hasFilters && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f9e0cb] bg-[#fff9f4] px-4 py-3 text-sm">
          <p className="font-medium text-[#7d4a2f]">
            Resultados {state.q ? 'para “' + state.q + '”' : ''}{state.type ? ' · ' + BUSINESS_TYPE_LABELS[state.type] : ''}{state.store ? ' · ' + state.store : ''}
          </p>
          <Link href="/" className={link}>Limpiar filtros</Link>
        </div>}

        <CatalogSection id="tiendas" title="Tiendas destacadas" eyebrow="CONOCE LOS NEGOCIOS" description="Descubre comercios disponibles en nuestro marketplace" state={state}
          result={stores} pageKey="storesPage" singular="tienda" plural="tiendas"
          empty="Todavía no hay tiendas publicadas en el marketplace.">
          {(items) => <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {items.map((s) => <StoreCard key={s.slug} store={s} state={state} previewDemo={readOnly} livePreview={livePreview} />)}
          </ul>}
        </CatalogSection>

        <section id="promociones" aria-labelledby="promos-title" className="scroll-mt-24">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="mb-1 text-xs font-extrabold uppercase tracking-[.12em] text-[#ef5b2a]">AHORRA EN TUS COMPRAS</p>
              <h2 id="promos-title" className="font-display text-2xl font-extrabold sm:text-3xl">🔥 Promociones</h2>
              <p className="mt-1 text-sm text-[#6b7c73]">{livePreview ? 'Promociones publicadas · vista sin compra' : previewDemo ? 'Precios ilustrativos, sin venta ni pedidos' : 'Ofertas vigentes publicadas por los negocios'}</p>
            </div>
            <a href="#productos" className={link + ' inline-flex items-center gap-1 text-sm'}>Ver todos los productos <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
          </div>
          {promotions.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {promotions.slice(0, 5).map((p) => <ProductCard key={p.id} product={p} previewDemo={readOnly} livePreview={livePreview} />)}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e9f1e8] bg-white p-5">
              <p className="font-semibold text-[#617266]">Las ofertas vigentes aparecerán aquí cuando las tiendas las publiquen.</p>
              <a href="#productos" className={link + ' text-sm'}>Explorar productos →</a>
            </div>
          )}
        </section>

        <section id="categorias" aria-labelledby="category-title" className="scroll-mt-24">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="mb-1 text-xs font-extrabold uppercase tracking-[.12em] text-[#ef5b2a]">TODO EN UN SOLO LUGAR</p>
              <h2 id="category-title" className="font-display text-2xl font-extrabold sm:text-3xl">Categorías</h2>
            </div>
            <a href="#tiendas" className={link + ' text-sm'}>Ver tiendas →</a>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {CATEGORIES.map((c) => (
              <Link key={c.type} href={catalogHref(state, { type: c.type, storesPage: 1 }, 'tiendas')}
                className={'group relative isolate flex min-h-[150px] overflow-hidden rounded-[1.25rem] bg-gradient-to-br p-4 transition hover:-translate-y-1 hover:shadow-lg sm:min-h-[165px] ' + c.color + ' ' + focus}>
                <span className="relative z-10 flex max-w-[73%] flex-col justify-between">
                  <span><strong className="block text-base leading-tight sm:text-lg">{c.name}</strong><small className="mt-1 block text-xs font-medium text-[#4a5b55]">{c.subtitle}</small></span>
                  <span className="mt-auto grid h-8 w-8 place-items-center rounded-full bg-white text-[#1f4636] shadow-sm"><ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
                </span>
                <span className="absolute bottom-2 right-1 text-[4.5rem] drop-shadow-xl transition-transform group-hover:scale-110 sm:text-[5.5rem]" aria-hidden="true">{c.emoji}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-4 rounded-[1.25rem] bg-[#e8f4e9] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-7" aria-label="Cómo comprar">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-[#197a41]"><Truck className="h-6 w-6" aria-hidden="true" /></span>
            <div>
              <h2 className="font-display text-lg font-extrabold sm:text-xl">Compra fácil en los negocios de tu zona</h2>
              <p className="mt-1 text-sm text-[#456353]">Elige una tienda, arma tu pedido en su catálogo y selecciona las opciones de entrega disponibles.</p>
            </div>
          </div>
          <a href="#tiendas" className={action + ' w-fit bg-[#167847] hover:bg-[#0f6239]'}>Encontrar tiendas <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
        </section>

        <CatalogSection id="productos" title="Productos para ti" eyebrow="DESCUBRE MÁS" description={livePreview ? 'Fotografías y precios publicados por las dos tiendas; no se puede comprar en esta vista' : 'Precios y ofertas según cada comercio; compra al entrar a su tienda'} state={state}
          result={products} pageKey="productsPage" singular="producto" plural="productos"
          empty="Todavía no hay productos publicados en el marketplace.">
          {(items) => <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((p) => <ProductCard key={p.id} product={p} previewDemo={readOnly} livePreview={livePreview} />)}
          </ul>}
        </CatalogSection>

        <footer className="grid gap-6 border-t border-[#dfe9e1] pt-8 text-sm text-[#647268] sm:grid-cols-3">
          <div><strong className="font-display text-lg text-[#176f3d]">MRTPVREST <span className="text-[#f15a24]">Marketplace</span></strong><p className="mt-2">Todo lo que necesitas, más cerca de ti.</p></div>
          <div><h3 className="font-bold text-[#243b30]">Explorar</h3><a className={'mt-2 block w-fit ' + link} href="#tiendas">Tiendas</a><a className={'mt-2 block w-fit ' + link} href="#productos">Productos</a><Link className={'mt-2 block w-fit ' + link} href="/registro">Registro de usuarios</Link></div>
          <div><h3 className="font-bold text-[#243b30]">Compra con claridad</h3><p className="mt-2">Los precios, métodos de pago y condiciones de entrega se confirman en cada tienda.</p></div>
        </footer>
      </main>

      <nav aria-label="Navegación móvil" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-[#e7eae6] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_30px_rgba(0,0,0,.07)] backdrop-blur-md sm:hidden">
        <Link href="/" className={'flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold text-[#ed5821] ' + focus}><Store className="h-5 w-5" aria-hidden="true" /> Inicio</Link>
        <a href="#categorias" className={'flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-[#54635a] ' + focus}><LayoutGrid className="h-5 w-5" aria-hidden="true" /> Categorías</a>
        <a href="#tiendas" className={'flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-[#54635a] ' + focus}><ShoppingBag className="h-5 w-5" aria-hidden="true" /> Tiendas</a>
        <Link href="/registro" className={'flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-[#54635a] ' + focus}><UserRound className="h-5 w-5" aria-hidden="true" /> Registro</Link>
      </nav>
    </div>
  );
}

function SearchForm({ state, inputId }: { state: CatalogState; inputId: string }) {
  return <form method="get" action="/" role="search" aria-label="Buscar tiendas y productos" className="flex min-w-0 flex-1 items-stretch gap-2">
    <label htmlFor={inputId} className="sr-only">Buscar tiendas o productos</label>
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#87968b]" aria-hidden="true" />
      <input id={inputId} name="q" type="search" maxLength={MAX_QUERY_LENGTH}
        defaultValue={state.q} placeholder="Buscar productos, tiendas o categorías..."
        className={'h-11 w-full rounded-xl border border-[#e3e8e4] bg-[#f7f8f7] pl-12 pr-3 text-base text-[#273d31] placeholder:text-[#9ca7a0] md:h-12 ' + focus} />
    </div>
    {state.type && <input type="hidden" name="type" value={state.type} />}
    {state.store && <input type="hidden" name="store" value={state.store} />}
    <button type="submit" className={'inline-flex h-11 w-12 shrink-0 items-center justify-center rounded-xl bg-[#fc5e23] text-white transition hover:bg-[#dd4610] md:h-12 md:w-14 ' + focus} aria-label="Buscar">
      <Search className="h-5 w-5" aria-hidden="true" />
    </button>
  </form>;
}

function CatalogSection<T>({ id, title, eyebrow, description, result, state, pageKey, singular, plural, empty, children }: {
  id: string; title: string; eyebrow: string; description: string;
  result: SectionResult<T>; state: CatalogState; pageKey: 'storesPage' | 'productsPage';
  singular: string; plural: string; empty: string; children: (items: T[]) => ReactNode;
}) {
  return <section id={id} aria-labelledby={id + '-title'} className="scroll-mt-24">
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <p className="mb-1 text-xs font-extrabold uppercase tracking-[.12em] text-[#ef5b2a]">{eyebrow}</p>
        <h2 id={id + '-title'} className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h2>
        <p className="mt-1 text-sm text-[#718077]">{description}</p>
      </div>
      {result.status === 'ok' && result.data.total > 0 && <p className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#60766a]">
        {result.data.total} {result.data.total === 1 ? singular : plural}
      </p>}
    </div>
    {id === 'productos' && state.store && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#ffeddf] px-4 py-3 text-sm">
      <span>Productos de <strong>{state.store}</strong></span>
      <Link href={catalogHref(state, { store: '', productsPage: 1 }, 'productos')} className={link}>Ver todas las tiendas</Link>
    </div>}
    {result.status === 'error' ? <div role="alert" className="rounded-2xl border border-[#ffc8b7] bg-[#fff5f0] p-5 text-[#8b3327]">
      <strong>No pudimos cargar {plural}</strong><p className="mt-1">{sectionError(result.reason)}</p>
      <form className="mt-3" method="get" action="/">
        {[...catalogSearchParams(state).entries()].map(([name, value]) => <input key={name} name={name} value={value} type="hidden" />)}
        <button type="submit" className={action}>Reintentar</button>
      </form>
    </div> : result.data.total === 0 ? <div className="rounded-2xl border border-dashed border-[#cddfd1] bg-white p-7">
      <p className="font-semibold">{state.q || state.type || state.store ? 'No encontramos resultados con estos filtros.' : empty}</p>
      {(state.q || state.type || state.store) && <Link href="/" className={link + ' mt-2 inline-block text-sm'}>Limpiar filtros</Link>}
    </div> : result.data.items.length === 0 ? <div className="rounded-2xl border border-dashed border-[#cddfd1] bg-white p-7">
      <p className="font-semibold">Esta página no tiene {plural}.</p>
      <a href={catalogHref(state, patchPage(pageKey, 1), id)} className={link + ' mt-2 inline-block text-sm'}>Ir a la primera página</a>
    </div> : <>
      {children(result.data.items)}
      <Pagination data={result.data} state={state} id={id} pageKey={pageKey} plural={plural} />
    </>}
  </section>;
}

function Pagination({ data, state, id, pageKey, plural }: {
  data: CatalogPage<unknown>; state: CatalogState; id: string;
  pageKey: 'storesPage' | 'productsPage'; plural: string;
}) {
  const pages = totalPages(data);
  if (pages < 2) return null;
  return <nav aria-label={'Paginación de ' + plural} className="mt-6 flex items-center justify-center gap-3">
    {data.page > 1 ? <a className={action + ' !bg-white !text-[#df501c] shadow-none'} href={catalogHref(state, patchPage(pageKey, data.page - 1), id)} rel="prev"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Anterior</a> : <span className="px-2 text-sm text-[#9ba79f]">Anterior</span>}
    <span className="text-sm font-semibold tabular-nums">{data.page} / {pages}</span>
    {data.page < pages ? <a className={action + ' !bg-white !text-[#df501c] shadow-none'} href={catalogHref(state, patchPage(pageKey, data.page + 1), id)} rel="next">Siguiente<ChevronRight className="h-4 w-4" aria-hidden="true" /></a> : <span className="px-2 text-sm text-[#9ba79f]">Siguiente</span>}
  </nav>;
}

function StoreCard({ store, state, previewDemo, livePreview }: { store: StoreSummary; state: CatalogState; previewDemo: boolean; livePreview: boolean }) {
  const href = storeHref(store.slug);
  const eta = etaWindow(store.estimatedDelivery);
  const hasFee = store.deliveryFee !== null;
  const previewMaster = previewDemo && store.slug === 'master-burguer-s';
  const previewTokki = previewDemo && store.slug === 'tokki-bobba';
  const featuredPreview = previewMaster || previewTokki;
  const brandBackdrop: CSSProperties = previewMaster
    ? { background: 'radial-gradient(circle at 70% 5%, #a94d17 0%, #36251f 45%, #171717 100%)' }
    : previewTokki
      ? { background: 'radial-gradient(circle at 80% 15%, #fcebf8 0%, #e4c9ed 52%, #c1e6d9 100%)' }
      : cardTint(store.slug);
  const brandGlyph = previewMaster ? '🍔' : previewTokki ? '🐼🧋' : businessEmoji(store.businessType);
  const subtitle = previewMaster ? 'Hamburguesas, tacos y más' : previewTokki ? 'Bubble tea y bebidas' : BUSINESS_TYPE_LABELS[store.businessType];
  return <li className={'min-w-0 rounded-[1.25rem] border bg-white p-3 shadow-[0_7px_18px_rgba(34,54,42,.05)] transition hover:-translate-y-0.5 hover:shadow-lg sm:p-4 ' + (featuredPreview ? 'border-[#f8bc91] ring-1 ring-[#ffeee4]' : 'border-[#e8eee9]')}>
    <a href={livePreview ? '/comercio/' + store.slug : previewDemo ? '#preview-info' : href ?? '#tiendas'} aria-label={livePreview ? 'Armar pedido de prueba en ' + store.name : previewDemo ? 'Ver aviso de demostración de ' + store.name : 'Visitar ' + store.name} className={'flex h-full flex-col gap-2.5 ' + focus}>
      <div className="relative grid aspect-[5/4] place-items-center overflow-hidden rounded-[1rem]" style={brandBackdrop}>
        <span className={featuredPreview ? 'text-5xl drop-shadow-xl sm:text-6xl' : 'text-6xl drop-shadow-xl'} aria-hidden="true">{brandGlyph}</span>
        {featuredPreview && <span className={'absolute right-2 top-2 rounded-full px-2 py-1 text-[10px] font-extrabold ' + (previewMaster ? 'bg-[#fb741e] text-white' : 'bg-white text-[#7f428a]')}>DESTACADO</span>}
        {store.logoUrl && <Image src={store.logoUrl} alt="" fill unoptimized sizes="(max-width: 640px) 50vw, 16vw" className="bg-white object-contain p-3" />}
        <span className={'absolute bottom-2 left-2 rounded-full px-2 py-1 text-[10px] font-extrabold ' + (store.isOpen ? 'bg-white text-[#168045]' : 'bg-[#34443a] text-white')}>{livePreview ? 'Solo lectura' : previewDemo ? 'Demostración' : store.isOpen ? 'Disponible' : 'Cerrada'}</span>
      </div>
      <strong className="line-clamp-2 text-sm leading-snug sm:text-base">{store.name}</strong>
      <span className="text-[11px] font-semibold text-[#7b8b80]">{subtitle}</span>
      <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-[#5d7565]">
        {previewDemo ? <span className="inline-flex items-center gap-1 text-[#7c6a48]"><Store className="h-3.5 w-3.5" aria-hidden="true" />{livePreview ? 'Catálogo público real' : 'Ficha de demostración'}</span> : <>
          {eta && <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{eta}</span>}
          <span className="inline-flex items-center gap-1"><Bike className="h-3.5 w-3.5" aria-hidden="true" />{hasFee ? store.deliveryFee === 0 ? 'Gratis' : formatPrice(store.deliveryFee!, 'MXN') : 'Según zona'}</span>
        </>}
      </span>
      <span className="mt-1 inline-flex items-center gap-1 text-xs font-extrabold text-[#e75821]">{livePreview ? 'Armar pedido de prueba' : previewDemo ? 'Solo ejemplo' : 'Ver tienda'} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
    </a>
    {previewDemo && featuredPreview && !livePreview ? <p className="mt-3 border-t border-[#edf0ea] pt-2 text-center text-[11px] font-semibold text-[#846c54]">Catálogo real aún sin conectar</p> : <a href={livePreview ? '/comercio/' + store.slug : catalogHref(state, { store: store.slug, productsPage: 1 }, 'productos')} className={'mt-3 block border-t border-[#edf0ea] pt-2 text-center text-[11px] font-bold text-[#496b54] hover:text-[#d5541f] ' + focus}>Ver sus productos</a>}
  </li>;
}

function ProductCard({ product, previewDemo, livePreview }: { product: ProductSummary; previewDemo: boolean; livePreview: boolean }) {
  const href = storeHref(product.store.slug);
  const off = discountPercent(product);
  return <li className="min-w-0 overflow-hidden rounded-[1.2rem] border border-[#e8eee9] bg-white p-2.5 shadow-[0_7px_18px_rgba(34,54,42,.045)] transition hover:-translate-y-0.5 hover:shadow-lg sm:p-3">
    <a href={livePreview ? '/comercio/' + product.store.slug : previewDemo ? '#preview-info' : href ?? '#productos'} className={'group flex h-full flex-col gap-2 ' + focus} aria-label={livePreview ? 'Producto real solo lectura: ' + product.name : previewDemo ? 'Producto de demostración: ' + product.name : 'Ver ' + product.name + ' en ' + product.store.name}>
      <span className="relative grid aspect-[5/4] place-items-center overflow-hidden rounded-[.9rem]" style={cardTint(product.store.slug)}>
        <span className="text-6xl drop-shadow-lg transition-transform group-hover:scale-110" aria-hidden="true">{productEmoji(product.name)}</span>
        {product.imageUrl && <Image src={product.imageUrl} alt="" fill unoptimized sizes="(max-width: 640px) 50vw, 20vw" className="object-cover transition-transform group-hover:scale-105" />}
        {off !== null && <span className="absolute left-2 top-2 rounded-lg bg-[#f35b22] px-2 py-1 text-xs font-extrabold text-white">-{off}%</span>}
      </span>
      <strong className="line-clamp-2 min-h-[2.5em] text-sm leading-snug sm:text-[15px]">{product.name}</strong>
      <span className="block truncate text-[11px] text-[#6c8173]">{product.store.name}</span>
      <span className="flex flex-wrap items-baseline gap-1.5">
        <strong className="text-base font-extrabold tabular-nums text-[#e65319]">{product.fromVariant ? 'Desde ' : ''}{formatPrice(product.promoPrice ?? product.price, product.currency)}</strong>
        {product.promoPrice !== null && <s className="text-xs tabular-nums text-[#96a19a]">{formatPrice(product.price, product.currency)}</s>}
      </span>
      <span className="mt-auto flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#f85c25] px-2 py-2 text-xs font-bold text-white group-hover:bg-[#d64e1c]">
        {livePreview ? 'Armar pedido de prueba' : previewDemo ? 'Vista de ejemplo' : 'Ver en tienda'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </a>
  </li>;
}
