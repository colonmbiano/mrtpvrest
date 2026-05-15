/* MRTPVREST · Screen: Marcas + Tenant Drilldown
   Marcas list with search, filters, bulk actions.
   Tenant detail page with tabs: Overview / Billing / Logs / Errors / Modules.
*/

// ── Marcas List ─────────────────────────────────────────────
const Marcas = ({ onOpenTenant }) => {
  const D = window.MRTPV_DATA;
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('ALL');
  const [planFilter, setPlanFilter] = React.useState('ALL');
  const [country, setCountry] = React.useState('ALL');
  const [sort, setSort] = React.useState('newest');

  const counts = React.useMemo(() => ({
    ALL: D.TENANTS.length,
    ACTIVE: D.TENANTS.filter(t => t.subscription.status === 'ACTIVE').length,
    TRIAL: D.TENANTS.filter(t => t.subscription.status === 'TRIAL').length,
    PAST_DUE: D.TENANTS.filter(t => t.subscription.status === 'PAST_DUE').length,
    SUSPENDED: D.TENANTS.filter(t => ['SUSPENDED','EXPIRED','CANCELLED'].includes(t.subscription.status)).length,
  }), []);

  const filtered = React.useMemo(() => {
    let arr = D.TENANTS.filter(t => {
      const q = search.toLowerCase();
      const matchQ = !q || t.name.toLowerCase().includes(q) || t.slug.includes(q) || t.ownerEmail.includes(q) || (t.countryName||'').toLowerCase().includes(q);
      const matchF = filter === 'ALL'
        ? true
        : filter === 'SUSPENDED' ? ['SUSPENDED','EXPIRED','CANCELLED'].includes(t.subscription.status)
        : t.subscription.status === filter;
      const matchP = planFilter === 'ALL' || t.plan.id === planFilter;
      const matchC = country === 'ALL' || t.country === country;
      return matchQ && matchF && matchP && matchC;
    });
    if (sort === 'newest') arr.sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
    if (sort === 'mrr')    arr.sort((a,b)=> b.subscription.mrr - a.subscription.mrr);
    if (sort === 'health') arr.sort((a,b)=> b.health - a.health);
    if (sort === 'risk')   arr.sort((a,b)=> a.health - b.health);
    return arr;
  }, [search, filter, planFilter, country, sort]);

  const countries = React.useMemo(() => Array.from(new Set(D.TENANTS.map(t => t.country))), []);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <h2>Marcas</h2>
          <p>{D.TENANTS.length} tenants · {counts.ACTIVE} pagando · {counts.TRIAL} en trial · {counts.PAST_DUE} con incidencias</p>
        </div>
        <div className="page-head-right">
          <button className="btn"><Icon name="download" size={13}/>CSV</button>
          <button className="btn primary"><Icon name="plus" size={13}/>Crear marca</button>
        </div>
      </div>

      {/* KPI strip — smaller */}
      <div className="kpis">
        <KPI label="Total"     value={counts.ALL}                          accent="var(--iris-500)" sub="registradas"/>
        <KPI label="Activas"   value={counts.ACTIVE}                       accent="var(--ok)"       delta={6.4} deltaLabel="netas mes"/>
        <KPI label="En trial"  value={counts.TRIAL}                        accent="var(--info)"     sub="por convertir"/>
        <KPI label="Riesgo"    value={counts.PAST_DUE + counts.SUSPENDED}  accent="var(--err)"      sub="past-due + suspendidas"/>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="input-wrap" style={{ flex: '1 1 280px', maxWidth: 380 }}>
          <Icon name="search" size={14}/>
          <input className="input" placeholder="Buscar nombre, slug, email, país…"
                 value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="tabs">
          {[
            ['ALL','Todas'], ['ACTIVE','Activas'], ['TRIAL','Trial'],
            ['PAST_DUE','Past due'], ['SUSPENDED','Inactivas'],
          ].map(([k,l]) => (
            <button key={k} className={`tab ${filter===k?'active':''}`} onClick={()=>setFilter(k)}>
              {l}<span className="count">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }}/>
        <select className="input" style={{ width: 130 }} value={planFilter} onChange={e=>setPlanFilter(e.target.value)}>
          <option value="ALL">Todos los planes</option>
          {D.PLANS.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}
        </select>
        <select className="input" style={{ width: 120 }} value={country} onChange={e=>setCountry(e.target.value)}>
          <option value="ALL">País</option>
          {countries.map(c => <option key={c} value={c}>{D.COUNTRY_NAME[c]||c}</option>)}
        </select>
        <select className="input" style={{ width: 140 }} value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="newest">Más recientes</option>
          <option value="mrr">Mayor MRR</option>
          <option value="health">Más saludables</option>
          <option value="risk">En riesgo</option>
        </select>
      </div>

      {/* Table */}
      <Card flush>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 32 }}><input type="checkbox" /></th>
                <th>Marca</th>
                <th>Plan</th>
                <th>Estado</th>
                <th>Health</th>
                <th>MRR</th>
                <th>Órdenes 30d</th>
                <th>País</th>
                <th>Última actividad</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} onClick={() => onOpenTenant(t.id)}>
                  <td onClick={e => e.stopPropagation()}><input type="checkbox" /></td>
                  <td>
                    <div className="brand-cell">
                      <Avatar tenant={t}/>
                      <div style={{ minWidth: 0 }}>
                        <div className="brand-name">{t.name}</div>
                        <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                          {t.slug}.mrtpvrest.com
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 2, background: t.plan.color }}/>
                      <span style={{ fontWeight: 500 }}>{t.plan.displayName}</span>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>${t.plan.price}</span>
                    </div>
                  </td>
                  <td>
                    <Status value={t.subscription.status}/>
                    {t.subscription.status === 'TRIAL' && (
                      <span className="mono" style={{ fontSize: 10, color: 'var(--warn)', marginLeft: 6 }}>
                        {t.subscription.daysLeft}d
                      </span>
                    )}
                  </td>
                  <td><HealthBar value={t.health}/></td>
                  <td className="mono" style={{ fontWeight: 600 }}>{fmtMoney(t.subscription.mrr)}</td>
                  <td className="mono" style={{ color: t.orders30d ? 'var(--text)' : 'var(--text-dim)' }}>
                    {t.orders30d ? fmtNum(t.orders30d) : '—'}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                      <span style={{ fontSize: 13 }}>{({MX:'🇲🇽',CO:'🇨🇴',AR:'🇦🇷',PE:'🇵🇪',CL:'🇨🇱',VE:'🇻🇪',GT:'🇬🇹',EC:'🇪🇨',BO:'🇧🇴',SV:'🇸🇻',CR:'🇨🇷',PR:'🇵🇷',HN:'🇭🇳'})[t.country] || '🌎'}</span>
                      <span className="mono" style={{ color: 'var(--text-muted)' }}>{t.country}</span>
                    </span>
                  </td>
                  <td className="mono" style={{ color: 'var(--text-dim)', fontSize: 11 }}>{timeAgo(t.lastSeen)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn ghost icon"><Icon name="chevron" size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12.5 }}>
              Sin resultados para "<strong style={{ color: 'var(--text)' }}>{search}</strong>". Prueba otros filtros.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--border-1)' }}>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>
            {filtered.length} de {D.TENANTS.length}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn ghost icon"><Icon name="chevron" size={13} style={{ transform: 'rotate(180deg)' }}/></button>
            <button className="btn ghost icon"><Icon name="chevron" size={13}/></button>
          </div>
        </div>
      </Card>
    </div>
  );
};

// ── Tenant Detail Drilldown ────────────────────────────────
const TenantDetail = ({ tenantId, onBack, onAskAi }) => {
  const D = window.MRTPV_DATA;
  const tenant = D.TENANTS.find(t => t.id === tenantId);
  const [tab, setTab] = React.useState('overview');

  if (!tenant) return <div className="page">Tenant no encontrado.</div>;

  const tenantInvoices = D.INVOICES.filter(i => i.tenantId === tenantId);
  const tenantActivity = D.ACTIVITY.filter(a => a.tenantId === tenantId).slice(0, 12);
  const tenantErrors = D.ERRORS.filter(e => e.tenantId === tenantId).slice(0, 20);

  const totalPaid = tenantInvoices.filter(i => i.status === 'PAID').reduce((s,i)=>s+i.amount, 0);
  const daysAsCustomer = Math.floor((Date.now() - new Date(tenant.createdAt).getTime()) / 86400000);
  const LTV = tenantInvoices.filter(i=>i.status==='PAID').reduce((s,i)=>s+i.amount, 0);

  const moduleIcons = [
    { key: 'hasInventory', label: 'Inventario', icon: 'package' },
    { key: 'hasDelivery',  label: 'Delivery',   icon: 'send' },
    { key: 'hasWebStore',  label: 'Tienda',     icon: 'globe' },
    { key: 'hasKiosk',     label: 'Kiosko',     icon: 'cpu' },
  ];

  return (
    <div className="page">
      {/* Header card */}
      <div style={{ marginBottom: 16 }}>
        <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 12 }}>
          <Icon name="chevron" size={11} style={{ transform: 'rotate(180deg)' }}/>
          Marcas
        </button>
        <div style={{
          background: `linear-gradient(135deg, ${tenant.color}18, var(--surf-1) 60%)`,
          border: '1px solid var(--border-1)',
          borderRadius: 14,
          padding: 22,
          display: 'flex', alignItems: 'center', gap: 18,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: `linear-gradient(135deg, ${tenant.color}, ${tenant.color}aa)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, flexShrink: 0,
            boxShadow: `0 8px 24px ${tenant.color}40, inset 0 0 0 1px rgba(255,255,255,0.1)`,
          }}>
            {tenant.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h2 style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em', color: 'var(--text)' }}>
                {tenant.name}
              </h2>
              <Status value={tenant.subscription.status}/>
              <span className="pill muted">{tenant.plan.displayName}</span>
            </div>
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
              {tenant.slug}.mrtpvrest.com · {tenant.countryName} · cliente desde hace {daysAsCustomer}d
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--text-muted)' }}>
              <span><Icon name="mail" size={11} style={{ verticalAlign: '-2px' }}/> {tenant.ownerEmail}</span>
              {tenant.whatsapp && <span><Icon name="message" size={11} style={{ verticalAlign: '-2px' }}/> {tenant.whatsapp}</span>}
              <span><Icon name="users" size={11} style={{ verticalAlign: '-2px' }}/> {tenant.users} usuarios</span>
              <span><Icon name="building" size={11} style={{ verticalAlign: '-2px' }}/> {tenant.locations} sucursal{tenant.locations>1?'es':''}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn primary" onClick={() => onAskAi && onAskAi('health')}>
              <Icon name="sparkles" size={13}/>Resumen IA
            </button>
            <button className="btn"><Icon name="external" size={12}/>Abrir tenant</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[
          ['overview', 'Vista general', 'grid'],
          ['billing',  'Facturación',   'receipt'],
          ['modules',  'Módulos & TPV', 'cpu'],
          ['logs',     'Actividad',     'logs'],
          ['errors',   'Errores',       'alert'],
        ].map(([id, label, icon]) => (
          <button key={id} className={`tab ${tab===id?'active':''}`} onClick={()=>setTab(id)}>
            <Icon name={icon} size={12}/>{label}
            {id === 'errors' && tenantErrors.length > 0 && <span className="count">{tenantErrors.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <TenantOverview tenant={tenant} totalPaid={totalPaid} daysAsCustomer={daysAsCustomer}/>}
      {tab === 'billing'  && <TenantBilling  tenant={tenant} invoices={tenantInvoices}/>}
      {tab === 'modules'  && <TenantModules  tenant={tenant} moduleIcons={moduleIcons}/>}
      {tab === 'logs'     && <TenantLogs     activity={tenantActivity}/>}
      {tab === 'errors'   && <TenantErrors   errors={tenantErrors}/>}
    </div>
  );
};

const TenantOverview = ({ tenant, totalPaid, daysAsCustomer }) => {
  const traffic = Array.from({length: 14}, (_,i) => Math.floor(50 + Math.random()*150 + i*8));
  return (
    <>
      <div className="kpis">
        <KPI label="MRR actual"      value={fmtMoney(tenant.subscription.mrr)} accent={tenant.color} icon="dollar" sub={`Plan ${tenant.plan.displayName}`}/>
        <KPI label="Health score"    value={tenant.health}                     accent={tenant.health>=75?'var(--ok)':tenant.health>=50?'var(--warn)':'var(--err)'} icon="heart-pulse" sub={tenant.health>=75?'saludable':tenant.health>=50?'observación':'en riesgo'}/>
        <KPI label="Órdenes 30d"     value={fmtNum(tenant.orders30d || 0)}      accent="var(--info)" icon="zap" delta={12.4} deltaLabel="vs mes ant."/>
        <KPI label="LTV"             value={fmtMoney(totalPaid)}               accent="var(--ok)" icon="trend-up" sub={`${daysAsCustomer}d como cliente`}/>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title="Ventas TPV · últimas 2 semanas" subtitle="Órdenes diarias">
          <div style={{ height: 160 }}>
            <Sparkline data={traffic} color={tenant.color} width={600} height={160} fill dot/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-1)' }}>
            <Mini label="Ticket promedio" value={fmtMoney(Math.round((tenant.revenue30d||0) / Math.max(1, tenant.orders30d||1)))}/>
            <Mini label="Ingresos 30d"   value={fmtMoney(tenant.revenue30d||0)}/>
            <Mini label="Uptime TPV"     value={tenant.uptime.toFixed(2) + '%'} color="var(--ok)"/>
          </div>
        </Card>

        <Card title="Acciones rápidas">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tenant.subscription.status === 'TRIAL' && (
              <button className="btn primary" style={{ justifyContent: 'flex-start' }}>
                <Icon name="check" size={13}/>Activar suscripción
              </button>
            )}
            {tenant.subscription.status === 'ACTIVE' && (
              <button className="btn" style={{ justifyContent: 'flex-start', color: 'var(--warn)', borderColor: 'rgba(245,158,11,0.3)' }}>
                <Icon name="pause-circ" size={13}/>Pausar acceso
              </button>
            )}
            <button className="btn" style={{ justifyContent: 'flex-start' }}>
              <Icon name="layers" size={13}/>Cambiar plan
            </button>
            <button className="btn" style={{ justifyContent: 'flex-start' }}>
              <Icon name="clock" size={13}/>Regalar días de trial
            </button>
            <button className="btn" style={{ justifyContent: 'flex-start' }}>
              <Icon name="message" size={13}/>Enviar WhatsApp
            </button>
            <button className="btn" style={{ justifyContent: 'flex-start' }}>
              <Icon name="mail" size={13}/>Enviar email
            </button>
            <div style={{ borderTop: '1px solid var(--border-1)', margin: '4px 0' }}/>
            <button className="btn danger" style={{ justifyContent: 'flex-start' }}>
              <Icon name="trash" size={13}/>Eliminar marca
            </button>
          </div>
        </Card>
      </div>

      <Card title="Onboarding" subtitle={tenant.onboardingDone ? "Completado" : `Paso ${tenant.onboardingStep + 1} de 5`}>
        <OnboardingSteps step={tenant.onboardingStep} done={tenant.onboardingDone}/>
      </Card>
    </>
  );
};

const OnboardingSteps = ({ step, done }) => {
  const STEPS = [
    { label: 'Datos del negocio', icon: 'building' },
    { label: 'Categoría + país',   icon: 'tag' },
    { label: 'Menú inicial (IA)',  icon: 'sparkles' },
    { label: 'Conexión TPV',       icon: 'terminal' },
    { label: 'Primera venta',      icon: 'check' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 4 }}>
      {STEPS.map((s, i) => {
        const isDone = done || i < step;
        const isCurr = !done && i === step;
        return (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: isDone ? 'var(--brand-soft)' : isCurr ? 'var(--brand)' : 'var(--surf-2)',
                border: '1px solid ' + (isDone ? 'rgba(124,58,237,0.3)' : isCurr ? 'var(--brand)' : 'var(--border-1)'),
                color: isDone ? 'var(--iris-400)' : isCurr ? '#fff' : 'var(--text-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isCurr ? '0 4px 14px var(--brand-glow)' : 'none',
              }}>
                {isDone ? <Icon name="check" size={14}/> : <Icon name={s.icon} size={14}/>}
              </div>
              <div style={{ fontSize: 10.5, color: isCurr ? 'var(--text)' : 'var(--text-muted)', textAlign: 'center', fontWeight: isCurr ? 600 : 400 }}>
                {s.label}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ height: 1, flex: 0.4, background: i < step ? 'var(--brand)' : 'var(--border-1)', marginTop: -22 }}/>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const Mini = ({ label, value, color }) => (
  <div>
    <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
    <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: color || 'var(--text)', marginTop: 4 }}>{value}</div>
  </div>
);

const TenantBilling = ({ tenant, invoices }) => {
  const totalPaid = invoices.filter(i=>i.status==='PAID').reduce((s,i)=>s+i.amount, 0);
  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <KPI label="Pagado total"  value={fmtMoney(totalPaid)} accent="var(--ok)" icon="dollar"/>
        <KPI label="MRR"           value={fmtMoney(tenant.subscription.mrr)} accent={tenant.color} icon="trend-up"/>
        <KPI label="Próxima factura" value={fmtDate(new Date(Date.now()+10*86400000).toISOString())} accent="var(--info)" icon="clock"/>
      </div>
      <Card title="Historial de facturas" flush action={<button className="btn sm"><Icon name="download" size={11}/>Descargar todo</button>}>
        <table className="tbl">
          <thead>
            <tr><th>ID</th><th>Período</th><th>Monto</th><th>Estado</th><th>Pagado</th><th>Recibo</th></tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: 'var(--text-dim)' }}>Sin facturas todavía</td></tr>
            )}
            {invoices.map(i => (
              <tr key={i.id}>
                <td className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i.id}</td>
                <td className="mono" style={{ fontSize: 11.5 }}>{fmtDate(i.periodStart)} → {fmtDate(i.periodEnd)}</td>
                <td className="mono" style={{ fontWeight: 600 }}>{fmtMoney(i.amount)} <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{i.currency}</span></td>
                <td><span className={`pill ${i.status==='PAID'?'ok':i.status==='FAILED'?'err':i.status==='PENDING'?'warn':'muted'}`}><span className="dot"/>{i.status}</span></td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{i.paidAt ? fmtDate(i.paidAt) : '—'}</td>
                <td><button className="btn ghost sm"><Icon name="external" size={11}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
};

const TenantModules = ({ tenant, moduleIcons }) => (
  <>
    <Card title="Módulos activados" subtitle="Toggles por tenant — el TPV los lee al boot">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {moduleIcons.map(m => {
          const on = tenant.modules[m.key];
          return (
            <div key={m.key} style={{
              padding: '12px 14px', borderRadius: 10,
              background: on ? 'var(--brand-soft)' : 'var(--surf-2)',
              border: `1px solid ${on ? 'rgba(124,58,237,0.25)' : 'var(--border-1)'}`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: on ? 'var(--iris-500)' : 'var(--surf-3)',
                color: on ? '#fff' : 'var(--text-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={m.icon} size={15}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{m.label}</div>
                <div className="mono" style={{ fontSize: 10, color: on ? 'var(--iris-400)' : 'var(--text-dim)' }}>
                  {on ? 'ACTIVADO' : 'INACTIVO'}
                </div>
              </div>
              <div className={`tgl ${on?'on':''}`}/>
            </div>
          );
        })}
      </div>
    </Card>
  </>
);

const TenantLogs = ({ activity }) => (
  <Card title="Actividad del tenant" subtitle="Eventos cronológicos" flush>
    <div>
      {activity.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-dim)' }}>Sin actividad reciente</div>}
      {activity.map(ev => {
        const I = window.ACT_ICON ? window.ACT_ICON[ev.type] : { i: 'info', c: 'var(--text-dim)' };
        return (
          <div key={ev.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 18px', borderBottom: '1px solid var(--border-1)',
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 6,
              background: `color-mix(in oklch, var(--text-dim) 14%, transparent)`,
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-dim)',
            }}>
              <Icon name="info" size={12}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{ev.text}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 2 }}>{ev.sub}</div>
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{timeAgo(ev.ts)}</div>
          </div>
        );
      })}
    </div>
  </Card>
);

const TenantErrors = ({ errors }) => (
  <Card title="Errores del tenant" subtitle="Últimos 48h · order desc" flush>
    <div>
      {errors.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-dim)' }}>Sin errores recientes 🎉</div>}
      {errors.map(e => (
        <div key={e.id} style={{
          padding: '12px 18px', borderBottom: '1px solid var(--border-1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className={`pill ${e.level==='CRITICAL' || e.level==='ERROR' ? 'err' : e.level==='WARN' ? 'warn' : 'info'}`} style={{ fontSize: 8.5 }}>{e.level}</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{e.method} {e.path}</span>
            <span style={{ flex: 1 }}/>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{timeAgo(e.createdAt)}</span>
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.4 }}>{e.message}</div>
          {e.stack && (
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{e.stack}</div>
          )}
        </div>
      ))}
    </div>
  </Card>
);

Object.assign(window, { Marcas, TenantDetail });
