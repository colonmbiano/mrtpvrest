/* Frame: Pago + Mesas */

function FramePayment({ tweaks }) {
  const { mode, theme } = tweaks;
  const total = 542;
  const [method, setMethod] = React.useState('card');
  const [cash, setCash] = React.useState(600);

  return (
    <div className="tpv-frame" data-mode={mode} data-theme={theme} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 880, padding: 0, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 320px', position: 'relative', zIndex: 1 }}>
        {/* Left: methods */}
        <div style={{ padding: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Pedido #1041 · Mesa 6</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Procesar cobro</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
            {[
              { id: 'cash', icon: 'cash', label: 'Efectivo' },
              { id: 'card', icon: 'card', label: 'Tarjeta' },
              { id: 'qr', icon: 'qr', label: 'Transfer' },
              { id: 'gift', icon: 'gift', label: 'Cortesía' },
            ].map(m => {
              const sel = method === m.id;
              return (
                <button key={m.id} onClick={() => setMethod(m.id)} style={{
                  height: 96, borderRadius: 14,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: sel ? 'var(--brand-soft)' : 'var(--surface-2)',
                  border: `1.5px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                  color: sel ? 'var(--brand)' : 'var(--text-secondary)',
                  fontSize: 12, fontWeight: 600,
                }}>
                  <Icon name={m.icon} size={22} />
                  {m.label}
                </button>
              );
            })}
          </div>

          {method === 'cash' && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Recibido</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
                <span className="mono tnum" style={{ fontSize: 36, fontWeight: 700 }}>${cash}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· Cambio</span>
                <span className="mono tnum" style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>${cash - total}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {[total, 600, 700, 1000].map(v => (
                  <button key={v} onClick={() => setCash(v)} style={{ height: 44, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>${v}</button>
                ))}
              </div>
            </div>
          )}
          {method === 'card' && (
            <div className="card" style={{ padding: 20, background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="card" size={16}/>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Esperando terminal</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Conectado · Verifone V200c</div>
                </div>
              </div>
              <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '60%', background: 'var(--brand)', animation: 'pulse 2s' }} />
              </div>
            </div>
          )}
          {method === 'qr' && (
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <div className="img-placeholder" style={{ width: 120, height: 120, borderRadius: 14, background: 'var(--surface-2)' }}>QR</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Escanea para pagar</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SPEI · CoDi · MercadoPago</div>
              </div>
            </div>
          )}
        </div>

        {/* Right: summary */}
        <div style={{ background: 'var(--surface-2)', padding: 24, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)' }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Resumen</div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, fontSize: 12 }}>
            {[
              { name: '2× Bowl de Pollo', amt: 330 },
              { name: '3× Taco al Pastor', amt: 105 },
              { name: '2× Agua de Jamaica', amt: 76 },
              { name: '1× Flan Napolitano', amt: 65 },
            ].map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>{l.name}</span><span className="mono tnum">${l.amt}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}><span>Subtotal</span><span className="mono tnum">$576</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--success)' }}><span>Descuento</span><span className="mono tnum">−$34</span></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 12, marginTop: 12, borderTop: '1px solid var(--border)' }}>
            <span className="eyebrow">Total</span>
            <span className="mono tnum" style={{ fontSize: 28, fontWeight: 700 }}>${total}</span>
          </div>
          <button style={{ marginTop: 16, height: 50, borderRadius: 14, background: 'var(--brand)', color: 'var(--brand-fg)', fontWeight: 700, fontSize: 14, letterSpacing: '0.04em' }}>
            Confirmar cobro
          </button>
        </div>
      </div>
    </div>
  );
}

function FrameTables({ tweaks }) {
  const { mode, theme } = tweaks;
  // 18 tables, mixed states
  const tables = [
    { n: 1, st: 'free', cap: 2 }, { n: 2, st: 'busy', cap: 2, time: '34 min', total: 425 },
    { n: 3, st: 'free', cap: 4 }, { n: 4, st: 'check', cap: 4, time: '1h 12m', total: 980 },
    { n: 5, st: 'busy', cap: 6, time: '18 min', total: 612 }, { n: 6, st: 'busy', cap: 4, time: '42 min', total: 542, sel: true },
    { n: 7, st: 'free', cap: 2 }, { n: 8, st: 'free', cap: 4 },
    { n: 9, st: 'reserved', cap: 6 }, { n: 10, st: 'busy', cap: 2, time: '8 min', total: 145 },
    { n: 11, st: 'free', cap: 4 }, { n: 12, st: 'busy', cap: 8, time: '52 min', total: 1480 },
    { n: 13, st: 'free', cap: 2 }, { n: 14, st: 'free', cap: 4 },
    { n: 15, st: 'check', cap: 4, time: '38 min', total: 690 }, { n: 16, st: 'busy', cap: 2, time: '15 min', total: 215 },
    { n: 17, st: 'free', cap: 6 }, { n: 18, st: 'free', cap: 2 },
  ];
  const stColors = {
    free: { bg: 'var(--surface-1)', label: 'Libre', dot: 'var(--text-muted)', txt: 'var(--text-secondary)' },
    busy: { bg: 'var(--surface-1)', label: 'Ocupada', dot: 'var(--info)', txt: 'var(--text-primary)' },
    check: { bg: 'var(--surface-1)', label: 'Cuenta', dot: 'var(--warning)', txt: 'var(--warning)' },
    reserved: { bg: 'var(--surface-1)', label: 'Reservada', dot: 'var(--brand)', txt: 'var(--brand)' },
  };
  return (
    <div className="tpv-frame" data-mode={mode} data-theme={theme} style={{ display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
      <header style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Salones</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>Salón principal</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { lbl: 'Salón principal', active: true }, { lbl: 'Terraza' }, { lbl: 'Barra' },
          ].map(s => (
            <button key={s.lbl} style={{ height: 34, padding: '0 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: s.active ? 'var(--surface-3)' : 'transparent', color: s.active ? 'var(--text-primary)' : 'var(--text-secondary)', border: s.active ? '1px solid var(--border-strong)' : '1px solid transparent' }}>{s.lbl}</button>
          ))}
        </div>
      </header>

      <div style={{ display: 'flex', gap: 12, padding: '12px 24px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
        {Object.entries(stColors).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: v.dot }} />
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{v.label}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
          {tables.map(t => {
            const c = stColors[t.st];
            return (
              <button key={t.n} style={{
                aspectRatio: '1',
                borderRadius: 16,
                background: c.bg,
                border: t.sel ? `2px solid var(--brand)` : `1px solid var(--border)`,
                padding: 14,
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between',
                position: 'relative',
                boxShadow: t.sel ? '0 8px 24px -8px var(--brand-glow)' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: c.txt }}>M{String(t.n).padStart(2, '0')}</span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, marginTop: 8 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, width: '100%' }}>
                  <span className="eyebrow">{c.label} · {t.cap}p</span>
                  {t.time && <span className="mono tnum" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.time}</span>}
                  {t.total && <span className="mono tnum" style={{ fontSize: 14, fontWeight: 700, color: c.txt }}>${t.total}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

window.FramePayment = FramePayment;
window.FrameTables = FrameTables;
