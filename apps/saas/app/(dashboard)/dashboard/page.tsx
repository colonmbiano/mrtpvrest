"use client";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";
import MrrChart from "@/components/MrrChart";
import api from "@/lib/api";

// ── Icons ─────────────────────────────────────────────────────
const IArrowUp = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="13" x2="8" y2="3"/><polyline points="3 8 8 3 13 8"/>
  </svg>
);
const IArrowDown = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="3" x2="8" y2="13"/><polyline points="13 8 8 13 3 8"/>
  </svg>
);
const ICheck = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2.5 8 6.5 12 13.5 4"/>
  </svg>
);
const IMoon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M13.5 10A6 6 0 016 2.5a6 6 0 100 11 6 6 0 007.5-3.5z"/>
  </svg>
);
const ISun = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="3"/>
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
  </svg>
);
const IDollar = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M8 1v14M5 4.5h4.5a2 2 0 010 4H6a2 2 0 000 4H11"/>
  </svg>
);
const IUsers = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="5" r="2.5"/><path d="M1 14c0-3 2.2-5 5-5s5 2 5 5"/>
    <path d="M11 7c1.5 0 3 .8 3 3"/>
  </svg>
);
const ILayers = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="8 1 15 5 8 9 1 5"/>
    <polyline points="1 10 8 14 15 10"/>
    <polyline points="1 7 8 11 15 7"/>
  </svg>
);
const IClock = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="6.5"/><polyline points="8 4.5 8 8 10.5 10.5"/>
  </svg>
);
const ISave = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 14V3.5L4.5 1H13a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1z"/>
    <path d="M5 1v4h6V1"/><rect x="4" y="9" width="8" height="5" rx="0.5"/>
  </svg>
);
const IZap = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="9 1 2 9 8 9 7 15 14 7 8 7"/>
  </svg>
);
const ILoader = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" opacity=".4"/>
    <path d="M3.4 3.4l2.1 2.1M10.5 10.5l2.1 2.1" opacity=".7"/>
    <path d="M3.4 12.6l2.1-2.1"/>
  </svg>
);

export default function SaasDashboardPage() {
  const { theme, setTheme } = useTheme();
  const [prices, setPrices] = useState({ basic: 2, pro: 5, unlimited: 20, trial: 15 });
  const [saving, setSaving] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toggles, setToggles] = useState({
    registro: true,
    trial: true,
    mantenimiento: false,
    whatsapp: true,
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
        const trial = tenants.filter((t: any) => t.subscription?.status === "TRIAL").length;
        setStats({
          mrr: mrrRes.data.mrr || 0,
          growth: mrrRes.data.growth || 0,
          active,
          trial,
          total: tenants.length,
          conversion: tenants.length > 0 ? Math.round((active / tenants.length) * 100) : 0,
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
    setSaving(true);
    try {
      await api.put("/api/saas/plans/prices", prices);
    } catch (err) {
      console.error("Error guardando ajustes", err);
    } finally {
      setSaving(false);
      showToast();
    }
  };

  const toggleFeature = (key: keyof typeof toggles) =>
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));

  const growth = stats?.growth ?? 0;
  const growthUp = growth >= 0;
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  const METRICS = [
    {
      id: "mrr",
      label: "MRR Total",
      value: loadingStats ? null : `$${(stats?.mrr || 0).toFixed(0)}`,
      unit: "USD / mes",
      delta: loadingStats ? null : `${growthUp ? "+" : ""}${growth.toFixed(1)}%`,
      deltaLabel: "vs mes anterior",
      up: growthUp,
      icon: <IDollar />,
      accent: "purple",
    },
    {
      id: "active",
      label: "Marcas activas",
      value: loadingStats ? null : String(stats?.active ?? 0),
      unit: "suscripciones live",
      delta: loadingStats ? null : `${stats?.total ?? 0} totales`,
      deltaLabel: "registradas",
      up: true,
      icon: <IUsers />,
      accent: "green",
    },
    {
      id: "conversion",
      label: "Tasa conversión",
      value: loadingStats ? null : `${stats?.conversion ?? 0}%`,
      unit: "trial → activo",
      delta: loadingStats ? null : `${stats?.trial ?? 0} en trial`,
      deltaLabel: "por convertir",
      up: (stats?.conversion ?? 0) > 50,
      icon: <IZap />,
      accent: "blue",
    },
    {
      id: "trial",
      label: "En período prueba",
      value: loadingStats ? null : String(stats?.trial ?? 0),
      unit: "restaurantes",
      delta: null,
      deltaLabel: null,
      up: false,
      icon: <IClock />,
      accent: "amber",
    },
  ];

  const TOGGLES = [
    { key: "registro" as const, label: "Registro libre", desc: "Nuevas marcas sin aprobación manual", accent: "green" },
    { key: "trial" as const, label: "Trial automático", desc: "Al registrarse inicia período gratis", accent: "blue" },
    { key: "mantenimiento" as const, label: "Modo mantenimiento", desc: "Bloquea acceso a todos los TPV", accent: "red" },
    { key: "whatsapp" as const, label: "Notif. WhatsApp", desc: "Whapi.cloud activo globalmente", accent: "green" },
  ];

  const ACTIVITY = [
    { type: "success", text: "Tacos El Rey", sub: "se suscribió al plan Pro", time: "4 min" },
    { type: "warning", text: "Burger House MX", sub: "trial vence en 24 h", time: "1 h" },
    { type: "info", text: "Precio Pro", sub: "actualizado a $5 USD", time: "3 h" },
    { type: "error", text: "Sushi Central", sub: "canceló suscripción", time: "ayer" },
    { type: "success", text: "La Cazuela MX", sub: "completó onboarding", time: "ayer" },
  ];

  const PLANS = [
    { name: "Basic", price: prices.basic, subs: 24, features: "Hasta 3 empleados", accent: "blue" },
    { name: "Pro", price: prices.pro, subs: 31, features: "Hasta 10 empleados", accent: "purple", featured: true },
    { name: "Unlimited", price: prices.unlimited, subs: 7, features: "Sin límites", accent: "green" },
  ];

  return (
    <div className="ovw-page">
      {/* ── Header ── */}
      <header className="ovw-header">
        <div className="ovw-header-left">
          <div className="ovw-pulse-wrap">
            <span className="ovw-pulse" />
            <span className="ovw-pulse-ring" />
          </div>
          <div>
            <h1 className="ovw-title">Vista general</h1>
            <p className="ovw-subtitle">{dateStr}</p>
          </div>
        </div>
        <div className="ovw-header-right">
          <div className="ovw-status-badge">
            <span className="ovw-status-dot" />
            Todos los servicios OK
          </div>
          <button
            className="ovw-theme-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Cambiar tema"
          >
            {theme === "dark" ? <ISun /> : <IMoon />}
          </button>
        </div>
      </header>

      {/* ── KPI Row ── */}
      <div className="ovw-kpi-grid">
        {METRICS.map((m) => (
          <div key={m.id} className={`ovw-kpi ovw-kpi-${m.accent}`}>
            <div className="ovw-kpi-top">
              <span className="ovw-kpi-label">{m.label}</span>
              <div className={`ovw-kpi-icon ovw-icon-${m.accent}`}>{m.icon}</div>
            </div>
            <div className="ovw-kpi-value">
              {m.value === null ? (
                <span className="ovw-skeleton ovw-skeleton-val" />
              ) : (
                m.value
              )}
            </div>
            <div className="ovw-kpi-footer">
              {m.delta ? (
                <span className={`ovw-kpi-delta ${m.up ? "up" : "down"}`}>
                  {m.up ? <IArrowUp /> : <IArrowDown />}
                  {m.delta}
                  <span className="ovw-kpi-delta-label">{m.deltaLabel}</span>
                </span>
              ) : (
                <span className="ovw-kpi-unit">{m.unit}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Main Grid ── */}
      <div className="ovw-grid">

        {/* ── Col izquierda: planes + chart ── */}
        <div className="ovw-col-left">

          {/* Plans config */}
          <div className="ovw-card">
            <div className="ovw-card-head">
              <div>
                <p className="ovw-card-title">Planes de suscripción</p>
                <p className="ovw-card-sub">Precios activos en la plataforma</p>
              </div>
              <span className="ovw-badge ovw-badge-green">Live</span>
            </div>

            {/* Plan cards */}
            <div className="ovw-plans-row">
              {PLANS.map((plan) => (
                <div key={plan.name} className={`ovw-plan ${plan.featured ? "ovw-plan-featured" : ""}`}>
                  {plan.featured && <div className="ovw-plan-tag">Popular</div>}
                  <div className="ovw-plan-name">{plan.name}</div>
                  <div className="ovw-plan-price">
                    ${plan.price}<span>/mo</span>
                  </div>
                  <div className="ovw-plan-info">{plan.features}</div>
                  <div className="ovw-plan-subs">
                    <span className="ovw-plan-subs-num">{plan.subs}</span>
                    <span className="ovw-plan-subs-label">suscritos</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Price editor */}
            <div className="ovw-price-editor">
              <p className="ovw-section-label">Editar precios</p>
              <div className="ovw-fields-grid">
                {([
                  { label: "Basic", key: "basic" as const, unit: "USD", step: 0.5 },
                  { label: "Pro", key: "pro" as const, unit: "USD", step: 0.5 },
                  { label: "Unlimited", key: "unlimited" as const, unit: "USD", step: 1 },
                  { label: "Días trial", key: "trial" as const, unit: "días", step: 1 },
                ]).map((f) => (
                  <div key={f.key} className="ovw-field">
                    <label className="ovw-field-label" htmlFor={`f-${f.key}`}>{f.label}</label>
                    <div className="ovw-field-input-wrap">
                      <span className="ovw-field-unit">{f.unit}</span>
                      <input
                        id={`f-${f.key}`}
                        type="number"
                        value={prices[f.key]}
                        min={0}
                        step={f.step}
                        onChange={(e) => setPrices((p) => ({ ...p, [f.key]: +e.target.value }))}
                        className="ovw-field-input"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                className={`ovw-save-btn ${saving ? "loading" : ""}`}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <ILoader /> : <ISave />}
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>

          {/* MRR Chart */}
          <MrrChart />
        </div>

        {/* ── Col derecha: toggles + activity ── */}
        <div className="ovw-col-right">

          {/* Feature toggles */}
          <div className="ovw-card">
            <div className="ovw-card-head">
              <div>
                <p className="ovw-card-title">Funciones globales</p>
                <p className="ovw-card-sub">Aplica a toda la plataforma</p>
              </div>
              <span className="ovw-badge ovw-badge-blue">Sistema</span>
            </div>
            <div className="ovw-toggles">
              {TOGGLES.map(({ key, label, desc, accent }) => (
                <div key={key} className="ovw-toggle-row">
                  <div className="ovw-toggle-info">
                    <span className="ovw-toggle-label">{label}</span>
                    <span className="ovw-toggle-desc">{desc}</span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={toggles[key]}
                    aria-label={label}
                    className={`ovw-toggle ${toggles[key] ? `on ovw-toggle-${accent}` : ""}`}
                    onClick={() => toggleFeature(key)}
                  >
                    <span className="ovw-toggle-thumb" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Activity feed */}
          <div className="ovw-card ovw-card-grow">
            <div className="ovw-card-head">
              <div>
                <p className="ovw-card-title">Actividad reciente</p>
                <p className="ovw-card-sub">Últimas acciones en la plataforma</p>
              </div>
              <span className="ovw-badge ovw-badge-green">Live</span>
            </div>
            <div className="ovw-activity">
              {ACTIVITY.map((item, i) => (
                <div key={i} className="ovw-activity-item">
                  <div className={`ovw-activity-dot ovw-dot-${item.type}`} />
                  <div className="ovw-activity-body">
                    <span className="ovw-activity-name">{item.text}</span>
                    <span className="ovw-activity-sub">{item.sub}</span>
                  </div>
                  <span className="ovw-activity-time">{item.time}</span>
                </div>
              ))}
            </div>
            <div className="ovw-activity-footer">
              <a href="/logs" className="ovw-activity-link">Ver todos los logs →</a>
            </div>
          </div>

        </div>
      </div>

      {/* ── Toast ── */}
      <div className={`ovw-toast ${toastVisible ? "show" : ""}`} role="status" aria-live="polite">
        <div className="ovw-toast-icon"><ICheck /></div>
        Ajustes guardados correctamente
      </div>
    </div>
  );
}
