/* MRTPVREST · SaaS Admin · Root app
   Wires Sidebar + Topbar + screen router + AI panel.
   All sub-components are pulled off `window` (loaded by prior script tags). */

const { useState, useEffect, useMemo, useCallback } = React;

const PAGES = {
  overview:     { title: 'Vista general',  crumbs: ['PANEL', 'OVERVIEW'] },
  marcas:       { title: 'Marcas',         crumbs: ['NEGOCIO', 'MARCAS'] },
  'tenant':     { title: 'Marca',          crumbs: ['NEGOCIO', 'MARCAS', 'DETALLE'] },
  planes:       { title: 'Planes',         crumbs: ['NEGOCIO', 'PLANES'] },
  facturacion:  { title: 'Facturación',    crumbs: ['NEGOCIO', 'FACTURACIÓN'] },
  'tpv-config': { title: 'TPV Config',     crumbs: ['SISTEMA', 'TPV', 'CONFIG'] },
  'tpv-updates':{ title: 'TPV Updates',    crumbs: ['SISTEMA', 'TPV', 'UPDATES'] },
  logs:         { title: 'Logs',           crumbs: ['SISTEMA', 'LOGS'] },
  errors:       { title: 'Errores',        crumbs: ['SISTEMA', 'ERRORES'] },
  'api-keys':   { title: 'API Keys',       crumbs: ['SISTEMA', 'API KEYS'] },
  ajustes:      { title: 'Ajustes',        crumbs: ['SISTEMA', 'AJUSTES'] },
};

const App = () => {
  const [active, setActive]   = useState('overview');
  const [tenantId, setTenant] = useState(null);
  const [aiOpen, setAiOpen]   = useState(false);
  const [aiIntent, setIntent] = useState(null);
  const [isDark, setIsDark]   = useState(true);
  const [toast, setToast]     = useState({ msg: '', kind: '', show: false });

  // Mode toggle → body[data-mode]
  useEffect(() => {
    document.body.setAttribute('data-mode', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Derived: critical alert badge for sidebar
  const D = window.MRTPV_DATA || {};
  const criticalAlerts = useMemo(() => {
    const alerts = D.ALERTS || [];
    return alerts.filter(a => a.sev === 'critical' && !a.ack).length || null;
  }, [D]);

  // Nav handlers
  const onNav = useCallback((id) => {
    setActive(id);
    setTenant(null);
  }, []);
  const onOpenTenant = useCallback((id) => {
    setTenant(id);
    setActive('tenant');
  }, []);
  const onBackFromTenant = useCallback(() => {
    setTenant(null);
    setActive('marcas');
  }, []);
  const onAskAi = useCallback((intent) => {
    setIntent(intent || null);
    setAiOpen(true);
  }, []);
  const onCmd = useCallback(() => {
    setToast({ msg: 'Command palette ⌘K (prototipo)', kind: 'info', show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 1600);
  }, []);

  // Page metadata
  const page = PAGES[active] || PAGES.overview;

  // Screen content
  let screen = null;
  switch (active) {
    case 'overview':     screen = <window.Overview onOpenTenant={onOpenTenant} onAskAi={onAskAi} />; break;
    case 'marcas':       screen = <window.Marcas onOpenTenant={onOpenTenant} />; break;
    case 'tenant':       screen = <window.TenantDetail tenantId={tenantId} onBack={onBackFromTenant} onAskAi={onAskAi} />; break;
    case 'planes':       screen = <window.Planes />; break;
    case 'facturacion':  screen = <window.Facturacion onOpenTenant={onOpenTenant} />; break;
    case 'tpv-config':   screen = <window.TpvConfigScreen />; break;
    case 'tpv-updates':  screen = <window.TpvUpdatesScreen />; break;
    case 'logs':         screen = <window.LogsScreen onOpenTenant={onOpenTenant} />; break;
    case 'errors':       screen = <window.ErroresScreen />; break;
    case 'api-keys':     screen = <window.ApiKeysScreen />; break;
    case 'ajustes':      screen = <window.AjustesScreen />; break;
    default:             screen = <div style={{ padding: 32, color: 'var(--text-muted)' }}>Pantalla no encontrada: {active}</div>;
  }

  return (
    <div className={`app ${aiOpen ? 'ai-open' : ''}`}>
      <window.Sidebar
        active={active === 'tenant' ? 'marcas' : active}
        onNav={onNav}
        onCmd={onCmd}
        onAi={() => setAiOpen(o => !o)}
        criticalAlerts={criticalAlerts}
      />
      <main className="main">
        <window.Topbar
          crumbs={page.crumbs}
          title={page.title}
          onAi={() => setAiOpen(o => !o)}
          onTheme={() => setIsDark(d => !d)}
          isDark={isDark}
          aiOpen={aiOpen}
          alerts={criticalAlerts || 0}
        />
        {screen}
      </main>
      {aiOpen && <window.AiPanel onClose={() => setAiOpen(false)} initialIntent={aiIntent} />}
      <window.Toast msg={toast.msg} kind={toast.kind} show={toast.show} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
