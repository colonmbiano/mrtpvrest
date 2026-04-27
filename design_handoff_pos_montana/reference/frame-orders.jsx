/* Frame: Pedidos drawer + Asignar repartidor */

function FrameOrders({ tweaks }) {
  const { mode, theme } = tweaks;
  const orders = [
    { num: '#1042', name: 'Andrea M.', type: 'Llevar', status: 'Preparando', statusColor: 'var(--info)', total: 287, time: '12 min', items: 4 },
    { num: '#1041', name: 'Jorge V.', type: 'Mesa 6', status: 'Listo', statusColor: 'var(--success)', total: 542, time: '4 min', items: 7 },
    { num: '#1040', name: 'Ana S.', type: 'Domicilio', status: 'En camino', statusColor: 'var(--warning)', total: 198, time: '23 min', items: 3, driver: 'Luis G.' },
    { num: '#1039', name: 'Tomás R.', type: 'Domicilio', status: 'Sin asignar', statusColor: 'var(--danger)', total: 312, time: '1 min', items: 5, needsDriver: true },
    { num: '#1038', name: 'Carla H.', type: 'Mesa 2', status: 'Confirmado', statusColor: 'var(--info)', total: 425, time: '8 min', items: 5 },
    { num: '#1037', name: 'Mostrador', type: 'Llevar', status: 'Preparando', statusColor: 'var(--info)', total: 89, time: '15 min', items: 2 },
  ];
  const [selected, setSelected] = React.useState(3);

  return (
    <div className="tpv-frame" data-mode={mode} data-theme={theme} style={{ display: 'grid', gridTemplateColumns: '1fr 420px', position: 'relative' }}>
      {/* Background dimmer (suggesting drawer overlay) */}
      <div style={{ background: 'var(--bg)', position: 'relative', zIndex: 1 }}>
        {/* Faded TPV */}
        <div style={{ padding: 20, opacity: 0.35, filter: 'blur(1px)', height: '100%' }}>
          <div style={{ height: 56, background: 'var(--surface-1)', borderRadius: 12, marginBottom: 16, border: '1px solid var(--border)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {[...Array(9)].map((_, i) => (
              <div key={i} style={{ height: 160, background: 'var(--surface-1)', borderRadius: 14, border: '1px solid var(--border)' }} />
            ))}
          </div>
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      </div>

      {/* Drawer */}
      <aside style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', position: 'relative', zIndex: 2 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="receipt" size={18} />
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Pedidos activos</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{orders.length} en curso · 1 sin repartidor</div>
          </div>
          <button style={{ width: 32, height: 32, borderRadius: 8, color: 'var(--text-muted)' }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          {['Todos', 'Mesa', 'Llevar', 'Domicilio'].map((f, i) => (
            <button key={f} style={{
              height: 30, padding: '0 12px', borderRadius: 8,
              fontSize: 12, fontWeight: 600,
              background: i === 0 ? 'var(--surface-3)' : 'transparent',
              color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: i === 0 ? '1px solid var(--border-strong)' : '1px solid transparent',
            }}>{f}</button>
          ))}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }} className="scrollbar-hide">
          {orders.map((o, i) => {
            const sel = selected === i;
            return (
              <div key={i} onClick={() => setSelected(i)} style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                background: sel ? 'var(--surface-2)' : 'transparent',
                borderLeft: sel ? `3px solid var(--brand)` : '3px solid transparent',
                cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{o.num}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>·</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.type}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{o.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{o.items} productos · hace {o.time}</div>
                    {o.driver && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="moto" size={11}/> {o.driver}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: o.statusColor + '20', color: o.statusColor, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                      {o.status}
                    </span>
                    <div className="mono tnum" style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>${o.total}</div>
                  </div>
                </div>
                {sel && o.needsDriver && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button style={{ height: 38, borderRadius: 10, background: 'var(--brand)', color: 'var(--brand-fg)', fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Icon name="moto" size={14}/> Asignar repartidor
                    </button>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <button className="btn-ghost" style={{ height: 32, fontSize: 11 }}><Icon name="printer" size={12}/> Reimprimir</button>
                      <button className="btn-ghost" style={{ height: 32, fontSize: 11, color: 'var(--danger)' }}>Cancelar</button>
                    </div>
                  </div>
                )}
                {sel && !o.needsDriver && (
                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button className="btn-ghost" style={{ height: 32, fontSize: 11 }}>Ver detalle</button>
                    <button style={{ height: 32, borderRadius: 8, background: 'var(--brand)', color: 'var(--brand-fg)', fontSize: 11, fontWeight: 700 }}>Cobrar</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function FrameAssign({ tweaks }) {
  const { mode, theme } = tweaks;
  const drivers = [
    { name: 'Luis García', status: 'Disponible', orders: 0, dist: '—', tag: 'success', sel: true },
    { name: 'Marco Reyes', status: 'En ruta', orders: 2, dist: '1.2 km', tag: 'warning' },
    { name: 'Diana Soto', status: 'Disponible', orders: 0, dist: '—', tag: 'success' },
    { name: 'Pablo Núñez', status: 'En ruta', orders: 1, dist: '0.8 km', tag: 'warning' },
    { name: 'Iván López', status: 'Descanso', orders: 0, dist: '—', tag: 'muted' },
  ];
  return (
    <div className="tpv-frame" data-mode={mode} data-theme={theme} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div className="card" style={{ width: '100%', maxWidth: 560, padding: 0, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--brand-soft)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="moto" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="eyebrow">Pedido #1039 · $312</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>Asignar repartidor</div>
          </div>
          <button style={{ width: 32, height: 32, borderRadius: 8, color: 'var(--text-muted)' }}><Icon name="x" size={16}/></button>
        </div>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="pin" size={14}/>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Calle 5 de Mayo 233, Col. Centro · 2.4 km</div>
        </div>

        <div style={{ padding: 12, maxHeight: 360, overflowY: 'auto' }} className="scrollbar-hide">
          {drivers.map((d, i) => {
            const colors = { success: 'var(--success)', warning: 'var(--warning)', muted: 'var(--text-muted)' };
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                borderRadius: 12, marginBottom: 4,
                background: d.sel ? 'var(--brand-soft)' : 'transparent',
                border: `1px solid ${d.sel ? 'var(--brand)' : 'transparent'}`,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {d.name.split(' ').map(s => s[0]).join('')}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors[d.tag] }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.status} · {d.orders} en curso</span>
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.dist}</div>
                {d.sel && <Icon name="check" size={16}/>}
              </div>
            );
          })}
        </div>

        <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <button className="btn-ghost" style={{ flex: 1, height: 44, fontSize: 13 }}>Cancelar</button>
          <button style={{ flex: 2, height: 44, borderRadius: 12, background: 'var(--brand)', color: 'var(--brand-fg)', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em' }}>
            Asignar a Luis García
          </button>
        </div>
      </div>
    </div>
  );
}

window.FrameOrders = FrameOrders;
window.FrameAssign = FrameAssign;
