'use client';

import { ThemeProps } from './types';

export default function StorefrontHalo({
  store, categories, lines, add, remove, total, quantity, primary,
  activeCat, scrollTo, catRefs, onCheckout, fmt,
}: ThemeProps) {
  const accent = primary || '#7C3AED';
  return (
    <div className="min-h-screen pb-32 relative overflow-hidden" style={{ background: '#0C0C0E', color: '#FFFFFF', fontFamily: 'JetBrains Mono, monospace' }}>
      <div aria-hidden className="pointer-events-none absolute -top-48 -left-32 w-[600px] h-[600px] rounded-full opacity-30"
        style={{ background: `radial-gradient(circle, ${accent}30 0%, transparent 70%)` }} />
      <div aria-hidden className="pointer-events-none absolute top-[400px] -right-20 w-[500px] h-[500px] rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, #00F0FF20 0%, transparent 70%)' }} />

      <div className="relative px-6 pt-10 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-emerald-500">SYS.ONLINE</span>
          <span className="text-white/40">·</span>
          <span className="text-white/60">NODE-A1.MX</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span style={{ color: '#00F0FF' }} className="font-bold">{new Date().toLocaleTimeString('es-MX', { hour12: false })}</span>
          <div className="flex items-end gap-px">
            <div className="w-0.5 h-1 bg-emerald-500" />
            <div className="w-0.5 h-1.5 bg-emerald-500" />
            <div className="w-0.5 h-2 bg-emerald-500" />
            <div className="w-0.5 h-2.5 bg-white/30" />
          </div>
        </div>
      </div>

      <header className="relative px-6 mt-4 flex items-start justify-between">
        <div>
          <p className="text-[9px] font-bold" style={{ color: '#FFB84D' }}>[ID-MX045]</p>
          <h1 className="text-2xl font-bold uppercase">{store.name}</h1>
        </div>
        <div className="rounded-md px-2 py-1 flex items-center gap-1" style={{ background: `${accent}20`, border: `1px solid ${accent}60` }}>
          <span className="text-[9px] font-bold" style={{ color: accent }}>LVL 3</span>
        </div>
      </header>

      <div className="relative px-6 mt-4 flex gap-2">
        {[
          { l: 'WAIT', v: '~12 MIN', c: '#00F0FF' },
          { l: 'QUEUE', v: '08 / 24', c: '#FFFFFF' },
          { l: 'BONUS', v: '+250 XP', c: '#10B981' },
        ].map(s => (
          <div key={s.l} className="flex-1 rounded-lg p-2.5" style={{ background: '#FFFFFF08', border: '1px solid #FFFFFF12' }}>
            <p className="text-[8px] font-bold text-white/50">{s.l}</p>
            <p className="text-[13px] font-bold" style={{ color: s.c }}>{s.v}</p>
          </div>
        ))}
      </div>

      <div className="relative px-6 mt-4">
        <div className="rounded-xl p-4 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #00F0FF15, #7C3AED15)', border: '1px solid #00F0FF80' }}>
          {[[0,0],[1,0],[0,1],[1,1]].map(([x,y],i) => (
            <div key={i} className="absolute w-3 h-3 border-2" style={{
              borderColor: '#00F0FF', borderRightWidth: x?2:0, borderLeftWidth: x?0:2,
              borderBottomWidth: y?2:0, borderTopWidth: y?0:2,
              top: y?undefined:0, bottom: y?0:undefined, left: x?undefined:0, right: x?0:undefined,
            }} />
          ))}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#FFB84D20', color: '#FFB84D' }}>🔥 PROTOCOL-A1</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#10B98120', color: '#10B981' }}>ACTIVE</span>
          </div>
          <p className="text-xl font-bold">2X1 // MASTER CLASSIC</p>
          <p className="text-[10px] text-white/60">DURATION 06:42:18 → TODAY ONLY</p>
        </div>
      </div>

      <nav className="relative px-6 mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
        {categories.map((cat: any) => {
          const active = activeCat === cat.id;
          return (
            <button key={cat.id} onClick={() => scrollTo(cat.id)}
              className="rounded-lg px-3 py-2 text-[11px] font-bold uppercase whitespace-nowrap"
              style={{
                background: active ? accent : '#FFFFFF05',
                color: active ? '#FFFFFF' : '#FFFFFF60',
                border: `1px solid ${active ? accent : '#FFFFFF15'}`,
                boxShadow: active ? `0 4px 12px ${accent}60` : 'none',
              }}>
              {cat.name}
            </button>
          );
        })}
      </nav>

      <main className="relative px-6 mt-4 space-y-6">
        {categories.map((cat: any) => (
          <section key={cat.id} ref={el => { catRefs.current[cat.id] = el; }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-3.5" style={{ background: '#00F0FF' }} />
              <h2 className="text-[13px] font-bold uppercase">{cat.name}</h2>
            </div>
            <div className="flex flex-col gap-3">
              {cat.items?.map((item: any, i: number) => {
                const line = lines.find(l => l.id === item.id);
                const price = item.isPromo && item.promoPrice ? item.promoPrice : item.price;
                return (
                  <div key={item.id} className="rounded-xl p-2.5 flex items-center gap-3"
                    style={{ background: '#FFFFFF05', border: '1px solid #FFFFFF12' }}>
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden" style={{ border: '1px solid #00F0FF40' }}>
                      <img src={item.imageUrl || '/placeholder.png'} className="w-full h-full object-cover" alt="" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-white/40">[{String(i+1).padStart(3,'0')}]</p>
                      <p className="text-xs font-bold uppercase truncate">{item.name}</p>
                      <p className="text-sm font-bold mt-1" style={{ color: '#10B981' }}>{fmt(price)}</p>
                    </div>
                    {line ? (
                      <div className="flex items-center gap-1 rounded-lg px-2 py-1" style={{ background: '#FFFFFF08' }}>
                        <button onClick={() => remove(item.id)} className="w-5 h-5 text-white text-xs">−</button>
                        <span className="text-[11px] font-bold w-4 text-center">{line.quantity}</span>
                        <button onClick={() => add({ id: item.id, name: item.name, price })}
                          className="w-5 h-5 text-xs" style={{ color: accent }}>+</button>
                      </div>
                    ) : (
                      <button onClick={() => add({ id: item.id, name: item.name, price })}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-white"
                        style={{ background: accent, boxShadow: `0 4px 8px ${accent}50` }}>+</button>
                    )}
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
            className="w-full max-w-lg mx-auto flex items-center justify-between px-5 py-4 rounded-2xl text-white uppercase font-bold tracking-widest"
            style={{ background: 'linear-gradient(45deg, #7C3AED, #6D28D9)', boxShadow: '0 8px 16px rgba(124,58,237,0.4)' }}>
            <span className="text-xs flex items-center gap-2">
              <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">{quantity}</span>
              VER CARRITO
            </span>
            <span className="text-base" style={{ color: '#10B981' }}>{fmt(total)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
