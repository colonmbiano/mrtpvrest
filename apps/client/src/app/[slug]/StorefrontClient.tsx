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
  storefrontTheme?: string;
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
  const theme = store.storefrontTheme || 'MOCHI';
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const clear = useCart(s => s.clear);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());

  const [activeCat, setActiveCat] = useState<string>(categories[0]?.id ?? '');
  const [showCheckout, setShowCheckout] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const catRefs = useRef<Record<string, HTMLElement | null>>({});

  useMemo(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/store/locations?r=${encodeURIComponent(store.slug || '')}`);
        if (res.ok) {
          const locs = await res.json();
          setLocations(locs);
          if (locs.length > 0) setSelectedLocation(locs[0]);
        }
      } catch {}
    })();
  }, [store.slug]);

  const scrollTo = (catId: string) => {
    setActiveCat(catId);
    catRefs.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !deliveryAddress) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/api/store/orders?r=${encodeURIComponent(store.slug || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName, customerPhone, deliveryAddress,
          orderType: 'DELIVERY', paymentMethod: 'CASH',
          locationId: selectedLocation?.id,
          items: lines.map(l => ({ menuItemId: l.id, quantity: l.quantity })),
        })
      });
      if (res.ok) {
        setOrderSuccess(await res.json());
        clear();
      }
    } catch { alert("Error al enviar pedido"); } finally { setIsSubmitting(false); }
  };

  const primary = store.primaryColor || '#ff5c35';

  const THEMES = {
    MOCHI: {
      radius: '24px',
      bg: '#ffffff',
      surf: '#f9fafb',
      font: 'font-sans',
      header: 'flex flex-col items-center py-8 px-6 text-center gap-4',
      card: 'bg-white rounded-[32px] p-4 shadow-sm border border-gray-100 flex flex-col items-center text-center',
      btn: 'rounded-full font-black uppercase tracking-widest',
    },
    BENTO: {
      radius: '12px',
      bg: '#f3f4f6',
      surf: '#ffffff',
      font: 'font-display',
      header: 'flex items-center justify-between py-6 px-8 bg-white border-b border-gray-200',
      card: 'bg-white rounded-[16px] p-5 shadow-premium border border-gray-100 flex gap-4',
      btn: 'rounded-lg font-bold',
    },
    POCKET: {
      radius: '0px',
      bg: '#ffffff',
      surf: '#ffffff',
      font: 'font-sans',
      header: 'px-6 py-4 flex items-center justify-between border-b border-gray-100 sticky top-0 bg-white z-40',
      card: 'bg-white p-3 border-b border-gray-100 flex gap-3',
      btn: 'rounded-md font-medium',
    }
  };

  const themeStyles = THEMES[theme as keyof typeof THEMES] || THEMES.MOCHI;

  if (orderSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-surface-1">
        <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-sm w-full text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-black mb-2">¡Pedido enviado!</h2>
          <p className="text-gray-500 mb-6 font-bold">Orden #{orderSuccess.orderNumber}</p>
          <button onClick={() => setOrderSuccess(null)} className="w-full py-4 bg-brand text-white rounded-2xl font-black uppercase tracking-widest" style={{ background: primary }}>Listo</button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`min-h-screen pb-32 ${themeStyles.font}`}
      style={{ 
        ['--primary' as string]: primary,
        ['--radius' as string]: themeStyles.radius,
        backgroundColor: themeStyles.bg
      } as any}
    >
      {/* ── HEADER ────────────────────────────────────────────── */}
      <header className={themeStyles.header}>
        {theme === 'MOCHI' ? (
          <>
            <div className="w-20 h-20 rounded-[28px] overflow-hidden shadow-xl bg-white p-1">
               <img src={store.logo || '/placeholder.png'} className="w-full h-full object-cover rounded-[24px]" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">{store.name}</h1>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-green-500 bg-green-50 px-3 py-1 rounded-full mt-2 inline-block">Abierto</span>
            </div>
          </>
        ) : theme === 'BENTO' ? (
          <>
            <div className="flex items-center gap-4">
              <img src={store.logo || '/placeholder.png'} className="w-10 h-10 rounded-xl object-cover" />
              <h1 className="text-lg font-black">{store.name}</h1>
            </div>
            <div className="bg-gray-100 px-3 py-1 rounded-lg text-[10px] font-bold">MENU DIGITAL</div>
          </>
        ) : (
          <>
            <h1 className="text-base font-black tracking-tighter uppercase">{store.name}</h1>
            <button className="p-2 bg-surface-1 rounded-full text-sm">🛒</button>
          </>
        )}
      </header>

      {/* ── CATEGORIES ────────────────────────────────────────── */}
      <nav className={`sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-4 flex gap-3 overflow-x-auto no-scrollbar ${theme === 'POCKET' ? 'top-[57px]' : ''}`}>
        {categories.map(cat => (
          <button 
            key={cat.id} 
            onClick={() => scrollTo(cat.id)}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
              activeCat === cat.id ? 'bg-brand text-white' : 'bg-gray-100 text-gray-400'
            }`}
            style={{ borderRadius: themeStyles.radius, backgroundColor: activeCat === cat.id ? primary : undefined }}
          >
            {cat.name}
          </button>
        ))}
      </nav>

      {/* ── MENU CONTENT ──────────────────────────────────────── */}
      <main className={`p-6 space-y-12 ${theme === 'POCKET' ? 'p-0 space-y-0' : ''}`}>
        {categories.map(cat => (
          <section key={cat.id} ref={el => { catRefs.current[cat.id] = el; }} className={theme === 'POCKET' ? 'border-b-4 border-gray-50' : ''}>
            <div className={`flex items-center gap-2 mb-6 ${theme === 'POCKET' ? 'bg-gray-50/50 p-4 mb-0 border-b border-gray-100' : ''}`}>
              <h2 className="text-xl font-black uppercase tracking-tighter">{cat.name}</h2>
              <span className="h-1 w-10 bg-brand/20 rounded-full" style={{ backgroundColor: `${primary}33` }} />
            </div>

            <div className={theme === 'MOCHI' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-4'}>
              {cat.items?.map((item: any) => {
                const line = lines.find(l => l.id === item.id);
                const price = item.isPromo && item.promoPrice ? item.promoPrice : item.price;
                
                return (
                  <div key={item.id} className={themeStyles.card}>
                    {/* Image */}
                    <div className={`${
                      theme === 'MOCHI' ? 'w-full aspect-square mb-3' : 
                      theme === 'BENTO' ? 'w-24 h-24 shrink-0' : 
                      'w-20 h-20 shrink-0'
                    } rounded-[--radius] overflow-hidden bg-gray-50 relative`}>
                      <img src={item.imageUrl || '/placeholder.png'} className="w-full h-full object-cover" />
                      {item.isPromo && <span className="absolute top-2 left-2 bg-brand text-white text-[8px] font-black px-1.5 py-0.5 rounded-sm" style={{ background: primary }}>OFERTA</span>}
                    </div>

                    {/* Info */}
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div>
                        <h3 className={`font-black ${theme === 'MOCHI' ? 'text-sm mb-1' : 'text-base mb-0.5'} truncate`}>{item.name}</h3>
                        <p className="text-[10px] text-gray-400 line-clamp-2 leading-tight">{item.description}</p>
                      </div>

                      <div className={`flex items-center justify-between mt-4 ${theme === 'MOCHI' ? 'w-full' : ''}`}>
                        <span className="font-display font-black text-lg" style={{ color: primary }}>{fmt(price)}</span>
                        
                        {line ? (
                          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                            <button onClick={() => remove(item.id)} className="w-7 h-7 flex items-center justify-center font-bold">−</button>
                            <span className="text-xs font-black w-4 text-center">{line.quantity}</span>
                            <button onClick={() => add({ id: item.id, name: item.name, price })} className="w-7 h-7 bg-brand text-white rounded-md flex items-center justify-center" style={{ background: primary }}>+</button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => add({ id: item.id, name: item.name, price })}
                            className={`px-4 py-2 text-[9px] uppercase tracking-widest text-white ${themeStyles.btn}`}
                            style={{ background: primary }}
                          >
                            + Add
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
      </main>

      {/* ── FOOTER / CART ──────────────────────────────────────── */}
      {quantity > 0 && (
        <div className={`fixed bottom-0 left-0 w-full p-6 z-50 transition-all ${theme === 'POCKET' ? 'p-0' : ''}`}>
          <button 
            onClick={() => setShowCheckout(true)}
            className={`w-full max-w-lg mx-auto flex items-center justify-between bg-black text-white p-5 shadow-2xl hover:scale-[1.02] active:scale-95 transition-all ${theme === 'POCKET' ? 'rounded-none' : 'rounded-[24px]'}`}
            style={theme === 'POCKET' ? {} : { borderRadius: themeStyles.radius }}
          >
            <div className="flex items-center gap-3">
              <span className="bg-white/20 px-2 py-0.5 rounded-md text-xs font-black">{quantity}</span>
              <span className="text-sm font-black uppercase tracking-widest">Ver Carrito</span>
            </div>
            <span className="text-xl font-black" style={{ color: primary }}>{fmt(total)}</span>
          </button>
        </div>
      )}

      {/* ── CHECKOUT MODAL ─────────────────────────────────────── */}
      {showCheckout && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end justify-center" onClick={() => setShowCheckout(false)}>
          <div className="bg-white w-full max-w-lg p-8 rounded-t-[32px] animate-in slide-in-from-bottom-full duration-300" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-black uppercase tracking-tighter mb-6">Finalizar Compra</h2>
            <form onSubmit={handleSendOrder} className="space-y-4">
              <input required placeholder="Tu nombre" className="w-full p-4 bg-gray-100 rounded-2xl outline-none focus:ring-2" value={customerName} onChange={e=>setCustomerName(e.target.value)} style={{ "--tw-ring-color": primary } as any} />
              <input placeholder="Tu teléfono (opcional)" className="w-full p-4 bg-gray-100 rounded-2xl outline-none" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} />
              <textarea required placeholder="Dirección de entrega" className="w-full p-4 bg-gray-100 rounded-2xl outline-none h-24" value={deliveryAddress} onChange={e=>setDeliveryAddress(e.target.value)} />
              
              <div className="pt-6 border-t border-gray-100 flex items-center justify-between mb-4">
                <span className="font-bold text-gray-400">Total</span>
                <span className="text-3xl font-black" style={{ color: primary }}>{fmt(total)}</span>
              </div>

              <button disabled={isSubmitting} type="submit" className="w-full py-5 bg-brand text-white font-black rounded-2xl shadow-xl transition-all active:scale-95 disabled:opacity-50" style={{ background: primary }}>
                {isSubmitting ? 'ENVIANDO...' : 'CONFIRMAR PEDIDO'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
