/* Interactive TPV Prototype — single-file, fullbleed */

const PROTO_CATEGORIES = [
  { id: 'all', name: 'Todos' },
  { id: 'tacos', name: 'Tacos' },
  { id: 'tortas', name: 'Tortas' },
  { id: 'bowls', name: 'Bowls' },
  { id: 'bebidas', name: 'Bebidas' },
  { id: 'postres', name: 'Postres' },
];

const PROTO_PRODUCTS = [
  { id: 1, name: 'Taco al Pastor', price: 35, cat: 'tacos', img: 'AL PASTOR' },
  { id: 2, name: 'Taco de Suadero', price: 38, cat: 'tacos', img: 'SUADERO' },
  { id: 3, name: 'Taco de Bistec', price: 42, cat: 'tacos', img: 'BISTEC' },
  { id: 4, name: 'Gringa Pastor', price: 95, cat: 'tacos', img: 'GRINGA', promo: 79 },
  { id: 5, name: 'Torta Cubana', price: 145, cat: 'tortas', img: 'CUBANA' },
  { id: 6, name: 'Torta Milanesa', price: 120, cat: 'tortas', img: 'MILANESA' },
  { id: 7, name: 'Bowl de Pollo', price: 165, cat: 'bowls', img: 'POLLO BOWL' },
  { id: 8, name: 'Bowl Vegetariano', price: 145, cat: 'bowls', img: 'VEGGIE' },
  { id: 9, name: 'Agua de Jamaica', price: 38, cat: 'bebidas', img: 'JAMAICA' },
  { id: 10, name: 'Refresco 600ml', price: 32, cat: 'bebidas', img: 'REFRESCO' },
  { id: 11, name: 'Cerveza Artesanal', price: 78, cat: 'bebidas', img: 'CERVEZA' },
  { id: 12, name: 'Flan Napolitano', price: 65, cat: 'postres', img: 'FLAN' },
];

const SAMPLE_ORDERS = [
  { num: '#1042', name: 'Andrea M.', type: 'Llevar', status: 'Preparando', statusColor: 'var(--info)', total: 287, time: '12 min', items: 4 },
  { num: '#1041', name: 'Jorge V.', type: 'Mesa 6', status: 'Listo', statusColor: 'var(--success)', total: 542, time: '4 min', items: 7 },
  { num: '#1040', name: 'Ana S.', type: 'Domicilio', status: 'En camino', statusColor: 'var(--warning)', total: 198, time: '23 min', items: 3, driver: 'Luis G.' },
  { num: '#1039', name: 'Tomás R.', type: 'Domicilio', status: 'Sin asignar', statusColor: 'var(--danger)', total: 312, time: '1 min', items: 5, needsDriver: true },
  { num: '#1038', name: 'Carla H.', type: 'Mesa 2', status: 'Confirmado', statusColor: 'var(--info)', total: 425, time: '8 min', items: 5 },
];

function PIcon({ name, size = 16 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const p = {
    menu: <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    bag: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
    chair: <><path d="M5 4v8h14V4"/><path d="M5 12v8M19 12v8M3 12h18"/></>,
    bike: <><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5h-7l-2-7h6l3 7zM12 6h3l3 4.5"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    minus: <><line x1="5" y1="12" x2="19" y2="12"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    chevron: <><polyline points="9 18 15 12 9 6"/></>,
    user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    receipt: <><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2"/><path d="M8 7h8M8 11h8M8 15h5"/></>,
    chef: <><path d="M6 13.87A4 4 0 0 1 7.41 6 5.11 5.11 0 0 1 17 5.13a4 4 0 0 1 1 7.74"/><path d="M6 17h12v3a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/></>,
    truck: <><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    moon: <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    log: <><path d="M16 17l5-5-5-5M21 12H9M9 22V2"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    tag: <><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/></>,
    printer: <><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></>,
    moto: <><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M14 17H8M14 17l-1-7h-3M14 17l3-7h3"/></>,
    palette: <><circle cx="12" cy="12" r="9"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16.5" cy="10.5" r="1.2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></>,
    cash: <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
  };
  return <svg {...common}>{p[name]}</svg>;
}

function Proto() {
  const [theme, setTheme] = React.useState('emerald');
  const [mode, setMode] = React.useState('dark');
  const [activeCat, setActiveCat] = React.useState('all');
  const [search, setSearch] = React.useState('');

  const [tickets, setTickets] = React.useState([
    { id: 1, name: 'T1', items: [], type: 'takeout', customer: '', phone: '' },
  ]);
  const [activeIdx, setActiveIdx] = React.useState(0);

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [ordersOpen, setOrdersOpen] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  const ticket = tickets[activeIdx];

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const updateTicket = (patch) => {
    setTickets(ts => ts.map((t, i) => i === activeIdx ? { ...t, ...patch } : t));
  };

  const addProduct = (p) => {
    const price = p.promo || p.price;
    const items = [...ticket.items];
    const existing = items.find(it => it.id === p.id);
    if (existing) {
      existing.qty += 1;
    } else {
      items.push({ id: p.id, name: p.name, qty: 1, price, promo: !!p.promo });
    }
    updateTicket({ items });
  };
  const changeQty = (id, delta) => {
    const items = ticket.items.map(it => it.id === id ? { ...it, qty: it.qty + delta } : it).filter(it => it.qty > 0);
    updateTicket({ items });
  };
  const removeLine = (id) => updateTicket({ items: ticket.items.filter(it => it.id !== id) });
  const clearTicket = () => updateTicket({ items: [] });

  const addTicket = () => {
    const id = Math.max(...tickets.map(t => t.id)) + 1;
    setTickets([...tickets, { id, name: `T${id}`, items: [], type: 'takeout', customer: '', phone: '' }]);
    setActiveIdx(tickets.length);
  };
  const closeTicket = (idx) => {
    if (tickets.length === 1) {
      setTickets([{ id: 1, name: 'T1', items: [], type: 'takeout', customer: '', phone: '' }]);
      setActiveIdx(0); return;
    }
    const next = tickets.filter((_, i) => i !== idx);
    setTickets(next);
    setActiveIdx(Math.min(activeIdx, next.length - 1));
  };

  const products = PROTO_PRODUCTS.filter(p => {
    const okCat = activeCat === 'all' || p.cat === activeCat;
    const okSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return okCat && okSearch;
  });

  const subtotal = ticket.items.reduce((s, it) => s + it.qty * it.price, 0);
  const discount = subtotal > 200 ? 25 : 0;
  const total = subtotal - discount;

  return (
    <div className="tpv-frame" data-theme={theme} data-mode={mode} style={{ height: '100vh', display: 'grid', gridTemplateColumns: '1fr 380px', position: 'relative' }}>
      {/* MAIN */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative', zIndex: 1 }}>
        {/* Topbar */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
          <button onClick={() => setMenuOpen(true)} style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <PIcon name="menu" size={18} />
          </button>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>MRTPVREST · Sucursal Centro</span>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Catálogo · Punto de venta</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative', width: 280 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} className="input" placeholder="Buscar producto…" style={{ paddingLeft: 36 }} />
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
              <PIcon name="search" size={14} />
            </div>
          </div>
          <button onClick={() => setOrdersOpen(true)} style={{ height: 40, padding: '0 14px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
            <PIcon name="receipt" size={15} />
            Pedidos abiertos
            <span style={{ background: 'var(--brand)', color: 'var(--brand-fg)', borderRadius: 999, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{SAMPLE_ORDERS.length}</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }} />
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Turno abierto</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>Lucía P. · 04:32h</div>
            </div>
          </div>
        </header>

        {/* Categories */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 20px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }} className="scrollbar-hide">
          {PROTO_CATEGORIES.map(c => {
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
              </button>
            );
          })}
        </div>

        {/* Products grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }} className="scrollbar-hide">
          {products.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin resultados</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {products.map(p => (
                <button key={p.id} onClick={() => addProduct(p)} style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 14,
                  textAlign: 'left',
                  display: 'flex', flexDirection: 'column', gap: 12,
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'transform .12s ease, border-color .12s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {p.promo && (
                    <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'var(--brand)', color: 'var(--brand-fg)', zIndex: 2 }}>−{Math.round((1 - p.promo/p.price)*100)}%</span>
                  )}
                  <div className="img-placeholder" style={{ height: 110, borderRadius: 12 }}>{p.img}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{p.name}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                      {p.promo ? (
                        <>
                          <span className="mono tnum" style={{ fontSize: 16, fontWeight: 700, color: 'var(--brand)' }}>${p.promo}</span>
                          <span className="mono tnum" style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'line-through' }}>${p.price}</span>
                        </>
                      ) : (
                        <span className="mono tnum" style={{ fontSize: 16, fontWeight: 700 }}>${p.price}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* TICKET PANEL */}
      <aside style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '12px 16px 0', borderBottom: '1px solid var(--border)' }}>
          {tickets.map((t, i) => {
            const active = i === activeIdx;
            return (
              <div key={t.id} style={{ display: 'flex' }}>
                <button onClick={() => setActiveIdx(i)} style={{
                  height: 36, padding: '0 12px',
                  borderRadius: '10px 10px 0 0',
                  fontSize: 12, fontWeight: 600,
                  background: active ? 'var(--surface-1)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderTop: active ? `2px solid var(--brand)` : '2px solid transparent',
                  marginBottom: -1,
                }}>{t.name}</button>
                {tickets.length > 1 && (
                  <button onClick={() => closeTicket(i)} style={{ width: 22, height: 36, color: 'var(--text-muted)' }}><PIcon name="x" size={11}/></button>
                )}
              </div>
            );
          })}
          <button onClick={addTicket} style={{ width: 28, height: 28, borderRadius: 8, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
            <PIcon name="plus" size={14} />
          </button>
        </div>

        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Orden #{1042 + activeIdx} · Borrador</div>
          <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
            {[
              { id: 'dinein', icon: 'chair', label: 'Mesa' },
              { id: 'takeout', icon: 'bag', label: 'Llevar' },
              { id: 'delivery', icon: 'bike', label: 'Domicilio' },
            ].map(o => {
              const active = ticket.type === o.id;
              return (
                <button key={o.id} onClick={() => updateTicket({ type: o.id })} style={{
                  flex: 1, height: 32, borderRadius: 8,
                  fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: active ? 'var(--brand)' : 'transparent',
                  color: active ? 'var(--brand-fg)' : 'var(--text-secondary)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  <PIcon name={o.icon} size={13} /> {o.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input value={ticket.customer} onChange={e => updateTicket({ customer: e.target.value })} className="input" style={{ flex: 1, height: 34, fontSize: 12 }} placeholder="Cliente" />
            <input value={ticket.phone} onChange={e => updateTicket({ phone: e.target.value })} className="input" style={{ width: 110, height: 34, fontSize: 12 }} placeholder="Tel" />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }} className="scrollbar-hide">
          {ticket.items.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)', padding: 32 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PIcon name="bag" size={22} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Toca un producto<br/>para empezar</div>
            </div>
          ) : ticket.items.map(l => (
            <div key={l.id} style={{
              display: 'grid', gridTemplateColumns: '32px 1fr auto auto',
              alignItems: 'center', gap: 10,
              padding: '10px 8px',
              borderBottom: '1px dashed var(--border)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button onClick={() => changeQty(l.id, +1)} style={{ width: 28, height: 16, borderRadius: '6px 6px 0 0', background: 'var(--surface-3)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PIcon name="plus" size={10}/></button>
                <span className="mono tnum" style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', background: 'var(--surface-2)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>{l.qty}</span>
                <button onClick={() => changeQty(l.id, -1)} style={{ width: 28, height: 16, borderRadius: '0 0 6px 6px', background: 'var(--surface-3)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PIcon name="minus" size={10}/></button>
              </div>
              <div style={{ minWidth: 0, paddingLeft: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.name}
                  {l.promo && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: 'var(--brand)', padding: '1px 5px', borderRadius: 4, background: 'var(--brand-soft)' }}>PROMO</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }} className="mono tnum">${l.price} c/u</div>
              </div>
              <span className="mono tnum" style={{ fontSize: 13, fontWeight: 600 }}>${(l.qty * l.price).toFixed(0)}</span>
              <button onClick={() => removeLine(l.id)} style={{ width: 22, height: 22, color: 'var(--text-muted)' }}><PIcon name="x" size={12}/></button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>Subtotal</span><span className="mono tnum">${subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--success)' }}>
              <span>Descuento (+$200)</span><span className="mono tnum">−${discount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total</span>
            <span className="mono tnum" style={{ fontSize: 28, fontWeight: 700 }}>${total.toFixed(2)}</span>
          </div>
        </div>

        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => ticket.items.length && setPayOpen(true)} disabled={!ticket.items.length} style={{
            height: 52, borderRadius: 14, background: 'var(--brand)', color: 'var(--brand-fg)', fontWeight: 700, fontSize: 14, letterSpacing: '0.04em',
            opacity: ticket.items.length ? 1 : 0.4, cursor: ticket.items.length ? 'pointer' : 'not-allowed',
            boxShadow: ticket.items.length ? '0 8px 24px -8px var(--brand-glow)' : 'none',
          }}>
            Procesar cobro · ${total.toFixed(2)}
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <button onClick={() => ticket.items.length && showToast('Enviado a cocina')} className="btn-ghost" style={{ height: 38, fontSize: 12, opacity: ticket.items.length ? 1 : 0.4 }}><PIcon name="chef" size={13}/> Cocina</button>
            <button onClick={() => showToast('Descuento aplicado')} className="btn-ghost" style={{ height: 38, fontSize: 12 }}><PIcon name="tag" size={13}/> Desc.</button>
            <button onClick={clearTicket} className="btn-ghost" style={{ height: 38, fontSize: 12, color: 'var(--danger)' }}><PIcon name="trash" size={13}/> Limpiar</button>
          </div>
        </div>
      </aside>

      {/* Menu drawer */}
      {menuOpen && <ProtoMenu onClose={() => setMenuOpen(false)} theme={theme} setTheme={setTheme} mode={mode} setMode={setMode} />}
      {ordersOpen && <ProtoOrdersDrawer onClose={() => setOrdersOpen(false)} onAssign={() => showToast('Repartidor asignado')} />}
      {payOpen && <ProtoPayment onClose={() => setPayOpen(false)} total={total} onConfirm={() => { setPayOpen(false); clearTicket(); showToast('Cobro confirmado'); }} />}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 20px', borderRadius: 12,
          background: 'var(--surface-3)', color: 'var(--text-primary)',
          border: '1px solid var(--border-strong)',
          fontSize: 13, fontWeight: 600,
          boxShadow: 'var(--shadow-lg)',
          zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <PIcon name="check" size={14}/> {toast}
        </div>
      )}
    </div>
  );
}

function ProtoMenu({ onClose, theme, setTheme, mode, setMode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }} />
      <div style={{ position: 'relative', width: 360, height: '100%', background: 'var(--surface-1)', borderRight: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Menú</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Sucursal Centro</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>MRTPVREST · v3.2.1</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, color: 'var(--text-muted)' }}><PIcon name="x" size={16}/></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          <div className="eyebrow" style={{ padding: '8px 6px' }}>Sesión</div>
          {[
            { icon: 'user', label: 'Mi cuenta', sub: 'Lucía Pérez · Cajera' },
            { icon: 'clock', label: 'Turno', sub: 'Abierto · 04:32h', accent: true },
          ].map(it => <ProtoMenuItem key={it.label} {...it} />)}

          <div className="eyebrow" style={{ padding: '14px 6px 8px' }}>Operaciones</div>
          {[
            { icon: 'truck', label: 'Repartidores', sub: '3 disponibles' },
            { icon: 'chair', label: 'Mesas y salones', sub: '12 ocupadas / 18' },
            { icon: 'printer', label: 'Impresoras', sub: '2 activas' },
          ].map(it => <ProtoMenuItem key={it.label} {...it} />)}

          <div className="eyebrow" style={{ padding: '14px 6px 8px' }}>Apariencia</div>
          <div style={{ padding: '6px 6px 10px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Tema</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
              {[
                { id: 'emerald', color: '#10b981', label: 'Esmeralda' },
                { id: 'indigo', color: '#6366f1', label: 'Índigo' },
                { id: 'amber', color: '#f97316', label: 'Ámbar' },
              ].map(t => (
                <button key={t.id} onClick={() => setTheme(t.id)} style={{
                  padding: '10px 8px', borderRadius: 10,
                  background: theme === t.id ? 'var(--surface-2)' : 'transparent',
                  border: `1.5px solid ${theme === t.id ? t.color : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 11, fontWeight: 600,
                }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: t.color }} />
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '12px 0 8px' }}>Modo</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[{ id: 'dark', icon: 'moon', label: 'Oscuro' }, { id: 'light', icon: 'sun', label: 'Claro' }].map(m => (
                <button key={m.id} onClick={() => setMode(m.id)} style={{
                  padding: '10px', borderRadius: 10,
                  background: mode === m.id ? 'var(--surface-2)' : 'transparent',
                  border: `1.5px solid ${mode === m.id ? 'var(--brand)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontSize: 12, fontWeight: 600,
                  color: mode === m.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>
                  <PIcon name={m.icon} size={14}/> {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="eyebrow" style={{ padding: '14px 6px 8px' }}>Sistema</div>
          <ProtoMenuItem icon="settings" label="Configuración avanzada" sub="TPV, idle lock, idiomas" />
          <ProtoMenuItem icon="log" label="Cerrar sesión" danger />
        </div>
      </div>
    </div>
  );
}
function ProtoMenuItem({ icon, label, sub, danger, accent }) {
  return (
    <button style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 10px', borderRadius: 10,
      color: danger ? 'var(--danger)' : 'var(--text-primary)',
      background: accent ? 'var(--brand-soft)' : 'transparent',
      textAlign: 'left',
      cursor: 'pointer',
    }}
    onMouseEnter={e => { if (!accent) e.currentTarget.style.background = 'var(--surface-2)'; }}
    onMouseLeave={e => { if (!accent) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ width: 34, height: 34, borderRadius: 10, background: accent ? 'transparent' : 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent ? 'var(--brand)' : danger ? 'var(--danger)' : 'var(--text-secondary)' }}>
        <PIcon name={icon} size={15} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
      </div>
      <PIcon name="chevron" size={13} />
    </button>
  );
}

function ProtoOrdersDrawer({ onClose, onAssign }) {
  const [selected, setSelected] = React.useState(3);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }} />
      <aside style={{ position: 'relative', width: 420, height: '100%', background: 'var(--surface-1)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <PIcon name="receipt" size={18}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Pedidos activos</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{SAMPLE_ORDERS.length} en curso</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, color: 'var(--text-muted)' }}><PIcon name="x" size={16}/></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }} className="scrollbar-hide">
          {SAMPLE_ORDERS.map((o, i) => {
            const sel = selected === i;
            return (
              <div key={i} onClick={() => setSelected(i)} style={{
                padding: '14px 18px', borderBottom: '1px solid var(--border)',
                background: sel ? 'var(--surface-2)' : 'transparent',
                borderLeft: sel ? '3px solid var(--brand)' : '3px solid transparent',
                cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{o.num}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {o.type}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{o.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{o.items} productos · hace {o.time}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: o.statusColor + '20', color: o.statusColor, textTransform: 'uppercase' }}>{o.status}</span>
                    <div className="mono tnum" style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>${o.total}</div>
                  </div>
                </div>
                {sel && o.needsDriver && (
                  <button onClick={onAssign} style={{ marginTop: 10, height: 36, width: '100%', borderRadius: 10, background: 'var(--brand)', color: 'var(--brand-fg)', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <PIcon name="moto" size={13}/> Asignar repartidor
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function ProtoPayment({ onClose, total, onConfirm }) {
  const [method, setMethod] = React.useState('card');
  const [cash, setCash] = React.useState(Math.ceil(total / 100) * 100);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} />
      <div className="card" style={{ position: 'relative', width: '100%', maxWidth: 720, padding: 0, display: 'grid', gridTemplateColumns: '1fr 280px', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: 24 }}>
          <div className="eyebrow">Cobrar</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 18 }}>Procesar pago</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 18 }}>
            {[
              { id: 'cash', icon: 'cash', label: 'Efectivo' },
              { id: 'card', icon: 'card', label: 'Tarjeta' },
              { id: 'qr', icon: 'tag', label: 'Transfer' },
            ].map(m => {
              const sel = method === m.id;
              return (
                <button key={m.id} onClick={() => setMethod(m.id)} style={{
                  height: 88, borderRadius: 14,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: sel ? 'var(--brand-soft)' : 'var(--surface-2)',
                  border: `1.5px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                  color: sel ? 'var(--brand)' : 'var(--text-secondary)',
                  fontSize: 12, fontWeight: 600,
                }}>
                  <PIcon name={m.icon} size={20}/> {m.label}
                </button>
              );
            })}
          </div>
          {method === 'cash' && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Recibido</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                <span className="mono tnum" style={{ fontSize: 30, fontWeight: 700 }}>${cash}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· Cambio</span>
                <span className="mono tnum" style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>${(cash - total).toFixed(2)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {[Math.ceil(total), Math.ceil(total/100)*100, Math.ceil(total/100)*100 + 100, Math.ceil(total/100)*100 + 200].map((v, i) => (
                  <button key={i} onClick={() => setCash(v)} style={{ height: 40, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>${v}</button>
                ))}
              </div>
            </div>
          )}
          {method === 'card' && (
            <div className="card" style={{ padding: 16, background: 'var(--surface-2)' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Esperando terminal</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Verifone V200c · conectado</div>
              <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '60%', background: 'var(--brand)' }} />
              </div>
            </div>
          )}
          {method === 'qr' && (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div className="img-placeholder" style={{ width: 100, height: 100, borderRadius: 12, background: 'var(--surface-2)' }}>QR</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Escanea para pagar</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SPEI · CoDi</div>
              </div>
            </div>
          )}
        </div>
        <div style={{ background: 'var(--surface-2)', padding: 20, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)' }}>
          <div className="eyebrow">Total</div>
          <div className="mono tnum" style={{ fontSize: 32, fontWeight: 700, marginTop: 4 }}>${total.toFixed(2)}</div>
          <div style={{ flex: 1 }} />
          <button onClick={onConfirm} style={{ height: 50, borderRadius: 14, background: 'var(--brand)', color: 'var(--brand-fg)', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em' }}>
            Confirmar
          </button>
          <button onClick={onClose} style={{ height: 40, marginTop: 8, borderRadius: 12, color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 12 }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Proto />);
