"use client";
import { useState, useEffect } from "react";
import api from "@/lib/api";

interface Tenant {
  id: string; name: string; slug: string; createdAt: string;
  onboardingDone: boolean; onboardingStep: number;
  subscription: { status: string; trialEndsAt: string | null; plan: { displayName: string } | null } | null;
}

interface LogEntry {
  id: string; type: "register" | "trial_warn" | "expired" | "active" | "suspended";
  tenant: string; detail: string; time: string; color: string;
}

const TYPE_COLOR: Record<string, string> = {
  register:   "var(--blue)",
  trial_warn: "var(--amber)",
  expired:    "var(--red)",
  active:     "var(--green)",
  suspended:  "var(--red)",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return "ahora";
  if (m < 60) return `hace ${m}m`;
  if (h < 24) return `hace ${h}h`;
  if (d < 7)  return `hace ${d}d`;
  return new Date(iso).toLocaleDateString("es-MX", { day:"2-digit", month:"short" });
}

function buildLogs(tenants: Tenant[]): LogEntry[] {
  const logs: LogEntry[] = [];
  for (const t of tenants) {
    logs.push({ id: `reg-${t.id}`, type:"register", tenant: t.name,
      detail: `Se registró → plan ${t.subscription?.plan?.displayName ?? "trial"}`,
      time: t.createdAt, color: TYPE_COLOR.register });

    if (t.subscription?.status === "ACTIVE") {
      logs.push({ id: `act-${t.id}`, type:"active", tenant: t.name,
        detail: "Suscripción activada — pagando",
        time: t.createdAt, color: TYPE_COLOR.active });
    }
    if (t.subscription?.status === "SUSPENDED") {
      logs.push({ id: `sus-${t.id}`, type:"suspended", tenant: t.name,
        detail: "Cuenta suspendida",
        time: t.subscription.trialEndsAt ?? t.createdAt, color: TYPE_COLOR.suspended });
    }
    if (t.subscription?.status === "EXPIRED") {
      logs.push({ id: `exp-${t.id}`, type:"expired", tenant: t.name,
        detail: "Trial expirado sin conversión",
        time: t.subscription.trialEndsAt ?? t.createdAt, color: TYPE_COLOR.expired });
    }
    if (t.subscription?.status === "TRIAL" && t.subscription.trialEndsAt) {
      const days = Math.ceil((new Date(t.subscription.trialEndsAt).getTime() - Date.now()) / 86400000);
      if (days >= 0 && days <= 3) {
        logs.push({ id: `warn-${t.id}`, type:"trial_warn", tenant: t.name,
          detail: `Trial vence en ${days}d — sin convertir`,
          time: new Date().toISOString(), color: TYPE_COLOR.trial_warn });
      }
    }
  }
  return logs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

const TYPE_LABEL: Record<string, string> = {
  ALL: "Todos", register: "Registro", active: "Activación",
  trial_warn: "Trial warning", expired: "Expirado", suspended: "Suspendido",
};

export default function LogsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("ALL");
  const [search,  setSearch]  = useState("");

  useEffect(() => {
    api.get("/api/saas/tenants").catch(() => ({ data: [] }))
      .then(r => { setTenants(r.data); setLoading(false); });
  }, []);

  const allLogs = buildLogs(tenants);
  const logs = allLogs.filter(l => {
    const matchFilter = filter === "ALL" || l.type === filter;
    const matchSearch = l.tenant.toLowerCase().includes(search.toLowerCase()) ||
                        l.detail.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    total:     allLogs.length,
    registers: allLogs.filter(l => l.type === "register").length,
    warnings:  allLogs.filter(l => l.type === "trial_warn").length,
    expired:   allLogs.filter(l => l.type === "expired").length,
  };

  return (
    <>
      <div className="db-topbar">
        <div className="db-topbar-left">
          <h1>Logs de actividad</h1>
          <p>Feed de eventos de marcas — {counts.total} entradas</p>
        </div>
        <div className="db-topbar-right">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar marca o evento…"
            style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8,
              padding:"6px 12px", fontSize:12, color:"var(--text)", outline:"none", width:200 }} />
        </div>
      </div>

      <div className="db-content">
        <div className="db-metrics">
          {[
            { l:"Eventos totales",  v:counts.total,     c:"c-blue",  s:"en la plataforma" },
            { l:"Registros",        v:counts.registers, c:"c-green", s:"nuevas marcas" },
            { l:"Trial warnings",   v:counts.warnings,  c:"c-amber", s:"por expirar" },
            { l:"Expirados",        v:counts.expired,   c:"c-orange",s:"sin convertir" },
          ].map(({l,v,c,s}) => (
            <div key={l} className={`db-metric-card ${c}`}>
              <div className="db-metric-label">{l}</div>
              <div className="db-metric-value">{loading ? "…" : v}</div>
              <div className="db-metric-footer"><span className="db-metric-sub">{s}</span></div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom:14 }}>
          <div className="db-tabs">
            {Object.keys(TYPE_LABEL).map(k => (
              <div key={k} className={`db-tab ${filter===k?"active":""}`} onClick={() => setFilter(k)}>
                {TYPE_LABEL[k]}
              </div>
            ))}
          </div>
        </div>

        <div className="db-card">
          {loading ? (
            <div style={{ padding:40, textAlign:"center", color:"var(--text3)", fontSize:13 }}>Cargando…</div>
          ) : logs.length === 0 ? (
            <div style={{ padding:40, textAlign:"center", color:"var(--text3)", fontSize:13 }}>Sin eventos</div>
          ) : (
            <div className="db-activity-list">
              {logs.map(log => (
                <div key={log.id} className="db-activity-item">
                  <div className="db-activity-dot" style={{ background: log.color }} />
                  <div style={{ flex:1 }}>
                    <div className="db-activity-text">
                      <strong>{log.tenant}</strong> — {log.detail}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3 }}>
                      <div className="db-activity-time">{timeAgo(log.time)}</div>
                      <span className="db-badge" style={{ background: log.color+"22", color: log.color, fontSize:9 }}>
                        {log.type.replace("_"," ")}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
