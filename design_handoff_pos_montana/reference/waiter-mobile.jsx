/* Mesero móvil — handheld vertical */

const M_TABLES = [
{ id: 'M1', shape: 'round', seats: 2, zone: 'Terraza', state: 'free' },
{ id: 'M2', shape: 'round', seats: 2, zone: 'Terraza', state: 'occupied', elapsed: 28, ticket: 320, since: '20:14', mine: true },
{ id: 'M3', shape: 'square', seats: 4, zone: 'Terraza', state: 'kitchen', elapsed: 12, ticket: 645, since: '20:30', kitchenAlert: 'Plato listo', mine: true },
{ id: 'M4', shape: 'square', seats: 4, zone: 'Terraza', state: 'served', elapsed: 41, ticket: 712, since: '20:01' },
{ id: 'M5', shape: 'rect', seats: 6, zone: 'Terraza', state: 'bill', elapsed: 78, ticket: 1840, since: '19:24', alert: 'Pidió cuenta', mine: true },
{ id: 'M6', shape: 'round', seats: 2, zone: 'Salón', state: 'dirty' },
{ id: 'M7', shape: 'square', seats: 4, zone: 'Salón', state: 'occupied', elapsed: 52, ticket: 480, since: '19:50', warn: 'Sin postre 45m', mine: true },
{ id: 'M8', shape: 'square', seats: 4, zone: 'Salón', state: 'free' },
{ id: 'M9', shape: 'rect', seats: 8, zone: 'Salón', state: 'occupied', elapsed: 18, ticket: 980, since: '20:24' },
{ id: 'B1', shape: 'round', seats: 1, zone: 'Barra', state: 'occupied', elapsed: 8, ticket: 145, since: '20:34' },
{ id: 'B2', shape: 'round', seats: 1, zone: 'Barra', state: 'free' }];


const M_FLOOR_POS = {
  M1: { x: 6, y: 6, w: 30, h: 30 }, M2: { x: 38, y: 6, w: 30, h: 30 },
  M3: { x: 6, y: 38, w: 62, h: 36 }, M4: { x: 70, y: 38, w: 30, h: 36 },
  M5: { x: 6, y: 76, w: 94, h: 22 }
  // 2nd zone shown when zone toggled
};
const M_FLOOR_POS_SALON = {
  M6: { x: 6, y: 6, w: 30, h: 30 }, M7: { x: 38, y: 6, w: 30, h: 30 },
  M8: { x: 70, y: 6, w: 30, h: 30 }, M9: { x: 6, y: 38, w: 94, h: 30 },
  B1: { x: 6, y: 70, w: 30, h: 28 }, B2: { x: 38, y: 70, w: 30, h: 28 }
};

const M_CATS = [
{ id: 'all', name: 'Todos' },
{ id: 'tacos', name: 'Tacos' },
{ id: 'tortas', name: 'Tortas' },
{ id: 'bowls', name: 'Bowls' },
{ id: 'bebidas', name: 'Bebidas' },
{ id: 'postres', name: 'Postres' }];

const M_PRODUCTS = [
{ id: 1, name: 'Taco al Pastor', price: 35, cat: 'tacos', img: 'PASTOR' },
{ id: 2, name: 'Taco de Suadero', price: 38, cat: 'tacos', img: 'SUADERO' },
{ id: 3, name: 'Taco de Bistec', price: 42, cat: 'tacos', img: 'BISTEC' },
{ id: 4, name: 'Gringa Pastor', price: 95, cat: 'tacos', img: 'GRINGA' },
{ id: 5, name: 'Torta Cubana', price: 145, cat: 'tortas', img: 'CUBANA' },
{ id: 6, name: 'Torta Milanesa', price: 120, cat: 'tortas', img: 'MILANESA' },
{ id: 7, name: 'Bowl de Pollo', price: 165, cat: 'bowls', img: 'POLLO' },
{ id: 8, name: 'Bowl Vegetariano', price: 145, cat: 'bowls', img: 'VEGGIE' },
{ id: 9, name: 'Agua de Jamaica', price: 38, cat: 'bebidas', img: 'JAMAICA' },
{ id: 10, name: 'Refresco 600ml', price: 32, cat: 'bebidas', img: 'REFRESCO' },
{ id: 11, name: 'Cerveza Artesanal', price: 78, cat: 'bebidas', img: 'CERVEZA' },
{ id: 12, name: 'Flan Napolitano', price: 65, cat: 'postres', img: 'FLAN' }];


const M_MODIFIERS = {
  default: ['Sin cebolla', 'Sin cilantro', 'Extra picante', 'Para llevar'],
  tacos: ['Sin cebolla', 'Sin cilantro', 'Doble tortilla', 'Extra salsa', 'Bien dorado'],
  bebidas: ['Sin azúcar', 'Sin hielo', 'Con limón', 'Extra grande']
};

const M_FEED = [
{ id: 1, table: 'M3', msg: 'Plato listo: 2 tacos pastor', time: 'hace 1m', kind: 'ready' },
{ id: 2, table: 'M5', msg: 'Mesa pidió la cuenta', time: 'hace 2m', kind: 'bill' },
{ id: 3, table: 'M7', msg: 'Sin pedir postre · 45 min', time: 'hace 4m', kind: 'warn' },
{ id: 4, table: 'M9', msg: 'Comanda enviada · 4 items', time: 'hace 7m', kind: 'sent' }];


const M_STATE = {
  free: { label: 'Libre', color: 'var(--text-muted)', bg: 'transparent', border: 'var(--border-strong)' },
  occupied: { label: 'Ocupada', color: 'var(--info)', bg: 'var(--info-soft)', border: 'var(--info)' },
  kitchen: { label: 'En cocina', color: 'var(--warning)', bg: 'var(--warning-soft)', border: 'var(--warning)' },
  served: { label: 'Servida', color: 'var(--success)', bg: 'var(--success-soft)', border: 'var(--success)' },
  bill: { label: 'Pidió cuenta', color: 'var(--brand)', bg: 'var(--brand-soft)', border: 'var(--brand)' },
  dirty: { label: 'Por limpiar', color: 'var(--danger)', bg: 'var(--danger-soft)', border: 'var(--danger)' }
};

function TableIcon({ color = 'currentColor', fill = 'transparent' }) {
  // Mesa en perspectiva 3/4, line-art con 4 patas. Escala al contenedor.
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }} fill="none">
      {/* Top surface (perspective trapezoid) */}
      <path
        d="M 18 38 L 82 38 L 92 52 L 8 52 Z"
        fill={fill}
        stroke={color}
        strokeWidth="2.6"
        strokeLinejoin="round" />
      {/* Front edge highlight */}
      <line x1="8" y1="52" x2="92" y2="52" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      {/* 4 legs */}
      <path d="M 16 52 L 18 88" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M 36 52 L 36 88" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M 64 52 L 64 88" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M 84 52 L 82 88" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
    </svg>);

}

function MIcon({ name, size = 16, color }) {
  const c = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color || 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const p = {
    map: <><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></>,
    list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3.5" cy="6" r="0.8" /><circle cx="3.5" cy="12" r="0.8" /><circle cx="3.5" cy="18" r="0.8" /></>,
    bag: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    minus: <><line x1="5" y1="12" x2="19" y2="12" /></>,
    x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    chev: <><polyline points="9 18 15 12 9 6" /></>,
    chevL: <><polyline points="15 18 9 12 15 6" /></>,
    chevD: <><polyline points="6 9 12 15 18 9" /></>,
    chef: <><path d="M6 13.87A4 4 0 0 1 7.41 6 5.11 5.11 0 0 1 17 5.13a4 4 0 0 1 1 7.74" /><path d="M6 17h12v3a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>,
    user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    check: <><polyline points="20 6 9 17 4 12" /></>,
    flame: <><path d="M8.5 14.5C5 12 5 8 7 5c0 3 2.5 4 4 3 1-2 1-4-1-7 6 3 9 8 9 13a6 6 0 0 1-12 0c0-1.5.5-3 1.5-4z" /></>,
    cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    move: <><polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" /></>,
    split: <><path d="M3 6h18" /><path d="M3 18h18" /><path d="M9 12h12" /><path d="M3 12h2" /></>,
    note: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
    sparks: <><polygon points="12 2 14 8 20 9 15 13 17 19 12 16 7 19 9 13 4 9 10 8 12 2" /></>
  };
  return <svg {...c}>{p[name]}</svg>;
}

function MobileApp() {
  const [view, setView] = React.useState('floor'); // floor | mine | order | feed | shift | tableDetail
  const [zone, setZone] = React.useState('Terraza');
  const [floorMode, setFloorMode] = React.useState('plan'); // plan | grid
  const [selected, setSelected] = React.useState(null);
  const [ticketCtx, setTicketCtx] = React.useState(null); // {kind, id?}
  const [ticketLines, setTicketLines] = React.useState([]);
  const [activeCat, setActiveCat] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [editLine, setEditLine] = React.useState(null);
  const [toast, setToast] = React.useState(null);

  const showToast = (msg) => {setToast(msg);setTimeout(() => setToast(null), 1600);};

  const openTable = (id) => {setSelected(id);setView('tableDetail');};
  const startOrder = (ctx) => {
    setTicketCtx(ctx);setTicketLines([]);setActiveCat('all');setSearch('');setView('order');
  };
  const addProduct = (p) => {
    setTicketLines((ls) => {
      const idx = ls.findIndex((l) => l.id === p.id && !l.mods?.length);
      if (idx >= 0) return ls.map((l, i) => i === idx ? { ...l, qty: l.qty + 1 } : l);
      return [...ls, { id: p.id, name: p.name, price: p.price, qty: 1, cat: p.cat, mods: [], note: '' }];
    });
  };
  const sendKitchen = () => {
    if (!ticketLines.length) return;
    showToast(`Comanda enviada · ${ticketLines.reduce((s, l) => s + l.qty, 0)} items`);
    setTicketLines([]);setTicketCtx(null);setView('floor');
  };

  const tableObj = M_TABLES.find((t) => t.id === selected);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text-primary)', overflow: 'hidden' }}>
      {/* Topbar */}
      {view !== 'order' && view !== 'tableDetail' &&
      <MTopbar view={view} onShift={() => setView('shift')} onFeed={() => setView('feed')} feedCount={2} />
      }

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {view === 'floor' &&
        <FloorView zone={zone} setZone={setZone} mode={floorMode} setMode={setFloorMode} onTap={openTable} />
        }
        {view === 'mine' &&
        <MineView onTap={openTable} />
        }
        {view === 'tableDetail' && tableObj &&
        <TableDetail table={tableObj} onBack={() => {setSelected(null);setView('floor');}} onOrder={() => startOrder({ kind: 'table', id: selected })} onToast={showToast} />
        }
        {view === 'order' && ticketCtx &&
        <OrderFlow ctx={ticketCtx} lines={ticketLines} addProduct={addProduct} setLines={setTicketLines}
        cat={activeCat} setCat={setActiveCat} search={search} setSearch={setSearch}
        onSend={sendKitchen} onCancel={() => {setTicketCtx(null);setView(ticketCtx.kind === 'takeout' ? 'floor' : 'tableDetail');}}
        onEdit={setEditLine} />
        }
        {view === 'feed' && <FeedView onBack={() => setView('floor')} onAck={() => showToast('Atendido')} />}
        {view === 'shift' && <ShiftView onBack={() => setView('floor')} />}
      </div>

      {/* Bottom nav */}
      {(view === 'floor' || view === 'mine') &&
      <BottomNav view={view} setView={setView} onTakeout={() => startOrder({ kind: 'takeout' })} />
      }

      {/* Modals */}
      {editLine && <ModifierSheet line={editLine} onClose={() => setEditLine(null)} onSave={(patch) => {setTicketLines((ls) => ls.map((l) => l === editLine ? { ...l, ...patch } : l));setEditLine(null);showToast('Notas guardadas');}} />}

      {toast &&
      <div style={{
        position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)',
        padding: '10px 16px', borderRadius: 999,
        background: 'var(--surface-3)', border: '1px solid var(--border-strong)',
        fontSize: 12, fontWeight: 600,
        boxShadow: 'var(--shadow-lg)', zIndex: 100,
        display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap'
      }}>
          <MIcon name="check" size={13} /> {toast}
        </div>
      }
    </div>);

}

function MTopbar({ view, onShift, onFeed, feedCount }) {
  return (
    <header style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
      <button onClick={onShift} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 4px 4px', borderRadius: 999, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--brand-soft)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>SR</span>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 11, fontWeight: 600 }}>Sara</div>
          <div className="mono tnum" style={{ fontSize: 9, color: 'var(--text-muted)' }}>4h 12m</div>
        </div>
      </button>
      <div style={{ flex: 1 }}>
        <div className="eyebrow" style={{ fontSize: 9 }}>Vista</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginTop: -2 }}>{view === 'floor' ? 'Salón · Sucursal Centro' : 'Mis mesas'}</div>
      </div>
      <button onClick={onFeed} style={{ position: 'relative', width: 36, height: 36, borderRadius: 11, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MIcon name="bell" size={15} />
        {feedCount > 0 &&
        <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 999, padding: '0 4px', background: 'var(--brand)', color: 'var(--brand-fg)', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{feedCount}</span>
        }
      </button>
    </header>);

}

function BottomNav({ view, setView, onTakeout }) {
  const tabs = [
  { id: 'floor', icon: 'map', label: 'Salón' },
  { id: 'mine', icon: 'list', label: 'Mis mesas' }];

  return (
    <nav style={{ display: 'flex', alignItems: 'stretch', borderTop: '1px solid var(--border)', background: 'var(--surface-1)', padding: '6px 6px 8px' }}>
      {tabs.map((t) => {
        const active = view === t.id;
        return (
          <button key={t.id} onClick={() => setView(t.id)} style={{
            flex: 1, padding: '8px 4px', borderRadius: 12,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color: active ? 'var(--brand)' : 'var(--text-muted)',
            background: active ? 'var(--brand-soft)' : 'transparent'
          }}>
            <MIcon name={t.icon} size={18} />
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{t.label}</span>
          </button>);

      })}
      <button onClick={onTakeout} style={{
        margin: '4px 6px 4px 4px',
        padding: '0 14px',
        borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--brand)', color: 'var(--brand-fg)',
        fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
        boxShadow: '0 4px 14px -4px var(--brand-glow)'
      }}>
        <MIcon name="bag" size={14} /> Llevar
      </button>
    </nav>);

}

function FloorView({ zone, setZone, mode, setMode, onTap }) {
  const isTerraza = zone === 'Terraza';
  const tablesInZone = M_TABLES.filter((t) => t.zone === zone || zone === 'Salón' && t.zone === 'Barra');
  const positions = isTerraza ? M_FLOOR_POS : M_FLOOR_POS_SALON;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Zone tabs + view toggle */}
      <div style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', flex: 1 }}>
          {['Terraza', 'Terraza'].map((z, i) => {
            const sel = zone === z;
            return (
              <button key={i} onClick={() => setZone(z)} style={{
                flex: 1, height: 30, borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: sel ? 'var(--surface-1)' : 'transparent',
                color: sel ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: sel ? 'var(--shadow-sm)' : 'none'
              }}>{z}</button>);

          })}
        </div>
        <div style={{ display: 'flex', padding: 3, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          {[
          { id: 'plan', icon: 'map' },
          { id: 'grid', icon: 'grid' }].
          map((m) => {
            const sel = mode === m.id;
            return (
              <button key={m.id} onClick={() => setMode(m.id)} style={{
                width: 30, height: 30, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: sel ? 'var(--surface-1)' : 'transparent',
                color: sel ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: sel ? 'var(--shadow-sm)' : 'none'
              }}><MIcon name={m.icon} size={13} /></button>);

          })}
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        {[
        { l: 'Libres', v: tablesInZone.filter((t) => t.state === 'free').length, c: 'var(--text-muted)' },
        { l: 'Ocupadas', v: tablesInZone.filter((t) => t.state === 'occupied').length, c: 'var(--info)' },
        { l: 'Avisos', v: M_FEED.filter((f) => ['ready', 'bill'].includes(f.kind)).length, c: 'var(--brand)' },
        { l: 'Cuenta', v: tablesInZone.filter((t) => t.state === 'bill').length, c: 'var(--warning)' }].
        map((s) =>
        <div key={s.l} style={{ padding: '6px 8px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div className="mono tnum" style={{ fontSize: 16, fontWeight: 700, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.l}</div>
          </div>
        )}
      </div>

      {/* Plan or grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }} className="scrollbar-hide">
        {mode === 'plan' ?
        <div style={{ position: 'relative', width: '100%', aspectRatio: '0.9 / 1', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, opacity: 0.4, backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            <div style={{ position: 'absolute', left: 8, top: 8, fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{zone}</div>
            {tablesInZone.map((t) => {
            const pos = positions[t.id];
            if (!pos) return null;
            const m = M_STATE[t.state];
            return (
              <button key={t.id} onClick={() => onTap(t.id)} style={{
                position: 'absolute',
                left: `${pos.x}%`, top: `${pos.y}%`, width: `${pos.w}%`, height: `${pos.h}%`,
                background: 'transparent', border: 'none', padding: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'system-ui'
              }}>
                  <TableIcon color={m.border} fill={t.state === 'free' ? 'transparent' : m.bg} />
                  <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none', paddingTop: '8%'
                }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: m.color, lineHeight: 1, textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>{t.id}</span>
                    <span style={{ fontSize: 8, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 1 }}>{t.seats}p</span>
                    {t.state !== 'free' && t.state !== 'dirty' &&
                  <span className="mono tnum" style={{ fontSize: 9, fontWeight: 700, color: m.color, marginTop: 1 }}>{t.elapsed}m</span>
                  }
                  </div>
                  {(t.alert || t.kitchenAlert || t.warn) &&
                <span style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: t.alert ? 'var(--brand)' : 'var(--warning)', color: t.alert ? 'var(--brand-fg)' : '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px var(--bg)', zIndex: 2 }}>
                      <MIcon name={t.alert ? 'bell' : t.kitchenAlert ? 'flame' : 'clock'} size={8} />
                    </span>
                }
                  {t.mine &&
                <span style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: 'var(--brand)', color: 'var(--brand-fg)', letterSpacing: '0.04em', zIndex: 2 }}>MÍA</span>
                }
                </button>);

          })}
          </div> :

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {tablesInZone.map((t) => {
            const m = M_STATE[t.state];
            return (
              <button key={t.id} onClick={() => onTap(t.id)} style={{
                aspectRatio: '1 / 1', borderRadius: 12,
                background: t.state === 'free' ? 'var(--surface-1)' : m.bg,
                border: `1.5px solid ${m.border}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                position: 'relative'
              }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: m.color }}>{t.id}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{t.seats}p</span>
                  {t.state !== 'free' && t.state !== 'dirty' &&
                <span className="mono tnum" style={{ fontSize: 9, fontWeight: 600, color: m.color, marginTop: 1 }}>{t.elapsed}m</span>
                }
                  {(t.alert || t.kitchenAlert || t.warn) &&
                <span style={{ position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: '50%', background: t.alert ? 'var(--brand)' : 'var(--warning)', color: t.alert ? 'var(--brand-fg)' : '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MIcon name={t.alert ? 'bell' : t.kitchenAlert ? 'flame' : 'clock'} size={8} />
                    </span>
                }
                  {t.mine &&
                <span style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: 'var(--brand)', color: 'var(--brand-fg)' }}>MÍA</span>
                }
                </button>);

          })}
          </div>
        }

        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {Object.entries(M_STATE).map(([k, m]) =>
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 999, background: 'var(--surface-1)', border: '1px solid var(--border)', fontSize: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color }} />
              <span style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
            </div>
          )}
        </div>
      </div>
    </div>);

}

function MineView({ onTap }) {
  const mine = M_TABLES.filter((t) => t.mine);
  const ordered = [...mine].sort((a, b) => {
    const score = (t) => (t.alert ? 100 : 0) + (t.kitchenAlert ? 80 : 0) + (t.warn ? 60 : 0) + (t.elapsed || 0);
    return score(b) - score(a);
  });
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '12px 14px' }} className="scrollbar-hide">
      <div className="eyebrow" style={{ marginBottom: 10 }}>Priorizadas por urgencia</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ordered.map((t) => {
          const m = M_STATE[t.state];
          return (
            <button key={t.id} onClick={() => onTap(t.id)} style={{
              padding: 12, borderRadius: 14,
              background: 'var(--surface-1)', border: '1px solid var(--border)',
              borderLeft: `3px solid ${m.color}`,
              display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left'
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: t.shape === 'round' ? '50%' : 11,
                background: m.bg, border: `2px solid ${m.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: m.color, fontWeight: 700, fontSize: 13, flexShrink: 0
              }}>{t.id}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t.zone} · {t.seats}p</span>
                  {t.alert && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--brand-soft)', color: 'var(--brand)', border: '1px solid var(--brand)' }}>CUENTA</span>}
                  {t.kitchenAlert && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid var(--warning)' }}>LISTO</span>}
                  {t.warn && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid var(--warning)' }}>{t.warn}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.label} · desde {t.since || '—'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                  <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.elapsed ? `${t.elapsed}m` : '—'}</span>
                  <span className="mono tnum" style={{ fontSize: 14, fontWeight: 700 }}>${t.ticket || 0}</span>
                </div>
              </div>
              <MIcon name="chev" size={14} color="var(--text-muted)" />
            </button>);

        })}
      </div>
    </div>);

}

function TableDetail({ table, onBack, onOrder, onToast }) {
  const m = M_STATE[table.state];
  const isFree = table.state === 'free' || table.state === 'dirty';
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-1)' }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MIcon name="chevL" size={14} />
        </button>
        <div>
          <div className="eyebrow" style={{ fontSize: 9 }}>{table.zone}</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Mesa {table.id}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }} className="scrollbar-hide">
        {/* Hero card */}
        <div style={{
          padding: 16, borderRadius: 14,
          background: m.bg, border: `1.5px solid ${m.border}`, marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: table.shape === 'round' ? '50%' : 12,
            background: 'var(--surface-1)', border: `2px solid ${m.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: m.color, fontWeight: 700, fontSize: 16
          }}>{table.id}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: m.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{table.seats} comensales · desde {table.since || '—'}</div>
            {!isFree &&
            <div className="mono tnum" style={{ fontSize: 11, color: m.color, fontWeight: 600, marginTop: 4 }}>{table.elapsed} min en mesa</div>
            }
          </div>
        </div>

        {/* Alerts */}
        {(table.alert || table.kitchenAlert || table.warn) &&
        <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MIcon name={table.kitchenAlert ? 'flame' : table.warn ? 'clock' : 'bell'} size={14} color={table.alert ? 'var(--brand)' : 'var(--warning)'} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>{table.alert || table.kitchenAlert || table.warn}</span>
          </div>
        }

        {/* Bill amount */}
        {table.ticket > 0 &&
        <div style={{ padding: 14, borderRadius: 14, background: 'var(--surface-1)', border: '1px solid var(--border)', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cuenta acumulada</span>
              <span className="mono tnum" style={{ fontSize: 22, fontWeight: 700 }}>${table.ticket}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Items se modifican desde el TPV principal</div>
          </div>
        }

        {/* Actions grid */}
        {!isFree &&
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <button onClick={() => onToast('Cuenta solicitada')} className="btn btn-soft" style={{ height: 48, flexDirection: 'column', gap: 2 }}>
              <MIcon name="cash" size={16} />
              <span style={{ fontSize: 11 }}>Pedir cuenta</span>
            </button>
            <button onClick={() => onToast('Llamando a TPV')} className="btn btn-soft" style={{ height: 48, flexDirection: 'column', gap: 2 }}>
              <MIcon name="bell" size={16} />
              <span style={{ fontSize: 11 }}>Llamar TPV</span>
            </button>
            <button onClick={() => onToast('Modo dividir cuenta')} className="btn btn-soft" style={{ height: 48, flexDirection: 'column', gap: 2 }}>
              <MIcon name="split" size={16} />
              <span style={{ fontSize: 11 }}>Dividir cuenta</span>
            </button>
            <button onClick={() => onToast('Selecciona destino')} className="btn btn-soft" style={{ height: 48, flexDirection: 'column', gap: 2 }}>
              <MIcon name="move" size={16} />
              <span style={{ fontSize: 11 }}>Cambiar mesa</span>
            </button>
          </div>
        }

        {isFree && table.state === 'dirty' &&
        <button onClick={() => onToast('Mesa limpia')} className="btn btn-soft" style={{ width: '100%', height: 44, marginBottom: 8 }}>
            <MIcon name="check" size={14} /> Marcar como limpia
          </button>
        }
      </div>

      {/* Sticky bottom CTA */}
      <div style={{ padding: 14, borderTop: '1px solid var(--border)', background: 'var(--surface-1)' }}>
        <button onClick={onOrder} className="btn btn-primary" style={{ width: '100%', height: 50, fontSize: 14, boxShadow: '0 8px 22px -8px var(--brand-glow)' }}>
          <MIcon name="plus" size={16} /> {isFree ? 'Abrir mesa & comanda' : 'Agregar a la comanda'}
        </button>
      </div>
    </div>);

}

function OrderFlow({ ctx, lines, addProduct, setLines, cat, setCat, search, setSearch, onSend, onCancel, onEdit }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const products = M_PRODUCTS.filter((p) => (cat === 'all' || p.cat === cat) && (!search || p.name.toLowerCase().includes(search.toLowerCase())));
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);
  const title = ctx.kind === 'takeout' ? 'Para llevar' : `Mesa ${ctx.id}`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface-1)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCancel} style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MIcon name="chevL" size={14} />
        </button>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ fontSize: 9 }}>Comanda nueva · solo agregar</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'relative' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input" placeholder="Buscar producto…" style={{ paddingLeft: 34, height: 36, fontSize: 12 }} />
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
            <MIcon name="search" size={13} />
          </div>
        </div>
      </div>

      {/* Categories */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, overflowX: 'auto' }} className="scrollbar-hide">
        {M_CATS.map((c) => {
          const active = cat === c.id;
          return (
            <button key={c.id} onClick={() => setCat(c.id)} style={{
              height: 30, padding: '0 12px', borderRadius: 8,
              fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
              background: active ? 'var(--surface-3)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: active ? '1px solid var(--border-strong)' : '1px solid transparent'
            }}>{c.name}</button>);

        })}
      </div>

      {/* Products */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }} className="scrollbar-hide">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {products.map((p) =>
          <button key={p.id} onClick={() => addProduct(p)} style={{
            background: 'var(--surface-1)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 8, textAlign: 'left',
            display: 'flex', flexDirection: 'column', gap: 6, position: 'relative'
          }}>
              <div className="img-placeholder" style={{ height: 70, borderRadius: 8, fontSize: 9 }}>{p.img}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.25, minHeight: 27 }}>{p.name}</div>
                <span className="mono tnum" style={{ fontSize: 13, fontWeight: 700, marginTop: 3, display: 'inline-block' }}>${p.price}</span>
              </div>
              <div style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: 'var(--brand)', color: 'var(--brand-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px var(--brand-glow)' }}>
                <MIcon name="plus" size={12} />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Bottom ticket bar */}
      <div style={{
        padding: 12, borderTop: '1px solid var(--border)', background: 'var(--surface-1)',
        display: 'flex', flexDirection: 'column', gap: 8
      }}>
        <button onClick={() => itemCount && setDrawerOpen(true)} disabled={!itemCount} style={{
          padding: '10px 14px',
          borderRadius: 12,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
          opacity: itemCount ? 1 : 0.5, cursor: itemCount ? 'pointer' : 'not-allowed'
        }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--brand-soft)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>{itemCount}</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Comanda</div>
            <div className="mono tnum" style={{ fontSize: 14, fontWeight: 700 }}>${subtotal.toFixed(2)}</div>
          </div>
          <MIcon name="chev" size={14} color="var(--text-muted)" />
        </button>
        <button onClick={onSend} disabled={!itemCount} className="btn btn-primary" style={{ height: 48, fontSize: 13, opacity: itemCount ? 1 : 0.4, cursor: itemCount ? 'pointer' : 'not-allowed', boxShadow: itemCount ? '0 8px 22px -8px var(--brand-glow)' : 'none' }}>
          <MIcon name="chef" size={15} /> Enviar a cocina
        </button>
      </div>

      {drawerOpen &&
      <TicketDrawer lines={lines} onClose={() => setDrawerOpen(false)} onEdit={onEdit} subtotal={subtotal} title={title} />
      }
    </div>);

}

function TicketDrawer({ lines, onClose, onEdit, subtotal, title }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'relative', background: 'var(--surface-1)', borderRadius: '20px 20px 0 0', borderTop: '1px solid var(--border-strong)', maxHeight: '78%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 36, height: 4, background: 'var(--border-strong)', borderRadius: 999 }} />
        </div>
        <div style={{ padding: '6px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ fontSize: 9 }}>Comanda</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, color: 'var(--text-muted)' }}><MIcon name="x" size={15} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }} className="scrollbar-hide">
          {lines.map((l, i) =>
          <div key={i} style={{ padding: '10px 6px', borderBottom: '1px dashed var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    <span className="mono tnum" style={{ color: 'var(--brand)', marginRight: 6 }}>{l.qty}×</span>
                    {l.name}
                  </div>
                  {(l.mods?.length > 0 || l.note) &&
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {l.mods?.join(' · ')}{l.note && ` · "${l.note}"`}
                    </div>
                }
                  <button onClick={() => {onEdit(l);onClose();}} style={{ fontSize: 10, color: 'var(--brand)', fontWeight: 600, marginTop: 4, padding: 0 }}>
                    <MIcon name="note" size={10} /> modificar
                  </button>
                </div>
                <span className="mono tnum" style={{ fontSize: 13, fontWeight: 600 }}>${(l.qty * l.price).toFixed(0)}</span>
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: 14, borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="eyebrow">Subtotal</span>
            <span className="mono tnum" style={{ fontSize: 18, fontWeight: 700 }}>${subtotal.toFixed(2)}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Para quitar items, ve al TPV principal.</div>
        </div>
      </div>
    </div>);

}

function FeedView({ onBack, onAck }) {
  const kindMeta = {
    ready: { color: 'var(--warning)', icon: 'flame', label: 'Plato listo' },
    bill: { color: 'var(--brand)', icon: 'cash', label: 'Cuenta' },
    warn: { color: 'var(--warning)', icon: 'clock', label: 'Aviso' },
    sent: { color: 'var(--info)', icon: 'chef', label: 'Enviado' }
  };
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-1)' }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MIcon name="chevL" size={14} />
        </button>
        <div>
          <div className="eyebrow" style={{ fontSize: 9 }}>Cocina</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Avisos en vivo</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }} className="scrollbar-hide">
        {M_FEED.map((f) => {
          const k = kindMeta[f.kind];
          return (
            <div key={f.id} style={{ padding: '14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: `3px solid ${k.color}` }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-2)', color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MIcon name={k.icon} size={14} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: k.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>· {f.time}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{f.table} · {f.msg}</div>
                <button onClick={() => onAck(f.id)} className="btn btn-soft" style={{ height: 28, fontSize: 11, marginTop: 8, padding: '0 10px' }}>
                  <MIcon name="check" size={11} /> Atender
                </button>
              </div>
            </div>);

        })}
      </div>
    </div>);

}

function ShiftView({ onBack }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-1)' }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MIcon name="chevL" size={14} />
        </button>
        <div>
          <div className="eyebrow" style={{ fontSize: 9 }}>Turno</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Sara Reyes</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }} className="scrollbar-hide">
        {/* Hero */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, background: 'var(--surface-1)', border: '1px solid var(--border)', marginBottom: 12 }}>
          <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--brand-soft)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18 }}>SR</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Mesera</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Turno desde 16:00 · 4h 12m</div>
          </div>
        </div>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
          { l: 'Cubiertos', v: '34' },
          { l: 'Ventas', v: '$8,420' },
          { l: 'Propinas', v: '$642', accent: true },
          { l: 'Mesas', v: '4 / 6' }].
          map((s) =>
          <div key={s.l} style={{ padding: 12, borderRadius: 12, background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
              <div className="eyebrow">{s.l}</div>
              <div className="mono tnum" style={{ fontSize: 18, fontWeight: 700, color: s.accent ? 'var(--brand)' : 'var(--text-primary)', marginTop: 2 }}>{s.v}</div>
            </div>
          )}
        </div>
        {/* Tip breakdown */}
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--surface-1)', border: '1px solid var(--border)', marginBottom: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Desglose propinas</div>
          {[
          { l: 'Efectivo', v: 215 },
          { l: 'Tarjeta', v: 358 },
          { l: 'Compartido', v: 69 }].
          map((r) =>
          <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, borderBottom: '1px dashed var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{r.l}</span>
              <span className="mono tnum" style={{ fontWeight: 600 }}>${r.v}</span>
            </div>
          )}
        </div>
        <button className="btn btn-soft" style={{ width: '100%', height: 44 }}>Cerrar turno</button>
      </div>
    </div>);

}

function ModifierSheet({ line, onClose, onSave }) {
  const [mods, setMods] = React.useState(line.mods || []);
  const [note, setNote] = React.useState(line.note || '');
  const opts = M_MODIFIERS[line.cat] || M_MODIFIERS.default;
  const toggle = (m) => setMods((ms) => ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'relative', background: 'var(--surface-1)', borderRadius: '20px 20px 0 0', padding: 16, maxHeight: '85%', overflowY: 'auto' }} className="scrollbar-hide">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <span style={{ width: 36, height: 4, background: 'var(--border-strong)', borderRadius: 999 }} />
        </div>
        <div className="eyebrow">Modificadores</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{line.name}</div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {opts.map((m) => {
            const sel = mods.includes(m);
            return (
              <button key={m} onClick={() => toggle(m)} style={{
                height: 32, padding: '0 12px', borderRadius: 999,
                background: sel ? 'var(--brand-soft)' : 'var(--surface-2)',
                color: sel ? 'var(--brand)' : 'var(--text-secondary)',
                border: `1px solid ${sel ? 'var(--brand)' : 'var(--border)'}`,
                fontSize: 12, fontWeight: 600
              }}>{sel && '✓ '}{m}</button>);

          })}
        </div>

        <div className="eyebrow" style={{ marginBottom: 6 }}>Nota libre</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: bien cocido, sin sal, etc."
        style={{ width: '100%', minHeight: 64, padding: 10, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ height: 44 }}>Cancelar</button>
          <button onClick={() => onSave({ mods, note })} className="btn btn-primary" style={{ height: 44 }}>Guardar</button>
        </div>
      </div>
    </div>);

}

// Mount inside iOS device frame
function MobileMount() {
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    const calc = () => {
      const pad = 40;
      const s = Math.min(1, (window.innerHeight - pad) / 874, (window.innerWidth - pad) / 402);
      setScale(s);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
        <IOSDevice width={402} height={874} dark>
          <div style={{ position: 'absolute', inset: 0, paddingTop: 60 }}>
            <MobileApp />
          </div>
        </IOSDevice>
      </div>
    </div>);

}

ReactDOM.createRoot(document.getElementById('root')).render(<MobileMount />);