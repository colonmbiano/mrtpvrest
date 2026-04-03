"use client";
import { useState, useEffect } from "react";
import api from "@/lib/api";

interface Tenant { id: string; name: string; slug: string; subscription: { status: string; plan: { displayName: string; price: number } } | null }
interface Invoice { id: string; amount: number; currency: string; status: string; paidAt: string | null; periodStart: string; periodEnd: string; createdAt: string }

const INV_BADGE: Record<string, string> = {
  PAID: "db-badge-green", PENDING: "db-badge-amber", FAILED: "db-badge-red", REFUNDED: "db-badge-blue",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day:"2-digit", month:"short", year:"numeric" });
}

export default function FacturacionPage() {
  const [tenants,  setTenants]  = useState<Tenant[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadT,    setLoadT]    = useState(true);
  const [loadI,    setLoadI]    = useState(false);
  const [mrr,      setMrr]      = useState<{ mrr: number; activeCount: number }>({ mrr: 0, activeCount: 0 });

  useEffect(() => {
    Promise.all([
      api.get("/api/saas/tenants").catch(() => ({ data: [] })),
      api.get("/api/saas/mrr").catch(() => ({ data: { mrr: 0, activeCount: 0 } })),
    ]).then(([tr, mr]) => {
      setTenants(tr.data); setMrr(mr.data); setLoadT(false);
    });
  }, []);

  useEffect(() => {
    if (!selected) { setInvoices([]); return; }
    setLoadI(true);
    api.get(`/api/saas/tenants/${selected}/invoices`)
      .then(r => setInvoices(r.data))
      .catch(() => setInvoices([]))
      .finally(() => setLoadI(false));
  }, [selected]);

  const selectedTenant = tenants.find(t => t.id === selected);
  const totalInvoiced  = invoices.filter(i => i.status === "PAID").reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <div className="db-topbar">
        <div className="db-topbar-left">
          <h1>Facturación</h1>
          <p>Suscripciones, facturas e ingresos</p>
        </div>
      </div>

      <div className="db-content">
        {/* MRR CARDS */}
        <div className="db-metrics">
          <div className="db-metric-card c-orange">
            <div className="db-metric-label">MRR Total</div>
            <div className="db-metric-value">${mrr.mrr.toFixed(0)}</div>
            <div className="db-metric-footer"><span className="db-metric-sub">USD/mes</span></div>
          </div>
          <div className="db-metric-card c-green">
            <div className="db-metric-label">Suscripciones activas</div>
            <div className="db-metric-value">{mrr.activeCount}</div>
            <div className="db-metric-footer"><span className="db-metric-sub">pagando</span></div>
          </div>
          <div className="db-metric-card c-blue">
            <div className="db-metric-label">Facturado (selección)</div>
            <div className="db-metric-value">${totalInvoiced.toFixed(0)}</div>
            <div className="db-metric-footer"><span className="db-metric-sub">facturas PAID</span></div>
          </div>
          <div className="db-metric-card c-amber">
            <div className="db-metric-label">Total marcas</div>
            <div className="db-metric-value">{tenants.length}</div>
            <div className="db-metric-footer"><span className="db-metric-sub">registradas</span></div>
          </div>
        </div>

        <div className="db-grid3">
          {/* TENANT SELECTOR */}
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div className="db-card">
              <div className="db-card-header">
                <div className="db-card-title">Seleccionar marca</div>
              </div>
              {loadT ? (
                <div style={{ padding:20, color:"var(--text3)", fontSize:12 }}>Cargando…</div>
              ) : (
                <div style={{ maxHeight:420, overflowY:"auto" }}>
                  {tenants.map(t => (
                    <div key={t.id} onClick={() => setSelected(t.id)}
                      style={{ padding:"10px 20px", cursor:"pointer", borderBottom:"1px solid var(--border)",
                        background: selected===t.id ? "var(--orange-dim)" : "transparent",
                        borderLeft: selected===t.id ? "2px solid var(--orange)" : "2px solid transparent" }}>
                      <div style={{ fontSize:12, fontWeight:500, color: selected===t.id ? "var(--orange)" : "var(--text)" }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize:10, color:"var(--text3)", fontFamily:"DM Mono,monospace", marginTop:2 }}>
                        {t.subscription?.plan?.displayName ?? "Sin plan"} · {t.subscription?.status ?? "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* INVOICES */}
          <div className="db-card" style={{ gridColumn:"span 1" }}>
            <div className="db-card-header">
              <div>
                <div className="db-card-title">
                  {selectedTenant ? `Facturas — ${selectedTenant.name}` : "Selecciona una marca"}
                </div>
                {selectedTenant?.subscription && (
                  <div className="db-card-sub">
                    Plan {selectedTenant.subscription.plan?.displayName} · ${selectedTenant.subscription.plan?.price}/mes
                  </div>
                )}
              </div>
              {invoices.length > 0 && (
                <span className="db-badge db-badge-blue">{invoices.length} facturas</span>
              )}
            </div>

            {!selected ? (
              <div style={{ padding:40, textAlign:"center", color:"var(--text3)", fontSize:12 }}>
                Selecciona una marca para ver sus facturas
              </div>
            ) : loadI ? (
              <div style={{ padding:40, textAlign:"center", color:"var(--text3)", fontSize:12 }}>Cargando…</div>
            ) : invoices.length === 0 ? (
              <div style={{ padding:40, textAlign:"center", color:"var(--text3)", fontSize:12 }}>Sin facturas registradas</div>
            ) : (
              <table className="db-brands-table">
                <thead>
                  <tr><th>Período</th><th>Monto</th><th>Estado</th><th>Pagado</th></tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ fontSize:11, fontFamily:"DM Mono,monospace", color:"var(--text2)" }}>
                        {fmt(inv.periodStart)} → {fmt(inv.periodEnd)}
                      </td>
                      <td style={{ fontFamily:"DM Mono,monospace", fontWeight:500 }}>
                        ${inv.amount.toFixed(2)} <span style={{ fontSize:10, color:"var(--text3)" }}>{inv.currency}</span>
                      </td>
                      <td>
                        <span className={`db-badge ${INV_BADGE[inv.status] ?? "db-badge-blue"}`}>{inv.status}</span>
                      </td>
                      <td style={{ fontSize:11, color:"var(--text3)", fontFamily:"DM Mono,monospace" }}>
                        {inv.paidAt ? fmt(inv.paidAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
