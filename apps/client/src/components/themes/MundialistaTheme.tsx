'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, ShoppingBag, Plus, Minus, Trash2, X, MessageCircle, MapPin, Phone,
  Trophy, Flame, ChevronRight, Star, Banknote, CreditCard, Building2,
} from 'lucide-react';
import { useCart } from '../../lib/cartStore';
import { cldImage } from '@/lib/cloudinary';
import { productEmoji } from '../../lib/productEmoji';
import BannerCarousel, { collectBanners } from '../BannerCarousel';
import ProductModal, { needsModal } from '../ProductModal';
import StoreCheckout from '../StoreCheckout';
import type { DeliveryConfig } from '../../lib/delivery';

// ══════════════════════════════════════════════════════════════════════════════
//  TEMA "MENÚ MUNDIALISTA" — estadio nocturno · negro / dorado / verde cancha
//  Skin de evento (Mundial). Reusa ProductModal (dark) + StoreCheckout probados.
// ══════════════════════════════════════════════════════════════════════════════

// ── Paleta mundialista (identidad fija del evento, no depende del primaryColor) ─
const BG = '#0C0C0E';
const CARD = '#151517';
const SOFT = '#1F1F22';
const GOLD = '#FFC107';
const GOLD_DK = '#D99A00';
const GREEN = '#2EA043';
const RED = '#E53935';
const TEXT = '#F5F5F5';
const MUTED = '#B8B8B8';
const FAINT = '#FFFFFF55';
const BORDER = 'rgba(255,255,255,0.12)';

const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;
const priceOf = (p: any) => (p.isPromo && p.promoPrice ? p.promoPrice : p.price);

// Icono futbolero por categoría (data-driven: usa el nombre real del catálogo).
const CAT_ICONS: [RegExp, string][] = [
  [/combo|paquete|partido|mundial/i, '⚽'],
  [/hamburg|burger|burguer/i, '🍔'],
  [/alit|boneless|wing|pollo|chicken/i, '🍗'],
  [/taco/i, '🌮'],
  [/nacho/i, '🧀'],
  [/hot ?dog|salchich/i, '🌭'],
  [/papa|fries|gajo|fritas?|entrada|extra/i, '🍟'],
  [/mojito|coctel|cocktail|michela/i, '🍹'],
  [/frapp|caf[eé]|malteada|smoothie|licuad/i, '🧋'],
  [/refresc|soda|cola|bebida|agua|jugo|limonad/i, '🥤'],
  [/cerve|beer|chela/i, '🍺'],
  [/calor|nieve|helad|postre|pastel|cheesecake|dulce/i, '🍧'],
  [/kilo|\bkg\b/i, '🏆'],
  [/torta|sandwich|baguet/i, '🥪'],
];
function categoryIcon(name?: string | null): string {
  if (!name) return '🍽️';
  for (const [re, ic] of CAT_ICONS) if (re.test(name)) return ic;
  return '🍽️';
}
const isComboCat = (name?: string | null) => !!name && /combo|paquete|partido|mundial/i.test(name);

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

type MundialistaThemeProps = {
  data: { info: Info; menu: { categories: any[] }; locations: any[] };
};

export function MundialistaTheme({ data }: MundialistaThemeProps) {
  const { info, menu, locations } = data;
  const categories: any[] = (menu.categories || []).filter((c: any) => (c.items || []).length > 0);

  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());

  const [query, setQuery] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [modalProduct, setModalProduct] = useState<any>(null);
  const [activeCat, setActiveCat] = useState<string>(categories[0]?.id ?? '');
  const [orderMode, setOrderMode] = useState<'DELIVERY' | 'TAKEOUT'>('DELIVERY');

  const banners = collectBanners(locations);
  const waNumber = (info.whatsappNumber || '').replace(/\D/g, '');
  const minOrder = info.minOrderAmount || 0;
  const primaryLocation = locations[0] || null;

  const allItems = useMemo(() => categories.flatMap((c: any) => c.items || []), [categories]);
  const comboCat = useMemo(() => categories.find((c: any) => isComboCat(c.name)) || null, [categories]);
  const promos = useMemo(() => allItems.filter((i: any) => i.isPromo).slice(0, 8), [allItems]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return allItems.filter((i: any) =>
      i.name?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
  }, [q, allItems]);

  // Selecciona producto: abre modal si tiene variantes/modificadores, si no agrega directo.
  const pick = (p: any) => {
    if (needsModal(p)) { setModalProduct(p); return; }
    add({ id: p.id, menuItemId: p.id, name: p.name, price: priceOf(p) });
  };

  const scrollToCat = (id: string) => {
    setActiveCat(id);
    document.getElementById(`mb-cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const scrollToMenu = () => document.getElementById('mb-menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const scrollToCombos = () => {
    const el = document.getElementById(comboCat ? `mb-cat-${comboCat.id}` : 'mb-promos') || document.getElementById('mb-menu');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Scroll-spy: resalta el chip de la categoría visible.
  useEffect(() => {
    if (categories.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveCat(visible.target.getAttribute('data-cat') || '');
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: [0, 0.25, 0.5] },
    );
    categories.forEach((c: any) => {
      const el = document.getElementById(`mb-cat-${c.id}`);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [categories]);

  const onBannerLink = (b: any) => {
    if (b.linkType === 'CATEGORY' && b.linkValue) scrollToCat(b.linkValue);
    else if (b.linkType === 'ITEM' && b.linkValue) {
      const p = allItems.find((x: any) => x.id === b.linkValue);
      if (p) pick(p);
    }
  };

  const buildWaMessage = () => {
    const items = lines.map(l => `• ${l.quantity}× ${l.name} — ${fmt(l.price * l.quantity)}`).join('\n');
    return `¡Hola ${info.name.trim()}! ⚽ Quiero este pedido del *Menú Mundialista*:\n\n${items}\n\n*Total:* ${fmt(total)}\n\n¿Me confirman disponibilidad?`;
  };
  const orderByWhatsApp = () => {
    if (!waNumber) return;
    const text = encodeURIComponent(buildWaMessage());
    window.open(`https://wa.me/${waNumber}?text=${text}`, '_blank', 'noopener');
  };

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
      {/* Fondo estadio: glow dorado arriba + degradado obsidiana. */}
      <div aria-hidden className="fixed inset-0 pointer-events-none" style={{
        background: `radial-gradient(900px 420px at 50% -8%, ${GOLD}1f, transparent 60%), radial-gradient(700px 400px at 90% 8%, ${GREEN}14, transparent 55%), linear-gradient(180deg, #050506, ${BG} 38%)`,
      }} />

      <div className="relative">
        {/* ── HEADER STICKY ───────────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 backdrop-blur-xl" style={{ background: `${BG}d9`, borderBottom: `1px solid ${BORDER}` }}>
          <div className="max-w-6xl mx-auto px-4 h-[58px] flex items-center gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {info.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cldImage(info.logo, { width: 120 })} alt={info.name} loading="eager" decoding="async"
                  className="w-9 h-9 rounded-full object-cover shrink-0" style={{ border: `1.5px solid ${GOLD}` }} />
              ) : (
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-extrabold" style={{ background: `${GOLD}22`, color: GOLD }}>{info.name.trim().charAt(0)}</div>
              )}
              <div className="min-w-0 leading-tight">
                <h1 className="font-extrabold text-[15px] truncate" style={{ fontFamily: 'var(--font-syne), sans-serif' }}>{info.name.trim()}</h1>
                <p className="text-[10px] flex items-center gap-0.5 truncate" style={{ color: MUTED }}>
                  <MapPin className="w-2.5 h-2.5 shrink-0" style={{ color: GOLD }} />
                  {primaryLocation?.name || primaryLocation?.address || 'Pedidos en línea'}
                </p>
              </div>
            </div>

            <div className="flex-1" />

            {/* Buscador (compacto en móvil, ancho en desktop) */}
            <div className="hidden sm:flex items-center gap-2 px-3 h-10 rounded-full max-w-xs flex-1" style={{ background: SOFT, border: `1px solid ${BORDER}` }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar antojos…"
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#7A7A82]" />
              {query && <button onClick={() => setQuery('')} aria-label="Limpiar"><X className="w-4 h-4" style={{ color: MUTED }} /></button>}
            </div>

            {waNumber && (
              <button onClick={orderByWhatsApp} className="hidden md:flex items-center gap-2 px-4 h-10 rounded-full font-bold text-sm text-white active:scale-95 transition" style={{ background: '#25D366' }}>
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </button>
            )}

            <button onClick={() => setCartOpen(true)} className="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition" style={{ background: SOFT, border: `1px solid ${BORDER}` }} aria-label="Carrito">
              <ShoppingBag className="w-5 h-5" />
              {quantity > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-extrabold" style={{ background: GOLD, color: '#1A1A1A' }}>{quantity}</span>}
            </button>
          </div>

          {/* Buscador móvil */}
          <div className="sm:hidden px-4 pb-3">
            <div className="flex items-center gap-2 px-3 h-10 rounded-full" style={{ background: SOFT, border: `1px solid ${BORDER}` }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar antojos…"
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#7A7A82]" />
              {query && <button onClick={() => setQuery('')} aria-label="Limpiar"><X className="w-4 h-4" style={{ color: MUTED }} /></button>}
            </div>
          </div>
        </header>

        {/* ── RESULTADOS DE BÚSQUEDA ──────────────────────────────────────── */}
        {q ? (
          <main className="max-w-6xl mx-auto px-4 py-6">
            <h2 className="text-lg font-extrabold mb-4" style={{ fontFamily: 'var(--font-syne), sans-serif' }}>
              {results.length > 0 ? `Resultados (${results.length})` : `Sin resultados para “${query}”`}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {results.map((p: any) => <ProductCard key={p.id} p={p} onOpen={() => pick(p)} />)}
            </div>
          </main>
        ) : (
          <>
            {/* ── HERO MUNDIALISTA ──────────────────────────────────────────── */}
            <section className="max-w-6xl mx-auto px-4 pt-5">
              <div className="relative overflow-hidden rounded-[28px] px-6 py-9 sm:px-10 sm:py-12"
                style={{ background: `radial-gradient(120% 140% at 0% 0%, ${GOLD}24, transparent 45%), radial-gradient(120% 140% at 100% 100%, ${GREEN}26, transparent 50%), linear-gradient(135deg, #121214, #070708)`, border: `1px solid ${BORDER}`, boxShadow: '0 30px 70px rgba(0,0,0,0.45)' }}>
                <Confetti />
                {/* Línea de cancha decorativa */}
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: `linear-gradient(90deg, ${GREEN}, ${GOLD}, ${GREEN})` }} />
                <div className="relative max-w-xl">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full mb-4" style={{ background: '#00000040', color: GOLD, border: `1px solid ${GOLD}55` }}>
                    <Trophy className="w-3.5 h-3.5" /> Edición Mundial
                  </span>
                  <h2 className="font-extrabold leading-[0.95] tracking-tight text-[34px] sm:text-[52px]" style={{ fontFamily: 'var(--font-syne), sans-serif' }}>
                    <span style={{ background: `linear-gradient(135deg, ${GOLD}, #FFE48A)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>MENÚ MUNDIALISTA</span>
                  </h2>
                  <p className="mt-2 text-base sm:text-xl font-bold" style={{ color: TEXT }}>El sabor que nos une ⚽</p>
                  <p className="mt-1.5 text-sm" style={{ color: MUTED }}>Haz tu pedido en línea y vive el partido con todo el sabor.</p>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button onClick={scrollToMenu} className="px-6 py-3.5 rounded-full font-extrabold text-[15px] active:scale-95 transition" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: '#1A1A1A', boxShadow: `0 12px 30px ${GOLD}55` }}>
                      Ordenar ahora
                    </button>
                    <button onClick={scrollToCombos} className="px-6 py-3.5 rounded-full font-extrabold text-[15px] active:scale-95 transition" style={{ background: '#FFFFFF0d', color: TEXT, border: `1.5px solid ${BORDER}` }}>
                      Ver combos del partido
                    </button>
                  </div>

                  {/* Chips de confianza */}
                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    {info.estimatedDelivery ? <HeroChip icon="🛵" text={`Entrega ~${info.estimatedDelivery} min`} /> : <HeroChip icon="🛵" text="Entrega a domicilio" />}
                    <HeroChip icon="🥡" text="Para llevar" />
                    {waNumber && <HeroChip icon="💬" text="Pedido por WhatsApp" />}
                  </div>
                </div>

                {/* Balón / trofeo flotantes (decorativo, oculto en móvil) */}
                <div aria-hidden className="hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 select-none">
                  <span className="block text-[120px] leading-none drop-shadow-[0_18px_30px_rgba(0,0,0,0.5)]">🏆</span>
                </div>
              </div>
            </section>

            {/* ── BANNERS (si la tienda configuró promos visuales) ──────────── */}
            {banners.length > 0 && (
              <section className="max-w-6xl mx-auto px-4 mt-6">
                <BannerCarousel banners={banners} variant="dark" accent={GOLD} onLink={onBannerLink} />
              </section>
            )}

            {/* ── CARRUSEL DE CATEGORÍAS (sticky bajo el header) ────────────── */}
            {categories.length > 1 && (
              <nav className="sticky top-[58px] sm:top-[58px] z-30 backdrop-blur-xl mt-6" style={{ background: `${BG}d9`, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
                <div className="max-w-6xl mx-auto px-4 py-2.5 flex gap-2 overflow-x-auto no-scrollbar">
                  {categories.map((c: any) => {
                    const on = activeCat === c.id;
                    return (
                      <button key={c.id} onClick={() => scrollToCat(c.id)}
                        className="shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-full text-sm font-bold transition-all"
                        style={on
                          ? { background: GOLD, color: '#1A1A1A', boxShadow: `0 6px 16px ${GOLD}55` }
                          : { background: SOFT, color: TEXT, border: `1px solid ${BORDER}` }}>
                        <span>{categoryIcon(c.name)}</span>{c.name}
                      </button>
                    );
                  })}
                </div>
              </nav>
            )}

            {/* ── PROMOS DEL PARTIDO (si no hay categoría de combos explícita) ─ */}
            {!comboCat && promos.length > 0 && (
              <section id="mb-promos" className="max-w-6xl mx-auto px-4 mt-8">
                <SectionTitle icon={<Flame className="w-5 h-5" style={{ color: RED }} />} title="Promos del partido" />
                <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                  {promos.map((p: any) => (
                    <div key={p.id} className="shrink-0 w-[170px]"><ProductCard p={p} onOpen={() => pick(p)} /></div>
                  ))}
                </div>
              </section>
            )}

            {/* ── SECCIONES POR CATEGORÍA ──────────────────────────────────── */}
            <main id="mb-menu" className="max-w-6xl mx-auto px-4 mt-8 pb-40">
              {categories.length === 0 && (
                <div className="py-24 text-center" style={{ color: MUTED }}>
                  <span className="text-5xl block mb-3 opacity-40">⚽</span>
                  <p className="font-bold">Aún no hay platillos disponibles.</p>
                </div>
              )}

              {categories.map((category: any) => {
                const combo = isComboCat(category.name);
                return (
                  <section key={category.id} id={`mb-cat-${category.id}`} data-cat={category.id} className="mb-12 scroll-mt-[120px]">
                    {combo ? (
                      <div className="flex items-center gap-2.5 mb-5">
                        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-extrabold text-sm" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: '#1A1A1A' }}>
                          <Trophy className="w-4 h-4" /> {category.name}
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: GREEN }}>Combos del partido</span>
                      </div>
                    ) : (
                      <SectionTitle icon={<span className="text-xl">{categoryIcon(category.name)}</span>} title={category.name} count={(category.items || []).length} />
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                      {(category.items || []).map((p: any) => (
                        <ProductCard key={p.id} p={p} highlight={combo} onOpen={() => pick(p)} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </main>
          </>
        )}

        {/* ── FOOTER ─────────────────────────────────────────────────────── */}
        <footer className="relative mt-4" style={{ borderTop: `1px solid ${BORDER}`, background: '#08080A' }}>
          <div className="max-w-6xl mx-auto px-4 py-10 grid gap-8 sm:grid-cols-3">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                {info.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cldImage(info.logo, { width: 120 })} alt={info.name} loading="lazy" decoding="async" className="w-10 h-10 rounded-full object-cover" style={{ border: `1.5px solid ${GOLD}` }} />
                ) : <div className="w-10 h-10 rounded-full flex items-center justify-center font-extrabold" style={{ background: `${GOLD}22`, color: GOLD }}>{info.name.trim().charAt(0)}</div>}
                <span className="font-extrabold text-lg" style={{ fontFamily: 'var(--font-syne), sans-serif' }}>{info.name.trim()}</span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: MUTED }}>Menú Mundialista — el sabor que nos une. Pide en línea y disfruta el partido. ⚽🏆</p>
            </div>

            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest mb-3" style={{ color: GOLD }}>Contacto</p>
              <ul className="space-y-2.5 text-sm" style={{ color: MUTED }}>
                {waNumber && (
                  <li><button onClick={orderByWhatsApp} className="flex items-center gap-2 hover:text-white transition"><MessageCircle className="w-4 h-4" style={{ color: '#25D366' }} /> Pedir por WhatsApp</button></li>
                )}
                {primaryLocation?.phone && (
                  <li><a href={`tel:${primaryLocation.phone.replace(/\s+/g, '')}`} className="flex items-center gap-2 hover:text-white transition"><Phone className="w-4 h-4" style={{ color: GOLD }} /> {primaryLocation.phone}</a></li>
                )}
                {primaryLocation?.address && (
                  <li className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0" style={{ color: GOLD }} /> <span>{primaryLocation.address}</span></li>
                )}
              </ul>
            </div>

            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest mb-3" style={{ color: GOLD }}>Pagos aceptados</p>
              <div className="flex flex-wrap gap-2">
                <PayChip icon={<Banknote className="w-4 h-4" />} label="Efectivo" />
                <PayChip icon={<CreditCard className="w-4 h-4" />} label="Tarjeta" />
                <PayChip icon={<Building2 className="w-4 h-4" />} label="Transferencia" />
              </div>
              <p className="text-[11px] mt-5" style={{ color: FAINT }}>Pedido mínimo {minOrder > 0 ? fmt(minOrder) : 'sin mínimo'}.</p>
            </div>
          </div>
          <div className="text-center text-[11px] py-4" style={{ color: FAINT, borderTop: `1px solid ${BORDER}` }}>
            {info.name.trim()} · Menú Mundialista · Powered by MRTPV
          </div>
        </footer>
      </div>

      {/* ── BARRA FLOTANTE "VER PEDIDO" (móvil/desktop) ────────────────────── */}
      {quantity > 0 && !cartOpen && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md mx-auto">
          <button onClick={() => setCartOpen(true)}
            className="w-full flex items-center justify-between px-5 py-4 rounded-[20px] font-extrabold active:scale-95 transition"
            style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: '#1A1A1A', boxShadow: `0 16px 36px ${GOLD}66` }}>
            <span className="flex items-center gap-2.5 text-sm">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-[13px]" style={{ background: '#00000022' }}>{quantity}</span>
              Ver mi pedido
            </span>
            <span className="text-lg flex items-center gap-1">{fmt(total)} <ChevronRight className="w-5 h-5" /></span>
          </button>
        </div>
      )}

      {/* ── CARRITO (slide-over desktop / bottom-sheet móvil) ──────────────── */}
      {cartOpen && (
        <CartPanel
          onClose={() => setCartOpen(false)}
          onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }}
          onWhatsApp={orderByWhatsApp}
          waNumber={waNumber}
          allItems={allItems}
          minOrder={minOrder}
        />
      )}

      {/* Modal de personalización (variantes / modificadores / extras) */}
      {modalProduct && (
        <ProductModal product={modalProduct} accent={GOLD} variant="dark" onClose={() => setModalProduct(null)} />
      )}

      {/* Checkout completo y probado (tipos de pedido, pago, cupón, puntos, envío) */}
      <StoreCheckout
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        slug={info.slug}
        primary={GOLD}
        locations={locations}
        delivery={info.delivery}
        minOrderAmount={info.minOrderAmount}
        onlinePayment={info.onlinePayment}
        initialOrderType={orderMode}
      />

      <style dangerouslySetInnerHTML={{ __html: `.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}` }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUBCOMPONENTES
// ══════════════════════════════════════════════════════════════════════════════

function HeroChip({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: '#FFFFFF0d', border: `1px solid ${BORDER}`, color: TEXT }}>
      <span>{icon}</span>{text}
    </span>
  );
}

function PayChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl" style={{ background: SOFT, border: `1px solid ${BORDER}`, color: TEXT }}>
      <span style={{ color: GOLD }}>{icon}</span>{label}
    </span>
  );
}

function SectionTitle({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: SOFT, border: `1px solid ${BORDER}` }}>{icon}</span>
      <h3 className="font-extrabold text-xl tracking-tight" style={{ fontFamily: 'var(--font-syne), sans-serif' }}>{title}</h3>
      {count != null && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: SOFT, color: MUTED }}>{count}</span>}
    </div>
  );
}

// Confeti dorado/verde decorativo del hero (CSS puro, sin imágenes).
function Confetti() {
  const dots = [
    { l: '8%', t: '18%', c: GOLD, s: 7 }, { l: '20%', t: '70%', c: GREEN, s: 5 },
    { l: '34%', t: '12%', c: '#FFFFFF', s: 4 }, { l: '46%', t: '78%', c: GOLD, s: 6 },
    { l: '60%', t: '22%', c: GREEN, s: 5 }, { l: '72%', t: '64%', c: GOLD, s: 7 },
    { l: '84%', t: '30%', c: '#FFFFFF', s: 4 }, { l: '92%', t: '74%', c: GOLD, s: 6 },
    { l: '14%', t: '46%', c: GOLD, s: 4 }, { l: '52%', t: '48%', c: GREEN, s: 4 },
  ];
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((d, i) => (
        <span key={i} className="absolute rounded-[2px]" style={{ left: d.l, top: d.t, width: d.s, height: d.s, background: d.c, opacity: 0.6, transform: `rotate(${i * 36}deg)` }} />
      ))}
    </div>
  );
}

// ── TARJETA DE PRODUCTO ─────────────────────────────────────────────────────
function ProductCard({ p, onOpen, highlight }: { p: any; onOpen: () => void; highlight?: boolean }) {
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const line = lines.find(l => l.id === p.id);
  const price = priceOf(p);

  return (
    <article className="relative rounded-[20px] p-2.5 flex flex-col active:scale-[0.99] transition-transform"
      style={{ background: CARD, border: `1px solid ${highlight ? `${GOLD}55` : BORDER}`, boxShadow: highlight ? `0 0 0 1px ${GOLD}22` : 'none' }}>
      <button onClick={onOpen} className="relative w-full aspect-square rounded-[14px] overflow-hidden mb-2.5 block" style={{ background: '#FFFFFF08' }}>
        {/* Badges */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 items-start">
          {p.isPromo && <span className="text-[9px] font-extrabold px-2 py-1 rounded-full text-white" style={{ background: RED }}>PROMO DEL PARTIDO</span>}
          {p.isPopular && <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-2 py-1 rounded-full" style={{ background: GOLD, color: '#1A1A1A' }}><Star className="w-2.5 h-2.5" /> MÁS VENDIDO</span>}
        </div>
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cldImage(p.imageUrl, { width: 480 })} alt={p.name} loading="lazy" decoding="async"
            className={`w-full h-full ${p.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
        ) : <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">{productEmoji(p.name)}</div>}
      </button>

      <button onClick={onOpen} className="text-left">
        <h4 className="font-bold text-sm leading-tight line-clamp-2">{p.name}</h4>
        {p.description && <p className="text-[11px] mt-0.5 line-clamp-1 leading-snug" style={{ color: FAINT }}>{p.description}</p>}
      </button>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex flex-col leading-none min-w-0">
          {p.isPromo && <span className="text-[10px] line-through" style={{ color: '#FFFFFF40' }}>{fmt(p.price)}</span>}
          <span className="font-extrabold text-[16px]" style={{ color: GOLD }}>{fmt(price)}</span>
        </div>
        {line ? (
          <div className="flex items-center gap-1 rounded-full px-1 py-1 shrink-0" style={{ background: SOFT }}>
            <button onClick={() => remove(p.id)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: '#FFFFFFcc' }} aria-label="Quitar">
              {line.quantity > 1 ? <Minus className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
            <span className="text-sm font-extrabold w-4 text-center">{line.quantity}</span>
            <button onClick={() => add({ id: p.id, menuItemId: p.id, name: p.name, price })} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: GOLD, color: '#1A1A1A' }} aria-label="Agregar"><Plus className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button onClick={onOpen} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition" style={{ background: GOLD, color: '#1A1A1A', boxShadow: `0 6px 16px ${GOLD}55` }} aria-label={`Agregar ${p.name}`}>
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>
    </article>
  );
}

// ── CARRITO (panel) ─────────────────────────────────────────────────────────
function CartPanel({ onClose, onCheckout, onWhatsApp, waNumber, allItems, minOrder }: {
  onClose: () => void; onCheckout: () => void; onWhatsApp: () => void; waNumber: string; allItems: any[]; minOrder: number;
}) {
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());
  const belowMin = minOrder > 0 && total < minOrder;

  return (
    <div className="fixed inset-0 z-[100] flex sm:justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()}
        className="relative w-full sm:max-w-md sm:ml-auto mt-auto sm:mt-0 h-[92vh] sm:h-full flex flex-col rounded-t-[28px] sm:rounded-none"
        style={{ background: BG, borderLeft: `1px solid ${BORDER}` }}>
        {/* Encabezado */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <h2 className="text-xl font-extrabold" style={{ fontFamily: 'var(--font-syne), sans-serif' }}>Mi pedido</h2>
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>{quantity} {quantity === 1 ? 'artículo' : 'artículos'}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: SOFT }} aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        {/* Líneas */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center" style={{ color: MUTED }}>
              <ShoppingBag className="w-14 h-14 mb-4 opacity-25" />
              <p className="font-bold mb-1">Tu carrito está vacío</p>
              <p className="text-xs mb-6">Arma tu pedido del Mundial ⚽</p>
              <button onClick={onClose} className="px-6 py-3 rounded-full font-bold" style={{ background: GOLD, color: '#1A1A1A' }}>Ver el menú</button>
            </div>
          ) : lines.map(l => {
            const src = allItems.find((p: any) => p.id === l.menuItemId);
            return (
              <div key={l.id} className="flex items-center gap-3 p-2.5 rounded-[16px]" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="w-14 h-14 rounded-[12px] overflow-hidden shrink-0" style={{ background: '#FFFFFF08' }}>
                  {src?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cldImage(src.imageUrl, { width: 160 })} alt={l.name} loading="lazy" decoding="async" className={`w-full h-full ${src.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} />
                  ) : <div className="w-full h-full flex items-center justify-center text-lg opacity-30">{productEmoji(l.name)}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm leading-tight line-clamp-2">{l.name}</h4>
                  <p className="text-sm font-extrabold mt-0.5" style={{ color: GOLD }}>{fmt(l.price)}</p>
                </div>
                <div className="flex items-center gap-1 rounded-full px-1 py-1 shrink-0" style={{ background: SOFT }}>
                  <button onClick={() => remove(l.id)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: '#FFFFFFcc' }} aria-label="Quitar">
                    {l.quantity > 1 ? <Minus className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                  <span className="text-sm font-extrabold w-4 text-center">{l.quantity}</span>
                  <button onClick={() => add({ id: l.id, menuItemId: l.menuItemId, name: l.name, price: l.price, variantId: l.variantId, modifierIds: l.modifierIds })} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: GOLD, color: '#1A1A1A' }} aria-label="Agregar"><Plus className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pie: total + acciones */}
        {lines.length > 0 && (
          <div className="px-5 pt-4 pb-5 shrink-0 space-y-3" style={{ borderTop: `1px solid ${BORDER}`, background: '#0A0A0C' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Subtotal</p>
                <p className="text-[10px]" style={{ color: FAINT }}>Envío y descuentos se calculan al pagar</p>
              </div>
              <span className="text-2xl font-extrabold" style={{ color: GOLD }}>{fmt(total)}</span>
            </div>
            {belowMin && <p className="text-xs font-bold text-center" style={{ color: GOLD }}>Pedido mínimo: {fmt(minOrder)}.</p>}
            <button onClick={onCheckout} disabled={belowMin}
              className="w-full py-4 rounded-2xl font-extrabold active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: '#1A1A1A', boxShadow: `0 10px 26px ${GOLD}55` }}>
              Ir a pagar <ChevronRight className="w-5 h-5" />
            </button>
            {waNumber && (
              <button onClick={onWhatsApp} className="w-full py-3.5 rounded-2xl font-extrabold text-white active:scale-95 transition flex items-center justify-center gap-2" style={{ background: '#25D366' }}>
                <MessageCircle className="w-5 h-5" /> Pedir por WhatsApp
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
