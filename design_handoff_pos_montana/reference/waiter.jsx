/* Vista Mesero — single-file prototype */

const W_TABLES = [
  // Salón principal
  { id: 'M1',  shape: 'round',  x: 60,  y: 60,  w: 90,  h: 90,  seats: 2, zone: 'Terraza', state: 'free' },
  { id: 'M2',  shape: 'round',  x: 180, y: 60,  w: 90,  h: 90,  seats: 2, zone: 'Terraza', state: 'occupied', elapsed: 28, ticket: 320, since: '20:14' },
  { id: 'M3',  shape: 'square', x: 320, y: 50,  w: 110, h: 110, seats: 4, zone: 'Terraza', state: 'kitchen', elapsed: 12, ticket: 645, since: '20:30', kitchenAlert: 'Plato listo' },
  { id: 'M4',  shape: 'square', x: 470, y: 50,  w: 110, h: 110, seats: 4, zone: 'Terraza', state: 'served', elapsed: 41, ticket: 712, since: '20:01' },
  { id: 'M5',  shape: 'rect',   x: 620, y: 50,  w: 200, h: 110, seats: 6, zone: 'Terraza', state: 'bill', elapsed: 78, ticket: 1840, since: '19:24', alert: 'Pidió cuenta' },

  { id: 'M6',  shape: 'round',  x: 60,  y: 220, w: 90,  h: 90,  seats: 2, zone: 'Salón', state: 'dirty' },
  { id: 'M7',  shape: 'square', x: 180, y: 210, w: 110, h: 110, seats: 4, zone: 'Salón', state: 'occupied', elapsed: 52, ticket: 480, since: '19:50', warn: 'Sin postre 45 min' },
  { id: 'M8',  shape: 'square', x: 320, y: 210, w: 110, h: 110, seats: 4, zone: 'Salón', state: 'free' },
  { id: 'M9',  shape: 'rect',   x: 470, y: 210, w: 200, h: 110, seats: 8, zone: 'Salón', state: 'occupied', elapsed: 18, ticket: 980, since: '20:24', mine: true },

  { id: 'B1',  shape: 'round',  x: 720, y: 240, w: 70,  h: 70,  seats: 1, zone: 'Barra', state: 'occupied', elapsed: 8, ticket: 145, since: '20:34' },
  { id: 'B2',  shape: 'round',  x: 800, y: 240, w: 70,  h: 70,  seats: 1, zone: 'Barra', state: 'free' },
];

const W_CATS = [
  { id: 'all',     name: 'Todos' },
  { id: 'tacos',   name: 'Tacos' },
  { id: 'tortas',  name: 'Tortas' },
  { id: 'bowls',   name: 'Bowls' },
  { id: 'bebidas', name: 'Bebidas' },
  { id: 'postres', name: 'Postres' },
];
const W_PRODUCTS = [
  { id: 1, name: 'Taco al Pastor',     price: 35,  cat: 'tacos',   img: 'AL PASTOR' },
  { id: 2, name: 'Taco de Suadero',    price: 38,  cat: 'tacos',   img: 'SUADERO' },
  { id: 3, name: 'Taco de Bistec',     price: 42,  cat: 'tacos',   img: 'BISTEC' },
  { id: 4, name: 'Gringa Pastor',      price: 95,  cat: 'tacos',   img: 'GRINGA' },
  { id: 5, name: 'Torta Cubana',       price: 145, cat: 'tortas',  img: 'CUBANA' },
  { id: 6, name: 'Torta Milanesa',     price: 120, cat: 'tortas',  img: 'MILANESA' },
  { id: 7, name: 'Bowl de Pollo',      price: 165, cat: 'bowls',   img: 'POLLO' },
  { id: 8, name: 'Bowl Vegetariano',   price: 145, cat: 'bowls',   img: 'VEGGIE' },
  { id: 9, name: 'Agua de Jamaica',    price: 38,  cat: 'bebidas', img: 'JAMAICA' },
  { id: 10, name: 'Refresco 600ml',    price: 32,  cat: 'bebidas', img: 'REFRESCO' },
  { id: 11, name: 'Cerveza Artesanal', price: 78,  cat: 'bebidas', img: 'CERVEZA' },
  { id: 12, name: 'Flan Napolitano',   price: 65,  cat: 'postres', img: 'FLAN' },
];

const W_MODIFIERS = {
  default: ['Sin cebolla', 'Sin cilantro', 'Extra picante', 'Para llevar'],
  tacos: ['Sin cebolla', 'Sin cilantro', 'Doble tortilla', 'Extra salsa', 'Bien dorado'],
  bebidas: ['Sin azúcar', 'Sin hielo', 'Con limón', 'Extra grande'],
};

const W_KITCHEN_FEED = [
  { id: 1, table: 'M3', msg: 'Plato listo: 2 tacos pastor', time: '20:42', kind: 'ready' },
  { id: 2, table: 'M5', msg: 'Mesa pidió la cuenta', time: '20:41', kind: 'bill' },
  { id: 3, table: 'M7', msg: 'Sin pedir postre · 45 min', time: '20:39', kind: 'warn' },
  { id: 4, table: 'M9', msg: 'Comanda enviada · 4 items', time: '20:36', kind: 'sent' },
];

const STATE_META = {
  free:     { label: 'Libre',         color: 'var(--text-muted)',  bg: 'transparent',         border: 'var(--border-strong)' },
  occupied: { label: 'Ocupada',       color: 'var(--info)',        bg: 'var(--info-soft)',    border: 'var(--info)' },
  kitchen:  { label: 'En cocina',     color: 'var(--warning)',     bg: 'var(--warning-soft)', border: 'var(--warning)' },
  served:   { label: 'Servida',       color: 'var(--success)',     bg: 'var(--success-soft)', border: 'var(--success)' },
  bill:     { label: 'Pidió cuenta',  color: 'var(--brand)',       bg: 'var(--brand-soft)',   border: 'var(--brand)' },
  dirty:    { label: 'Por limpiar',   color: 'var(--danger)',      bg: 'var(--danger-soft)',  border: 'var(--danger)' },
};

function WIcon({ name, size = 16 }) {
  const c = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const p = {
    map:    <><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></>,
    list:   <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    bag:    <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
    plus:   <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    minus:  <><line x1="5" y1="12" x2="19" y2="12"/></>,
    x:      <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    chev:   <><polyline points="9 18 15 12 9 6"/></>,
    chevL:  <><polyline points="15 18 9 12 15 6"/></>,
    bell:   <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    chef:   <><path d="M6 13.87A4 4 0 0 1 7.41 6 5.11 5.11 0 0 1 17 5.13a4 4 0 0 1 1 7.74"/><path d="M6 17h12v3a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/></>,
    clock:  <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></>,
    user:   <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    check:  <><polyline points="20 6 9 17 4 12"/></>,
    split:  <><path d="M3 6h18"/><path d="M3 18h18"/><path d="M9 12h12"/><path d="M3 12h2"/></>,
    move:   <><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></>,
    note:   <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    flame:  <><path d="M8.5 14.5C5 12 5 8 7 5c0 3 2.5 4 4 3 1-2 1-4-1-7 6 3 9 8 9 13a6 6 0 0 1-12 0c0-1.5.5-3 1.5-4z"/></>,
    cash:   <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    arrow:  <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    sparks: <><polygon points="12 2 14 8 20 9 15 13 17 19 12 16 7 19 9 13 4 9 10 8 12 2"/></>,
  };
  return <svg {...c}>{p[name]}</svg>;
}

const fmtMin = (m) => `${m}m`;

function Waiter() {
  const [theme] = React.useState('emerald');
  const [mode] = React.useState('dark');
  const [view, setView] = React.useState('floor'); // floor | mine | order
  const [selected, setSelected] = React.useState(null); // table id
  const [ticketMode, setTicketMode] = React.useState(null); // { tableId | 'takeout' }
  const [ticketLines, setTicketLines] = React.useState([]);
  const [activeCat, setActiveCat] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [feedOpen, setFeedOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [shiftOpen, setShiftOpen] = React.useState(false);
  const [editLine, setEditLine] = React.useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 1800); };

  const tables = W_TABLES;
  const myTables = tables.filter(t => t.mine || ['M3','M5','M7','M9'].includes(t.id));

  const openOrderForTable = (id) => {
    setTicketMode({ kind: 'table', id });
    setTicketLines([]);
    setView('order');
  };
  const openTakeout = () => {
    setTicketMode({ kind: 'takeout' });
    setTicketLines([]);
    setView('order');
  };
  const addProduct = (p) => {
    setTicketLines(ls => {
      const idx = ls.findIndex(l => l.id === p.id && !l.mods?.length);
      if (idx >= 0) {
        return ls.map((l, i) => i === idx ? { ...l, qty: l.qty + 1 } : l);
      }
      return [...ls, { id: p.id, name: p.name, price: p.price, qty: 1, cat: p.cat, mods: [], note: '' }];
    });
  };
  const sendToKitchen = () => {
    if (!ticketLines.length) return;
    showToast(`Comanda enviada · ${ticketLines.reduce((s, l) => s + l.qty, 0)} items`);
    setTicketLines([]);
    setTicketMode(null);
    setView('floor');
  };

  return (
    <div className="tpv-frame" data-theme={theme} data-mode={mode} style={{ height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <WHeader view={view} setView={setView} onTakeout={openTakeout} onShift={() => setShiftOpen(true)} onFeed={() => setFeedOpen(true)} feedCount={W_KITCHEN_FEED.filter(f => f.kind === 'ready' || f.kind === 'bill').length} />

      <div style={{ flex: 1, minHeight: 0, position: 'relative', zIndex: 1, overflow: 'hidden' }}>
        {view === 'floor' && (
          <FloorPlan tables={tables} selected={selected} setSelected={setSelected} onOpenOrder={openOrderForTable} />
        )}
        {view === 'mine' && (
          <MyTables tables={myTables} onOpenOrder={openOrderForTable} />
        )}
        {view === 'order' && ticketMode && (
          <OrderView
            mode={ticketMode}
            lines={ticketLines}
            setLines={setTicketLines}
            addProduct={addProduct}
            activeCat={activeCat}
            setActiveCat={setActiveCat}
            search={search}
            setSearch={setSearch}
            onSend={sendToKitchen}
            onCancel={() => { setView('floor'); setTicketMode(null); setTicketLines([]); }}
            onEdit={setEditLine}
          />
        )}
      </div>

      <WFooter view={view} />

      {feedOpen && <FeedDrawer onClose={() => setFeedOpen(false)} onAck={(id) => showToast('Aviso atendido')} />}
      {shiftOpen && <ShiftSheet onClose={() => setShiftOpen(false)} />}
      {editLine && <ModifierSheet line={editLine} onClose={() => setEditLine(null)} onSave={(patch) => { setTicketLines(ls => ls.map(l => l === editLine ? { ...l, ...patch } : l)); setEditLine(null); showToast('Notas guardadas'); }} />}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 20px', borderRadius: 12,
          background: 'var(--surface-3)', border: '1px solid var(--border-strong)',
          fontSize: 13, fontWeight: 600,
          boxShadow: 'var(--shadow-lg)', zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <WIcon name="check" size={14} /> {toast}
        </div>
      )}
    </div>
  );
}

function WHeader({ view, setView, onTakeout, onShift, onFeed, feedCount }) {
  const tabs = [
    { id: 'floor', label: 'Salón', icon: 'map' },
    { id: 'mine',  label: 'Mis mesas', icon: 'list' },
  ];
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 18px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface-1)',
      position: 'relative', zIndex: 5,
    }}>
      <button onClick={onShift} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 12px 6px 6px', borderRadius: 999,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
      }}>
        <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--brand-soft)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>SR</span>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Sara Reyes</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Turno · 4h 12m</div>
        </div>
      </button>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          {tabs.map(t => {
            const active = view === t.id || (t.id === 'floor' && view === 'order');
            return (
              <button key={t.id} onClick={() => setView(t.id)} style={{
                height: 36, padding: '0 14px', borderRadius: 9,
                display: 'flex', alignItems: 'center', gap: 8,
                background: active ? 'var(--surface-1)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: 600,
                boxShadow: active ? 'var(--shadow-sm)' : 'none',
              }}>
                <WIcon name={t.icon} size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={onTakeout} className="btn btn-soft" style={{ height: 38, gap: 6 }}>
        <WIcon name="bag" size={14} /> Para llevar
      </button>
      <button onClick={onFeed} style={{
        position: 'relative', width: 40, height: 40, borderRadius: 12,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <WIcon name="bell" size={16} />
        {feedCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            width: 18, height: 18, borderRadius: '50%',
            background: 'var(--brand)', color: 'var(--brand-fg)',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{feedCount}</span>
        )}
      </button>
    </header>
  );
}

function WFooter({ view }) {
  return (
    <footer style={{
      display: 'flex', alignItems: 'center', gap: 24,
      padding: '8px 18px',
      borderTop: '1px solid var(--border)',
      background: 'var(--surface-1)',
      fontSize: 11, position: 'relative', zIndex: 5,
    }}>
      <FooterStat label="Cubiertos" value="34" sub="hoy" />
      <FooterStat label="Ventas" value="$8,420" sub="turno" />
      <FooterStat label="Propinas" value="$642" sub="turno" accent />
      <FooterStat label="Mesas activas" value="4 / 6" sub="asignadas" />
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-muted)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
        Cocina conectada · 3 órdenes en curso
      </div>
    </footer>
  );
}
function FooterStat({ label, value, sub, accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
      <span className="mono tnum" style={{ fontSize: 13, fontWeight: 700, color: accent ? 'var(--brand)' : 'var(--text-primary)' }}>{value} <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 500 }}>{sub}</span></span>
    </div>
  );
}

function FloorPlan({ tables, selected, setSelected, onOpenOrder }) {
  const sel = tables.find(t => t.id === selected);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', height: '100%' }}>
      <div style={{ position: 'relative', overflow: 'auto', padding: 24, background: 'var(--bg)' }} className="scrollbar-hide">
        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {Object.entries(STATE_META).map(([k, m]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, background: 'var(--surface-1)', border: '1px solid var(--border)', fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color }} />
              <span style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
            </div>
          ))}
        </div>

        {/* Plano */}
        <div style={{ position: 'relative', width: 900, height: 360, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 12, overflow: 'hidden' }}>
          {/* Subtle grid */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.4, backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          {/* Zone labels */}
          <div style={{ position: 'absolute', left: 14, top: 14, fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Terraza</div>
          <div style={{ position: 'absolute', left: 14, top: 174, fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Salón principal</div>
          <div style={{ position: 'absolute', left: 700, top: 200, fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Barra</div>
          {/* Decorative wall */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 165, height: 2, background: 'var(--border-strong)' }} />
          <div style={{ position: 'absolute', left: 685, top: 170, bottom: 12, width: 2, background: 'var(--border-strong)' }} />

          {tables.map(t => {
            const m = STATE_META[t.state];
            const isSel = selected === t.id;
            const radius = t.shape === 'round' ? '50%' : t.shape === 'square' ? 14 : 16;
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                onDoubleClick={() => onOpenOrder(t.id)}
                style={{
                  position: 'absolute',
                  left: t.x, top: t.y, width: t.w, height: t.h,
                  borderRadius: radius,
                  background: t.state === 'free' ? 'var(--surface-2)' : m.bg,
                  border: `2px solid ${isSel ? 'var(--brand)' : m.border}`,
                  boxShadow: isSel ? '0 0 0 4px var(--brand-soft)' : 'none',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: 6,
                  cursor: 'pointer',
                  transition: 'all .12s ease',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: m.color }}>{t.id}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{t.seats} pax</span>
                {t.state !== 'free' && t.state !== 'dirty' && (
                  <span className="mono tnum" style={{ fontSize: 10, fontWeight: 600, color: m.color, marginTop: 2 }}>
                    {fmtMin(t.elapsed)}
                  </span>
                )}
                {t.alert && (
                  <span style={{ position: 'absolute', top: -8, right: -8, width: 16, height: 16, borderRadius: '50%', background: 'var(--brand)', color: 'var(--brand-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 3px var(--bg)' }}>
                    <WIcon name="bell" size={9} />
                  </span>
                )}
                {t.kitchenAlert && (
                  <span style={{ position: 'absolute', top: -8, right: -8, width: 16, height: 16, borderRadius: '50%', background: 'var(--warning)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 3px var(--bg)' }}>
                    <WIcon name="flame" size={9} />
                  </span>
                )}
                {t.warn && (
                  <span style={{ position: 'absolute', top: -8, right: -8, width: 16, height: 16, borderRadius: '50%', background: 'var(--warning)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 3px var(--bg)' }}>!</span>
                )}
                {t.mine && (
                  <span style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--brand)', color: 'var(--brand-fg)', letterSpacing: '0.06em' }}>MÍA</span>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14, display: 'flex', gap: 16 }}>
          <span>Toca para seleccionar · Doble toque para abrir comanda</span>
        </div>
      </div>

      {/* Side panel */}
      <aside style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--border)', padding: 18, overflowY: 'auto' }} className="scrollbar-hide">
        {!sel ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <WIcon name="map" size={22} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Selecciona una mesa</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Toca cualquier mesa del plano para ver detalles, tomar comanda o avisar a cocina.</div>
          </div>
        ) : (
          <TableDetail table={sel} onOpenOrder={() => onOpenOrder(sel.id)} />
        )}
      </aside>
    </div>
  );
}

function TableDetail({ table, onOpenOrder }) {
  const m = STATE_META[table.state];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: table.shape === 'round' ? '50%' : 12,
          background: m.bg, border: `2px solid ${m.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: m.color, fontWeight: 700,
        }}>{table.id}</div>
        <div>
          <div className="eyebrow">{table.zone}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Mesa {table.id}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{table.seats} comensales</div>
        </div>
      </div>

      <div style={{ padding: '10px 12px', borderRadius: 12, background: m.bg, border: `1px solid ${m.border}`, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: m.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.label}</div>
        {table.state !== 'free' && table.state !== 'dirty' && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            Desde {table.since} · {fmtMin(table.elapsed)}
          </div>
        )}
        {(table.alert || table.kitchenAlert || table.warn) && (
          <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--surface-1)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <WIcon name={table.kitchenAlert ? 'flame' : table.warn ? 'clock' : 'bell'} size={12} />
            {table.alert || table.kitchenAlert || table.warn}
          </div>
        )}
      </div>

      {table.ticket > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cuenta acumulada</span>
          <span className="mono tnum" style={{ fontSize: 22, fontWeight: 700 }}>${table.ticket}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {table.state === 'free' || table.state === 'dirty' ? (
          <>
            <button onClick={onOpenOrder} className="btn btn-primary" style={{ height: 48, fontSize: 14 }}>
              <WIcon name="plus" size={16} /> Abrir mesa & comanda
            </button>
            <button className="btn btn-ghost" style={{ height: 40 }}>
              <WIcon name="check" size={14} /> Marcar como limpia
            </button>
          </>
        ) : (
          <>
            <button onClick={onOpenOrder} className="btn btn-primary" style={{ height: 48, fontSize: 14 }}>
              <WIcon name="plus" size={16} /> Agregar a la comanda
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button className="btn btn-soft" style={{ height: 40, fontSize: 12 }}><WIcon name="split" size={13}/> Dividir</button>
              <button className="btn btn-soft" style={{ height: 40, fontSize: 12 }}><WIcon name="move" size={13}/> Cambiar mesa</button>
              <button className="btn btn-soft" style={{ height: 40, fontSize: 12 }}><WIcon name="cash" size={13}/> Pedir cuenta</button>
              <button className="btn btn-soft" style={{ height: 40, fontSize: 12 }}><WIcon name="bell" size={13}/> Llamar mesero</button>
            </div>
            <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 10, background: 'var(--warning-soft)', border: '1px solid var(--warning)', fontSize: 11, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <WIcon name="clock" size={12}/> Solo se quita en TPV principal
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MyTables({ tables, onOpenOrder }) {
  // Sort by urgency
  const ordered = [...tables].sort((a, b) => {
    const score = (t) => (t.alert ? 100 : 0) + (t.kitchenAlert ? 80 : 0) + (t.warn ? 60 : 0) + (t.elapsed || 0);
    return score(b) - score(a);
  });
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 18 }} className="scrollbar-hide">
      <div className="eyebrow" style={{ marginBottom: 12 }}>Priorizadas por urgencia</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {ordered.map(t => {
          const m = STATE_META[t.state];
          return (
            <button key={t.id} onClick={() => onOpenOrder(t.id)} style={{
              padding: 14, borderRadius: 14,
              background: 'var(--surface-1)', border: '1px solid var(--border)',
              textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start',
              borderLeft: `3px solid ${m.color}`,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: t.shape === 'round' ? '50%' : 12,
                background: m.bg, border: `2px solid ${m.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: m.color, fontWeight: 700, fontSize: 13,
                flexShrink: 0,
              }}>{t.id}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t.zone} · {t.seats} pax</span>
                  {t.alert && <span className="chip" style={{ height: 20, fontSize: 9, color: 'var(--brand)', background: 'var(--brand-soft)', borderColor: 'var(--brand)' }}><WIcon name="bell" size={9}/> Cuenta</span>}
                  {t.kitchenAlert && <span className="chip" style={{ height: 20, fontSize: 9, color: 'var(--warning)', background: 'var(--warning-soft)', borderColor: 'var(--warning)' }}><WIcon name="flame" size={9}/> Listo</span>}
                  {t.warn && <span className="chip" style={{ height: 20, fontSize: 9, color: 'var(--warning)', background: 'var(--warning-soft)', borderColor: 'var(--warning)' }}><WIcon name="clock" size={9}/> 45m</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.label} · desde {t.since || '—'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
                  <span className="mono tnum" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.elapsed ? fmtMin(t.elapsed) : '—'}</span>
                  <span className="mono tnum" style={{ fontSize: 16, fontWeight: 700 }}>{t.ticket ? `$${t.ticket}` : '—'}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OrderView({ mode, lines, addProduct, activeCat, setActiveCat, search, setSearch, onSend, onCancel, onEdit }) {
  const products = W_PRODUCTS.filter(p => (activeCat === 'all' || p.cat === activeCat) && (!search || p.name.toLowerCase().includes(search.toLowerCase())));
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);
  const title = mode.kind === 'takeout' ? 'Para llevar' : `Mesa ${mode.id}`;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
          <button onClick={onCancel} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <WIcon name="chevL" size={14} />
          </button>
          <div>
            <div className="eyebrow">Comanda</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative', width: 240 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} className="input" placeholder="Buscar producto…" style={{ paddingLeft: 34, height: 36 }} />
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
              <WIcon name="search" size={13} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }} className="scrollbar-hide">
          {W_CATS.map(c => {
            const active = activeCat === c.id;
            return (
              <button key={c.id} onClick={() => setActiveCat(c.id)} style={{
                height: 32, padding: '0 12px', borderRadius: 9,
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                background: active ? 'var(--surface-3)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: active ? '1px solid var(--border-strong)' : '1px solid transparent',
              }}>{c.name}</button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }} className="scrollbar-hide">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {products.map(p => (
              <button key={p.id} onClick={() => addProduct(p)} style={{
                background: 'var(--surface-1)', border: '1px solid var(--border)',
                borderRadius: 14, padding: 12, textAlign: 'left',
                display: 'flex', flexDirection: 'column', gap: 10,
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <div className="img-placeholder" style={{ height: 90, borderRadius: 10 }}>{p.img}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{p.name}</div>
                  <span className="mono tnum" style={{ fontSize: 14, fontWeight: 700, marginTop: 4, display: 'inline-block' }}>${p.price}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div className="eyebrow">Comanda nueva</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {itemCount} items</span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }} className="scrollbar-hide">
          {lines.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <WIcon name="bag" size={20} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Toca un producto<br/>para agregar</div>
              <div style={{ fontSize: 10, marginTop: 8, color: 'var(--text-muted)' }}>Para quitar items, ve al TPV principal</div>
            </div>
          ) : lines.map((l, i) => (
            <div key={i} style={{ padding: '10px 8px', borderBottom: '1px dashed var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    <span className="mono tnum" style={{ color: 'var(--brand)', marginRight: 6 }}>{l.qty}×</span>
                    {l.name}
                  </div>
                  {(l.mods?.length > 0 || l.note) && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {l.mods?.join(' · ')}{l.note && ` · "${l.note}"`}
                    </div>
                  )}
                  <button onClick={() => onEdit(l)} style={{ fontSize: 10, color: 'var(--brand)', fontWeight: 600, marginTop: 4, padding: 0 }}>
                    + modificadores / nota
                  </button>
                </div>
                <span className="mono tnum" style={{ fontSize: 13, fontWeight: 600 }}>${(l.qty * l.price).toFixed(0)}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span className="eyebrow">Subtotal</span>
            <span className="mono tnum" style={{ fontSize: 22, fontWeight: 700 }}>${subtotal.toFixed(2)}</span>
          </div>
          <button onClick={onSend} disabled={!lines.length} className="btn btn-primary" style={{ width: '100%', height: 50, fontSize: 14, opacity: lines.length ? 1 : 0.4, cursor: lines.length ? 'pointer' : 'not-allowed' }}>
            <WIcon name="chef" size={16} /> Enviar a cocina
          </button>
          <button onClick={onCancel} className="btn btn-ghost" style={{ width: '100%', height: 38, marginTop: 6, fontSize: 12 }}>
            Cancelar
          </button>
        </div>
      </aside>
    </div>
  );
}

function FeedDrawer({ onClose, onAck }) {
  const kindMeta = {
    ready: { color: 'var(--warning)', icon: 'flame', label: 'Plato listo' },
    bill:  { color: 'var(--brand)',   icon: 'cash',  label: 'Cuenta' },
    warn:  { color: 'var(--warning)', icon: 'clock', label: 'Aviso' },
    sent:  { color: 'var(--info)',    icon: 'chef',  label: 'Enviado' },
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }} />
      <aside style={{ position: 'relative', width: 400, height: '100%', background: 'var(--surface-1)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <WIcon name="bell" size={18} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Avisos en vivo</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{W_KITCHEN_FEED.length} pendientes</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, color: 'var(--text-muted)' }}><WIcon name="x" size={16}/></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }} className="scrollbar-hide">
          {W_KITCHEN_FEED.map(f => {
            const k = kindMeta[f.kind];
            return (
              <div key={f.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: `3px solid ${k.color}` }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <WIcon name={k.icon} size={15} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: k.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>· {f.time}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{f.table} · {f.msg}</div>
                  <button onClick={() => onAck(f.id)} className="btn btn-soft" style={{ height: 30, fontSize: 11, marginTop: 8 }}>
                    <WIcon name="check" size={11}/> Atender
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function ShiftSheet({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} />
      <div className="card" style={{ position: 'relative', width: '100%', maxWidth: 460, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--brand-soft)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18 }}>SR</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Sara Reyes</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Mesera · turno desde 16:00</div>
          </div>
          <div style={{ flex: 1 }}/>
          <button onClick={onClose} style={{ width: 32, height: 32, color: 'var(--text-muted)' }}><WIcon name="x" size={16}/></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          <Stat label="Tiempo" value="4h 12m" />
          <Stat label="Cubiertos" value="34" />
          <Stat label="Ventas" value="$8,420" />
          <Stat label="Propinas" value="$642" accent />
        </div>

        <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Desglose propinas</div>
          {[
            { l: 'Efectivo', v: 215 },
            { l: 'Tarjeta', v: 358 },
            { l: 'Compartido', v: 69 },
          ].map(r => (
            <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{r.l}</span>
              <span className="mono tnum" style={{ fontWeight: 600 }}>${r.v}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
          <button className="btn btn-soft" style={{ height: 42 }}>Cerrar turno</button>
          <button onClick={onClose} className="btn btn-primary" style={{ height: 42 }}>Continuar</button>
        </div>
      </div>
    </div>
  );
}
function Stat({ label, value, accent }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="eyebrow">{label}</div>
      <div className="mono tnum" style={{ fontSize: 18, fontWeight: 700, color: accent ? 'var(--brand)' : 'var(--text-primary)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ModifierSheet({ line, onClose, onSave }) {
  const [mods, setMods] = React.useState(line.mods || []);
  const [note, setNote] = React.useState(line.note || '');
  const opts = W_MODIFIERS[line.cat] || W_MODIFIERS.default;
  const toggle = (m) => setMods(ms => ms.includes(m) ? ms.filter(x => x !== m) : [...ms, m]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} />
      <div className="card" style={{ position: 'relative', width: '100%', maxWidth: 460, padding: 22 }}>
        <div className="eyebrow">Modificadores</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>{line.name}</div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {opts.map(m => {
            const sel = mods.includes(m);
            return (
              <button key={m} onClick={() => toggle(m)} style={{
                height: 34, padding: '0 12px', borderRadius: 999,
                background: sel ? 'var(--brand-soft)' : 'var(--surface-2)',
                color: sel ? 'var(--brand)' : 'var(--text-secondary)',
                border: `1px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                fontSize: 12, fontWeight: 600,
              }}>{sel && '✓ '}{m}</button>
            );
          })}
        </div>

        <div className="eyebrow" style={{ marginBottom: 6 }}>Nota libre</div>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Ej: bien cocido, sin sal, etc."
          style={{ width: '100%', minHeight: 70, padding: 10, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, resize: 'none', fontFamily: 'inherit' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ height: 42 }}>Cancelar</button>
          <button onClick={() => onSave({ mods, note })} className="btn btn-primary" style={{ height: 42 }}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Waiter />);
