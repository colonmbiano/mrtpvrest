"use client";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";
import MrrChart from "@/components/MrrChart";
import api from "@/lib/api";

export default function SaasDashboardPage() {
  const { theme, setTheme } = useTheme();
  const [prices, setPrices] = useState({ basic: 2, pro: 5, unlimited: 20, trial: 15 });
  const [toastVisible, setToastVisible] = useState(false);
  const [toggles, setToggles] = useState({
    registro: true,
    trial: true,
    mantenimiento: false,
    whatsapp: true,
  });
  const [stats, setStats] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
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
        });
        setPlans(plansRes.data);
        if (plansRes.data.length > 0) {
          const p = plansRes.data.reduce((acc: any, plan: any) => {
            if (plan.name?.toLowerCase().includes("basic")) acc.basic = plan.price;
            if (plan.name?.toLowerCase().includes("pro") || plan.name?.toLowerCase().includes("standard")) acc.pro = plan.price;
            if (plan.name?.toLowerCase().includes("unlim") || plan.name?.toLowerCase().includes("premium")) acc.unlimited = plan.price;
            return acc;
          }, { basic: 2, pro: 5, unlimited: 20, trial: 15 });
          setPrices(p);
        }
      } finally { setLoadingStats(false); }
    }
    fetchAll();
  }, []);

  const handleSave = async () => {
    try {
      await api.put("/api/saas/plans/prices", prices);
    } catch (err) {
      console.error("Error guardando ajustes", err);
    } finally {
      showToast();
    }
  };

  const toggleFeature = (key: keyof typeof toggles) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <>
      {/* STATUS BAR */}
      <div className="db-status-bar">
        <div className="db-status-dot" />
        <span className="db-status-text">
          Todos los servicios operativos — último check hace 2 min
        </span>
      </div>

      {/* TOPBAR */}
      <div className="db-topbar">
        <div className="db-topbar-left">
          <h1>Ajustes globales</h1>
          <p>Configuración que aplica a todos los restaurantes en la plataforma</p>
        </div>
        <div className="db-topbar-right">
          {/* THEME TOGGLE */}
          <div className="db-theme-toggle">
            <div
              className={`db-theme-opt ${theme === "dark" ? "active" : ""}`}
              onClick={() => setTheme("dark")}
              title="Tema oscuro"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z" />
              </svg>
            </div>
            <div
              className={`db-theme-opt ${theme === "light" ? "active" : ""}`}
              onClick={() => setTheme("light")}
              title="Tema claro"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="3" />
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
              </svg>
            </div>
          </div>

          {/* TABS */}
          <div className="db-tabs">
            <div className="db-tab active">Planes</div>
            <div className="db-tab">Integraciones</div>
            <div className="db-tab">Seguridad</div>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="db-content">
        {/* METRIC CARDS */}
        <div className="db-metrics">
          <div className="db-metric-card c-orange">
            <div className="db-metric-label">MRR total</div>
            <div className="db-metric-value">{loadingStats ? "..." : `$${(stats?.mrr || 0).toFixed(0)}`}</div>
            <div className="db-metric-footer">
              <span className={`db-metric-delta ${(stats?.growth || 0) >= 0 ? "db-delta-up" : "db-delta-down"}`}>
                {(stats?.growth || 0) >= 0 ? "▲" : "▼"} {Math.abs(stats?.growth || 0).toFixed(1)}% vs mes ant.
              </span>
              <span className="db-metric-sub">USD</span>
            </div>
          </div>
          <div className="db-metric-card c-green">
            <div className="db-metric-label">Marcas activas</div>
            <div className="db-metric-value">{loadingStats ? "..." : (stats?.active || 0)}</div>
            <div className="db-metric-footer">
              <span className="db-metric-delta db-delta-up">{stats?.total || 0} total registradas</span>
              <span className="db-metric-sub">restaurantes</span>
            </div>
          </div>
          <div className="db-metric-card c-blue">
            <div className="db-metric-label">Total marcas</div>
            <div className="db-metric-value">{loadingStats ? "..." : (stats?.total || 0)}</div>
            <div className="db-metric-footer">
              <span className="db-metric-delta" style={{ color: "var(--text2)" }}>→ activas + trial</span>
              <span className="db-metric-sub">total</span>
            </div>
          </div>
          <div className="db-metric-card c-amber">
            <div className="db-metric-label">En período prueba</div>
            <div className="db-metric-value">{loadingStats ? "..." : (stats?.trial || 0)}</div>
            <div className="db-metric-footer">
              <span className="db-metric-delta" style={{ color: "var(--amber)" }}>→ por convertir</span>
              <span className="db-metric-sub">marcas</span>
            </div>
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="db-grid3">
          {/* PLANES CONFIG */}
          <div className="db-card">
            <div className="db-card-header">
              <div>
                <div className="db-card-title">Configuración de planes</div>
                <div className="db-card-sub">Precios visibles a nuevos restaurantes</div>
              </div>
              <span className="db-badge db-badge-green">Live</span>
            </div>

            {/* PLAN CARDS */}
            <div className="db-plans-grid">
              <div className="db-plan-card">
                <div className="db-plan-name">Basic</div>
                <div className="db-plan-price">${prices.basic} <span>/mes</span></div>
                <div className="db-plan-feature-tag">Hasta 3 empleados</div>
                <div className="db-plan-stat">
                  <span className="db-plan-stat-label">Suscritos</span>
                  <span className="db-plan-stat-val">24</span>
                </div>
              </div>
              <div className="db-plan-card featured">
                <div className="db-plan-hot">POPULAR</div>
                <div className="db-plan-name">Pro</div>
                <div className="db-plan-price">${prices.pro} <span>/mes</span></div>
                <div className="db-plan-feature-tag">Hasta 10 empleados</div>
                <div className="db-plan-stat">
                  <span className="db-plan-stat-label">Suscritos</span>
                  <span className="db-plan-stat-val">31</span>
                </div>
              </div>
              <div className="db-plan-card">
                <div className="db-plan-name">Unlimited</div>
                <div className="db-plan-price">${prices.unlimited} <span>/mes</span></div>
                <div className="db-plan-feature-tag">Sin límites</div>
                <div className="db-plan-stat">
                  <span className="db-plan-stat-label">Suscritos</span>
                  <span className="db-plan-stat-val">7</span>
                </div>
              </div>
            </div>

            {/* FORM EDITAR PRECIOS */}
            <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px 20px" }}>
              <div style={{ fontSize: 11, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
                Editar precios
              </div>
              <div className="db-settings-grid">
                <div className="db-field">
                  <label>Plan Basic</label>
                  <div className="db-field-wrap">
                    <span className="db-field-prefix">USD</span>
                    <input type="number" value={prices.basic} min={0} step={0.5}
                      onChange={(e) => setPrices((p) => ({ ...p, basic: +e.target.value }))} />
                  </div>
                </div>
                <div className="db-field">
                  <label>Plan Pro</label>
                  <div className="db-field-wrap">
                    <span className="db-field-prefix">USD</span>
                    <input type="number" value={prices.pro} min={0} step={0.5}
                      onChange={(e) => setPrices((p) => ({ ...p, pro: +e.target.value }))} />
                  </div>
                </div>
                <div className="db-field">
                  <label>Plan Unlimited</label>
                  <div className="db-field-wrap">
                    <span className="db-field-prefix">USD</span>
                    <input type="number" value={prices.unlimited} min={0} step={1}
                      onChange={(e) => setPrices((p) => ({ ...p, unlimited: +e.target.value }))} />
                  </div>
                </div>
                <div className="db-field">
                  <label>Días de prueba</label>
                  <div className="db-field-wrap">
                    <span className="db-field-prefix">días</span>
                    <input type="number" value={prices.trial} min={0} step={1}
                      onChange={(e) => setPrices((p) => ({ ...p, trial: +e.target.value }))} />
                  </div>
                </div>
              </div>
              <button className="db-btn db-btn-orange" style={{ marginTop: 16, width: "100%" }} onClick={handleSave}>
                Guardar ajustes globales
              </button>
            </div>
          </div>

          {/* COLUMNA DERECHA */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* TOGGLES */}
            <div className="db-card">
              <div className="db-card-header">
                <div className="db-card-title">Funciones globales</div>
              </div>
              <div className="db-card-body">
                {[
                  { key: "registro", label: "Registro libre", desc: "Nuevas marcas sin aprobación manual" },
                  { key: "trial", label: "Trial automático", desc: "Al registrarse inicia período gratis" },
                  { key: "mantenimiento", label: "Modo mantenimiento", desc: "Bloquea acceso a todos los TPV" },
                  { key: "whatsapp", label: "Notif. Whatsapp", desc: "Whapi.cloud activo globalmente" },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="db-toggle-row">
                    <div>
                      <div className="db-toggle-label">{label}</div>
                      <div className="db-toggle-desc">{desc}</div>
                    </div>
                    <div
                      className={`db-toggle ${toggles[key as keyof typeof toggles] ? "on" : ""}`}
                      onClick={() => toggleFeature(key as keyof typeof toggles)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* ACTIVIDAD */}
            <div className="db-card" style={{ flex: 1 }}>
              <div className="db-card-header">
                <div className="db-card-title">Actividad reciente</div>
                <span className="db-badge db-badge-blue">Live</span>
              </div>
              <div className="db-activity-list">
                {[
                  { color: "var(--green)", text: <><strong>Tacos El Rey</strong> se suscribió al plan Pro</>, time: "hace 4 min" },
                  { color: "var(--amber)", text: <><strong>Burger House MX</strong> — trial vence en 24h</>, time: "hace 1h" },
                  { color: "var(--orange)", text: <>Precio Pro actualizado a <strong>$5 USD</strong></>, time: "hace 3h" },
                  { color: "var(--red)", text: <><strong>Sushi Central</strong> canceló suscripción</>, time: "ayer" },
                ].map((item, i) => (
                  <div key={i} className="db-activity-item">
                    <div className="db-activity-dot" style={{ background: item.color }} />
                    <div>
                      <div className="db-activity-text">{item.text}</div>
                      <div className="db-activity-time">{item.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CHART */}
        <MrrChart />
      </div>

      {/* TOAST */}
      <div className={`db-toast ${toastVisible ? "show" : ""}`}>✓ Ajustes guardados</div>
    </>
  );
}
