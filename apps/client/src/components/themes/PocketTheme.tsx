'use client';

import { useState, useRef, useMemo } from 'react';
import { useCart } from '../../lib/cartStore';
import StoreCheckout from '../StoreCheckout';
import BannerCarousel from '../BannerCarousel';
import ProductModal, { needsModal } from '../ProductModal';

export function PocketTheme({ data }: { data: any }) {
  const { info, menu, locations } = data;
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [modalProduct, setModalProduct] = useState<any>(null);
  const [search, setSearch] = useState('');
  const primary = info.themeConfig?.primaryColor || '#ff5c35';

  // Tintes dinámicos a partir del color de marca (hex de 8 dígitos = color + alpha).
  const tint = (alpha: string) => `${primary}${alpha}`;

  // Zustand Cart Store
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());

  // Abrir personalización si el producto tiene variantes/modificadores; si no, agregar directo.
  const pick = (p: any) => {
    if (needsModal(p)) { setModalProduct(p); return; }
    const price = p.isPromo && p.promoPrice ? p.promoPrice : p.price;
    add({ id: p.id, menuItemId: p.id, name: p.name, price });
  };

  const categories = menu.categories || [];
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id);

  // Referencias para hacer scroll a la categoría
  const categoryRefs = useRef<{ [key: string]: HTMLElement | null }>({});

  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    categoryRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const banners = locations[0]?.banners || [];
  const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;

  // "Lo más pedido": productos marcados como populares en cualquier categoría.
  const popular = useMemo(
    () => categories.flatMap((c: any) => c.items || []).filter((p: any) => p.isPopular).slice(0, 12),
    [categories]
  );

  // Búsqueda: filtra productos por nombre/descripción y oculta categorías vacías.
  const visibleCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((c: any) => ({
        ...c,
        items: (c.items || []).filter(
          (p: any) =>
            p.name?.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q)
        ),
      }))
      .filter((c: any) => c.items.length > 0);
  }, [categories, search]);

  const noResults = search.trim() && visibleCategories.length === 0;
  const estDelivery = info.estimatedDelivery || info.delivery?.estimatedDelivery;
  const minOrder = info.minOrderAmount || 0;

  // Imagen de producto con placeholder elegante de marca cuando no hay foto.
  const ProductImage = ({ product, className = '' }: { product: any; className?: string }) =>
    product.imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={product.imageUrl} alt={product.name} className={`object-cover ${className}`} />
    ) : (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ background: `linear-gradient(135deg, ${tint('22')}, ${tint('0D')})` }}
      >
        <span
          className="font-syne font-extrabold opacity-80 select-none text-4xl"
          style={{ color: primary }}
        >
          {(product.name?.[0] || '🍴').toUpperCase()}
        </span>
      </div>
    );

  return (
    <div className="min-h-screen bg-[#F5F5F7] pb-32 font-sans text-gray-900">

      {/* ───────────────────────── HEADER STICKY ───────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] rounded-b-[28px]">
        <div className="px-5 pt-6 pb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 font-black tracking-[0.18em] uppercase">Entregando desde</p>
            <h1 className="font-syne font-bold text-xl text-gray-900 flex items-center gap-1.5 truncate">
              <span className="truncate">{info.name}</span>
              <svg className="w-4 h-4 shrink-0" style={{ color: primary }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            </h1>
          </div>
          {info.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={info.logo}
              alt={info.name}
              className="w-12 h-12 rounded-2xl object-cover shadow-md ring-2 ring-white shrink-0"
            />
          )}
        </div>

        {/* Pastillas de info: tiempo de entrega / pedido mínimo / abierto */}
        <div className="px-5 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <span
            className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-full"
            style={{ background: tint('14'), color: primary }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Abierto
          </span>
          {estDelivery ? (
            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-full bg-gray-100 text-gray-600">
              🛵 {estDelivery} min
            </span>
          ) : null}
          {minOrder > 0 && (
            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-full bg-gray-100 text-gray-600">
              Mínimo {fmt(minOrder)}
            </span>
          )}
        </div>

        {/* Búsqueda funcional */}
        <div className="px-5 mt-3">
          <div className="w-full bg-gray-100 h-12 rounded-2xl flex items-center px-4 focus-within:ring-2 transition-all" style={{ ['--tw-ring-color' as any]: primary }}>
            <svg className="w-5 h-5 mr-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="¿Qué se te antoja hoy?"
              className="flex-1 bg-transparent outline-none text-sm font-medium text-gray-900 placeholder:text-gray-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="ml-2 text-gray-400 shrink-0" aria-label="Limpiar búsqueda">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* Navegación de categorías tipo píldora (oculta durante la búsqueda) */}
        {!search.trim() && categories.length > 0 && (
          <nav className="flex overflow-x-auto gap-2.5 px-5 mt-4 pb-3 no-scrollbar">
            {categories.map((cat: any) => {
              const activeCat = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => scrollToCategory(cat.id)}
                  className="whitespace-nowrap px-5 py-2.5 rounded-full text-xs font-black tracking-wide transition-all"
                  style={
                    activeCat
                      ? { background: '#111827', color: '#fff', transform: 'scale(1.05)', boxShadow: '0 8px 18px rgba(0,0,0,0.18)' }
                      : { background: '#fff', color: '#6b7280', border: '1px solid #f1f1f4' }
                  }
                >
                  {cat.name}
                </button>
              );
            })}
          </nav>
        )}
      </header>

      {/* ───────────────────────── CONTENIDO ───────────────────────── */}
      <main className="px-4 mt-4">

        {/* Banners de promociones */}
        {!search.trim() && banners.length > 0 && (
          <div className="mb-6">
            <BannerCarousel banners={banners} variant="light" accent={primary} />
          </div>
        )}

        {/* LO MÁS PEDIDO — carrusel horizontal con imagen protagonista */}
        {!search.trim() && popular.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between px-1 mb-4">
              <h2 className="font-syne font-bold text-xl text-gray-900 flex items-center gap-2">
                <span>🔥</span> Lo más pedido
              </h2>
            </div>
            <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2 snap-x">
              {popular.map((product: any) => {
                const price = product.isPromo && product.promoPrice ? product.promoPrice : product.price;
                return (
                  <article
                    key={`pop-${product.id}`}
                    className="snap-start shrink-0 w-44 bg-white rounded-[26px] shadow-sm border border-gray-50 overflow-hidden active:scale-[0.98] transition-transform"
                  >
                    <div className="relative h-32 w-full">
                      <ProductImage product={product} className="w-full h-full" />
                      {product.isPromo && product.promoPrice && (
                        <span className="absolute top-2 left-2 text-[9px] font-black text-white px-2 py-1 rounded-full" style={{ background: primary }}>
                          OFERTA
                        </span>
                      )}
                      <button
                        onClick={() => pick(product)}
                        className="absolute -bottom-3 right-3 w-10 h-10 rounded-2xl shadow-xl text-white font-bold text-2xl flex items-center justify-center active:scale-90 transition-all"
                        style={{ background: primary }}
                        aria-label={`Agregar ${product.name}`}
                      >
                        +
                      </button>
                    </div>
                    <div className="p-4 pt-5">
                      <h4 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2 min-h-[2.5rem]">{product.name}</h4>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="font-syne font-bold text-gray-900 text-base">{fmt(price)}</span>
                        {product.isPromo && product.promoPrice && (
                          <span className="text-[10px] text-gray-300 line-through font-bold">{fmt(product.price)}</span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Sin resultados de búsqueda */}
        {noResults && (
          <div className="py-20 text-center">
            <span className="text-5xl opacity-20 block mb-3">🔍</span>
            <p className="text-gray-500 font-bold">No encontramos «{search}»</p>
            <button onClick={() => setSearch('')} className="mt-3 text-sm font-bold" style={{ color: primary }}>
              Ver todo el menú
            </button>
          </div>
        )}

        {/* MENÚ POR CATEGORÍA — tarjetas con imagen protagonista */}
        {visibleCategories.map((category: any) => (
          <section
            key={category.id}
            // @ts-ignore
            ref={(el) => (categoryRefs.current[category.id] = el)}
            className="mb-9 pt-2 scroll-mt-52"
          >
            <h3 className="font-syne font-bold text-2xl text-gray-900 mb-5 px-1">{category.name}</h3>

            <div className="flex flex-col gap-3.5">
              {(category.items || []).map((product: any) => {
                const price = product.isPromo && product.promoPrice ? product.promoPrice : product.price;
                return (
                  <article
                    key={product.id}
                    onClick={() => pick(product)}
                    className="group bg-white p-3 rounded-[26px] shadow-sm flex items-center gap-4 border border-gray-50 active:scale-[0.98] transition-all cursor-pointer hover:shadow-md"
                  >
                    {/* Imagen protagonista */}
                    <div className="relative w-[104px] h-[104px] shrink-0">
                      <ProductImage product={product} className="w-full h-full rounded-[20px] shadow-sm" />
                      {product.isPromo && product.promoPrice && (
                        <span className="absolute top-1.5 left-1.5 text-[8px] font-black text-white px-1.5 py-0.5 rounded-full" style={{ background: primary }}>
                          OFERTA
                        </span>
                      )}
                    </div>

                    {/* Textos */}
                    <div className="flex-1 min-w-0 py-1">
                      <div className="flex items-start gap-2 mb-1">
                        <h4 className="font-bold text-gray-900 text-[15px] leading-snug line-clamp-2">{product.name}</h4>
                        {product.isPopular && (
                          <span className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter" style={{ background: tint('1A'), color: primary }}>
                            ⭐
                          </span>
                        )}
                      </div>
                      {product.description && (
                        <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed pr-2">{product.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="font-syne font-bold text-gray-900 text-lg">{fmt(price)}</span>
                        {product.isPromo && product.promoPrice && (
                          <span className="text-[10px] text-gray-300 line-through font-bold">{fmt(product.price)}</span>
                        )}
                        {needsModal(product) && (
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wide">· Personalizable</span>
                        )}
                      </div>
                    </div>

                    {/* Botón agregar */}
                    <button
                      onClick={(e) => { e.stopPropagation(); pick(product); }}
                      className="self-center shrink-0 w-11 h-11 rounded-2xl shadow-lg text-white font-bold text-2xl flex items-center justify-center active:scale-90 transition-all"
                      style={{ background: primary, boxShadow: `0 8px 18px ${tint('55')}` }}
                      aria-label={`Agregar ${product.name}`}
                    >
                      +
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {/* ─────────────── BOTTOM BAR — CARRITO FLOTANTE ─────────────── */}
      {quantity > 0 && !cartOpen && (
        <div className="fixed bottom-5 left-4 right-4 z-[70] animate-slide-up">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full text-white px-5 py-4 rounded-[26px] shadow-2xl flex items-center justify-between active:scale-95 transition-transform overflow-hidden relative"
            style={{ background: primary, boxShadow: `0 16px 36px ${tint('66')}` }}
          >
            <div className="flex items-center gap-3.5 relative z-10">
              <div className="bg-white/20 backdrop-blur-md w-10 h-10 rounded-2xl flex items-center justify-center font-black text-base">
                {quantity}
              </div>
              <span className="font-syne font-bold text-base uppercase tracking-[0.15em]">Ver mi pedido</span>
            </div>
            <span className="font-syne font-extrabold text-xl relative z-10">{fmt(total)}</span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_2.5s_infinite]" />
          </button>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes slideUp { from { transform: translateY(120px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes shimmer { 100% { transform: translateX(100%); } }
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-sheet { animation: sheetUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}} />

      {/* ─────────────── CARRITO (bottom sheet) ─────────────── */}
      {cartOpen && (
        <div className="fixed inset-0 z-[80] flex items-end" onClick={() => setCartOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full bg-white rounded-t-[32px] max-h-[88vh] flex flex-col shadow-2xl animate-sheet" onClick={e => e.stopPropagation()}>
            {/* Handle */}
            <div className="pt-3 flex justify-center">
              <div className="w-10 h-1.5 rounded-full bg-gray-200" />
            </div>
            <div className="px-6 pt-3 pb-4 flex items-center justify-between border-b border-gray-100">
              <div>
                <h2 className="font-syne font-bold text-2xl text-gray-900">Tu pedido</h2>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-0.5">{quantity} {quantity === 1 ? 'artículo' : 'artículos'}</p>
              </div>
              <button onClick={() => setCartOpen(false)} className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500" aria-label="Cerrar">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {lines.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="text-5xl opacity-20 block mb-3">🛒</span>
                  <p className="text-gray-400 font-bold">Tu carrito está vacío</p>
                </div>
              ) : (
                lines.map((line: any) => (
                  <div key={line.id} className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3 border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-gray-900 text-sm leading-tight">{line.name}</h4>
                      <p className="text-xs font-bold mt-0.5" style={{ color: primary }}>{fmt(line.price)} × {line.quantity} = {fmt(line.price * line.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-2 bg-white rounded-xl p-1 border border-gray-100">
                      <button onClick={() => remove(line.id)} className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-lg text-gray-500" aria-label="Quitar uno">−</button>
                      <span className="text-sm font-bold w-5 text-center">{line.quantity}</span>
                      <button onClick={() => add({ id: line.id, menuItemId: line.menuItemId, name: line.name, price: line.price, variantId: line.variantId, modifierIds: line.modifierIds })} className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-lg text-white" style={{ background: primary }} aria-label="Agregar uno">+</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {lines.length > 0 && (
              <div className="p-6 border-t border-gray-100" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-400">Subtotal</span>
                  <span className="font-syne font-extrabold text-3xl text-gray-900">{fmt(total)}</span>
                </div>
                <button onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}
                  className="w-full py-4 rounded-[22px] text-white font-syne font-bold text-lg uppercase tracking-widest active:scale-95 transition-all"
                  style={{ background: primary, boxShadow: `0 12px 28px ${tint('55')}` }}>
                  Continuar al pago
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {modalProduct && (
        <ProductModal product={modalProduct} accent={primary} variant="light" onClose={() => setModalProduct(null)} />
      )}

      <StoreCheckout
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        slug={info.slug}
        primary={primary}
        locations={locations}
        delivery={info.delivery}
        minOrderAmount={info.minOrderAmount}
        onlinePayment={info.onlinePayment}
      />
    </div>
  );
}
