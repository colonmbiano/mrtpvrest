"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft, Mail, MessageSquare, Users, Building2, ExternalLink,
  Sparkles, Receipt, Layers, Activity, AlertTriangle, Grid3x3,
  Check, Clock, Download, Trash2, Pause, Play, DollarSign, TrendingUp, Zap, HeartPulse,
} from "lucide-react";
import api from "@/lib/api";
import TenantModulesPanel from "@/components/TenantModulesPanel";
import { enabledModulesForPanel, type TenantModuleRow } from "@/lib/modules";

interface Plan {
  id: string; name: string; displayName: string; price: number;
  allowedModules?: string[] | null;
  hasKDS?: boolean | null;
  hasLoyalty?: boolean | null;
  hasReports?: boolean | null;
}
interface Subscription {
  id: string; status: string; daysLeft: number | null;
  trialEndsAt: string | null; currentPeriodEnd: string | null;
  priceSnapshot: number | null; plan: Plan;
}
interface Restaurant {
  id: string; name: string; slug: string;
  config: { hasKDS?: boolean; hasDelivery?: boolean } | null;
  _count: { locations: number; orders: number };
}
interface Tenant {
  id: string; name: string; slug: string; ownerEmail: string;
  logoUrl: string | null; onboardingDone: boolean; createdAt: string;
  hasInventory: boolean; hasDelivery: boolean; hasWebStore: boolean;
  enabledModules: string[];
  tenantModules?: TenantModuleRow[];
  whatsappNumber: string | null;
  subscription: Subscription | null;
  restaurants: Restaurant[];
  _count: { users: number };
}
interface Invoice {
  id: string; amount: number; currency: string; status: string;
  periodStart: string; periodEnd: string; paidAt: string | null; createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  TRIAL: "db-badge-blue", ACTIVE: "db-badge-green",
  PAST_DUE: "db-badge-amber", SUSPENDED: "db-badge-red",
  CANCELLED: "db-badge-red", EXPIRED: "db-badge-red",
};
const COLORS = ["#f97316","#22c55e","#3b82f6","#a855f7","#f59e0b","#ec4899","#14b8a6"];

function fmtMoney(n: number) { return `$${(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`; }
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { month: "short", day: "numeric", year: "numeric" });
}
function daysBetween(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

type Tab = "overview" | "billing" | "modules" | "restaurants" | "danger";

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id as string;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState("");
  const [planModal, setPlanModal] = useState(false);
  const [newPlanId, setNewPlanId] = useState("");
  const [trialModal, setTrialModal] = useState(false);
  const [extendDays, setExtendDays] = useState(7);
  const [delConfirm, setDelConfirm] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }

  async function load() {
    if (!id) return;
    setLoading(true);
    const [tr, ir, pr] = await Promise.all([
      api.get<Tenant>(`/api/saas/tenants/${id}`).catch(() => ({ data: null })),
      api.get<Invoice[]>(`/api/saas/tenants/${id}/invoices`).catch(() => ({ data: [] })),
      api.get<Plan[]>(`/api/saas/plans`).catch(() => ({ data: [] })),
    ]);
    setTenant(tr.data as Tenant | null);
    setInvoices((ir.data as Invoice[]) || []);
    setPlans((pr.data as Plan[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function changeStatus(status: string) {
    try {
      await api.patch(`/api/saas/tenants/${id}/status`, { status });
      showToast(`Estado → ${status}`);
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Error al cambiar estado");
    }
    load();
  }
  async function confirmChangePlan() {
    if (!newPlanId) return;
    try {
      await api.patch(`/api/saas/tenants/${id}/plan`, { planId: newPlanId });
      showToast("Plan actualizado");
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Error al cambiar plan");
    }
    setPlanModal(false);
    load();
  }
  async function confirmGiftDays() {
    try {
      await api.post(`/api/saas/tenants/${id}/gift-days`, { days: extendDays });
      showToast(`+${extendDays} días`);
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Error al regalar días");
    }
    setTrialModal(false);
    setExtendDays(7);
    load();
  }
  async function confirmDelete() {
    try {
      await api.delete(`/api/saas/tenants/${id}`);
      showToast("Marca eliminada");
      setTimeout(() => router.push("/marcas"), 400);
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Error al eliminar");
      setDelConfirm(false);
    }
  }

  if (loading && !tenant) {
    return (
      <div className="db-content">
        <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
          Cargando tenant…
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="db-content">
        <button className="db-btn" onClick={() => router.push("/marcas")} style={{ marginBottom: 16 }}>
          <ChevronLeft size={14} /> Volver
        </button>
        <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
          Tenant no encontrado.
        </div>
      </div>
    );
  }

  const sub = tenant.subscription;
  const avatarColor = COLORS[tenant.name.charCodeAt(0) % COLORS.length];
  const customerDays = daysBetween(tenant.createdAt);
  const totalPaid = invoices.filter(i => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
  const ordersTotal = tenant.restaurants.reduce((s, r) => s + (r._count?.orders || 0), 0);
  const locationsTotal = tenant.restaurants.reduce((s, r) => s + (r._count?.locations || 0), 0);

  return (
    <>
      <div className="db-topbar">
        <div className="db-topbar-left">
          <h1>{tenant.name}</h1>
          <p>Detalle de marca · {tenant.slug}.mrtpvrest.com</p>
        </div>
        <div className="db-topbar-right">
          <button className="db-btn" onClick={() => router.push("/marcas")}>
            <ChevronLeft size={14} /> Marcas
          </button>
        </div>
      </div>

      <div className="db-content">
        {toast && (
          <div style={{
            position: "fixed", top: 80, right: 24, zIndex: 100,
            background: "var(--surface2)", border: "1px solid var(--border)",
            padding: "10px 16px", borderRadius: 10, fontSize: 12, color: "var(--text)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}>{toast}</div>
        )}

        {/* Header card */}
        <div className="db-card" style={{
          marginBottom: 18,
          background: `linear-gradient(135deg, ${avatarColor}14, var(--surface) 60%)`,
        }}>
          <div className="db-card-body" style={{ display: "flex", alignItems: "center", gap: 18, padding: 20, flexWrap: "wrap" }}>
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt="" style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover" }} />
            ) : (
              <div style={{
                width: 64, height: 64, borderRadius: 16, flexShrink: 0,
                background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}aa)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 28, color: "#fff",
                boxShadow: `0 8px 24px ${avatarColor}55`,
              }}>{tenant.name[0]?.toUpperCase()}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em", color: "var(--text)", margin: 0 }}>
                  {tenant.name}
                </h2>
                {sub && (
                  <span className={`db-badge ${STATUS_BADGE[sub.status] ?? "db-badge-blue"}`}>{sub.status}</span>
                )}
                {sub?.plan && (
                  <span className="db-badge" style={{ background: "var(--surface3)", color: "var(--text2)" }}>
                    {sub.plan.displayName} · ${sub.plan.price}/mes
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "DM Mono, monospace" }}>
                {tenant.slug}.mrtpvrest.com · cliente desde hace {customerDays}d
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: "var(--text2)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Mail size={11} /> {tenant.ownerEmail}
                </span>
                {tenant.whatsappNumber && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <MessageSquare size={11} /> {tenant.whatsappNumber}
                  </span>
                )}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Users size={11} /> {tenant._count.users} usuario{tenant._count.users === 1 ? "" : "s"}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Building2 size={11} /> {tenant.restaurants.length} restaurante{tenant.restaurants.length === 1 ? "" : "s"} · {locationsTotal} sucursal{locationsTotal === 1 ? "" : "es"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sub?.status === "TRIAL" && (
                <button className="db-btn db-btn-orange" onClick={() => changeStatus("ACTIVE")}>
                  <Check size={13} /> Activar
                </button>
              )}
              {sub?.status === "ACTIVE" && (
                <button className="db-btn" style={{ color: "var(--amber)", borderColor: "var(--amber-dim)" }} onClick={() => changeStatus("SUSPENDED")}>
                  <Pause size={13} /> Pausar
                </button>
              )}
              {["SUSPENDED", "EXPIRED", "PAST_DUE"].includes(sub?.status ?? "") && (
                <button className="db-btn" style={{ color: "var(--green)", borderColor: "var(--green-dim)" }} onClick={() => changeStatus("ACTIVE")}>
                  <Play size={13} /> Reactivar
                </button>
              )}
              <a className="db-btn" href={`https://${tenant.slug}.mrtpvrest.com`} target="_blank" rel="noreferrer">
                <ExternalLink size={12} /> Abrir tenant
              </a>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="db-tabs" style={{ marginBottom: 16 }}>
          {([
            ["overview",    "Vista general", <Grid3x3 size={12} key="i" />],
            ["billing",     "Facturación",   <Receipt size={12} key="i" />],
            ["modules",     "Módulos",       <Layers size={12} key="i" />],
            ["restaurants", "Restaurantes",  <Activity size={12} key="i" />],
            ["danger",      "Zona peligro",  <AlertTriangle size={12} key="i" />],
          ] as const).map(([id, label, icon]) => (
            <div key={id} className={`db-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id as Tab)}
                 style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {icon}{label}
            </div>
          ))}
        </div>

        {tab === "overview" && (
          <>
            <div className="db-metrics">
              <div className="db-metric-card c-orange">
                <div className="db-metric-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <DollarSign size={11} /> MRR
                </div>
                <div className="db-metric-value">{fmtMoney(sub?.priceSnapshot ?? sub?.plan?.price ?? 0)}</div>
                <div className="db-metric-footer">
                  <span className="db-metric-sub">{sub?.plan?.displayName ?? "Sin plan"}</span>
                </div>
              </div>
              <div className="db-metric-card c-green">
                <div className="db-metric-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <TrendingUp size={11} /> Total pagado
                </div>
                <div className="db-metric-value">{fmtMoney(totalPaid)}</div>
                <div className="db-metric-footer">
                  <span className="db-metric-sub">{invoices.filter(i => i.status === "PAID").length} facturas</span>
                </div>
              </div>
              <div className="db-metric-card c-blue">
                <div className="db-metric-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Zap size={11} /> Órdenes totales
                </div>
                <div className="db-metric-value">{ordersTotal.toLocaleString("es-MX")}</div>
                <div className="db-metric-footer">
                  <span className="db-metric-sub">{tenant.restaurants.length} restaurantes</span>
                </div>
              </div>
              <div className="db-metric-card c-amber">
                <div className="db-metric-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <HeartPulse size={11} /> Onboarding
                </div>
                <div className="db-metric-value">{tenant.onboardingDone ? "OK" : "—"}</div>
                <div className="db-metric-footer">
                  <span className="db-metric-sub">{tenant.onboardingDone ? "completo" : "pendiente"}</span>
                </div>
              </div>
            </div>

            <div className="db-split">
              <div className="db-card">
                <div className="db-card-header">
                  <div className="db-card-title">Suscripción</div>
                </div>
                <div className="db-card-body db-settings-grid" style={{ fontSize: 12 }}>
                  <Field label="Plan" value={sub?.plan?.displayName ?? "—"} />
                  <Field label="Precio" value={fmtMoney(sub?.priceSnapshot ?? sub?.plan?.price ?? 0)} />
                  <Field label="Estado" value={sub?.status ?? "—"} />
                  <Field label="Trial termina" value={fmtDate(sub?.trialEndsAt ?? null)} />
                  <Field label="Período actual" value={fmtDate(sub?.currentPeriodEnd ?? null)} />
                  <Field label="Cliente desde" value={fmtDate(tenant.createdAt)} />
                </div>
              </div>
              <div className="db-card">
                <div className="db-card-header">
                  <div className="db-card-title">Acciones rápidas</div>
                </div>
                <div className="db-card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button className="db-btn" style={{ justifyContent: "flex-start" }} onClick={() => { setNewPlanId(sub?.plan?.id ?? ""); setPlanModal(true); }}>
                    <Layers size={13} /> Cambiar plan
                  </button>
                  <button className="db-btn" style={{ justifyContent: "flex-start" }} onClick={() => setTrialModal(true)}>
                    <Clock size={13} /> Regalar días
                  </button>
                  {tenant.whatsappNumber && (
                    <a className="db-btn" style={{ justifyContent: "flex-start" }} href={`https://wa.me/${tenant.whatsappNumber.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                      <MessageSquare size={13} /> Mensaje
                    </a>
                  )}
                  <a className="db-btn" style={{ justifyContent: "flex-start" }} href={`mailto:${tenant.ownerEmail}`}>
                    <Mail size={13} /> Email al dueño
                  </a>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "billing" && (
          <div className="db-card">
            <div className="db-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="db-card-title">Historial de facturas</div>
                <div className="db-card-sub">{invoices.length} factura{invoices.length === 1 ? "" : "s"} · pagado total {fmtMoney(totalPaid)}</div>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="db-brands-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Período</th><th>Monto</th><th>Estado</th><th>Pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 28, textAlign: "center", color: "var(--text3)" }}>Sin facturas todavía</td></tr>
                  )}
                  {invoices.map(i => (
                    <tr key={i.id}>
                      <td style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: "var(--text3)" }}>{i.id.slice(-8)}</td>
                      <td style={{ fontFamily: "DM Mono, monospace", fontSize: 11.5 }}>{fmtDate(i.periodStart)} → {fmtDate(i.periodEnd)}</td>
                      <td style={{ fontFamily: "DM Mono, monospace", fontWeight: 600 }}>
                        {fmtMoney(i.amount)} <span style={{ fontSize: 9, color: "var(--text3)" }}>{i.currency}</span>
                      </td>
                      <td>
                        <span className={`db-badge ${i.status === "PAID" ? "db-badge-green" : i.status === "PENDING" ? "db-badge-amber" : "db-badge-red"}`}>
                          {i.status}
                        </span>
                      </td>
                      <td style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: "var(--text3)" }}>{fmtDate(i.paidAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "modules" && (
          <div className="db-card">
            <div className="db-card-header">
              <div className="db-card-title">Módulos de la marca</div>
              <div className="db-card-sub">El TPV los lee al boot · cambios optimistas</div>
            </div>
            <div className="db-card-body">
              <TenantModulesPanel
                tenant={{
                  id: tenant.id,
                  hasInventory: tenant.hasInventory,
                  hasDelivery: tenant.hasDelivery,
                  hasWebStore: tenant.hasWebStore,
                  // Fuente unificada: prefiere tenantModules (canónico), cae a legacy.
                  enabledModules: enabledModulesForPanel(tenant),
                  whatsappNumber: tenant.whatsappNumber,
                }}
                plan={sub?.plan ?? null}
                // Tras editar, limpiamos tenantModules para que un remount (cambio
                // de pestaña) re-derive desde los campos legacy ya actualizados por
                // el PATCH, evitando re-sembrar un snapshot canónico obsoleto.
                onUpdated={(patch) => setTenant(t => t ? { ...t, ...patch, tenantModules: undefined } as Tenant : t)}
                onError={showToast}
              />
            </div>
          </div>
        )}

        {tab === "restaurants" && (
          <div className="db-card">
            <div className="db-card-header">
              <div className="db-card-title">Restaurantes y sucursales</div>
              <div className="db-card-sub">{tenant.restaurants.length} restaurante{tenant.restaurants.length === 1 ? "" : "s"} · {locationsTotal} sucursal{locationsTotal === 1 ? "" : "es"} · {ordersTotal.toLocaleString("es-MX")} órdenes</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="db-brands-table">
                <thead>
                  <tr><th>Restaurante</th><th>Slug</th><th>Sucursales</th><th>Órdenes</th></tr>
                </thead>
                <tbody>
                  {tenant.restaurants.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 28, textAlign: "center", color: "var(--text3)" }}>Sin restaurantes</td></tr>
                  )}
                  {tenant.restaurants.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.name}</td>
                      <td style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: "var(--text3)" }}>{r.slug}</td>
                      <td style={{ fontFamily: "DM Mono, monospace" }}>{r._count.locations}</td>
                      <td style={{ fontFamily: "DM Mono, monospace" }}>{r._count.orders.toLocaleString("es-MX")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "danger" && (
          <div className="db-card" style={{ borderColor: "var(--red-dim)" }}>
            <div className="db-card-header">
              <div className="db-card-title" style={{ color: "var(--red)" }}>Zona de peligro</div>
              <div className="db-card-sub">Acciones irreversibles</div>
            </div>
            <div className="db-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Suspender acceso</div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>Bloquea el login del tenant sin borrar datos</div>
                </div>
                <button className="db-btn" style={{ color: "var(--amber)", borderColor: "var(--amber-dim)" }}
                        onClick={() => changeStatus("SUSPENDED")} disabled={sub?.status === "SUSPENDED"}>
                  <Pause size={13} /> Suspender
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 0" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--red)" }}>Eliminar marca</div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>Borra tenant, usuarios, restaurantes, órdenes. No reversible.</div>
                </div>
                <button className="db-btn" style={{ color: "var(--red)", borderColor: "var(--red-dim)" }} onClick={() => setDelConfirm(true)}>
                  <Trash2 size={13} /> Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Plan modal */}
      {planModal && (
        <Modal onClose={() => setPlanModal(false)} title={`Cambiar plan — ${tenant.name}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {plans.map(p => (
              <label key={p.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                background: newPlanId === p.id ? "var(--orange-dim)" : "var(--surface2)",
                border: `1px solid ${newPlanId === p.id ? "var(--orange)" : "var(--border)"}`,
              }}>
                <input type="radio" checked={newPlanId === p.id} onChange={() => setNewPlanId(p.id)} style={{ accentColor: "var(--orange)" }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{p.displayName}</div>
                  <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "DM Mono, monospace" }}>${p.price}/mes</div>
                </div>
              </label>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className="db-btn" style={{ flex: 1 }} onClick={() => setPlanModal(false)}>Cancelar</button>
              <button className="db-btn db-btn-orange" style={{ flex: 1 }} onClick={confirmChangePlan} disabled={!newPlanId}>Confirmar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Trial modal */}
      {trialModal && (
        <Modal onClose={() => setTrialModal(false)} title={`Días gratis — ${tenant.name}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              ¿Cuántos días adicionales?
            </label>
            <input type="number" min={1} max={365} value={extendDays} onChange={e => setExtendDays(Number(e.target.value))}
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8,
                padding: "8px 12px", fontSize: 14, color: "var(--text)", outline: "none",
                fontFamily: "DM Mono, monospace", width: "100%" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className="db-btn" style={{ flex: 1 }} onClick={() => setTrialModal(false)}>Cancelar</button>
              <button className="db-btn db-btn-orange" style={{ flex: 1 }} onClick={confirmGiftDays}>Confirmar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {delConfirm && (
        <Modal onClose={() => setDelConfirm(false)} title="Eliminar marca" danger>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 12.5, color: "var(--text2)", margin: 0 }}>
              Estás a punto de eliminar <strong style={{ color: "var(--text)" }}>{tenant.name}</strong> y todos sus datos
              (usuarios, restaurantes, órdenes, facturas). Esta acción <strong style={{ color: "var(--red)" }}>no es reversible</strong>.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="db-btn" style={{ flex: 1 }} onClick={() => setDelConfirm(false)}>Cancelar</button>
              <button className="db-btn" style={{ flex: 1, color: "var(--red)", borderColor: "var(--red-dim)" }} onClick={confirmDelete}>
                <Trash2 size={13} /> Eliminar definitivamente
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--text)", fontFamily: "DM Mono, monospace" }}>{value}</div>
    </div>
  );
}

function Modal({ title, children, onClose, danger }: { title: string; children: React.ReactNode; onClose: () => void; danger?: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
         onClick={onClose}>
      <div className="db-card" style={{ width: 360, maxWidth: "100%", maxHeight: "calc(100dvh - 32px)", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div className="db-card-header">
          <div className="db-card-title" style={danger ? { color: "var(--red)" } : undefined}>{title}</div>
        </div>
        <div className="db-card-body">{children}</div>
      </div>
    </div>
  );
}
