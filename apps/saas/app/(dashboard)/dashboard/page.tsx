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

interface PlanRow { id: string; name?: string; displayName: string; price: number; trialDays?: number }
type ActivityEntry = { type: string; text: string; sub: string; time: string; ts: number };

function buildDashboardActivity(tenants: any[]): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  const now = Date.now();
  function rel(iso: string) {
    const d = now - new Date(iso).getTime();
    const m = Math.floor(d / 60000); const h = Math.floor(d / 3600000); const days = Math.floor(d / 86400000);
    if (m < 1) return "ahora"; if (m < 60) return `${m} min`; if (h < 24) return `${h} h`;
    if (days < 7) return `${days}d`; return new Date(iso).toLocaleDateString("es-MX", { day:"2-digit", month:"short" });
  }
  for (const t of tenants) {
    out.push({
      type: "success",
      text: t.name,
      sub: `se registró · plan ${t.subscription?.plan?.displayName ?? "—"}`,
      time: rel(t.createdAt),
      ts: new Date(t.createdAt).getTime(),
    });
    const status = t.subscription?.status;
    const trialEndsAt = t.subscription?.trialEndsAt;
    if (status === "TRIAL" && trialEndsAt) {
      const days = Math.ceil((new Date(trialEndsAt).getTime() - now) / 86400000);
      if (days >= 0 && days <= 3) {
        out.push({ type: "warning", text: t.name, sub: `trial vence en ${days}d`, time: rel(new Date().toISOString()), ts: now });
      }
    }
    if (status === "EXPIRED") {
      out.push({ type: "error", text: t.name, sub: "trial expirado sin conversión", time: rel(trialEndsAt ?? t.createdAt), ts: new Date(trialEndsAt ?? t.createdAt).getTime() });
    }
    if (status === "SUSPENDED") {
      out.push({ type: "error", text: t.name, sub: "cuenta suspendida", time: rel(trialEndsAt ?? t.createdAt), ts: new Date(trialEndsAt ?? t.createdAt).getTime() });
    }
    if (status === "CANCELLED") {
      out.push({ type: "error", text: t.name, sub: "canceló suscripción", time: rel(trialEndsAt ?? t.createdAt), ts: new Date(trialEndsAt ?? t.createdAt).getTime() });
    }
  }
  return out.sort((a, b) => b.ts - a.ts).slice(0, 5);
}

export default function SaasDashboardPage() {
  const { theme, setTheme } = useTheme();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [planSubs, setPlanSubs] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("Ajustes guardados correctamente");
  const [toggles, setToggles] = useState({
    openRegistration: true,
    autoTrial: true,
    maintenanceMode: false,
    whatsappEnabled: true,
  });
  const [togglesLoaded, setTogglesLoaded] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg?: string) {
    if (msg) setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500);
  }

  useEffect(() => {
    async function fetchAll() {
      try {
        const [mrrRes, tenantsRes, plansRes, configRes] = await Promise.all([
          api.get("/api/saas/mrr").catch(() => ({ data: { mrr: 0, growth: null, byPlan: {} } })),
          api.get("/api/saas/tenants").catch(() => ({ data: [] })),
          api.get("/api/saas/plans").catch(() => ({ data: [] })),
          api.get("/api/admin/global-config").catch(() => ({ data: null })),
        ]);
        const tenants: any[] = tenantsRes.data;
        const active = tenants.filter((t: any) => t.subscription?.status === "ACTIVE").length;
        const trial  = tenants.filter((t: any) => t.subscription?.status === "TRIAL").length;
        setStats({
          mrr: mrrRes.data.mrr || 0,
          growth: mrrRes.data.growth,
          active,
          trial,
          total: tenants.length,
          conversion: tenants.length > 0 ? Math.round((active / tenants.length) * 100) : 0,
        });
        setActivity(buildDashboardActivity(tenants));

        const byPlan: Record<string, { count: number }> = mrrRes.data.byPlan || {};
        const planRows: PlanRow[] = plansRes.data;
        setPlans(planRows);
        setPrices(Object.fromEntries(planRows.map(p => [p.id, p.price])));
        setPlanSubs(
          Object.fromEntries(
            planRows.map(p => [p.id, byPlan[(p.name || p.displayName || "").toUpperCase()]?.count ?? 0])
          )
        );

        if (configRes.data) {
          setToggles({
            openRegistration: !!configRes.data.openRegistration,
            autoTrial:        !!configRes.data.autoTrial,
            maintenanceMode:  !!configRes.data.maintenanceMode,
            whatsappEnabled:  !!configRes.data.whatsappEnabled,
          });
        }
        setTogglesLoaded(true);
      } finally {
        setLoadingStats(false);
      }
    }
    fetchAll();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        plans.map(p => {
          const next = prices[p.id];
          if (next == null || next === p.price) return null;
          return api.patch(`/api/saas/plans/${p.id}`, { price: next });
        }).filter(Boolean) as Promise<any>[]
      );
      showToast("Precios actualizados");
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Error al guardar precios");
    } finally {
      setSaving(false);
    }
  };

  const toggleFeature = async (key: keyof typeof toggles) => {
    if (!togglesLoaded) return;
    const next = { ...toggles, [key]: !toggles[key] };
    setToggles(next);
    try {
      await api.put("/api/admin/global-config", { [key]: next[key] });
    } catch (err: any) {
      setToggles(toggles); // revert
      showToast(err?.response?.data?.error || "Error al guardar toggle");
    }
  };

  const growth: number | null = stats?.growth ?? null;
  const hasGrowth = typeof growth === "number";
  const growthUp = hasGrowth && growth >= 0;
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  const METRICS = [
    {
      id: "mrr",
      label: "MRR Total",
      value: loadingStats ? null : `$${(stats?.mrr || 0).toFixed(0)}`,
      unit: "USD / mes",
      delta: loadingStats ? null : (hasGrowth ? `${growthUp ? "+" : ""}${growth!.toFixed(1)}%` : "—"),
      deltaLabel: hasGrowth ? "vs mes anterior" : "sin historia",
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
    { key: "openRegistration" as const, label: "Registro libre",      desc: "Nuevas marcas sin aprobación manual", accent: "green" },
    { key: "autoTrial" as const,        label: "Trial automático",     desc: "Al registrarse inicia período gratis", accent: "blue" },
    { key: "maintenanceMode" as const,  label: "Modo mantenimiento",   desc: "Bloquea acceso a todos los TPV",       accent: "red" },
    { key: "whatsappEnabled" as const,  label: "Notif. WhatsApp",      desc: "Whapi.cloud activo globalmente",       accent: "green" },
  ];

  const PLAN_ACCENTS = ["blue", "purple", "green", "amber"] as const;
  const PLANS = plans.map((p, i) => ({
    id: p.id,
    name: p.displayName,
    price: prices[p.id] ?? p.price,
    subs: planSubs[p.id] ?? 0,
    features: "",
    accent: PLAN_ACCENTS[i % PLAN_ACCENTS.length],
    featured: i === 1,
  }));

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
              {PLANS.length === 0 ? (
                <div className="ovw-plan" style={{ opacity: 0.5 }}>
                  <div className="ovw-plan-name">Sin planes</div>
                  <div className="ovw-plan-info">Crea un plan en Ajustes</div>
                </div>
              ) : PLANS.map((plan) => (
                <div key={plan.id} className={`ovw-plan ${plan.featured ? "ovw-plan-featured" : ""}`}>
                  {plan.featured && <div className="ovw-plan-tag">Popular</div>}
                  <div className="ovw-plan-name">{plan.name}</div>
                  <div className="ovw-plan-price">
                    ${plan.price}<span>/mo</span>
                  </div>
                  {plan.features && <div className="ovw-plan-info">{plan.features}</div>}
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
                {plans.map((p) => (
                  <div key={p.id} className="ovw-field">
                    <label className="ovw-field-label" htmlFor={`f-${p.id}`}>{p.displayName}</label>
                    <div className="ovw-field-input-wrap">
                      <span className="ovw-field-unit">USD</span>
                      <input
                        id={`f-${p.id}`}
                        type="number"
                        value={prices[p.id] ?? p.price}
                        min={0}
                        step={0.5}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [p.id]: +e.target.value }))}
                        className="ovw-field-input"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                className={`ovw-save-btn ${saving ? "loading" : ""}`}
                onClick={handleSave}
                disabled={saving || plans.length === 0}
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
              {activity.length === 0 ? (
                <div className="ovw-activity-item" style={{ opacity: 0.5 }}>
                  <div className="ovw-activity-body">
                    <span className="ovw-activity-sub">
                      {loadingStats ? "Cargando eventos…" : "Sin eventos recientes"}
                    </span>
                  </div>
                </div>
              ) : activity.map((item, i) => (
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
        {toastMsg}
      </div>
    </div>
  );
}
