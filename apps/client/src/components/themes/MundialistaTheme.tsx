'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, ShoppingBag, Plus, Minus, Trash2, X, MessageCircle, MapPin, Phone,
  Trophy, ChevronRight, ChevronDown, Star, Banknote, CreditCard, Building2,
  Truck, Leaf, Clock, Headphones, User, Instagram, Facebook,
  Youtube, Music2, Mail, Lock, Navigation, Gift,
} from 'lucide-react';
import { useCart } from '../../lib/cartStore';
import { cldImage } from '@/lib/cloudinary';
import { productEmoji } from '../../lib/productEmoji';
import BannerCarousel, { collectBanners } from '../BannerCarousel';
import ProductModal, { needsModal } from '../ProductModal';
import { ReactionButton } from '../ReactionButton';
import { StoreLocaleProvider, useMoney, useLang } from '../StoreLocaleContext';
import { LanguageSwitcher } from '../LanguageSwitcher';
import StoreCheckout from '../StoreCheckout';
import MyOrdersModal from '../MyOrdersModal';
import type { DeliveryConfig } from '../../lib/delivery';
import {
  getAuth, clearAuth, loginCustomer, registerCustomer, type AuthState,
} from '../../lib/customerAuth';

// ══════════════════════════════════════════════════════════════════════════════
//  TEMA "MENÚ MUNDIALISTA" — estadio nocturno · negro / dorado / verde cancha
//  Reusa ProductModal (dark) + StoreCheckout probados; solo cambia la capa visual.
//  Tipografías: Bebas Neue (titulares) + Montserrat (cuerpo/precios/CTAs).
// ══════════════════════════════════════════════════════════════════════════════

// ── Guía de estilo (paleta de la especificación) ──────────────────────────────
const BG = '#08080F';
const SURF = '#151B1C';
const SURF2 = '#1F2227';
const GOLD = '#FFC107';
const GOLD_LT = '#FFD54F';
const GOLD_DK = '#D99A00';
const GREEN = '#2E7D32';
const GREEN_LT = '#3CB54A';
const RED = '#E53935';
const BLUE = '#3B82F6';
const TEXT = '#FFFFFF';
const TEXT2 = '#E0E1E0';
const MUTED = '#9A9AA2';
const FAINT = '#FFFFFF55';
const BORDER = 'rgba(255,255,255,0.10)';
const GOLD_BD = 'rgba(255,193,7,0.45)';

const DISP = 'var(--font-bebas), Impact, sans-serif';
const BODY = 'var(--font-montserrat), system-ui, sans-serif';

// fmt ahora viene de useMoney() (moneda/locale del tenant), no de un const global.
const priceOf = (p: any) => (p.isPromo && p.promoPrice ? p.promoPrice : p.price);
// Precio "Desde" para productos con variantes: menor precio de variante > 0; si no
// hay variantes con precio, cae al precio base (evita mostrar "Desde $0").
const priceFrom = (p: any): { value: number; from: boolean } => {
  const vs = (p.variants || []).map((v: any) => Number(v.price)).filter((n: number) => n > 0);
  return vs.length ? { value: Math.min(...vs), from: true } : { value: priceOf(p), from: false };
};

// La portada (hero) se sube a 1600px (mode=hero), así que NO usamos cldImage
// (que capa a 800). Servimos f_auto/q_auto hasta 1600 sin recortar. URLs que no
// son de Cloudinary (pegadas a mano) se devuelven intactas.
function heroSrc(url?: string | null): string | undefined {
  if (!url) return undefined;
  const M = '/image/upload/';
  if (url.includes(M) && !url.includes('/f_auto')) return url.replace(M, `${M}f_auto,q_auto,c_limit,w_1600/`);
  return url;
}

// Icono futbolero por categoría (data-driven sobre el nombre real del catálogo).
const CAT_ICONS: [RegExp, string][] = [
  [/combo|paquete|partido|mundial/i, '⚽'],
  [/hamburg|burger|burguer/i, '🍔'],
  [/alit|boneless|wing|pollo|chicken/i, '🍗'],
  [/taco/i, '🌮'],
  [/gringa|quesadill|burrito/i, '🌯'],
  [/volcan|nacho/i, '🧀'],
  [/hot ?dog|salchich/i, '🌭'],
  [/papa|fries|gajo|fritas?|entrada|extra/i, '🍟'],
  [/mojito|coctel|cocktail|michela/i, '🍹'],
  [/frapp|caf[eé]|\bte\b|malteada|smoothie|licuad/i, '🧋'],
  [/refresc|soda|cola|bebida|agua|jugo|limonad/i, '🥤'],
  [/cerve|beer|chela/i, '🍺'],
  [/calor|nieve|helad|postre|pastel|cheesecake|dulce/i, '🍧'],
  [/kilo|\bkg\b|especial/i, '🏆'],
  [/env[ií]o/i, '🛵'],
];
function categoryIcon(name?: string | null): string {
  if (!name) return '🍽️';
  for (const [re, ic] of CAT_ICONS) if (re.test(name)) return ic;
  return '🍽️';
}
const isComboCat = (name?: string | null) => !!name && /combo|paquete|partido|mundial/i.test(name);
const isShippingCat = (name?: string | null) => !!name && /env[ií]o/i.test(name);

type Info = {
  id: string; name: string; slug: string; logo: string | null; hasWebStore: boolean;
  whatsappNumber: string | null; minOrderAmount?: number; estimatedDelivery?: number; isOpen?: boolean;
  whatsappOrder?: { enabled: boolean; number: string | null };
  dineIn?: { table: string; locationId: string | null } | null;
  onlinePayment?: boolean; delivery?: DeliveryConfig; heroImageUrl?: string | null;
  currency?: string | null; currencyLocale?: string | null;
  welcomeBonusPoints?: number;
  themeConfig: { theme?: string; primaryColor?: string } | null;
};

type MundialistaThemeProps = {
  data: { info: Info; menu: { categories: any[] }; locations: any[] };
};

type OrderMode = 'DELIVERY' | 'TAKEOUT';

export function MundialistaTheme({ data }: MundialistaThemeProps) {
  const { info, menu, locations } = data;
  const fmt = useMoney();
  const { t } = useLang();
  // Ocultamos "Envíos" del grilla (es un recargo, no un platillo) y categorías vacías.
  const categories: any[] = (menu.categories || [])
    .filter((c: any) => (c.items || []).length > 0 && !isShippingCat(c.name));

  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());

  const slug = info.slug;
  const PROFILE_KEY = `mrtpv:customer:${slug}`;

  const [query, setQuery] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [modalProduct, setModalProduct] = useState<any>(null);
  const [activeCat, setActiveCat] = useState<string>(categories[0]?.id ?? '');
  const [orderMode, setOrderMode] = useState<OrderMode>('DELIVERY');
  const [featTab, setFeatTab] = useState<'pop' | 'promo' | 'all'>('all');
  const [auth, setAuthState] = useState<AuthState | null>(null);
  const [myOrdersOpen, setMyOrdersOpen] = useState(false);

  useEffect(() => { setAuthState(getAuth(slug)); }, [slug]);

  const banners = collectBanners(locations);
  const waNumber = (info.whatsappNumber || '').replace(/\D/g, '');
  const minOrder = info.minOrderAmount || 0;
  const primaryLocation = locations[0] || null;
  const cityLabel = (primaryLocation?.address || primaryLocation?.name || 'Entrega a domicilio').toString();

  const allItems = useMemo(() => categories.flatMap((c: any) => c.items || []), [categories]);
  const comboCat = useMemo(() => categories.find((c: any) => isComboCat(c.name)) || null, [categories]);
  const gridCats = useMemo(() => categories.filter((c: any) => !isComboCat(c.name)), [categories]);
  const popular = useMemo(() => allItems.filter((i: any) => i.isPopular), [allItems]);
  const promos = useMemo(() => allItems.filter((i: any) => i.isPromo), [allItems]);

  const featured = useMemo(() => {
    const base = featTab === 'pop' ? (popular.length ? popular : allItems)
      : featTab === 'promo' ? promos
      : allItems;
    return base.slice(0, 8);
  }, [featTab, popular, promos, allItems]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return allItems.filter((i: any) =>
      i.name?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
  }, [q, allItems]);

  const pick = (p: any) => {
    if (needsModal(p)) { setModalProduct(p); return; }
    add({ id: p.id, menuItemId: p.id, name: p.name, price: priceOf(p) });
  };

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const scrollToCat = (id: string) => { setActiveCat(id); scrollTo(`mb-cat-${id}`); };
  const scrollToCombos = () => scrollTo(comboCat ? `mb-cat-${comboCat.id}` : 'mb-menu');

  // Scroll-spy de la barra de categorías.
  useEffect(() => {
    if (categories.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      entries => {
        const vis = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis) setActiveCat(vis.target.getAttribute('data-cat') || '');
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: [0, 0.2, 0.5] },
    );
    categories.forEach((c: any) => { const el = document.getElementById(`mb-cat-${c.id}`); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [categories]);

  const onBannerLink = (b: any) => {
    if (b.linkType === 'CATEGORY' && b.linkValue) scrollToCat(b.linkValue);
    else if (b.linkType === 'ITEM' && b.linkValue) { const p = allItems.find((x: any) => x.id === b.linkValue); if (p) pick(p); }
  };

  const buildWaMessage = () => {
    const items = lines.map(l => `• ${l.quantity}× ${l.name} — ${fmt(l.price * l.quantity)}`).join('\n');
    return `¡Hola ${info.name.trim()}! ⚽ Quiero este pedido del *Menú Mundialista*:\n\n${items}\n\n*Total:* ${fmt(total)}\n\n¿Me confirman disponibilidad?`;
  };
  const orderByWhatsApp = () => {
    if (!waNumber) return;
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(buildWaMessage())}`, '_blank', 'noopener');
  };
  const subscribeWhatsApp = () => {
    if (!waNumber) return;
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent('¡Hola! Quiero recibir las promos del partido por WhatsApp ⚽')}`, '_blank', 'noopener');
  };

  const goCheckout = () => { setCartOpen(false); setCheckoutOpen(true); };

  return (
    <StoreLocaleProvider currency={info.currency} locale={info.currencyLocale}>
    <div className="min-h-screen" style={{ background: BG, color: TEXT, fontFamily: BODY }}>
      <div aria-hidden className="fixed inset-0 pointer-events-none" style={{
        background: `radial-gradient(1000px 460px at 50% -10%, ${GOLD}1c, transparent 60%), radial-gradient(760px 420px at 88% 6%, ${GREEN}14, transparent 55%), linear-gradient(180deg, #04040A, ${BG} 36%)`,
      }} />

      <div className="relative">
        <Header
          info={info} waNumber={waNumber} quantity={quantity} total={total} cityLabel={cityLabel}
          query={query} setQuery={setQuery} orderMode={orderMode} setOrderMode={setOrderMode}
          auth={auth} onLogin={() => setLoginOpen(true)} onMyOrders={() => setMyOrdersOpen(true)}
          onSignOut={() => { clearAuth(slug); setAuthState(null); }}
          onCart={() => setCartOpen(true)} onWhatsApp={orderByWhatsApp}
        />

        {q ? (
          <main className="max-w-7xl mx-auto px-4 py-8">
            <SectionHead title={results.length > 0 ? `Resultados (${results.length})` : `Sin resultados para “${query}”`} />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {results.map((p: any) => <ProductCard key={p.id} p={p} slug={slug} onOpen={() => pick(p)} />)}
            </div>
          </main>
        ) : (
          <>
            <Hero info={info} onOrder={() => scrollTo('mb-menu')} onCombos={scrollToCombos} />

            {banners.length > 0 && (
              <section className="max-w-7xl mx-auto px-4 mt-6">
                <BannerCarousel banners={banners} variant="dark" accent={GOLD} onLink={onBannerLink} />
              </section>
            )}

            <CategoryNav categories={categories} activeCat={activeCat} onPick={scrollToCat} />

            {/* Layout principal: contenido + carrito fijo (desktop) */}
            <div className="max-w-7xl mx-auto px-4 mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-7 lg:items-start">
              <div className="min-w-0">
                {/* DESTACADOS con pestañas */}
                <section className="mb-12">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                    <SectionHead title="Lo más pedido" star inline />
                    <div className="flex gap-2 p-1 rounded-full" style={{ background: SURF2 }}>
                      {([['all', 'Ver todo'], ['pop', 'Más vendido'], ['promo', 'Promos del partido']] as [typeof featTab, string][]).map(([k, label]) => (
                        <button key={k} onClick={() => setFeatTab(k)} className="px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all"
                          style={featTab === k ? { background: GOLD, color: '#1A1206' } : { color: MUTED }}>{label}</button>
                      ))}
                    </div>
                  </div>
                  {featured.length === 0 ? (
                    <p className="py-10 text-center text-sm" style={{ color: MUTED }}>Sin platillos en esta selección.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                      {featured.map((p: any) => <ProductCard key={p.id} p={p} slug={slug} onOpen={() => pick(p)} />)}
                    </div>
                  )}
                </section>

                {/* COMBOS DEL PARTIDO (sección verde) */}
                {comboCat && (
                  <CombosSection id={`mb-cat-${comboCat.id}`} dataCat={comboCat.id} category={comboCat} onOpen={pick} />
                )}

                {/* SECCIONES POR CATEGORÍA */}
                <div id="mb-menu">
                  {gridCats.map((category: any) => (
                    <section key={category.id} id={`mb-cat-${category.id}`} data-cat={category.id} className="mb-12 scroll-mt-[228px] md:scroll-mt-[160px]">
                      <div className="flex items-center justify-between mb-5">
                        <SectionHead title={`Nuestras ${category.name}`} icon={categoryIcon(category.name)} inline />
                        <button onClick={() => scrollToCat(category.id)} className="text-[12px] font-bold" style={{ color: GOLD }}>Ver todas</button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                        {(category.items || []).map((p: any) => <ProductCard key={p.id} p={p} slug={slug} onOpen={() => pick(p)} />)}
                      </div>
                    </section>
                  ))}
                </div>

                {/* PROMOCIONES Y BENEFICIOS (trust badges) */}
                <TrustBadges estimated={info.estimatedDelivery} />
              </div>

              {/* CARRITO FIJO (solo desktop) */}
              <aside className="hidden lg:block sticky top-[150px]">
                <DesktopCart accent={GOLD} minOrder={minOrder} allItems={allItems} onCheckout={goCheckout} onBrowse={() => scrollTo('mb-menu')} onWhatsApp={orderByWhatsApp} waNumber={waNumber} suggestions={popular.length ? popular : allItems} onAddSuggestion={pick} />
              </aside>
            </div>

            {/* NEWSLETTER */}
            {waNumber && <Newsletter onSubscribe={subscribeWhatsApp} />}
          </>
        )}

        <Footer info={info} primaryLocation={primaryLocation} waNumber={waNumber} minOrder={minOrder}
          onWhatsApp={orderByWhatsApp} onNav={scrollTo} onCombos={scrollToCombos} />
      </div>

      {/* Barra inferior (móvil) */}
      {quantity > 0 && !cartOpen && (
        <div className="lg:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-40">
          <button onClick={() => setCartOpen(true)}
            className="w-full flex items-center justify-between pl-4 pr-2 py-2 rounded-[16px] font-bold active:scale-[0.99] transition"
            style={{ background: SURF, border: `1px solid ${GOLD_BD}`, boxShadow: '0 16px 36px rgba(0,0,0,0.5)' }}>
            <span className="flex items-center gap-2.5 text-sm">
              <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: SURF2 }}><ShoppingBag className="w-5 h-5" style={{ color: GOLD }} /></span>
              <span className="text-left leading-tight"><span className="block text-[11px]" style={{ color: MUTED }}>{quantity} {quantity === 1 ? 'producto' : 'productos'}</span><span className="block">{fmt(total)}</span></span>
            </span>
            <span className="flex items-center gap-1.5 px-4 py-2.5 rounded-[12px] text-[14px]" style={{ background: GOLD, color: '#1A1206' }}>{t('checkout')} <ChevronRight className="w-4 h-4" /></span>
          </button>
        </div>
      )}

      {/* Carrito (bottom-sheet / slide-over móvil) */}
      {cartOpen && (
        <MobileCart onClose={() => setCartOpen(false)} onCheckout={goCheckout} onWhatsApp={orderByWhatsApp}
          waNumber={waNumber} allItems={allItems} minOrder={minOrder} accent={GOLD} />
      )}

      {loginOpen && (
        <LoginModal slug={slug} info={info} profileKey={PROFILE_KEY}
          onClose={() => setLoginOpen(false)} onAuthed={() => { setAuthState(getAuth(slug)); setLoginOpen(false); }} />
      )}

      {modalProduct && <ProductModal product={modalProduct} accent={GOLD} variant="dark" onClose={() => setModalProduct(null)} />}

      <StoreCheckout open={checkoutOpen} onClose={() => setCheckoutOpen(false)} slug={slug} primary={GOLD}
        locations={locations} delivery={info.delivery} minOrderAmount={info.minOrderAmount}
        onlinePayment={info.onlinePayment} initialOrderType={info.dineIn ? 'DINE_IN' : orderMode} whatsappOrder={info.whatsappOrder}
        lockedTable={info.dineIn?.table} lockedLocationId={info.dineIn?.locationId} />

      <MyOrdersModal open={myOrdersOpen} onClose={() => setMyOrdersOpen(false)} slug={slug} primary={GOLD}
        products={allItems} onReordered={() => setCheckoutOpen(true)} />

      <style dangerouslySetInnerHTML={{ __html: `.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}` }} />
    </div>
    </StoreLocaleProvider>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  HEADER
// ══════════════════════════════════════════════════════════════════════════════
function Header({ info, waNumber, quantity, total, cityLabel, query, setQuery, orderMode, setOrderMode, auth, onLogin, onMyOrders, onSignOut, onCart, onWhatsApp }: any) {
  const fmt = useMoney();
  const { t } = useLang();
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl" style={{ background: `${BG}e6`, borderBottom: `1px solid ${BORDER}` }}>
      <div className="max-w-7xl mx-auto px-4">
        {/* Fila principal */}
        <div className="h-[60px] flex items-center gap-3">
          {info.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cldImage(info.logo, { width: 120 })} alt={info.name} loading="eager" decoding="async" className="w-10 h-10 rounded-full object-cover shrink-0" style={{ border: `1.5px solid ${GOLD}` }} />
          ) : <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-extrabold" style={{ background: `${GOLD}22`, color: GOLD }}>{info.name.trim().charAt(0)}</div>}

          {/* Estado de la tienda. Solo se monta el tema cuando está abierta
              (page.tsx corta en isOpen===false); el tiempo es de ENTREGA y solo
              aplica en modo DELIVERY. */}
          {info.isOpen !== false && (
            <span className="flex items-center gap-1.5 shrink-0 px-2.5 h-7 rounded-full text-[11px] font-bold" style={{ background: '#22c55e1a', color: '#22c55e', border: '1px solid #22c55e40' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
              Abierto
              {orderMode === 'DELIVERY' && info.estimatedDelivery ? <span className="hidden sm:inline font-semibold opacity-80">· ~{info.estimatedDelivery} min</span> : null}
            </span>
          )}

          {/* Selector de dirección (desktop) */}
          <button className="hidden md:flex items-center gap-2 px-3 h-10 rounded-xl max-w-[220px]" style={{ background: SURF2, border: `1px solid ${BORDER}` }}>
            <MapPin className="w-4 h-4 shrink-0" style={{ color: GOLD }} />
            <span className="min-w-0 text-left leading-tight">
              <span className="block text-[9px] uppercase tracking-wide" style={{ color: MUTED }}>Recibir en</span>
              <span className="block text-[12px] font-semibold truncate">{cityLabel}</span>
            </span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: MUTED }} />
          </button>

          {/* Buscador (desktop) */}
          <div className="hidden md:flex items-center gap-2 px-3.5 h-10 rounded-full flex-1 max-w-md" style={{ background: SURF2, border: `1px solid ${BORDER}` }}>
            <Search className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('search')} className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#7A7A82]" />
            {query && <button onClick={() => setQuery('')} aria-label="Limpiar"><X className="w-4 h-4" style={{ color: MUTED }} /></button>}
          </div>

          <div className="flex-1 md:flex-none" />

          {/* Toggle Entrega / Recoger (desktop) */}
          <DeliveryToggle orderMode={orderMode} setOrderMode={setOrderMode} className="hidden lg:flex" />

          <div className="hidden sm:block shrink-0" style={{ color: TEXT }}><LanguageSwitcher accent={GOLD} /></div>

          {waNumber && (
            <button onClick={onWhatsApp} className="hidden md:flex items-center gap-2 px-4 h-10 rounded-full font-bold text-sm text-white active:scale-95 transition shrink-0" style={{ background: '#25D366' }}>
              <MessageCircle className="w-4 h-4" /> <span className="hidden lg:inline">Pide por WhatsApp</span>
            </button>
          )}

          {/* Login */}
          {auth && onMyOrders && (
            <button onClick={onMyOrders} className="flex items-center gap-1.5 px-2.5 h-10 rounded-full shrink-0" style={{ background: SURF2, border: `1px solid ${BORDER}` }} title="Mis pedidos · volver a pedir">
              <span className="text-base leading-none">🧾</span>
              <span className="hidden lg:block text-[12px] font-semibold" style={{ color: TEXT }}>Mis pedidos</span>
            </button>
          )}

          <button onClick={auth ? onSignOut : onLogin} className="hidden sm:flex items-center gap-1.5 px-2.5 h-10 rounded-full shrink-0" style={{ background: SURF2, border: `1px solid ${BORDER}` }} title={auth ? 'Cerrar sesión' : 'Iniciar sesión'}>
            <User className="w-5 h-5" style={{ color: auth ? GOLD : TEXT }} />
            <span className="hidden lg:block text-[12px] font-semibold max-w-[90px] truncate">{auth ? auth.customer.name.split(' ')[0] : 'Iniciar sesión'}</span>
          </button>

          {/* Carrito (visible siempre en móvil; en desktop el carrito va fijo a la derecha) */}
          <button onClick={onCart} className="lg:hidden relative flex items-center gap-2 pl-3 pr-3.5 h-10 rounded-full shrink-0" style={{ background: GOLD, color: '#1A1206' }} aria-label="Carrito">
            <ShoppingBag className="w-5 h-5" />
            {quantity > 0 && <span className="text-[13px] font-extrabold">{fmt(total)}</span>}
            {quantity > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-extrabold text-white" style={{ background: RED }}>{quantity}</span>}
          </button>
        </div>

        {/* Segunda fila (móvil): dirección + toggle + búsqueda */}
        <div className="md:hidden pb-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-2.5 h-9 rounded-xl min-w-0 flex-1" style={{ background: SURF2, border: `1px solid ${BORDER}` }}>
              <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
              <span className="text-[12px] font-semibold truncate">{cityLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 ml-auto" style={{ color: MUTED }} />
            </button>
            <DeliveryToggle orderMode={orderMode} setOrderMode={setOrderMode} />
          </div>
          <div className="flex items-center gap-2 px-3.5 h-10 rounded-full" style={{ background: SURF2, border: `1px solid ${BORDER}` }}>
            <Search className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('search')} className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#7A7A82]" />
            {query && <button onClick={() => setQuery('')} aria-label="Limpiar"><X className="w-4 h-4" style={{ color: MUTED }} /></button>}
          </div>
        </div>
      </div>
    </header>
  );
}

function DeliveryToggle({ orderMode, setOrderMode, className = '' }: { orderMode: OrderMode; setOrderMode: (m: OrderMode) => void; className?: string }) {
  const { t } = useLang();
  return (
    <div className={`flex p-1 rounded-full shrink-0 ${className}`} style={{ background: SURF2, border: `1px solid ${BORDER}` }}>
      {([['DELIVERY', t('delivery')], ['TAKEOUT', t('pickup')]] as [OrderMode, string][]).map(([m, label]) => (
        <button key={m} onClick={() => setOrderMode(m)} className="px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all"
          style={orderMode === m ? { background: GOLD, color: '#1A1206' } : { color: MUTED }}>{label}</button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  HERO
// ══════════════════════════════════════════════════════════════════════════════
function Hero({ info, onOrder, onCombos }: { info: Info; onOrder: () => void; onCombos: () => void }) {
  const heroImg = info.heroImageUrl?.trim();
  // Imagen de portada configurable (admin /tienda). Si existe, la mostramos a
  // todo lo ancho sin recortar (ya trae el texto/arte). Las CTAs van debajo.
  if (heroImg) {
    return (
      <section className="max-w-7xl mx-auto px-4 pt-5">
        <button onClick={onOrder} className="block w-full overflow-hidden rounded-[24px] active:scale-[0.997] transition" style={{ border: `1px solid ${BORDER}`, boxShadow: '0 30px 70px rgba(0,0,0,0.5)' }} aria-label="Ordenar ahora">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroSrc(heroImg)} alt={`${info.name.trim()} — Menú Mundialista`} loading="eager" decoding="async" className="w-full h-auto block" />
        </button>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={onOrder} className="px-7 py-3.5 rounded-xl font-extrabold text-[15px] active:scale-95 transition" style={{ background: GOLD, color: '#1A1206', boxShadow: `0 12px 30px ${GOLD}50` }}>Ordenar ahora</button>
          <button onClick={onCombos} className="px-7 py-3.5 rounded-xl font-extrabold text-[15px] active:scale-95 transition" style={{ background: '#FFFFFF0f', color: TEXT, border: `1.5px solid ${BORDER}` }}>Ver combos del partido</button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <HeroChip icon={<Truck className="w-3.5 h-3.5" />} title="Entrega rápida" sub={info.estimatedDelivery ? `~${info.estimatedDelivery} min` : 'A tu puerta'} />
          <HeroChip icon={<CreditCard className="w-3.5 h-3.5" />} title="Pago fácil y seguro" sub="Efectivo · tarjeta · transfer" />
          <HeroChip icon={<Trophy className="w-3.5 h-3.5" />} title="Promos del partido" sub="Ofertas cada día" />
        </div>
      </section>
    );
  }
  return (
    <section className="max-w-7xl mx-auto px-4 pt-5">
      <div className="relative overflow-hidden rounded-[24px] px-6 py-10 sm:px-12 sm:py-14"
        style={{ background: `radial-gradient(120% 150% at 0% 0%, ${GOLD}22, transparent 45%), radial-gradient(130% 150% at 100% 100%, ${GREEN}2e, transparent 52%), linear-gradient(135deg, #14140F, #060608)`, border: `1px solid ${BORDER}`, boxShadow: '0 34px 80px rgba(0,0,0,0.5)' }}>
        <Confetti />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: `linear-gradient(90deg, ${GREEN}, ${GOLD}, ${GREEN})` }} />
        {/* Balón + copa decorativos (desktop) */}
        <div aria-hidden className="hidden md:flex flex-col items-end gap-2 absolute right-6 top-1/2 -translate-y-1/2 select-none">
          <span className="text-[88px] leading-none drop-shadow-[0_16px_28px_rgba(0,0,0,0.55)]">🏆</span>
          <span className="text-[56px] leading-none -mt-3 mr-6 drop-shadow-[0_12px_22px_rgba(0,0,0,0.5)]">⚽</span>
        </div>

        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full mb-4" style={{ background: '#00000045', color: GOLD, border: `1px solid ${GOLD_BD}` }}>
            <Trophy className="w-3.5 h-3.5" /> Edición Mundial
          </span>
          <p className="leading-none" style={{ fontFamily: DISP, fontSize: 'clamp(26px,5vw,46px)', letterSpacing: '0.02em', color: TEXT2 }}>MENÚ</p>
          <h2 className="leading-[0.86]" style={{ fontFamily: DISP, fontSize: 'clamp(52px,11vw,108px)', letterSpacing: '0.01em', background: `linear-gradient(180deg, ${GOLD_LT}, ${GOLD} 55%, ${GOLD_DK})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>MUNDIALISTA</h2>
          {/* Listón "El sabor que nos une" */}
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-md" style={{ background: GOLD, color: '#1A1206' }}>
            <Star className="w-3.5 h-3.5" fill="#1A1206" />
            <span className="font-extrabold tracking-wide text-[13px] sm:text-[15px] uppercase">El sabor que nos une</span>
            <Star className="w-3.5 h-3.5" fill="#1A1206" />
          </div>
          <p className="mt-3 font-bold" style={{ fontFamily: DISP, fontSize: 'clamp(20px,3.4vw,30px)', letterSpacing: '0.03em' }}>
            HAZ TU PEDIDO <span style={{ color: GOLD }}>ONLINE</span>
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={onOrder} className="px-7 py-3.5 rounded-xl font-extrabold text-[15px] active:scale-95 transition" style={{ background: GOLD, color: '#1A1206', boxShadow: `0 12px 30px ${GOLD}50` }}>Ordenar ahora</button>
            <button onClick={onCombos} className="px-7 py-3.5 rounded-xl font-extrabold text-[15px] active:scale-95 transition" style={{ background: '#FFFFFF0f', color: TEXT, border: `1.5px solid ${BORDER}` }}>Ver combos del partido</button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <HeroChip icon={<Truck className="w-3.5 h-3.5" />} title="Entrega rápida" sub={info.estimatedDelivery ? `~${info.estimatedDelivery} min` : 'A tu puerta'} />
            <HeroChip icon={<CreditCard className="w-3.5 h-3.5" />} title="Pago fácil y seguro" sub="Efectivo · tarjeta · transfer" />
            <HeroChip icon={<Trophy className="w-3.5 h-3.5" />} title="Promos del partido" sub="Ofertas cada día" />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroChip({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: '#00000040', border: `1px solid ${BORDER}` }}>
      <span style={{ color: GOLD }}>{icon}</span>
      <span className="leading-tight"><span className="block text-[12px] font-bold">{title}</span><span className="block text-[10px]" style={{ color: MUTED }}>{sub}</span></span>
    </span>
  );
}

function Confetti() {
  const dots = [
    { l: '8%', t: '16%', c: GOLD, s: 7 }, { l: '20%', t: '72%', c: GREEN_LT, s: 5 }, { l: '33%', t: '10%', c: '#FFF', s: 4 },
    { l: '45%', t: '80%', c: GOLD, s: 6 }, { l: '58%', t: '20%', c: GREEN_LT, s: 5 }, { l: '70%', t: '66%', c: GOLD, s: 7 },
    { l: '82%', t: '28%', c: '#FFF', s: 4 }, { l: '90%', t: '76%', c: GOLD, s: 6 }, { l: '14%', t: '44%', c: GOLD, s: 4 },
    { l: '52%', t: '50%', c: GREEN_LT, s: 4 }, { l: '64%', t: '40%', c: GOLD_LT, s: 5 }, { l: '38%', t: '58%', c: '#FFF', s: 3 },
  ];
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((d, i) => <span key={i} className="absolute rounded-[2px]" style={{ left: d.l, top: d.t, width: d.s, height: d.s, background: d.c, opacity: 0.65, transform: `rotate(${i * 33}deg)` }} />)}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  CARRUSEL DE CATEGORÍAS
// ══════════════════════════════════════════════════════════════════════════════
function CategoryNav({ categories, activeCat, onPick }: { categories: any[]; activeCat: string; onPick: (id: string) => void }) {
  if (categories.length <= 1) return null;
  return (
    <nav className="sticky top-[158px] md:top-[60px] z-30 backdrop-blur-xl mt-6" style={{ background: `${BG}e6`, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
      <div className="max-w-7xl mx-auto px-4 py-3 flex gap-2.5 overflow-x-auto no-scrollbar">
        {categories.map((c: any) => {
          const on = activeCat === c.id;
          return (
            <button key={c.id} onClick={() => onPick(c.id)} className="shrink-0 flex items-center gap-2 pl-1.5 pr-3.5 h-11 rounded-full transition-all"
              style={on ? { background: `${GOLD}1a`, border: `1.5px solid ${GOLD}` } : { background: SURF2, border: `1px solid ${BORDER}` }}>
              <span className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center" style={{ background: BG }}>
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cldImage(c.imageUrl, { width: 64 })} alt={c.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : <span className="text-[15px]">{categoryIcon(c.name)}</span>}
              </span>
              <span className="text-[13px] font-bold whitespace-nowrap" style={{ color: on ? GOLD : TEXT }}>{c.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION HEAD
// ══════════════════════════════════════════════════════════════════════════════
function SectionHead({ title, icon, star, inline }: { title: string; icon?: string; star?: boolean; inline?: boolean }) {
  return (
    <h3 className={`flex items-center gap-2.5 ${inline ? '' : 'mb-5'}`}>
      {icon && <span className="text-2xl">{icon}</span>}
      <span style={{ fontFamily: DISP, fontSize: 'clamp(22px,3.4vw,30px)', letterSpacing: '0.02em' }}>{title}</span>
      {star && <Star className="w-4 h-4" style={{ color: GOLD }} fill={GOLD} />}
    </h3>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  TARJETA DE PRODUCTO
// ══════════════════════════════════════════════════════════════════════════════
function Badge({ kind }: { kind: 'pop' | 'promo' | 'new' }) {
  const map = {
    pop: { t: 'MÁS VENDIDO', bg: GOLD, fg: '#1A1206' },
    promo: { t: 'PROMO DEL PARTIDO', bg: GREEN, fg: '#FFFFFF' },
    new: { t: 'NUEVO', bg: BLUE, fg: '#FFFFFF' },
  }[kind];
  return <span className="text-[8.5px] font-extrabold px-2 py-1 rounded-[6px] tracking-wide" style={{ background: map.bg, color: map.fg }}>{map.t}</span>;
}

function ProductCard({ p, onOpen, slug }: { p: any; onOpen: () => void; slug: string }) {
  const fmt = useMoney();
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const line = lines.find(l => l.id === p.id);
  const price = priceOf(p);
  const pf = priceFrom(p);

  return (
    <article className="group relative rounded-[16px] p-2.5 flex flex-col transition-all" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
      <button onClick={onOpen} className="relative w-full aspect-square rounded-[12px] overflow-hidden mb-2.5 block" style={{ background: '#FFFFFF06' }}>
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 items-start">
          {p.isPopular && <Badge kind="pop" />}
          {p.isPromo && <Badge kind="promo" />}
          {p.isNew && <Badge kind="new" />}
        </div>
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cldImage(p.imageUrl, { width: 480 })} alt={p.name} loading="lazy" decoding="async" className={`w-full h-full transition-transform duration-500 group-hover:scale-105 ${p.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
        ) : <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">{productEmoji(p.name)}</div>}
      </button>

      <div className="absolute top-2 right-2 z-20" style={{ color: '#FFFFFFcc' }}>
        <ReactionButton slug={slug} itemId={p.id} initialCount={p.reactionCount || 0} accent={GOLD} />
      </div>

      <button onClick={onOpen} className="text-left">
        <h4 className="font-bold text-[14px] leading-tight line-clamp-1" style={{ fontFamily: BODY }}>{p.name}</h4>
        {p.description && <p className="text-[11px] mt-0.5 line-clamp-1 leading-snug" style={{ color: FAINT }}>{p.description}</p>}
      </button>

      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div className="flex flex-col leading-none min-w-0">
          {pf.from
            ? <span className="text-[9px] font-bold uppercase tracking-wide leading-none mb-0.5" style={{ color: MUTED }}>Desde</span>
            : (p.isPromo && <span className="text-[10px] line-through" style={{ color: '#FFFFFF40' }}>{fmt(p.price)}</span>)}
          <span className="font-extrabold text-[17px]" style={{ color: GOLD }}>{fmt(pf.value)}</span>
        </div>
        {line && !needsModal(p) ? (
          <div className="flex items-center gap-1 rounded-full px-1 py-1 shrink-0" style={{ background: SURF2 }}>
            <button onClick={() => remove(p.id)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: '#FFFFFFcc' }} aria-label="Quitar">
              {line.quantity > 1 ? <Minus className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
            <span className="text-sm font-extrabold w-4 text-center">{line.quantity}</span>
            <button onClick={() => add({ id: p.id, menuItemId: p.id, name: p.name, price })} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: GOLD, color: '#1A1206' }} aria-label="Agregar"><Plus className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button onClick={onOpen} className="flex items-center gap-1.5 pl-3 pr-2.5 py-2 rounded-full font-bold text-[13px] shrink-0 active:scale-95 transition group-hover:shadow-[0_8px_20px_rgba(255,193,7,0.35)]" style={{ background: GOLD, color: '#1A1206' }}>
            Agregar <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    </article>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  COMBOS DEL PARTIDO (sección verde con textura de cancha)
// ══════════════════════════════════════════════════════════════════════════════
function CombosSection({ id, dataCat, category, onOpen }: { id: string; dataCat: string; category: any; onOpen: (p: any) => void }) {
  const items: any[] = category.items || [];
  return (
    <section id={id} data-cat={dataCat} className="mb-12 scroll-mt-[228px] md:scroll-mt-[160px]">
      <div className="relative overflow-hidden rounded-[20px] p-5 sm:p-6" style={{ background: `linear-gradient(135deg, ${GREEN}26, #0B1A0E 55%), repeating-linear-gradient(90deg, #ffffff05 0 2px, transparent 2px 60px)`, border: `1px solid ${GREEN}44` }}>
        <div className="flex flex-wrap items-end justify-between gap-2 mb-5">
          <div>
            <h3 className="flex items-center gap-2" style={{ fontFamily: DISP, fontSize: 'clamp(22px,3.4vw,30px)', letterSpacing: '0.02em' }}>
              <Trophy className="w-6 h-6" style={{ color: GOLD }} /> {category.name}
            </h3>
            <p className="text-[12px] font-semibold mt-0.5" style={{ color: GREEN_LT }}>Armados para que ganes siempre</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((p: any) => <ComboCard key={p.id} p={p} onOpen={() => onOpen(p)} />)}
        </div>
      </div>
    </section>
  );
}

function ComboCard({ p, onOpen }: { p: any; onOpen: () => void }) {
  const fmt = useMoney();
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const line = lines.find(l => l.id === p.id);
  const price = priceOf(p);
  return (
    <article className="flex items-center gap-3 p-2.5 rounded-[14px]" style={{ background: '#0A0E0BCC', border: `1px solid ${BORDER}` }}>
      <button onClick={onOpen} className="w-[72px] h-[72px] rounded-[12px] overflow-hidden shrink-0 relative" style={{ background: '#FFFFFF08' }}>
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cldImage(p.imageUrl, { width: 200 })} alt={p.name} loading="lazy" decoding="async" className={`w-full h-full ${p.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
        ) : <div className="w-full h-full flex items-center justify-center text-2xl opacity-40">⚽</div>}
      </button>
      <div className="flex-1 min-w-0">
        <button onClick={onOpen} className="text-left block w-full">
          <h4 className="font-extrabold text-[13px] uppercase leading-tight line-clamp-1" style={{ fontFamily: BODY }}>{p.name}</h4>
          {p.description && <p className="text-[11px] line-clamp-1" style={{ color: FAINT }}>{p.description}</p>}
        </button>
        <div className="flex items-center justify-between mt-1.5">
          <span className="font-extrabold text-[16px]" style={{ color: GOLD }}>{fmt(price)}</span>
          {line ? (
            <div className="flex items-center gap-1 rounded-full px-1 py-0.5" style={{ background: SURF2 }}>
              <button onClick={() => remove(p.id)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: '#FFFFFFcc' }}>{line.quantity > 1 ? <Minus className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}</button>
              <span className="text-[13px] font-extrabold w-3.5 text-center">{line.quantity}</span>
              <button onClick={() => add({ id: p.id, menuItemId: p.id, name: p.name, price })} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: GOLD, color: '#1A1206' }}><Plus className="w-3 h-3" /></button>
            </div>
          ) : (
            <button onClick={onOpen} className="flex items-center gap-1 pl-2.5 pr-2 py-1.5 rounded-full font-bold text-[12px]" style={{ background: GOLD, color: '#1A1206' }}>Agregar <Plus className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </div>
    </article>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  TRUST BADGES
// ══════════════════════════════════════════════════════════════════════════════
function TrustBadges({ estimated }: { estimated?: number }) {
  const items = [
    { icon: <Leaf className="w-5 h-5" />, t: 'Ingredientes premium', s: 'Siempre frescos y de calidad' },
    { icon: <Truck className="w-5 h-5" />, t: 'Cobertura amplia', s: 'Envíos a toda la ciudad' },
    { icon: <Clock className="w-5 h-5" />, t: 'Seguimiento en tiempo real', s: estimated ? `Entrega ~${estimated} min` : 'Sigue tu pedido en vivo' },
    { icon: <Headphones className="w-5 h-5" />, t: 'Atención personalizada', s: 'Estamos para servirte' },
  ];
  return (
    <section className="mb-12 grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3 p-3.5 rounded-[14px]" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
          <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${GOLD}1a`, color: GOLD }}>{it.icon}</span>
          <span className="leading-tight min-w-0"><span className="block text-[12.5px] font-bold">{it.t}</span><span className="block text-[11px]" style={{ color: MUTED }}>{it.s}</span></span>
        </div>
      ))}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  CARRITO — contenido compartido + variantes desktop/móvil
// ══════════════════════════════════════════════════════════════════════════════
function CartLines({ allItems, accent }: { allItems: any[]; accent: string }) {
  const fmt = useMoney();
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  return (
    <div className="space-y-2.5">
      {lines.map(l => {
        const src = allItems.find((p: any) => p.id === l.menuItemId);
        return (
          <div key={l.id} className="flex items-center gap-2.5 p-2 rounded-[12px]" style={{ background: SURF2, border: `1px solid ${BORDER}` }}>
            <div className="w-12 h-12 rounded-[10px] overflow-hidden shrink-0" style={{ background: '#FFFFFF08' }}>
              {src?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cldImage(src.imageUrl, { width: 120 })} alt={l.name} loading="lazy" decoding="async" className={`w-full h-full ${src.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
              ) : <div className="w-full h-full flex items-center justify-center text-base opacity-30">{productEmoji(l.name)}</div>}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-[12.5px] leading-tight line-clamp-2">{l.name}</h4>
              <p className="text-[13px] font-extrabold mt-0.5" style={{ color: accent }}>{fmt(l.price)}</p>
            </div>
            <div className="flex items-center gap-0.5 rounded-full px-1 py-1 shrink-0" style={{ background: BG }}>
              <button onClick={() => remove(l.id)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: '#FFFFFFcc' }} aria-label="Quitar">{l.quantity > 1 ? <Minus className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}</button>
              <span className="text-[13px] font-extrabold w-4 text-center">{l.quantity}</span>
              <button onClick={() => add({ id: l.id, menuItemId: l.menuItemId, name: l.name, price: l.price, variantId: l.variantId, modifierIds: l.modifierIds })} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: accent, color: '#1A1206' }} aria-label="Agregar"><Plus className="w-3 h-3" /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DesktopCart({ accent, minOrder, allItems, onCheckout, onBrowse, onWhatsApp, waNumber, suggestions, onAddSuggestion }: any) {
  const fmt = useMoney();
  const { t } = useLang();
  const lines = useCart(s => s.lines);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());
  const belowMin = minOrder > 0 && total < minOrder;
  const suggestion = (suggestions || []).find((p: any) => !lines.some((l: any) => l.menuItemId === p.id));

  return (
    <div className="rounded-[18px] overflow-hidden" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <h3 className="flex items-center gap-2 font-extrabold" style={{ fontFamily: BODY }}><ShoppingBag className="w-5 h-5" style={{ color: accent }} /> Tu pedido</h3>
        {quantity > 0 && <span className="min-w-[22px] h-[22px] px-1.5 flex items-center justify-center rounded-full text-[11px] font-extrabold" style={{ background: accent, color: '#1A1206' }}>{quantity}</span>}
      </div>

      {lines.length === 0 ? (
        <div className="px-4 py-12 text-center" style={{ color: MUTED }}>
          <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-25" />
          <p className="font-bold text-sm mb-1">Tu carrito está vacío</p>
          <p className="text-[11px] mb-5">¡Agrega algo delicioso! ⚽</p>
          <button onClick={onBrowse} className="px-5 py-2.5 rounded-full font-bold text-[13px]" style={{ background: accent, color: '#1A1206' }}>Ver menú</button>
        </div>
      ) : (
        <div className="p-3.5">
          <div className="max-h-[40vh] overflow-y-auto no-scrollbar pr-0.5"><CartLines allItems={allItems} accent={accent} /></div>

          {suggestion && (
            <div className="mt-3 p-2.5 rounded-[12px] flex items-center gap-2.5" style={{ background: SURF2, border: `1px dashed ${BORDER}` }}>
              <div className="w-10 h-10 rounded-[8px] overflow-hidden shrink-0" style={{ background: '#FFFFFF08' }}>
                {suggestion.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cldImage(suggestion.imageUrl, { width: 100 })} alt={suggestion.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : <div className="w-full h-full flex items-center justify-center text-lg opacity-40">{productEmoji(suggestion.name)}</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>¿Algo más?</p>
                <p className="text-[12px] font-bold truncate">{suggestion.name} · {fmt(priceOf(suggestion))}</p>
              </div>
              <button onClick={() => onAddSuggestion(suggestion)} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: accent, color: '#1A1206' }}><Plus className="w-4 h-4" /></button>
            </div>
          )}

          <div className="mt-3.5 pt-3 space-y-1.5" style={{ borderTop: `1px solid ${BORDER}` }}>
            <Row label={t('subtotal')} value={fmt(total)} />
            <Row label="Costo de envío" value="Se calcula al pagar" muted />
            <div className="flex items-center justify-between pt-1.5">
              <span className="font-bold">{t('total')}</span>
              <span className="text-2xl font-extrabold" style={{ color: accent }}>{fmt(total)}</span>
            </div>
          </div>
          {belowMin && <p className="text-[11px] font-bold text-center mt-2" style={{ color: accent }}>Pedido mínimo: {fmt(minOrder)}.</p>}
          <button onClick={onCheckout} disabled={belowMin} className="w-full mt-3 py-3.5 rounded-[12px] font-extrabold flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50" style={{ background: accent, color: '#1A1206' }}>{t('checkout')} <ChevronRight className="w-5 h-5" /></button>
          {waNumber && <button onClick={onWhatsApp} className="w-full mt-2 py-2.5 rounded-[12px] font-bold text-white text-[13px] flex items-center justify-center gap-2 active:scale-95 transition" style={{ background: '#25D366' }}><MessageCircle className="w-4 h-4" /> {t('send_whatsapp')}</button>}
        </div>
      )}
    </div>
  );
}

function MobileCart({ onClose, onCheckout, onWhatsApp, waNumber, allItems, minOrder, accent }: any) {
  const fmt = useMoney();
  const { t } = useLang();
  const lines = useCart(s => s.lines);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());
  const belowMin = minOrder > 0 && total < minOrder;
  return (
    <div className="fixed inset-0 z-[100] flex sm:justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()} className="relative w-full sm:max-w-md sm:ml-auto mt-auto sm:mt-0 h-[92vh] sm:h-full flex flex-col rounded-t-[24px] sm:rounded-none" style={{ background: BG, borderLeft: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div><h2 style={{ fontFamily: DISP, fontSize: 26, letterSpacing: '0.02em' }}>Tu pedido</h2><p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>{quantity} {quantity === 1 ? 'producto' : 'productos'}</p></div>
          <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: SURF2 }} aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center" style={{ color: MUTED }}>
              <ShoppingBag className="w-14 h-14 mb-4 opacity-25" />
              <p className="font-bold mb-1">Tu carrito está vacío</p>
              <p className="text-xs mb-6">Arma tu pedido del Mundial ⚽</p>
              <button onClick={onClose} className="px-6 py-3 rounded-full font-bold" style={{ background: accent, color: '#1A1206' }}>Ver el menú</button>
            </div>
          ) : <CartLines allItems={allItems} accent={accent} />}
        </div>
        {lines.length > 0 && (
          <div className="px-5 pt-4 pb-5 shrink-0 space-y-3" style={{ borderTop: `1px solid ${BORDER}`, background: '#06060C' }}>
            <div className="flex items-center justify-between">
              <div><p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>{t('subtotal')}</p><p className="text-[10px]" style={{ color: FAINT }}>Envío y descuentos se calculan al pagar</p></div>
              <span className="text-2xl font-extrabold" style={{ color: accent }}>{fmt(total)}</span>
            </div>
            {belowMin && <p className="text-xs font-bold text-center" style={{ color: accent }}>Pedido mínimo: {fmt(minOrder)}.</p>}
            <button onClick={onCheckout} disabled={belowMin} className="w-full py-4 rounded-[14px] font-extrabold active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: accent, color: '#1A1206' }}>{t('checkout')} <ChevronRight className="w-5 h-5" /></button>
            {waNumber && <button onClick={onWhatsApp} className="w-full py-3.5 rounded-[14px] font-extrabold text-white active:scale-95 transition flex items-center justify-center gap-2" style={{ background: '#25D366' }}><MessageCircle className="w-5 h-5" /> {t('send_whatsapp')}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return <div className="flex items-center justify-between text-[13px]" style={{ color: MUTED }}><span>{label}</span><span className="font-bold" style={{ color: muted ? MUTED : TEXT }}>{value}</span></div>;
}

// ══════════════════════════════════════════════════════════════════════════════
//  NEWSLETTER (suscripción vía WhatsApp — honesto, sin endpoint falso)
// ══════════════════════════════════════════════════════════════════════════════
function Newsletter({ onSubscribe }: { onSubscribe: () => void }) {
  const [email, setEmail] = useState('');
  return (
    <section className="max-w-7xl mx-auto px-4 mt-4 mb-12">
      <div className="rounded-[20px] p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-5 justify-between" style={{ background: `linear-gradient(135deg, ${GOLD}1a, ${GREEN}14), ${SURF}`, border: `1px solid ${GOLD_BD}` }}>
        <div className="text-center sm:text-left">
          <h3 style={{ fontFamily: DISP, fontSize: 'clamp(22px,3.4vw,28px)', letterSpacing: '0.02em' }}>Suscríbete y recibe promos exclusivas</h3>
          <p className="text-[13px] mt-1" style={{ color: MUTED }}>Las mejores ofertas del partido, directo a tu WhatsApp.</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSubscribe(); }} className="flex gap-2 w-full sm:w-auto">
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Tu correo electrónico" inputMode="email" className="flex-1 sm:w-56 px-4 h-11 rounded-full outline-none text-sm" style={{ background: BG, border: `1px solid ${BORDER}`, color: TEXT }} />
          <button type="submit" className="px-5 h-11 rounded-full font-bold text-sm shrink-0 active:scale-95 transition" style={{ background: GOLD, color: '#1A1206' }}>Suscribirme</button>
        </form>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  FOOTER
// ══════════════════════════════════════════════════════════════════════════════
function Footer({ info, primaryLocation, waNumber, minOrder, onWhatsApp, onNav, onCombos }: any) {
  const fmt = useMoney();
  const Nav = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <li><button onClick={onClick} className="hover:text-white transition" style={{ color: MUTED }}>{label}</button></li>
  );
  return (
    <footer className="relative" style={{ borderTop: `1px solid ${BORDER}`, background: '#05050B' }}>
      <div className="max-w-7xl mx-auto px-4 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            {info.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cldImage(info.logo, { width: 120 })} alt={info.name} loading="lazy" decoding="async" className="w-11 h-11 rounded-full object-cover" style={{ border: `1.5px solid ${GOLD}` }} />
            ) : <div className="w-11 h-11 rounded-full flex items-center justify-center font-extrabold" style={{ background: `${GOLD}22`, color: GOLD }}>{info.name.trim().charAt(0)}</div>}
            <span style={{ fontFamily: DISP, fontSize: 24, letterSpacing: '0.02em' }}>{info.name.trim()}</span>
          </div>
          <p className="text-[13px] leading-relaxed" style={{ color: MUTED }}>El sabor que nos une. Hamburguesas, alitas, tacos y más, con el mejor sabor y actitud mundialista. ⚽🏆</p>
          <div className="flex items-center gap-2 mt-4">
            {waNumber && <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: SURF2 }} aria-label="WhatsApp"><MessageCircle className="w-4 h-4" style={{ color: '#25D366' }} /></a>}
            <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: SURF2, color: MUTED }} aria-hidden><Instagram className="w-4 h-4" /></span>
            <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: SURF2, color: MUTED }} aria-hidden><Facebook className="w-4 h-4" /></span>
            <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: SURF2, color: MUTED }} aria-hidden><Music2 className="w-4 h-4" /></span>
            <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: SURF2, color: MUTED }} aria-hidden><Youtube className="w-4 h-4" /></span>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest mb-3" style={{ color: GOLD }}>Navegación</p>
          <ul className="space-y-2.5 text-[13px]">
            <Nav label="Menú" onClick={() => onNav('mb-menu')} />
            <Nav label="Combos del partido" onClick={onCombos} />
            <Nav label="Inicio" onClick={() => onNav('mb-menu')} />
          </ul>
        </div>

        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest mb-3" style={{ color: GOLD }}>Contáctanos</p>
          <ul className="space-y-2.5 text-[13px]" style={{ color: MUTED }}>
            {waNumber && <li><button onClick={onWhatsApp} className="flex items-center gap-2 hover:text-white transition"><MessageCircle className="w-4 h-4" style={{ color: '#25D366' }} /> Pedir por WhatsApp</button></li>}
            {primaryLocation?.phone && <li><a href={`tel:${primaryLocation.phone.replace(/\s+/g, '')}`} className="flex items-center gap-2 hover:text-white transition"><Phone className="w-4 h-4" style={{ color: GOLD }} /> {primaryLocation.phone}</a></li>}
            {primaryLocation?.address && <li className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0" style={{ color: GOLD }} /> <span>{primaryLocation.address}</span></li>}
          </ul>
        </div>

        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest mb-3" style={{ color: GOLD }}>Aceptamos</p>
          <div className="flex flex-wrap gap-2">
            <PayChip icon={<Banknote className="w-4 h-4" />} label="Efectivo" />
            <PayChip icon={<CreditCard className="w-4 h-4" />} label="Tarjeta" />
            <PayChip icon={<Building2 className="w-4 h-4" />} label="Transferencia" />
          </div>
          <p className="text-[11px] mt-4" style={{ color: FAINT }}>Pedido mínimo {minOrder > 0 ? fmt(minOrder) : 'sin mínimo'}.</p>
        </div>
      </div>
      <div className="text-center text-[11px] py-4" style={{ color: FAINT, borderTop: `1px solid ${BORDER}` }}>© {info.name.trim()} · Menú Mundialista · Powered by MRTPV</div>
    </footer>
  );
}

function PayChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl" style={{ background: SURF2, border: `1px solid ${BORDER}`, color: TEXT }}><span style={{ color: GOLD }}>{icon}</span>{label}</span>;
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOGIN / REGISTRO (cuenta real de cliente; prellena el checkout)
// ══════════════════════════════════════════════════════════════════════════════
function LoginModal({ slug, info, profileKey, onClose, onAuthed }: { slug: string; info: Info; profileKey: string; onClose: () => void; onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!email.trim() || !password) { setError('Correo y contraseña son requeridos.'); return; }
    if (mode === 'register' && !name.trim()) { setError('Tu nombre es requerido.'); return; }
    if (mode === 'register' && password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    setBusy(true);
    try {
      const customer = mode === 'register'
        ? await registerCustomer(slug, { name: name.trim(), email: email.trim(), password, phone: phone.trim() || undefined })
        : await loginCustomer(slug, email.trim(), password);
      try {
        const raw = localStorage.getItem(profileKey); const prev = raw ? JSON.parse(raw) : {};
        localStorage.setItem(profileKey, JSON.stringify({ ...prev, name: customer.name, phone: customer.phone || prev.phone || '' }));
      } catch {}
      onAuthed();
    } catch (e: any) { setError(e?.message || 'No se pudo continuar.'); } finally { setBusy(false); }
  };

  const field = 'flex items-center gap-2 px-4 h-12 rounded-xl';
  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()} className="relative w-full sm:max-w-sm rounded-t-[24px] sm:rounded-[20px] p-6" style={{ background: BG, border: `1px solid ${BORDER}` }}>
        <div className="flex flex-col items-center mb-5">
          {info.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cldImage(info.logo, { width: 120 })} alt={info.name} loading="lazy" decoding="async" className="w-14 h-14 rounded-2xl object-cover mb-3" style={{ border: `1.5px solid ${GOLD}` }} />
          ) : <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: `${GOLD}1f` }}><User className="w-7 h-7" style={{ color: GOLD }} /></div>}
          <h2 style={{ fontFamily: DISP, fontSize: 26, letterSpacing: '0.02em' }}>{mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
          <p className="text-[12px] mt-1 text-center" style={{ color: MUTED }}>Guarda tus datos y pide más rápido en {info.name.trim()}</p>
        </div>

        <div className="flex p-1 rounded-full mb-4" style={{ background: SURF2 }}>
          {(['login', 'register'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }} className="flex-1 py-2 rounded-full text-sm font-bold transition-all" style={mode === m ? { background: GOLD, color: '#1A1206' } : { color: MUTED }}>{m === 'login' ? 'Entrar' : 'Registrarme'}</button>
          ))}
        </div>

        {mode === 'register' && (info.welcomeBonusPoints || 0) > 0 && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-3" style={{ background: `${GOLD}14`, border: `1px solid ${GOLD}55` }}>
            <Gift className="w-4 h-4 shrink-0" style={{ color: GOLD }} />
            <p className="text-[12px] font-bold leading-snug" style={{ color: GOLD }}>Crea tu cuenta y te regalamos {info.welcomeBonusPoints} puntos de bienvenida.</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-2.5">
          {mode === 'register' && (
            <div className={field} style={{ background: SURF2 }}><User className="w-4 h-4 shrink-0" style={{ color: MUTED }} /><input className="flex-1 bg-transparent outline-none text-sm" value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" /></div>
          )}
          <div className={field} style={{ background: SURF2 }}><Mail className="w-4 h-4 shrink-0" style={{ color: MUTED }} /><input className="flex-1 bg-transparent outline-none text-sm" value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo" inputMode="email" autoCapitalize="none" /></div>
          {mode === 'register' && (
            <div className={field} style={{ background: SURF2 }}><Navigation className="w-4 h-4 shrink-0" style={{ color: MUTED }} /><input className="flex-1 bg-transparent outline-none text-sm" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono (opcional)" inputMode="tel" /></div>
          )}
          <div className={field} style={{ background: SURF2 }}><Lock className="w-4 h-4 shrink-0" style={{ color: MUTED }} /><input type="password" className="flex-1 bg-transparent outline-none text-sm" value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña" /></div>
          {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
          <button type="submit" disabled={busy} className="w-full mt-1 py-3.5 rounded-xl font-extrabold active:scale-95 transition disabled:opacity-60" style={{ background: GOLD, color: '#1A1206' }}>{busy ? 'Procesando…' : mode === 'register' ? 'Crear mi cuenta' : 'Entrar'}</button>
        </form>
        <button onClick={onClose} className="w-full mt-2 py-2.5 text-[12px] font-bold" style={{ color: MUTED }}>Continuar como invitado</button>
      </div>
    </div>
  );
}
