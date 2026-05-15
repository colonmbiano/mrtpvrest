/* MRTPVREST · Remaining screens
   Planes, Facturación, Logs, Errores, TPV Config, TPV Updates, API Keys, Ajustes.
*/

// ── PLANES ───────────────────────────────────────────────────
const Planes = () => {
  const D = window.MRTPV_DATA;
  const [selected, setSelected] = React.useState(D.PLANS[1].id);
  const plan = D.PLANS.find(p => p.id === selected);

  const FEATURES = [
    { key: 'hasKDS',       label: 'Cocina (KDS)',         icon: 'flame',   desc: 'Pantalla de cocina en tiempo real' },
    { key: 'hasInventory', label: 'Inventario',           icon: 'package', desc: 'Recetas, costeo, factor corrección' },
    { key: 'hasLoyalty',   label: 'Loyalty',              icon: 'tag',     desc: 'Programa de fidelidad + cupones' },
    { key: 'hasReports',   label: 'Reportes IA',          icon: 'sparkles',desc: 'Dashboard analítico + asistente IA' },
    { key: 'hasAPIAccess', label: 'API Access',           icon: 'key',     desc: 'Endpoints para integraciones' },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h2>Planes</h2>
          <p>{D.PLANS.filter(p=>p.isActive).length} activos · {D.PLANS.length} en total · feature gating granular</p>
        </div>
        <div className="page-head-right">
          <button className="btn"><Icon name="download" size={13}/>Exportar</button>
          <button className="btn primary"><Icon name="plus" size={13}/>Nuevo plan</button>
        </div>
      </div>

      {/* Plan cards comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
        {D.PLANS.map(p => {
          const subs = D.TENANTS.filter(t => t.plan.id === p.id && t.subscription.status === 'ACTIVE').length;
          const isSel = p.id === selected;
          return (
            <div key={p.id} onClick={() => setSelected(p.id)}
                 style={{
                   position: 'relative',
                   background: isSel ? `linear-gradient(180deg, ${p.color}10, var(--surf-1) 70%)` : 'var(--surf-1)',
                   border: `1px solid ${isSel ? p.color : 'var(--border-1)'}`,
                   borderRadius: 14,
                   padding: 20,
                   cursor: 'pointer',
                   transition: 'all 0.15s',
                   boxShadow: isSel ? `0 8px 32px ${p.color}25` : 'none',
                 }}>
              {p.name === 'PRO' && (
                <span className="pill" style={{ position: 'absolute', top: -10, right: 16 }}>
                  ★ POPULAR
                </span>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div>
                  <div className="mono" style={{ fontSize: 10, color: p.color, letterSpacing: '0.18em' }}>{p.name}</div>
                  <h3 style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 22, color: 'var(--text)', marginTop: 4 }}>{p.displayName}</h3>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 32, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                    ${p.price}
                  </div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>/ mes USD</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
                <PlanStat label="Trial"      value={`${p.trialDays}d`}/>
                <PlanStat label="Sucursales" value={p.maxLocations>=99?'∞':p.maxLocations}/>
                <PlanStat label="Empleados"  value={p.maxEmployees>=99?'∞':p.maxEmployees}/>
                <PlanStat label="Módulos"    value={p.allowedModules.length}/>
              </div>
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>SUSCRIPTORES</div>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20, color: 'var(--text)', marginTop: 2 }}>{subs}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>MRR</div>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20, color: p.color, marginTop: 2 }}>${(subs*p.price).toLocaleString()}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Plan editor */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        <Card title={`Configurar · ${plan.displayName}`} subtitle="Feature flags y límites" action={<button className="btn sm primary"><Icon name="check" size={11}/>Guardar</button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FEATURES.map(f => {
              const on = plan[f.key];
              return (
                <div key={f.key} style={{
                  padding: '10px 12px', borderRadius: 9,
                  background: on ? 'var(--brand-soft)' : 'var(--surf-2)',
                  border: `1px solid ${on ? 'rgba(124,58,237,0.22)' : 'var(--border-1)'}`,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: on ? 'var(--brand)' : 'var(--surf-3)',
                    color: on ? '#fff' : 'var(--text-dim)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name={f.icon} size={14}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{f.label}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 1 }}>{f.desc}</div>
                  </div>
                  <div className={`tgl ${on?'on':''}`}/>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Módulos del producto" subtitle={`${plan.allowedModules.length} habilitados`}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { id: 'pos_standard',  l: 'POS Estándar',     i: 'terminal' },
              { id: 'kds',           l: 'KDS Cocina',        i: 'flame' },
              { id: 'delivery',      l: 'Delivery',          i: 'send' },
              { id: 'inventory',     l: 'Inventario',        i: 'package' },
              { id: 'employee_management', l: 'Empleados',   i: 'users' },
              { id: 'cash_shift',    l: 'Turnos de caja',    i: 'clock' },
              { id: 'client_menu',   l: 'Tienda online',     i: 'globe' },
              { id: 'kiosk',         l: 'Kiosko',            i: 'cpu' },
              { id: 'waiters',       l: 'Meseros',           i: 'user' },
              { id: 'loyalty_advanced', l: 'Loyalty pro',    i: 'tag' },
              { id: 'multi_currency', l: 'Multi-moneda',     i: 'dollar' },
            ].map(m => {
              const on = plan.allowedModules.includes(m.id);
              return (
                <div key={m.id} style={{
                  padding: '7px 9px', borderRadius: 7,
                  background: on ? 'var(--brand-soft)' : 'var(--surf-2)',
                  border: `1px solid ${on ? 'rgba(124,58,237,0.22)' : 'var(--border-1)'}`,
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer',
                }}>
                  <Icon name={m.i} size={12} style={{ color: on ? 'var(--iris-400)' : 'var(--text-dim)' }}/>
                  <span style={{ fontSize: 11.5, fontWeight: 500, color: on ? 'var(--text)' : 'var(--text-muted)', flex: 1 }}>{m.l}</span>
                  {on && <Icon name="check" size={11} style={{ color: 'var(--iris-400)' }}/>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
};

const PlanStat = ({ label, value }) => (
  <div style={{ padding: '6px 8px', background: 'var(--surf-2)', borderRadius: 6, border: '1px solid var(--border-1)' }}>
    <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text)', marginTop: 1 }}>{value}</div>
  </div>
);

// ── FACTURACIÓN ─────────────────────────────────────────────
const Facturacion = ({ onOpenTenant }) => {
  const D = window.MRTPV_DATA;
  const [period, setPeriod] = React.useState('30d');

  const all = D.INVOICES;
  const paid = all.filter(i => i.status === 'PAID');
  const pending = all.filter(i => i.status === 'PENDING');
  const failed = all.filter(i => i.status === 'FAILED');
  const totalPaid = paid.reduce((s,i)=>s+i.amount, 0);
  const totalFailed = failed.reduce((s,i)=>s+i.amount, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h2>Facturación</h2>
          <p>{all.length} facturas · {paid.length} pagadas · {failed.length} fallidas · MRR ${D.STATS.mrr.toLocaleString()}/mes</p>
        </div>
        <div className="page-head-right">
          <div className="tabs">
            {[['7d','7d'],['30d','30d'],['90d','90d'],['all','Todo']].map(([k,l]) => (
              <button key={k} className={`tab ${period===k?'active':''}`} onClick={()=>setPeriod(k)}>{l}</button>
            ))}
          </div>
          <button className="btn primary"><Icon name="download" size={13}/>CSV</button>
        </div>
      </div>

      <div className="kpis">
        <KPI label="MRR total"        value={fmtMoney(D.STATS.mrr)}  accent="var(--iris-500)" icon="dollar" delta={D.STATS.mrrGrowth} deltaLabel="vs mes ant."/>
        <KPI label="ARR proyectado"   value={fmtMoney(D.STATS.arr)}  accent="var(--ok)"        icon="trend-up"/>
        <KPI label="Cobrado total"    value={fmtMoney(totalPaid)}    accent="var(--info)"      icon="receipt"/>
        <KPI label="Fallido"          value={<span>{fmtMoney(totalFailed)}<small style={{ color: 'var(--err)' }}> · {failed.length} facturas</small></span>} accent="var(--err)" icon="alert"/>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title="Facturas recientes" subtitle="Order desc · click para abrir tenant" flush>
          <table className="tbl">
            <thead>
              <tr><th>Factura</th><th>Marca</th><th>Período</th><th>Monto</th><th>Estado</th><th>Pagado</th></tr>
            </thead>
            <tbody>
              {all.slice(0, 14).map(i => {
                const t = D.TENANTS.find(t=>t.id===i.tenantId);
                return (
                  <tr key={i.id} onClick={() => onOpenTenant(i.tenantId)}>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{i.id.slice(0, 14)}…</td>
                    <td>
                      <div className="brand-cell">
                        {t && <Avatar tenant={t} size={22}/>}
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{i.tenant}</span>
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{fmtDate(i.periodStart)} → {fmtDate(i.periodEnd)}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>{fmtMoney(i.amount)}</td>
                    <td><span className={`pill ${i.status==='PAID'?'ok':i.status==='FAILED'?'err':'warn'}`}><span className="dot"/>{i.status}</span></td>
                    <td className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{i.paidAt ? timeAgo(i.paidAt) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card title="Salud financiera" subtitle="Indicadores clave">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FinRow label="Tasa de pago" value="97.4%" sub="paid / total" gauge={97}/>
            <FinRow label="Días promedio" value="2.1d" sub="emisión → cobro" gauge={88}/>
            <FinRow label="Reintentos exitosos" value="64%" sub="card_declined recovery" gauge={64}/>
            <FinRow label="Churn de revenue" value="1.8%" sub="MRR perdido / mes" gauge={92} good/>
            <FinRow label="Expansion MRR" value="+$1,420" sub="upgrades este mes" gauge={75} color="var(--ok)"/>
          </div>
        </Card>
      </div>
    </div>
  );
};

const FinRow = ({ label, value, sub, gauge, color, good }) => {
  const c = color || (gauge >= 80 ? 'var(--ok)' : gauge >= 50 ? 'var(--warn)' : 'var(--err)');
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600, color: c }}>{value}</span>
      </div>
      <div style={{ height: 4, background: 'var(--surf-2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${gauge}%`, height: '100%', background: c, borderRadius: 2 }}/>
      </div>
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', marginTop: 3 }}>{sub}</div>
    </div>
  );
};

// ── LOGS ─────────────────────────────────────────────────────
const LogsScreen = ({ onOpenTenant }) => {
  const D = window.MRTPV_DATA;
  const [search, setSearch] = React.useState('');
  const [type, setType] = React.useState('ALL');
  const [paused, setPaused] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setTick(x => x + 1), 4000);
    return () => clearInterval(t);
  }, [paused]);

  const TYPES = ['ALL','register','activated','payment','trial_end','failed','upgrade','churn','ai'];
  const filtered = D.ACTIVITY.filter(e => {
    const q = search.toLowerCase();
    const matchQ = !q || e.tenant.toLowerCase().includes(q) || e.text.toLowerCase().includes(q) || (e.sub||'').toLowerCase().includes(q);
    const matchT = type === 'ALL' || e.type === type;
    return matchQ && matchT;
  });

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h2>Logs de actividad</h2>
          <p>{D.ACTIVITY.length} eventos · stream en vivo {paused?'pausado':'activo'}</p>
        </div>
        <div className="page-head-right">
          <button className="btn" onClick={() => setPaused(!paused)}>
            <Icon name={paused?'play':'pause'} size={13}/>{paused?'Reanudar':'Pausar'}
          </button>
          <button className="btn"><Icon name="download" size={13}/>Exportar</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <div className="input-wrap" style={{ flex: '1 1 280px', maxWidth: 380 }}>
          <Icon name="search" size={14}/>
          <input className="input" placeholder="Buscar tenant o evento…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="tabs">
          {TYPES.map(t => (
            <button key={t} className={`tab ${type===t?'active':''}`} onClick={()=>setType(t)}>
              {t === 'ALL' ? 'Todos' : t.replace('_',' ')}
            </button>
          ))}
        </div>
      </div>

      <Card flush>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filtered.map((ev, i) => {
            const ACT = { register:{i:'plus',c:'var(--info)'}, activated:{i:'check',c:'var(--ok)'}, payment:{i:'dollar',c:'var(--ok)'},
                          trial_end:{i:'clock',c:'var(--warn)'}, failed:{i:'alert',c:'var(--err)'}, upgrade:{i:'trend-up',c:'var(--ok)'},
                          churn:{i:'flame',c:'var(--err)'}, ai:{i:'sparkles',c:'var(--iris-400)'} };
            const I = ACT[ev.type] || { i: 'info', c: 'var(--text-dim)' };
            return (
              <div key={ev.id} onClick={() => onOpenTenant(ev.tenantId)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 18px',
                borderBottom: i < filtered.length-1 ? '1px solid var(--border-1)' : 'none',
                cursor: 'pointer',
              }}>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', width: 60, flexShrink: 0 }}>
                  {timeAgo(ev.ts)}
                </div>
                <div style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: `color-mix(in oklch, ${I.c} 14%, transparent)`,
                  color: I.c, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={I.i} size={12}/>
                </div>
                <span className="pill muted" style={{ fontSize: 9, padding: '1px 6px', textTransform: 'uppercase' }}>{ev.type.replace('_',' ')}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text)' }}>
                    <strong style={{ fontWeight: 600 }}>{ev.tenant}</strong> · {ev.text}
                  </div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 2 }}>{ev.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

// ── ERRORES ──────────────────────────────────────────────────
const ErroresScreen = () => {
  const D = window.MRTPV_DATA;
  const [levels, setLevels] = React.useState(new Set(['CRITICAL','ERROR']));
  const [search, setSearch] = React.useState('');
  const [paused, setPaused] = React.useState(false);
  const [expanded, setExpanded] = React.useState({});

  function toggle(l) {
    setLevels(s => {
      const ns = new Set(s);
      if (ns.has(l)) ns.delete(l); else ns.add(l);
      return ns;
    });
  }

  const filtered = D.ERRORS.filter(e => {
    if (!levels.has(e.level)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.message||'').toLowerCase().includes(q) || (e.path||'').toLowerCase().includes(q) || (e.tenant||'').toLowerCase().includes(q);
  });

  const counts = {
    CRITICAL: D.ERRORS.filter(e=>e.level==='CRITICAL').length,
    ERROR:    D.ERRORS.filter(e=>e.level==='ERROR').length,
    WARN:     D.ERRORS.filter(e=>e.level==='WARN').length,
    INFO:     D.ERRORS.filter(e=>e.level==='INFO').length,
  };

  const LCOLORS = { CRITICAL: 'var(--err)', ERROR: 'var(--err)', WARN: 'var(--warn)', INFO: 'var(--info)' };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h2>System Errors</h2>
          <p>Polling 4s · {filtered.length} resultados · {paused?'pausado':'live'}</p>
        </div>
        <div className="page-head-right">
          <button className="btn" onClick={()=>setPaused(!paused)}><Icon name={paused?'play':'pause'} size={13}/>{paused?'Reanudar':'Pausar'}</button>
          <button className="btn"><Icon name="refresh" size={13}/>Recargar</button>
          <button className="btn"><Icon name="download" size={13}/>JSON</button>
        </div>
      </div>

      <div className="kpis">
        <KPI label="Críticos"  value={counts.CRITICAL} accent="var(--err)"  icon="alert" sub="últimas 24h"/>
        <KPI label="Errores"   value={counts.ERROR}    accent="var(--err)"  icon="x" sub="stack traces"/>
        <KPI label="Warnings"  value={counts.WARN}     accent="var(--warn)" icon="clock"/>
        <KPI label="Info"      value={counts.INFO}     accent="var(--info)" icon="info"/>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <div className="input-wrap" style={{ flex: 1, maxWidth: 380 }}>
          <Icon name="search" size={14}/>
          <input className="input mono" placeholder="Mensaje, path, tenant…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['CRITICAL','ERROR','WARN','INFO'].map(l => (
            <button key={l} onClick={()=>toggle(l)} className={`pill ${levels.has(l)?(l==='CRITICAL'||l==='ERROR'?'err':l==='WARN'?'warn':'info'):'muted'}`} style={{ cursor: 'pointer' }}>
              <span className="dot"/>{l}
            </button>
          ))}
        </div>
      </div>

      <Card flush>
        {filtered.map((e, i) => {
          const open = expanded[e.id];
          return (
            <div key={e.id} style={{
              padding: '12px 18px', borderBottom: i < filtered.length-1 ? '1px solid var(--border-1)' : 'none',
              borderLeft: `3px solid ${LCOLORS[e.level]}`,
            }}>
              <div onClick={() => setExpanded(s => ({ ...s, [e.id]: !s[e.id] }))} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className={`pill ${e.level==='CRITICAL'||e.level==='ERROR'?'err':e.level==='WARN'?'warn':'info'}`} style={{ fontSize: 8.5 }}>{e.level}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>{e.method}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{e.path}</span>
                  {e.tenant && (
                    <span className="pill muted" style={{ fontSize: 9 }}>{e.tenant}</span>
                  )}
                  <span style={{ flex: 1 }}/>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{timeAgo(e.createdAt)}</span>
                  <Icon name="chevron-d" size={12} style={{ color: 'var(--text-dim)', transform: open?'rotate(180deg)':'none' }}/>
                </div>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--text)', lineHeight: 1.45 }}>{e.message}</div>
              </div>
              {open && e.stack && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--surf-2)', borderRadius: 6, border: '1px solid var(--border-1)' }}>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>STACK TRACE</div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{e.stack}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button className="btn ghost sm"><Icon name="copy" size={10}/>Copiar</button>
                    <button className="btn ghost sm"><Icon name="github" size={10}/>Crear issue</button>
                    <button className="btn ghost sm"><Icon name="sparkles" size={10}/>Analizar con IA</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
};

// ── TPV CONFIG ──────────────────────────────────────────────
const TpvConfigScreen = () => {
  const D = window.MRTPV_DATA;
  const [search, setSearch] = React.useState('');
  const [view, setView] = React.useState('grid');

  const filtered = D.TPV_LOCATIONS.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return l.locationName.toLowerCase().includes(q) || l.tenantName.toLowerCase().includes(q) || l.locationSlug.includes(q);
  });

  const online = filtered.filter(l => l.online).length;
  const outdated = filtered.filter(l => l.installedVersion !== '3.18.4').length;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h2>TPV Config</h2>
          <p>{D.TPV_LOCATIONS.length} sucursales · {online} online · {outdated} con versión desactualizada</p>
        </div>
        <div className="page-head-right">
          <div className="tabs">
            <button className={`tab ${view==='grid'?'active':''}`} onClick={()=>setView('grid')}><Icon name="grid" size={11}/></button>
            <button className={`tab ${view==='list'?'active':''}`} onClick={()=>setView('list')}><Icon name="logs" size={11}/></button>
          </div>
          <button className="btn"><Icon name="upload" size={13}/>Push config</button>
        </div>
      </div>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KPI label="Sucursales totales" value={D.TPV_LOCATIONS.length} accent="var(--iris-500)" icon="terminal"/>
        <KPI label="TPVs online"        value={`${online}/${D.TPV_LOCATIONS.length}`} accent="var(--ok)" icon="wifi" delta={Math.round((online/D.TPV_LOCATIONS.length)*100*10)/10 - 95} deltaLabel="vs ayer"/>
        <KPI label="Versión actual"     value="3.18.4" accent="var(--info)" icon="cpu" sub="prod stable"/>
        <KPI label="Desactualizadas"    value={outdated} accent="var(--warn)" icon="alert" sub="< 3.18.4"/>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <div className="input-wrap" style={{ flex: 1, maxWidth: 380 }}>
          <Icon name="search" size={14}/>
          <input className="input" placeholder="Buscar marca o sucursal…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
      </div>

      {view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map(l => (
            <div key={l.id} style={{
              background: 'var(--surf-1)', border: '1px solid var(--border-1)',
              borderRadius: 12, padding: 14,
              borderLeft: `3px solid ${l.accentColor}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: `linear-gradient(135deg, ${l.accentColor}, ${l.accentColor}aa)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                }}>{l.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{l.tenantName}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{l.locationName} · {l.country}</div>
                </div>
                <Icon name={l.online?'wifi':'wifi-off'} size={14} style={{ color: l.online?'var(--ok)':'var(--err)' }}/>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10.5 }}>
                <div>
                  <div className="mono" style={{ color: 'var(--text-dim)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Versión</div>
                  <div className="mono" style={{ color: l.installedVersion === '3.18.4' ? 'var(--ok)' : 'var(--warn)', fontWeight: 600 }}>v{l.installedVersion}</div>
                </div>
                <div>
                  <div className="mono" style={{ color: 'var(--text-dim)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Último boot</div>
                  <div className="mono" style={{ color: 'var(--text-muted)' }}>{timeAgo(l.lastBoot)}</div>
                </div>
                <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
                  <div className="mono" style={{ color: 'var(--text-dim)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Tipos de orden</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                    {l.allowedOrderTypes.map(o => (
                      <span key={o} className="pill muted" style={{ fontSize: 8.5, padding: '1px 6px' }}>{o}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card flush>
          <table className="tbl">
            <thead>
              <tr><th>Sucursal</th><th>Tenant</th><th>Estado</th><th>Versión</th><th>Tipos de orden</th><th>Última actualización</th></tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id}>
                  <td><strong>{l.locationName}</strong><div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{l.locationSlug}</div></td>
                  <td>{l.tenantName}</td>
                  <td><span className={`pill ${l.online?'ok':'err'}`}><span className="dot"/>{l.online?'ONLINE':'OFFLINE'}</span></td>
                  <td className="mono" style={{ color: l.installedVersion==='3.18.4'?'var(--ok)':'var(--warn)' }}>{l.installedVersion}</td>
                  <td className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{l.allowedOrderTypes.join(' · ')}</td>
                  <td className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{timeAgo(l.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};

// ── TPV UPDATES ─────────────────────────────────────────────
const TpvUpdatesScreen = () => {
  const D = window.MRTPV_DATA;
  const [channel, setChannel] = React.useState('production');
  const bundles = D.OTA_BUNDLES.filter(b => b.channel === channel);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h2>TPV Updates · OTA</h2>
          <p>Bundles JS · rollout y versionado por canal</p>
        </div>
        <div className="page-head-right">
          <button className="btn"><Icon name="upload" size={13}/>Subir bundle</button>
          <button className="btn primary"><Icon name="play" size={13}/>Trigger release</button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {[['production','Production','ok'],['beta','Beta','warn'],['dev','Dev','info']].map(([k,l,kind]) => (
          <button key={k} className={`tab ${channel===k?'active':''}`} onClick={()=>setChannel(k)}>
            <span className={`pill ${kind}`} style={{ fontSize: 8.5, padding: '1px 6px' }}>{l}</span>
            <span className="count">{D.OTA_BUNDLES.filter(b=>b.channel===k).length}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bundles.map(b => (
          <div key={b.id} style={{
            background: 'var(--surf-1)', border: '1px solid var(--border-1)',
            borderRadius: 12, padding: 16,
            borderLeft: b.isActive ? '3px solid var(--ok)' : '3px solid var(--border-2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>v{b.version}</span>
                  {b.isActive && <span className="pill ok"><span className="dot"/>ACTIVE</span>}
                  <span className="pill muted" style={{ fontSize: 9 }}>{channel}</span>
                </div>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 3 }}>
                  {b.appId} · {(b.sizeBytes/1024/1024).toFixed(1)} MB · {b.checksum}
                </div>
              </div>
              <div style={{ flex: 1 }}/>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{b.installs}</div>
                <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>instalaciones</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <button className="btn sm ghost"><Icon name="download" size={11}/>Bajar</button>
                {!b.isActive && <button className="btn sm"><Icon name="play" size={11}/>Activar</button>}
              </div>
            </div>
            {b.notes && (
              <div style={{ padding: '8px 10px', background: 'var(--surf-2)', borderRadius: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
                {b.notes}
              </div>
            )}
            {b.isActive && b.rollout < 100 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Rollout</span>
                  <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--ok)' }}>{b.rollout}%</span>
                </div>
                <div style={{ height: 4, background: 'var(--surf-2)', borderRadius: 2 }}>
                  <div style={{ width: `${b.rollout}%`, height: '100%', background: 'var(--ok)', borderRadius: 2 }}/>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── API KEYS ─────────────────────────────────────────────────
const ApiKeysScreen = () => {
  const D = window.MRTPV_DATA;
  const [reveal, setReveal] = React.useState({});

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h2>API Keys</h2>
          <p>{D.API_KEYS.length} keys · {D.API_KEYS.filter(k=>k.active).length} activas · scopes granulares</p>
        </div>
        <div className="page-head-right">
          <button className="btn primary"><Icon name="plus" size={13}/>Nueva API key</button>
        </div>
      </div>

      <Card flush>
        <table className="tbl">
          <thead>
            <tr><th>Nombre</th><th>Tenant</th><th>Key</th><th>Scopes</th><th>Estado</th><th>Uso 24h</th><th>Última vez</th><th></th></tr>
          </thead>
          <tbody>
            {D.API_KEYS.map(k => (
              <tr key={k.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{k.name}</div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>{k.id}</div>
                </td>
                <td style={{ fontSize: 12 }}>{k.tenant}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <code className="mono" style={{ fontSize: 11, color: 'var(--text)', background: 'var(--surf-2)', padding: '2px 8px', borderRadius: 5, border: '1px solid var(--border-1)' }}>
                      {reveal[k.id] ? k.prefix + 'a3f8c1d2e4b6' : k.prefix + '••••••••••••'}
                    </code>
                    <button className="btn ghost icon" onClick={() => setReveal(r => ({ ...r, [k.id]: !r[k.id] }))}>
                      <Icon name={reveal[k.id]?'eye-off':'eye'} size={11}/>
                    </button>
                    <button className="btn ghost icon"><Icon name="copy" size={11}/></button>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {k.scopes.slice(0, 3).map(s => (
                      <span key={s} className="pill muted" style={{ fontSize: 8.5, padding: '1px 5px' }}>{s}</span>
                    ))}
                    {k.scopes.length > 3 && <span className="pill muted" style={{ fontSize: 8.5 }}>+{k.scopes.length-3}</span>}
                  </div>
                </td>
                <td><span className={`pill ${k.active?'ok':'muted'}`}><span className="dot"/>{k.active?'ACTIVE':'REVOKED'}</span></td>
                <td className="mono" style={{ fontWeight: 600 }}>{fmtNum(k.requests24h)}</td>
                <td className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{k.lastUsedAt ? timeAgo(k.lastUsedAt) : '—'}</td>
                <td><button className="btn ghost icon"><Icon name="trash" size={12}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

// ── AJUSTES ──────────────────────────────────────────────────
const AjustesScreen = () => {
  const [toggles, setToggles] = React.useState({
    openRegistration: true,
    autoTrial: true,
    maintenanceMode: false,
    whatsappEnabled: true,
    aiPromos: true,
    aiOnboarding: true,
    stripeProd: true,
    geminiProd: true,
  });
  const T = ({ k, label, desc, accent }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border-1)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 2 }}>{desc}</div>
      </div>
      <div className={`tgl ${toggles[k]?'on':''}`} onClick={() => setToggles(t => ({ ...t, [k]: !t[k] }))}/>
    </div>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h2>Ajustes globales</h2>
          <p>Configuración del SaaS · aplica a todas las marcas</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="Plataforma" subtitle="Comportamiento global">
          <T k="openRegistration" label="Registro libre"      desc="Nuevas marcas sin aprobación manual"/>
          <T k="autoTrial"        label="Trial automático"    desc="Al registrarse inicia período gratis (14d)"/>
          <T k="maintenanceMode"  label="Modo mantenimiento"  desc="Bloquea acceso a TPV · landing visible"/>
          <T k="whatsappEnabled"  label="WhatsApp globalmente" desc="Whapi.cloud activo para notificaciones"/>
        </Card>

        <Card title="Inteligencia Artificial" subtitle="Gemini · módulos activos">
          <T k="aiOnboarding" label="Onboarding conversacional" desc="Chat IA configura módulos al registrar"/>
          <T k="aiPromos"     label="Promos automáticas"        desc="IA activa descuentos en baja rotación"/>
          <T k="geminiProd"   label="Gemini producción"         desc="Toggle entre Pro y dev keys"/>
        </Card>

        <Card title="Cuenta" subtitle="Sesión y seguridad">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 5 }}>Email</div>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>juan.lopez@mrtpvrest.com</div>
            </div>
            <button className="btn"><Icon name="key" size={13}/>Cambiar contraseña</button>
            <button className="btn"><Icon name="logout" size={13}/>Cerrar sesión</button>
          </div>
        </Card>

        <Card title="Integraciones" subtitle="Servicios externos">
          <T k="stripeProd" label="Stripe (live keys)" desc="Cobros en producción · webhook configurado"/>
          <div style={{ padding: '14px 0', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>API key Whapi.cloud</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>wpi_live_••••••••••••3a4f</div>
            </div>
            <button className="btn sm ghost"><Icon name="edit" size={11}/></button>
          </div>
        </Card>
      </div>
    </div>
  );
};

Object.assign(window, { Planes, Facturacion, LogsScreen, ErroresScreen, TpvConfigScreen, TpvUpdatesScreen, ApiKeysScreen, AjustesScreen });
