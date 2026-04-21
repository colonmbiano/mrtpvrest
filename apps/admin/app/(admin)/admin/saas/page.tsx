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
  id: string; name: string; slug: string; domain: string | null; logoUrl: string | null;
  isActive: boolean;
  subscription: { id: string; status: string; currentPeriodEnd: string; priceSnapshot: number; plan: Plan; } | null;
  _count: { locations: number; users: number; orders: number };
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

/* ── Log level styling (not data) ────────────────────────────── */
const LOG_COLORS: Record<string, { bg: string; color: string }> = {
  ERROR: { bg: V.errS,  color: V.err  },
  WARN:  { bg: V.warnS, color: V.warn },
  INFO:  { bg: V.infoS, color: V.info },
  OK:    { bg: V.okS,   color: V.ok   },
};

/* ── Helpers ─────────────────────────────────────────────────── */
function daysAgoLabel(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "Hoy";
  if (d === 1) return "Hace 1 día";
  return `Hace ${d} días`;
}
function currency(n: number): string {
  return `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString("es-MX", { hour12: false }); }
  catch { return iso; }
}
function EmptyRow({ cols, text = "Sin datos" }: { cols: number; text?: string }) {
  return (
    <tr><td colSpan={cols} style={{ padding: 48, textAlign: "center", color: V.txMut }}>{text}</td></tr>
  );
}
function EmptyBlock({ text = "Sin datos" }: { text?: string }) {
  return (
    <div style={{ padding: "40px 12px", textAlign: "center", color: V.txMut, fontSize: 13 }}>{text}</div>
  );
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

  /* Plataforma */
  type HealthMetric = { label: string; value: string; pct: number; color: string };
  type Health = { tenantCount: number; activeSubscriptions: number; orders24h: number; gmv24h: number; metrics: HealthMetric[] };
  type TopTenant = { id: string; name: string; plan: string | null; planDisplay: string | null; restaurants: number; mrr: number; logoUrl: string | null };
  type NewTenant = { id: string; name: string; createdAt: string; subscription: { status: string; plan?: { name: string; displayName: string } | null } | null };
  type LogEntry = { id: string; tenantId: string | null; level: string; message: string; context: string | null; createdAt: string };
  type InvoiceRow = { id: string; amount: number; status: string; createdAt: string; subscription?: { plan?: { displayName: string; name: string } | null; tenant?: { id: string; name: string; slug: string; logoUrl: string | null } | null } };
  type ApiKeyRow = { id: string; tenantId: string | null; name: string; prefix: string; scopes: string[]; active: boolean; lastUsedAt: string | null; requests24h: number; createdAt: string };

  const [health, setHealth]     = useState<Health | null>(null);
  const [topTenants, setTopTenants] = useState<TopTenant[]>([]);
  const [newSignups, setNewSignups] = useState<NewTenant[]>([]);
  const [logs, setLogs]         = useState<LogEntry[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [apiKeys, setApiKeys]   = useState<ApiKeyRow[]>([]);

  /* Modal */
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", domain: "", logoUrl: "", planId: "" });

  const load = async () => {
    try {
      const safe = <T,>(p: Promise<{ data: T }>, fallback: T): Promise<T> =>
        p.then(r => r.data).catch(() => fallback);

      const [t, pl, m, h, tt, nt, lg, inv, ak] = await Promise.all([
        safe<Tenant[]>(api.get("/api/saas/tenants"),      []),
        safe<Plan[]>(api.get("/api/saas/plans"),          []),
        safe<MRR>(api.get("/api/saas/mrr"),               { mrr: 0, activeCount: 0, byPlan: {} }),
        safe<Health>(api.get("/api/saas/health"),         { tenantCount: 0, activeSubscriptions: 0, orders24h: 0, gmv24h: 0, metrics: [] }),
        safe<TopTenant[]>(api.get("/api/saas/top-tenants?limit=5"), []),
        safe<NewTenant[]>(api.get("/api/saas/new-tenants?days=30&limit=5"), []),
        safe<LogEntry[]>(api.get("/api/saas/logs?limit=100"), []),
        safe<InvoiceRow[]>(api.get("/api/saas/invoices?limit=60"),  []),
        safe<ApiKeyRow[]>(api.get("/api/saas/api-keys"),   []),
      ]);

      setTenants(t); setPlans(pl); setMrr(m);
      setHealth(h); setTopTenants(tt); setNewSignups(nt);
      setLogs(lg); setInvoices(inv); setApiKeys(ak);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingTenant(null);
    setForm({ name: "", slug: "", domain: "", logoUrl: "", planId: plans[0]?.id ?? "" });
    setShowModal(true);
  };
  const openEdit = (t: Tenant) => {
    setEditingTenant(t);
    setForm({ name: t.name, slug: t.slug, domain: t.domain ?? "", logoUrl: t.logoUrl ?? "", planId: t.subscription?.plan?.id ?? "" });
    setShowModal(true);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTenant) {
        await api.patch(`/api/saas/tenants/${editingTenant.id}/plan`, { planId: form.planId });
      } else {
        await api.post("/api/saas/tenants", { name: form.name, slug: form.slug, domain: form.domain || undefined, logoUrl: form.logoUrl || undefined, planId: form.planId });
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
  const filteredTenants = tenants.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase()) ||
    (t.domain ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const filteredLogs = logs.filter(l =>
    !logSearch ||
    l.message.toLowerCase().includes(logSearch.toLowerCase()) ||
    (l.context ?? "").toLowerCase().includes(logSearch.toLowerCase())
  );

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
          <h1 style={{ ...display, fontWeight: 800, fontSize: 32, color: V.txHi, letterSpacing: "-.02em", lineHeight: 1.1 }}>Plataforma · abril 2026</h1>
          <div style={{ fontSize: 13, color: V.txMut, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
            {activeVal} tenants activos
            <span style={{ ...mono, background: V.surf2, padding: "2px 7px", borderRadius: 6, color: V.iris3, fontSize: 11, letterSpacing: ".06em" }}>PROD</span>
            <span style={{ ...mono, background: V.surf2, padding: "2px 7px", borderRadius: 6, color: V.ok, fontSize: 11, letterSpacing: ".06em" }}>● HEALTHY</span>
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
          {/* KPI grid — métricas reales */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
            {(() => {
              const trialCount = tenants.filter(t => t.subscription?.status === "TRIAL").length;
              return [
                { label: "MRR",             value: `$${mrrVal.toLocaleString("es-MX",{minimumFractionDigits:0})}`, cents: ".00", delta: "",  up: true,  sub: `ARR $${Math.round(mrrVal*12/1000)}k`, sparkColor: "#9472ff", sparkPath: "M0,22 L25,20 L50,18 L75,14 L100,16 L125,11 L150,9 L175,12 L200,7 L225,5 L250,8 L275,4 L300,2" },
                { label: "Tenants activos", value: String(activeVal), cents: "", delta: "", up: true,  sub: `${tenants.length} totales`, sparkColor: "#10b981", sparkPath: "M0,18 L30,20 L60,15 L90,16 L120,12 L150,14 L180,9 L210,11 L240,6 L270,8 L300,4" },
                { label: "En trial",        value: String(trialCount), cents: "", delta: "", up: true,  sub: trialCount === 0 ? "ninguno vigente" : "vigentes", sparkColor: "#b89eff", sparkPath: "M0,16 L30,14 L60,17 L90,13 L120,15 L150,10 L180,12 L210,8 L240,10 L270,6 L300,5" },
                { label: "Sedes totales",   value: String(tenants.reduce((s, t) => s + (t._count?.locations ?? 0), 0)), cents: "", delta: "", up: true, sub: `${tenants.reduce((s, t) => s + (t._count?.users ?? 0), 0)} usuarios`, sparkColor: "#f59e0b", sparkPath: "M0,8 L30,10 L60,7 L90,9 L120,6 L150,8 L180,5 L210,7 L240,4 L270,6 L300,3" },
              ];
            })().map(k => (
              <div key={k.label} style={{ ...card(), padding: "18px 20px" }}>
                <div style={{ ...mono, fontSize: 10, color: V.txMut, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>{k.label}</div>
                <div style={{ ...display, fontWeight: 800, fontSize: 36, color: V.txHi, letterSpacing: "-.02em", lineHeight: 1 }}>
                  {k.value}<span style={{ fontSize: 18, color: V.txMut, fontWeight: 600 }}>{k.cents}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                  {k.delta
                    ? <span style={{ ...mono, display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: k.up ? V.okS : V.errS, color: k.up ? V.ok : V.err }}>{k.delta}</span>
                    : <span />
                  }
                  <span style={{ fontSize: 11, color: V.txMut }}>{k.sub}</span>
                </div>
                <svg viewBox="0 0 300 28" preserveAspectRatio="none" style={{ width: "100%", height: 28, marginTop: 10 }}>
                  <path d={k.sparkPath} stroke={k.sparkColor} strokeWidth="1.5" fill="none"/>
                </svg>
              </div>
            ))}
          </div>

          {/* MRR Chart + Health */}
          <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 14, marginBottom: 14 }}>
            {/* MRR chart */}
            <div style={{ ...card(), padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi }}>Crecimiento MRR</div>
                  <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>Últimos 12 meses · neto por movimiento</div>
                </div>
                <div style={{ display: "flex", gap: 14 }}>
                  {[{ color: "#10b981", label: "Nuevo" }, { color: "#9472ff", label: "Expansion" }, { color: "#ef4444", label: "Churn" }].map(l => (
                    <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: V.txMid }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />{l.label}
                    </div>
                  ))}
                </div>
              </div>
              <svg viewBox="0 0 800 260" preserveAspectRatio="none" style={{ width: "100%", height: 260 }}>
                <g stroke="rgba(255,255,255,.06)" strokeWidth="1">
                  {[40,100,160,220].map(y => <line key={y} x1="50" y1={y} x2="780" y2={y}/>)}
                </g>
                <g fontFamily="DM Mono" fontSize="10" fill="#9494b8">
                  {[["$50k",44],["$35k",104],["$20k",164],["$5k",224]].map(([v,y]) => <text key={v as string} x="42" y={y} textAnchor="end">{v}</text>)}
                </g>
                <g fontFamily="DM Mono" fontSize="9" fill="#6e6e92" textAnchor="middle">
                  {[["MAY",85],["JUN",145],["JUL",205],["AGO",265],["SEP",325],["OCT",385],["NOV",445],["DIC",505],["ENE",565],["FEB",625],["MAR",685]].map(([l,x]) => (
                    <text key={l} x={x} y="244">{l}</text>
                  ))}
                  <text x="745" y="244" fill="#b89eff" fontWeight="700">ABR</text>
                </g>
                {[
                  [72,180,40], [132,165,55], [192,148,72], [252,132,88], [312,112,108],
                  [372,95,125], [432,82,138], [492,70,150], [552,58,162], [612,52,168], [672,45,175],
                ].map(([tx,y,h]) => (
                  <g key={tx} transform={`translate(${tx},0)`}>
                    <rect y={y} width="26" height={h} fill="#10b981" opacity=".9" rx="2"/>
                    {h > 55 && <rect y={y-14} width="26" height="12" fill="#9472ff" rx="2"/>}
                  </g>
                ))}
                <g transform="translate(732,0)"><rect y="42" width="26" height="178" fill="#b89eff" rx="2"/></g>
                <path d="M 85,180 L 145,155 L 205,136 L 265,118 L 325,95 L 385,70 L 445,62 L 505,42 L 565,34 L 625,22 L 685,18 L 745,22" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round"/>
                <circle cx="745" cy="22" r="4" fill="#fff" stroke="#b89eff" strokeWidth="2"/>
                <g transform="translate(600,10)">
                  <rect width="140" height="38" rx="8" fill="#15152a" stroke="rgba(124,58,237,.3)"/>
                  <text x="12" y="16" fontFamily="DM Mono" fontSize="9" fill="#9494b8" letterSpacing=".1em">ABR 2026 · HOY</text>
                  <text x="12" y="32" fontFamily="Syne" fontSize="14" fontWeight="800" fill="#fff">${mrrVal.toLocaleString("es-MX")}</text>
                </g>
              </svg>
            </div>

            {/* Platform health */}
            <div style={{ ...card(), padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi }}>Salud de plataforma</div>
                  <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>Tiempo real</div>
                </div>
                <span style={{ ...mono, display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: ".06em", background: V.okS, color: V.ok }}>
                  <span className="sa-live" style={{ width: 5, height: 5, borderRadius: "50%", background: V.ok, display: "inline-block" }} />OPERATIONAL
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {(health?.metrics ?? []).length === 0
                  ? <EmptyBlock text="Sin métricas de salud disponibles" />
                  : (health?.metrics ?? []).map(h => (
                    <div key={h.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: V.txMid }}>{h.label}</span>
                        <span style={{ ...mono, color: V.txHi, fontWeight: 600 }}>{h.value}</span>
                      </div>
                      <div style={{ height: 4, background: V.surf2, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${h.pct}%`, background: h.color }} />
                      </div>
                    </div>
                  ))}
              </div>
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${V.bd1}`, display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: V.txDim, letterSpacing: ".1em" }}>PEDIDOS · 24H</div>
                  <div style={{ ...display, fontSize: 22, fontWeight: 800, color: V.txHi, marginTop: 2 }}>
                    {(health?.orders24h ?? 0).toLocaleString("es-MX")}
                  </div>
                </div>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: V.txDim, letterSpacing: ".1em" }}>GMV · 24H</div>
                  <div style={{ ...display, fontSize: 22, fontWeight: 800, color: V.txHi, marginTop: 2 }}>
                    {currency(health?.gmv24h ?? 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Plan dist + Top tenants + New signups */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {/* Plan distribution */}
            <div style={{ ...card(), padding: 20 }}>
              <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi, marginBottom: 4 }}>Distribución por plan</div>
              <div style={{ fontSize: 11, color: V.txMut, marginBottom: 14 }}>{activeVal} tenants activos</div>
              <svg viewBox="0 0 120 120" style={{ width: 140, height: 140, display: "block", margin: "0 auto" }}>
                <circle cx="60" cy="60" r="48" fill="none" stroke="#15152a" strokeWidth="16"/>
                <circle cx="60" cy="60" r="48" fill="none" stroke="#3b82f6" strokeWidth="16" strokeDasharray="120.6 301.6" transform="rotate(-90 60 60)"/>
                <circle cx="60" cy="60" r="48" fill="none" stroke="#9472ff" strokeWidth="16" strokeDasharray="135.7 301.6" strokeDashoffset="-120.6" transform="rotate(-90 60 60)"/>
                <circle cx="60" cy="60" r="48" fill="none" stroke="#7c3aed" strokeWidth="16" strokeDasharray="45.2 301.6" strokeDashoffset="-256.3" transform="rotate(-90 60 60)"/>
                <text x="60" y="56" textAnchor="middle" fontFamily="DM Mono" fontSize="9" fill="#9494b8">TENANTS</text>
                <text x="60" y="72" textAnchor="middle" fontFamily="Syne" fontWeight="800" fontSize="18" fill="#fff">{activeVal}</text>
              </svg>
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                {[{ color: "#3b82f6", label: "Starter",    n: mrr?.byPlan?.STARTER?.count    ?? 0 },
                  { color: "#9472ff", label: "Pro",        n: mrr?.byPlan?.PRO?.count        ?? 0 },
                  { color: "#7c3aed", label: "Enterprise", n: mrr?.byPlan?.ENTERPRISE?.count ?? 0 }].map(p => (
                  <div key={p.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
                      <span style={{ fontSize: 13, color: V.txMid }}>{p.label}</span>
                    </div>
                    <Num>{p.n}</Num>
                  </div>
                ))}
              </div>
            </div>

            {/* Top tenants */}
            <div style={{ ...card(), padding: 20 }}>
              <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi, marginBottom: 4 }}>Top tenants · MRR</div>
              <div style={{ fontSize: 11, color: V.txMut, marginBottom: 14 }}>Este mes</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {topTenants.length === 0
                  ? <EmptyBlock text="Sin tenants activos todavía" />
                  : topTenants.map((t, i) => (
                    <div key={t.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: i < topTenants.length - 1 ? `1px solid ${V.bd1}` : "none" }}>
                      <TenantLogo name={t.name} size={32} />
                      <div>
                        <div style={{ color: V.tx, fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                        <div style={{ ...mono, fontSize: 10, color: V.txMut }}>
                          {(t.planDisplay || t.plan || "—")} · {t.restaurants} {t.restaurants === 1 ? "marca" : "marcas"}
                        </div>
                      </div>
                      <Num>{currency(t.mrr)}</Num>
                    </div>
                  ))}
              </div>
            </div>

            {/* New signups */}
            <div style={{ ...card(), padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi }}>Nuevos · 30 días</div>
                  <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>{newSignups.length} signups</div>
                </div>
                {newSignups.length > 0 && <StatusChip status={newSignups[0].subscription?.status ?? "TRIAL"} />}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {newSignups.length === 0
                  ? <EmptyBlock text="Sin signups en los últimos 30 días" />
                  : newSignups.map((t, i) => (
                    <div key={t.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: i < newSignups.length - 1 ? `1px solid ${V.bd1}` : "none" }}>
                      <TenantLogo name={t.name} size={32} />
                      <div>
                        <div style={{ color: V.tx, fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                        <div style={{ ...mono, fontSize: 10, color: V.txMut }}>{daysAgoLabel(t.createdAt)}</div>
                      </div>
                      <StatusChip status={t.subscription?.status ?? "TRIAL"} />
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
              <thead><tr><TH>Tenant</TH><TH>Plan</TH><TH>Estado</TH><TH>MRR</TH><TH>Sedes</TH><TH>Usuarios</TH><TH>Pedidos</TH><TH>Acciones</TH></tr></thead>
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
                          <div style={{ ...mono, fontSize: 10, color: V.txMut }}>{t.domain ?? `${t.slug}.mrtpvrest.app`}</div>
                        </div>
                      </div>
                    </TD>
                    <TD><PlanPill name={t.subscription?.plan?.name} /></TD>
                    <TD><StatusChip status={t.subscription?.status} /></TD>
                    <TD><Num>${t.subscription?.priceSnapshot ?? 0}</Num></TD>
                    <TD><Num>{t._count.locations}</Num></TD>
                    <TD><Num>{t._count.users}</Num></TD>
                    <TD><Num>{t._count.orders}</Num></TD>
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
            <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${V.bd1}` }}>
              <div style={{ fontSize: 12, color: V.txMut }}>Mostrando {filteredTenants.length} de {tenants.length} tenants</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["←","1","2","3","→"].map(p => <button key={p} style={{ ...btn(), padding: "6px 10px", ...(p === "1" ? { background: V.irisS, color: V.iris3 } : {}) }}>{p}</button>)}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ BILLING ════════════════════════════════════════════ */}
      {tab === "billing" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
            {(() => {
              const paid     = invoices.filter(i => i.status === "PAID");
              const failed   = invoices.filter(i => i.status === "FAILED");
              const pending  = invoices.filter(i => i.status === "PENDING");
              const refunded = invoices.filter(i => i.status === "REFUNDED");
              const sum = (arr: InvoiceRow[]) => arr.reduce((s, r) => s + (r.amount || 0), 0);
              return [
                { label: "Cobrado · mes", value: currency(sum(paid)),     delta: "", up: true,  sub: `${paid.length} facturas`  },
                { label: "Vencido",       value: currency(sum(failed)),   delta: "", up: false, sub: `${failed.length} casos`, color: V.warn },
                { label: "Dunning activo",value: String(pending.length),  delta: "", up: true,  sub: `${pending.length} pendientes` },
                { label: "Refunds · mes", value: currency(sum(refunded)), delta: "", up: true,  sub: `${refunded.length} casos` },
              ];
            })().map(k => (
              <div key={k.label} style={{ ...card(), padding: "18px 20px" }}>
                <div style={{ ...mono, fontSize: 10, color: V.txMut, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>{k.label}</div>
                <div style={{ ...display, fontWeight: 800, fontSize: 32, color: k.color ?? V.txHi, letterSpacing: "-.02em", lineHeight: 1 }}>{k.value}</div>
                <div style={{ marginTop: 10, fontSize: 11, color: V.txMut }}>{k.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ ...card(), padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${V.bd1}` }}>
              <div>
                <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi }}>Facturas recientes</div>
                <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>Últimas 60 facturas · abril 2026</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btn()}>Estado ▾</button>
                <button style={btn()}>Descargar CSV</button>
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <TH>Nº</TH><TH>Tenant</TH><TH>Monto</TH><TH>Estado</TH><TH>Emisión</TH><TH> </TH>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 && <EmptyRow cols={6} text="Sin facturas emitidas" />}
                {invoices.map(inv => {
                  const tenantName = inv.subscription?.tenant?.name ?? "—";
                  const planLine   = inv.subscription?.plan?.displayName ?? "—";
                  return (
                    <tr key={inv.id} className="sa-tr">
                      <TD><span style={{ ...mono, color: V.iris3 }}>{inv.id.slice(0, 10).toUpperCase()}</span></TD>
                      <TD>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <TenantLogo name={tenantName} size={26} />
                          <div>
                            <div style={{ color: V.tx, fontWeight: 600, fontSize: 13 }}>{tenantName}</div>
                            <div style={{ ...mono, fontSize: 10, color: V.txMut }}>{planLine}</div>
                          </div>
                        </div>
                      </TD>
                      <TD><Num>{currency(inv.amount)}</Num></TD>
                      <TD><StatusChip status={inv.status} /></TD>
                      <TD>
                        <span style={{ ...mono, fontSize: 11, color: V.txMut }}>
                          {new Date(inv.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      </TD>
                      <TD right><span style={{ color: V.txMut }}>↓</span></TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ PLANES ═════════════════════════════════════════════ */}
      {tab === "plans" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            {plans.length === 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <EmptyBlock text="Sin planes configurados. Crea uno desde el catálogo de planes del SaaS." />
              </div>
            )}
            {plans.slice(0, 3).map((p, i) => {
              const isPro = p.name.toUpperCase() === "PRO";
              const byP = mrr?.byPlan?.[p.name.toUpperCase()] ?? { count: 0, mrr: 0 };
              const churnColor = V.ok;
              return (
                <div key={p.id} style={{
                  ...card(), padding: 24, position: "relative",
                  ...(isPro ? { borderColor: "rgba(124,58,237,.3)", background: `linear-gradient(180deg,rgba(124,58,237,.06),transparent 50%),${V.surf1}` } : {}),
                }}>
                  {isPro && <div style={{ position: "absolute", top: 16, right: 16 }}><PlanPill name="Enterprise" /><span style={{ ...mono, marginLeft: 4, fontSize: 9, color: V.iris3, letterSpacing: ".1em" }}>MÁS ELEGIDO</span></div>}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ ...display, fontWeight: 800, fontSize: 20, color: V.txHi }}>{p.displayName}</div>
                    <button onClick={() => openEdit({ id: p.id, name: p.name, slug: "", domain: null, logoUrl: null, isActive: true, subscription: null, _count: { locations: 0, users: 0, orders: 0 } } as any)} style={btn()}>Editar</button>
                  </div>
                  <div style={{ fontSize: 11, color: V.txMut, marginBottom: 10 }}>
                    {["Restaurantes pequeños · 1 sede","Crecimiento · 2-8 sedes","Cadenas · 9+ sedes · white-label"][i]}
                  </div>
                  <div style={{ ...display, fontWeight: 800, fontSize: 40, color: V.txHi, letterSpacing: "-.03em" }}>
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
                    {[{ n: String(byP.count), l: "TENANTS" }, { n: `$${byP.mrr.toLocaleString("es-MX")}`, l: "MRR TOTAL" }, { n: "—", l: "CHURN", color: churnColor }].map(s => (
                      <div key={s.l}>
                        <div style={{ ...display, fontWeight: 800, color: s.color ?? V.txHi, fontSize: 18 }}>{s.n}</div>
                        <div style={{ ...mono, fontSize: 9, color: V.txMut, letterSpacing: ".1em", marginTop: 2 }}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
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

      {/* ═══ LOGS ═══════════════════════════════════════════════ */}
      {tab === "logs" && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, maxWidth: 400, position: "relative" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: "absolute", top: 10, left: 12, opacity: .5, pointerEvents: "none" }}>
                <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="Buscar en logs... (e.g. tenant:lacasona, error)"
                style={{ width: "100%", padding: "9px 14px 9px 38px", background: V.surf1, border: `1px solid ${V.bd1}`, borderRadius: 10, color: V.tx, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            </div>
            {["Nivel: Todos ▾","Tenant: Todos ▾","Últimas 24h ▾"].map(f => <button key={f} style={btn()}>{f}</button>)}
            <button style={{ ...btn(), marginLeft: "auto", color: V.ok }}>
              <span className="sa-live" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: V.ok, marginRight: 6 }} />
              Live tail
            </button>
          </div>
          <div style={{ ...card(), padding: 0, overflow: "hidden", fontFamily: "'DM Mono',monospace" }}>
            <div style={{ display: "grid", gridTemplateColumns: "110px 80px 1fr 140px", gap: 14, padding: "10px 20px", background: V.surf2, fontSize: 10, color: V.txDim, letterSpacing: ".12em", textTransform: "uppercase" }}>
              <div>Tiempo</div><div>Nivel</div><div>Mensaje</div><div>Contexto</div>
            </div>
            {filteredLogs.length === 0 && (
              <div style={{ padding: 48, textAlign: "center", color: V.txMut, fontSize: 13 }}>
                Sin eventos registrados
              </div>
            )}
            {filteredLogs.map((l, i) => {
              const lc = LOG_COLORS[l.level] ?? { bg: V.surf2, color: V.txMut };
              return (
                <div key={l.id ?? i} className="sa-tr" style={{ display: "grid", gridTemplateColumns: "110px 80px 1fr 140px", gap: 14, padding: "10px 20px", borderBottom: i < filteredLogs.length - 1 ? `1px solid ${V.bd1}` : "none", fontSize: 12, alignItems: "center", cursor: "default" }}>
                  <span style={{ color: V.txMut, fontSize: 11 }}>{formatTime(l.createdAt)}</span>
                  <span style={{ background: lc.bg, color: lc.color, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", padding: "2px 7px", borderRadius: 5, textAlign: "center" }}>{l.level}</span>
                  <span style={{ color: V.txMid }}>{l.message}</span>
                  <span style={{ color: V.txDim, fontSize: 10, textAlign: "right" }}>{l.context ?? ""}</span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 14, fontSize: 11, color: V.txMut }}>
            Mostrando {filteredLogs.length} eventos · últimas 24h ·{" "}
            <span style={{ color: V.iris3 }}>live</span>
          </div>
        </>
      )}

      {/* ═══ API KEYS ════════════════════════════════════════════ */}
      {tab === "api" && (
        <div style={{ ...card(), padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${V.bd1}` }}>
            <div>
              <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi }}>API keys & webhooks</div>
              <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>Credenciales emitidas a tenants</div>
            </div>
            <button style={btn(true)}>+ Emitir key</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr><TH>Tenant</TH><TH>Key (prefix)</TH><TH>Ámbito</TH><TH>Último uso</TH><TH>Req · 24h</TH><TH>Estado</TH><TH> </TH></tr>
            </thead>
            <tbody>
              {apiKeys.length === 0 && <EmptyRow cols={7} text="Sin API keys emitidas" />}
              {apiKeys.map(k => {
                const tenant = tenants.find(t => t.id === k.tenantId);
                return (
                  <tr key={k.id} className="sa-tr">
                    <TD>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <TenantLogo name={tenant?.name ?? k.name} size={32} />
                        <div>
                          <div style={{ color: V.tx, fontWeight: 600, fontSize: 13 }}>{k.name}</div>
                          <div style={{ ...mono, fontSize: 10, color: V.txMut }}>{tenant?.name ?? "Plataforma"}</div>
                        </div>
                      </div>
                    </TD>
                    <TD><span style={{ ...mono, color: V.iris3 }}>{k.prefix}…</span></TD>
                    <TD><span style={{ ...mono, fontSize: 11, color: V.txMid }}>{k.scopes.join(" ") || "—"}</span></TD>
                    <TD><span style={{ ...mono, fontSize: 11, color: V.txMut }}>{k.lastUsedAt ? daysAgoLabel(k.lastUsedAt) : "Nunca"}</span></TD>
                    <TD><Num>{k.requests24h.toLocaleString("es-MX")}</Num></TD>
                    <TD><StatusChip status={k.active ? "ACTIVE" : "CANCELLED"} /></TD>
                    <TD right><span style={{ color: V.txMut, cursor: "pointer" }}>⋯</span></TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                    { label: "Nombre del negocio", key: "name", ph: "Ej: La Casona Gastro", required: true },
                    { label: "Slug URL", key: "slug", ph: "ej: la-casona", required: true, mono: true },
                    { label: "Dominio (opcional)", key: "domain", ph: "mirestaurante.com", mono: true },
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
