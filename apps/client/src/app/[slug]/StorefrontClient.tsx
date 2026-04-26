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
      <div className="max-w-lg mx-auto min-h-screen flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-black mb-2">¡Pedido recibido!</h1>
          <p className="text-gray-500 mb-6">Tu orden #{orderSuccess.orderNumber} está siendo preparada.</p>
          <div className="bg-gray-50 p-4 rounded-2xl mb-6">
            <p className="font-bold text-lg mb-1">Total: {fmt(orderSuccess.total)}</p>
            <p className="text-sm text-gray-500">Pago en efectivo a la entrega</p>
          </div>
          <button onClick={() => setOrderSuccess(null)} className="w-full py-4 rounded-2xl font-black text-white" style={{ background: primary }}>
            Hacer otro pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto relative pb-40">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white shadow-sm px-5 py-4 flex items-center gap-3">
        {store.logo && (
          <img src={store.logo} alt={store.name} className="h-10 w-10 object-cover rounded-full" />
        )}
        <div className="flex-1">
          <h1 className="text-lg font-black leading-tight">{store.name}</h1>
          <p className="text-xs text-gray-400">Pide en línea fácil y rápido</p>
        </div>
        <div className="flex items-center gap-1.5 bg-green-50 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-bold text-green-700">Abierto</span>
        </div>
      </header>

      {/* Category bubbles */}
      <nav className="sticky top-[72px] z-20 bg-gray-50 border-b border-gray-100">
        <div className="flex overflow-x-auto gap-2 px-4 py-3 no-scrollbar">
          {categories.map(cat => {
            const isActive = activeCat === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => scrollTo(cat.id)}
                className="flex-none px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all"
                style={{
                  background: isActive ? primary : '#ffffff',
                  color: isActive ? '#ffffff' : '#374151',
                  border: `1px solid ${isActive ? primary : '#e5e7eb'}`,
                }}
              >
                <span className="mr-1">{cat.emoji || '🍔'}</span>
                {cat.name}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Menu sections */}
      <main className="px-4 pt-6 flex flex-col gap-8">
        {categories.map(cat => (
          <section key={cat.id} ref={el => { catRefs.current[cat.id] = el; }}>
            <h2 className="text-xl font-black mb-4 px-1">{cat.emoji || '🍔'} {cat.name}</h2>
            <div className="flex flex-col gap-3">
              {(cat.items || []).map((item: any) => {
                const line = lines.find(l => l.id === item.id);
                const price = item.isPromo && item.promoPrice ? item.promoPrice : item.price;
                return (
                  <div key={item.id} className="bg-white rounded-3xl overflow-hidden shadow-sm flex relative">
                    {item.isPromo && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-black text-white shadow-sm" style={{ background: primary }}>PROMO</span>
                    )}
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt={item.name} className="w-28 h-28 object-cover flex-none" />
                    )}
                    <div className="flex-1 p-3 flex flex-col">
                      <p className="font-black text-sm leading-tight">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-gray-400 line-clamp-2 mt-1 flex-1">{item.description}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-baseline gap-1">
                           <p className="font-black text-base" style={{ color: primary }}>{fmt(price)}</p>
                           {item.isPromo && item.promoPrice && <p className="text-[10px] text-gray-400 line-through">{fmt(item.price)}</p>}
                        </div>
                        {line ? (
                          <div className="flex items-center gap-2">
                            <button onClick={() => remove(item.id)} className="w-8 h-8 rounded-full bg-gray-100 text-lg font-black active:scale-90 transition-transform">−</button>
                            <span className="font-black text-sm w-5 text-center">{line.quantity}</span>
                            <button onClick={() => add({ id: item.id, name: item.name, price })} className="w-8 h-8 rounded-full text-white text-lg font-black active:scale-90 transition-transform" style={{ background: primary }}>+</button>
                          </div>
                        ) : (
                          <button onClick={() => add({ id: item.id, name: item.name, price })} className="px-4 py-2 rounded-full text-white text-xs font-black uppercase tracking-wide shadow-md active:scale-95 transition-transform" style={{ background: primary }}>
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
          <div className="text-center text-gray-400 py-10 font-bold">El menú aún no tiene productos.</div>
        )}
      </main>

      {/* Sticky footer */}
      {quantity > 0 && !showCheckout && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 pb-5 pt-3 z-40 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
          <button
            onClick={() => setShowCheckout(true)}
            className="w-full py-4 rounded-2xl font-black text-base shadow-2xl flex items-center justify-between px-6 transition-all active:scale-95"
            style={{ background: primary, color: '#ffffff' }}
          >
            <span className="bg-white/25 rounded-xl px-2.5 py-0.5 text-sm font-black">{quantity}</span>
            <span className="uppercase tracking-wide">Completar Pedido</span>
            <span className="font-black">{fmt(total)}</span>
          </button>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm" onClick={() => setShowCheckout(false)}>
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
             <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-xl">Detalles de Entrega</h3>
                <button onClick={() => setShowCheckout(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold">✕</button>
             </div>
             <form onSubmit={handleSendOrder} className="space-y-4">
                <div>
                   <label className="text-xs font-bold text-gray-500 ml-1">Tu Nombre</label>
                   <input required type="text" value={customerName} onChange={e=>setCustomerName(e.target.value)} className="w-full mt-1 bg-gray-100 rounded-2xl px-4 py-3 outline-none focus:ring-2" style={{ focusRingColor: primary }} placeholder="Ej. Juan Pérez" />
                </div>
                <div>
                   <label className="text-xs font-bold text-gray-500 ml-1">Tu Teléfono (opcional)</label>
                   <input type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} className="w-full mt-1 bg-gray-100 rounded-2xl px-4 py-3 outline-none focus:ring-2" placeholder="Ej. 555 123 4567" />
                </div>
                <div>
                   <label className="text-xs font-bold text-gray-500 ml-1">Dirección de Entrega</label>
                   <input required type="text" value={deliveryAddress} onChange={e=>setDeliveryAddress(e.target.value)} className="w-full mt-1 bg-gray-100 rounded-2xl px-4 py-3 outline-none focus:ring-2" placeholder="Ej. Calle Falsa 123, Apto 4" />
                </div>
                
                <div className="border-t border-gray-100 pt-4 mt-4">
                   <div className="flex justify-between font-bold text-gray-600 text-sm mb-2"><span>Subtotal ({quantity} items)</span><span>{fmt(total)}</span></div>
                   <div className="flex justify-between font-black text-xl mb-6"><span>Total a pagar</span><span style={{ color: primary }}>{fmt(total)}</span></div>
                   <button disabled={isSubmitting || !customerName || !deliveryAddress} type="submit" className="w-full py-4 rounded-2xl font-black text-white text-lg shadow-xl active:scale-95 transition-all disabled:opacity-50" style={{ background: primary }}>
                     {isSubmitting ? 'ENVIANDO...' : 'CONFIRMAR PEDIDO'}
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
