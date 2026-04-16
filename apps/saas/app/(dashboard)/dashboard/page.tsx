"use client";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";
import MrrChart from "@/components/MrrChart";
import api from "@/lib/api";

// ── Icons ─────────────────────────────────────────────────────
const ICheck = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2.5 8 6.5 12 13.5 4"/>
  </svg>
);
const IMoon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M13.5 10A6 6 0 016 2.5a6 6 0 100 11 6 6 0 007.5-3.5z"/>
  </svg>
);
const ISun = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="3"/>
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
  </svg>
);
const ITrendUp = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2 11 6 7 9.5 9.5 14 4"/>
    <polyline points="10 4 14 4 14 8"/>
  </svg>
);
const ITrendDown = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2 5 6 9 9.5 6.5 14 12"/>
    <polyline points="10 12 14 12 14 8"/>
  </svg>
);

export default function SaasDashboardPage() {
  const { theme, setTheme } = useTheme();
  const [prices, setPrices] = useState({ basic: 2, pro: 5, unlimited: 20, trial: 15 });
  const [toastVisible, setToastVisible] = useState(false);
  const [toggles, setToggles] = useState({
    registro:     true,
    trial:        true,
    mantenimiento: false,
    whatsapp:     true,
  });
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500);
  }

  useEffect(() => {
    async function fetchAll() {
      try {
        const [mrrRes, tenantsRes, plansRes] = await Promise.all([
          api.get("/api/saas/mrr").catch(() => ({ data: { mrr: 0, growth: 0 } })),
          api.get("/api/saas/tenants").catch(() => ({ data: [] })),
          api.get("/api/saas/plans").catch(() => ({ data: [] })),
        ]);
        const tenants: any[] = tenantsRes.data;
        const active = tenants.filter((t: any) => t.subscription?.status === "ACTIVE").length;
        const trial  = tenants.filter((t: any) => t.subscription?.status === "TRIAL").length;
        setStats({
          mrr:    mrrRes.data.mrr    || 0,
          growth: mrrRes.data.growth || 0,
          active,
          trial,
          total: tenants.length,
        });
        if (plansRes.data.length > 0) {
          const p = plansRes.data.reduce((acc: any, plan: any) => {
            if (plan.name?.toLowerCase().includes("basic")) acc.basic = plan.price;
            if (plan.name?.toLowerCase().includes("pro") || plan.name?.toLowerCase().includes("standard")) acc.pro = plan.price;
            if (plan.name?.toLowerCase().includes("unlim") || plan.name?.toLowerCase().includes("premium")) acc.unlimited = plan.price;
            return acc;
          }, { basic: 2, pro: 5, unlimited: 20, trial: 15 });
          setPrices(p);
        }
      } finally {
        setLoadingStats(false);
      }
    }
    fetchAll();
  }, []);

  const handleSave = async () => {
    try { await api.put("/api/saas/plans/prices", prices); }
    catch (err) { console.error("Error guardando ajustes", err); }
    finally { showToast(); }
  };

  const toggleFeature = (key: keyof typeof toggles) =>
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));

  // ── Derived ──────────────────────────────────────────────────
  const growth   = stats?.growth ?? 0;
  const growthUp = growth >= 0;

  const METRICS = [
    {
      label: "MRR Total",
      value: loadingStats ? "—" : `$${(stats?.mrr || 0).toFixed(0)}`,
      sub: "USD / mes",
      delta: loadingStats ? null : `${growthUp ? "+" : ""}${growth.toFixed(1)}% vs mes ant.`,
      deltaUp: growthUp,
      accent: "var(--orange)",
    },
    {
      label: "Marcas activas",
      value: loadingStats ? "—" : String(stats?.active ?? 0),
      sub: "suscripciones live",
      delta: loadingStats ? null : `${stats?.total ?? 0} total registradas`,
      deltaUp: true,
      accent: "var(--green)",
    },
    {
      label: "Total marcas",
      value: loadingStats ? "—" : String(stats?.total ?? 0),
      sub: "en la plataforma",
      delta: null,
      deltaUp: true,
      accent: "var(--blue)",
    },
    {
      label: "En período prueba",
      value: loadingStats ? "—" : String(stats?.trial ?? 0),
      sub: "por convertir",
      delta: null,
      deltaUp: false,
      accent: "var(--amber)",
    },
  ];

  const TOGGLES = [
    { key: "registro",      label: "Registro libre",       desc: "Nuevas marcas sin aprobación manual" },
    { key: "trial",         label: "Trial automático",     desc: "Al registrarse inicia período gratis" },
    { key: "mantenimiento", label: "Modo mantenimiento",   desc: "Bloquea acceso a todos los TPV" },
    { key: "whatsapp",      label: "Notif. WhatsApp",      desc: "Whapi.cloud activo globalmente" },
  ] as const;

  const ACTIVITY = [
    { color: "var(--green)", text: <><strong>Tacos El Rey</strong> se suscribió al plan Pro</>,       time: "hace 4 min" },
    { color: "var(--amber)", text: <><strong>Burger House MX</strong> — trial vence en 24 h</>,       time: "hace 1 h" },
    { color: "var(--orange)", text: <>Precio Pro actualizado a <strong>$5 USD</strong></>,            time: "hace 3 h" },
    { color: "var(--red)",   text: <><strong>Sushi Central</strong> canceló suscripción</>,           time: "ayer" },
  ];

  return (
    <>
      {/* ── Status bar ── */}
      <div className="db-status-bar">
        <div className="db-status-dot"/>
        <span className="db-status-text">
          Todos los servicios operativos — último check hace 2 min
        </span>
      </div>

      {/* ── Topbar ── */}
      <div className="db-topbar">
        <div className="db-topbar-left">
          <h1>Ajustes globales</h1>
          <p>Configuración que aplica a todos los restaurantes en la plataforma</p>
        </div>
        <div className="db-topbar-right">
          {/* Theme toggle */}
          <div className="db-theme-toggle">
            <div className={`db-theme-opt ${theme === "dark" ? "active" : ""}`}
              onClick={() => setTheme("dark")} title="Tema oscuro">
              <IMoon/>
            </div>
            <div className={`db-theme-opt ${theme === "light" ? "active" : ""}`}
              onClick={() => setTheme("light")} title="Tema claro">
              <ISun/>
            </div>
          </div>
          {/* Tabs */}
          <div className="db-tabs">
            <div className="db-tab active">Planes</div>
            <div className="db-tab">Integraciones</div>
            <div className="db-tab">Seguridad</div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="db-content">

        {/* ── KPI row ── */}
        <div className="db-metrics">
          {METRICS.map(m => (
            <div key={m.label} className={`db-metric-card c-${
              m.accent === "var(--orange)" ? "orange" :
              m.accent === "var(--green)"  ? "green"  :
              m.accent === "var(--blue)"   ? "blue"   : "amber"
            }`}>
              <div className="db-metric-label">{m.label}</div>
              <div className="db-metric-value">{m.value}</div>
              <div className="db-metric-footer">
                {m.delta ? (
                  <span className={`db-metric-delta ${m.deltaUp ? "db-delta-up" : "db-delta-down"}`}
                    style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {m.deltaUp ? <ITrendUp/> : <ITrendDown/>}
                    {m.delta}
                  </span>
                ) : (
                  <span className="db-metric-delta" style={{ color: "var(--text3)" }}>
                    {m.sub}
                  </span>
                )}
                <span className="db-metric-sub">{m.delta ? m.sub : ""}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main grid ── */}
        <div className="db-grid3">

          {/* ── Planes config ── */}
          <div className="db-card">
            <div className="db-card-header">
              <div>
                <div className="db-card-title">Configuración de planes</div>
                <div className="db-card-sub">Precios visibles a nuevos restaurantes</div>
              </div>
              <span className="db-badge db-badge-green">Live</span>
            </div>

            {/* Plan cards */}
            <div className="db-plans-grid">
              {[
                { name: "Basic",     price: prices.basic,     feat: "Hasta 3 empleados", subs: 24, featured: false },
                { name: "Pro",       price: prices.pro,       feat: "Hasta 10 empleados", subs: 31, featured: true },
                { name: "Unlimited", price: prices.unlimited, feat: "Sin límites",         subs: 7,  featured: false },
              ].map(plan => (
                <div key={plan.name} className={`db-plan-card${plan.featured ? " featured" : ""}`}>
                  {plan.featured && <div className="db-plan-hot">Popular</div>}
                  <div className="db-plan-name">{plan.name}</div>
                  <div className="db-plan-price">
                    ${plan.price}<span> /mes</span>
                  </div>
                  <div className="db-plan-feature-tag">{plan.feat}</div>
                  <div className="db-plan-stat">
                    <span className="db-plan-stat-label">Suscritos</span>
                    <span className="db-plan-stat-val">{plan.subs}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Editar precios */}
            <div style={{ borderTop: "1px solid var(--border)", padding: "14px 18px 18px" }}>
              <div style={{
                fontSize: 10, color: "var(--text3)", letterSpacing: 1.2,
                textTransform: "uppercase", fontWeight: 700, marginBottom: 12,
              }}>
                Editar precios
              </div>
              <div className="db-settings-grid">
                {([
                  { label: "Plan Basic",    key: "basic",    prefix: "USD", step: 0.5 },
                  { label: "Plan Pro",      key: "pro",      prefix: "USD", step: 0.5 },
                  { label: "Plan Unlimited",key: "unlimited",prefix: "USD", step: 1 },
                  { label: "Días de prueba",key: "trial",    prefix: "días",step: 1 },
                ] as const).map(f => (
                  <div key={f.key} className="db-field">
                    <label htmlFor={`field-${f.key}`}>{f.label}</label>
                    <div className="db-field-wrap">
                      <span className="db-field-prefix">{f.prefix}</span>
                      <input
                        id={`field-${f.key}`}
                        type="number"
                        value={prices[f.key]}
                        min={0}
                        step={f.step}
                        onChange={e => setPrices(p => ({ ...p, [f.key]: +e.target.value }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="db-btn db-btn-orange"
                style={{ marginTop: 14, width: "100%" }}
                onClick={handleSave}
              >
                Guardar ajustes globales
              </button>
            </div>
          </div>

          {/* ── Right column ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Feature toggles */}
            <div className="db-card">
              <div className="db-card-header">
                <div className="db-card-title">Funciones globales</div>
                <span className="db-badge db-badge-blue">Sistema</span>
              </div>
              <div className="db-card-body" style={{ padding: "4px 18px 4px" }}>
                {TOGGLES.map(({ key, label, desc }) => (
                  <div key={key} className="db-toggle-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="db-toggle-label">{label}</div>
                      <div className="db-toggle-desc">{desc}</div>
                    </div>
                    <div
                      className={`db-toggle ${toggles[key] ? "on" : ""}`}
                      onClick={() => toggleFeature(key)}
                      role="switch"
                      aria-checked={toggles[key]}
                      aria-label={label}
                      tabIndex={0}
                      onKeyDown={e => e.key === " " && toggleFeature(key)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Activity feed */}
            <div className="db-card" style={{ flex: 1 }}>
              <div className="db-card-header">
                <div className="db-card-title">Actividad reciente</div>
                <span className="db-badge db-badge-green">Live</span>
              </div>
              <div className="db-activity-list">
                {ACTIVITY.map((item, i) => (
                  <div key={i} className="db-activity-item">
                    <div className="db-activity-dot" style={{ background: item.color }}/>
                    <div>
                      <div className="db-activity-text">{item.text}</div>
                      <span className="db-activity-time">{item.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ── MRR Chart ── */}
        <MrrChart />
      </div>

      {/* ── Toast ── */}
      <div className={`db-toast ${toastVisible ? "show" : ""}`}>
        <ICheck/>
        Ajustes guardados
      </div>
    </>
  );
}
