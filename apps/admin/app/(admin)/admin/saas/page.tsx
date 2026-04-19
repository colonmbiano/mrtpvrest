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

/* ── Mock data ───────────────────────────────────────────────── */
const HEALTH = [
  { label: "API uptime",     value: "99.98%", pct: 99.98, color: V.ok   },
  { label: "p95 latencia",   value: "142 ms", pct: 24,    color: V.ok   },
  { label: "Error rate",     value: "0.12%",  pct: 4,     color: V.ok   },
  { label: "Cola de jobs",   value: "18 pend.",pct: 18,   color: V.warn },
  { label: "DB conexiones",  value: "84/200", pct: 42,    color: V.ok   },
];
const TOP_TENANTS = [
  { initials: "LC", name: "La Casona Gastro",  sub: "ENTERPRISE · 12 sedes", mrr: "$2,480", grad: LOGO_GRADS[0] },
  { initials: "TB", name: "Tacos Bravo",        sub: "ENTERPRISE · 8 sedes",  mrr: "$1,940", grad: LOGO_GRADS[1] },
  { initials: "CV", name: "Cantina del Valle",  sub: "PRO · 3 sedes",         mrr: "$680",   grad: LOGO_GRADS[2] },
  { initials: "PV", name: "Pizza Venecia",      sub: "PRO · 5 sedes",         mrr: "$620",   grad: LOGO_GRADS[3] },
  { initials: "SF", name: "Sushi Fusion",       sub: "PRO · 4 sedes",         mrr: "$580",   grad: LOGO_GRADS[4] },
];
const NEW_TENANTS = [
  { initials: "MT", name: "Mama Teresa",       sub: "Hace 2 días",  status: "TRIAL",  grad: LOGO_GRADS[5] },
  { initials: "EL", name: "El Fogón",          sub: "Hace 4 días",  status: "ACTIVE", grad: LOGO_GRADS[6] },
  { initials: "RZ", name: "Ramen Zen",         sub: "Hace 6 días",  status: "TRIAL",  grad: LOGO_GRADS[7] },
  { initials: "BC", name: "Birria Cienfuegos", sub: "Hace 8 días",  status: "ACTIVE", grad: LOGO_GRADS[8] },
  { initials: "CM", name: "Café Matcha",       sub: "Hace 11 días", status: "TRIAL",  grad: LOGO_GRADS[9] },
];
const LOGS = [
  { time: "14:32:08.412", level: "ERROR", msg: "[sushifusion] payment.intent.failed — card_declined · INV-20840",           ctx: "billing · stripe" },
  { time: "14:31:44.102", level: "INFO",  msg: "[lacasona] order.created #42108 — 4 items · $1,280",                        ctx: "orders · tpv-03"  },
  { time: "14:30:22.887", level: "WARN",  msg: "[cantina] inventory.low threshold — Trompo pastor at 12%",                  ctx: "inventory"         },
  { time: "14:29:12.544", level: "OK",    msg: "[mamateresa] tenant.created — trial started · starter plan",                ctx: "onboarding"        },
  { time: "14:28:08.221", level: "INFO",  msg: "[tacosbravo] employee.login — maria.r@... · sede 03",                      ctx: "auth"              },
  { time: "14:27:33.102", level: "ERROR", msg: "[system] webhook.delivery_failed — pizzavenecia · retry 2/3",               ctx: "webhooks"          },
  { time: "14:26:18.748", level: "INFO",  msg: "[elfogon] menu.updated — 3 items agregados, 1 precio actualizado",          ctx: "menu · admin"      },
  { time: "14:25:02.330", level: "OK",    msg: "[pizzavenecia] invoice.paid — INV-20839 · $620",                            ctx: "billing"           },
  { time: "14:24:44.112", level: "WARN",  msg: "[ramenzen] api.rate_limit_approaching — 820/1000 req/min",                  ctx: "api"               },
  { time: "14:23:12.998", level: "INFO",  msg: "[cantina] shift.opened — carlos.r · $5,200 efectivo inicial",               ctx: "tpv · caja-01"    },
  { time: "14:22:05.441", level: "INFO",  msg: "[lacasona] delivery.completed — juan.lopez · 8 min · $340",                ctx: "delivery"          },
  { time: "14:21:33.877", level: "ERROR", msg: "[birria] printer.timeout — kitchen-01 offline 30s",                         ctx: "hardware"          },
  { time: "14:20:18.204", level: "OK",    msg: "[tacosbravo] backup.completed — 2.4 GB · daily",                            ctx: "system"            },
];
const LOG_COLORS: Record<string, { bg: string; color: string }> = {
  ERROR: { bg: V.errS,  color: V.err  },
  WARN:  { bg: V.warnS, color: V.warn },
  INFO:  { bg: V.infoS, color: V.info },
  OK:    { bg: V.okS,   color: V.ok   },
};
const API_KEYS = [
  { initials: "LC", name: "La Casona Gastro", sub: "12 sedes", key: "mrt_live_lc_48Kz…", scope: "read:* write:orders", used: "Hace 2 min",  reqs: "12,480", status: "ACTIVE", grad: LOGO_GRADS[0] },
  { initials: "TB", name: "Tacos Bravo",       sub: "8 sedes",  key: "mrt_live_tb_9Qp…", scope: "read:* write:*",      used: "Hace 8 min",  reqs: "8,240",  status: "ACTIVE", grad: LOGO_GRADS[1] },
  { initials: "PV", name: "Pizza Venecia",     sub: "5 sedes",  key: "mrt_live_pv_2Hx…", scope: "read:menu write:orders", used: "Hace 22 min", reqs: "3,420", status: "ACTIVE", grad: LOGO_GRADS[3] },
  { initials: "RZ", name: "Ramen Zen",         sub: "1 sede",   key: "mrt_test_rz_7Yt…", scope: "test · read-only",    used: "Ayer",        reqs: "820",    status: "TEST",   grad: LOGO_GRADS[7] },
  { initials: "BH", name: "Bar Hemingway",     sub: "(revocado)",key: "mrt_live_bh_0Lm…", scope: "—",                   used: "Hace 14 días",reqs: "0",      status: "CANCELLED", grad: "linear-gradient(135deg,#64748b,#334155)" },
];
const INVOICES = [
  { num: "INV-20842", initials: "LC", name: "La Casona Gastro", sub: "ENTERPRISE · mensual", amount: "$2,480", status: "ACTIVE",   date: "18 abr 2026", grad: LOGO_GRADS[0] },
  { num: "INV-20841", initials: "TB", name: "Tacos Bravo",      sub: "ENTERPRISE · mensual", amount: "$1,940", status: "ACTIVE",   date: "18 abr 2026", grad: LOGO_GRADS[1] },
  { num: "INV-20840", initials: "SF", name: "Sushi Fusion",     sub: "PRO · mensual",        amount: "$580",   status: "PAST_DUE", date: "15 abr 2026", grad: LOGO_GRADS[4] },
  { num: "INV-20839", initials: "PV", name: "Pizza Venecia",    sub: "PRO · mensual",        amount: "$620",   status: "ACTIVE",   date: "15 abr 2026", grad: LOGO_GRADS[3] },
  { num: "INV-20838", initials: "CV", name: "Cantina del Valle",sub: "PRO · mensual",        amount: "$680",   status: "ACTIVE",   date: "14 abr 2026", grad: LOGO_GRADS[2] },
  { num: "INV-20837", initials: "EL", name: "El Fogón",         sub: "PRO · mensual",        amount: "$420",   status: "ACTIVE",   date: "12 abr 2026", grad: LOGO_GRADS[6] },
  { num: "INV-20836", initials: "BH", name: "Bar Hemingway",    sub: "STARTER · cancelado",  amount: "$89",    status: "CANCELLED",date: "4 abr 2026",  grad: "linear-gradient(135deg,#64748b,#334155)" },
];

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
  const [form, setForm] = useState({ name: "", slug: "", domain: "", logoUrl: "", planId: "" });

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
  const filteredLogs = LOGS.filter(l =>
    !logSearch || l.msg.toLowerCase().includes(logSearch.toLowerCase()) || l.ctx.includes(logSearch)
  );

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "tenants",  label: "Tenants",  count: tenants.length || 148 },
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
          {/* KPI grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "MRR",           value: `$${mrrVal.toLocaleString("es-MX",{minimumFractionDigits:0})}`, cents: ".00", delta: "↑ 12.4%", up: true,  sub: `ARR $${Math.round(mrrVal*12/1000)}k`, sparkColor: "#9472ff", sparkPath: "M0,22 L25,20 L50,18 L75,14 L100,16 L125,11 L150,9 L175,12 L200,7 L225,5 L250,8 L275,4 L300,2" },
              { label: "Tenants activos",value: String(activeVal), cents: "", delta: "↑ 9 netos", up: true, sub: "+12 / -3 este mes", sparkColor: "#10b981", sparkPath: "M0,18 L30,20 L60,15 L90,16 L120,12 L150,14 L180,9 L210,11 L240,6 L270,8 L300,4" },
              { label: "Net churn · 30d",value: "2.1", cents: "%",  delta: "↓ 0.4pp", up: false, sub: "meta < 3%", sparkColor: "#f59e0b", sparkPath: "M0,8 L30,10 L60,7 L90,9 L120,6 L150,8 L180,5 L210,7 L240,4 L270,6 L300,3" },
              { label: "Trial → paid",   value: "62", cents: "%",   delta: "↑ 4pp",   up: true,  sub: "23 en trial ahora", sparkColor: "#b89eff", sparkPath: "M0,16 L30,14 L60,17 L90,13 L120,15 L150,10 L180,12 L210,8 L240,10 L270,6 L300,5" },
            ].map(k => (
              <div key={k.label} style={{ ...card(), padding: "18px 20px" }}>
                <div style={{ ...mono, fontSize: 10, color: V.txMut, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>{k.label}</div>
                <div style={{ ...display, fontWeight: 800, fontSize: 36, color: V.txHi, letterSpacing: "-.02em", lineHeight: 1 }}>
                  {k.value}<span style={{ fontSize: 18, color: V.txMut, fontWeight: 600 }}>{k.cents}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                  <span style={{ ...mono, display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: k.up ? V.okS : V.errS, color: k.up ? V.ok : V.err }}>{k.delta}</span>
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
                {HEALTH.map(h => (
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
                  <div style={{ ...display, fontSize: 22, fontWeight: 800, color: V.txHi, marginTop: 2 }}>42,108</div>
                </div>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: V.txDim, letterSpacing: ".1em" }}>GMV · 24H</div>
                  <div style={{ ...display, fontSize: 22, fontWeight: 800, color: V.txHi, marginTop: 2 }}>$3.4M</div>
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
                {[{ color: "#3b82f6", label: "Starter", n: mrr?.byPlan?.STARTER?.count ?? 59 },
                  { color: "#9472ff", label: "Pro",     n: mrr?.byPlan?.PRO?.count ?? 67 },
                  { color: "#7c3aed", label: "Enterprise", n: mrr?.byPlan?.ENTERPRISE?.count ?? 22 }].map(p => (
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
                {TOP_TENANTS.map((t, i) => (
                  <div key={t.name} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: i < TOP_TENANTS.length - 1 ? `1px solid ${V.bd1}` : "none" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: t.grad, display: "grid", placeItems: "center", color: "#fff", ...display, fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{t.initials}</div>
                    <div>
                      <div style={{ color: V.tx, fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                      <div style={{ ...mono, fontSize: 10, color: V.txMut }}>{t.sub}</div>
                    </div>
                    <Num>{t.mrr}</Num>
                  </div>
                ))}
              </div>
            </div>

            {/* New signups */}
            <div style={{ ...card(), padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ ...display, fontWeight: 700, fontSize: 15, color: V.txHi }}>Nuevos · 30 días</div>
                  <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>12 signups</div>
                </div>
                <StatusChip status="ACTIVE" />
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {NEW_TENANTS.map((t, i) => (
                  <div key={t.name} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: i < NEW_TENANTS.length - 1 ? `1px solid ${V.bd1}` : "none" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: t.grad, display: "grid", placeItems: "center", color: "#fff", ...display, fontWeight: 800, fontSize: 12 }}>{t.initials}</div>
                    <div>
                      <div style={{ color: V.tx, fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                      <div style={{ ...mono, fontSize: 10, color: V.txMut }}>{t.sub}</div>
                    </div>
                    <StatusChip status={t.status} />
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
            {[
              { label: "Cobrado · mes", value: "$46,120", delta: "↑ 14%",  up: true,  sub: "142 facturas"  },
              { label: "Vencido",       value: "$2,480",  delta: "↑ $620", up: false, sub: "6 tenants", color: V.warn },
              { label: "Dunning activo",value: "8",       delta: "",        up: true,  sub: "3 retries hoy" },
              { label: "Refunds · mes", value: "$340",    delta: "",        up: true,  sub: "2 casos"       },
            ].map(k => (
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
                {INVOICES.map(inv => (
                  <tr key={inv.num} className="sa-tr">
                    <TD><span style={{ ...mono, color: V.iris3 }}>{inv.num}</span></TD>
                    <TD>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: inv.grad, display: "grid", placeItems: "center", color: "#fff", ...display, fontWeight: 800, fontSize: 10, flexShrink: 0 }}>{inv.initials}</div>
                        <div>
                          <div style={{ color: V.tx, fontWeight: 600, fontSize: 13 }}>{inv.name}</div>
                          <div style={{ ...mono, fontSize: 10, color: V.txMut }}>{inv.sub}</div>
                        </div>
                      </div>
                    </TD>
                    <TD><Num>{inv.amount}</Num></TD>
                    <TD><StatusChip status={inv.status} /></TD>
                    <TD><span style={{ ...mono, fontSize: 11, color: V.txMut }}>{inv.date}</span></TD>
                    <TD right><span style={{ color: V.txMut }}>↓</span></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ PLANES ═════════════════════════════════════════════ */}
      {tab === "plans" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            {(plans.length > 0 ? plans : [
              { id: "s", name: "STARTER",    displayName: "Starter",    price: 89,  maxLocations: 1, maxEmployees: 10, hasKDS: false, hasLoyalty: false, hasInventory: false, hasReports: false },
              { id: "p", name: "PRO",        displayName: "Pro",        price: 249, maxLocations: 8, maxEmployees: 999, hasKDS: true, hasLoyalty: true, hasInventory: true, hasReports: true },
              { id: "e", name: "ENTERPRISE", displayName: "Enterprise", price: 0,   maxLocations: 999, maxEmployees: 999, hasKDS: true, hasLoyalty: true, hasInventory: true, hasReports: true },
            ] as Plan[]).slice(0, 3).map((p, i) => {
              const isPro = p.name.toUpperCase() === "PRO";
              const byP = mrr?.byPlan?.[p.name] ?? { count: [59,67,22][i], mrr: [5251,16683,26686][i] };
              const churn = ["3.4%","1.8%","0.4%"][i];
              const churnColor = i === 0 ? V.warn : V.ok;
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
                    {[{ n: String(byP.count), l: "TENANTS" }, { n: `$${byP.mrr.toLocaleString("es-MX")}`, l: "MRR TOTAL" }, { n: churn, l: "CHURN", color: churnColor }].map(s => (
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
            {filteredLogs.map((l, i) => {
              const lc = LOG_COLORS[l.level] ?? { bg: V.surf2, color: V.txMut };
              return (
                <div key={i} className="sa-tr" style={{ display: "grid", gridTemplateColumns: "110px 80px 1fr 140px", gap: 14, padding: "10px 20px", borderBottom: i < filteredLogs.length - 1 ? `1px solid ${V.bd1}` : "none", fontSize: 12, alignItems: "center", cursor: "default" }}>
                  <span style={{ color: V.txMut, fontSize: 11 }}>{l.time}</span>
                  <span style={{ background: lc.bg, color: lc.color, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", padding: "2px 7px", borderRadius: 5, textAlign: "center" }}>{l.level}</span>
                  <span style={{ color: V.txMid }}>{l.msg.replace(/\[(\w+)\]/, (_, t) => `[${t}]`)}</span>
                  <span style={{ color: V.txDim, fontSize: 10, textAlign: "right" }}>{l.ctx}</span>
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
              {API_KEYS.map(k => (
                <tr key={k.key} className="sa-tr">
                  <TD>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: k.grad, display: "grid", placeItems: "center", color: "#fff", ...display, fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{k.initials}</div>
                      <div>
                        <div style={{ color: V.tx, fontWeight: 600, fontSize: 13 }}>{k.name}</div>
                        <div style={{ ...mono, fontSize: 10, color: V.txMut }}>{k.sub}</div>
                      </div>
                    </div>
                  </TD>
                  <TD><span style={{ ...mono, color: V.iris3 }}>{k.key}</span></TD>
                  <TD><span style={{ ...mono, fontSize: 11, color: k.scope.includes("test") ? V.warn : V.txMid }}>{k.scope}</span></TD>
                  <TD><span style={{ ...mono, fontSize: 11, color: V.txMut }}>{k.used}</span></TD>
                  <TD><Num>{k.reqs}</Num></TD>
                  <TD><StatusChip status={k.status} /></TD>
                  <TD right><span style={{ color: V.txMut, cursor: "pointer" }}>⋯</span></TD>
                </tr>
              ))}
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
