'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useCart } from '../../lib/cartStore';

type MochiThemeProps = {
  data: {
    info: {
      id: string;
      name: string;
      slug: string;
      logo: string | null;
      hasWebStore: boolean;
      whatsappNumber: string | null;
      themeConfig: {
        theme?: string;
        primaryColor?: string;
      } | null;
    };
    menu: {
      categories: any[];
    };
    locations: any[];
  };
};

export function MochiTheme({ data }: MochiThemeProps) {
  const { info, menu, locations } = data;
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  // Zustand Cart Store
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());

  // Banners de la primera sucursal activa
  const banners = locations[0]?.banners || [];

  const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;

  return (
    <div className="pb-24 lg:pb-10 font-sans">
      
      {/* HEADER CON GLASSMORPHISM */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/70 border-b border-gray-100/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {info.logo ? (
              <img src={info.logo} alt="Logo" className="w-10 h-10 rounded-full object-cover shadow-sm" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-syne font-bold">
                {info.name.substring(0, 1)}
              </div>
            )}
            <h1 className="font-syne font-bold text-xl tracking-tight">{info.name || 'Mi Tienda'}</h1>
          </div>
          
          <button 
            onClick={() => setIsCartOpen(true)}
            className="relative p-3 rounded-full bg-primary-light text-primary hover:bg-primary hover:text-white transition-colors duration-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            {quantity > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold shadow-sm">
                {quantity}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* HERO BANNER */}
      {banners.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 mt-6">
          <div className="relative w-full h-[200px] md:h-[350px] rounded-saas overflow-hidden shadow-lg border border-gray-100">
            <img src={banners[0].imageUrl} alt={banners[0].title || 'Promo'} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-6 md:p-10">
              <h2 className="text-white font-syne font-bold text-2xl md:text-4xl tracking-tight">{banners[0].title}</h2>
            </div>
          </div>
        </section>
      )}

      {/* PRODUCTOS MENU */}
      <section className="max-w-7xl mx-auto px-4 mt-10">
        {menu.categories.map((category: any) => (
          <div key={category.id} className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              {category.imageUrl && <img src={category.imageUrl} className="w-8 h-8 object-contain" alt="" />}
              <h3 className="font-syne font-bold text-2xl text-gray-800 tracking-tight">{category.name}</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {(category.items || []).map((product: any) => {
                const line = lines.find(l => l.id === product.id);
                const price = product.isPromo && product.promoPrice ? product.promoPrice : product.price;
                
                return (
                  <article key={product.id} className="bg-white rounded-[32px] p-4 shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 flex flex-col group">
                    <div className="relative w-full aspect-square rounded-[24px] overflow-hidden bg-surface-2 mb-4">
                      {product.isPopular && (
                        <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-md text-gray-800 text-[10px] font-black px-3 py-1.5 rounded-full z-10 shadow-sm border border-gray-100">
                          ⭐ DESTACADO
                        </span>
                      )}
                      {product.isPromo && (
                        <span className="absolute top-3 right-3 bg-primary text-white text-[10px] font-black px-3 py-1.5 rounded-full z-10 shadow-sm">
                          OFERTA
                        </span>
                      )}
                      {product.imageUrl && (
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                      )}
                    </div>
                    
                    <div className="flex-1 flex flex-col">
                      <h4 className="font-syne font-bold text-base text-gray-800 leading-tight mb-1">{product.name}</h4>
                      {product.description && (
                        <p className="font-sans text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{product.description}</p>
                      )}
                      
                      <div className="mt-auto pt-4 flex items-center justify-between">
                        <div className="flex flex-col">
                          {product.isPromo && (
                            <span className="text-[10px] text-gray-400 line-through font-bold">{fmt(product.price)}</span>
                          )}
                          <span className="font-syne font-extrabold text-primary text-xl">
                            {fmt(price)}
                          </span>
                        </div>
                        
                        {line ? (
                          <div className="flex items-center bg-gray-50 rounded-2xl p-1 border border-gray-100">
                            <button 
                              onClick={() => remove(product.id)}
                              className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-lg font-bold hover:bg-gray-100 active:scale-90 transition-all"
                            >
                              −
                            </button>
                            <span className="font-bold text-sm w-8 text-center">{line.quantity}</span>
                            <button 
                              onClick={() => add({ id: product.id, name: product.name, price })}
                              className="w-8 h-8 rounded-xl bg-primary text-white shadow-sm flex items-center justify-center text-lg font-bold hover:opacity-90 active:scale-90 transition-all"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => add({ id: product.id, name: product.name, price })}
                            className="w-10 h-10 rounded-full bg-gray-50 text-gray-800 hover:bg-primary hover:text-white transition-all duration-300 flex items-center justify-center font-bold text-xl shadow-sm border border-gray-100"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* CARRITO OFF-CANVAS */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsCartOpen(false)}></div>
          
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl rounded-l-[40px] flex flex-col transform transition-transform animate-slide-in-right">
            <div className="p-8 border-b border-gray-50 flex justify-between items-center">
              <div>
                <h2 className="font-syne font-bold text-3xl tracking-tight">Tu Pedido</h2>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">
                  {quantity} {quantity === 1 ? 'artículo' : 'artículos'}
                </p>
              </div>
              <button onClick={() => setIsCartOpen(false)} className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:text-gray-800 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {lines.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <span className="text-6xl mb-4 opacity-20">🛒</span>
                  <p className="text-gray-400 font-bold">Tu carrito está vacío</p>
                  <button 
                    onClick={() => setIsCartOpen(false)}
                    className="mt-4 text-primary font-bold text-sm uppercase tracking-widest"
                  >
                    Volver al menú
                  </button>
                </div>
              ) : (
                lines.map(line => (
                  <div key={line.id} className="flex items-center gap-4 group">
                    <div className="w-16 h-16 rounded-2xl bg-gray-50 flex-none overflow-hidden border border-gray-100">
                      {/* Aquí podríamos buscar la imagen del producto si estuviera en el store */}
                      <div className="w-full h-full flex items-center justify-center text-xl">🍔</div>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-800 leading-tight">{line.name}</h4>
                      <p className="text-xs text-gray-400 font-medium">{fmt(line.price)} x {line.quantity}</p>
                    </div>
                    <div className="flex items-center gap-3">
                       <button onClick={() => remove(line.id)} className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center font-bold text-gray-400 hover:text-red-500 transition-colors">−</button>
                       <span className="font-bold text-sm">{line.quantity}</span>
                       <button onClick={() => add({ id: line.id, name: line.name, price: line.price })} className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center font-bold text-gray-800 hover:bg-primary hover:text-white transition-all">+</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="p-8 bg-gray-50/50 rounded-bl-[40px] border-t border-gray-100">
              <div className="flex justify-between items-end mb-8">
                <div>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">Total Estimado</p>
                  <p className="font-syne font-extrabold text-4xl text-gray-900">{fmt(total)}</p>
                </div>
              </div>
              <button 
                disabled={quantity === 0}
                className="w-full py-5 rounded-[24px] bg-primary text-white font-syne font-bold text-xl shadow-xl shadow-primary/30 hover:shadow-primary/40 active:scale-95 transition-all disabled:opacity-50 disabled:shadow-none"
              >
                Confirmar Pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
