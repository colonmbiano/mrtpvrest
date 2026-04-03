"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

interface Plan {
  id: string;
  name: string;
  displayName: string;
  price: number;
  maxLocations: number;
  maxEmployees: number;
  hasKDS: boolean;
  hasLoyalty: boolean;
  hasInventory: boolean;
  hasReports: boolean;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  logoUrl: string | null;
  isActive: boolean;
  subscription: {
    id: string;
    status: string;
    currentPeriodEnd: string;
    priceSnapshot: number;
    plan: Plan;
  } | null;
  _count: { locations: number; users: number; orders: number };
}

interface MRR {
  mrr: number;
  activeCount: number;
  byPlan: Record<string, { count: number; mrr: number }>;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    "bg-green-500/10 text-green-400",
  TRIAL:     "bg-blue-500/10 text-blue-400",
  PAST_DUE:  "bg-yellow-500/10 text-yellow-400",
  SUSPENDED: "bg-red-500/10 text-red-400",
  CANCELLED: "bg-gray-500/10 text-gray-400",
  EXPIRED:   "bg-red-800/10 text-red-600",
};

export default function SaaSAdminPage() {
  const [tenants, setTenants]   = useState<Tenant[]>([]);
  const [plans, setPlans]       = useState<Plan[]>([]);
  const [mrr, setMrr]           = useState<MRR | null>(null);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  const [form, setForm] = useState({
    name: "", slug: "", domain: "", logoUrl: "", planId: "",
  });

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
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingTenant(null);
    setForm({ name: "", slug: "", domain: "", logoUrl: "", planId: plans[0]?.id ?? "" });
    setShowModal(true);
  };

  const openEdit = (t: Tenant) => {
    setEditingTenant(t);
    setForm({
      name:    t.name,
      slug:    t.slug,
      domain:  t.domain  ?? "",
      logoUrl: t.logoUrl ?? "",
      planId:  t.subscription?.plan?.id ?? "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTenant) {
        await api.patch(`/api/saas/tenants/${editingTenant.id}/plan`, { planId: form.planId });
      } else {
        await api.post("/api/saas/tenants", {
          name:    form.name,
          slug:    form.slug,
          domain:  form.domain  || undefined,
          logoUrl: form.logoUrl || undefined,
          planId:  form.planId,
        });
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al procesar");
    }
  };

  const handleStatus = async (t: Tenant, status: string) => {
    const labels: Record<string, string> = {
      ACTIVE:    "activar",
      SUSPENDED: "suspender",
      CANCELLED: "cancelar",
    };
    if (!confirm(`¿${labels[status] ?? status} el tenant "${t.name}"?`)) return;
    try {
      await api.patch(`/api/saas/tenants/${t.id}/status`, { status });
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || "Error");
    }
  };

  const handleDelete = async (t: Tenant) => {
    if (!confirm(`¿ELIMINAR "${t.name}" y todos sus datos? Esta acción es irreversible.`)) return;
    try {
      await api.delete(`/api/saas/tenants/${t.id}`);
      load();
    } catch {
      alert("Error al eliminar");
    }
  };

  if (loading) return (
    <div className="p-8 text-white bg-black min-h-screen font-syne flex items-center gap-3">
      <span className="animate-spin text-2xl">⚙️</span> Cargando MRTPVREST...
    </div>
  );

  return (
    <div className="p-8 bg-[#050505] min-h-screen text-white font-syne">

      {/* Header */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-orange-500 text-black text-[10px] font-black px-2 py-0.5 rounded">SUPER ADMIN</span>
            <span className="text-gray-500 text-xs font-bold tracking-[0.2em] uppercase">Control Global</span>
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter">
            MRTPV<span className="text-orange-500">REST</span>
          </h1>
        </div>
        <button onClick={openCreate}
          className="bg-white hover:bg-orange-500 hover:text-white text-black font-black py-4 px-8 rounded-2xl transition-all shadow-xl active:scale-95">
          + REGISTRAR MARCA
        </button>
      </div>

      {/* MRR Cards */}
      {mrr && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
            <p className="text-[10px] text-gray-500 font-black uppercase mb-2">MRR Total</p>
            <p className="text-3xl font-black text-orange-400">${mrr.mrr.toFixed(0)}<span className="text-sm text-gray-500 ml-1">USD</span></p>
          </div>
          <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
            <p className="text-[10px] text-gray-500 font-black uppercase mb-2">Tenants Activos</p>
            <p className="text-3xl font-black text-green-400">{mrr.activeCount}</p>
          </div>
          {Object.entries(mrr.byPlan).map(([plan, data]) => (
            <div key={plan} className="bg-[#111] border border-white/5 rounded-3xl p-6">
              <p className="text-[10px] text-gray-500 font-black uppercase mb-2">Plan {plan}</p>
              <p className="text-3xl font-black text-white">{data.count}</p>
              <p className="text-xs text-gray-500 mt-1">${data.mrr}/mes</p>
            </div>
          ))}
        </div>
      )}

      {/* Tenants grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {tenants.map((t) => {
          const sub  = t.subscription;
          const plan = sub?.plan;
          const statusClass = STATUS_COLORS[sub?.status ?? ""] ?? "bg-gray-500/10 text-gray-400";

          return (
            <div key={t.id} className="bg-[#111] border border-gray-900 rounded-[2.5rem] overflow-hidden hover:border-orange-500/30 transition-all flex flex-col">
              <div className="p-8 flex-1">

                {/* Top row */}
                <div className="flex justify-between items-start mb-6">
                  <div className="bg-orange-500/10 p-3 rounded-2xl">
                    {t.logoUrl
                      ? <img src={t.logoUrl} className="w-10 h-10 object-contain" alt="Logo" />
                      : <span className="text-3xl">🍔</span>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${t.isActive ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
                      {t.isActive ? "Activo" : "Inactivo"}
                    </span>
                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${statusClass}`}>
                      {sub?.status ?? "Sin sub"}
                    </span>
                    {plan && (
                      <span className="text-[10px] bg-white/5 px-2 py-1 rounded font-bold text-gray-400 border border-white/5">
                        PLAN {plan.name}
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-2xl font-black mb-1">{t.name}</h3>
                <p className="text-sm text-gray-500 mb-1 font-mono">/{t.slug}</p>
                {t.domain && <p className="text-xs text-gray-600 mb-6 font-mono">{t.domain}</p>}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase font-black mb-1">Vencimiento</p>
                    <p className="text-sm font-bold text-orange-200">
                      {sub?.currentPeriodEnd
                        ? new Date(sub.currentPeriodEnd).toLocaleDateString("es-MX")
                        : "—"}
                    </p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase font-black mb-1">Sucursales</p>
                    <p className="text-sm font-bold text-white">
                      {t._count.locations} / {plan?.maxLocations ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-around py-4 border-y border-white/5">
                  <div className="text-center">
                    <p className="text-[9px] text-gray-500 font-bold uppercase">Pedidos</p>
                    <p className="text-xl font-black">{t._count.orders}</p>
                  </div>
                  <div className="w-[1px] h-8 bg-white/5" />
                  <div className="text-center">
                    <p className="text-[9px] text-gray-500 font-bold uppercase">Usuarios</p>
                    <p className="text-xl font-black">{t._count.users}</p>
                  </div>
                  <div className="w-[1px] h-8 bg-white/5" />
                  <div className="text-center">
                    <p className="text-[9px] text-gray-500 font-bold uppercase">MRR</p>
                    <p className="text-xl font-black text-orange-400">${sub?.priceSnapshot ?? 0}</p>
                  </div>
                </div>

                {/* Features */}
                {plan && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {plan.hasKDS       && <span className="text-[9px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded font-black">KDS</span>}
                    {plan.hasLoyalty   && <span className="text-[9px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-black">LOYALTY</span>}
                    {plan.hasInventory && <span className="text-[9px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded font-black">INVENTARIO</span>}
                    {plan.hasReports   && <span className="text-[9px] bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded font-black">REPORTES</span>}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-4 bg-white/5 flex gap-2">
                <button onClick={() => openEdit(t)}
                  className="flex-1 bg-white/5 hover:bg-white/10 py-3 rounded-xl text-xs font-black transition-all border border-white/5">
                  CAMBIAR PLAN
                </button>
                {sub?.status === "SUSPENDED"
                  ? <button onClick={() => handleStatus(t, "ACTIVE")}
                      className="flex-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 py-3 rounded-xl text-xs font-black transition-all">
                      ACTIVAR
                    </button>
                  : <button onClick={() => handleStatus(t, "SUSPENDED")}
                      className="flex-1 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 py-3 rounded-xl text-xs font-black transition-all">
                      PAUSAR
                    </button>
                }
                <button onClick={() => handleDelete(t)}
                  className="w-12 bg-white/5 hover:bg-red-500/20 hover:text-red-500 py-3 rounded-xl text-xs transition-all border border-white/5">
                  🗑️
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {tenants.length === 0 && (
        <div className="text-center py-32 text-gray-600">
          <p className="text-6xl mb-4">🏪</p>
          <p className="font-black text-xl uppercase tracking-widest">Sin tenants registrados</p>
          <p className="text-sm mt-2">Registra la primera marca para comenzar.</p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
          <div className="bg-[#111] border border-gray-800 rounded-[3rem] p-10 w-full max-w-xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-3xl font-black mb-2">
              {editingTenant ? "Cambiar Plan" : "Nueva Marca"}
            </h2>
            <p className="text-gray-500 text-sm mb-10">
              {editingTenant
                ? `Cambiando plan de "${editingTenant.name}"`
                : "Registra un nuevo restaurante en MRTPVREST."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {!editingTenant && (
                <>
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block">Nombre del Negocio</label>
                    <input required value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block">Slug URL</label>
                    <input required value={form.slug}
                      onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                      placeholder="ej: pizzeria-roma"
                      className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-mono" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block">Dominio (opcional)</label>
                    <input value={form.domain}
                      onChange={e => setForm({ ...form, domain: e.target.value })}
                      placeholder="mirestaurante.com"
                      className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-mono" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block">URL del Logo (opcional)</label>
                    <input value={form.logoUrl}
                      onChange={e => setForm({ ...form, logoUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-mono" />
                  </div>
                </>
              )}

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block">Plan de Servicio</label>
                <select required value={form.planId}
                  onChange={e => setForm({ ...form, planId: e.target.value })}
                  className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold">
                  <option value="">Selecciona un plan...</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.displayName} — ${p.price}/mes · {p.maxLocations} sucursal(es)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-4 text-gray-500 font-bold hover:text-white transition-colors">
                  CANCELAR
                </button>
                <button type="submit"
                  className="flex-1 bg-orange-500 hover:bg-orange-600 py-4 rounded-[1.5rem] font-black text-white shadow-2xl shadow-orange-500/20 active:scale-95 transition-all uppercase tracking-tighter">
                  {editingTenant ? "GUARDAR PLAN" : "ACTIVAR MARCA"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
