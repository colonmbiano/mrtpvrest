/* MRTPVREST · Screen: Overview (Vista general)
   The hero screen. KPIs, live activity, MRR chart, funnel, cohort,
   LATAM map, SLA alerts, top tenants.
*/

const Overview = ({ onOpenTenant, onAskAi }) => {
  const D = window.MRTPV_DATA;
  const [tick, setTick] = React.useState(0);
  const [pulse, setPulse] = React.useState({ mrr: false, active: false });

  // Live ticker — refresh every 4s, flash a random KPI
  React.useEffect(() => {
    const t = setInterval(() => {
      setTick(x => x + 1);
      const k = Math.random() > 0.5 ? 'mrr' : 'active';
      setPulse(p => ({ ...p, [k]: true }));
      setTimeout(() => setPulse(p => ({ ...p, [k]: false })), 1400);
    }, 4500);
    return () => clearInterval(t);
  }, []);

  const topTenants = React.useMemo(() => [...D.TENANTS]
    .filter(t => t.subscription.status === 'ACTIVE')
    .sort((a,b) => b.subscription.mrr - a.subscription.mrr)
    .slice(0, 6), []);

  const recent = React.useMemo(() => D.ACTIVITY.slice(0, 8), [tick]);

  // MRR sparkline data
  const mrrSpark = D.MRR_HISTORY.map(h => h.basic + h.pro + h.unl);
  const activeSpark = [88, 92, 96, 99, 104, 108, D.STATS.active];

  const criticalAlerts = D.ALERTS.filter(a => a.sev === 'critical' && !a.ack);

  return (
    <div className="page">
      {/* Page header */}
      <div className="page-head">
        <div className="page-head-left">
          <h2>Vista general</h2>
          <p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', boxShadow: '0 0 0 3px var(--ok-soft)' }}/>
              Sistema en vivo
            </span>
            <span className="mono" style={{ color: 'var(--text-dim)' }}>
              {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </p>
        </div>
        <div className="page-head-right">
          <button className="btn" onClick={() => onAskAi && onAskAi('errors')}>
            <Icon name="sparkles" size={13}/>
            Resumir con IA
          </button>
          <button className="btn primary">
            <Icon name="download" size={13}/>
            Exportar
          </button>
        </div>
      </div>

      {/* Critical alerts strip */}
      {criticalAlerts.length > 0 && (
        <div style={{
          marginBottom: 16,
          padding: '10px 14px 10px 14px',
          background: 'linear-gradient(90deg, rgba(239,68,68,0.10), rgba(239,68,68,0.02))',
          border: '1px solid rgba(239,68,68,0.28)',
          borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--err-soft)', color: 'var(--err)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="alert" size={15}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
              {criticalAlerts.length} alerta{criticalAlerts.length>1?'s':''} crítica{criticalAlerts.length>1?'s':''} requiere{criticalAlerts.length>1?'n':''} atención
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 2 }}>
              {criticalAlerts.map(a => a.title).join(' · ')}
            </div>
          </div>
          <button className="btn sm" onClick={() => onAskAi && onAskAi('errors')}>
            <Icon name="sparkles" size={11}/>Investigar
          </button>
        </div>
      )}

      {/* KPI row */}
      <div className="kpis">
        <KPI
          label="MRR Total"
          value={<span className={pulse.mrr ? 'flash' : ''} style={{ borderRadius: 4, padding: '0 4px' }}>{fmtMoney(D.STATS.mrr)}<small> / mo</small></span>}
          delta={D.STATS.mrrGrowth} deltaLabel="vs mes anterior"
          accent="var(--iris-500)"
          icon="dollar"
          spark={<Sparkline data={mrrSpark} color="var(--iris-400)" width={180} height={28} fill dot/>}
        />
        <KPI
          label="Marcas activas"
          value={<span className={pulse.active ? 'flash' : ''} style={{ borderRadius: 4, padding: '0 4px' }}>{D.STATS.active}<small> / {D.STATS.total}</small></span>}
          delta={6.4} deltaLabel="netas este mes"
          accent="var(--ok)"
          icon="users"
          spark={<Sparkline data={activeSpark} color="var(--ok)" width={180} height={28} fill dot/>}
        />
        <KPI
          label="Conversión trial→paid"
          value={D.STATS.conversion + '%'}
          delta={3.1} deltaLabel="vs cohorte previa"
          accent="var(--info)"
          icon="trend-up"
          sub={`${D.STATS.trial} en trial`}
        />
        <KPI
          label="ARPU · Churn"
          value={<span>{fmtMoney(D.STATS.arpu)}<small style={{ color: 'var(--err)' }}> · {D.STATS.churn}%</small></span>}
          delta={-0.4} deltaLabel="churn vs mes ant."
          accent="var(--warn)"
          icon="zap"
        />
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* MRR chart */}
        <Card
          title="Evolución MRR · por plan"
          subtitle="7 últimos meses · USD/mes"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Legend items={[
                { color: '#f59e0b', label: 'Unlimited' },
                { color: '#7c3aed', label: 'Pro' },
                { color: '#3b82f6', label: 'Basic' },
              ]}/>
            </div>
          }
        >
          <MrrStackedBar data={D.MRR_HISTORY} height={220}/>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-1)' }}>
            <PlanRevenue color="#3b82f6" label="Basic"     mrr={D.STATS.planTotals.basic} subs={D.TENANTS.filter(t=>t.plan.id==='pl-bas'&&t.subscription.status==='ACTIVE').length}/>
            <PlanRevenue color="#7c3aed" label="Pro"       mrr={D.STATS.planTotals.pro}   subs={D.TENANTS.filter(t=>t.plan.id==='pl-pro'&&t.subscription.status==='ACTIVE').length} featured/>
            <PlanRevenue color="#f59e0b" label="Unlimited" mrr={D.STATS.planTotals.unl}   subs={D.TENANTS.filter(t=>t.plan.id==='pl-unl'&&t.subscription.status==='ACTIVE').length}/>
          </div>
        </Card>

        {/* Live activity */}
        <Card
          title="Actividad reciente"
          subtitle="Streaming · últimos eventos"
          action={<span className="pill ok"><span className="dot"/>LIVE</span>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, margin: '-6px -2px' }}>
            {recent.map((e, i) => (
              <ActivityItem key={e.id + tick} ev={e} onClick={() => onOpenTenant(e.tenantId)}/>
            ))}
          </div>
          <div style={{ paddingTop: 12, marginTop: 8, borderTop: '1px solid var(--border-1)', textAlign: 'center' }}>
            <a className="btn ghost sm" style={{ color: 'var(--iris-400)' }}>
              Ver todos los logs
              <Icon name="arrow-right" size={11}/>
            </a>
          </div>
        </Card>
      </div>

      {/* Funnel + Cohort */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title="Funnel · Trial → Conversión" subtitle="Cohorte últimos 90 días" action={<Icon name="funnel" size={14} style={{ color: 'var(--text-dim)' }}/>}>
          <Funnel steps={D.FUNNEL}/>
          <div style={{ marginTop: 12, padding: 10, background: 'var(--surf-2)', borderRadius: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
            <Icon name="info" size={11} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--iris-400)' }}/>
            Mayor fuga: <strong style={{ color: 'var(--text)' }}>Primer venta → Conversión</strong> (–32 pts). Acción IA: nurturing automático en día 7 y 12.
          </div>
        </Card>
        <Card title="Retención por cohorte" subtitle="% de tenants que siguen activos · semanal" action={<Icon name="cohort" size={14} style={{ color: 'var(--text-dim)' }}/>}>
          <CohortHeatmap cohorts={D.COHORTS}/>
        </Card>
      </div>

      {/* LATAM map + Top tenants */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title="Distribución en LATAM" subtitle={`${D.TENANTS.length} marcas · ${Object.keys(D.LATAM_COUNTS).length} países`} action={<Icon name="map" size={14} style={{ color: 'var(--text-dim)' }}/>}>
          <LatamMap counts={D.LATAM_COUNTS}/>
        </Card>
        <Card title="Top marcas por MRR" subtitle="Activas · últimos 30 días" flush>
          <div>
            {topTenants.map((t, i) => (
              <div key={t.id} onClick={() => onOpenTenant(t.id)}
                   style={{
                     display: 'flex', alignItems: 'center', gap: 10,
                     padding: '10px 16px',
                     borderBottom: i < topTenants.length - 1 ? '1px solid var(--border-1)' : 'none',
                     cursor: 'pointer',
                   }}>
                <div className="mono" style={{ width: 18, fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>
                  {String(i+1).padStart(2,'0')}
                </div>
                <Avatar tenant={t} size={26}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
                    {t.countryName} · {t.locations} sucursal{t.locations>1?'es':''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{fmtMoney(t.subscription.mrr)}</div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--ok)' }}>+{Math.floor(Math.random()*15+5)}% mo/mo</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Alerts list */}
      <Card title="Alertas SLA" subtitle="Eventos críticos y warnings con seguimiento" action={
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn ghost sm"><Icon name="pause-circ" size={12}/>Pausar</button>
          <button className="btn ghost sm"><Icon name="refresh" size={12}/>Actualizar</button>
        </div>
      } flush>
        <div>
          {D.ALERTS.map((a, i) => (
            <AlertRow key={a.id} alert={a} last={i === D.ALERTS.length-1}/>
          ))}
        </div>
      </Card>
    </div>
  );
};

const Legend = ({ items }) => (
  <div style={{ display: 'flex', gap: 12 }}>
    {items.map((it, i) => (
      <div key={i} className="row" style={{ gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: it.color }}/>
        <span>{it.label}</span>
      </div>
    ))}
  </div>
);

const PlanRevenue = ({ color, label, mrr, subs, featured }) => (
  <div style={{
    padding: '10px 12px',
    borderRadius: 8,
    background: featured ? 'var(--iris-soft)' : 'var(--surf-2)',
    border: featured ? '1px solid rgba(124,58,237,0.25)' : '1px solid var(--border-1)',
    position: 'relative',
  }}>
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <div className="row" style={{ gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: color }}/>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      </div>
      {featured && <span className="pill" style={{ fontSize: 8.5, padding: '1px 6px' }}>POPULAR</span>}
    </div>
    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, color: 'var(--text)', marginTop: 4, letterSpacing: '-0.02em' }}>
      {fmtMoney(mrr)}
    </div>
    <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
      {subs} suscriptores
    </div>
  </div>
);

const ACT_ICON = {
  register:  { i: 'plus',      c: 'var(--info)'  },
  activated: { i: 'check',     c: 'var(--ok)'    },
  payment:   { i: 'dollar',    c: 'var(--ok)'    },
  trial_end: { i: 'clock',     c: 'var(--warn)'  },
  failed:    { i: 'alert',     c: 'var(--err)'   },
  upgrade:   { i: 'trend-up',  c: 'var(--ok)'    },
  churn:     { i: 'flame',     c: 'var(--err)'   },
  ai:        { i: 'sparkles',  c: 'var(--iris-400)' },
};

const ActivityItem = ({ ev, onClick }) => {
  const I = ACT_ICON[ev.type] || { i: 'info', c: 'var(--text-dim)' };
  return (
    <div onClick={onClick} className="flash" style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '9px 6px', borderBottom: '1px solid var(--border-1)',
      cursor: 'pointer', borderRadius: 6,
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 6,
        background: `color-mix(in oklch, ${I.c} 14%, transparent)`,
        color: I.c, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={I.i} size={12}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.3 }}>
          <strong>{ev.tenant}</strong> · {ev.text}
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
          {ev.sub}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', whiteSpace: 'nowrap', paddingTop: 2 }}>
        {timeAgo(ev.ts)}
      </div>
    </div>
  );
};

const AlertRow = ({ alert, last }) => {
  const kind = alert.sev === 'critical' ? 'err' : 'warn';
  const icon = alert.sev === 'critical' ? 'alert' : 'clock';
  const color = alert.sev === 'critical' ? 'var(--err)' : 'var(--warn)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 18px',
      borderBottom: last ? 'none' : '1px solid var(--border-1)',
      opacity: alert.ack ? 0.55 : 1,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: `color-mix(in oklch, ${color} 16%, transparent)`,
        color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={icon} size={14}/>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{alert.title}</span>
          <span className={`pill ${kind}`} style={{ fontSize: 8.5 }}>{alert.sev}</span>
          {alert.ack && <span className="pill muted" style={{ fontSize: 8.5 }}>ACK</span>}
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: 3 }}>
          {alert.desc}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{alert.age}</div>
      {!alert.ack && (
        <button className="btn sm ghost"><Icon name="check" size={11}/>ACK</button>
      )}
    </div>
  );
};

window.Overview = Overview;
