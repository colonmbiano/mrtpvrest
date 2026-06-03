'use client';

import { useState } from 'react';
import { useCart } from '../../lib/cartStore';
import StoreCheckout from '../StoreCheckout';
import type { DeliveryConfig } from '../../lib/delivery';

type BentoThemeProps = {
  data: {
    info: {
      id: string;
      name: string;
      slug: string;
      logo: string | null;
      hasWebStore: boolean;
      whatsappNumber: string | null;
      minOrderAmount?: number;
      delivery?: DeliveryConfig;
      themeConfig: { theme?: string; primaryColor?: string } | null;
    };
    menu: { categories: any[] };
    locations: any[];
  };
};

// BENTO — diseño bento-grid oscuro con acentos HUD/sci-fi. Identidad de marca:
// fondo obsidiana, acento ámbar, verde salvia para precios. Glassmorphism.
export function BentoTheme({ data }: BentoThemeProps) {
  const { info, menu, locations } = data;
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string>(menu.categories[0]?.id ?? '');

  const accent = info.themeConfig?.primaryColor || '#FFB84D';

  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());

  const banners = locations[0]?.banners || [];
  const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;

  const glass = { background: '#FFFFFF08', border: '1px solid #FFFFFF14', backdropFilter: 'blur(12px)' } as React.CSSProperties;

  return (
    <div className="min-h-screen pb-28 relative overflow-hidden" style={{ background: '#0C0C0E', color: '#FFFFFF', fontFamily: 'Outfit, sans-serif' }}>
      {/* Glows ambientales */}
      <div aria-hidden className="pointer-events-none fixed -top-40 -left-32 w-[600px] h-[600px] rounded-full opacity-25"
        style={{ background: `radial-gradient(circle, ${accent}40 0%, transparent 70%)` }} />
      <div aria-hidden className="pointer-events-none fixed top-[500px] -right-24 w-[500px] h-[500px] rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #88D66C30 0%, transparent 70%)' }} />

      {/* HEADER glass */}
      <header className="sticky top-0 z-40 backdrop-blur-xl" style={{ background: '#0C0C0EAA', borderBottom: '1px solid #FFFFFF12' }}>
        <div className="max-w-6xl mx-auto px-5 h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            {info.logo ? (
              <img src={info.logo} alt={info.name} className="w-11 h-11 rounded-2xl object-cover" style={{ border: `1px solid ${accent}50` }} />
            ) : (
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold" style={{ background: `${accent}20`, color: accent }}>
                {info.name.substring(0, 1)}
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5 text-[9px] font-bold mb-0.5" style={{ color: '#88D66C' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#88D66C' }} /> ABIERTO
              </div>
              <h1 className="font-bold text-lg leading-none tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>{info.name || 'Mi Tienda'}</h1>
            </div>
          </div>

          <button onClick={() => setIsCartOpen(true)} className="relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90" style={glass}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            {quantity > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-black" style={{ background: accent }}>
                {quantity}
              </span>
            )}
          </button>
        </div>

        {/* Categorías */}
        <nav className="max-w-6xl mx-auto px-5 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
          {menu.categories.map((cat: any) => {
            const active = activeCat === cat.id;
            return (
              <button key={cat.id}
                onClick={() => { setActiveCat(cat.id); document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                className="whitespace-nowrap px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide transition-all"
                style={active
                  ? { background: accent, color: '#0C0C0E', boxShadow: `0 6px 16px ${accent}50` }
                  : { background: '#FFFFFF08', color: '#FFFFFF70', border: '1px solid #FFFFFF14' }}>
                {cat.name}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-5 mt-6">
        {/* Hero banner en celda bento grande */}
        {banners.length > 0 && (
          <div className="relative w-full h-[200px] md:h-[280px] rounded-[28px] overflow-hidden mb-5" style={{ border: '1px solid #FFFFFF14' }}>
            <img src={banners[0].imageUrl} alt={banners[0].title || 'Promo'} className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-end p-6" style={{ background: 'linear-gradient(to top, #0C0C0EE6, transparent)' }}>
              <div>
                <span className="text-[9px] font-bold px-2 py-1 rounded" style={{ background: `${accent}25`, color: accent }}>🔥 DESTACADO</span>
                <h2 className="text-2xl md:text-3xl font-bold mt-2" style={{ fontFamily: 'Syne, sans-serif' }}>{banners[0].title}</h2>
              </div>
            </div>
          </div>
        )}

        {/* Bento grid de productos por categoría */}
        {menu.categories.map((category: any) => (
          <section key={category.id} id={`cat-${category.id}`} className="mb-10 scroll-mt-40">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 rounded-full" style={{ background: accent }} />
              <h3 className="text-lg font-bold uppercase tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>{category.name}</h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 auto-rows-[1fr]">
              {(category.items || []).map((product: any, i: number) => {
                const line = lines.find(l => l.id === product.id);
                const price = product.isPromo && product.promoPrice ? product.promoPrice : product.price;
                // Bento: cada 5º producto ocupa 2 columnas (ritmo asimétrico).
                const wide = i % 5 === 0;
                return (
                  <article key={product.id}
                    className={`rounded-[24px] p-3 flex flex-col group transition-all hover:-translate-y-0.5 ${wide ? 'col-span-2 md:col-span-2' : ''}`}
                    style={glass}>
                    <div className={`relative w-full rounded-[18px] overflow-hidden mb-3 ${wide ? 'aspect-[2/1]' : 'aspect-square'}`} style={{ background: '#FFFFFF06' }}>
                      {product.isPromo && (
                        <span className="absolute top-2 right-2 z-10 text-[9px] font-bold px-2 py-1 rounded-full text-black" style={{ background: accent }}>OFERTA</span>
                      )}
                      {product.isPopular && (
                        <span className="absolute top-2 left-2 z-10 text-[9px] font-bold px-2 py-1 rounded-full" style={{ background: '#0C0C0Ecc', color: accent, border: `1px solid ${accent}50` }}>⭐</span>
                      )}
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">🍔</div>
                      )}
                    </div>

                    <div className="flex-1 flex flex-col">
                      <h4 className="font-bold text-sm leading-tight" style={{ fontFamily: 'Syne, sans-serif' }}>{product.name}</h4>
                      {product.description && (
                        <p className="text-[11px] mt-1 line-clamp-2 leading-snug" style={{ color: '#FFFFFF55' }}>{product.description}</p>
                      )}
                      <div className="mt-auto pt-3 flex items-center justify-between">
                        <div className="flex flex-col">
                          {product.isPromo && <span className="text-[10px] line-through font-bold" style={{ color: '#FFFFFF40' }}>{fmt(product.price)}</span>}
                          <span className="font-bold text-base" style={{ color: '#88D66C' }}>{fmt(price)}</span>
                        </div>
                        {line ? (
                          <div className="flex items-center gap-1 rounded-xl px-1.5 py-1" style={{ background: '#FFFFFF0c' }}>
                            <button onClick={() => remove(product.id)} className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-lg" style={{ color: '#FFFFFF99' }}>−</button>
                            <span className="text-sm font-bold w-5 text-center">{line.quantity}</span>
                            <button onClick={() => add({ id: product.id, name: product.name, price })} className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-lg text-black" style={{ background: accent }}>+</button>
                          </div>
                        ) : (
                          <button onClick={() => add({ id: product.id, name: product.name, price })}
                            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xl text-black active:scale-90 transition-all"
                            style={{ background: accent, boxShadow: `0 4px 12px ${accent}40` }}>+</button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {/* Barra flotante carrito */}
      {quantity > 0 && !isCartOpen && (
        <div className="fixed bottom-5 left-4 right-4 z-40 max-w-lg mx-auto">
          <button onClick={() => setIsCartOpen(true)}
            className="w-full flex items-center justify-between px-5 py-4 rounded-[22px] font-bold uppercase tracking-widest text-black active:scale-95 transition-all"
            style={{ background: accent, boxShadow: `0 10px 30px ${accent}55` }}>
            <span className="text-xs flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-lg text-[11px]" style={{ background: '#0C0C0E25' }}>{quantity}</span>
              Ver mi pedido
            </span>
            <span className="text-base">{fmt(total)}</span>
          </button>
        </div>
      )}

      {/* Carrito off-canvas */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-md h-full flex flex-col" style={{ background: '#111114', borderLeft: '1px solid #FFFFFF14' }}>
            <div className="p-6 flex justify-between items-center" style={{ borderBottom: '1px solid #FFFFFF12' }}>
              <div>
                <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Syne, sans-serif' }}>Tu Pedido</h2>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: '#FFFFFF50' }}>
                  {quantity} {quantity === 1 ? 'artículo' : 'artículos'}
                </p>
              </div>
              <button onClick={() => setIsCartOpen(false)} className="w-10 h-10 rounded-xl flex items-center justify-center" style={glass}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {lines.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <span className="text-5xl mb-4 opacity-20">🛒</span>
                  <p className="font-bold" style={{ color: '#FFFFFF60' }}>Tu carrito está vacío</p>
                </div>
              ) : (
                lines.map(line => (
                  <div key={line.id} className="flex items-center gap-3 rounded-2xl p-3" style={glass}>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm truncate" style={{ fontFamily: 'Syne, sans-serif' }}>{line.name}</h4>
                      <p className="text-xs" style={{ color: '#88D66C' }}>{fmt(line.price)} × {line.quantity}</p>
                    </div>
                    <div className="flex items-center gap-1 rounded-xl px-1.5 py-1" style={{ background: '#FFFFFF0c' }}>
                      <button onClick={() => remove(line.id)} className="w-7 h-7 font-bold text-lg" style={{ color: '#FFFFFF99' }}>−</button>
                      <span className="text-sm font-bold w-5 text-center">{line.quantity}</span>
                      <button onClick={() => add({ id: line.id, name: line.name, price: line.price })} className="w-7 h-7 font-bold text-lg text-black rounded-lg" style={{ background: accent }}>+</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {lines.length > 0 && (
              <div className="p-6" style={{ borderTop: '1px solid #FFFFFF12' }}>
                <div className="flex justify-between items-end mb-5">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#FFFFFF50' }}>Total estimado</span>
                  <span className="text-3xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{fmt(total)}</span>
                </div>
                <button onClick={() => { setIsCartOpen(false); setCheckoutOpen(true); }}
                  className="w-full py-4 rounded-[20px] font-bold text-base uppercase tracking-widest text-black active:scale-95 transition-all"
                  style={{ background: accent, boxShadow: `0 8px 24px ${accent}50` }}>
                  Confirmar Pedido
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <StoreCheckout
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        slug={info.slug}
        primary={accent}
        locations={locations}
        delivery={info.delivery}
        minOrderAmount={info.minOrderAmount}
      />

      <style dangerouslySetInnerHTML={{ __html: `.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}` }} />
    </div>
  );
}
