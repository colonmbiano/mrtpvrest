'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, SlidersHorizontal, Bell, ShoppingBag, Heart, Plus, Minus,
  Home, LayoutGrid, X, ChevronRight, ChevronLeft, Flame, MessageCircle,
  User, MapPin, Globe, Settings, FileText,
  Shield, LogOut, Banknote, CreditCard, Building2, Check, UtensilsCrossed,
  BadgePercent, Navigation, Tag, Pencil, Star, Trash2, Receipt, Gift, Award,
  Mail, Lock,
} from 'lucide-react';
import { useCart } from '../../lib/cartStore';
import { productEmoji } from '../../lib/productEmoji';
import BannerCarousel from '../BannerCarousel';
import { needsModal } from '../ProductModal';
import { cldImage } from '@/lib/cloudinary';
import { getApiUrl } from '../../lib/config';
import { computeDeliveryPreview, type DeliveryConfig } from '../../lib/delivery';
import {
  getAuth, clearAuth, registerCustomer, loginCustomer, fetchMyOrders, fetchMyLoyalty,
  authHeader, type AuthState, type CustomerOrder, type LoyaltyInfo,
} from '../../lib/customerAuth';

const API = getApiUrl();

type Info = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  hasWebStore: boolean;
  whatsappNumber: string | null;
  minOrderAmount?: number;
  estimatedDelivery?: number;
  onlinePayment?: boolean;
  delivery?: DeliveryConfig;
  themeConfig: { theme?: string; primaryColor?: string } | null;
};

type WagbaThemeProps = {
  data: { info: Info; menu: { categories: any[] }; locations: any[] };
};

// ── Paleta WAGBA (dark delivery) ──────────────────────────────────────────────
const BG = '#0A0A0C';
const CARD = '#1B1B1F';
const INPUT = '#26262B';
const BORDER = '#FFFFFF12';
const MUTED = '#9A9AA2';
const FAINT = '#FFFFFF55';

const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;
const priceOf = (p: any) => (p.isPromo && p.promoPrice ? p.promoPrice : p.price);

type View =
  | 'splash' | 'onboarding' | 'signin'
  | 'home' | 'categories' | 'category' | 'cart' | 'profile' | 'favorites'
  | 'orders' | 'points'
  | 'meal' | 'checkout' | 'done';

const TAB_VIEWS: View[] = ['home', 'categories', 'category', 'cart', 'profile', 'favorites', 'orders', 'points'];

// ══════════════════════════════════════════════════════════════════════════════
//  TEMA RAÍZ
// ══════════════════════════════════════════════════════════════════════════════
export function WagbaTheme({ data }: WagbaThemeProps) {
  const { info, menu, locations } = data;
  const categories: any[] = menu.categories || [];
  const accent = info.themeConfig?.primaryColor || '#FF5C00';
  const slug = info.slug;

  const [view, setView] = useState<View>('splash');
  const [meal, setMeal] = useState<any>(null);
  const [activeCategory, setActiveCategory] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [auth, setAuthState] = useState<AuthState | null>(null);

  const ONBOARDED_KEY = `wagba:onboarded:${slug}`;
  const FAVS_KEY = `wagba:favs:${slug}`;
  const PROFILE_KEY = `mrtpv:customer:${slug}`;

  const lines = useCart(s => s.lines);
  const quantity = useCart(s => s.quantity());
  const total = useCart(s => s.total());

  const searchRef = useRef<HTMLInputElement>(null);

  // Splash → flujo de primera visita (una sola vez por dispositivo/tienda).
  useEffect(() => {
    let seen = false;
    try { seen = !!localStorage.getItem(ONBOARDED_KEY); } catch {}
    try {
      const raw = localStorage.getItem(FAVS_KEY);
      if (raw) setFavs(new Set(JSON.parse(raw)));
    } catch {}
    setAuthState(getAuth(slug));
    const t = setTimeout(() => setView(seen ? 'home' : 'onboarding'), 1300);
    return () => clearTimeout(t);
  }, [ONBOARDED_KEY, FAVS_KEY, slug]);

  const persistFavs = (next: Set<string>) => {
    try { localStorage.setItem(FAVS_KEY, JSON.stringify([...next])); } catch {}
  };
  const toggleFav = (id: string) =>
    setFavs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      persistFavs(next);
      return next;
    });

  const finishIntro = () => {
    try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch {}
    setView('home');
  };

  const allItems = useMemo(() => categories.flatMap((c: any) => (c.items || [])), [categories]);
  const favItems = useMemo(() => allItems.filter((i: any) => favs.has(i.id)), [allItems, favs]);

  const popular = useMemo(() => {
    const promos = allItems.filter((i: any) => i.isPromo);
    const base = promos.length >= 3 ? promos : allItems;
    return base.slice(0, 8);
  }, [allItems]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return allItems.filter((i: any) =>
      i.name?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
  }, [q, allItems]);

  const openMeal = (p: any) => { setMeal(p); setView('meal'); };
  const quickAddOrOpen = (p: any, add: (x: any) => void) => {
    if (needsModal(p)) { openMeal(p); return; }
    add({ id: p.id, menuItemId: p.id, name: p.name, price: priceOf(p) });
  };
  const openCategory = (cat: any) => { setActiveCategory(cat); setView('category'); };

  const banners = locations[0]?.banners || [];
  const waNumber = (info.whatsappNumber || '').replace(/\D/g, '');

  const showChrome = TAB_VIEWS.includes(view);

  return (
    <div className="min-h-screen" style={{ background: BG, color: '#FFFFFF', fontFamily: 'Outfit, sans-serif' }}>
      {/* ── PANTALLAS DE TOMA COMPLETA ── */}
      {view === 'splash' && <Splash info={info} accent={accent} />}
      {view === 'onboarding' && <Onboarding accent={accent} onDone={() => setView('signin')} onSkip={finishIntro} />}
      {view === 'signin' && (
        <SignIn accent={accent} slug={slug} info={info} profileKey={PROFILE_KEY}
          onDone={(authed: boolean) => { try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch {} setAuthState(getAuth(slug)); setView(authed ? 'profile' : 'home'); }} />
      )}
      {view === 'meal' && meal && (
        <MealDetails product={meal} accent={accent} isFav={favs.has(meal.id)} onFav={() => toggleFav(meal.id)}
          onBack={() => setView('home')} onAdded={() => setView('cart')} />
      )}
      {view === 'checkout' && (
        <CheckoutScreen accent={accent} slug={slug} info={info} locations={locations}
          profileKey={PROFILE_KEY} onBack={() => setView('cart')}
          onDone={(o: any) => { setOrder(o); setView('done'); }} />
      )}
      {view === 'done' && order && (
        <OrderDone accent={accent} order={order} slug={slug} onClose={() => { setOrder(null); setView('home'); }} />
      )}

      {/* ── VISTAS CON HEADER + BOTTOM NAV ── */}
      {showChrome && (
        <div className="pb-32">
          {/* HEADER (solo en home y favoritos/categorías para mantener búsqueda accesible) */}
          {(view === 'home') && (
            <header className="sticky top-0 z-40 backdrop-blur-xl" style={{ background: `${BG}e6`, borderBottom: `1px solid ${BORDER}` }}>
              <div className="max-w-3xl mx-auto px-4 pt-4 pb-3">
                <div className="flex items-center gap-3 mb-3">
                  {info.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cldImage(info.logo, { width: 200 })} alt={info.name} loading="lazy" decoding="async" className="w-11 h-11 rounded-full object-cover shrink-0" style={{ border: `1.5px solid ${accent}` }} />
                  ) : (
                    <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold shrink-0" style={{ background: `${accent}22`, color: accent }}>{info.name.substring(0, 1)}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px]" style={{ color: MUTED }}>¿Qué se te antoja hoy?</p>
                    <h1 className="font-extrabold text-lg leading-none truncate" style={{ fontFamily: 'Syne, sans-serif' }}>{info.name || 'Mi Tienda'}</h1>
                  </div>
                  <button onClick={() => setView('cart')} className="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: INPUT }}>
                    <Bell className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3.5 h-11 rounded-full" style={{ background: INPUT }}>
                    <Search className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
                    <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar platillos…"
                      className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#7A7A82]" />
                    {query && <button onClick={() => setQuery('')} aria-label="Limpiar"><X className="w-4 h-4" style={{ color: MUTED }} /></button>}
                  </div>
                  <button className="w-11 h-11 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: accent }} aria-label="Filtros">
                    <SlidersHorizontal className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </header>
          )}

          {/* Encabezado simple para vistas de tab secundarias */}
          {(view === 'categories' || view === 'category' || view === 'cart' || view === 'profile' || view === 'favorites' || view === 'orders' || view === 'points') && (
            <div className="sticky top-0 z-40 backdrop-blur-xl" style={{ background: `${BG}e6`, borderBottom: `1px solid ${BORDER}` }}>
              <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
                {(view === 'category' || view === 'favorites' || view === 'orders' || view === 'points') ? (
                  <button onClick={() => setView(view === 'category' ? 'categories' : 'profile')} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: INPUT }}>
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                ) : null}
                <h2 className="text-lg font-extrabold flex-1 truncate" style={{ fontFamily: 'Syne, sans-serif' }}>
                  {view === 'categories' && 'Categorías'}
                  {view === 'category' && (activeCategory?.name || 'Categoría')}
                  {view === 'cart' && 'Mi carrito'}
                  {view === 'profile' && 'Perfil'}
                  {view === 'favorites' && 'Favoritos'}
                  {view === 'orders' && 'Mis pedidos'}
                  {view === 'points' && 'Mis puntos'}
                </h2>
                <button onClick={() => setView('cart')} className="relative w-9 h-9 rounded-full flex items-center justify-center" style={{ background: INPUT }}>
                  <ShoppingBag className="w-5 h-5" />
                  {quantity > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: accent }}>{quantity}</span>}
                </button>
              </div>
            </div>
          )}

          <main className="max-w-3xl mx-auto px-4 mt-4">
            {/* HOME */}
            {view === 'home' && (
              q ? (
                <SearchResults results={results} query={query} accent={accent} favs={favs} onFav={toggleFav} onOpen={openMeal} />
              ) : (
                <HomeBody
                  info={info} categories={categories} banners={banners} popular={popular} accent={accent}
                  favs={favs} onFav={toggleFav} onOpen={openMeal} onOpenCategory={openCategory}
                />
              )
            )}

            {/* CATEGORÍAS (grid) */}
            {view === 'categories' && (
              <div className="grid grid-cols-2 gap-3">
                {categories.map((cat: any) => (
                  <button key={cat.id} onClick={() => openCategory(cat)}
                    className="rounded-[22px] p-2.5 text-left active:scale-[0.98] transition-transform" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                    <div className="relative w-full aspect-[4/3] rounded-[16px] overflow-hidden mb-2.5" style={{ background: '#FFFFFF08' }}>
                      {cat.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cldImage(cat.imageUrl, { width: 256 })} alt={cat.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">🍽️</div>}
                    </div>
                    <h4 className="font-bold text-sm truncate">{cat.name}</h4>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[11px]" style={{ color: MUTED }}>{(cat.items || []).length} platillos</span>
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: accent }}><ChevronRight className="w-4 h-4" /></span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* CATEGORÍA → items */}
            {view === 'category' && activeCategory && (
              <div className="grid grid-cols-2 gap-3">
                {(activeCategory.items || []).map((p: any) => (
                  <ProductCard key={p.id} p={p} accent={accent} isFav={favs.has(p.id)} onFav={() => toggleFav(p.id)} onOpen={() => openMeal(p)} />
                ))}
                {(activeCategory.items || []).length === 0 && <p className="col-span-2 py-16 text-center" style={{ color: MUTED }}>Sin platillos en esta categoría.</p>}
              </div>
            )}

            {/* FAVORITOS */}
            {view === 'favorites' && (
              favItems.length === 0 ? (
                <div className="py-24 text-center" style={{ color: MUTED }}>
                  <Heart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold">Aún no tienes favoritos.</p>
                  <p className="text-xs mt-1">Toca el ❤ en un platillo para guardarlo.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {favItems.map((p: any) => (
                    <ProductCard key={p.id} p={p} accent={accent} isFav onFav={() => toggleFav(p.id)} onOpen={() => openMeal(p)} />
                  ))}
                </div>
              )
            )}

            {/* CARRITO */}
            {view === 'cart' && (
              <CartScreen accent={accent} minOrderAmount={info.minOrderAmount} onCheckout={() => setView('checkout')} onBrowse={() => setView('home')} onOpen={openMeal} allItems={allItems} />
            )}

            {/* PERFIL */}
            {view === 'profile' && (
              <ProfileScreen accent={accent} info={info} slug={slug} auth={auth} favCount={favItems.length}
                waNumber={waNumber} onFavorites={() => setView('favorites')} onOrders={() => setView('orders')}
                onPoints={() => setView('points')} onLogin={() => setView('signin')}
                onSignOut={() => { clearAuth(slug); setAuthState(null); }} />
            )}

            {/* MIS PEDIDOS */}
            {view === 'orders' && (
              <OrdersScreen accent={accent} slug={slug} auth={auth} onBrowse={() => setView('home')} onLogin={() => setView('signin')} />
            )}

            {/* MIS PUNTOS */}
            {view === 'points' && (
              <PointsScreen accent={accent} slug={slug} auth={auth} onLogin={() => setView('signin')} />
            )}
          </main>

          {/* BARRA FLOTANTE VER PEDIDO (no en carrito/checkout) */}
          {quantity > 0 && view !== 'cart' && (
            <div className="fixed bottom-[76px] left-4 right-4 z-40 max-w-md mx-auto">
              <button onClick={() => setView('cart')}
                className="w-full flex items-center justify-between px-5 py-3.5 rounded-[20px] font-bold text-white active:scale-95 transition-transform"
                style={{ background: accent, boxShadow: `0 12px 30px ${accent}66` }}>
                <span className="flex items-center gap-2 text-sm">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[12px]" style={{ background: '#00000033' }}>{quantity}</span>
                  Ver mi pedido
                </span>
                <span className="text-base font-extrabold">{fmt(total)}</span>
              </button>
            </div>
          )}

          {/* BOTTOM NAV */}
          <nav className="fixed bottom-0 inset-x-0 z-40" style={{ background: `${BG}f2`, borderTop: `1px solid ${BORDER}`, backdropFilter: 'blur(14px)' }}>
            <div className="max-w-3xl mx-auto px-8 h-[64px] flex items-center justify-between">
              <NavBtn icon={<Home className="w-5 h-5" />} label="Inicio" active={view === 'home'} accent={accent} onClick={() => { setQuery(''); setView('home'); }} />
              <NavBtn icon={<LayoutGrid className="w-5 h-5" />} label="Menú" active={view === 'categories' || view === 'category'} accent={accent} onClick={() => setView('categories')} />
              <NavBtn icon={<ShoppingBag className="w-5 h-5" />} label="Carrito" active={view === 'cart'} accent={accent} badge={quantity} onClick={() => setView('cart')} />
              <NavBtn icon={<User className="w-5 h-5" />} label="Perfil" active={view === 'profile' || view === 'favorites'} accent={accent} onClick={() => setView('profile')} />
            </div>
          </nav>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}` }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUBCOMPONENTES (module-scope para no perder estado en re-render del padre)
// ══════════════════════════════════════════════════════════════════════════════

function NavBtn({ icon, label, active, accent, badge, onClick }: any) {
  return (
    <button onClick={onClick} className="relative flex flex-col items-center gap-0.5" style={{ color: active ? accent : MUTED }}>
      <span className="relative">
        {icon}
        {badge > 0 && <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: accent }}>{badge}</span>}
      </span>
      <span className="text-[10px] font-semibold">{label}</span>
    </button>
  );
}

function ProductCard({ p, accent, isFav, onFav, onOpen }: any) {
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const line = lines.find(l => l.id === p.id);
  const price = priceOf(p);
  return (
    <article className="relative rounded-[22px] p-2.5 flex flex-col" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <button onClick={onOpen} className="relative w-full aspect-square rounded-[16px] overflow-hidden mb-2.5 block" style={{ background: '#FFFFFF08' }}>
        {p.isPromo && <span className="absolute top-2 left-2 z-10 text-[9px] font-bold px-2 py-1 rounded-full text-white" style={{ background: accent }}>OFERTA</span>}
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cldImage(p.imageUrl, { width: 480 })} alt={p.name} loading="lazy" decoding="async" className={`w-full h-full ${p.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
        ) : <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">{productEmoji(p.name)}</div>}
      </button>
      <button onClick={onFav} className="absolute top-4 right-4 z-10 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur" style={{ background: '#0A0A0Caa' }} aria-label="Favorito">
        <Heart className="w-4 h-4" style={{ color: isFav ? accent : '#FFFFFF' }} fill={isFav ? accent : 'none'} />
      </button>
      <button onClick={onOpen} className="text-left">
        <h4 className="font-bold text-sm leading-tight truncate">{p.name}</h4>
        {p.description && <p className="text-[11px] mt-0.5 line-clamp-1 leading-snug" style={{ color: FAINT }}>{p.description}</p>}
      </button>
      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex flex-col leading-none">
          {p.isPromo && <span className="text-[10px] line-through" style={{ color: '#FFFFFF40' }}>{fmt(p.price)}</span>}
          <span className="font-extrabold text-[15px]">{fmt(price)}</span>
        </div>
        {line ? (
          <div className="flex items-center gap-1 rounded-full px-1 py-1" style={{ background: INPUT }}>
            <button onClick={() => remove(p.id)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: '#FFFFFFcc' }}><Minus className="w-3.5 h-3.5" /></button>
            <span className="text-sm font-bold w-4 text-center">{line.quantity}</span>
            <button onClick={() => add({ id: p.id, menuItemId: p.id, name: p.name, price })} className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: accent }}><Plus className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => (needsModal(p) ? onOpen() : add({ id: p.id, menuItemId: p.id, name: p.name, price }))}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
            style={{ background: accent, boxShadow: `0 6px 16px ${accent}55` }} aria-label={`Agregar ${p.name}`}>
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>
    </article>
  );
}

function SearchResults({ results, query, accent, favs, onFav, onOpen }: any) {
  return (
    <section>
      <h3 className="text-base font-extrabold mb-3">{results.length > 0 ? `Resultados (${results.length})` : 'Sin resultados'}</h3>
      {results.length === 0 ? (
        <p className="text-sm py-10 text-center" style={{ color: MUTED }}>No encontramos “{query}”. Prueba con otro nombre.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {results.map((p: any) => <ProductCard key={p.id} p={p} accent={accent} isFav={favs.has(p.id)} onFav={() => onFav(p.id)} onOpen={() => onOpen(p)} />)}
        </div>
      )}
    </section>
  );
}

function HomeBody({ info, categories, banners, popular, accent, favs, onFav, onOpen, onOpenCategory }: any) {
  const add = useCart(s => s.add);
  const lines = useCart(s => s.lines);
  return (
    <>
      {/* BANNER / BEST SELLER */}
      {banners.length > 0 ? (
        <div className="mb-6"><BannerCarousel banners={banners} variant="dark" accent={accent} /></div>
      ) : popular[0] && (
        <button onClick={() => onOpen(popular[0])} className="w-full mb-6 flex items-center gap-3 p-3 rounded-[24px] text-left active:scale-[0.99] transition-transform" style={{ background: accent }}>
          <div className="flex-1 pl-2 text-white">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full mb-2" style={{ background: '#00000026' }}><Flame className="w-3 h-3" /> Más vendido</span>
            <h3 className="text-lg font-extrabold leading-tight">{popular[0].name}</h3>
            <p className="text-xs opacity-90 line-clamp-1">{popular[0].description || '¡Pídelo ahora!'}</p>
            <span className="inline-block mt-2 text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: '#0A0A0C', color: '#FFFFFF' }}>Pedir ahora</span>
          </div>
          {popular[0].imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cldImage(popular[0].imageUrl, { width: 256 })} alt={popular[0].name} loading="lazy" decoding="async" className={`w-28 h-28 rounded-[18px] shrink-0 ${popular[0].imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
          )}
        </button>
      )}

      {/* CATEGORÍAS (fila) */}
      {categories.length > 1 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-extrabold">Categorías</h3>
            <button onClick={() => onOpenCategory(categories[0])} className="text-xs font-semibold" style={{ color: accent }}>Ver más</button>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1">
            {categories.map((cat: any) => (
              <button key={cat.id} onClick={() => onOpenCategory(cat)} className="shrink-0 flex flex-col items-center gap-1.5 w-[68px]">
                <span className="w-16 h-16 rounded-[20px] flex items-center justify-center overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  {cat.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cldImage(cat.imageUrl, { width: 256 })} alt={cat.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  ) : <span className="text-2xl">🍽️</span>}
                </span>
                <span className="text-[11px] font-semibold text-center leading-tight line-clamp-1 w-full">{cat.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* LO MÁS PEDIDO */}
      {popular.length > 0 && (
        <section className="mb-7">
          <div className="flex items-center justify-between mb-3"><h3 className="text-base font-extrabold">Lo más pedido</h3></div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
            {popular.map((p: any) => {
              const line = lines.find((l: any) => l.id === p.id);
              const price = priceOf(p);
              return (
                <button key={p.id} onClick={() => onOpen(p)} className="shrink-0 w-[240px] flex items-center gap-3 p-2.5 rounded-[20px] text-left" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <div className="w-16 h-16 rounded-[14px] overflow-hidden shrink-0" style={{ background: '#FFFFFF08' }}>
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cldImage(p.imageUrl, { width: 480 })} alt={p.name} loading="lazy" decoding="async" className={`w-full h-full ${p.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
                    ) : <div className="w-full h-full flex items-center justify-center text-xl opacity-30">{productEmoji(p.name)}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm truncate">{p.name}</h4>
                    <p className="text-[11px] truncate" style={{ color: FAINT }}>{p.description || ''}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="font-extrabold text-sm">{fmt(price)}</span>
                      <span onClick={(e) => { e.stopPropagation(); needsModal(p) ? onOpen(p) : add({ id: p.id, menuItemId: p.id, name: p.name, price }); }}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: accent }}>
                        <Plus className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* SECCIONES POR CATEGORÍA */}
      {categories.map((category: any) => (
        (category.items || []).length > 0 && (
          <section key={category.id} className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-extrabold">{category.name}</h3>
              <button onClick={() => onOpenCategory(category)} className="text-xs font-semibold" style={{ color: accent }}>Ver todo</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(category.items || []).map((p: any) => (
                <ProductCard key={p.id} p={p} accent={accent} isFav={favs.has(p.id)} onFav={() => onFav(p.id)} onOpen={() => onOpen(p)} />
              ))}
            </div>
          </section>
        )
      ))}

      {categories.every((c: any) => (c.items || []).length === 0) && (
        <div className="py-20 text-center" style={{ color: MUTED }}>
          <span className="text-4xl block mb-3 opacity-40">🍽️</span>
          <p className="font-semibold">Aún no hay platillos disponibles.</p>
        </div>
      )}
    </>
  );
}

// ── SPLASH ────────────────────────────────────────────────────────────────────
function Splash({ info, accent }: { info: Info; accent: string }) {
  return (
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center" style={{ background: BG }}>
      <div className="animate-pulse flex flex-col items-center">
        {info.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cldImage(info.logo, { width: 256 })} alt={info.name} loading="lazy" decoding="async" className="w-24 h-24 rounded-[28px] object-cover mb-4" style={{ border: `2px solid ${accent}` }} />
        ) : (
          <div className="w-24 h-24 rounded-[28px] flex items-center justify-center mb-4" style={{ background: `${accent}1f` }}>
            <UtensilsCrossed className="w-12 h-12" style={{ color: accent }} />
          </div>
        )}
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: 'Syne, sans-serif', color: accent }}>{info.name || 'Mi Tienda'}</h1>
      </div>
    </div>
  );
}

// ── ONBOARDING ──────────────────────────────────────────────────────────────
function Onboarding({ accent, onDone, onSkip }: { accent: string; onDone: () => void; onSkip: () => void }) {
  const slides = [
    { icon: <UtensilsCrossed className="w-20 h-20" />, title: 'Elige tu antojo', text: 'Descubre platillos deliciosos en unos cuantos toques.' },
    { icon: <BadgePercent className="w-20 h-20" />, title: 'Ofertas especiales', text: 'Aprovecha promociones y descuentos en tus favoritos.' },
    { icon: <Navigation className="w-20 h-20" />, title: 'Sigue tu pedido', text: 'Conoce el estado de tu orden en tiempo real, hasta tu puerta.' },
  ];
  const [i, setI] = useState(0);
  const last = i === slides.length - 1;
  return (
    <div className="fixed inset-0 z-[120] flex flex-col" style={{ background: BG }}>
      <div className="flex justify-end p-5">
        <button onClick={onSkip} className="text-sm font-semibold px-4 py-1.5 rounded-full" style={{ background: INPUT, color: '#fff' }}>Saltar</button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-56 h-56 rounded-[40px] flex items-center justify-center mb-10" style={{ background: accent, color: '#fff' }}>{slides[i].icon}</div>
        <h2 className="text-2xl font-extrabold mb-3" style={{ fontFamily: 'Syne, sans-serif' }}>{slides[i].title}</h2>
        <p className="text-sm max-w-xs leading-relaxed" style={{ color: MUTED }}>{slides[i].text}</p>
      </div>
      <div className="flex items-center justify-center gap-2 mb-8">
        {slides.map((_, idx) => (
          <span key={idx} className="h-1.5 rounded-full transition-all" style={{ width: idx === i ? 22 : 7, background: idx === i ? accent : '#FFFFFF30' }} />
        ))}
      </div>
      <div className="flex items-center justify-between px-6 pb-10">
        <button onClick={onSkip} className="px-5 py-3 rounded-full text-sm font-bold" style={{ background: INPUT }}>Skip</button>
        <button onClick={() => (last ? onDone() : setI(i + 1))} className="px-7 py-3 rounded-full text-sm font-bold text-white" style={{ background: accent }}>
          {last ? 'Empezar' : 'Siguiente'}
        </button>
      </div>
    </div>
  );
}

// ── SIGN IN / SIGN UP (cuenta real, correo + contraseña) ──────────────────────
function SignIn({ accent, slug, info, profileKey, onDone }: { accent: string; slug: string; info: Info; profileKey: string; onDone: (authed: boolean) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try { const raw = localStorage.getItem(profileKey); if (raw) { const p = JSON.parse(raw); setName(p.name || ''); setPhone(p.phone || ''); } } catch {}
  }, [profileKey]);

  const submit = async () => {
    setError('');
    if (!email.trim() || !password) { setError('Correo y contraseña son requeridos.'); return; }
    if (mode === 'register' && !name.trim()) { setError('Tu nombre es requerido.'); return; }
    if (mode === 'register' && password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    setBusy(true);
    try {
      const customer = mode === 'register'
        ? await registerCustomer(slug, { name: name.trim(), email: email.trim(), password, phone: phone.trim() || undefined })
        : await loginCustomer(slug, email.trim(), password);
      // Sincronizamos el perfil local (checkout) con la cuenta.
      try {
        const raw = localStorage.getItem(profileKey); const prev = raw ? JSON.parse(raw) : {};
        localStorage.setItem(profileKey, JSON.stringify({ ...prev, name: customer.name, phone: customer.phone || prev.phone || '' }));
      } catch {}
      onDone(true);
    } catch (e: any) { setError(e?.message || 'No se pudo continuar.'); }
    finally { setBusy(false); }
  };

  const field = 'w-full px-4 h-12 rounded-2xl outline-none text-sm';
  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto" style={{ background: BG }}>
      <div className="max-w-sm mx-auto px-6 py-10">
        <div className="flex justify-end mb-6">
          <button onClick={() => onDone(false)} className="text-sm font-semibold px-4 py-1.5 rounded-full" style={{ background: INPUT }}>Entrar como invitado</button>
        </div>
        <div className="flex flex-col items-center mb-7">
          {info.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cldImage(info.logo, { width: 200 })} alt={info.name} loading="lazy" decoding="async" className="w-16 h-16 rounded-2xl object-cover mb-3" style={{ border: `1.5px solid ${accent}` }} />
          ) : <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ background: `${accent}1f` }}><User className="w-8 h-8" style={{ color: accent }} /></div>}
          <h1 className="text-2xl font-extrabold" style={{ fontFamily: 'Syne, sans-serif' }}>{mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}</h1>
          <p className="text-sm mt-1 text-center" style={{ color: MUTED }}>Guarda tus pedidos y acumula puntos en {info.name}</p>
        </div>

        {/* Toggle login/register */}
        <div className="flex p-1 rounded-full mb-5" style={{ background: INPUT }}>
          {(['login', 'register'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }} className="flex-1 py-2 rounded-full text-sm font-bold transition-all"
              style={mode === m ? { background: accent, color: '#fff' } : { color: MUTED }}>
              {m === 'login' ? 'Entrar' : 'Registrarme'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mode === 'register' && (
            <div className="flex items-center gap-2 px-4 h-12 rounded-2xl" style={{ background: INPUT }}>
              <User className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
              <input className="flex-1 bg-transparent outline-none text-sm" value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" />
            </div>
          )}
          <div className="flex items-center gap-2 px-4 h-12 rounded-2xl" style={{ background: INPUT }}>
            <Mail className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
            <input className="flex-1 bg-transparent outline-none text-sm" value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo" inputMode="email" autoCapitalize="none" />
          </div>
          {mode === 'register' && (
            <div className="flex items-center gap-2 px-4 h-12 rounded-2xl" style={{ background: INPUT }}>
              <Navigation className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
              <input className="flex-1 bg-transparent outline-none text-sm" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono (opcional)" inputMode="tel" />
            </div>
          )}
          <div className="flex items-center gap-2 px-4 h-12 rounded-2xl" style={{ background: INPUT }}>
            <Lock className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
            <input type={showPass ? 'text' : 'password'} className="flex-1 bg-transparent outline-none text-sm" value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña" />
            <button onClick={() => setShowPass(s => !s)} className="text-[11px] font-bold" style={{ color: accent }}>{showPass ? 'Ocultar' : 'Ver'}</button>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs font-bold mt-3">{error}</p>}

        <button onClick={submit} disabled={busy} className="w-full mt-5 py-4 rounded-2xl font-bold text-white active:scale-95 transition-transform disabled:opacity-60" style={{ background: accent }}>
          {busy ? 'Procesando…' : mode === 'register' ? 'Crear mi cuenta' : 'Entrar'}
        </button>

        <p className="text-center text-xs mt-6" style={{ color: MUTED }}>
          {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="font-bold" style={{ color: accent }}>
            {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </p>
      </div>
    </div>
  );
}

// ── DETALLE DE PLATILLO ───────────────────────────────────────────────────────
function MealDetails({ product, accent, isFav, onFav, onBack, onAdded }: any) {
  const add = useCart(s => s.add);
  const variants: any[] = product.variants || [];
  const groups: any[] = product.modifierGroups || [];
  const complements: any[] = product.complements || [];
  const basePromo = priceOf(product);

  const [variantId, setVariantId] = useState<string | null>(variants[0]?.id ?? null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [selComplements, setSelComplements] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const basePrice = variantId ? (variants.find(v => v.id === variantId)?.price ?? basePromo) : basePromo;
  const allMods = useMemo(() => groups.flatMap(g => g.modifiers), [groups]);
  const modifiersAdd = useMemo(() => Object.values(selected).flat().reduce((s, id) => s + (allMods.find(m => m.id === id)?.priceAdd || 0), 0), [selected, allMods]);
  const complementsAdd = useMemo(() => selComplements.reduce((s, id) => s + (complements.find(c => c.id === id)?.price || 0), 0), [selComplements, complements]);
  const unitPrice = basePrice + modifiersAdd + complementsAdd;

  const toggleMod = (g: any, modId: string) => {
    setError('');
    setSelected(prev => {
      const cur = prev[g.id] || [];
      if (g.multiSelect) {
        if (cur.includes(modId)) return { ...prev, [g.id]: cur.filter(x => x !== modId) };
        if (g.maxSelection && g.maxSelection > 0 && cur.length >= g.maxSelection) return prev;
        return { ...prev, [g.id]: [...cur, modId] };
      }
      return { ...prev, [g.id]: cur.includes(modId) ? [] : [modId] };
    });
  };
  const toggleComp = (id: string) => { setError(''); setSelComplements(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); };

  const handleAdd = () => {
    for (const g of groups) {
      const cur = selected[g.id] || [];
      if (g.required && cur.length === 0) { setError(`Selecciona una opción en "${g.name}".`); return; }
      if (g.minSelection && g.minSelection > 0 && cur.length < g.minSelection) { setError(`Elige al menos ${g.minSelection} en "${g.name}".`); return; }
    }
    const modifierIds = Object.values(selected).flat();
    const complementPayloadIds = selComplements.map(id => `complement:${id}`);
    const payloadIds = [...modifierIds, ...complementPayloadIds];
    const variantName = variantId ? variants.find(v => v.id === variantId)?.name : null;
    const modNames = modifierIds.map(id => allMods.find(m => m.id === id)?.name).filter(Boolean);
    const compNames = selComplements.map(id => complements.find(c => c.id === id)?.name).filter(Boolean);
    const extraNames = [...modNames, ...compNames];
    const displayName = [product.name, variantName ? `(${variantName})` : '', extraNames.length ? `· ${extraNames.join(', ')}` : ''].filter(Boolean).join(' ');
    const key = `${product.id}|${variantId || ''}|${[...payloadIds].sort().join(',')}`;
    add({ id: key, menuItemId: product.id, name: displayName, price: unitPrice, variantId, modifierIds: payloadIds, quantity: qty });
    onAdded();
  };

  const longDesc = (product.description || '').length > 110;
  const optRow = (on: boolean, label: string, priceAdd: number, multi: boolean, onClick: () => void) => (
    <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all"
      style={{ borderColor: on ? accent : '#FFFFFF14', background: on ? `${accent}14` : 'transparent' }}>
      <span className="font-semibold text-sm flex items-center gap-2.5">
        <span className={`w-4 h-4 ${multi ? 'rounded-md' : 'rounded-full'} border-2 flex items-center justify-center`} style={{ borderColor: on ? accent : '#FFFFFF40', background: on ? accent : 'transparent' }}>
          {on && <Check className="w-3 h-3 text-white" />}
        </span>
        {label}
      </span>
      {priceAdd > 0 && <span className="text-sm font-bold" style={{ color: MUTED }}>+{fmt(priceAdd)}</span>}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[115] overflow-y-auto pb-28" style={{ background: BG }}>
      {/* Hero */}
      <div className="relative w-full h-72">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cldImage(product.imageUrl, { width: 800 })} alt={product.name} loading="lazy" decoding="async" className={`w-full h-full ${product.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
        ) : <div className="w-full h-full flex items-center justify-center text-6xl opacity-20" style={{ background: CARD }}>{productEmoji(product.name)}</div>}
        <div className="absolute inset-x-0 bottom-0 h-24" style={{ background: `linear-gradient(to top, ${BG}, transparent)` }} />
        <button onClick={onBack} className="absolute top-5 left-4 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur" style={{ background: '#0A0A0Caa' }}><ChevronLeft className="w-5 h-5" /></button>
        <button onClick={onFav} className="absolute top-5 right-4 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur" style={{ background: '#0A0A0Caa' }}>
          <Heart className="w-5 h-5" style={{ color: isFav ? accent : '#fff' }} fill={isFav ? accent : 'none'} />
        </button>
      </div>

      <div className="max-w-lg mx-auto px-5 -mt-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-extrabold leading-tight" style={{ fontFamily: 'Syne, sans-serif' }}>{product.name}</h1>
          <div className="flex items-center gap-1 rounded-full px-1.5 py-1.5 shrink-0" style={{ background: INPUT }}>
            <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-full flex items-center justify-center"><Minus className="w-4 h-4" /></button>
            <span className="w-6 text-center font-bold">{qty}</span>
            <button onClick={() => setQty(q => q + 1)} className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: accent }}><Plus className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Chips reales (no inventamos cal/rating) */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Chip icon={<Tag className="w-3.5 h-3.5" />} text={fmt(basePromo)} accent={accent} solid />
          {product.isPromo && <Chip icon={<Flame className="w-3.5 h-3.5" />} text="Oferta" accent={accent} />}
          {variants.length > 0 && <Chip icon={<Star className="w-3.5 h-3.5" />} text={`${variants.length} opciones`} accent={accent} />}
        </div>

        {product.description && (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: MUTED }}>Descripción</p>
            <p className="text-sm leading-relaxed" style={{ color: '#FFFFFFcc' }}>
              {longDesc && !expanded ? `${product.description.slice(0, 110)}…` : product.description}
              {longDesc && <button onClick={() => setExpanded(e => !e)} className="ml-1 font-bold" style={{ color: accent }}>{expanded ? 'Leer menos' : 'Leer más'}</button>}
            </p>
          </div>
        )}

        {/* Variantes */}
        {variants.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: MUTED }}>Tamaño / Opción</p>
            <div className="space-y-2">
              {variants.map(v => optRow(variantId === v.id, v.name, v.price, false, () => setVariantId(v.id)))}
            </div>
          </div>
        )}

        {/* Modificadores */}
        {groups.map((g: any) => (
          <div key={g.id} className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: MUTED }}>{g.name}</p>
              <span className="text-[10px] font-bold" style={{ color: MUTED }}>{g.required ? 'Obligatorio' : 'Opcional'}{g.multiSelect && g.maxSelection ? ` · máx ${g.maxSelection}` : ''}</span>
            </div>
            <div className="space-y-2">
              {g.modifiers.map((m: any) => optRow((selected[g.id] || []).includes(m.id), m.name, m.priceAdd, !!g.multiSelect, () => toggleMod(g, m.id)))}
            </div>
          </div>
        ))}

        {/* Extras / complementos */}
        {complements.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: MUTED }}>Extras / Acompañamientos</p>
            <div className="space-y-2">
              {complements.map((c: any) => optRow(selComplements.includes(c.id), c.name, c.price, true, () => toggleComp(c.id)))}
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-xs font-bold mt-4">{error}</p>}
      </div>

      {/* Barra sticky: total + agregar */}
      <div className="fixed bottom-0 inset-x-0 z-10 backdrop-blur-xl" style={{ background: `${BG}f2`, borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-lg mx-auto px-5 py-3.5 flex items-center gap-4">
          <div className="leading-none">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Total</p>
            <p className="text-xl font-extrabold mt-1">{fmt(unitPrice * qty)}</p>
          </div>
          <button onClick={handleAdd} className="flex-1 py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-transform" style={{ background: accent, boxShadow: `0 8px 24px ${accent}55` }}>
            <ShoppingBag className="w-5 h-5" /> Agregar al carrito
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, text, accent, solid }: any) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
      style={solid ? { background: accent, color: '#fff' } : { background: INPUT, color: '#FFFFFFcc' }}>
      {icon}{text}
    </span>
  );
}

// ── CARRITO ───────────────────────────────────────────────────────────────────
function CartScreen({ accent, minOrderAmount = 0, onCheckout, onBrowse, onOpen, allItems }: any) {
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const total = useCart(s => s.total());
  const belowMin = minOrderAmount > 0 && total < minOrderAmount;

  if (lines.length === 0) {
    return (
      <div className="py-24 text-center" style={{ color: MUTED }}>
        <ShoppingBag className="w-14 h-14 mx-auto mb-4 opacity-25" />
        <p className="font-bold text-base mb-1">Tu carrito está vacío</p>
        <p className="text-xs mb-6">Agrega platillos para empezar tu pedido.</p>
        <button onClick={onBrowse} className="px-6 py-3 rounded-full font-bold text-white" style={{ background: accent }}>Ver el menú</button>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-3">
        {lines.map((l: any) => {
          const src = allItems.find((p: any) => p.id === l.menuItemId);
          return (
            <div key={l.id} className="flex items-center gap-3 p-2.5 rounded-[20px]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="w-16 h-16 rounded-[14px] overflow-hidden shrink-0" style={{ background: '#FFFFFF08' }}>
                {src?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cldImage(src.imageUrl, { width: 256 })} alt={l.name} loading="lazy" decoding="async" className={`w-full h-full ${src.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
                ) : <div className="w-full h-full flex items-center justify-center text-xl opacity-30">{productEmoji(l.name)}</div>}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm truncate">{l.name}</h4>
                <p className="text-sm font-extrabold mt-0.5" style={{ color: accent }}>{fmt(l.price)}</p>
              </div>
              <div className="flex items-center gap-1 rounded-full px-1 py-1" style={{ background: INPUT }}>
                <button onClick={() => remove(l.id)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: '#FFFFFFcc' }}>
                  {l.quantity > 1 ? <Minus className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
                <span className="text-sm font-bold w-4 text-center">{l.quantity}</span>
                <button onClick={() => add({ id: l.id, menuItemId: l.menuItemId, name: l.name, price: l.price, variantId: l.variantId, modifierIds: l.modifierIds })} className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: accent }}><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Resumen */}
      <div className="mt-6 p-4 rounded-[22px]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between text-sm mb-2" style={{ color: MUTED }}>
          <span>Subtotal</span><span className="font-bold text-white">{fmt(total)}</span>
        </div>
        <div className="flex items-center justify-between text-sm mb-3" style={{ color: MUTED }}>
          <span>Envío</span><span>Se calcula al pagar</span>
        </div>
        <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <span className="font-bold">Total</span>
          <span className="text-2xl font-extrabold">{fmt(total)}</span>
        </div>
      </div>

      {belowMin && <p className="text-amber-400 text-xs font-bold mt-3 text-center">Pedido mínimo: {fmt(minOrderAmount)}.</p>}

      <button onClick={onCheckout} disabled={belowMin}
        className="w-full mt-5 py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
        style={{ background: accent, boxShadow: `0 8px 24px ${accent}55` }}>
        Continuar al pago <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

// ── CHECKOUT (lógica real de envío de orden) ──────────────────────────────────
type OrderType = 'DELIVERY' | 'TAKEOUT' | 'DINE_IN';

function CheckoutScreen({ accent, slug, info, locations, profileKey, onBack, onDone }: any) {
  const lines = useCart(s => s.lines);
  const total = useCart(s => s.total());
  const clear = useCart(s => s.clear);
  const delivery = info.delivery as DeliveryConfig | undefined;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geo, setGeo] = useState<'' | 'loading' | 'ok' | 'error'>('');
  const [orderType, setOrderType] = useState<OrderType>('DELIVERY');
  const [tableNumber, setTableNumber] = useState('');
  const [locationId, setLocationId] = useState<string>(locations[0]?.id || '');
  const [payment, setPayment] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE'>('CASH');
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponMsg, setCouponMsg] = useState('');
  const [tipPct, setTipPct] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const [usePoints, setUsePoints] = useState(false);

  const selectedLocation = locations.find((l: any) => l.id === locationId) || locations[0] || null;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(profileKey);
      if (raw) { const p = JSON.parse(raw); setName(p.name || ''); setPhone(p.phone || ''); setAddress(p.address || ''); if (p.coords?.lat) setCoords(p.coords); }
    } catch {}
  }, [profileKey]);

  // Saldo de puntos del cliente logueado, para ofrecer el canje en el checkout.
  useEffect(() => {
    if (!getAuth(slug)) return;
    let stop = false;
    fetchMyLoyalty(slug).then(l => { if (!stop) setLoyalty(l); }).catch(() => {});
    return () => { stop = true; };
  }, [slug]);

  const allowed: OrderType[] = useMemo(() => {
    const l = selectedLocation; const a: OrderType[] = [];
    if (!l || l.hasDelivery !== false) a.push('DELIVERY');
    if (!l || l.hasTakeaway !== false) a.push('TAKEOUT');
    if (!l || l.hasTableMap !== false) a.push('DINE_IN');
    return a.length ? a : ['DELIVERY'];
  }, [selectedLocation]);
  useEffect(() => { if (!allowed.includes(orderType)) setOrderType(allowed[0]); }, [allowed]); // eslint-disable-line

  const isDelivery = orderType === 'DELIVERY';
  const preview = useMemo(() => computeDeliveryPreview(delivery, total, coords), [delivery, total, coords]);
  const needsLoc = isDelivery && delivery?.mode === 'DISTANCE' && !!delivery?.origin && !coords;
  const deliveryFee = isDelivery ? (preview.outOfRange ? 0 : preview.fee) : 0;
  const tip = Math.round(total * (tipPct / 100));
  const discount = coupon?.discount || 0;
  // Canje de puntos → descuento (tope: lo cobrable de productos). El backend
  // re-valida y es la fuente de verdad; aquí solo estimamos para mostrar.
  const ppv = loyalty?.pointsValuePesos || 0;
  const pointsAvail = loyalty?.points || 0;
  const pointsDiscount = (usePoints && ppv > 0)
    ? Math.round(Math.min(pointsAvail * ppv, Math.max(0, total - discount)) * 100) / 100
    : 0;
  const grand = Math.max(0, total - discount - pointsDiscount + deliveryFee + tip);
  const minOrderAmount = info.minOrderAmount || 0;
  const belowMin = minOrderAmount > 0 && total < minOrderAmount;

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeo('error'); return; }
    setGeo('loading');
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeo('ok'); },
      () => setGeo('error'), { enableHighAccuracy: true, timeout: 10000 });
  };

  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase(); if (!code) return; setCouponMsg('');
    try {
      const res = await fetch(`${API}/api/store/coupon/validate?r=${encodeURIComponent(slug)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, orderAmount: total }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.valid) { setCoupon({ code, discount: d.discount }); setCouponMsg(''); }
      else { setCoupon(null); setCouponMsg(d?.error || 'Cupón no válido'); }
    } catch { setCouponMsg('No se pudo validar el cupón'); }
  };

  const submit = async () => {
    setError('');
    if (!name.trim()) { setError('Tu nombre es requerido.'); return; }
    if (isDelivery && !address.trim()) { setError('La dirección de entrega es requerida.'); return; }
    if (orderType === 'DINE_IN' && !tableNumber.trim()) { setError('Indica el número de mesa.'); return; }
    if (belowMin) { setError(`El pedido mínimo es de ${fmt(minOrderAmount)}.`); return; }
    if (isDelivery && preview.outOfRange) { setError('Tu ubicación está fuera del área de cobertura.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/store/orders?r=${encodeURIComponent(slug)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader(slug) },
        body: JSON.stringify({
          customerName: name, customerPhone: phone, orderType,
          deliveryAddress: isDelivery ? address : undefined,
          deliveryLat: isDelivery ? (coords?.lat ?? null) : null,
          deliveryLng: isDelivery ? (coords?.lng ?? null) : null,
          tableNumber: orderType === 'DINE_IN' ? Number(tableNumber) : undefined,
          locationId: locationId || selectedLocation?.id,
          paymentMethod: payment === 'ONLINE' ? 'CARD' : payment,
          tip, couponCode: coupon?.code || undefined,
          redeemPoints: usePoints ? pointsAvail : 0,
          items: lines.map((l: any) => ({ menuItemId: l.menuItemId, variantId: l.variantId || undefined, modifierIds: l.modifierIds || [], quantity: l.quantity })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d?.error || 'No se pudo enviar el pedido.'); setSubmitting(false); return; }

      try { localStorage.setItem(profileKey, JSON.stringify({ name: name.trim(), phone: phone.trim(), address: address.trim(), coords })); } catch {}

      if (payment === 'ONLINE') {
        try {
          const payRes = await fetch(`${API}/api/store/payment/create?r=${encodeURIComponent(slug)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: d.id, returnUrl: typeof window !== 'undefined' ? window.location.origin + '/' : undefined }),
          });
          const pay = await payRes.json().catch(() => ({}));
          if (payRes.ok && pay.checkoutUrl) { clear(); window.location.href = pay.checkoutUrl; return; }
        } catch {}
      }
      clear();
      onDone(d);
    } catch { setError('Error de red al enviar el pedido.'); }
    finally { setSubmitting(false); }
  };

  const field = 'w-full px-4 h-12 rounded-2xl outline-none text-sm';
  const chip = (on: boolean) => ({ borderColor: on ? accent : '#FFFFFF14', background: on ? `${accent}14` : 'transparent', color: on ? accent : MUTED });
  const onlinePayment = !!info.onlinePayment;

  return (
    <div className="fixed inset-0 z-[115] overflow-y-auto pb-32" style={{ background: BG }}>
      <div className="sticky top-0 z-10 backdrop-blur-xl" style={{ background: `${BG}e6`, borderBottom: `1px solid ${BORDER}` }}>
        <div className="max-w-lg mx-auto px-4 h-16 flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: INPUT }}><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-lg font-extrabold" style={{ fontFamily: 'Syne, sans-serif' }}>Finalizar compra</h2>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-5 space-y-6">
        {/* Tipo de pedido */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: MUTED }}>Tipo de pedido</p>
          <div className="grid grid-cols-3 gap-2">
            {([['DELIVERY', '🛵 Domicilio'], ['TAKEOUT', '🥡 Para llevar'], ['DINE_IN', '🍽 En mesa']] as [OrderType, string][])
              .filter(([t]) => allowed.includes(t)).map(([t, label]) => (
                <button key={t} onClick={() => setOrderType(t)} className="py-3 rounded-2xl text-xs font-bold border-2 transition-all" style={chip(orderType === t)}>{label}</button>
              ))}
          </div>
        </div>

        {/* Dirección (delivery) */}
        {isDelivery && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: MUTED }}>Dirección de entrega</p>
            <div className="rounded-2xl p-3 flex items-start gap-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: `${accent}20`, color: accent }}><MapPin className="w-4 h-4" /></span>
              <textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Calle, número, colonia, referencias…" className="flex-1 bg-transparent outline-none text-sm resize-none h-16 placeholder:text-[#7A7A82]" />
            </div>
            {delivery?.mode === 'DISTANCE' && (
              <button onClick={useMyLocation} className="w-full mt-2 py-3 rounded-2xl font-bold text-sm border-2" style={{ borderColor: coords ? '#88D66C' : accent, color: coords ? '#88D66C' : accent }}>
                {geo === 'loading' ? 'Obteniendo ubicación…' : coords ? '✓ Ubicación detectada — actualizar' : '📍 Usar mi ubicación para el envío'}
              </button>
            )}
          </div>
        )}

        {orderType === 'DINE_IN' && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: MUTED }}>Número de mesa</p>
            <input className={field} style={{ background: INPUT }} value={tableNumber} onChange={e => setTableNumber(e.target.value)} placeholder="Ej. 5" inputMode="numeric" />
          </div>
        )}

        {/* Datos */}
        <div className="space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: MUTED }}>Tus datos</p>
          <input className={field} style={{ background: INPUT }} value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" />
          <input className={field} style={{ background: INPUT }} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Tu teléfono" inputMode="tel" />
        </div>

        {locations.length > 1 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: MUTED }}>Sucursal</p>
            <select value={locationId} onChange={e => setLocationId(e.target.value)} className={field} style={{ background: INPUT }}>
              {locations.map((l: any) => <option key={l.id} value={l.id} style={{ background: CARD }}>{l.name}</option>)}
            </select>
          </div>
        )}

        {/* Método de pago */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: MUTED }}>Método de pago</p>
          <div className="space-y-2">
            {([['CASH', 'Efectivo', <Banknote key="c" className="w-4 h-4" />], ['CARD', 'Tarjeta al recibir', <CreditCard key="t" className="w-4 h-4" />], ['TRANSFER', 'Transferencia', <Building2 key="b" className="w-4 h-4" />]] as any[]).map(([m, label, icon]) => (
              <button key={m} onClick={() => setPayment(m)} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all" style={chip(payment === m)}>
                <span style={{ color: payment === m ? accent : '#fff' }}>{icon}</span>
                <span className="font-semibold text-sm flex-1 text-left" style={{ color: payment === m ? accent : '#fff' }}>{label}</span>
                <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center" style={{ borderColor: payment === m ? accent : '#FFFFFF40', background: payment === m ? accent : 'transparent' }}>{payment === m && <Check className="w-3 h-3 text-white" />}</span>
              </button>
            ))}
            {onlinePayment && (
              <button onClick={() => setPayment('ONLINE')} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all" style={chip(payment === 'ONLINE')}>
                <span style={{ color: payment === 'ONLINE' ? accent : '#fff' }}><CreditCard className="w-4 h-4" /></span>
                <span className="font-semibold text-sm flex-1 text-left" style={{ color: payment === 'ONLINE' ? accent : '#fff' }}>Pagar ahora con tarjeta (en línea)</span>
                <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center" style={{ borderColor: payment === 'ONLINE' ? accent : '#FFFFFF40', background: payment === 'ONLINE' ? accent : 'transparent' }}>{payment === 'ONLINE' && <Check className="w-3 h-3 text-white" />}</span>
              </button>
            )}
          </div>
        </div>

        {/* Cupón */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: MUTED }}>Cupón</p>
          {coupon ? (
            <div className="flex items-center justify-between px-4 py-3 rounded-2xl" style={{ background: '#88D66C18', border: '1px solid #88D66C40' }}>
              <span className="text-sm font-bold" style={{ color: '#88D66C' }}>✓ {coupon.code} · −{fmt(coupon.discount)}</span>
              <button onClick={() => { setCoupon(null); setCouponCode(''); }} className="text-xs font-bold" style={{ color: '#88D66C' }}>Quitar</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input className={`${field} flex-1`} style={{ background: INPUT }} value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="Código" />
              <button onClick={applyCoupon} className="px-5 rounded-2xl font-bold text-sm text-white" style={{ background: accent }}>Aplicar</button>
            </div>
          )}
          {couponMsg && <p className="text-amber-400 text-xs font-bold mt-1.5">{couponMsg}</p>}
        </div>

        {/* Canje de puntos */}
        {loyalty && pointsAvail > 0 && ppv > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: MUTED }}>Mis puntos</p>
            <button onClick={() => setUsePoints(v => !v)} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all text-left" style={chip(usePoints)}>
              <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: `${accent}20`, color: accent }}><Award className="w-4 h-4" /></span>
              <span className="flex-1">
                <span className="block text-sm font-semibold" style={{ color: usePoints ? accent : '#fff' }}>Usar mis {pointsAvail} puntos</span>
                <span className="block text-[11px]" style={{ color: MUTED }}>Hasta −{fmt(Math.min(pointsAvail * ppv, Math.max(0, total - discount)))} en este pedido</span>
              </span>
              <span className="relative w-11 h-6 rounded-full shrink-0" style={{ background: usePoints ? accent : '#555' }}>
                <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all" style={{ left: usePoints ? '22px' : '2px' }} />
              </span>
            </button>
          </div>
        )}

        {/* Propina */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: MUTED }}>Propina</p>
          <div className="grid grid-cols-4 gap-2">
            {[0, 10, 15, 20].map(p => (
              <button key={p} onClick={() => setTipPct(p)} className="py-2.5 rounded-xl text-sm font-bold border-2 transition-all" style={chip(tipPct === p)}>{p === 0 ? 'Sin' : `${p}%`}</button>
            ))}
          </div>
        </div>

        {/* Resumen */}
        <div className="p-4 rounded-[22px] space-y-2" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <SumRow label="Subtotal" value={fmt(total)} />
          {isDelivery && <SumRow label={`Envío${preview.distanceKm != null ? ` · ${preview.distanceKm} km` : ''}`} value={preview.outOfRange ? 'Fuera de cobertura' : needsLoc ? 'Usa tu ubicación' : deliveryFee === 0 ? 'Gratis' : fmt(deliveryFee)} />}
          {discount > 0 && <SumRow label="Descuento" value={`−${fmt(discount)}`} green />}
          {pointsDiscount > 0 && <SumRow label="Puntos canjeados" value={`−${fmt(pointsDiscount)}`} green />}
          {tip > 0 && <SumRow label="Propina" value={fmt(tip)} />}
          <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
            <span className="font-bold">Total</span>
            <span className="text-2xl font-extrabold" style={{ color: accent }}>{fmt(grand)}</span>
          </div>
        </div>

        {belowMin && <p className="text-amber-400 text-xs font-bold text-center">Pedido mínimo: {fmt(minOrderAmount)}.</p>}
        {error && <p className="text-red-400 text-xs font-bold text-center">{error}</p>}
      </div>

      <div className="fixed bottom-0 inset-x-0 z-10 backdrop-blur-xl" style={{ background: `${BG}f2`, borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-lg mx-auto px-5 py-3.5">
          <button onClick={submit} disabled={submitting || belowMin || (isDelivery && preview.outOfRange)}
            className="w-full py-4 rounded-2xl font-bold text-white active:scale-95 transition-transform disabled:opacity-50"
            style={{ background: accent, boxShadow: `0 8px 24px ${accent}55` }}>
            {submitting ? 'Procesando…' : `${payment === 'ONLINE' ? 'Pagar' : 'Confirmar pedido'} · ${fmt(grand)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function SumRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm" style={{ color: green ? '#88D66C' : MUTED }}>
      <span>{label}</span><span className="font-bold" style={{ color: green ? '#88D66C' : '#fff' }}>{value}</span>
    </div>
  );
}

// ── ORDER DONE (con seguimiento en vivo) ──────────────────────────────────────
const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  PENDING: { t: 'Recibido', c: '#f59e0b' }, CONFIRMED: { t: 'Confirmado', c: '#3b82f6' },
  PREPARING: { t: 'En preparación', c: '#8b5cf6' }, READY: { t: 'Listo', c: '#10b981' },
  ON_THE_WAY: { t: 'En camino', c: '#06b6d4' }, DELIVERED: { t: 'Entregado', c: '#10b981' },
  CANCELLED: { t: 'Cancelado', c: '#ef4444' },
};

function OrderDone({ accent, order, slug, onClose }: any) {
  const [status, setStatus] = useState<string>(order.status || 'PENDING');
  useEffect(() => {
    if (!order?.orderNumber) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/store/orders/by-number/${encodeURIComponent(order.orderNumber)}?r=${encodeURIComponent(slug)}`);
        if (res.ok) { const d = await res.json(); if (!stop && d.status) setStatus(d.status); }
      } catch {}
    };
    poll(); const id = setInterval(poll, 6000);
    return () => { stop = true; clearInterval(id); };
  }, [order, slug]);

  const st = STATUS_LABEL[status] || STATUS_LABEL.PENDING;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6" style={{ background: BG }}>
      <div className="max-w-sm w-full text-center rounded-[32px] p-8" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <div className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: `${accent}1f` }}>
          <span className="text-5xl">😍</span>
        </div>
        <h2 className="text-2xl font-extrabold mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>¡Pedido confirmado!</h2>
        <p className="text-sm font-bold mb-5" style={{ color: MUTED }}>Orden #{order.orderNumber}</p>
        <div className="rounded-2xl p-4 mb-5" style={{ background: `${st.c}18` }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: MUTED }}>Estado</p>
          <p className="text-lg font-extrabold flex items-center justify-center gap-2" style={{ color: st.c }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: st.c }} />{st.t}
          </p>
        </div>
        <p className="text-xs mb-6" style={{ color: MUTED }}>El estado se actualiza automáticamente.</p>
        <button onClick={onClose} className="w-full py-4 rounded-2xl font-bold text-white active:scale-95 transition-transform" style={{ background: accent }}>Aceptar</button>
      </div>
    </div>
  );
}

// ── PERFIL ────────────────────────────────────────────────────────────────────
function ProfileScreen({ accent, info, slug, auth, favCount, waNumber, onFavorites, onOrders, onPoints, onLogin, onSignOut }: any) {
  const [points, setPoints] = useState<number | null>(null);
  const [value, setValue] = useState<number>(0);

  useEffect(() => {
    if (!auth) { setPoints(null); return; }
    let stop = false;
    fetchMyLoyalty(slug).then(l => { if (!stop) { setPoints(l.points); setValue(l.valuePesos); } }).catch(() => {});
    return () => { stop = true; };
  }, [auth, slug]);

  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try { if (navigator.share) await navigator.share({ title: info.name, url }); else { await navigator.clipboard.writeText(url); } } catch {}
  };

  const Row = ({ icon, color, title, sub, onClick, right }: any) => (
    <button onClick={onClick} className="w-full flex items-center gap-3.5 px-4 py-3.5">
      <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}1f`, color }}>{icon}</span>
      <span className="flex-1 text-left">
        <span className="block text-sm font-semibold">{title}</span>
        {sub && <span className="block text-[11px]" style={{ color: MUTED }}>{sub}</span>}
      </span>
      {right || <ChevronRight className="w-4 h-4" style={{ color: MUTED }} />}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Tarjeta usuario */}
      <div className="flex items-center gap-4 p-4 rounded-[22px]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ background: `${accent}22`, color: accent }}>
          <User className="w-7 h-7" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-extrabold text-lg truncate" style={{ fontFamily: 'Syne, sans-serif' }}>{auth?.customer?.name || 'Invitado'}</h3>
          <p className="text-xs truncate" style={{ color: MUTED }}>{auth?.customer?.email || 'Inicia sesión para ver tus compras'}</p>
        </div>
        {auth && <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: INPUT }}><Pencil className="w-4 h-4" /></span>}
      </div>

      {/* CTA login / saldo de puntos */}
      {auth ? (
        <button onClick={onPoints} className="w-full flex items-center gap-4 p-4 rounded-[22px] text-left active:scale-[0.99] transition-transform" style={{ background: accent }}>
          <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#00000026' }}><Award className="w-6 h-6 text-white" /></span>
          <div className="flex-1 text-white">
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-90">Mis puntos</p>
            <p className="text-2xl font-extrabold leading-tight">{points ?? '—'} <span className="text-sm font-bold opacity-90">pts</span></p>
          </div>
          <span className="text-right text-white">
            <span className="block text-[11px] opacity-90">Equivale a</span>
            <span className="block font-extrabold">{fmt(value)}</span>
          </span>
        </button>
      ) : (
        <button onClick={onLogin} className="w-full flex items-center gap-3 p-4 rounded-[22px] text-left active:scale-[0.99] transition-transform" style={{ background: accent }}>
          <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: '#00000026' }}><Gift className="w-5 h-5 text-white" /></span>
          <div className="flex-1 text-white">
            <p className="font-extrabold">Inicia sesión</p>
            <p className="text-xs opacity-90">Accede a tus compras y acumula puntos</p>
          </div>
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Grupo cuenta */}
      <div className="rounded-[22px] overflow-hidden divide-y" style={{ background: CARD, border: `1px solid ${BORDER}`, borderColor: BORDER }}>
        <Row icon={<Receipt className="w-4 h-4" />} color={accent} title="Mis pedidos" sub={auth ? 'Tu historial de compras' : 'Inicia sesión para verlos'} onClick={auth ? onOrders : onLogin} />
        <Row icon={<Award className="w-4 h-4" />} color="#f59e0b" title="Mis puntos" sub={auth ? `${points ?? '—'} pts · ${fmt(value)}` : 'Inicia sesión para verlos'} onClick={auth ? onPoints : onLogin} />
        <Row icon={<Heart className="w-4 h-4" />} color="#ef4444" title="Favoritos" sub={`${favCount} ${favCount === 1 ? 'platillo guardado' : 'platillos guardados'}`} onClick={onFavorites} />
      </div>

      {/* Grupo info */}
      <div className="rounded-[22px] overflow-hidden divide-y" style={{ background: CARD, border: `1px solid ${BORDER}`, borderColor: BORDER }}>
        {waNumber && <Row icon={<MessageCircle className="w-4 h-4" />} color="#25D366" title="Ayuda por WhatsApp" sub="Escríbenos directo" onClick={() => window.open(`https://wa.me/${waNumber}`, '_blank')} />}
        <Row icon={<Settings className="w-4 h-4" />} color="#9A9AA2" title="Compartir tienda" sub="Envía el menú a tus amigos" onClick={share} />
        <Row icon={<Globe className="w-4 h-4" />} color="#3b82f6" title="Idioma" sub="Español" onClick={() => {}} />
        <Row icon={<FileText className="w-4 h-4" />} color="#06b6d4" title="Términos de uso" onClick={() => {}} />
        <Row icon={<Shield className="w-4 h-4" />} color="#10b981" title="Privacidad" onClick={() => {}} />
      </div>

      {auth && (
        <button onClick={onSignOut} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm" style={{ background: '#FFFFFF08', color: '#ef4444', border: `1px solid ${BORDER}` }}>
          <LogOut className="w-4 h-4" /> Cerrar sesión
        </button>
      )}

      <p className="text-center text-[11px] pb-2" style={{ color: MUTED }}>{info.name} · Powered by MRTPV</p>
    </div>
  );
}

// ── MIS PEDIDOS ───────────────────────────────────────────────────────────────
function OrdersScreen({ accent, slug, auth, onBrowse, onLogin }: any) {
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!auth) return;
    let stop = false;
    fetchMyOrders(slug).then(o => { if (!stop) setOrders(o); }).catch(e => { if (!stop) setErr(e?.message || 'Error'); });
    return () => { stop = true; };
  }, [auth, slug]);

  if (!auth) return <LoginGate accent={accent} onLogin={onLogin} text="Inicia sesión para ver tus compras." />;
  if (err) return <p className="py-20 text-center text-sm" style={{ color: MUTED }}>{err}</p>;
  if (!orders) return <p className="py-20 text-center text-sm" style={{ color: MUTED }}>Cargando…</p>;
  if (orders.length === 0) {
    return (
      <div className="py-24 text-center" style={{ color: MUTED }}>
        <Receipt className="w-14 h-14 mx-auto mb-4 opacity-25" />
        <p className="font-bold mb-1">Aún no tienes pedidos</p>
        <p className="text-xs mb-6">Cuando hagas tu primer pedido aparecerá aquí.</p>
        <button onClick={onBrowse} className="px-6 py-3 rounded-full font-bold text-white" style={{ background: accent }}>Ver el menú</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map(o => {
        const st = STATUS_LABEL[o.status] || STATUS_LABEL.PENDING;
        const d = new Date(o.createdAt);
        return (
          <div key={o.id} className="p-4 rounded-[20px]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-bold text-sm">#{o.orderNumber}</p>
                <p className="text-[11px]" style={{ color: MUTED }}>{d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })} · {d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5" style={{ background: `${st.c}1f`, color: st.c }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.c }} />{st.t}
              </span>
            </div>
            <p className="text-xs line-clamp-2" style={{ color: '#FFFFFFaa' }}>
              {o.items.map(it => `${it.quantity}× ${it.name}`).join(' · ')}
            </p>
            <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
              {o.pointsEarned > 0 ? (
                <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: accent }}><Award className="w-3.5 h-3.5" /> +{o.pointsEarned} pts</span>
              ) : <span className="text-[11px]" style={{ color: MUTED }}>{o.paymentStatus === 'PAID' ? 'Pagado' : 'Por pagar'}</span>}
              <span className="font-extrabold">{fmt(o.total)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── MIS PUNTOS ────────────────────────────────────────────────────────────────
function PointsScreen({ accent, slug, auth, onLogin }: any) {
  const [data, setData] = useState<LoyaltyInfo | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!auth) return;
    let stop = false;
    fetchMyLoyalty(slug).then(d => { if (!stop) setData(d); }).catch(e => { if (!stop) setErr(e?.message || 'Error'); });
    return () => { stop = true; };
  }, [auth, slug]);

  if (!auth) return <LoginGate accent={accent} onLogin={onLogin} text="Inicia sesión para ver tus puntos." />;
  if (err) return <p className="py-20 text-center text-sm" style={{ color: MUTED }}>{err}</p>;
  if (!data) return <p className="py-20 text-center text-sm" style={{ color: MUTED }}>Cargando…</p>;

  const tierLabel: Record<string, string> = { BRONZE: 'Bronce', SILVER: 'Plata', GOLD: 'Oro' };
  return (
    <div className="space-y-5">
      {/* Tarjeta de puntos */}
      <div className="rounded-[24px] p-5 relative overflow-hidden" style={{ background: accent }}>
        <div aria-hidden className="absolute -top-10 -right-10 w-40 h-40 rounded-full" style={{ background: '#ffffff22' }} />
        <div className="relative text-white">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-bold uppercase tracking-widest opacity-90">Saldo de puntos</span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: '#00000026' }}><Award className="w-3.5 h-3.5" /> {tierLabel[data.tier] || data.tier}</span>
          </div>
          <p className="text-5xl font-extrabold leading-none" style={{ fontFamily: 'Syne, sans-serif' }}>{data.points}<span className="text-xl font-bold opacity-90"> pts</span></p>
          <p className="text-sm mt-2 opacity-95">Equivale a <span className="font-extrabold">{fmt(data.valuePesos)}</span> de descuento</p>
          {data.qrCode && (
            <div className="mt-4 inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: '#0A0A0C' }}>
              <Tag className="w-3.5 h-3.5" /> {data.qrCode}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 rounded-[18px] text-xs leading-relaxed" style={{ background: CARD, border: `1px solid ${BORDER}`, color: MUTED }}>
        Ganas <span className="font-bold text-white">{data.pointsPerTen} {data.pointsPerTen === 1 ? 'punto' : 'puntos'}</span> por cada $10 de compra. Cada punto vale <span className="font-bold text-white">{fmt(data.pointsValuePesos)}</span>. Canjéalos como descuento al pagar tu próximo pedido.
      </div>

      {/* Movimientos */}
      <div>
        <h3 className="text-base font-extrabold mb-3">Movimientos</h3>
        {data.transactions.length === 0 ? (
          <p className="py-10 text-center text-sm" style={{ color: MUTED }}>Aún no tienes movimientos. ¡Haz tu primer pedido!</p>
        ) : (
          <div className="space-y-2">
            {data.transactions.map((t, i) => {
              const positive = t.points >= 0 && t.type !== 'REDEEMED' && t.type !== 'EXPIRED';
              const d = new Date(t.createdAt);
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-[16px]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: positive ? `${accent}1f` : '#ffffff10', color: positive ? accent : MUTED }}>
                    {positive ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{t.description}</p>
                    <p className="text-[11px]" style={{ color: MUTED }}>{d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</p>
                  </div>
                  <span className="font-extrabold text-sm" style={{ color: positive ? accent : MUTED }}>{positive ? '+' : ''}{t.points}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function LoginGate({ accent, onLogin, text }: any) {
  return (
    <div className="py-24 text-center" style={{ color: MUTED }}>
      <Lock className="w-12 h-12 mx-auto mb-4 opacity-30" />
      <p className="font-bold mb-5">{text}</p>
      <button onClick={onLogin} className="px-6 py-3 rounded-full font-bold text-white" style={{ background: accent }}>Iniciar sesión</button>
    </div>
  );
}
