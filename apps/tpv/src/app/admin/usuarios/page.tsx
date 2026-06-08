"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Power,
  X,
  Search,
  ShieldCheck,
  KeyRound,
  Ban,
  BadgePercent,
  RotateCcw,
  Users,
} from "lucide-react";
import api from "@/lib/api";
import BackButton from "@/components/BackButton";
import PinInput from "@/components/ui/PinInput";
import AdminPinGuardModal from "@/components/AdminPinGuardModal";
import SeguridadPanel from "@/components/admin/SeguridadPanel";

const ROLES = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN", "COOK", "DELIVERY"];

// Permiso base de cobro (canónico → 'open_cash_drawer'). El resto del set
// canónico vive en SPECIAL_PERMS. Las columnas legacy sin operación
// (canModifyTickets, canDeleteTickets, canConfigSystem, canTakeDelivery,
// canTakeTakeout, canManageShifts) quedan deprecadas: ya no se editan aquí.
// `canDiscount` se unificó en `canApplyDiscounts` (sección especial).
const PERM_KEYS = [
  { key: "canCharge", label: "Cobrar / Apertura Cajón" },
] as const;

// FASE 10 · RBAC GRANULAR — Permisos operativos especiales.
// Cada uno desbloquea una operación sensible que normalmente requeriría
// gerente. El rol genérico no las habilita: el admin tiene que activarlas
// explícitamente por empleado.
const SPECIAL_PERMS: {
  key: SpecialPermKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}[] = [
  {
    key: "canCancelItems",
    label: "Anular productos enviados",
    description: "Permite eliminar items que ya salieron a cocina.",
    icon: Ban,
  },
  {
    key: "canApplyDiscounts",
    label: "Aplicar descuentos / cortesías",
    description: "Marcar items como cortesía o reducir el total.",
    icon: BadgePercent,
  },
  {
    key: "canReopenTables",
    label: "Reabrir cuentas cerradas",
    description: "Volver a abrir una orden ya cobrada para ajustar.",
    icon: RotateCcw,
  },
  {
    key: "canManageUsers",
    label: "Gestionar otros empleados",
    description: "Crear, editar o desactivar empleados.",
    icon: Users,
  },
];

type SpecialPermKey =
  | "canCancelItems"
  | "canApplyDiscounts"
  | "canReopenTables"
  | "canManageUsers";

interface Employee {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  // Permisos legacy
  canCharge: boolean;
  canDiscount: boolean;
  canModifyTickets: boolean;
  canDeleteTickets: boolean;
  canConfigSystem: boolean;
  canTakeDelivery: boolean;
  canTakeTakeout: boolean;
  canManageShifts: boolean;
  // Fase 10 · permisos granulares
  canCancelItems: boolean;
  canApplyDiscounts: boolean;
  canReopenTables: boolean;
  canManageUsers: boolean;
}

const ROLE_STYLE: Record<string, { bg: string; text: string }> = {
  OWNER:    { bg: "bg-amber-500/10",   text: "text-amber-500" },
  ADMIN:    { bg: "bg-amber-500/10",   text: "text-amber-500" },
  MANAGER:  { bg: "bg-blue-500/10",    text: "text-blue-400" },
  CASHIER:  { bg: "bg-zinc-800",       text: "text-zinc-300" },
  WAITER:   { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  KITCHEN:  { bg: "bg-orange-500/10",  text: "text-orange-400" },
  COOK:     { bg: "bg-orange-500/10",  text: "text-orange-400" },
  DELIVERY: { bg: "bg-cyan-500/10",    text: "text-cyan-400" },
};

export default function PersonalAdmin() {
  const [tab, setTab] = useState<"empleados" | "seguridad">("empleados");

  // Deep-link opcional (?tab=seguridad) sin useSearchParams (evita Suspense).
  // Mismo patrón que el centro de impresión unificado (/admin/impresoras).
  // Arranque diferido (queueMicrotask) para no llamar setState síncrono dentro
  // del effect (set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t === "seguridad") setTab("seguridad");
    });
    return () => { cancelled = true; };
  }, []);

  const TABS: Array<{ key: "empleados" | "seguridad"; label: string; icon: React.ReactNode }> = [
    { key: "empleados", label: "Empleados", icon: <Users size={16} /> },
    { key: "seguridad", label: "Seguridad", icon: <ShieldCheck size={16} /> },
  ];

  return (
    <div
      className="relative min-h-full p-6 sm:p-10 bg-[#0C0C0E] text-white overflow-hidden"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full blur-[120px] opacity-30"
        style={{ background: 'radial-gradient(circle, rgba(255,184,77,0.18) 0%, transparent 70%)' }}
      />

      <div className="relative z-10">
        {/* HEADER */}
        <div className="flex items-start gap-4 mb-8">
          <BackButton ariaLabel="Volver al panel admin" />
          <div className="space-y-1.5">
            <span className="text-[10px] font-black tracking-[0.25em] text-[#ffb84d] uppercase">
              Configuración
            </span>
            <h1 className="text-4xl font-black text-white tracking-tight leading-none">
              Personal y Seguridad
            </h1>
            <p className="text-sm font-bold text-white/40">
              Empleados, roles y PINs · políticas de autorización
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="inline-flex items-center gap-1 p-1 mb-8 rounded-2xl bg-white/5 border border-white/10">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black tracking-tight transition-colors ${
                tab === t.key
                  ? "bg-[#ffb84d] text-[#0C0C0E]"
                  : "text-white/55 active:bg-white/5"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === "empleados" ? <EmpleadosTab /> : <SeguridadPanel />}
      </div>
    </div>
  );
}

function EmpleadosTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/employees");
      setEmployees(data);
    } catch (e: any) {
      setError(e?.response?.data?.error || "Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    // Arranque diferido (ver impresoras): evita set-state-in-effect del
    // setLoading(true) síncrono de refresh; refresh() manual no se toca.
    queueMicrotask(() => { if (!cancelled) refresh(); });
    return () => { cancelled = true; };
  }, []);

  const filtered = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.role.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (emp: Employee) => {
    if (!confirm(`¿Eliminar a ${emp.name}? Esta acción es permanente.`)) return;
    try {
      await api.delete(`/api/employees/${emp.id}`);
      refresh();
    } catch (e: any) {
      alert(e?.response?.data?.error || "Error al eliminar");
    }
  };

  const handleToggle = async (emp: Employee) => {
    try {
      await api.put(`/api/employees/${emp.id}`, { isActive: !emp.isActive });
      refresh();
    } catch (e: any) {
      alert(e?.response?.data?.error || "Error al cambiar estado");
    }
  };

  return (
    <div>
      {/* Acciones del tab */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
        <p className="text-sm font-bold text-white/40">
          {employees.length} usuarios registrados en la plataforma
        </p>
        <button
          onClick={() => setCreating(true)}
          className="h-14 min-h-[64px] px-8 rounded-2xl bg-[#ffb84d] text-[#0C0C0E] font-black uppercase tracking-[0.2em] text-xs flex items-center gap-3 active:scale-95 transition-transform shadow-[0_10px_30px_rgba(255,184,77,0.25)]"
        >
          <Plus size={20} strokeWidth={3} /> Nuevo empleado
        </button>
      </div>

      {/* SEARCH */}
      <div className="relative mb-10">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/40" size={18} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrar por nombre, cargo o ID…"
          className="w-full h-16 bg-white/5 border border-white/10 rounded-2xl pl-14 pr-6 text-white font-bold outline-none focus:border-[#ffb84d]/50 transition-colors placeholder:text-white/30"
        />
      </div>

      {error && (
        <div className="mb-10 rounded-3xl p-5 text-sm font-black uppercase tracking-widest bg-red-500/10 border border-red-500/20 text-red-400">
          Error: {error}
        </div>
      )}

      {/* TABLE */}
      <div className="rounded-[2.5rem] bg-white/5 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden">
        <div className="grid grid-cols-[1fr_160px_160px_140px_160px] gap-6 px-10 py-6 text-[10px] font-black tracking-[0.3em] uppercase bg-black/20 text-white/40 border-b border-white/5">
          <span>Identidad</span>
          <span>Jerarquía</span>
          <span>Contacto</span>
          <span className="text-center">Estado</span>
          <span className="text-right">Controles</span>
        </div>

        {loading ? (
          <div className="px-10 py-24 text-center">
            <div className="w-10 h-10 border-4 border-[#ffb84d]/20 border-t-[#ffb84d] rounded-full animate-spin mx-auto mb-4" />
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">
              Sincronizando base de datos...
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-10 py-24 text-center opacity-40">
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40 italic">
              {search ? "No hay coincidencias para el filtro" : "Lista de personal vacía"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((emp) => {
              const style = ROLE_STYLE[emp.role] ?? { bg: "bg-emerald-500/10", text: "text-emerald-400" };
              return (
                <div
                  key={emp.id}
                  className="grid grid-cols-[1fr_160px_160px_140px_160px] gap-6 px-10 py-6 items-center active:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-5">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-xl ${style.bg} ${style.text}`}
                    >
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-black text-white tracking-tight">{emp.name}</span>
                      <span className="text-[10px] text-white/40 font-bold uppercase">
                        ID: {emp.id.slice(-6).toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/5 ${style.bg} ${style.text}`}
                    >
                      {emp.role}
                    </span>
                  </div>
                  <span className="text-[13px] font-black tabular-nums text-white/60">
                    {emp.phone || "—"}
                  </span>
                  <div className="flex justify-center">
                    <button
                      onClick={() => handleToggle(emp)}
                      className={`min-h-[40px] h-10 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-transform flex items-center gap-2 border ${
                        emp.isActive
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-white/5 text-white/40 border-white/10"
                      }`}
                    >
                      <Power size={12} strokeWidth={3} />
                      {emp.isActive ? "Activo" : "Baja"}
                    </button>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => setEditing(emp)}
                      aria-label={`Editar ${emp.name}`}
                      className="w-12 h-12 min-h-[48px] rounded-xl flex items-center justify-center bg-white/5 text-white/50 active:text-[#ffb84d] active:scale-95 transition-transform border border-white/10"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(emp)}
                      aria-label={`Eliminar ${emp.name}`}
                      className="w-12 h-12 min-h-[48px] rounded-xl flex items-center justify-center bg-red-500/5 text-white/40 active:text-red-400 active:scale-95 transition-transform border border-red-500/10"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <EmployeeModal
          employee={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ─── TOGGLE DISEÑO OPERATIVO ─────────────────────────────────────────────────────
//
// Switch táctil con el ámbar miel como color activo. Sin hover (mandato
// diseño operativo), feedback visible vía cambio de fondo y deslizamiento del
// thumb. Soporta clic en cualquier parte de la fila gracias al wrapper
// <button> que envuelve toda la tarjeta.

function WarmToggle({
  active,
  onChange,
  ariaLabel,
}: {
  active: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!active);
      }}
      className={`relative shrink-0 w-14 h-8 rounded-full transition-colors active:scale-95 border ${
        active
          ? "bg-[#ffb84d] border-[#ffb84d] shadow-[0_0_18px_rgba(255,184,77,0.4)]"
          : "bg-white/5 border-white/15"
      }`}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full transition-all ${
          active
            ? "left-7 bg-[#0C0C0E]"
            : "left-1 bg-white/70"
        }`}
      />
    </button>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────

function EmployeeModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!employee;
  const [form, setForm] = useState({
    name:  employee?.name  || "",
    phone: employee?.phone || "",
    pin:   "",
    role:  employee?.role  || "WAITER",
    isActive: employee?.isActive ?? true,
    // Legacy
    canCharge:        employee?.canCharge        ?? false,
    canDiscount:      employee?.canDiscount      ?? false,
    canModifyTickets: employee?.canModifyTickets ?? false,
    canDeleteTickets: employee?.canDeleteTickets ?? false,
    canConfigSystem:  employee?.canConfigSystem  ?? false,
    canTakeDelivery:  employee?.canTakeDelivery  ?? false,
    canTakeTakeout:   employee?.canTakeTakeout   ?? true,
    canManageShifts:  employee?.canManageShifts  ?? false,
    // Fase 10 · granulares
    canCancelItems:    employee?.canCancelItems    ?? false,
    canApplyDiscounts: employee?.canApplyDiscounts ?? false,
    canReopenTables:   employee?.canReopenTables   ?? false,
    canManageUsers:    employee?.canManageUsers    ?? false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  // BUG-5: si se está cambiando el PIN de un empleado existente, requerimos
  // que el admin re-autentique con su propio PIN antes de mandar el PATCH.
  // El payload queda en pendingPayload hasta que el guard valide.
  const [pendingPayload, setPendingPayload] = useState<any | null>(null);

  const setSpecial = (key: SpecialPermKey, value: boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const persist = async (payload: any) => {
    setSubmitting(true);
    setErr("");
    try {
      if (isEdit) {
        await api.put(`/api/employees/${employee!.id}`, payload);
      } else {
        if (!payload.pin) throw new Error("PIN requerido");
        await api.post("/api/employees", payload);
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.response?.data?.error || e.message || "Error al procesar solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...form };
    if (!payload.pin) delete payload.pin;

    // BUG-5: gate de seguridad antes de cambiar el PIN de un empleado
    // existente. Si solo se tocan otros campos (rol, permisos, etc.) el
    // flujo sigue directo. Si hay un PIN nuevo en el payload, primero
    // pedimos confirmación con el PIN del admin actual.
    if (isEdit && payload.pin) {
      setPendingPayload(payload);
      return;
    }

    await persist(payload);
  };

  const activeSpecialCount = SPECIAL_PERMS.reduce(
    (acc, p) => acc + (form[p.key] ? 1 : 0),
    0
  );

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-[#0C0C0E] rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between p-7 sm:p-9 border-b border-white/5 bg-white/5 backdrop-blur-md shrink-0">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] font-black tracking-[0.25em] text-[#ffb84d] uppercase">
              Expediente de Personal
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight truncate">
              {isEdit ? "Editar colaborador" : "Registrar empleado"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-12 h-12 min-h-[48px] rounded-2xl flex items-center justify-center bg-white/5 text-white/50 active:text-white active:scale-95 transition-transform border border-white/10 shrink-0"
          >
            <X size={22} />
          </button>
        </div>

        {/* BODY */}
        <form
          onSubmit={submit}
          className="flex-1 overflow-y-auto p-7 sm:p-9 flex flex-col gap-9 scrollbar-hide"
        >
          {/* IDENTIDAD */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Field label="Nombre del colaborador">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nombre completo"
                className="w-full h-14 min-h-[56px] px-6 rounded-2xl bg-white/5 border border-white/10 text-white font-bold outline-none focus:border-[#ffb84d]/50 transition-colors placeholder:text-white/30"
              />
            </Field>

            {/* ROL PRINCIPAL */}
            <Field label="Rol principal">
              <div className="relative">
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full h-14 min-h-[56px] px-6 rounded-2xl bg-white/5 border border-white/10 text-white font-bold outline-none focus:border-[#ffb84d]/50 transition-colors appearance-none cursor-pointer"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r} className="bg-[#0C0C0E]">
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </Field>

            <Field label="Teléfono de contacto">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+52 000 000 0000"
                className="w-full h-14 min-h-[56px] px-6 rounded-2xl bg-white/5 border border-white/10 text-white font-black tabular-nums outline-none focus:border-[#ffb84d]/50 transition-colors placeholder:text-white/30"
              />
            </Field>

            <Field label={isEdit ? "Cambiar PIN de acceso" : "PIN inicial (4-6 dígitos)"}>
              <PinInput
                masked
                value={form.pin}
                onChange={(pin) => setForm({ ...form, pin })}
                placeholder={isEdit ? "••••••" : "Ej. 2580"}
                className="w-full h-14 min-h-[56px] px-6 rounded-2xl bg-white/5 border border-white/10 text-white font-black tabular-nums text-lg outline-none focus:border-[#ffb84d]/50 transition-colors placeholder:text-white/30"
              />
            </Field>
          </section>

          {/* FASE 10 · PERMISOS OPERATIVOS ESPECIALES (RBAC granular) */}
          <section
            className="rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 p-6 sm:p-7 space-y-5"
          >
            <header className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-[#ffb84d]/15 border border-[#ffb84d]/30 text-[#ffb84d] flex items-center justify-center shrink-0">
                  <KeyRound size={20} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-black text-white tracking-tight">
                    Permisos operativos especiales
                  </h3>
                  <p className="text-[11px] font-bold text-white/50 mt-0.5 leading-relaxed">
                    Refinan el rol principal con autorizaciones puntuales. Activa
                    solo lo que este empleado necesita.
                  </p>
                </div>
              </div>
              <span className="shrink-0 mt-1 px-3 h-7 rounded-full bg-[#ffb84d]/10 border border-[#ffb84d]/20 text-[#ffb84d] text-[10px] font-black tracking-widest uppercase tabular-nums flex items-center">
                {activeSpecialCount} / {SPECIAL_PERMS.length}
              </span>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {SPECIAL_PERMS.map((p) => {
                const active = form[p.key];
                const Icon = p.icon;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setSpecial(p.key, !active)}
                    className={`group min-h-[88px] flex items-start gap-4 p-4 sm:p-5 rounded-2xl border-2 text-left active:scale-[0.99] transition-all ${
                      active
                        ? "bg-[#ffb84d]/10 border-[#ffb84d]/40 shadow-[0_5px_20px_-5px_rgba(255,184,77,0.25)]"
                        : "bg-white/[0.03] border-white/10"
                    }`}
                  >
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                        active
                          ? "bg-[#ffb84d]/15 border-[#ffb84d]/30 text-[#ffb84d]"
                          : "bg-white/5 border-white/10 text-white/50"
                      }`}
                    >
                      <Icon size={18} strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-[13px] font-black tracking-tight leading-snug ${
                            active ? "text-white" : "text-white/85"
                          }`}
                        >
                          {p.label}
                        </span>
                      </div>
                      <p
                        className={`text-[11px] font-medium mt-0.5 leading-relaxed ${
                          active ? "text-white/70" : "text-white/40"
                        }`}
                      >
                        {p.description}
                      </p>
                    </div>
                    <WarmToggle
                      active={active}
                      onChange={(v) => setSpecial(p.key, v)}
                      ariaLabel={p.label}
                    />
                  </button>
                );
              })}
            </div>
          </section>

          {/* PERMISOS LEGACY DEL SISTEMA */}
          <section>
            <div className="flex items-center gap-3 mb-5 ml-1">
              <ShieldCheck size={18} className="text-white/50" />
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">
                Privilegios del sistema (legacy)
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PERM_KEYS.map((p) => {
                const checked = (form as Record<string, unknown>)[p.key] as boolean;
                return (
                  <label
                    key={p.key}
                    className="group flex items-center gap-4 px-5 py-4 rounded-2xl bg-white/[0.03] border border-white/10 active:bg-white/5 cursor-pointer active:scale-[0.99] transition-all"
                  >
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded-md accent-[#ffb84d]"
                      checked={checked}
                      onChange={(e) =>
                        setForm({ ...form, [p.key]: e.target.checked })
                      }
                    />
                    <span className="text-[11px] font-black uppercase tracking-widest text-white/60 group-active:text-white">
                      {p.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          {err && (
            <div className="rounded-2xl p-5 text-[10px] font-black uppercase tracking-widest bg-red-500/10 border border-red-500/20 text-red-400">
              {err}
            </div>
          )}
        </form>

        <AdminPinGuardModal
          isOpen={pendingPayload !== null}
          onClose={() => setPendingPayload(null)}
          onSuccess={async () => {
            const payload = pendingPayload;
            setPendingPayload(null);
            if (payload) await persist(payload);
          }}
        />

        {/* FOOTER */}
        <div className="p-5 sm:p-7 border-t border-white/5 bg-[#0C0C0E] flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 min-h-[64px] h-16 rounded-2xl bg-white/5 border border-white/10 text-white/70 font-black uppercase tracking-[0.2em] text-[11px] active:scale-95 active:text-white transition-transform"
          >
            Cancelar
          </button>
          <button
            type="submit"
            onClick={submit}
            disabled={submitting}
            className="flex-[2] min-h-[64px] h-16 rounded-2xl bg-[#ffb84d] text-[#0C0C0E] font-black uppercase tracking-[0.2em] text-[11px] active:scale-95 transition-transform shadow-[0_10px_30px_rgba(255,184,77,0.25)] disabled:opacity-30 disabled:active:scale-100"
          >
            {submitting
              ? "Procesando..."
              : isEdit
              ? "Guardar cambios"
              : "Dar de alta empleado"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <label className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase ml-1">
        {label}
      </label>
      {children}
    </div>
  );
}
