/* Frame: TPV Main */

function FrameMain({ tweaks }) {
  const { mode, theme, density, showImages } = tweaks;
  const [activeCat, setActiveCat] = React.useState('all');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const products = SAMPLE_PRODUCTS.filter(p => activeCat === 'all' || p.cat === activeCat);
  const subtotal = TICKET_LINES.reduce((s, l) => s + l.qty * l.price, 0);
  const discount = 25;
  const total = subtotal - discount;

  const cols = density === 'compact' ? 4 : density === 'roomy' ? 3 : 3;

  return (
    <div className="tpv-frame" data-mode={mode} data-theme={theme} style={{ display: 'grid', gridTemplateColumns: '1fr 360px' }}>
      {/* MAIN COLUMN */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative', zIndex: 1 }}>
        {/* Topbar */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
          <button onClick={() => setMenuOpen(true)} className="btn-soft" style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <Icon name="menu" size={18} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>MRTPVREST · Sucursal Centro</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Catálogo · Punto de venta</span>
          </div>
          <div style={{ flex: 1 }} />

          {/* Search */}
          <div style={{ position: 'relative', width: 280 }}>
            <Icon name="search" size={14} />
            <input className="input" placeholder="Buscar producto, código…" style={{ paddingLeft: 36 }} />
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
              <Icon name="search" size={14} />
            </div>
            <kbd style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>⌘K</kbd>
          </div>

          {/* Open orders */}
          <button className="btn-soft" style={{ height: 40, padding: '0 14px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            <Icon name="receipt" size={15} />
            Pedidos abiertos
            <span style={{ background: 'var(--brand)', color: 'var(--brand-fg)', borderRadius: 999, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>7</span>
          </button>

          {/* Shift indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Turno abierto</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>Lucía P. · 04:32h</span>
            </div>
          </div>
        </header>

        {/* Category bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 20px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }} className="scrollbar-hide">
          {SAMPLE_CATEGORIES.map(c => {
            const active = activeCat === c.id;
            return (
              <button key={c.id} onClick={() => setActiveCat(c.id)}
                style={{
                  height: 36, padding: '0 14px', borderRadius: 10,
                  fontSize: 13, fontWeight: 600,
                  background: active ? 'var(--surface-3)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: active ? '1px solid var(--border-strong)' : '1px solid transparent',
                  whiteSpace: 'nowrap',
                }}>
                {c.name}
                {active && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }} className="mono">{products.length}</span>}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <button className="chip" style={{ height: 32 }}>
            <Icon name="grid" size={12} /> Vista
          </button>
        </div>

        {/* Products */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }} className="scrollbar-hide">
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
            {products.map(p => (
              <button key={p.id} style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 14,
                textAlign: 'left',
                display: 'flex', flexDirection: 'column', gap: 12,
                transition: 'all .15s ease',
                position: 'relative',
              }}>
                {p.promo && (
                  <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'var(--brand)', color: 'var(--brand-fg)', letterSpacing: '0.06em', zIndex: 2 }}>−{Math.round((1 - p.promo/p.price)*100)}%</span>
                )}
                {showImages && (
                  <div className="img-placeholder" style={{ height: 110, borderRadius: 12 }}>{p.img}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{p.name}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    {p.promo ? (
                      <>
                        <span className="mono tnum" style={{ fontSize: 16, fontWeight: 700, color: 'var(--brand)' }}>${p.promo}</span>
                        <span className="mono tnum" style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'line-through' }}>${p.price}</span>
                      </>
                    ) : (
                      <span className="mono tnum" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>${p.price}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TICKET PANEL */}
      <aside style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '12px 16px 0', borderBottom: '1px solid var(--border)' }}>
          {['T1', 'Mesa 4', 'Llevar'].map((t, i) => {
            const active = i === 0;
            return (
              <button key={t} style={{
                height: 36, padding: '0 12px',
                borderRadius: '10px 10px 0 0',
                fontSize: 12, fontWeight: 600,
                background: active ? 'var(--surface-1)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                borderTop: active ? `2px solid var(--brand)` : '2px solid transparent',
                marginBottom: -1,
                borderBottom: active ? '1px solid var(--surface-1)' : 'none',
              }}>{t}</button>
            );
          })}
          <button style={{ width: 28, height: 28, borderRadius: 8, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
            <Icon name="plus" size={14} />
          </button>
        </div>

        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Orden #1042 · Borrador</div>
          {/* Order type segment */}
          <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
            {[
              { id: 'dinein', icon: 'chair', label: 'Mesa' },
              { id: 'takeout', icon: 'bag', label: 'Llevar', active: true },
              { id: 'delivery', icon: 'bike', label: 'Domicilio' },
            ].map(o => (
              <button key={o.id} style={{
                flex: 1, height: 32, borderRadius: 8,
                fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: o.active ? 'var(--brand)' : 'transparent',
                color: o.active ? 'var(--brand-fg)' : 'var(--text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                <Icon name={o.icon} size={13} /> {o.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input className="input" style={{ flex: 1, height: 34, fontSize: 12 }} placeholder="Cliente" defaultValue="Andrea M." />
            <input className="input" style={{ width: 110, height: 34, fontSize: 12 }} placeholder="Tel" defaultValue="55 8821 4501" />
          </div>
        </div>

        {/* Lines — compact one-row */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }} className="scrollbar-hide">
          {TICKET_LINES.map((l, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '32px 1fr auto auto',
              alignItems: 'center', gap: 10,
              padding: '10px 8px',
              borderBottom: '1px dashed var(--border)',
            }}>
              <span className="mono tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', width: 28, height: 28, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{l.qty}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.name}
                  {l.promo && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: 'var(--brand)', padding: '1px 5px', borderRadius: 4, background: 'var(--brand-soft)' }}>PROMO</span>}
                </div>
                {l.note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>· {l.note}</div>}
              </div>
              <span className="mono tnum" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>${(l.qty * l.price).toFixed(0)}</span>
              <button style={{ width: 22, height: 22, color: 'var(--text-muted)' }}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>Subtotal</span><span className="mono tnum">${subtotal.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--success)' }}>
            <span>Descuento</span><span className="mono tnum">−${discount.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total</span>
            <span className="mono tnum" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>${total.toFixed(2)}</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button style={{ height: 52, borderRadius: 14, background: 'var(--brand)', color: 'var(--brand-fg)', fontWeight: 700, fontSize: 14, letterSpacing: '0.04em', boxShadow: '0 8px 24px -8px var(--brand-glow)' }}>
            Procesar cobro · ${total.toFixed(2)}
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <button className="btn-ghost" style={{ height: 38, fontSize: 12 }}><Icon name="chef" size={13}/> Cocina</button>
            <button className="btn-ghost" style={{ height: 38, fontSize: 12 }}><Icon name="tag" size={13}/> Desc.</button>
            <button className="btn-ghost" style={{ height: 38, fontSize: 12, color: 'var(--danger)' }}><Icon name="trash" size={13}/> Limpiar</button>
          </div>
        </div>
      </aside>

      {/* Settings menu drawer (visible state preview) */}
      {menuOpen && <ConfigMenu onClose={() => setMenuOpen(false)} />}
    </div>
  );
}

function ConfigMenu({ onClose }) {
  const items = [
    { icon: 'user', label: 'Mi cuenta', sub: 'Lucía Pérez · Cajera' },
    { icon: 'clock', label: 'Turno', sub: 'Abierto · 04:32h', accent: true },
    { icon: 'truck', label: 'Repartidores', sub: '3 disponibles' },
    { icon: 'chair', label: 'Mesas y salones', sub: '12 ocupadas / 18' },
    { icon: 'printer', label: 'Impresoras', sub: '2 activas' },
    { icon: 'palette', label: 'Apariencia', sub: 'Tema y modo' },
    { icon: 'settings', label: 'Configuración avanzada', sub: 'TPV, idle lock, idiomas' },
    { icon: 'log', label: 'Cerrar sesión', sub: '', danger: true },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }} />
      <div style={{
        position: 'relative', width: 360, height: '100%',
        background: 'var(--surface-1)', borderRight: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid var(--border)' }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Menú</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Sucursal Centro</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>MRTPVREST · v3.2.1</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {items.map(it => (
            <button key={it.label} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 12px', borderRadius: 12,
              color: it.danger ? 'var(--danger)' : 'var(--text-primary)',
              background: it.accent ? 'var(--brand-soft)' : 'transparent',
              textAlign: 'left',
            }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: it.accent ? 'transparent' : 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: it.accent ? 'var(--brand)' : it.danger ? 'var(--danger)' : 'var(--text-secondary)' }}>
                <Icon name={it.icon} size={16} />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{it.label}</span>
                {it.sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{it.sub}</span>}
              </div>
              <Icon name="chevron" size={14} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

window.FrameMain = FrameMain;
window.ConfigMenu = ConfigMenu;
