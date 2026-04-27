'use client';

import { useMemo, useRef, useState } from 'react';
import { useCart } from '../../lib/cartStore';

type StoreProps = {
  id: string;
  name: string;
  logo: string | null;
  whatsappNumber: string | null;
  primaryColor: string;
  slug?: string;
};

const fmt = (n: number) => `$${n.toFixed(0)}`;

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function StorefrontClient({
  store,
  categories,
}: {
  store: StoreProps;
  categories: any[];
}) {
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const clear = useCart(s => s.clear);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());

  const [activeCat, setActiveCat] = useState<string>(categories[0]?.id ?? '');
  const catRefs = useRef<Record<string, HTMLElement | null>>({});

  // Checkout states
  const [showCheckout, setShowCheckout] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<any>(null);

  function scrollTo(catId: string) {
    setActiveCat(catId);
    catRefs.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleSendOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName || !deliveryAddress) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/api/store/orders?r=${encodeURIComponent(store.slug || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerPhone,
          deliveryAddress,
          orderType: 'DELIVERY',
          paymentMethod: 'CASH',
          items: lines.map(l => ({
            menuItemId: l.id,
            quantity: l.quantity,
          })),
        })
      });

      if (!res.ok) throw new Error('Error creating order');
      const data = await res.json();
      setOrderSuccess(data);
      clear();
    } catch (err) {
      alert("Hubo un problema al enviar tu pedido. Inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const primary = store.primaryColor;

  if (orderSuccess) {
    return (
      <div className="max-w-lg mx-auto min-h-screen flex items-center justify-center p-6 text-center bg-surface-1">
        <div className="bg-white p-10 rounded-[40px] shadow-premium w-full border border-gray-100">
          <div className="text-7xl mb-6">🎉</div>
          <h1 className="text-3xl font-display font-black mb-2 tracking-tight">¡Pedido recibido!</h1>
          <p className="text-gray-500 mb-8 font-medium">Tu orden <span className="text-black font-bold">#{orderSuccess.orderNumber}</span> está siendo preparada.</p>
          <div className="bg-surface-1 p-6 rounded-3xl mb-8 border border-gray-100">
            <p className="text-sm text-gray-400 uppercase font-bold tracking-widest mb-1">Total a pagar</p>
            <p className="font-display font-black text-3xl" style={{ color: primary }}>{fmt(orderSuccess.total)}</p>
            <p className="text-[11px] text-gray-400 mt-2 font-bold uppercase">Pago en efectivo a la entrega</p>
          </div>
          <button 
            onClick={() => setOrderSuccess(null)} 
            className="w-full py-5 rounded-2xl font-black text-white shadow-xl shadow-brand/20 active:scale-95 transition-all" 
            style={{ background: primary }}
          >
            Hacer otro pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto relative pb-40 bg-surface-1 min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-gray-100 px-6 py-5 flex items-center gap-4">
        {store.logo ? (
          <img src={store.logo} alt={store.name} className="h-12 w-12 object-cover rounded-2xl shadow-sm" />
        ) : (
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center font-display font-black text-white shadow-lg" style={{ background: primary }}>
            {store.name.substring(0, 1)}
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-display font-black leading-none tracking-tight">{store.name}</h1>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Abierto ahora</span>
          </div>
        </div>
      </header>

      {/* Category bubbles */}
      <nav className="sticky top-[89px] z-20 bg-white/50 backdrop-blur-md border-b border-gray-100">
        <div className="flex overflow-x-auto gap-3 px-6 py-4 no-scrollbar">
          {categories.map(cat => {
            const isActive = activeCat === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => scrollTo(cat.id)}
                className="flex-none px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95"
                style={{
                  background: isActive ? primary : '#ffffff',
                  color: isActive ? '#ffffff' : '#4b5563',
                  border: `1px solid ${isActive ? primary : '#f3f4f6'}`,
                }}
              >
                <span className="mr-2">{cat.emoji || '🍔'}</span>
                {cat.name}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Menu sections */}
      <main className="px-6 pt-8 flex flex-col gap-10">
        {categories.map(cat => (
          <section key={cat.id} ref={el => { catRefs.current[cat.id] = el; }}>
            <div className="flex items-center gap-3 mb-5 px-1">
              <span className="text-2xl">{cat.emoji || '🍔'}</span>
              <h2 className="text-2xl font-display font-black tracking-tight">{cat.name}</h2>
            </div>
            
            <div className="flex flex-col gap-4">
              {(cat.items || []).map((item: any) => {
                const line = lines.find(l => l.id === item.id);
                const price = item.isPromo && item.promoPrice ? item.promoPrice : item.price;
                return (
                  <div key={item.id} className="bg-white rounded-[32px] overflow-hidden shadow-premium flex relative p-4 border border-gray-50 group hover:border-gray-200 transition-colors">
                    {item.isPromo && (
                      <span className="absolute top-4 left-4 z-10 px-2 py-0.5 rounded-full text-[9px] font-black text-white shadow-lg" style={{ background: primary }}>PROMO</span>
                    )}
                    
                    {item.imageUrl && (
                      <div className="w-24 h-24 flex-none rounded-2xl overflow-hidden mr-4 shadow-sm bg-surface-2">
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      </div>
                    )}
                    
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div className="pr-4">
                        <p className="font-black text-[15px] leading-tight mb-1 truncate">{item.name}</p>
                        {item.description && (
                          <p className="text-[11px] text-gray-400 leading-snug line-clamp-2">{item.description}</p>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex flex-col">
                           <div className="flex items-baseline gap-1.5">
                              <p className="font-display font-black text-lg" style={{ color: primary }}>{fmt(price)}</p>
                              {item.isPromo && item.promoPrice && (
                                <p className="text-[10px] text-gray-300 line-through font-bold">{fmt(item.price)}</p>
                              )}
                           </div>
                        </div>

                        {line ? (
                          <div className="flex items-center bg-surface-1 rounded-xl p-1 border border-gray-100">
                            <button onClick={() => remove(item.id)} className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-lg font-black active:scale-90 transition-transform">−</button>
                            <span className="font-black text-sm w-7 text-center">{line.quantity}</span>
                            <button onClick={() => add({ id: item.id, name: item.name, price })} className="w-8 h-8 rounded-lg text-white shadow-sm flex items-center justify-center text-lg font-black active:scale-90 transition-transform" style={{ background: primary }}>+</button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => add({ id: item.id, name: item.name, price })} 
                            className="px-5 py-2.5 rounded-xl text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 active:scale-95 transition-all" 
                            style={{ background: primary }}
                          >
                            Agregar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {categories.length === 0 && (
          <div className="text-center py-20 px-10">
            <div className="text-5xl mb-4 opacity-20">🍽️</div>
            <p className="text-gray-400 font-bold">El menú aún no tiene productos disponibles.</p>
          </div>
        )}
      </main>

      {/* Sticky footer */}
      {quantity > 0 && !showCheckout && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 pb-8 pt-4 z-40 bg-gradient-to-t from-surface-1 via-surface-1/80 to-transparent">
          <button
            onClick={() => setShowCheckout(true)}
            className="w-full py-5 rounded-[24px] font-black text-base shadow-2xl flex items-center justify-between px-8 transition-all active:scale-95 animate-in fade-in slide-in-from-bottom-4"
            style={{ background: primary, color: '#ffffff' }}
          >
            <div className="flex items-center gap-3">
              <span className="bg-white/20 backdrop-blur-md rounded-xl px-2.5 py-1 text-xs font-black">{quantity}</span>
              <span className="uppercase tracking-widest text-[13px]">Ver Pedido</span>
            </div>
            <span className="font-display font-black text-lg">{fmt(total)}</span>
          </button>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm" onClick={() => setShowCheckout(false)}>
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-[40px] p-8 shadow-2xl animate-in slide-in-from-bottom-full duration-300" onClick={e => e.stopPropagation()}>
             <div className="flex justify-between items-center mb-8">
                <div>
                   <h3 className="font-display font-black text-2xl tracking-tight">Finalizar Pedido</h3>
                   <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">Datos de entrega</p>
                </div>
                <button onClick={() => setShowCheckout(false)} className="w-10 h-10 rounded-2xl bg-surface-1 flex items-center justify-center font-bold text-gray-400 hover:text-black transition-colors">✕</button>
             </div>
             <form onSubmit={handleSendOrder} className="space-y-5">
                <div className="group">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Tu Nombre</label>
                   <input required type="text" value={customerName} onChange={e=>setCustomerName(e.target.value)} className="w-full bg-surface-1 rounded-2xl px-5 py-4 outline-none focus:ring-2 border border-transparent focus:border-brand transition-all font-bold" style={{ focusRingColor: primary } as any} placeholder="Ej. Juan Pérez" />
                </div>
                <div className="group">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Tu Teléfono</label>
                   <input type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} className="w-full bg-surface-1 rounded-2xl px-5 py-4 outline-none focus:ring-2 border border-transparent focus:border-brand transition-all font-bold" placeholder="Ej. 555 123 4567" />
                </div>
                <div className="group">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Dirección Exacta</label>
                   <input required type="text" value={deliveryAddress} onChange={e=>setDeliveryAddress(e.target.value)} className="w-full bg-surface-1 rounded-2xl px-5 py-4 outline-none focus:ring-2 border border-transparent focus:border-brand transition-all font-bold" placeholder="Calle, número, referencia..." />
                </div>
                
                <div className="pt-6 mt-6 border-t border-gray-100">
                   <div className="flex justify-between font-bold text-gray-400 text-xs uppercase tracking-widest mb-3">
                      <span>Total ({quantity} items)</span>
                      <span className="font-black text-gray-600">{fmt(total)}</span>
                   </div>
                   <div className="flex justify-between items-end mb-8">
                      <span className="font-display font-black text-xl">Total a pagar</span>
                      <span className="font-display font-black text-3xl" style={{ color: primary }}>{fmt(total)}</span>
                   </div>
                   <button 
                     disabled={isSubmitting || !customerName || !deliveryAddress} 
                     type="submit" 
                     className="w-full py-5 rounded-2xl font-black text-white text-lg shadow-xl shadow-brand/20 active:scale-95 transition-all disabled:opacity-50 uppercase tracking-widest" 
                     style={{ background: primary }}
                   >
                     {isSubmitting ? 'PROCESANDO...' : 'CONFIRMAR PEDIDO'}
                   </button>
                   <p className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-4">
                     Pagarás en efectivo al recibir tu pedido
                   </p>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
