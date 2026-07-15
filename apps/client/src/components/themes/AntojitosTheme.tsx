'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Search, ShoppingBag, Plus, Minus, Trash2, X, MessageCircle, MapPin, Phone,
  ChevronRight, Flame, Star, Leaf, Truck, User, Clock, HandPlatter,
  Instagram, Facebook, Music2, Banknote, CreditCard, Building2, Mail, Lock, Navigation,
} from 'lucide-react';
import { useCart } from '../../lib/cartStore';
import { cldImage } from '@/lib/cloudinary';
import { productEmoji } from '../../lib/productEmoji';
import BannerCarousel, { collectBanners } from '../BannerCarousel';
import ProductModal, { needsModal } from '../ProductModal';
import StoreCheckout from '../StoreCheckout';
import { ReactionButton } from '../ReactionButton';
import { StoreLocaleProvider, useMoney, useLang } from '../StoreLocaleContext';
import { LanguageSwitcher } from '../LanguageSwitcher';
import type { DeliveryConfig } from '../../lib/delivery';
import {
  getAuth, clearAuth, loginCustomer, registerCustomer, type AuthState,
} from '../../lib/customerAuth';

// ══════════════════════════════════════════════════════════════════════════════
//  TEMA "ANTOJITOS" — fonda mexicana artesanal · crema masa · terracota · maíz
//  Estética cálida de comida hecha a mano (gorditas, tacos, quesadillas): papel
//  crema, tarjetas blancas con foto grande, precios "Desde", botón terracota y
//  personalizador de platillo. Data-driven y genérica: usa el logo, las fotos y
//  el menú reales de cada tienda. Reusa ProductModal (light) + StoreCheckout
//  probados — solo cambia la capa visual. Sin marcas externas.
//  Tipografías: Fraunces (titulares serif con carácter) + DM Sans (cuerpo).
// ══════════════════════════════════════════════════════════════════════════════

// ── Paleta ─────────────────────────────────────────────────────────────────────
const INK = '#3A2216';        // texto principal (café oscuro tostado)
const INK2 = '#7C5A46';       // texto secundario
const FAINT = '#A98A74';      // texto tenue
const CREAM = '#FFFBF3';      // tarjetas (crema marfil, casi blanco)
const CARD_BD = '#ECDCC2';    // bordes cálidos (tono masa)
const MASA = '#E4A02C';       // dorado maíz (estrellas · badge "combo" · destellos)
const MASA_SOFT = '#FBEECB';  // dorado maíz muy claro (chips/superficies)
const RED = '#C23A28';        // terracota / chile (precio + CTA)
const RED_DK = '#A32A1B';
const GREEN = '#2F8F46';      // verde "abierto" (cilantro)
const WA = '#25D366';

const DISP = 'var(--font-fraunces), Georgia, "Times New Roman", serif';
const BODY = 'var(--font-dm-sans), system-ui, sans-serif';

// fmt viene de useMoney() (moneda/locale del tenant), no de un const global.
const priceOf = (p: any) => (p.isPromo && p.promoPrice ? p.promoPrice : p.price);
// Precio "Desde" para productos con variantes: menor precio de variante > 0; si no
// hay variantes con precio, cae al precio base (evita mostrar "Desde $0").
const priceFrom = (p: any): { value: number; from: boolean } => {
  const vs = (p.variants || []).map((v: any) => Number(v.price)).filter((n: number) => n > 0);
  return vs.length ? { value: Math.min(...vs), from: true } : { value: priceOf(p), from: false };
};

// La portada (hero) se sube a 1600px (mode=hero); servimos f_auto/q_auto sin
// recortar. URLs ajenas a Cloudinary se devuelven intactas.
function heroSrc(url?: string | null): string | undefined {
  if (!url) return undefined;
  const M = '/image/upload/';
  if (url.includes(M) && !url.includes('/f_auto')) return url.replace(M, `${M}f_auto,q_auto,c_limit,w_1600/`);
  return url;
}

// Emoji por categoría (data-driven sobre el nombre real). Sesgo antojitos
// mexicanos, con fallback universal para cualquier giro.
const CAT_ICONS: [RegExp, string][] = [
  [/combo|paquete|promo|kit|especial/i, '🌽'],
  [/gordita|sope|huarache|memela|tlacoyo/i, '🫓'],
  [/taco|suadero|pastor|barbacoa|carnita/i, '🌮'],
  [/quesadill|gringa|sincronizada|volcan|fundid/i, '🧀'],
  [/burrito|tortas?|lonche/i, '🌯'],
  [/tamal|elote|esquite/i, '🌽'],
  [/pozole|menudo|caldo|sopa|consom[eé]/i, '🍲'],
  [/enchilada|chilaquil|entomatad/i, '🌶️'],
  [/pollo|alit|boneless|wing/i, '🍗'],
  [/postre|pastel|flan|churro|dulce|nieve|helad/i, '🍮'],
  [/agua|fresca|horchata|jamaica|tamarind|licuad|jugo/i, '🥤'],
  [/refresc|soda|cola|bebida|cerve|michela/i, '🧃'],
  [/caf[eé]|atole|champurrad|chocolate/i, '☕'],
  [/salsa|guacamole|extra|adicional|complement/i, '🥑'],
  [/env[ií]o/i, '🛵'],
];
function categoryIcon(name?: string | null): string {
  if (!name) return '🍽️';
  for (const [re, ic] of CAT_ICONS) if (re.test(name)) return ic;
  return '🍽️';
}
const isShippingCat = (name?: string | null) => !!name && /env[ií]o/i.test(name);

type Info = {
  id: string; name: string; slug: string; logo: string | null; hasWebStore: boolean;
  whatsappNumber: string | null; minOrderAmount?: number; estimatedDelivery?: number;
  whatsappOrder?: { enabled: boolean; number: string | null };
  dineIn?: { table: string; locationId: string | null } | null;
  isOpen?: boolean;
  onlinePayment?: boolean; delivery?: DeliveryConfig; heroImageUrl?: string | null;
  currency?: string | null; currencyLocale?: string | null;
  themeConfig: { theme?: string; primaryColor?: string } | null;
};

type AntojitosThemeProps = {
  data: { info: Info; menu: { categories: any[] }; locations: any[] };
};

type OrderMode = 'DELIVERY' | 'TAKEOUT';

export function AntojitosTheme({ data }: AntojitosThemeProps) {
  const { info, menu, locations } = data;
  const fmt = useMoney();

  // Acento de la tienda. Si el tenant no personalizó (sigue en el naranja
  // default), usamos la terracota de la fonda; si sí, respetamos su marca.
  const raw = info.themeConfig?.primaryColor || '';
  const ACCENT = raw && raw.toLowerCase() !== '#ff5c35' ? raw : RED;

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
  const [auth, setAuthState] = useState<AuthState | null>(null);

  useEffect(() => { setAuthState(getAuth(slug)); }, [slug]);

  const banners = collectBanners(locations);
  const waNumber = (info.whatsappNumber || '').replace(/\D/g, '');
  const minOrder = info.minOrderAmount || 0;
  const primaryLocation = locations[0] || null;

  const allItems = useMemo(() => categories.flatMap((c: any) => c.items || []), [categories]);
  const favorites = useMemo(
    () => allItems.filter((i: any) => i.isPopular || i.isPromo).slice(0, 6),
    [allItems],
  );

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
  const scrollToCat = (id: string) => { setActiveCat(id); scrollTo(`an-cat-${id}`); };

  // Scroll-spy de las pastillas de categoría.
  useEffect(() => {
    if (categories.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      entries => {
        const vis = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis) setActiveCat(vis.target.getAttribute('data-cat') || '');
      },
      { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.2, 0.5] },
    );
    categories.forEach((c: any) => { const el = document.getElementById(`an-cat-${c.id}`); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [categories]);

  const onBannerLink = (b: any) => {
    if (b.linkType === 'CATEGORY' && b.linkValue) scrollToCat(b.linkValue);
    else if (b.linkType === 'ITEM' && b.linkValue) { const p = allItems.find((x: any) => x.id === b.linkValue); if (p) pick(p); }
  };

  const buildWaMessage = () => {
    const items = lines.map(l => `• ${l.quantity}× ${l.name} — ${fmt(l.price * l.quantity)}`).join('\n');
    return `¡Hola ${info.name.trim()}! 🌽 Quiero este pedido:\n\n${items}\n\n*Total:* ${fmt(total)}\n\n¿Me lo confirman?`;
  };
  const orderByWhatsApp = () => {
    if (!waNumber) return;
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(buildWaMessage())}`, '_blank', 'noopener');
  };
  const subscribeWhatsApp = () => {
    if (!waNumber) return;
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent('¡Hola! Quiero recibir sus antojos y promas por WhatsApp 🌮')}`, '_blank', 'noopener');
  };

  const goCheckout = () => { setCartOpen(false); setCheckoutOpen(true); };

  return (
    <StoreLocaleProvider currency={info.currency} locale={info.currencyLocale}>
    <div className="min-h-screen relative" style={{ color: INK, fontFamily: BODY, background: `radial-gradient(1100px 520px at 50% -10%, #FCEFD6 0%, transparent 55%), radial-gradient(900px 500px at 92% 6%, #F7E2C6 0%, transparent 55%), linear-gradient(180deg, #FBF3E4 0%, #F7ECD8 100%)` }}>
      <Decor accent={ACCENT} />

      <div className="relative">
        <Header
          info={info} accent={ACCENT} waNumber={waNumber} quantity={quantity} total={total}
          query={query} setQuery={setQuery} orderMode={orderMode} setOrderMode={setOrderMode}
          auth={auth} onLogin={() => setLoginOpen(true)}
          onSignOut={() => { clearAuth(slug); setAuthState(null); }}
          onCart={() => setCartOpen(true)} onWhatsApp={orderByWhatsApp}
        />

        {q ? (
          <main className="max-w-7xl mx-auto px-4 py-8">
            <SectionHead title={results.length > 0 ? `Resultados (${results.length})` : `Sin resultados para “${query}”`} />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
              {results.map((p: any) => <ProductCard key={p.id} p={p} accent={ACCENT} slug={slug} onOpen={() => pick(p)} />)}
            </div>
          </main>
        ) : (
          <>
            <Hero info={info} accent={ACCENT} onOrder={() => scrollTo('an-menu')} onMenu={() => scrollTo('an-menu')} />

            {banners.length > 0 && (
              <section className="max-w-7xl mx-auto px-4 mt-6">
                <BannerCarousel banners={banners} variant="light" accent={ACCENT} onLink={onBannerLink} />
              </section>
            )}

            <CategoryNav categories={categories} activeCat={activeCat} accent={ACCENT} onPick={scrollToCat} />

            <div className="max-w-7xl mx-auto px-4 mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_338px] lg:gap-7 lg:items-start">
              <div className="min-w-0">
                {/* MÁS PEDIDOS */}
                {favorites.length > 0 && (
                  <section className="mb-12">
                    <SectionHead title="Más pedidos" flame accent={ACCENT} />
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
                      {favorites.map((p: any) => <ProductCard key={`fav-${p.id}`} p={p} accent={ACCENT} slug={slug} onOpen={() => pick(p)} />)}
                    </div>
                  </section>
                )}

                {/* SECCIONES POR CATEGORÍA */}
                <div id="an-menu">
                  {categories.map((category: any) => (
                    <section key={category.id} id={`an-cat-${category.id}`} data-cat={category.id} className="mb-12 scroll-mt-[150px]">
                      <SectionHead title={category.name} icon={category.imageUrl ? undefined : categoryIcon(category.name)} image={category.imageUrl} />
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
                        {(category.items || []).map((p: any) => <ProductCard key={p.id} p={p} accent={ACCENT} slug={slug} onOpen={() => pick(p)} />)}
                      </div>
                    </section>
                  ))}
                </div>

                <TrustBadges accent={ACCENT} estimated={info.estimatedDelivery} />
              </div>

              {/* CARRITO FIJO (desktop) */}
              <aside className="hidden lg:block sticky top-[150px]">
                <DesktopCart accent={ACCENT} minOrder={minOrder} allItems={allItems}
                  onCheckout={goCheckout} onBrowse={() => scrollTo('an-menu')} onWhatsApp={orderByWhatsApp}
                  waNumber={waNumber} suggestions={favorites.length ? favorites : allItems} onAddSuggestion={pick} />
              </aside>
            </div>

            {waNumber && <Newsletter accent={ACCENT} onSubscribe={subscribeWhatsApp} />}
          </>
        )}

        <Footer info={info} accent={ACCENT} primaryLocation={primaryLocation} waNumber={waNumber} minOrder={minOrder}
          onWhatsApp={orderByWhatsApp} onNav={scrollTo} />
      </div>

      {/* Barra inferior (móvil) */}
      {quantity > 0 && !cartOpen && (
        <div className="lg:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-40">
          <button onClick={() => setCartOpen(true)}
            className="w-full flex items-center justify-between pl-3 pr-2 py-2 rounded-[20px] active:scale-[0.99] transition"
            style={{ background: CREAM, border: `1.5px solid ${CARD_BD}`, boxShadow: '0 18px 40px rgba(58,34,22,0.20)' }}>
            <span className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${ACCENT}16` }}><ShoppingBag className="w-5 h-5" style={{ color: ACCENT }} /></span>
              <span className="text-left leading-tight">
                <span className="block text-[11px] font-semibold" style={{ color: INK2 }}>{quantity} {quantity === 1 ? 'producto' : 'productos'}</span>
                <span className="block font-extrabold" style={{ color: INK, fontFamily: DISP }}>{fmt(total)}</span>
              </span>
            </span>
            <span className="flex items-center gap-1.5 px-5 py-3 rounded-[14px] text-white font-extrabold text-[14px]" style={{ background: ACCENT, boxShadow: `0 10px 22px ${ACCENT}55` }}>Ver pedido <ChevronRight className="w-4 h-4" /></span>
          </button>
        </div>
      )}

      {cartOpen && (
        <MobileCart accent={ACCENT} onClose={() => setCartOpen(false)} onCheckout={goCheckout}
          onWhatsApp={orderByWhatsApp} waNumber={waNumber} allItems={allItems} minOrder={minOrder} />
      )}

      {loginOpen && (
        <LoginModal slug={slug} info={info} accent={ACCENT} profileKey={PROFILE_KEY}
          onClose={() => setLoginOpen(false)} onAuthed={() => { setAuthState(getAuth(slug)); setLoginOpen(false); }} />
      )}

      {modalProduct && <ProductModal product={modalProduct} accent={ACCENT} variant="light" onClose={() => setModalProduct(null)} />}

      <StoreCheckout open={checkoutOpen} onClose={() => setCheckoutOpen(false)} slug={slug} primary={ACCENT}
        locations={locations} delivery={info.delivery} minOrderAmount={info.minOrderAmount}
        onlinePayment={info.onlinePayment} initialOrderType={info.dineIn ? 'DINE_IN' : orderMode} whatsappOrder={info.whatsappOrder}
        lockedTable={info.dineIn?.table} lockedLocationId={info.dineIn?.locationId} />

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
        @keyframes anFloat{0%,100%{transform:translateY(0) rotate(var(--r,0deg))}50%{transform:translateY(-12px) rotate(var(--r,0deg))}}
        @keyframes anSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
        .an-slide{animation:anSlide .28s cubic-bezier(.22,1,.36,1)}
      ` }} />
    </div>
    </StoreLocaleProvider>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  DECORACIÓN DE FONDO (motivos de maíz · chile · destellos, muy tenues)
// ══════════════════════════════════════════════════════════════════════════════
function Decor({ accent }: { accent: string }) {
  const motifs = [
    { l: '5%', t: '14%', e: '🌽', s: 30, r: -14, d: 0 },
    { l: '90%', t: '18%', e: '🌶️', s: 26, r: 12, d: 1.2 },
    { l: '12%', t: '66%', e: '🫓', s: 28, r: -8, d: 0.6 },
    { l: '84%', t: '72%', e: '🥑', s: 26, r: 10, d: 1.8 },
    { l: '48%', t: '9%', e: '🌮', s: 22, r: 6, d: 0.9 },
  ];
  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none overflow-hidden">
      {/* Cenefa superior tipo mantel/telar */}
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: `repeating-linear-gradient(90deg, ${accent} 0 16px, ${MASA} 16px 32px, ${GREEN} 32px 48px)`, opacity: 0.5 }} />
      {motifs.map((m, i) => (
        <span key={i} className="absolute select-none" style={{ left: m.l, top: m.t, fontSize: m.s, opacity: 0.12, ['--r' as string]: `${m.r}deg`, transform: `rotate(${m.r}deg)`, animation: `anFloat ${6 + m.d}s ease-in-out ${m.d}s infinite` }}>{m.e}</span>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  HEADER
// ══════════════════════════════════════════════════════════════════════════════
function Header({ info, accent, waNumber, quantity, total, query, setQuery, orderMode, setOrderMode, auth, onLogin, onSignOut, onCart, onWhatsApp }: any) {
  const fmt = useMoney();
  const { t } = useLang();
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl" style={{ background: 'rgba(251,243,228,0.85)', borderBottom: `1px solid ${CARD_BD}` }}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="h-[64px] flex items-center gap-3">
          {info.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cldImage(info.logo, { width: 120 })} alt={info.name} loading="eager" decoding="async" className="w-11 h-11 rounded-2xl object-cover shrink-0" style={{ border: `2px solid #fff`, boxShadow: `0 4px 12px ${accent}33` }} />
          ) : <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 font-extrabold text-white" style={{ background: accent, fontFamily: DISP }}>{info.name.trim().charAt(0)}</div>}
          <h1 className="text-[21px] leading-none truncate" style={{ fontFamily: DISP, fontWeight: 800, color: INK }}>{info.name?.trim() || 'Mi Fonda'}</h1>

          {/* Estado de la tienda. Solo se monta el tema cuando está abierta
              (page.tsx corta en isOpen===false); el chip siempre dice "Abierto";
              el tiempo es de ENTREGA, solo aplica en modo DELIVERY. */}
          {info.isOpen !== false && (
            <span className="flex items-center gap-1.5 shrink-0 px-2.5 h-7 rounded-full text-[11px] font-bold" style={{ background: `${GREEN}14`, color: GREEN, border: `1px solid ${GREEN}40` }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} />
              Abierto
              {orderMode === 'DELIVERY' && info.estimatedDelivery ? <span className="hidden sm:inline font-semibold opacity-80">· ~{info.estimatedDelivery} min</span> : null}
            </span>
          )}

          {/* Buscador (desktop) */}
          <div className="hidden md:flex items-center gap-2 px-4 h-11 rounded-full flex-1 max-w-md ml-2" style={{ background: '#fff', border: `1.5px solid ${CARD_BD}` }}>
            <Search className="w-4 h-4 shrink-0" style={{ color: FAINT }} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('search')} className="flex-1 bg-transparent outline-none text-sm" style={{ color: INK }} />
            {query && <button onClick={() => setQuery('')} aria-label="Limpiar"><X className="w-4 h-4" style={{ color: FAINT }} /></button>}
          </div>

          <div className="flex-1 md:flex-none" />

          <DeliveryToggle orderMode={orderMode} setOrderMode={setOrderMode} accent={accent} className="hidden lg:flex" />

          <div className="hidden sm:block shrink-0" style={{ color: INK }}><LanguageSwitcher accent={accent} /></div>

          {waNumber && (
            <button onClick={onWhatsApp} className="hidden md:flex items-center gap-2 px-4 h-11 rounded-full font-bold text-sm text-white active:scale-95 transition shrink-0" style={{ background: WA }}>
              <MessageCircle className="w-4 h-4" /> <span className="hidden lg:inline">WhatsApp</span>
            </button>
          )}

          <button onClick={auth ? onSignOut : onLogin} className="hidden sm:flex items-center gap-1.5 px-3 h-11 rounded-full shrink-0" style={{ background: '#fff', border: `1.5px solid ${CARD_BD}` }} title={auth ? 'Cerrar sesión' : 'Iniciar sesión'}>
            <User className="w-5 h-5" style={{ color: auth ? accent : INK2 }} />
            <span className="hidden lg:block text-[12.5px] font-bold max-w-[90px] truncate" style={{ color: INK }}>{auth ? auth.customer.name.split(' ')[0] : 'Mi cuenta'}</span>
          </button>

          {/* Carrito (móvil; en desktop va fijo a la derecha) */}
          <button onClick={onCart} className="lg:hidden relative flex items-center gap-2 pl-3 pr-4 h-11 rounded-full shrink-0 text-white" style={{ background: accent }} aria-label="Carrito">
            <ShoppingBag className="w-5 h-5" />
            {quantity > 0 && <span className="text-[13px] font-extrabold">{fmt(total)}</span>}
            {quantity > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-extrabold text-white" style={{ background: MASA, color: '#3A2216' }}>{quantity}</span>}
          </button>
        </div>

        {/* Segunda fila (móvil): toggle + búsqueda */}
        <div className="md:hidden pb-3 flex items-center gap-2">
          <DeliveryToggle orderMode={orderMode} setOrderMode={setOrderMode} accent={accent} />
          <div className="flex items-center gap-2 px-3.5 h-10 rounded-full flex-1" style={{ background: '#fff', border: `1.5px solid ${CARD_BD}` }}>
            <Search className="w-4 h-4 shrink-0" style={{ color: FAINT }} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('search')} className="flex-1 bg-transparent outline-none text-sm" style={{ color: INK }} />
            {query && <button onClick={() => setQuery('')} aria-label="Limpiar"><X className="w-4 h-4" style={{ color: FAINT }} /></button>}
          </div>
        </div>
      </div>
    </header>
  );
}

function DeliveryToggle({ orderMode, setOrderMode, accent, className = '' }: { orderMode: OrderMode; setOrderMode: (m: OrderMode) => void; accent: string; className?: string }) {
  const { t } = useLang();
  return (
    <div className={`flex p-1 rounded-full shrink-0 ${className}`} style={{ background: MASA_SOFT, border: `1.5px solid ${CARD_BD}` }}>
      {([['DELIVERY', t('delivery')], ['TAKEOUT', t('pickup')]] as [OrderMode, string][]).map(([m, label]) => (
        <button key={m} onClick={() => setOrderMode(m)} className="px-4 py-1.5 rounded-full text-[12.5px] font-bold transition-all"
          style={orderMode === m ? { background: accent, color: '#fff' } : { color: INK2 }}>{label}</button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  HERO
// ══════════════════════════════════════════════════════════════════════════════
function Hero({ info, accent, onOrder, onMenu }: { info: Info; accent: string; onOrder: () => void; onMenu: () => void }) {
  const heroImg = info.heroImageUrl?.trim();
  if (heroImg) {
    return (
      <section className="max-w-7xl mx-auto px-4 pt-5">
        <button onClick={onOrder} className="block w-full overflow-hidden rounded-[28px] active:scale-[0.997] transition" style={{ border: `1px solid ${CARD_BD}`, boxShadow: '0 24px 60px rgba(58,34,22,0.18)' }} aria-label="Ordenar ahora">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroSrc(heroImg)} alt={info.name.trim()} loading="eager" decoding="async" className="w-full h-auto block" />
        </button>
        <div className="mt-4 flex flex-wrap gap-3">
          <CTA onClick={onOrder} solid accent={accent}>Ordenar ahora</CTA>
          <CTA onClick={onMenu} accent={accent}>Ver menú</CTA>
        </div>
      </section>
    );
  }
  return (
    <section className="max-w-7xl mx-auto px-4 pt-5">
      <div className="relative overflow-hidden rounded-[32px] px-6 py-9 sm:px-12 sm:py-14"
        style={{ background: `radial-gradient(130% 130% at 0% 0%, #FCE7C6, transparent 52%), radial-gradient(130% 140% at 100% 100%, ${accent}20, transparent 52%), ${CREAM}`, border: `1px solid ${CARD_BD}`, boxShadow: '0 26px 64px rgba(58,34,22,0.14)' }}>
        {/* Motivo de antojito decorativo (desktop) */}
        <div aria-hidden className="hidden md:block absolute right-8 top-1/2 -translate-y-1/2 select-none" style={{ fontSize: 132, lineHeight: 1, filter: 'drop-shadow(0 18px 26px rgba(58,34,22,0.22))', animation: 'anFloat 6s ease-in-out infinite' }}>🫓</div>
        <span aria-hidden className="hidden md:block absolute right-44 top-10 text-4xl select-none" style={{ animation: 'anFloat 5s ease-in-out .6s infinite' }}>🌽</span>

        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] px-3.5 py-1.5 rounded-full mb-4" style={{ background: '#fff', color: accent, border: `1.5px solid ${CARD_BD}` }}>
            <Flame className="w-3.5 h-3.5" /> Recién hechos
          </span>
          <h2 className="leading-[0.95]" style={{ fontFamily: DISP, fontWeight: 900, fontSize: 'clamp(38px,8vw,74px)', color: INK }}>
            {info.name.trim()}
          </h2>
          <p className="mt-3 text-[15px] sm:text-[17px] font-semibold max-w-md" style={{ color: INK2 }}>
            Antojitos hechos a mano, con guisos caseros y masa del día. Arma tu pedido y recíbelo calientito en tu puerta. 🌮
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <CTA onClick={onOrder} solid accent={accent}>Ordenar ahora</CTA>
            <CTA onClick={onMenu} accent={accent}>Ver menú</CTA>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <HeroChip emoji="🫓" title="Masa del día" sub="Hecha a mano" />
            <HeroChip emoji="🛵" title="A domicilio" sub={info.estimatedDelivery ? `~${info.estimatedDelivery} min` : 'A tu puerta'} />
            <HeroChip emoji="💵" title="Pago fácil" sub="Efectivo · tarjeta" />
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA({ children, onClick, solid, accent }: { children: React.ReactNode; onClick: () => void; solid?: boolean; accent: string }) {
  return (
    <button onClick={onClick} className="px-7 py-3.5 rounded-full font-extrabold text-[15px] active:scale-95 transition"
      style={solid
        ? { background: accent, color: '#fff', boxShadow: `0 12px 28px ${accent}55`, fontFamily: DISP }
        : { background: '#fff', color: accent, border: `1.5px solid ${CARD_BD}`, fontFamily: DISP }}>
      {children}
    </button>
  );
}

function HeroChip({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl" style={{ background: '#ffffffcc', border: `1px solid ${CARD_BD}` }}>
      <span className="text-base">{emoji}</span>
      <span className="leading-tight"><span className="block text-[12px] font-extrabold" style={{ color: INK }}>{title}</span><span className="block text-[10px] font-semibold" style={{ color: FAINT }}>{sub}</span></span>
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  PASTILLAS DE CATEGORÍA (sticky · scroll-spy)
// ══════════════════════════════════════════════════════════════════════════════
function CategoryNav({ categories, activeCat, accent, onPick }: { categories: any[]; activeCat: string; accent: string; onPick: (id: string) => void }) {
  if (categories.length <= 1) return null;
  return (
    <nav className="sticky top-[64px] z-30 backdrop-blur-xl mt-6" style={{ background: 'rgba(251,243,228,0.88)', borderTop: `1px solid ${CARD_BD}`, borderBottom: `1px solid ${CARD_BD}` }}>
      <div className="max-w-7xl mx-auto px-4 py-3 flex gap-2.5 overflow-x-auto no-scrollbar">
        {categories.map((c: any) => {
          const on = activeCat === c.id;
          return (
            <button key={c.id} onClick={() => onPick(c.id)} className="shrink-0 flex items-center gap-2 pl-1.5 pr-4 h-11 rounded-full transition-all"
              style={on ? { background: accent, border: `1.5px solid ${accent}`, boxShadow: `0 8px 20px ${accent}44` } : { background: '#fff', border: `1.5px solid ${CARD_BD}` }}>
              <span className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center" style={{ background: on ? '#ffffff33' : MASA_SOFT }}>
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cldImage(c.imageUrl, { width: 64 })} alt={c.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : <span className="text-[15px]">{categoryIcon(c.name)}</span>}
              </span>
              <span className="text-[13px] font-extrabold whitespace-nowrap" style={{ color: on ? '#fff' : INK }}>{c.name}</span>
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
function SectionHead({ title, icon, image, flame, accent }: { title: string; icon?: string; image?: string | null; flame?: boolean; accent?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cldImage(image, { width: 96 })} alt="" loading="lazy" decoding="async" className="w-9 h-9 rounded-xl object-cover" />
      ) : icon ? (
        <span className="w-9 h-9 rounded-xl flex items-center justify-center text-xl" style={{ background: MASA_SOFT }}>{icon}</span>
      ) : null}
      <h3 className="text-[24px] sm:text-[27px]" style={{ fontFamily: DISP, fontWeight: 800, color: INK }}>{title}</h3>
      {flame && <Flame className="w-5 h-5" style={{ color: accent || RED }} fill={accent || RED} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  TARJETA DE PRODUCTO
// ══════════════════════════════════════════════════════════════════════════════
function Badge({ kind }: { kind: 'top' | 'promo' | 'new' }) {
  const map = {
    top: { t: 'Más pedido', bg: MASA, fg: '#3A2216' },
    promo: { t: 'Oferta', bg: RED, fg: '#fff' },
    new: { t: 'Nuevo', bg: GREEN, fg: '#fff' },
  }[kind];
  return <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full" style={{ background: map.bg, color: map.fg, boxShadow: '0 4px 10px rgba(0,0,0,0.12)' }}>{map.t}</span>;
}

function ProductCard({ p, accent, onOpen, slug }: { p: any; accent: string; onOpen: () => void; slug: string }) {
  const fmt = useMoney();
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const line = lines.find(l => l.id === p.id);
  const price = priceOf(p);
  const pf = priceFrom(p);
  const canQuickAdd = !needsModal(p);

  return (
    <article className="group relative rounded-[24px] p-3 flex flex-col transition-all hover:-translate-y-1" style={{ background: CREAM, border: `1px solid ${CARD_BD}`, boxShadow: '0 10px 26px rgba(58,34,22,0.09)' }}>
      <button onClick={onOpen} className="relative w-full aspect-square rounded-[18px] overflow-hidden mb-3 block" style={{ background: MASA_SOFT }}>
        <div className="absolute top-2.5 left-2.5 z-10 flex flex-col gap-1.5 items-start">
          {p.isPopular && <Badge kind="top" />}
          {p.isPromo && <Badge kind="promo" />}
          {p.isNew && <Badge kind="new" />}
        </div>
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cldImage(p.imageUrl, { width: 480 })} alt={p.name} loading="lazy" decoding="async" className={`w-full h-full transition-transform duration-500 group-hover:scale-110 ${p.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
        ) : <div className="w-full h-full flex items-center justify-center text-5xl opacity-40">{productEmoji(p.name)}</div>}
      </button>

      <div className="absolute top-2.5 right-2.5 z-20" style={{ color: INK }}>
        <ReactionButton slug={slug} itemId={p.id} initialCount={p.reactionCount || 0} accent={RED} />
      </div>

      <button onClick={onOpen} className="text-left">
        <h4 className="font-extrabold text-[14.5px] leading-tight line-clamp-1" style={{ color: INK }}>{p.name}</h4>
        {p.description && <p className="text-[11.5px] mt-0.5 line-clamp-2 leading-snug font-medium" style={{ color: FAINT }}>{p.description}</p>}
      </button>

      <div className="mt-auto pt-3 flex items-end justify-between gap-2">
        <div className="flex flex-col leading-none min-w-0">
          {pf.from
            ? <span className="text-[9px] font-bold uppercase tracking-wide leading-none mb-0.5" style={{ color: FAINT }}>Desde</span>
            : (p.isPromo && <span className="text-[10px] line-through font-bold" style={{ color: FAINT }}>{fmt(p.price)}</span>)}
          <span className="font-extrabold text-[18px]" style={{ color: RED, fontFamily: DISP }}>{fmt(pf.value)}</span>
        </div>
        {line && canQuickAdd ? (
          <div className="flex items-center gap-1 rounded-full px-1 py-1 shrink-0" style={{ background: MASA_SOFT, border: `1px solid ${CARD_BD}` }}>
            <button onClick={() => remove(p.id)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#fff', color: INK2 }} aria-label="Quitar">
              {line.quantity > 1 ? <Minus className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
            <span className="text-sm font-extrabold w-4 text-center" style={{ color: INK }}>{line.quantity}</span>
            <button onClick={() => add({ id: p.id, menuItemId: p.id, name: p.name, price })} className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: accent }} aria-label="Agregar"><Plus className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button onClick={onOpen} className="flex items-center gap-1.5 pl-3 pr-3.5 h-10 rounded-full text-white shrink-0 active:scale-95 transition font-extrabold text-[13px]" style={{ background: accent, boxShadow: `0 8px 18px ${accent}55` }} aria-label="Agregar">
            <Plus className="w-4 h-4" /> Agregar
          </button>
        )}
      </div>
    </article>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  TRUST BADGES
// ══════════════════════════════════════════════════════════════════════════════
function TrustBadges({ accent, estimated }: { accent: string; estimated?: number }) {
  const items = [
    { icon: <Flame className="w-5 h-5" />, t: 'Recién hechos', s: 'Al momento del pedido' },
    { icon: <Leaf className="w-5 h-5" />, t: 'Guisos caseros', s: 'Receta de la casa' },
    { icon: <Truck className="w-5 h-5" />, t: 'A domicilio', s: estimated ? `~${estimated} min` : 'A tu puerta' },
    { icon: <HandPlatter className="w-5 h-5" />, t: 'Hecho a mano', s: 'Como en casa' },
  ];
  return (
    <section className="mb-12 grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-[20px]" style={{ background: CREAM, border: `1px solid ${CARD_BD}` }}>
          <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${accent}16`, color: accent }}>{it.icon}</span>
          <span className="leading-tight min-w-0"><span className="block text-[13px] font-extrabold" style={{ color: INK }}>{it.t}</span><span className="block text-[11px] font-semibold" style={{ color: FAINT }}>{it.s}</span></span>
        </div>
      ))}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  CARRITO — líneas + variantes desktop/móvil
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
          <div key={l.id} className="flex items-center gap-2.5 p-2 rounded-[16px]" style={{ background: '#fff', border: `1px solid ${CARD_BD}` }}>
            <div className="w-12 h-12 rounded-[12px] overflow-hidden shrink-0" style={{ background: MASA_SOFT }}>
              {src?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cldImage(src.imageUrl, { width: 120 })} alt={l.name} loading="lazy" decoding="async" className={`w-full h-full ${src.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
              ) : <div className="w-full h-full flex items-center justify-center text-base opacity-40">{productEmoji(l.name)}</div>}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-[12.5px] leading-tight line-clamp-2" style={{ color: INK }}>{l.name}</h4>
              <p className="text-[13px] font-extrabold mt-0.5" style={{ color: RED }}>{fmt(l.price)}</p>
            </div>
            <div className="flex items-center gap-0.5 rounded-full px-1 py-1 shrink-0" style={{ background: MASA_SOFT }}>
              <button onClick={() => remove(l.id)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#fff', color: INK2 }} aria-label="Quitar">{l.quantity > 1 ? <Minus className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}</button>
              <span className="text-[13px] font-extrabold w-4 text-center" style={{ color: INK }}>{l.quantity}</span>
              <button onClick={() => add({ id: l.id, menuItemId: l.menuItemId, name: l.name, price: l.price, variantId: l.variantId, modifierIds: l.modifierIds })} className="w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: accent }} aria-label="Agregar"><Plus className="w-3 h-3" /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return <div className="flex items-center justify-between text-[13px]"><span style={{ color: INK2 }}>{label}</span><span className="font-bold" style={{ color: muted ? FAINT : INK }}>{value}</span></div>;
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
    <div className="rounded-[26px] overflow-hidden" style={{ background: CREAM, border: `1px solid ${CARD_BD}`, boxShadow: '0 16px 40px rgba(58,34,22,0.12)' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${CARD_BD}` }}>
        <h3 className="flex items-center gap-2 text-[20px]" style={{ fontFamily: DISP, fontWeight: 800, color: INK }}><ShoppingBag className="w-5 h-5" style={{ color: accent }} /> Tu pedido</h3>
        {quantity > 0 && <span className="min-w-[24px] h-6 px-2 flex items-center justify-center rounded-full text-[12px] font-extrabold text-white" style={{ background: accent }}>{quantity}</span>}
      </div>

      {lines.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <div className="text-5xl mb-3 opacity-40">🫓</div>
          <p className="font-bold text-sm mb-1" style={{ color: INK }}>Tu pedido está vacío</p>
          <p className="text-[12px] mb-5" style={{ color: FAINT }}>¡Agrega algún antojito! 🌮</p>
          <button onClick={onBrowse} className="px-5 py-2.5 rounded-full font-bold text-[13px] text-white" style={{ background: accent }}>Ver menú</button>
        </div>
      ) : (
        <div className="p-4">
          <div className="max-h-[40vh] overflow-y-auto no-scrollbar pr-0.5"><CartLines allItems={allItems} accent={accent} /></div>

          {suggestion && (
            <div className="mt-3 p-2.5 rounded-[16px] flex items-center gap-2.5" style={{ background: MASA_SOFT, border: `1px dashed ${CARD_BD}` }}>
              <div className="w-10 h-10 rounded-[10px] overflow-hidden shrink-0" style={{ background: '#fff' }}>
                {suggestion.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cldImage(suggestion.imageUrl, { width: 100 })} alt={suggestion.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : <div className="w-full h-full flex items-center justify-center text-lg opacity-50">{productEmoji(suggestion.name)}</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: accent }}>¿Algo para acompañar?</p>
                <p className="text-[12px] font-bold truncate" style={{ color: INK }}>{suggestion.name} · {fmt(priceOf(suggestion))}</p>
              </div>
              <button onClick={() => onAddSuggestion(suggestion)} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: accent }}><Plus className="w-4 h-4" /></button>
            </div>
          )}

          <div className="mt-3.5 pt-3 space-y-1.5" style={{ borderTop: `1px solid ${CARD_BD}` }}>
            <Row label={t('subtotal')} value={fmt(total)} />
            <Row label={t('delivery_fee')} value="Se calcula al pagar" muted />
            <div className="flex items-center justify-between pt-1.5">
              <span className="font-extrabold" style={{ color: INK }}>{t('total')}</span>
              <span className="text-2xl font-extrabold" style={{ color: RED, fontFamily: DISP }}>{fmt(total)}</span>
            </div>
          </div>
          {belowMin && <p className="text-[11px] font-bold text-center mt-2" style={{ color: RED }}>Pedido mínimo: {fmt(minOrder)}.</p>}
          <button onClick={onCheckout} disabled={belowMin} className="w-full mt-3 py-3.5 rounded-[16px] font-extrabold text-white flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50" style={{ background: accent, boxShadow: `0 12px 26px ${accent}55`, fontFamily: DISP }}>Continuar pedido <ChevronRight className="w-5 h-5" /></button>
          {waNumber && <button onClick={onWhatsApp} className="w-full mt-2 py-2.5 rounded-[16px] font-bold text-white text-[13px] flex items-center justify-center gap-2 active:scale-95 transition" style={{ background: WA }}><MessageCircle className="w-4 h-4" /> {t('send_whatsapp')}</button>}
        </div>
      )}
    </div>
  );
}

function MobileCart({ accent, onClose, onCheckout, onWhatsApp, waNumber, allItems, minOrder }: any) {
  const fmt = useMoney();
  const { t } = useLang();
  const lines = useCart(s => s.lines);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());
  const belowMin = minOrder > 0 && total < minOrder;
  return (
    <div className="fixed inset-0 z-[100] flex sm:justify-end" onClick={onClose}>
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(43,26,16,0.45)' }} />
      <div onClick={e => e.stopPropagation()} className="relative w-full sm:max-w-md sm:ml-auto mt-auto sm:mt-0 h-[92vh] sm:h-full flex flex-col rounded-t-[28px] sm:rounded-none an-slide" style={{ background: '#FBF3E4', borderLeft: `1px solid ${CARD_BD}` }}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${CARD_BD}` }}>
          <div><h2 className="text-[24px]" style={{ fontFamily: DISP, fontWeight: 800, color: INK }}>Tu pedido</h2><p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: FAINT }}>{quantity} {quantity === 1 ? 'producto' : 'productos'}</p></div>
          <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#fff', border: `1px solid ${CARD_BD}` }} aria-label="Cerrar"><X className="w-5 h-5" style={{ color: INK }} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="text-6xl mb-4 opacity-40">🫓</div>
              <p className="font-bold mb-1" style={{ color: INK }}>Tu pedido está vacío</p>
              <p className="text-xs mb-6" style={{ color: FAINT }}>Arma tu antojo 🌮</p>
              <button onClick={onClose} className="px-6 py-3 rounded-full font-bold text-white" style={{ background: accent }}>Ver el menú</button>
            </div>
          ) : <CartLines allItems={allItems} accent={accent} />}
        </div>
        {lines.length > 0 && (
          <div className="px-5 pt-4 pb-5 shrink-0 space-y-3" style={{ borderTop: `1px solid ${CARD_BD}`, background: CREAM }}>
            <div className="flex items-center justify-between">
              <div><p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: FAINT }}>{t('subtotal')}</p><p className="text-[10px]" style={{ color: FAINT }}>Envío y descuentos se calculan al pagar</p></div>
              <span className="text-2xl font-extrabold" style={{ color: RED, fontFamily: DISP }}>{fmt(total)}</span>
            </div>
            {belowMin && <p className="text-xs font-bold text-center" style={{ color: RED }}>Pedido mínimo: {fmt(minOrder)}.</p>}
            <button onClick={onCheckout} disabled={belowMin} className="w-full py-4 rounded-[18px] font-extrabold text-white active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: accent, fontFamily: DISP }}>Continuar pedido <ChevronRight className="w-5 h-5" /></button>
            {waNumber && <button onClick={onWhatsApp} className="w-full py-3.5 rounded-[18px] font-extrabold text-white active:scale-95 transition flex items-center justify-center gap-2" style={{ background: WA }}><MessageCircle className="w-5 h-5" /> {t('send_whatsapp')}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  NEWSLETTER (suscripción por WhatsApp — sin endpoint falso)
// ══════════════════════════════════════════════════════════════════════════════
function Newsletter({ accent, onSubscribe }: { accent: string; onSubscribe: () => void }) {
  const [email, setEmail] = useState('');
  return (
    <section className="max-w-7xl mx-auto px-4 mt-4 mb-12">
      <div className="rounded-[28px] p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-5 justify-between" style={{ background: `radial-gradient(120% 140% at 0% 0%, #FCE7C6, transparent 55%), ${accent}14, ${CREAM}`, border: `1px solid ${CARD_BD}` }}>
        <div className="text-center sm:text-left">
          <h3 className="text-[24px]" style={{ fontFamily: DISP, fontWeight: 800, color: INK }}>Recibe los antojos del día 🌮</h3>
          <p className="text-[13px] mt-1 font-semibold" style={{ color: INK2 }}>Nuestras promas y platillos nuevos, directo a tu WhatsApp.</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSubscribe(); }} className="flex gap-2 w-full sm:w-auto">
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Tu correo electrónico" inputMode="email" className="flex-1 sm:w-56 px-4 h-11 rounded-full outline-none text-sm" style={{ background: '#fff', border: `1.5px solid ${CARD_BD}`, color: INK }} />
          <button type="submit" className="px-5 h-11 rounded-full font-extrabold text-sm text-white shrink-0 active:scale-95 transition" style={{ background: accent }}>Suscribirme</button>
        </form>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  FOOTER
// ══════════════════════════════════════════════════════════════════════════════
function Footer({ info, accent, primaryLocation, waNumber, minOrder, onWhatsApp, onNav }: any) {
  const fmt = useMoney();
  return (
    <footer className="relative" style={{ borderTop: `1px solid ${CARD_BD}`, background: CREAM }}>
      <div className="max-w-7xl mx-auto px-4 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            {info.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cldImage(info.logo, { width: 120 })} alt={info.name} loading="lazy" decoding="async" className="w-11 h-11 rounded-2xl object-cover" style={{ border: `2px solid #fff`, boxShadow: `0 4px 12px ${accent}33` }} />
            ) : <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-extrabold text-white" style={{ background: accent, fontFamily: DISP }}>{info.name.trim().charAt(0)}</div>}
            <span className="text-[22px]" style={{ fontFamily: DISP, fontWeight: 800, color: INK }}>{info.name.trim()}</span>
          </div>
          <p className="text-[13px] leading-relaxed font-medium" style={{ color: INK2 }}>Antojitos recién hechos, con guisos caseros. Pide en línea y recíbelo calientito. 🌽</p>
          <div className="flex items-center gap-2 mt-4">
            {waNumber && <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: MASA_SOFT }} aria-label="WhatsApp"><MessageCircle className="w-4 h-4" style={{ color: WA }} /></a>}
            <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: MASA_SOFT, color: FAINT }} aria-hidden><Instagram className="w-4 h-4" /></span>
            <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: MASA_SOFT, color: FAINT }} aria-hidden><Facebook className="w-4 h-4" /></span>
            <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: MASA_SOFT, color: FAINT }} aria-hidden><Music2 className="w-4 h-4" /></span>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest mb-3" style={{ color: accent }}>Contáctanos</p>
          <ul className="space-y-2.5 text-[13px] font-medium" style={{ color: INK2 }}>
            {waNumber && <li><button onClick={onWhatsApp} className="flex items-center gap-2 hover:opacity-70 transition"><MessageCircle className="w-4 h-4" style={{ color: WA }} /> Pedir por WhatsApp</button></li>}
            {primaryLocation?.phone && <li><a href={`tel:${primaryLocation.phone.replace(/\s+/g, '')}`} className="flex items-center gap-2 hover:opacity-70 transition"><Phone className="w-4 h-4" style={{ color: accent }} /> {primaryLocation.phone}</a></li>}
            {primaryLocation?.address && <li className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0" style={{ color: accent }} /> <span>{primaryLocation.address}</span></li>}
            <li><button onClick={() => onNav('an-menu')} className="flex items-center gap-2 hover:opacity-70 transition"><Star className="w-4 h-4" style={{ color: accent }} /> Ver menú</button></li>
          </ul>
        </div>

        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest mb-3" style={{ color: accent }}>Aceptamos</p>
          <div className="flex flex-wrap gap-2">
            <PayChip accent={accent} icon={<Banknote className="w-4 h-4" />} label="Efectivo" />
            <PayChip accent={accent} icon={<CreditCard className="w-4 h-4" />} label="Tarjeta" />
            <PayChip accent={accent} icon={<Building2 className="w-4 h-4" />} label="Transferencia" />
          </div>
          <p className="text-[11px] mt-4" style={{ color: FAINT }}>Pedido mínimo {minOrder > 0 ? fmt(minOrder) : 'sin mínimo'}.</p>
        </div>
      </div>
      <div className="text-center text-[11px] py-4 font-medium" style={{ color: FAINT, borderTop: `1px solid ${CARD_BD}` }}>© {info.name.trim()} · Hecho con 🌽 · Powered by MRTPV</div>
    </footer>
  );
}

function PayChip({ accent, icon, label }: { accent: string; icon: React.ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl" style={{ background: MASA_SOFT, border: `1px solid ${CARD_BD}`, color: INK }}><span style={{ color: accent }}>{icon}</span>{label}</span>;
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOGIN / REGISTRO (cuenta real de cliente; prellena el checkout)
// ══════════════════════════════════════════════════════════════════════════════
function LoginModal({ slug, info, accent, profileKey, onClose, onAuthed }: { slug: string; info: Info; accent: string; profileKey: string; onClose: () => void; onAuthed: () => void }) {
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
        const rawP = localStorage.getItem(profileKey); const prev = rawP ? JSON.parse(rawP) : {};
        localStorage.setItem(profileKey, JSON.stringify({ ...prev, name: customer.name, phone: customer.phone || prev.phone || '' }));
      } catch {}
      onAuthed();
    } catch (e: any) { setError(e?.message || 'No se pudo continuar.'); } finally { setBusy(false); }
  };

  const field = 'flex items-center gap-2 px-4 h-12 rounded-2xl';
  const fieldStyle = { background: '#fff', border: `1.5px solid ${CARD_BD}` } as const;
  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(43,26,16,0.55)' }} />
      <div onClick={e => e.stopPropagation()} className="relative w-full sm:max-w-sm rounded-t-[28px] sm:rounded-[26px] p-6" style={{ background: '#FBF3E4', border: `1px solid ${CARD_BD}` }}>
        <div className="flex flex-col items-center mb-5">
          {info.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cldImage(info.logo, { width: 120 })} alt={info.name} loading="lazy" decoding="async" className="w-14 h-14 rounded-2xl object-cover mb-3" style={{ border: `2px solid #fff`, boxShadow: `0 6px 14px ${accent}33` }} />
          ) : <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: `${accent}1f` }}><User className="w-7 h-7" style={{ color: accent }} /></div>}
          <h2 className="text-[24px]" style={{ fontFamily: DISP, fontWeight: 800, color: INK }}>{mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
          <p className="text-[12px] mt-1 text-center font-semibold" style={{ color: INK2 }}>Guarda tus datos y pide más rápido en {info.name.trim()}</p>
        </div>

        <div className="flex p-1 rounded-full mb-4" style={{ background: MASA_SOFT }}>
          {(['login', 'register'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }} className="flex-1 py-2 rounded-full text-sm font-extrabold transition-all" style={mode === m ? { background: accent, color: '#fff' } : { color: INK2 }}>{m === 'login' ? 'Entrar' : 'Registrarme'}</button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-2.5">
          {mode === 'register' && (
            <div className={field} style={fieldStyle}><User className="w-4 h-4 shrink-0" style={{ color: FAINT }} /><input className="flex-1 bg-transparent outline-none text-sm" style={{ color: INK }} value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" /></div>
          )}
          <div className={field} style={fieldStyle}><Mail className="w-4 h-4 shrink-0" style={{ color: FAINT }} /><input className="flex-1 bg-transparent outline-none text-sm" style={{ color: INK }} value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo" inputMode="email" autoCapitalize="none" /></div>
          {mode === 'register' && (
            <div className={field} style={fieldStyle}><Navigation className="w-4 h-4 shrink-0" style={{ color: FAINT }} /><input className="flex-1 bg-transparent outline-none text-sm" style={{ color: INK }} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono (opcional)" inputMode="tel" /></div>
          )}
          <div className={field} style={fieldStyle}><Lock className="w-4 h-4 shrink-0" style={{ color: FAINT }} /><input type="password" className="flex-1 bg-transparent outline-none text-sm" style={{ color: INK }} value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña" /></div>
          {error && <p className="text-xs font-bold" style={{ color: RED }}>{error}</p>}
          <button type="submit" disabled={busy} className="w-full mt-1 py-3.5 rounded-2xl font-extrabold text-white active:scale-95 transition disabled:opacity-60" style={{ background: accent, fontFamily: DISP }}>{busy ? 'Procesando…' : mode === 'register' ? 'Crear mi cuenta' : 'Entrar'}</button>
        </form>
        <button onClick={onClose} className="w-full mt-2 py-2.5 text-[12px] font-bold" style={{ color: INK2 }}>Continuar como invitado</button>
      </div>
    </div>
  );
}
