/* Frame: KDS, Meseros, Setup */

function FrameKDS({ tweaks }) {
  const { mode, theme } = tweaks;
  const tickets = [
    { num: '#1042', table: 'Llevar', time: '02:14', sla: 'ok', items: [
      { qty: 3, name: 'Taco al Pastor', note: 'Sin cebolla' },
      { qty: 1, name: 'Gringa Pastor' },
      { qty: 2, name: 'Agua de Jamaica' },
    ]},
    { num: '#1041', table: 'Mesa 6', time: '04:32', sla: 'warn', items: [
      { qty: 2, name: 'Bowl de Pollo' },
      { qty: 3, name: 'Taco de Suadero' },
      { qty: 1, name: 'Cerveza Artesanal' },
      { qty: 1, name: 'Flan Napolitano' },
    ]},
    { num: '#1040', table: 'Domicilio', time: '07:48', sla: 'late', items: [
      { qty: 1, name: 'Torta Cubana', note: 'Extra queso' },
      { qty: 2, name: 'Refresco 600ml' },
    ]},
    { num: '#1043', table: 'Mesa 12', time: '00:28', sla: 'ok', items: [
      { qty: 6, name: 'Taco de Bistec' },
      { qty: 2, name: 'Bowl Vegetariano' },
      { qty: 4, name: 'Agua de Jamaica' },
      { qty: 1, name: 'Flan Napolitano' },
    ]},
  ];
  const slaColor = { ok: 'var(--success)', warn: 'var(--warning)', late: 'var(--danger)' };
  return (
    <div className="tpv-frame" data-mode={mode} data-theme={theme} style={{ display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
      <header style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chef" size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="eyebrow">KDS · Estación caliente</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{tickets.length} pedidos en cocina</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span className="eyebrow">Tiempo prom.</span>
            <span className="mono tnum" style={{ fontSize: 16, fontWeight: 700 }}>04:21</span>
          </div>
          <div className="divider-v" style={{ height: 32 }} />
          <button className="btn-ghost" style={{ height: 36 }}>Pendientes (4)</button>
          <button className="btn-soft" style={{ height: 36 }}>Listos (2)</button>
        </div>
      </header>

      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: 16 }}>
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '300px', gap: 14, height: '100%' }}>
          {tickets.map((t, i) => (
            <div key={i} className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: `2px solid ${slaColor[t.sla]}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{t.num}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{t.table}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'var(--surface-2)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: slaColor[t.sla] }} />
                  <span className="mono tnum" style={{ fontSize: 12, fontWeight: 700, color: slaColor[t.sla] }}>{t.time}</span>
                </div>
              </div>
              <div style={{ flex: 1, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }} className="scrollbar-hide">
                {t.items.map((it, j) => (
                  <div key={j} style={{ paddingBottom: 8, borderBottom: '1px dashed var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span className="mono tnum" style={{ fontSize: 18, fontWeight: 700, color: 'var(--brand)' }}>{it.qty}×</span>
                      <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{it.name}</span>
                    </div>
                    {it.note && <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 2, marginLeft: 30 }}>· {it.note}</div>}
                  </div>
                ))}
              </div>
              <button style={{ height: 44, background: 'var(--brand)', color: 'var(--brand-fg)', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Icon name="check" size={14}/> Marcar listo
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FrameWaiter({ tweaks }) {
  const { mode, theme } = tweaks;
  const tables = [
    { n: 4, st: 'check', total: 980, time: '1h 12m', dish: 3 },
    { n: 6, st: 'busy', total: 542, time: '42 min', dish: 5, sel: true },
    { n: 12, st: 'busy', total: 1480, time: '52 min', dish: 8 },
    { n: 15, st: 'check', total: 690, time: '38 min', dish: 4 },
  ];
  const stColors = {
    busy: { dot: 'var(--info)', label: 'Activa' },
    check: { dot: 'var(--warning)', label: 'Cuenta' },
  };
  return (
    <div className="tpv-frame" data-mode={mode} data-theme={theme} style={{ display: 'grid', gridTemplateColumns: '320px 1fr', position: 'relative', zIndex: 1 }}>
      {/* Sidebar: assigned tables */}
      <aside style={{ background: 'var(--surface-1)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div className="eyebrow">Mesero</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>Carlos Ruiz</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>4 mesas · $3,692 abierto</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tables.map(t => {
            const c = stColors[t.st];
            return (
              <div key={t.n} style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                background: t.sel ? 'var(--surface-2)' : 'transparent',
                borderLeft: t.sel ? '3px solid var(--brand)' : '3px solid transparent',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                  M{String(t.n).padStart(2,'0')}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{c.label}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t.dish} platos · {t.time}</div>
                </div>
                <div className="mono tnum" style={{ fontSize: 14, fontWeight: 700 }}>${t.total}</div>
              </div>
            );
          })}
        </div>
        <button style={{ margin: 14, height: 44, borderRadius: 12, background: 'var(--brand)', color: 'var(--brand-fg)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="plus" size={14}/> Nueva orden
        </button>
      </aside>

      {/* Main: detail */}
      <main style={{ display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow">Mesa 06 · Andrea M.</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>Orden activa · 5 platos</div>
          </div>
          <button className="btn-ghost"><Icon name="plus" size={14}/> Agregar</button>
          <button className="btn-soft"><Icon name="printer" size={14}/> Cuenta</button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { qty: 2, name: 'Bowl de Pollo', course: 'Plato fuerte', status: 'En cocina', price: 165, color: 'var(--info)' },
            { qty: 3, name: 'Taco de Suadero', course: 'Entrada', status: 'Servido', price: 38, color: 'var(--success)' },
            { qty: 1, name: 'Cerveza Artesanal', course: 'Bebidas', status: 'Servido', price: 78, color: 'var(--success)' },
            { qty: 1, name: 'Flan Napolitano', course: 'Postre', status: 'Pendiente', price: 65, color: 'var(--text-muted)' },
          ].map((l, i) => (
            <div key={i} className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="mono tnum" style={{ fontWeight: 700, fontSize: 14 }}>{l.qty}×</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{l.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{l.course}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: l.color + '20', color: l.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l.status}</span>
              <span className="mono tnum" style={{ fontSize: 14, fontWeight: 700, width: 70, textAlign: 'right' }}>${l.qty * l.price}</span>
            </div>
          ))}
        </div>

        <footer style={{ borderTop: '1px solid var(--border)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, background: 'var(--surface-1)' }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow">Total mesa</div>
            <div className="mono tnum" style={{ fontSize: 24, fontWeight: 700 }}>$542</div>
          </div>
          <button className="btn-ghost" style={{ height: 44 }}>Dividir cuenta</button>
          <button style={{ height: 44, padding: '0 24px', borderRadius: 12, background: 'var(--brand)', color: 'var(--brand-fg)', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em' }}>
            Pasar a caja
          </button>
        </footer>
      </main>
    </div>
  );
}

function FrameSetup({ tweaks }) {
  const { mode, theme } = tweaks;
  return (
    <div className="tpv-frame" data-mode={mode} data-theme={theme} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, position: 'relative' }}>
      <div className="card" style={{ width: '100%', maxWidth: 720, padding: 0, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        <div style={{ padding: '28px 32px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            {[1,2,3,4].map(s => (
              <React.Fragment key={s}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: s <= 2 ? 'var(--brand)' : 'var(--surface-3)',
                  color: s <= 2 ? 'var(--brand-fg)' : 'var(--text-muted)',
                  fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{s}</div>
                {s < 4 && <div style={{ flex: 1, height: 2, background: s < 2 ? 'var(--brand)' : 'var(--surface-3)' }} />}
              </React.Fragment>
            ))}
          </div>
          <div className="eyebrow">Paso 2 de 4</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>Apariencia del TPV</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>Elige el tema base y el modo. Lo podrás cambiar después desde el menú principal.</p>
        </div>

        <div style={{ padding: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Color de marca</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
            {[
              { id: 'emerald', label: 'Esmeralda', color: '#10b981', sel: theme === 'emerald' },
              { id: 'indigo', label: 'Índigo', color: '#6366f1', sel: theme === 'indigo' },
              { id: 'amber', label: 'Ámbar', color: '#f97316', sel: theme === 'amber' },
            ].map(t => (
              <div key={t.id} style={{
                padding: 14, borderRadius: 14,
                background: t.sel ? 'var(--surface-2)' : 'transparent',
                border: `1.5px solid ${t.sel ? t.color : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: t.color, boxShadow: t.sel ? `0 0 0 4px ${t.color}30` : 'none' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t.color}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="eyebrow" style={{ marginBottom: 10 }}>Modo</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { id: 'dark', label: 'Oscuro', icon: 'moon', desc: 'Mejor para áreas con luz tenue' },
              { id: 'light', label: 'Claro', icon: 'sun', desc: 'Mejor para terrazas iluminadas' },
            ].map(m => (
              <div key={m.id} style={{
                padding: 16, borderRadius: 14,
                background: m.id === mode ? 'var(--surface-2)' : 'transparent',
                border: `1.5px solid ${m.id === mode ? 'var(--brand)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.id === mode ? 'var(--brand)' : 'var(--text-secondary)' }}>
                  <Icon name={m.icon} size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, background: 'var(--surface-2)' }}>
          <button className="btn-ghost" style={{ flex: 1, height: 44 }}>Atrás</button>
          <button style={{ flex: 2, height: 44, borderRadius: 12, background: 'var(--brand)', color: 'var(--brand-fg)', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            Continuar a impresoras <Icon name="arrow" size={14}/>
          </button>
        </div>
      </div>
    </div>
  );
}

window.FrameKDS = FrameKDS;
window.FrameWaiter = FrameWaiter;
window.FrameSetup = FrameSetup;
