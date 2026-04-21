"use client";
import { useState, useEffect, useRef } from "react";
import api from "@/lib/api";

interface Plan { id: string; name: string; displayName: string; price: number }
interface Tenant {
  id: string; name: string; slug: string; ownerEmail: string;
  logoUrl: string | null; onboardingDone: boolean; createdAt: string;
  subscription: { status: string; daysLeft: number | null; trialEndsAt: string; plan: Plan } | null;
  _count: { restaurants: number; users: number };
}

const STATUS_BADGE: Record<string, string> = {
  TRIAL: "db-badge-blue", ACTIVE: "db-badge-green",
  PAST_DUE: "db-badge-amber", SUSPENDED: "db-badge-red",
  CANCELLED: "db-badge-red", EXPIRED: "db-badge-red",
};
const COLORS = ["#f97316","#22c55e","#3b82f6","#a855f7","#f59e0b"];

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "hoy"; if (d === 1) return "ayer";
  if (d < 30) return `hace ${d}d`;
  return new Date(iso).toLocaleDateString("es-MX", { month: "short", day: "numeric" });
}

export default function MarcasPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState("ALL");
  const [toast,   setToast]   = useState("");
  const [delConfirm,  setDelConfirm]  = useState<Tenant | null>(null);
  const [planModal,   setPlanModal]   = useState<Tenant | null>(null);
  const [newPlanId,   setNewPlanId]   = useState("");
  const [trialModal,  setTrialModal]  = useState<Tenant | null>(null);
  const [extendDays,  setExtendDays]  = useState(7);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (timer.current) clearTimeout(timer.current);
    setToast(msg); timer.current = setTimeout(() => setToast(""), 2500);
  }

  async function load() {
    const [tr, pr] = await Promise.all([
      api.get("/api/saas/tenants").catch(() => ({ data: [] })),
      api.get("/api/saas/plans").catch(() => ({ data: [] })),
    ]);
    setTenants(tr.data); setPlans(pr.data); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function changeStatus(id: string, status: string) {
    try {
      await api.patch(`/api/saas/tenants/${id}/status`, { status });
      showToast(`Estado → ${status}`);
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Error al cambiar estado");
    }
    await load();
  }
  async function changePlan() {
    if (!planModal || !newPlanId) return;
    try {
      await api.patch(`/api/saas/tenants/${planModal.id}/plan`, { planId: newPlanId });
      showToast("Plan actualizado");
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Error al cambiar plan");
    }
    setPlanModal(null); await load();
  }
  async function extendTrial() {
    if (!trialModal) return;
    try {
      await api.post(`/api/saas/tenants/${trialModal.id}/gift-days`, { days: extendDays });
      showToast(`+${extendDays} días agregados`);
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Error al regalar días");
    }
    setTrialModal(null); setExtendDays(7); await load();
  }
  async function deleteTenant() {
    if (!delConfirm) return;
    try {
      await api.delete(`/api/saas/tenants/${delConfirm.id}`);
      showToast("Marca eliminada");
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Error al eliminar marca");
    }
    setDelConfirm(null); await load();
  }

  const filtered = tenants.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = t.name.toLowerCase().includes(q) || t.slug.includes(q) || t.ownerEmail.includes(q);
    const matchFilter = filter === "ALL" || t.subscription?.status === filter;
    return matchSearch && matchFilter;
  });

  const stats = {
    total:  tenants.length,
    active: tenants.filter(t => t.subscription?.status === "ACTIVE").length,
    trial:  tenants.filter(t => t.subscription?.status === "TRIAL").length,
    inact:  tenants.filter(t => ["EXPIRED","SUSPENDED","CANCELLED"].includes(t.subscription?.status ?? "")).length,
  };

  return (
    <>
      <div className="db-topbar">
        <div className="db-topbar-left">
          <h1>Marcas</h1>
          <p>Gestión de tenants — {tenants.length} registradas</p>
        </div>
        <div className="db-topbar-right">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar nombre, slug o email…"
            style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8,
              padding:"6px 12px", fontSize:12, color:"var(--text)", outline:"none", width:220 }} />
        </div>
      </div>

      <div className="db-content">
        <div className="db-metrics">
          {[
            { l:"Total",      v:stats.total,  c:"c-blue",   s:"registradas" },
            { l:"Activas",    v:stats.active, c:"c-green",  s:"pagando" },
            { l:"En trial",   v:stats.trial,  c:"c-amber",  s:"por convertir" },
            { l:"Inactivas",  v:stats.inact,  c:"c-orange", s:"exp./susp." },
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
            {["ALL","TRIAL","ACTIVE","SUSPENDED","EXPIRED"].map(s => (
              <div key={s} className={`db-tab ${filter===s?"active":""}`} onClick={() => setFilter(s)}>
                {s === "ALL" ? "Todas" : s}
              </div>
            ))}
          </div>
        </div>

        <div className="db-card">
          {loading ? (
            <div style={{ padding:40, textAlign:"center", color:"var(--text3)", fontSize:13 }}>Cargando…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:40, textAlign:"center", color:"var(--text3)", fontSize:13 }}>Sin resultados</div>
          ) : (
            <table className="db-brands-table">
              <thead>
                <tr>
                  <th>Marca</th><th>Plan</th><th>Estado</th><th>Trial</th><th>Usuarios</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const sub = t.subscription;
                  const bg = COLORS[t.name.charCodeAt(0) % COLORS.length];
                  return (
                    <tr key={t.id}>
                      <td>
                        <div className="db-brand-name">
                          {t.logoUrl
                            ? <img src={t.logoUrl} alt="" style={{ width:28, height:28, borderRadius:8, objectFit:"cover" }} />
                            : <div className="db-brand-avatar" style={{ background:bg+"22", color:bg }}>{t.name[0]}</div>}
                          <div>
                            <div style={{ fontWeight:500 }}>{t.name}</div>
                            <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"DM Mono,monospace" }}>
                              {t.slug} · {t.ownerEmail}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize:11, fontFamily:"DM Mono,monospace", color:"var(--text2)" }}>
                        {sub?.plan?.displayName ?? "—"}
                      </td>
                      <td>
                        <span className={`db-badge ${STATUS_BADGE[sub?.status ?? ""] ?? "db-badge-blue"}`}>
                          {sub?.status ?? "—"}
                        </span>
                      </td>
                      <td style={{ fontSize:11, fontFamily:"DM Mono,monospace", color:"var(--text3)" }}>
                        {sub?.status === "TRIAL"
                          ? `${sub.daysLeft ?? "?"}d restantes`
                          : sub?.trialEndsAt ? timeAgo(sub.trialEndsAt) : "—"}
                      </td>
                      <td style={{ fontSize:12, fontFamily:"DM Mono,monospace" }}>{t._count.users}</td>
                      <td>
                        <div style={{ display:"flex", gap:6 }}>
                          {sub?.status === "TRIAL" && (
                            <button className="db-btn db-btn-orange" style={{ padding:"3px 8px", fontSize:10 }}
                              onClick={() => changeStatus(t.id, "ACTIVE")}>Activar</button>
                          )}
                          {sub?.status === "ACTIVE" && (
                            <button className="db-btn" style={{ padding:"3px 8px", fontSize:10, color:"var(--amber)", borderColor:"var(--amber-dim)" }}
                              onClick={() => changeStatus(t.id, "SUSPENDED")}>Pausar</button>
                          )}
                          {["SUSPENDED","EXPIRED"].includes(sub?.status ?? "") && (
                            <button className="db-btn" style={{ padding:"3px 8px", fontSize:10, color:"var(--green)", borderColor:"var(--green-dim)" }}
                              onClick={() => changeStatus(t.id, "ACTIVE")}>Reactivar</button>
                          )}
                          <button className="db-btn" style={{ padding:"3px 8px", fontSize:10 }}
                            onClick={() => { setPlanModal(t); setNewPlanId(sub?.plan?.id ?? ""); }}>Plan</button>
                          <button className="db-btn" style={{ padding:"3px 8px", fontSize:10, color:"var(--blue)", borderColor:"var(--blue-dim)" }}
                            onClick={() => { setTrialModal(t); setExtendDays(7); }}>+Días</button>
                          <button className="db-btn" style={{ padding:"3px 8px", fontSize:10, color:"var(--red)", borderColor:"var(--red-dim)" }}
                            onClick={() => setDelConfirm(t)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {planModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }}>
          <div className="db-card" style={{ width:340 }}>
            <div className="db-card-header">
              <div className="db-card-title">Cambiar plan — {planModal.name}</div>
            </div>
            <div className="db-card-body" style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {plans.map(p => (
                <label key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, cursor:"pointer",
                  background: newPlanId===p.id ? "var(--orange-dim)" : "var(--surface2)",
                  border:`1px solid ${newPlanId===p.id ? "var(--orange)" : "var(--border)"}` }}>
                  <input type="radio" value={p.id} checked={newPlanId===p.id} onChange={() => setNewPlanId(p.id)} style={{ accentColor:"var(--orange)" }} />
                  <div>
                    <div style={{ fontSize:12, fontWeight:500 }}>{p.displayName}</div>
                    <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"DM Mono,monospace" }}>${p.price}/mes</div>
                  </div>
                </label>
              ))}
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                <button className="db-btn" style={{ flex:1 }} onClick={() => setPlanModal(null)}>Cancelar</button>
                <button className="db-btn db-btn-orange" style={{ flex:1 }} onClick={changePlan}>Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {trialModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }}>
          <div className="db-card" style={{ width:320 }}>
            <div className="db-card-header">
              <div className="db-card-title">Días gratis — {trialModal.name}</div>
            </div>
            <div className="db-card-body" style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <label style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.5px" }}>
                ¿Cuántos días adicionales?
              </label>
              <input
                type="number" min={1} max={365} value={extendDays}
                onChange={e => setExtendDays(Number(e.target.value))}
                style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8,
                  padding:"8px 12px", fontSize:14, color:"var(--text)", outline:"none",
                  fontFamily:"DM Mono,monospace", width:"100%" }} />
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                <button className="db-btn" style={{ flex:1 }} onClick={() => setTrialModal(null)}>Cancelar</button>
                <button className="db-btn db-btn-orange" style={{ flex:1 }} onClick={extendTrial}>Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {delConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }}>
          <div className="db-card" style={{ width:320 }}>
            <div className="db-card-header">
              <div className="db-card-title" style={{ color:"var(--red)" }}>Eliminar marca</div>
            </div>
            <div className="db-card-body" style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <p style={{ fontSize:12, color:"var(--text2)", lineHeight:1.6 }}>
                ¿Eliminar <strong style={{ color:"var(--text)" }}>{delConfirm.name}</strong> y todos sus datos? Esta acción no se puede deshacer.
              </p>
              <div style={{ display:"flex", gap:8 }}>
                <button className="db-btn" style={{ flex:1 }} onClick={() => setDelConfirm(null)}>Cancelar</button>
                <button className="db-btn" style={{ flex:1, background:"var(--red)", color:"#fff", borderColor:"var(--red)" }}
                  onClick={deleteTenant}>Eliminar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`db-toast ${toast?"show":""}`}>{toast}</div>
    </>
  );
}
