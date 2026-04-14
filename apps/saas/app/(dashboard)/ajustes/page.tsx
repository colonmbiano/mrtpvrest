"use client";
import { useState, useEffect, useRef } from "react";
import api from "@/lib/api";

interface Plan {
  id: string; name: string; displayName: string; price: number; trialDays: number;
  maxLocations: number; maxEmployees: number;
  hasKDS: boolean; hasLoyalty: boolean; hasInventory: boolean; hasReports: boolean; hasAPIAccess: boolean;
  isActive: boolean;
}

const FEATURES: { key: keyof Plan; label: string }[] = [
  { key: "hasKDS",       label: "Kitchen Display (KDS)" },
  { key: "hasLoyalty",   label: "Programa de Loyalty" },
  { key: "hasInventory", label: "Control de Inventario" },
  { key: "hasReports",   label: "Reportes Avanzados" },
  { key: "hasAPIAccess", label: "Acceso a API" },
];

export default function AjustesPage() {
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<string | null>(null);
  const [toast,   setToast]   = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newPlan, setNewPlan] = useState({ name:"", displayName:"", price:0, trialDays:15, maxLocations:1, maxEmployees:5 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (timer.current) clearTimeout(timer.current);
    setToast(msg); timer.current = setTimeout(() => setToast(""), 2500);
  }

  async function load() {
    const r = await api.get("/api/saas/plans").catch(() => ({ data: [] }));
    setPlans(r.data); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function update(id: string, field: string, value: unknown) {
    setPlans(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  async function savePlan(plan: Plan) {
    setSaving(plan.id);
    await api.patch(`/api/saas/plans/${plan.id}`, {
      displayName: plan.displayName, price: plan.price, trialDays: plan.trialDays,
      maxLocations: plan.maxLocations, maxEmployees: plan.maxEmployees,
      hasKDS: plan.hasKDS, hasLoyalty: plan.hasLoyalty, hasInventory: plan.hasInventory,
      hasReports: plan.hasReports, hasAPIAccess: plan.hasAPIAccess, isActive: plan.isActive,
    }).catch(() => null);
    setSaving(null); showToast(`Plan ${plan.displayName} guardado`);
  }

  async function createPlan() {
    if (!newPlan.name || !newPlan.displayName) return;
    await api.post("/api/saas/plans", newPlan).catch(() => null);
    setShowNew(false); setNewPlan({ name:"", displayName:"", price:0, trialDays:15, maxLocations:1, maxEmployees:5 });
    await load(); showToast("Plan creado");
  }

  return (
    <>
      <div className="db-topbar">
        <div className="db-topbar-left">
          <h1>Ajustes de planes</h1>
          <p>Configura precios, límites y funciones por plan</p>
        </div>
        <div className="db-topbar-right">
          <button className="db-btn db-btn-orange" onClick={() => setShowNew(true)}>+ Nuevo plan</button>
        </div>
      </div>

      <div className="db-content">
        {loading ? (
          <div style={{ textAlign:"center", color:"var(--text3)", padding:60, fontSize:13 }}>Cargando…</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {plans.map(plan => (
              <div key={plan.id} className="db-card">
                <div className="db-card-header">
                  <div>
                    <div className="db-card-title">{plan.displayName}</div>
                    <div className="db-card-sub" style={{ fontFamily:"DM Mono,monospace" }}>
                      ID interno: {plan.name}
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span className={`db-badge ${plan.isActive ? "db-badge-green" : "db-badge-red"}`}>
                      {plan.isActive ? "Activo" : "Inactivo"}
                    </span>
                    <div className={`db-toggle ${plan.isActive ? "on" : ""}`}
                      onClick={() => update(plan.id, "isActive", !plan.isActive)} />
                  </div>
                </div>
                <div className="db-card-body">
                  <div className="db-settings-grid" style={{ marginBottom:16 }}>
                    <div className="db-field">
                      <label>Nombre visible</label>
                      <div className="db-field-wrap">
                        <input value={plan.displayName} onChange={e => update(plan.id, "displayName", e.target.value)} />
                      </div>
                    </div>
                    <div className="db-field">
                      <label>Precio mensual (USD)</label>
                      <div className="db-field-wrap">
                        <span className="db-field-prefix">$</span>
                        <input type="number" value={plan.price} min={0} step={0.5}
                          onChange={e => update(plan.id, "price", +e.target.value)} />
                      </div>
                    </div>
                    <div className="db-field">
                      <label>Días de trial</label>
                      <div className="db-field-wrap">
                        <span className="db-field-prefix">días</span>
                        <input type="number" value={plan.trialDays} min={0}
                          onChange={e => update(plan.id, "trialDays", +e.target.value)} />
                      </div>
                    </div>
                    <div className="db-field">
                      <label>Max. sucursales</label>
                      <div className="db-field-wrap">
                        <input type="number" value={plan.maxLocations} min={1}
                          onChange={e => update(plan.id, "maxLocations", +e.target.value)} />
                      </div>
                    </div>
                    <div className="db-field">
                      <label>Max. empleados</label>
                      <div className="db-field-wrap">
                        <input type="number" value={plan.maxEmployees} min={1}
                          onChange={e => update(plan.id, "maxEmployees", +e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize:11, color:"var(--text3)", letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>
                    Funciones incluidas
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:2 }}>
                    {FEATURES.map(f => (
                      <div key={String(f.key)} className="db-toggle-row" style={{ paddingLeft:4 }}>
                        <div className="db-toggle-label">{f.label}</div>
                        <div className={`db-toggle ${plan[f.key] ? "on" : ""}`}
                          onClick={() => update(plan.id, f.key, !plan[f.key])} />
                      </div>
                    ))}
                  </div>

                  <button className="db-btn db-btn-orange" style={{ marginTop:16, minWidth:140 }}
                    onClick={() => savePlan(plan)} disabled={saving === plan.id}>
                    {saving === plan.id ? "Guardando…" : "Guardar cambios"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }}>
          <div className="db-card" style={{ width:400 }}>
            <div className="db-card-header">
              <div className="db-card-title">Nuevo plan</div>
            </div>
            <div className="db-card-body" style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div className="db-settings-grid">
                <div className="db-field">
                  <label>ID interno (ej: PRO)</label>
                  <div className="db-field-wrap">
                    <input value={newPlan.name} onChange={e => setNewPlan(p => ({ ...p, name: e.target.value.toUpperCase() }))} placeholder="BASIC" />
                  </div>
                </div>
                <div className="db-field">
                  <label>Nombre visible</label>
                  <div className="db-field-wrap">
                    <input value={newPlan.displayName} onChange={e => setNewPlan(p => ({ ...p, displayName: e.target.value }))} placeholder="Básico" />
                  </div>
                </div>
                <div className="db-field">
                  <label>Precio (USD/mes)</label>
                  <div className="db-field-wrap">
                    <span className="db-field-prefix">$</span>
                    <input type="number" value={newPlan.price} onChange={e => setNewPlan(p => ({ ...p, price: +e.target.value }))} />
                  </div>
                </div>
                <div className="db-field">
                  <label>Días de trial</label>
                  <div className="db-field-wrap">
                    <input type="number" value={newPlan.trialDays} onChange={e => setNewPlan(p => ({ ...p, trialDays: +e.target.value }))} />
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                <button className="db-btn" style={{ flex:1 }} onClick={() => setShowNew(false)}>Cancelar</button>
                <button className="db-btn db-btn-orange" style={{ flex:1 }} onClick={createPlan}>Crear plan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`db-toast ${toast?"show":""}`}>{toast}</div>
    </>
  );
}
