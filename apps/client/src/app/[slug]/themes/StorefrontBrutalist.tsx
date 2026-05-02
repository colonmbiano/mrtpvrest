'use client';

import { ThemeProps } from './types';

export default function StorefrontBrutalist({
  store, categories, lines, add, remove, total, quantity, primary,
  activeCat, scrollTo, catRefs, onCheckout, fmt,
}: ThemeProps) {
  return (
    <div className="min-h-screen pb-32 relative" style={{ background: '#FFFFFF', fontFamily: 'Anton, Impact, sans-serif' }}>
      <div className="bg-black text-white px-4 py-1.5 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: '#FF0044' }} />
          <span className="font-bold tracking-wider">LIVE</span>
          <span style={{ color: '#EAFF00' }}>·</span>
          <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700 }}>COCINA ABIERTA</span>
        </div>
        <span style={{ color: '#EAFF00', fontWeight: 700 }}>{new Date().toLocaleTimeString('es-MX', { hour12: false, hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <header className="px-5 pt-5 flex items-start justify-between">
        <div>
          <h1 className="text-5xl leading-[0.9] font-black" style={{ color: '#000000' }}>{store.name.toUpperCase()}</h1>
          <p className="text-2xl leading-[0.9] font-black" style={{ color: '#000000' }}>★</p>
        </div>
        <div className="w-20 h-20 rounded-full flex flex-col items-center justify-center -rotate-12"
          style={{ background: '#FF0044', border: '3px solid #000', boxShadow: '4px 4px 0 #000' }}>
          <span className="text-white text-base font-black">NEW!</span>
          <span className="text-white text-[9px] font-black">DROP 04</span>
        </div>
      </header>

      <div className="mx-5 mt-4 h-8 flex items-center gap-3 px-2 overflow-hidden whitespace-nowrap"
        style={{ background: '#EAFF00', border: '3px solid #000' }}>
        {['★ 2X1 HOY', '·', 'ENVÍO GRATIS +$200', '·', 'NUEVO MENÚ', '★'].map((t, i) => (
          <span key={i} className="text-sm font-black">{t}</span>
        ))}
      </div>

      <nav className="px-5 mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {categories.map((cat: any) => {
          const active = activeCat === cat.id;
          return (
            <button key={cat.id} onClick={() => scrollTo(cat.id)}
              className="px-3 py-1.5 text-xs font-black uppercase whitespace-nowrap"
              style={{
                background: active ? '#000000' : '#FFFFFF',
                color: active ? '#EAFF00' : '#000000',
                border: '2px solid #000',
              }}>
              {cat.name}
            </button>
          );
        })}
      </nav>

      <main className="px-5 mt-4 space-y-6">
        {categories.map((cat: any) => (
          <section key={cat.id} ref={el => { catRefs.current[cat.id] = el; }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-2xl font-black" style={{ color: '#000000' }}>{cat.name.toUpperCase()}</h2>
              <span className="text-xs font-bold underline" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>VER TODO →</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {cat.items?.map((item: any, i: number) => {
                const line = lines.find(l => l.id === item.id);
                const price = item.isPromo && item.promoPrice ? item.promoPrice : item.price;
                const accentBg = i % 2 === 0 ? '#000000' : '#FF00FF';
                const accentSh = i % 2 === 0 ? '#000000' : '#FF00FF';
                return (
                  <div key={item.id} className="bg-white flex flex-col"
                    style={{ border: '3px solid #000', boxShadow: `5px 5px 0 ${accentSh}` }}>
                    <div className="relative w-full h-24 overflow-hidden">
                      <img src={item.imageUrl || '/placeholder.png'} className="w-full h-full object-cover" alt="" />
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-xs font-black"
                        style={{ background: accentBg, color: i%2===0 ? '#EAFF00' : '#FFFFFF' }}>
                        #{String(i+1).padStart(2,'0')}
                      </span>
                    </div>
                    <div className="p-2.5" style={{ borderTop: '3px solid #000' }}>
                      <p className="text-sm font-black uppercase truncate" style={{ color: '#000000' }}>{item.name}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-lg font-black" style={{ color: '#000000' }}>{fmt(price)}</span>
                        {line ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => remove(item.id)} className="w-6 h-6 text-sm font-black"
                              style={{ background: '#FFFFFF', border: '2px solid #000' }}>−</button>
                            <span className="text-sm font-black w-4 text-center">{line.quantity}</span>
                            <button onClick={() => add({ id: item.id, name: item.name, price })}
                              className="w-6 h-6 text-sm" style={{ background: accentBg, color: i%2===0 ? '#000' : '#FFF', border: '2px solid #000' }}>+</button>
                          </div>
                        ) : (
                          <button onClick={() => add({ id: item.id, name: item.name, price })}
                            className="w-6 h-6 text-sm" style={{ background: accentBg, color: i%2===0 ? '#000' : '#FFF', border: '2px solid #000' }}>+</button>
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

      {quantity > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-50">
          <button onClick={onCheckout}
            className="w-full max-w-lg mx-auto flex items-center justify-between px-5 py-4 text-base"
            style={{ background: '#000000', color: '#EAFF00', border: '3px solid #000', boxShadow: '6px 6px 0 #FF00FF' }}>
            <span className="font-black uppercase flex items-center gap-2">
              <span className="px-2 py-0.5 text-xs" style={{ background: '#EAFF00', color: '#000' }}>{quantity}</span>
              PAGAR AHORA
            </span>
            <span className="font-black">{fmt(total)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
