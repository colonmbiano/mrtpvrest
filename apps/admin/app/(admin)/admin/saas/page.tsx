"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

/* ── Types (from original page) ─────────────────────────────── */
interface Plan {
  id: string; name: string; displayName: string; price: number;
  maxLocations: number; maxEmployees: number;
  hasKDS: boolean; hasLoyalty: boolean; hasInventory: boolean; hasReports: boolean;
}
interface Tenant {
  id: string; name: string; slug: string; logoUrl: string | null;
  ownerEmail: string | null;
  createdAt: string;
  subscription: { id: string; status: string; currentPeriodEnd: string; priceSnapshot: number; plan: Plan; } | null;
  _count: { restaurants: number; users: number };
}
interface MRR { mrr: number; activeCount: number; byPlan: Record<string, { count: number; mrr: number }>; }

type Tab = "overview" | "tenants" | "billing" | "plans" | "logs" | "api";

/* ── CSS ─────────────────────────────────────────────────────── */
const CSS = `
@keyframes sa-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
.sa-live { animation: sa-pulse 2s infinite; }
.sa-scroll::-webkit-scrollbar { width:4px; }
.sa-scroll::-webkit-scrollbar-track { background:transparent; }
.sa-scroll::-webkit-scrollbar-thumb { background:var(--border2); border-radius:4px; }
.sa-tr:hover td { background:var(--surf2); }
`;

/* ── Tokens ──────────────────────────────────────────────────── */
const V = {
  iris3: "#b89eff", iris4: "var(--brand-secondary)", iris5: "var(--brand-primary)",
  irisS: "rgba(124,58,237,.14)", irisG: "rgba(124,58,237,.35)",
  ok: "var(--green)", okS: "rgba(16,185,129,.14)",
  warn: "var(--amber)", warnS: "rgba(245,158,11,.14)",
  err: "var(--red)", errS: "rgba(239,68,68,.14)",
  info: "var(--blue)", infoS: "rgba(59,130,246,.14)",
  surf1: "var(--surf)", surf2: "var(--surf2)", surf3: "var(--surf3)",
  bd1: "var(--border)", bd2: "var(--border2)",
  tx: "var(--text)", txHi: "#fff", txMid: "rgba(200,200,230,.75)",
  txMut: "var(--muted)", txDim: "var(--muted2)",
};
const mono = { fontFamily: "'DM Mono',monospace" };
const display = { fontFamily: "'Syne',sans-serif" };
const card = (extra: object = {}): object => ({ background: V.surf1, border: `1px solid ${V.bd1}`, borderRadius: 16, ...extra });
const btn = (primary?: boolean, ghost?: boolean): object => ({
  padding: "9px 14px", borderRadius: 10,
  border: primary ? "none" : `1px solid ${V.bd1}`,
  background: primary ? V.iris5 : ghost ? V.surf2 : V.surf1,
  color: primary ? "#fff" : V.txMid,
  fontSize: 12, fontWeight: primary ? 600 : 500, cursor: "pointer",
  fontFamily: "inherit", whiteSpace: "nowrap" as const,
  boxShadow: primary ? `0 4px 14px ${V.irisG}` : "none",
});

/* ── Status / Plan helpers ───────────────────────────────────── */
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  ACTIVE:    { bg: V.okS,   color: V.ok,   label: "ACTIVE"    },
  TRIAL:     { bg: V.infoS, color: V.info, label: "TRIAL"     },
  PAST_DUE:  { bg: V.warnS, color: V.warn, label: "PAST DUE"  },
  SUSPENDED: { bg: V.warnS, color: V.warn, label: "PAUSED"    },
  CANCELLED: { bg: V.errS,  color: V.err,  label: "CHURNED"   },
  EXPIRED:   { bg: V.errS,  color: V.err,  label: "EXPIRED"   },
};
const PLAN_STYLE: Record<string, { bg: string; color: string }> = {
  STARTER:    { bg: V.surf2,  color: V.txMid },
  PRO:        { bg: V.infoS,  color: V.info  },
  ENTERPRISE: { bg: V.irisS,  color: V.iris3 },
};

function StatusChip({ status }: { status?: string }) {
  const s = STATUS_STYLE[status ?? ""] ?? { bg: V.surf2, color: V.txMut, label: status ?? "—" };
  return (
    <span style={{ ...mono, display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: ".06em", background: s.bg, color: s.color }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, display: "inline-block" }} />
      {s.label}
    </span>
  );
}
function PlanPill({ name }: { name?: string }) {
  const upper = (name ?? "STARTER").toUpperCase();
  const s = PLAN_STYLE[upper] ?? PLAN_STYLE.STARTER;
  return <span style={{ ...mono, padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, letterSpacing: ".04em", background: s.bg, color: s.color }}>{upper}</span>;
}

/* ── Tenant logo ─────────────────────────────────────────────── */
const LOGO_GRADS = [
  "linear-gradient(135deg,#f59e0b,#dc2626)", "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#3b82f6,#1e40af)", "linear-gradient(135deg,#ec4899,#9d174d)",
  "linear-gradient(135deg,#a855f7,#6b21a8)", "linear-gradient(135deg,#14b8a6,#0d9488)",
  "linear-gradient(135deg,#f97316,#ea580c)", "linear-gradient(135deg,#8b5cf6,#5b21b6)",
  "linear-gradient(135deg,#06b6d4,#0e7490)", "linear-gradient(135deg,#eab308,#a16207)",
];
function TenantLogo({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const grad = LOGO_GRADS[name.charCodeAt(0) % LOGO_GRADS.length];
  return (
    <div style={{ width: size, height: size, borderRadius: 9, background: grad, display: "grid", placeItems: "center", color: "#fff", ...display, fontWeight: 800, fontSize: size * 0.36, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

/* ── Styling helpers (color maps) ─────────────────────────── */
const LOG_COLORS: Record<string, { bg: string; color: string }> = {
  ERROR: { bg: V.errS,  color: V.err  },
  WARN:  { bg: V.warnS, color: V.warn },
  INFO:  { bg: V.infoS, color: V.info },
  OK:    { bg: V.okS,   color: V.ok   },
};

/* ── Utilities para derivar data real del estado de tenants ─── */
function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}
function timeSinceLabel(iso: string | null | undefined): string {
  const d = daysAgo(iso);
  if (d === null) return "—";
  if (d === 0) return "Hoy";
  if (d === 1) return "Ayer";
  return `Hace ${d} días`;
}

/* ── th helper ───────────────────────────────────────────────── */
const TH = ({ children }: { children: React.ReactNode }) => (
  <th style={{ ...mono, textAlign: "left", fontSize: 10, color: V.txDim, letterSpacing: ".12em", textTransform: "uppercase", padding: "12px", borderBottom: `1px solid ${V.bd1}`, fontWeight: 600 }}>
    {children}
  </th>
);
const TD = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <td style={{ padding: "14px 12px", borderBottom: `1px solid ${V.bd1}`, color: V.txMid, textAlign: right ? "right" : "left" }}>
    {children}
  </td>
);
const Num = ({ children }: { children: React.ReactNode }) => (
  <span style={{ ...mono, color: V.txHi, fontWeight: 600 }}>{children}</span>
);

/* ════════════════════════════════════════════════════════════ */
export default function SaaSAdminPage() {
  const [tab, setTab]   = useState<Tab>("overview");
  const [period, setPeriod] = useState<"24H"|"30D"|"TRIM"|"AÑO">("30D");
  const [search, setSearch] = useState("");
  const [logSearch, setLogSearch] = useState("");

  /* Real data */
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans]     = useState<Plan[]>([]);
  const [mrr, setMrr]         = useState<MRR | null>(null);
  const [loading, setLoading] = useState(true);

  /* Modal */
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", ownerEmail: "", logoUrl: "", planId: "" });

  const load = async () => {
    try {
      const [tRes, pRes, mRes] = await Promise.all([
        api.get("/api/saas/tenants"),
        api.get("/api/saas/plans"),
        api.get("/api/saas/mrr"),
      ]);
      setTenants(tRes.data);
      setPlans(pRes.data);
      setMrr(mRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingTenant(null);
    setForm({ name: "", slug: "", ownerEmail: "", logoUrl: "", planId: plans[0]?.id ?? "" });
    setShowModal(true);
  };
  const openEdit = (t: Tenant) => {
    setEditingTenant(t);
    setForm({ name: t.name, slug: t.slug, ownerEmail: t.ownerEmail ?? "", logoUrl: t.logoUrl ?? "", planId: t.subscription?.plan?.id ?? "" });
    setShowModal(true);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTenant) {
        await api.patch(`/api/saas/tenants/${editingTenant.id}/plan`, { planId: form.planId });
      } else {
        await api.post("/api/saas/tenants", { name: form.name, slug: form.slug, ownerEmail: form.ownerEmail || undefined, logoUrl: form.logoUrl || undefined, planId: form.planId });
      }
      setShowModal(false); load();
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
  };
  const handleStatus = async (t: Tenant, status: string) => {
    if (!confirm(`¿${status.toLowerCase()} el tenant "${t.name}"?`)) return;
    try { await api.patch(`/api/saas/tenants/${t.id}/status`, { status }); load(); }
    catch (err: any) { alert(err.response?.data?.error || "Error"); }
  };
  const handleDelete = async (t: Tenant) => {
    if (!confirm(`¿ELIMINAR "${t.name}" y todos sus datos? Irreversible.`)) return;
    try { await api.delete(`/api/saas/tenants/${t.id}`); load(); }
    catch { alert("Error al eliminar"); }
  };

  /* Derived */
  const mrrVal    = mrr?.mrr    ?? 0;
  const activeVal = mrr?.activeCount ?? tenants.filter(t => t.subscription?.status === "ACTIVE").length;
  const trialCount = tenants.filter(t => t.subscription?.status === "TRIAL").length;
  const signups30d = tenants.filter(t => {
    const d = daysAgo(t.createdAt);
    return d !== null && d <= 30;
  }).length;

  const filteredTenants = tenants.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase()) ||
    (t.ownerEmail ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // TOP_TENANTS y NEW_TENANTS se derivan del fetch real de /api/saas/tenants.
  const topTenants = [...tenants]
    .filter(t => t.subscription?.status === "ACTIVE")
    .sort((a, b) => (b.subscription?.priceSnapshot ?? 0) - (a.subscription?.priceSnapshot ?? 0))
    .slice(0, 5);
  const newTenants = [...tenants]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "tenants",  label: "Tenants",  count: tenants.length },
    { id: "billing",  label: "Billing"  },
    { id: "plans",    label: "Planes"   },
    { id: "logs",     label: "Logs & Audit" },
    { id: "api",      label: "API keys" },
  ];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 40, color: V.txMut }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: "sa-pulse 1s linear infinite" }}>
        <circle cx="12" cy="12" r="10" strokeOpacity=".2"/><path d="M12 2a10 10 0 0110 10"/>
      </svg>
      Cargando plataforma…
    </div>
  );

  return (
    <>
      <style>{CSS}</style>

      {/* Topbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 20, marginBottom: 24, borderBottom: `1px solid ${V.bd1}` }}>
        <div>
          <h1 style={{ ...display, fontWeight: 800, fontSize: 32, color: V.txHi, letterSpacing: "-.02em", lineHeight: 1.1 }}>Plataforma</h1>
          <div style={{ fontSize: 13, color: V.txMut, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
            {tenants.length} tenants · {activeVal} activos
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: "inline-flex", background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 8, padding: 2 }}>
            {(["24H","30D","TRIM","AÑO"] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: "5px 10px", borderRadius: 6, ...mono, fontSize: 11,
                color: period === p ? V.txHi : V.txMut, cursor: "pointer", border: "none",
                background: period === p ? V.surf1 : "transparent", fontWeight: 500, letterSpacing: ".04em",
              }}>{p}</button>
            ))}
          </div>
          <button style={btn()}>Exportar</button>
          <button onClick={openCreate} style={btn(true)}>+ Invitar tenant</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `1px solid ${V.bd1}` }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "10px 14px", fontSize: 13, cursor: "pointer", border: "none",
            borderBottom: tab === t.id ? `2px solid ${V.iris5}` : "2px solid transparent",
            marginBottom: -1, fontWeight: tab === t.id ? 600 : 500, fontFamily: "inherit",
            color: tab === t.id ? V.iris3 : V.txMut, background: "transparent",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {t.label}
            {t.count !== undefined && (
              <span style={{ ...mono, fontSize: 11, background: tab === t.id ? V.irisS : V.surf2, padding: "1px 6px", borderRadius: 5, color: tab === t.id ? V.iris3 : V.txMut }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ OVERVIEW ═══════════════════════════════════════════ */}
      {tab === "overview" && (
        <>
          {/* KPI grid — valores reales derivados de /api/saas/mrr y /api/saas/tenants.
              Las comparaciones vs periodo anterior (churn, trial→paid) requieren
              endpoints que aún no existen, así que mostramos el valor actual sin delta. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "MRR",            value: `$${mrrVal.toLocaleString("es-MX",{minimumFractionDigits:0})}`, cents: "", sub: `ARR estimado $${Math.round(mrrVal*12/1000)}k` },
              { label: "Tenants activos", value: String(activeVal), cents: "", sub: `${tenants.length} totales` },
              { label: "En trial",        value: String(trialCount), cents: "", sub: trialCount ? "suscripciones TRIAL" : "sin trials activos" },
              { label: "Signups · 30d",   value: String(signups30d), cents: "", sub: signups30d ? "nuevos tenants" : "sin altas recientes" },
            ].map(k => (
              <div key={k.label} style={{ ...card(), padding: "18px 20px" }}>
                <div style={{ ...mono, fontSize: 10, color: V.txMut, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>{k.label}</div>
                <div style={{ ...display, fontWeight: 800, fontSize: 36, color: V.txHi, letterSpacing: "-.02em", lineHeight: 1 }}>
                  {k.value}<span style={{ fontSize: 18, color: V.txMut, fontWeight: 600 }}>{k.cents}</span>
                </div>
                <div style={{ marginTop: 12, fontSize: 11, color: V.txMut }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* MRR por plan + Platform health (placeholder)
              El histórico mensual de MRR requiere un endpoint de time-series
              que aún no existe. Mientras tanto mostramos el snapshot actual
              (MRR por plan) que sí viene de /api/saas/mrr. */}
          <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 14, marginBottom: 14 }}>
            {/* MRR por plan */}
            <div style={{ ...card(), padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi }}>MRR por plan</div>
                  <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>Snapshot actual · ${mrrVal.toLocaleString("es-MX")} total</div>
                </div>
              </div>
              {(() => {
                const byPlan = mrr?.byPlan ?? {};
                const entries = Object.entries(byPlan);
                if (entries.length === 0) {
                  return (
                    <div style={{ padding: "48px 0", textAlign: "center", color: V.txMut, fontSize: 13 }}>
                      Aún no hay suscripciones activas.
                    </div>
                  );
                }
                const maxMrr = Math.max(1, ...entries.map(([, v]) => v.mrr));
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {entries.map(([planName, v]) => {
                      const pct = Math.round((v.mrr / maxMrr) * 100);
                      return (
                        <div key={planName}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "baseline" }}>
                            <span style={{ fontSize: 13, color: V.txMid, display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <PlanPill name={planName} />
                              <span style={{ color: V.txMut, fontSize: 11 }}>· {v.count} tenants</span>
                            </span>
                            <span style={{ ...mono, color: V.txHi, fontWeight: 600 }}>${v.mrr.toLocaleString("es-MX")}</span>
                          </div>
                          <div style={{ height: 6, background: V.surf2, borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${V.iris5},${V.iris3})` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Platform health — sin endpoint aún, empty state */}
            <div style={{ ...card(), padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi }}>Salud de plataforma</div>
                  <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>Sin datos disponibles</div>
                </div>
              </div>
              <div style={{ padding: "24px 0", textAlign: "center", color: V.txMut, fontSize: 12, lineHeight: 1.6 }}>
                Las métricas de infra (uptime, latencia, cola de jobs) se conectarán
                cuando tengamos un endpoint de health/metrics expuesto por el backend.
              </div>
            </div>
          </div>

          {/* Plan dist + Top tenants + New signups — derivados de /api/saas/tenants + /api/saas/mrr */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {/* Plan distribution */}
            <div style={{ ...card(), padding: 20 }}>
              <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi, marginBottom: 4 }}>Distribución por plan</div>
              <div style={{ fontSize: 11, color: V.txMut, marginBottom: 14 }}>{activeVal} tenants activos</div>
              {(() => {
                const starter    = mrr?.byPlan?.STARTER?.count    ?? 0;
                const pro        = mrr?.byPlan?.PRO?.count        ?? 0;
                const enterprise = mrr?.byPlan?.ENTERPRISE?.count ?? 0;
                const total = Math.max(1, starter + pro + enterprise);
                const CIRC = 2 * Math.PI * 48;
                const dashS = (starter    / total) * CIRC;
                const dashP = (pro        / total) * CIRC;
                const dashE = (enterprise / total) * CIRC;
                return (
                  <>
                    <svg viewBox="0 0 120 120" style={{ width: 140, height: 140, display: "block", margin: "0 auto" }}>
                      <circle cx="60" cy="60" r="48" fill="none" stroke="#15152a" strokeWidth="16"/>
                      <circle cx="60" cy="60" r="48" fill="none" stroke="#3b82f6" strokeWidth="16" strokeDasharray={`${dashS} ${CIRC}`} transform="rotate(-90 60 60)"/>
                      <circle cx="60" cy="60" r="48" fill="none" stroke="#9472ff" strokeWidth="16" strokeDasharray={`${dashP} ${CIRC}`} strokeDashoffset={-dashS} transform="rotate(-90 60 60)"/>
                      <circle cx="60" cy="60" r="48" fill="none" stroke="#7c3aed" strokeWidth="16" strokeDasharray={`${dashE} ${CIRC}`} strokeDashoffset={-(dashS + dashP)} transform="rotate(-90 60 60)"/>
                      <text x="60" y="56" textAnchor="middle" fontFamily="DM Mono" fontSize="9" fill="#9494b8">TENANTS</text>
                      <text x="60" y="72" textAnchor="middle" fontFamily="Syne" fontWeight="800" fontSize="18" fill="#fff">{activeVal}</text>
                    </svg>
                    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                      {[{ color: "#3b82f6", label: "Starter", n: starter },
                        { color: "#9472ff", label: "Pro",     n: pro },
                        { color: "#7c3aed", label: "Enterprise", n: enterprise }].map(p => (
                        <div key={p.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
                            <span style={{ fontSize: 13, color: V.txMid }}>{p.label}</span>
                          </div>
                          <Num>{p.n}</Num>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Top tenants — derivado de tenants reales sort by priceSnapshot desc */}
            <div style={{ ...card(), padding: 20 }}>
              <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi, marginBottom: 4 }}>Top tenants · MRR</div>
              <div style={{ fontSize: 11, color: V.txMut, marginBottom: 14 }}>Por priceSnapshot de suscripción</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {topTenants.length === 0 && (
                  <div style={{ padding: "24px 0", textAlign: "center", color: V.txMut, fontSize: 12 }}>
                    Sin tenants activos todavía.
                  </div>
                )}
                {topTenants.map((t, i) => (
                  <div key={t.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: i < topTenants.length - 1 ? `1px solid ${V.bd1}` : "none" }}>
                    <TenantLogo name={t.name} />
                    <div>
                      <div style={{ color: V.tx, fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                      <div style={{ ...mono, fontSize: 10, color: V.txMut }}>
                        {(t.subscription?.plan?.name ?? "—").toUpperCase()} · {t._count.restaurants} sede{t._count.restaurants === 1 ? "" : "s"}
                      </div>
                    </div>
                    <Num>${(t.subscription?.priceSnapshot ?? 0).toLocaleString("es-MX")}</Num>
                  </div>
                ))}
              </div>
            </div>

            {/* New signups — ordenado por createdAt desc en backend */}
            <div style={{ ...card(), padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi }}>Nuevos · 30 días</div>
                  <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>{signups30d} signup{signups30d === 1 ? "" : "s"}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {newTenants.length === 0 && (
                  <div style={{ padding: "24px 0", textAlign: "center", color: V.txMut, fontSize: 12 }}>
                    Sin altas recientes.
                  </div>
                )}
                {newTenants.map((t, i) => (
                  <div key={t.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: i < newTenants.length - 1 ? `1px solid ${V.bd1}` : "none" }}>
                    <TenantLogo name={t.name} />
                    <div>
                      <div style={{ color: V.tx, fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                      <div style={{ ...mono, fontSize: 10, color: V.txMut }}>{timeSinceLabel(t.createdAt)}</div>
                    </div>
                    <StatusChip status={t.subscription?.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ TENANTS ════════════════════════════════════════════ */}
      {tab === "tenants" && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, maxWidth: 360, position: "relative" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: "absolute", top: 10, left: 12, opacity: .5, pointerEvents: "none" }}>
                <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, dominio, email..."
                style={{ width: "100%", padding: "9px 14px 9px 38px", background: V.surf1, border: `1px solid ${V.bd1}`, borderRadius: 10, color: V.tx, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            </div>
            {["Estado: Todos ▾","Plan: Todos ▾","Región: Todos ▾"].map(f => <button key={f} style={btn()}>{f}</button>)}
            <button style={{ ...btn(), marginLeft: "auto" }}>Columnas ▾</button>
          </div>
          <div style={{ ...card(), padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><TH>Tenant</TH><TH>Plan</TH><TH>Estado</TH><TH>MRR</TH><TH>Sedes</TH><TH>Usuarios</TH><TH>Alta</TH><TH>Acciones</TH></tr></thead>
              <tbody>
                {filteredTenants.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 48, textAlign: "center", color: V.txMut }}>Sin resultados</td></tr>
                )}
                {filteredTenants.map(t => (
                  <tr key={t.id} className="sa-tr">
                    <TD>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <TenantLogo name={t.name} />
                        <div>
                          <div style={{ color: V.tx, fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                          <div style={{ ...mono, fontSize: 10, color: V.txMut }}>{t.ownerEmail || `${t.slug}.mrtpvrest.app`}</div>
                        </div>
                      </div>
                    </TD>
                    <TD><PlanPill name={t.subscription?.plan?.name} /></TD>
                    <TD><StatusChip status={t.subscription?.status} /></TD>
                    <TD><Num>${(t.subscription?.priceSnapshot ?? 0).toLocaleString("es-MX")}</Num></TD>
                    <TD><Num>{t._count.restaurants}</Num></TD>
                    <TD><Num>{t._count.users}</Num></TD>
                    <TD><span style={{ ...mono, fontSize: 11, color: V.txMut }}>{timeSinceLabel(t.createdAt)}</span></TD>
                    <td style={{ padding: "14px 12px", borderBottom: `1px solid ${V.bd1}` }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => openEdit(t)} style={{ ...btn(), padding: "5px 8px", fontSize: 11 }}>Plan</button>
                        {t.subscription?.status === "SUSPENDED"
                          ? <button onClick={() => handleStatus(t, "ACTIVE")} style={{ ...btn(), padding: "5px 8px", fontSize: 11, color: V.ok }}>Activar</button>
                          : <button onClick={() => handleStatus(t, "SUSPENDED")} style={{ ...btn(), padding: "5px 8px", fontSize: 11, color: V.warn }}>Pausar</button>
                        }
                        <button onClick={() => handleDelete(t)} style={{ ...btn(), padding: "5px 8px", fontSize: 11, color: V.err }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: "12px 20px", borderTop: `1px solid ${V.bd1}`, fontSize: 12, color: V.txMut }}>
              Mostrando {filteredTenants.length} de {tenants.length} tenants
            </div>
          </div>
        </>
      )}

      {/* ═══ BILLING ════════════════════════════════════════════ */}
      {tab === "billing" && (
        <>
          {/* KPI strip — sólo mostramos MRR (real). Cobrado/vencido/dunning/refunds
              requieren un ledger de facturas emitidas que aún no existe. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
            <div style={{ ...card(), padding: "18px 20px" }}>
              <div style={{ ...mono, fontSize: 10, color: V.txMut, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>MRR</div>
              <div style={{ ...display, fontWeight: 800, fontSize: 32, color: V.txHi, letterSpacing: "-.02em", lineHeight: 1 }}>
                ${mrrVal.toLocaleString("es-MX")}
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: V.txMut }}>{activeVal} suscripciones activas</div>
            </div>
            {["Cobrado · mes", "Vencido", "Refunds · mes"].map(label => (
              <div key={label} style={{ ...card(), padding: "18px 20px" }}>
                <div style={{ ...mono, fontSize: 10, color: V.txMut, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
                <div style={{ ...display, fontWeight: 800, fontSize: 32, color: V.txDim, letterSpacing: "-.02em", lineHeight: 1 }}>—</div>
                <div style={{ marginTop: 10, fontSize: 11, color: V.txMut }}>Pendiente de integrar</div>
              </div>
            ))}
          </div>

          {/* Facturas — el endpoint /api/saas/tenants/:id/invoices existe pero
              requeriría N+1 o un /api/saas/invoices nuevo para listar todas. */}
          <div style={{ ...card(), padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${V.bd1}` }}>
              <div>
                <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi }}>Facturas recientes</div>
                <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>Vista consolidada · pendiente de endpoint</div>
              </div>
            </div>
            <div style={{ padding: "48px 20px", textAlign: "center", color: V.txMut, fontSize: 13 }}>
              Las facturas emitidas por tenant están disponibles vía{" "}
              <span style={{ ...mono, color: V.iris3 }}>GET /api/saas/tenants/:id/invoices</span>.
              <br />La vista consolidada se habilitará cuando exista un endpoint
              agregado <span style={{ ...mono, color: V.iris3 }}>/api/saas/invoices</span>.
            </div>
          </div>
        </>
      )}

      {/* ═══ PLANES ═════════════════════════════════════════════ */}
      {tab === "plans" && (
        <>
          {plans.length === 0 ? (
            <div style={{ ...card(), padding: 48, textAlign: "center", color: V.txMut, fontSize: 13 }}>
              Sin planes configurados. Corre <span style={{ ...mono, color: V.iris3 }}>pnpm db:seed</span> o
              crea planes vía <span style={{ ...mono, color: V.iris3 }}>POST /api/saas/plans</span>.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
              {plans.slice(0, 3).map(p => {
                const isPro = p.name.toUpperCase() === "PRO";
                const byP = mrr?.byPlan?.[p.name] ?? { count: 0, mrr: 0 };
                return (
                  <div key={p.id} style={{
                    ...card(), padding: 24, position: "relative",
                    ...(isPro ? { borderColor: "rgba(124,58,237,.3)", background: `linear-gradient(180deg,rgba(124,58,237,.06),transparent 50%),${V.surf1}` } : {}),
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ ...display, fontWeight: 800, fontSize: 20, color: V.txHi }}>{p.displayName}</div>
                    </div>
                    <div style={{ ...display, fontWeight: 800, fontSize: 40, color: V.txHi, letterSpacing: "-.03em", marginTop: 10 }}>
                      {p.price > 0 ? `$${p.price}` : "Custom"}<span style={{ fontSize: 14, color: V.txMut, fontWeight: 500, letterSpacing: 0 }}>{p.price > 0 ? "/mes" : ""}</span>
                    </div>
                    <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        `Hasta ${p.maxLocations >= 999 ? "∞" : p.maxLocations} sede(s)`,
                        `${p.maxEmployees >= 999 ? "Empleados ilimitados" : `${p.maxEmployees} empleados`}`,
                        "TPV + Cliente web",
                        ...(p.hasKDS ? ["Kiosko + KDS"] : []),
                        ...(p.hasReports ? ["Reportes avanzados"] : ["Reportes básicos"]),
                        ...(p.hasInventory ? ["Inventario"] : []),
                      ].map(f => (
                        <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: V.txMid }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={V.iris4} strokeWidth="3" style={{ marginTop: 2, flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                          {f}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 14, marginTop: 14, borderTop: `1px solid ${V.bd1}` }}>
                      <div>
                        <div style={{ ...display, fontWeight: 800, color: V.txHi, fontSize: 18 }}>{byP.count}</div>
                        <div style={{ ...mono, fontSize: 9, color: V.txMut, letterSpacing: ".1em", marginTop: 2 }}>TENANTS</div>
                      </div>
                      <div>
                        <div style={{ ...display, fontWeight: 800, color: V.txHi, fontSize: 18 }}>${byP.mrr.toLocaleString("es-MX")}</div>
                        <div style={{ ...mono, fontSize: 9, color: V.txMut, letterSpacing: ".1em", marginTop: 2 }}>MRR TOTAL</div>
                      </div>
                      <div>
                        <div style={{ ...display, fontWeight: 800, color: V.txDim, fontSize: 18 }}>—</div>
                        <div style={{ ...mono, fontSize: 9, color: V.txMut, letterSpacing: ".1em", marginTop: 2 }}>CHURN</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Feature flags */}
          <div style={{ ...card(), padding: 20 }}>
            <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi, marginBottom: 4 }}>Feature flags globales</div>
            <div style={{ fontSize: 11, color: V.txMut, marginBottom: 16 }}>Activa/desactiva por plan o por tenant</div>
            {[
              { feature: "Kiosko autoservicio",     s: false, p: true,  e: true  },
              { feature: "App repartidor",           s: false, p: true,  e: true  },
              { feature: "White-label (marca propia)",s: false, p: false, e: true  },
              { feature: "SSO (SAML)",               s: false, p: false, e: true  },
              { feature: "API público & webhooks",   s: false, p: true,  e: true  },
            ].map((f, i) => (
              <div key={f.feature} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 100px", gap: 8, padding: "12px 0", borderBottom: i < 4 ? `1px solid ${V.bd1}` : "none", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: V.tx }}>{f.feature}</div>
                {[f.s, f.p, f.e].map((on, j) => (
                  <div key={j} style={{ textAlign: "center", color: on ? V.ok : V.err, fontSize: 14 }}>{on ? "✓" : "—"}</div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══ LOGS ═══════════════════════════════════════════════
          Sin endpoint /api/saas/logs todavía. El input de búsqueda se deja
          visible para cuando se conecte. */}
      {tab === "logs" && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, maxWidth: 400, position: "relative" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: "absolute", top: 10, left: 12, opacity: .5, pointerEvents: "none" }}>
                <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="Buscar en logs..."
                disabled
                style={{ width: "100%", padding: "9px 14px 9px 38px", background: V.surf1, border: `1px solid ${V.bd1}`, borderRadius: 10, color: V.tx, fontSize: 13, fontFamily: "inherit", outline: "none", opacity: .5 }} />
            </div>
          </div>
          <div style={{ ...card(), padding: "48px 20px", textAlign: "center", color: V.txMut, fontSize: 13 }}>
            El stream de eventos auditables se conectará cuando expongamos un
            endpoint <span style={{ ...mono, color: V.iris3 }}>GET /api/saas/logs</span>.
            <br /><span style={{ fontSize: 12, opacity: .7 }}>Referencia de niveles: {Object.keys(LOG_COLORS).join(" · ")}</span>
          </div>
        </>
      )}

      {/* ═══ API KEYS ════════════════════════════════════════════
          Sin endpoint /api/saas/api-keys todavía. */}
      {tab === "api" && (
        <div style={{ ...card(), padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${V.bd1}` }}>
            <div>
              <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi }}>API keys & webhooks</div>
              <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>Credenciales emitidas a tenants</div>
            </div>
          </div>
          <div style={{ padding: "48px 20px", textAlign: "center", color: V.txMut, fontSize: 13 }}>
            Gestión de API keys pendiente de endpoint{" "}
            <span style={{ ...mono, color: V.iris3 }}>GET /api/saas/api-keys</span>.
          </div>
        </div>
      )}

      {/* ═══ MODAL ══════════════════════════════════════════════ */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,.85)", backdropFilter: "blur(8px)" }}>
          <div style={{ ...card(), padding: 40, width: "100%", maxWidth: 520, overflowY: "auto", maxHeight: "90vh" }}>
            <h2 style={{ ...display, fontSize: 28, fontWeight: 800, color: V.txHi, marginBottom: 6 }}>
              {editingTenant ? "Cambiar plan" : "Nuevo tenant"}
            </h2>
            <p style={{ fontSize: 13, color: V.txMut, marginBottom: 28 }}>
              {editingTenant ? `Cambiando plan de "${editingTenant.name}"` : "Registra un nuevo restaurante en MRTPVREST."}
            </p>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {!editingTenant && (
                <>
                  {[
                    { label: "Nombre del negocio", key: "name", ph: "Ej: Master Burguer's", required: true },
                    { label: "Slug URL", key: "slug", ph: "ej: master-burguers", required: true, mono: true },
                    { label: "Email del dueño (opcional)", key: "ownerEmail", ph: "dueno@restaurante.com", mono: true },
                    { label: "URL del logo (opcional)", key: "logoUrl", ph: "https://...", mono: true },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ ...mono, fontSize: 10, color: V.txMut, letterSpacing: ".12em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{f.label}</label>
                      <input required={f.required} value={(form as any)[f.key]}
                        onChange={e => setForm({ ...form, [f.key]: f.key === "slug" ? e.target.value.toLowerCase().replace(/\s+/g, "-") : e.target.value })}
                        placeholder={f.ph}
                        style={{ width: "100%", padding: "10px 14px", background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 10, color: V.tx, fontSize: 13, fontFamily: f.mono ? "'DM Mono',monospace" : "inherit", outline: "none" }} />
                    </div>
                  ))}
                </>
              )}
              <div>
                <label style={{ ...mono, fontSize: 10, color: V.txMut, letterSpacing: ".12em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Plan de servicio</label>
                <select required value={form.planId} onChange={e => setForm({ ...form, planId: e.target.value })}
                  style={{ width: "100%", padding: "10px 14px", background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 10, color: V.tx, fontSize: 13, fontFamily: "inherit", outline: "none" }}>
                  <option value="">Selecciona un plan…</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.displayName} — ${p.price}/mes · {p.maxLocations} sucursal(es)</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 12, paddingTop: 8 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: "12px 0", color: V.txMut, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancelar</button>
                <button type="submit" style={{ flex: 1, ...btn(true), padding: "12px 0", borderRadius: 12, fontSize: 14 }}>
                  {editingTenant ? "Guardar plan" : "Activar tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
