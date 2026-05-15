/* MRTPVREST · Shared UI primitives + Sidebar + Topbar + AI Panel */

// ── Helpers ──────────────────────────────────────────────────
const fmtMoney = (n, c = 'USD') => '$' + Math.round(n).toLocaleString('en-US');
const fmtNum   = n => n.toLocaleString('en-US');
const fmtDate  = iso => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
const timeAgo  = ts => {
  const diff = Date.now() - (typeof ts === 'number' ? ts : new Date(ts).getTime());
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  if (h < 24) return `hace ${h}h`;
  if (d < 30) return `hace ${d}d`;
  return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
};

// ── KPI Card ─────────────────────────────────────────────────
const KPI = ({ label, value, delta, deltaLabel, accent = 'var(--iris-500)', sub, spark, icon, loading }) => (
  <div className="kpi" style={{ '--accent': accent }}>
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <div className="kpi-label">{label}</div>
      {icon && <div style={{ color: accent, opacity: 0.7 }}><Icon name={icon} size={14}/></div>}
    </div>
    <div className="kpi-val">
      {loading ? <span className="sk" style={{ width: 80, height: 24 }}/> : value}
    </div>
    <div className="kpi-foot">
      {delta != null ? (
        <span className={`kpi-delta ${delta >= 0 ? 'up' : 'down'}`}>
          <Icon name={delta >= 0 ? 'arrow-up' : 'arrow-down'} size={10}/>
          {delta >= 0 ? '+' : ''}{typeof delta === 'number' ? delta.toFixed(1) : delta}%
        </span>
      ) : null}
      {deltaLabel && <span className="kpi-foot-label">{deltaLabel}</span>}
      {sub && !delta && <span className="kpi-foot-label">{sub}</span>}
    </div>
    {spark && <div className="kpi-spark">{spark}</div>}
  </div>
);

// ── Card primitive ───────────────────────────────────────────
const Card = ({ title, subtitle, action, children, flush }) => (
  <div className="card">
    {(title || action) && (
      <div className="card-h">
        <div>
          {title && <h3>{title}</h3>}
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
    )}
    <div className={'card-b' + (flush ? ' flush' : '')}>{children}</div>
  </div>
);

// ── Pill / Status badge ──────────────────────────────────────
const STATUS_KIND = {
  ACTIVE: 'ok',
  TRIAL:  'info',
  PAST_DUE: 'warn',
  SUSPENDED: 'err',
  EXPIRED: 'err',
  CANCELLED: 'err',
};
const Status = ({ value }) => (
  <span className={`pill ${STATUS_KIND[value] || 'muted'}`}>
    <span className="dot"/>{value}
  </span>
);

// ── Tenant avatar ───────────────────────────────────────────
const Avatar = ({ tenant, size = 28 }) => (
  <div className="brand-av" style={{
    width: size, height: size, borderRadius: size * 0.25,
    background: `linear-gradient(135deg, ${tenant.color}, ${tenant.color}aa)`,
    fontSize: size * 0.42,
  }}>
    <span>{tenant.emoji || tenant.name[0]}</span>
  </div>
);

// ── Health bar ───────────────────────────────────────────────
const HealthBar = ({ value }) => {
  const color = value >= 75 ? 'var(--ok)' : value >= 50 ? 'var(--warn)' : 'var(--err)';
  return (
    <div className="health-dot">
      <div className="health-bar">
        <div className="health-bar-fill" style={{ width: `${value}%`, background: color }}/>
      </div>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
};

// ── Sidebar ─────────────────────────────────────────────────
const NAV = [
  { section: 'PANEL', items: [
    { id: 'overview', icon: 'grid',     label: 'Vista general' },
  ]},
  { section: 'NEGOCIO', items: [
    { id: 'marcas',      icon: 'building',  label: 'Marcas',      badge: null },
    { id: 'planes',      icon: 'layers',    label: 'Planes' },
    { id: 'facturacion', icon: 'receipt',   label: 'Facturación' },
  ]},
  { section: 'SISTEMA', items: [
    { id: 'tpv-config',  icon: 'terminal',  label: 'TPV Config' },
    { id: 'tpv-updates', icon: 'cpu',       label: 'TPV Updates' },
    { id: 'logs',        icon: 'logs',      label: 'Logs' },
    { id: 'errors',      icon: 'alert',     label: 'Errores', badge: 7, badgeKind: 'err' },
    { id: 'api-keys',    icon: 'key',       label: 'API Keys' },
    { id: 'ajustes',     icon: 'settings',  label: 'Ajustes' },
  ]},
];

const Sidebar = ({ active, onNav, onCmd, onAi, criticalAlerts }) => (
  <aside className="sb">
    <div className="sb-brand">
      <div className="sb-brand-logo">M</div>
      <div>
        <div className="sb-brand-name">MRTPVREST</div>
        <div className="sb-brand-sub">SaaS · Central</div>
      </div>
    </div>
    <div className="sb-search" onClick={onCmd}>
      <Icon name="search" size={14}/>
      <span style={{ flex: 1 }}>Buscar marca, log, factura…</span>
      <kbd>⌘K</kbd>
    </div>
    <nav className="sb-nav">
      {NAV.map(grp => (
        <React.Fragment key={grp.section}>
          <div className="sb-section">{grp.section}</div>
          {grp.items.map(item => {
            const badge = item.id === 'errors' ? criticalAlerts : item.badge;
            return (
              <a key={item.id} className={`sb-link ${active === item.id ? 'active' : ''}`}
                 onClick={() => onNav(item.id)}>
                <Icon name={item.icon} size={15}/>
                <span>{item.label}</span>
                {badge ? <span className={`sb-link-badge ${item.badgeKind || ''}`}>{badge}</span> : null}
              </a>
            );
          })}
        </React.Fragment>
      ))}
      <div className="sb-section">IA</div>
      <a className="sb-link" onClick={onAi}>
        <Icon name="sparkles" size={15}/>
        <span>Asistente IA</span>
        <span className="sb-link-badge" style={{ background: 'var(--iris-soft)', color: 'var(--iris-300)' }}>NEW</span>
      </a>
    </nav>
    <div className="sb-foot">
      <div className="sb-user">
        <div className="sb-user-av">JL</div>
        <div className="sb-user-info">
          <div className="sb-user-name">Juan López</div>
          <div className="sb-user-role">Super Admin · MX</div>
        </div>
        <div className="sb-user-dot" title="online"/>
      </div>
    </div>
  </aside>
);

// ── Topbar ──────────────────────────────────────────────────
const Topbar = ({ crumbs, title, onAi, onTweaks, onTheme, isDark, aiOpen, alerts }) => (
  <div className="tb">
    <div className="tb-left">
      <div>
        {crumbs && (
          <div className="tb-crumb">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="sep">/</span>}
                <span>{c}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        <div className="tb-title">{title}</div>
      </div>
    </div>
    <div className="tb-right">
      <div className="tb-pill"><span className="dot"/>{alerts > 0 ? `${alerts} alertas activas` : 'Sistema OK · 99.98%'}</div>
      <button className="tb-btn" onClick={onTheme} title={isDark ? 'Modo claro' : 'Modo oscuro'}>
        <Icon name={isDark ? 'sun' : 'moon'} size={14}/>
      </button>
      <button className={`tb-btn ${aiOpen ? 'primary' : ''}`} onClick={onAi}>
        <Icon name="sparkles" size={14}/>
        <span>IA</span>
      </button>
    </div>
  </div>
);

// ── Toast (singleton) ───────────────────────────────────────
const Toast = ({ msg, kind, show }) => (
  <div className={`toast ${kind || ''} ${show ? 'show' : ''}`}>{msg}</div>
);

Object.assign(window, {
  fmtMoney, fmtNum, fmtDate, timeAgo,
  KPI, Card, Status, Avatar, HealthBar,
  Sidebar, Topbar, Toast, STATUS_KIND,
});
