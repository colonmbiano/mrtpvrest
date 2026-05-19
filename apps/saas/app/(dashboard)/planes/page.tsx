"use client";
import { useEffect, useState, type ComponentType } from "react";
import {
  Flame, Package, Coins, BarChart3, Plug, CreditCard, Bike, Users as UsersIcon,
  Wallet, ShoppingBag, ShoppingCart, Utensils, Trophy, Globe2, X, Check,
} from "lucide-react";
import api from "@/lib/api";

// /planes — CRUD de planes del SaaS (SUPER_ADMIN).
// Cada plan tiene flags individuales para feature gating + allowedModules
// como array de strings flexibles.

interface Plan {
  id: string;
  name: string;
  displayName: string;
  price: number;
  trialDays: number;
  maxLocations: number;
  maxEmployees: number;
  hasKDS: boolean;
  hasLoyalty: boolean;
  hasInventory: boolean;
  hasReports: boolean;
  hasAPIAccess: boolean;
  isActive: boolean;
  allowedModules: string[];
  stripePriceId: string | null;
  createdAt: string;
}

type IconCmp = ComponentType<{ size?: number; className?: string }>;

// Features booleanas que se traducen 1:1 a flags hasX del schema.
const FEATURE_FLAGS: Array<{ key: keyof Plan; label: string; Icon: IconCmp; description: string }> = [
  { key: "hasKDS",        label: "Cocina KDS",       Icon: Flame,    description: "Pantalla de cocina en tiempo real" },
  { key: "hasInventory",  label: "Inventario",       Icon: Package,  description: "Recetas, costeo, compras, gastos, factor corrección" },
  { key: "hasLoyalty",    label: "Loyalty / Puntos", Icon: Coins,    description: "Programa de fidelidad + cupones" },
  { key: "hasReports",    label: "Reportes IA",      Icon: BarChart3,description: "Dashboard analítico + asistente conversacional" },
  { key: "hasAPIAccess",  label: "API Access",       Icon: Plug,     description: "Endpoints para integraciones del cliente" },
];

// Módulos flexibles (allowedModules). Strings libres para gateo granular más allá de los booleanos.
const AVAILABLE_MODULES: Array<{ id: string; label: string; Icon: IconCmp }> = [
  { id: "pos_standard",        label: "POS Estándar",        Icon: CreditCard },
  { id: "kds",                 label: "Cocina (KDS)",        Icon: Flame },
  { id: "delivery",            label: "Delivery",            Icon: Bike },
  { id: "inventory",           label: "Inventario",          Icon: Package },
  { id: "employee_management", label: "Empleados",           Icon: UsersIcon },
  { id: "cash_shift",          label: "Turnos de Caja",      Icon: Wallet },
  { id: "client_menu",         label: "Tienda Online",       Icon: ShoppingBag },
  { id: "kiosk",               label: "Kiosko Autoservicio", Icon: ShoppingCart },
  { id: "waiters",             label: "Meseros / Salón",     Icon: Utensils },
  { id: "loyalty_advanced",    label: "Loyalty Avanzado",    Icon: Trophy },
  { id: "multi_currency",      label: "Multi-moneda",        Icon: Globe2 },
];

const EMPTY_PLAN: Omit<Plan, "id" | "createdAt"> = {
  name: "", displayName: "", price: 299, trialDays: 15,
  maxLocations: 1, maxEmployees: 5,
  hasKDS: false, hasLoyalty: false, hasInventory: false, hasReports: false, hasAPIAccess: false,
  isActive: true, allowedModules: ["pos_standard"], stripePriceId: null,
};

export default function PlanesPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | (typeof EMPTY_PLAN & { id: null }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<Plan[]>("/api/saas/plans/all");
      setPlans(data || []);
    } catch (e: any) {
      setToast(e?.response?.data?.error || "Error al cargar planes");
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setEditing({ ...EMPTY_PLAN, id: null });
  }

  function openEdit(p: Plan) {
    setEditing({ ...p });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setToast("");
    try {
      const payload = {
        name: editing.name,
        displayName: editing.displayName,
        price: Number(editing.price) || 0,
        trialDays: Number(editing.trialDays) || 15,
        maxLocations: Number(editing.maxLocations) || 1,
        maxEmployees: Number(editing.maxEmployees) || 5,
        hasKDS: editing.hasKDS,
        hasLoyalty: editing.hasLoyalty,
        hasInventory: editing.hasInventory,
        hasReports: editing.hasReports,
        hasAPIAccess: editing.hasAPIAccess,
        allowedModules: editing.allowedModules,
        stripePriceId: editing.stripePriceId || null,
        isActive: editing.isActive,
      };
      if (editing.id) {
        await api.patch(`/api/saas/plans/${editing.id}`, payload);
        setToast("Plan actualizado");
      } else {
        await api.post("/api/saas/plans", payload);
        setToast("Plan creado");
      }
      setEditing(null);
      load();
    } catch (e: any) {
      setToast(e?.response?.data?.error || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Plan) {
    if (!confirm(`¿Desactivar "${p.displayName}"? Las suscripciones activas no se ven afectadas.`)) return;
    try {
      await api.delete(`/api/saas/plans/${p.id}`);
      setToast("Plan desactivado");
      load();
    } catch (e: any) {
      setToast(e?.response?.data?.error || "Error al eliminar");
    }
  }

  function toggleModule(mid: string) {
    if (!editing) return;
    const has = editing.allowedModules.includes(mid);
    setEditing({
      ...editing,
      allowedModules: has
        ? editing.allowedModules.filter((m) => m !== mid)
        : [...editing.allowedModules, mid],
    });
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne text-3xl font-black">Planes</h1>
          <p className="text-xs uppercase tracking-widest text-gray-500 mt-1">
            Define qué recibe cada tier · {plans.filter((p) => p.isActive).length} activos / {plans.length} total
          </p>
        </div>
        <button
          onClick={openNew}
          className="px-5 py-2.5 rounded-xl font-syne font-black text-sm"
          style={{ background: "var(--brand, #f97316)", color: "#000" }}
        >
          + Nuevo plan
        </button>
      </div>

      {toast && (
        <div className="mb-4 px-4 py-2 rounded-xl text-sm" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>
          {toast}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Cargando…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} onEdit={() => openEdit(p)} onRemove={() => remove(p)} />
          ))}
        </div>
      )}

      {editing && (
        <EditorModal
          plan={editing}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={save}
          saving={saving}
          toggleModule={toggleModule}
        />
      )}
    </div>
  );
}

function PlanCard({ plan, onEdit, onRemove }: { plan: Plan; onEdit: () => void; onRemove: () => void }) {
  const activeFlags = FEATURE_FLAGS.filter((f) => plan[f.key]);
  return (
    <div className="rounded-2xl p-5 relative" style={{ background: "var(--surface, #111)", border: "1px solid var(--border, #333)", opacity: plan.isActive ? 1 : 0.5 }}>
      {!plan.isActive && (
        <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
          Inactivo
        </span>
      )}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-syne text-xl font-black">{plan.displayName}</h3>
          <p className="text-xs uppercase tracking-widest text-gray-500 font-mono">{plan.name}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black tabular-nums">${plan.price.toFixed(0)}</div>
          <div className="text-[10px] uppercase text-gray-500">/mes</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="rounded-lg px-2 py-1.5" style={{ background: "var(--surface2, #1a1a1a)" }}>
          <p className="text-[10px] uppercase text-gray-500">Trial</p>
          <p className="font-bold tabular-nums">{plan.trialDays} días</p>
        </div>
        <div className="rounded-lg px-2 py-1.5" style={{ background: "var(--surface2, #1a1a1a)" }}>
          <p className="text-[10px] uppercase text-gray-500">Sucursales</p>
          <p className="font-bold tabular-nums">{plan.maxLocations >= 99 ? "∞" : plan.maxLocations}</p>
        </div>
        <div className="rounded-lg px-2 py-1.5" style={{ background: "var(--surface2, #1a1a1a)" }}>
          <p className="text-[10px] uppercase text-gray-500">Empleados</p>
          <p className="font-bold tabular-nums">{plan.maxEmployees >= 99 ? "∞" : plan.maxEmployees}</p>
        </div>
        <div className="rounded-lg px-2 py-1.5" style={{ background: "var(--surface2, #1a1a1a)" }}>
          <p className="text-[10px] uppercase text-gray-500">Módulos</p>
          <p className="font-bold tabular-nums">{plan.allowedModules.length}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {activeFlags.length === 0 ? (
          <span className="text-[10px] text-gray-500">Sin features premium</span>
        ) : (
          activeFlags.map((f) => {
            const I = f.Icon;
            return (
              <span key={String(f.key)} className="text-[10px] px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1" style={{ background: "rgba(249,115,22,0.1)", color: "#f97316", border: "1px solid rgba(249,115,22,0.3)" }}>
                <I size={11} /> {f.label}
              </span>
            );
          })
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onEdit} className="flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider" style={{ background: "var(--surface2, #1a1a1a)", border: "1px solid var(--border, #333)", color: "var(--text)" }}>
          Editar
        </button>
        {plan.isActive && (
          <button onClick={onRemove} className="px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function EditorModal({ plan, onChange, onClose, onSave, saving, toggleModule }: {
  plan: any;
  onChange: (p: any) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  toggleModule: (mid: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl my-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--surface, #111)", border: "1px solid var(--border, #333)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-syne text-2xl font-black">
            {plan.id ? "Editar plan" : "Nuevo plan"}
          </h2>
          <button onClick={onClose} className="text-gray-500 inline-flex items-center justify-center"><X size={20} /></button>
        </div>

        {/* Identidad */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Field label="Nombre interno (slug)">
            <input
              value={plan.name || ""}
              onChange={(e) => onChange({ ...plan, name: e.target.value.toUpperCase().replace(/\s+/g, "_") })}
              disabled={!!plan.id}
              placeholder="BASIC, PRO, UNLIMITED"
              className="w-full px-3 py-2 rounded-lg outline-none uppercase font-mono text-sm"
              style={{ background: "var(--surface2, #1a1a1a)", border: "1px solid var(--border, #333)", color: "var(--text)" }}
            />
          </Field>
          <Field label="Nombre visible">
            <input
              value={plan.displayName || ""}
              onChange={(e) => onChange({ ...plan, displayName: e.target.value })}
              placeholder="Básico, Pro, Premium"
              className="w-full px-3 py-2 rounded-lg outline-none text-sm"
              style={{ background: "var(--surface2, #1a1a1a)", border: "1px solid var(--border, #333)", color: "var(--text)" }}
            />
          </Field>
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Field label="Precio/mes ($)">
            <input type="number" value={plan.price} onChange={(e) => onChange({ ...plan, price: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg outline-none tabular-nums text-sm"
              style={{ background: "var(--surface2, #1a1a1a)", border: "1px solid var(--border, #333)", color: "var(--text)" }} />
          </Field>
          <Field label="Días de trial">
            <input type="number" value={plan.trialDays} onChange={(e) => onChange({ ...plan, trialDays: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg outline-none tabular-nums text-sm"
              style={{ background: "var(--surface2, #1a1a1a)", border: "1px solid var(--border, #333)", color: "var(--text)" }} />
          </Field>
          <Field label="Price ID de pago">
            <input value={plan.stripePriceId || ""} onChange={(e) => onChange({ ...plan, stripePriceId: e.target.value || null })}
              placeholder="price_..."
              className="w-full px-3 py-2 rounded-lg outline-none text-xs font-mono"
              style={{ background: "var(--surface2, #1a1a1a)", border: "1px solid var(--border, #333)", color: "var(--text)" }} />
          </Field>
        </div>

        {/* Límites */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <Field label="Sucursales máx (999 = ∞)">
            <input type="number" value={plan.maxLocations} onChange={(e) => onChange({ ...plan, maxLocations: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg outline-none tabular-nums text-sm"
              style={{ background: "var(--surface2, #1a1a1a)", border: "1px solid var(--border, #333)", color: "var(--text)" }} />
          </Field>
          <Field label="Empleados máx (999 = ∞)">
            <input type="number" value={plan.maxEmployees} onChange={(e) => onChange({ ...plan, maxEmployees: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg outline-none tabular-nums text-sm"
              style={{ background: "var(--surface2, #1a1a1a)", border: "1px solid var(--border, #333)", color: "var(--text)" }} />
          </Field>
        </div>

        {/* Feature flags booleanas */}
        <div className="mb-5">
          <div className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-2">
            Features premium (booleanas)
          </div>
          <div className="grid grid-cols-1 gap-2">
            {FEATURE_FLAGS.map((f) => {
              const I = f.Icon;
              return (
                <label key={String(f.key)} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                  style={{
                    background: plan[f.key] ? "rgba(249,115,22,0.08)" : "var(--surface2, #1a1a1a)",
                    border: `1px solid ${plan[f.key] ? "rgba(249,115,22,0.4)" : "var(--border, #333)"}`,
                  }}>
                  <input
                    type="checkbox"
                    checked={plan[f.key]}
                    onChange={(e) => onChange({ ...plan, [f.key]: e.target.checked })}
                    className="w-5 h-5 cursor-pointer accent-orange-500"
                  />
                  <I size={18} className={plan[f.key] ? "text-orange-500" : "text-gray-500"} />
                  <div className="flex-1">
                    <p className="text-sm font-bold">{f.label}</p>
                    <p className="text-[11px] text-gray-500">{f.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* allowedModules flexibles */}
        <div className="mb-5">
          <div className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-2">
            Módulos del producto · selecciona cuáles incluye
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {AVAILABLE_MODULES.map((m) => {
              const active = plan.allowedModules.includes(m.id);
              const I = m.Icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleModule(m.id)}
                  className="p-3 rounded-xl text-left transition-all flex items-center gap-2"
                  style={{
                    background: active ? "rgba(249,115,22,0.08)" : "var(--surface2, #1a1a1a)",
                    border: `1px solid ${active ? "rgba(249,115,22,0.4)" : "var(--border, #333)"}`,
                  }}
                >
                  <I size={16} className={active ? "text-orange-500" : "text-gray-500"} />
                  <span className="text-xs font-bold flex-1">{m.label}</span>
                  {active && <Check size={14} className="text-orange-500" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Estado */}
        <label className="flex items-center gap-3 mb-5 p-3 rounded-xl cursor-pointer"
          style={{ background: "var(--surface2, #1a1a1a)", border: "1px solid var(--border, #333)", color: "var(--text)" }}>
          <input
            type="checkbox"
            checked={plan.isActive}
            onChange={(e) => onChange({ ...plan, isActive: e.target.checked })}
            className="w-5 h-5 cursor-pointer accent-orange-500"
          />
          <div className="flex-1">
            <p className="text-sm font-bold">Plan activo</p>
            <p className="text-[11px] text-gray-500">Si está activo, los clientes nuevos lo pueden elegir al registrarse</p>
          </div>
        </label>

        {/* Acciones */}
        <div className="flex gap-3 pt-3 border-t" style={{ borderColor: "var(--border, #333)" }}>
          <button onClick={onClose} className="px-5 py-3 rounded-xl text-sm font-bold uppercase tracking-wider"
            style={{ background: "var(--surface2, #1a1a1a)", border: "1px solid var(--border, #333)", color: "var(--text)" }}>
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving || !plan.name || !plan.displayName}
            className="flex-1 py-3 rounded-xl text-sm font-syne font-black"
            style={{ background: "var(--brand, #f97316)", color: "#000", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Guardando…" : (plan.id ? "Guardar cambios" : "Crear plan")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold block mb-1">{label}</label>
      {children}
    </div>
  );
}
