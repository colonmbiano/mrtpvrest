'use client';

import { ThemeProps } from './types';

export default function StorefrontKawaii({
  store, categories, lines, add, remove, total, quantity, primary,
  activeCat, scrollTo, catRefs, onCheckout, fmt,
}: ThemeProps) {
  return (
    <div className="min-h-screen pb-32" style={{ background: '#FFFAF5', fontFamily: 'Quicksand, sans-serif' }}>
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-60"
        style={{ background: 'radial-gradient(circle, #FFD9E5 0%, transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none absolute top-[400px] right-[-100px] w-[400px] h-[400px] rounded-full opacity-50"
        style={{ background: 'radial-gradient(circle, #E5D9FF 0%, transparent 70%)' }} />

      <header className="relative px-5 pt-12 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
            style={{ background: 'linear-gradient(135deg, #FFB7CE, #E5D9FF)' }}>
            {store.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-[11px]" style={{ color: '#A8839A' }}>welcome</p>
            <p className="text-sm font-bold" style={{ color: '#3D2A36' }}>{store.name} ☀</p>
          </div>
        </div>
        <button onClick={onCheckout} className="relative w-10 h-10 rounded-full bg-white flex items-center justify-center"
          style={{ boxShadow: '0 6px 16px rgba(255,183,206,0.25)' }}>
          <span style={{ color: '#FF8EAA', fontSize: 18 }}>🛍</span>
          {quantity > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
              style={{ background: '#FF8EAA', border: '2px solid #FFFFFF' }}>{quantity}</span>
          )}
        </button>
      </header>

      <section className="relative px-5 mt-2">
        <h1 className="text-3xl font-bold leading-tight" style={{ color: '#3D2A36' }}>
          what&apos;s tasty<br />today?
        </h1>
      </section>

      <nav className="relative px-5 mt-5 flex gap-3 overflow-x-auto no-scrollbar pb-2">
        {categories.map((cat: any) => {
          const active = activeCat === cat.id;
          return (
            <button key={cat.id} onClick={() => scrollTo(cat.id)}
              className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all"
              style={{
                background: active ? 'linear-gradient(135deg, #FFB7CE, #FF8EAA)' : '#FFFFFF',
                color: active ? '#FFFFFF' : '#A8839A',
                boxShadow: active ? '0 6px 14px rgba(255,142,170,0.4)' : '0 2px 8px rgba(255,183,206,0.15)',
              }}>
              {cat.name}
            </button>
          );
        })}
      </nav>

      <main className="relative px-5 mt-4 space-y-8">
        {categories.map((cat: any) => (
          <section key={cat.id} ref={el => { catRefs.current[cat.id] = el; }}>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h2 className="text-lg font-bold" style={{ color: '#3D2A36' }}>{cat.name}</h2>
                <p className="text-[11px]" style={{ color: '#A8839A' }}>top picks just for you 💕</p>
              </div>
              <span className="text-[11px] font-bold" style={{ color: '#FF8EAA' }}>see all →</span>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              {cat.items?.map((item: any) => {
                const line = lines.find(l => l.id === item.id);
                const price = item.isPromo && item.promoPrice ? item.promoPrice : item.price;
                return (
                  <div key={item.id} className="rounded-3xl bg-white p-3.5 flex flex-col gap-2.5"
                    style={{ boxShadow: '0 8px 20px rgba(255,183,206,0.25)' }}>
                    <div className="relative w-full h-24 rounded-2xl overflow-hidden bg-pink-50">
                      <img src={item.imageUrl || '/placeholder.png'} className="w-full h-full object-cover" alt="" />
                      <button className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white flex items-center justify-center">
                        <span style={{ color: '#FF8EAA', fontSize: 11 }}>♡</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span style={{ color: '#FFB7CE', fontSize: 11 }}>★</span>
                      <span className="text-[11px] font-bold" style={{ color: '#3D2A36' }}>4.8</span>
                    </div>
                    <h3 className="text-[13px] font-bold leading-tight" style={{ color: '#3D2A36' }}>{item.name}</h3>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold" style={{ color: '#FF8EAA' }}>{fmt(price)}</span>
                      {line ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => remove(item.id)} className="w-6 h-6 rounded-full text-xs font-bold"
                            style={{ background: '#FFF5F7', color: '#FF8EAA' }}>−</button>
                          <span className="text-[11px] font-bold w-5 text-center" style={{ color: '#3D2A36' }}>{line.quantity}</span>
                          <button onClick={() => add({ id: item.id, name: item.name, price })}
                            className="w-7 h-7 rounded-full bg-black text-white text-xs flex items-center justify-center">+</button>
                        </div>
                      ) : (
                        <button onClick={() => add({ id: item.id, name: item.name, price })}
                          className="w-7 h-7 rounded-full bg-black text-white text-xs flex items-center justify-center">+</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {quantity > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-50">
          <button onClick={onCheckout}
            className="w-full max-w-lg mx-auto flex items-center justify-between px-6 py-4 rounded-full text-white"
            style={{ background: '#FF8EAA', boxShadow: '0 10px 24px rgba(255,142,170,0.5)' }}>
            <span className="font-bold flex items-center gap-2">
              <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">{quantity}</span>
              ordenar 🌷
            </span>
            <span className="font-bold">{fmt(total)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
