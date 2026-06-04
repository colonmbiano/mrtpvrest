'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { useCart } from '../../lib/cartStore';
import StoreCheckout from '../StoreCheckout';
import BannerCarousel from '../BannerCarousel';
import ProductModal, { needsModal } from '../ProductModal';

export function PocketTheme({ data }: { data: any }) {
  const { info, menu, locations } = data;
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [modalProduct, setModalProduct] = useState<any>(null);
  const primary = info.themeConfig?.primaryColor || '#ff5c35';

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

  return (
    // Fondo más claro para destacar las tarjetas
    <div className="min-h-screen bg-[#F4F4F6] pb-28 font-sans">
      
      {/* 1. APP HEADER: Minimalista y pegajoso */}
      <header className="sticky top-0 z-40 bg-white shadow-sm pb-3 rounded-b-[24px]">
        <div className="px-5 pt-6 pb-2 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-400 font-black tracking-widest uppercase">Entregando desde</p>
            <h1 className="font-syne font-bold text-lg text-gray-900 flex items-center gap-1">
              {info.name}
              <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            </h1>
          </div>
          {info.logo && (
            <img src={info.logo} alt="Logo" className="w-10 h-10 rounded-full bg-gray-100 object-cover shadow-sm" />
          )}
        </div>

        {/* Búsqueda Rápida (Falsa por ahora) */}
        <div className="px-5 mt-2">
          <div className="w-full bg-gray-100 h-11 rounded-2xl flex items-center px-4 text-gray-400 border border-gray-100">
            <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-sm font-medium">¿Qué se te antoja hoy?</span>
          </div>
        </div>

        {/* 2. NAVEGACIÓN DE CATEGORÍAS TIPO PÍLDORA (Scroll Horizontal) */}
        <nav className="flex overflow-x-auto gap-2.5 px-5 mt-4 pb-2 no-scrollbar">
          {categories.map((cat: any) => (
            <button
              key={cat.id}
              onClick={() => scrollToCategory(cat.id)}
              className={`whitespace-nowrap px-5 py-2.5 rounded-full text-xs font-black tracking-wide transition-all ${
                activeCategory === cat.id 
                  ? 'bg-gray-900 text-white shadow-lg scale-105' 
                  : 'bg-white text-gray-500 border border-gray-100'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </nav>
      </header>

      {/* 3. CONTENIDO PRINCIPAL */}
      <main className="px-4 mt-4">
        
        {/* Banners de promociones (carrusel) */}
        {banners.length > 0 && (
          <div className="mb-6">
            <BannerCarousel banners={banners} variant="light" accent={primary} />
          </div>
        )}

        {/* Lista de Productos (List View para facilitar tap con el pulgar) */}
        {categories.map((category: any) => (
          <div 
            key={category.id} 
            // @ts-ignore
            ref={(el) => (categoryRefs.current[category.id] = el)} 
            className="mb-8 pt-4 scroll-mt-48"
          >
            <h3 className="font-syne font-bold text-xl text-gray-900 mb-5 px-1">{category.name}</h3>
            
            <div className="flex flex-col gap-3">
              {(category.items || []).map((product: any) => {
                const price = product.isPromo && product.promoPrice ? product.promoPrice : product.price;
                return (
                  <article key={product.id} className="bg-white p-4 rounded-[28px] shadow-sm flex items-center gap-4 border border-gray-50 active:scale-[0.98] transition-transform">
                    {/* Textos a la izquierda */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-gray-900 text-base truncate leading-none">{product.name}</h4>
                        {product.isPopular && (
                          <span className="shrink-0 text-[8px] text-primary font-black bg-primary-light px-1.5 py-0.5 rounded-full uppercase tracking-tighter">⭐ POPULAR</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed pr-2">{product.description}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="font-syne font-bold text-gray-900 text-lg">{fmt(price)}</span>
                        {product.isPromo && product.promoPrice && (
                          <span className="text-[10px] text-gray-300 line-through font-bold">{fmt(product.price)}</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Imagen y botón a la derecha */}
                    <div className="relative w-[100px] h-[100px] shrink-0">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover rounded-[22px] shadow-sm" />
                      ) : (
                        <div className="w-full h-full bg-surface-2 rounded-[22px] flex items-center justify-center text-2xl">🍔</div>
                      )}
                      <button
                        onClick={() => pick(product)}
                        className="absolute -bottom-1 -right-1 w-9 h-9 bg-white border border-gray-100 rounded-2xl shadow-xl text-primary font-bold text-2xl flex items-center justify-center active:scale-90 transition-all hover:bg-gray-50"
                      >
                        +
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </main>

      {/* 4. BOTTOM BAR - CARRITO FLOTANTE (Solo visible si hay ítems) */}
      {quantity > 0 && !cartOpen && (
        <div className="fixed bottom-6 left-4 right-4 z-50 animate-slide-up">
          <button onClick={() => setCartOpen(true)} className="w-full bg-primary text-white p-5 rounded-[28px] shadow-2xl shadow-primary/40 flex items-center justify-between active:scale-95 transition-transform overflow-hidden relative">
            <div className="flex items-center gap-4 relative z-10">
              <div className="bg-white/20 backdrop-blur-md w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm">
                {quantity}
              </div>
              <span className="font-syne font-bold text-base uppercase tracking-widest">Ver mi pedido</span>
            </div>
            <span className="font-syne font-extrabold text-xl relative z-10">{fmt(total)}</span>
            
            {/* Efecto de brillo sutil */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
          </button>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes slideUp { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes shimmer { 100% { transform: translateX(100%); } }
      `}} />

      {/* CARRITO (bottom sheet) — revisar productos antes de pagar */}
      {cartOpen && (
        <div className="fixed inset-0 z-[60] flex items-end" onClick={() => setCartOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full bg-white rounded-t-[32px] max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 flex items-center justify-between border-b border-gray-100">
              <div>
                <h2 className="font-syne font-bold text-2xl text-gray-900">Tu Pedido</h2>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-0.5">{quantity} {quantity === 1 ? 'artículo' : 'artículos'}</p>
              </div>
              <button onClick={() => setCartOpen(false)} className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500">
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
                      <h4 className="font-bold text-gray-900 text-sm truncate">{line.name}</h4>
                      <p className="text-xs font-bold" style={{ color: primary }}>{fmt(line.price)} × {line.quantity}</p>
                    </div>
                    <div className="flex items-center gap-2 bg-white rounded-xl p-1 border border-gray-100">
                      <button onClick={() => remove(line.id)} className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-lg text-gray-500">−</button>
                      <span className="text-sm font-bold w-5 text-center">{line.quantity}</span>
                      <button onClick={() => add({ id: line.id, menuItemId: line.menuItemId, name: line.name, price: line.price, variantId: line.variantId, modifierIds: line.modifierIds })} className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-lg text-white" style={{ background: primary }}>+</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {lines.length > 0 && (
              <div className="p-6 border-t border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-400">Subtotal</span>
                  <span className="font-syne font-extrabold text-3xl text-gray-900">{fmt(total)}</span>
                </div>
                <button onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}
                  className="w-full py-4 rounded-[22px] text-white font-syne font-bold text-lg uppercase tracking-widest active:scale-95 transition-all"
                  style={{ background: primary, boxShadow: `0 10px 24px ${primary}55` }}>
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
