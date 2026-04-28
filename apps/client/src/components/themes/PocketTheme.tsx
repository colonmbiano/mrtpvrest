'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { useCart } from '../../lib/cartStore';

export function PocketTheme({ data }: { data: any }) {
  const { info, menu, locations } = data;
  
  // Zustand Cart Store
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());

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
        
        {/* Banner Hero Reducido (App Style) */}
        {banners.length > 0 && (
          <div className="relative w-full h-[160px] rounded-saas overflow-hidden mb-6 shadow-md border border-gray-100">
             <img src={banners[0].imageUrl} alt={banners[0].title || 'Promo'} className="w-full h-full object-cover" />
             <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-5">
               <h2 className="text-white font-syne font-bold text-xl leading-tight">{banners[0].title}</h2>
             </div>
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
                        onClick={() => add({ id: product.id, name: product.name, price })}
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
      {quantity > 0 && (
        <div className="fixed bottom-6 left-4 right-4 z-50 animate-slide-up">
          <button className="w-full bg-primary text-white p-5 rounded-[28px] shadow-2xl shadow-primary/40 flex items-center justify-between active:scale-95 transition-transform overflow-hidden relative">
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
    </div>
  );
}
