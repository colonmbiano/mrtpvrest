"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Power, X, Search } from "lucide-react";
import api from "@/lib/api";

const ROLES = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN", "COOK", "DELIVERY"];

const PERM_KEYS = [
  { key: "canCharge", label: "Cobrar / cash drawer" },
  { key: "canDiscount", label: "Aplicar descuentos" },
  { key: "canModifyTickets", label: "Modificar tickets" },
  { key: "canDeleteTickets", label: "Eliminar tickets" },
  { key: "canConfigSystem", label: "Configurar sistema" },
  { key: "canTakeDelivery", label: "Atender delivery" },
  { key: "canTakeTakeout", label: "Atender para llevar" },
  { key: "canManageShifts", label: "Gestionar turnos" },
] as const;

interface Employee {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  canCharge: boolean;
  canDiscount: boolean;
  canModifyTickets: boolean;
  canDeleteTickets: boolean;
  canConfigSystem: boolean;
  canTakeDelivery: boolean;
  canTakeTakeout: boolean;
  canManageShifts: boolean;
}

const ROLE_BADGE: Record<string, { bg: string; fg: string }> = {
  OWNER:    { bg: "rgba(255,132,0,0.18)",  fg: "#FF8400" },
  ADMIN:    { bg: "rgba(255,132,0,0.18)",  fg: "#FF8400" },
  MANAGER:  { bg: "rgba(168,139,250,0.2)", fg: "#A78BFA" },
  CASHIER:  { bg: "rgba(96,165,250,0.2)",  fg: "#60A5FA" },
  WAITER:   { bg: "rgba(136,214,108,0.2)", fg: "#88D66C" },
  KITCHEN:  { bg: "rgba(255,184,77,0.2)",  fg: "#FFB84D" },
  COOK:     { bg: "rgba(255,184,77,0.2)",  fg: "#FFB84D" },
  DELIVERY: { bg: "rgba(34,211,238,0.2)",  fg: "#22D3EE" },
};

export default function UsuariosAdmin() {
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
      setError(e?.response?.data?.error || "No pudimos cargar los empleados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.role.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (emp: Employee) => {
    if (!confirm(`¿Eliminar a ${emp.name}? Esta acción no se puede deshacer.`)) return;
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
    <div className="min-h-full p-8" style={{ background: "#0C0C0E", color: "#FFFFFF", fontFamily: "JetBrains Mono, monospace" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold tracking-wider" style={{ color: "#666" }}>ADMINISTRACIÓN</p>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-xs mt-1" style={{ color: "#B8B9B6" }}>
            {employees.length} empleados · {employees.filter(e => e.isActive).length} activos
          </p>
        </div>
        <button onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-black"
          style={{ background: "#FF8400", boxShadow: "0 6px 14px rgba(255,132,0,0.3)" }}>
          <Plus size={15} /> Nuevo empleado
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl"
        style={{ background: "#1A1A1A", border: "1px solid #27272A" }}>
        <Search size={14} style={{ color: "#666" }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o rol…"
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-zinc-600" />
      </div>

      {error && (
        <div className="mb-4 rounded-xl p-3 text-xs"
          style={{ background: "#FF5C3315", border: "1px solid #FF5C3340", color: "#FF5C33" }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#1A1A1A", border: "1px solid #2E2E2E" }}>
        <div className="grid grid-cols-[1fr_120px_120px_100px_140px] gap-3 px-5 py-3 text-[10px] font-bold tracking-wider"
          style={{ color: "#666", borderBottom: "1px solid #27272A" }}>
          <span>NOMBRE</span>
          <span>ROL</span>
          <span>TELÉFONO</span>
          <span className="text-center">ESTADO</span>
          <span className="text-right">ACCIONES</span>
        </div>

        {loading ? (
          <div className="px-5 py-12 text-center text-xs" style={{ color: "#666" }}>Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-xs" style={{ color: "#666" }}>
            {search ? "Sin resultados" : "Aún no hay empleados"}
          </div>
        ) : (
          filtered.map(emp => {
            const badge = ROLE_BADGE[emp.role] || ROLE_BADGE.WAITER;
            return (
              <div key={emp.id}
                className="grid grid-cols-[1fr_120px_120px_100px_140px] gap-3 px-5 py-3 items-center text-sm hover:bg-white/5 transition"
                style={{ borderBottom: "1px solid #1F1F23" }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs"
                    style={{ background: badge.bg, color: badge.fg }}>
                    {emp.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-bold truncate">{emp.name}</span>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold w-fit"
                  style={{ background: badge.bg, color: badge.fg }}>
                  {emp.role}
                </span>
                <span className="text-xs" style={{ color: "#B8B9B6" }}>{emp.phone || "—"}</span>
                <button onClick={() => handleToggle(emp)}
                  className="mx-auto inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold"
                  style={{
                    background: emp.isActive ? "rgba(136,214,108,0.18)" : "rgba(255,255,255,0.04)",
                    color: emp.isActive ? "#88D66C" : "#666",
                    border: `1px solid ${emp.isActive ? "rgba(136,214,108,0.4)" : "rgba(255,255,255,0.08)"}`,
                  }}>
                  <Power size={10} />
                  {emp.isActive ? "Activo" : "Inactivo"}
                </button>
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => setEditing(emp)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Pencil size={13} style={{ color: "#FFB84D" }} />
                  </button>
                  <button onClick={() => handleDelete(emp)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,92,51,0.2)" }}>
                    <Trash2 size={13} style={{ color: "#FF5C33" }} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {(creating || editing) && (
        <EmployeeModal
          employee={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function EmployeeModal({ employee, onClose, onSaved }:
  { employee: Employee | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!employee;
  const [form, setForm] = useState({
    name: employee?.name || "",
    phone: employee?.phone || "",
    pin: "",
    role: employee?.role || "WAITER",
    isActive: employee?.isActive ?? true,
    canCharge: employee?.canCharge ?? false,
    canDiscount: employee?.canDiscount ?? false,
    canModifyTickets: employee?.canModifyTickets ?? false,
    canDeleteTickets: employee?.canDeleteTickets ?? false,
    canConfigSystem: employee?.canConfigSystem ?? false,
    canTakeDelivery: employee?.canTakeDelivery ?? false,
    canTakeTakeout: employee?.canTakeTakeout ?? true,
    canManageShifts: employee?.canManageShifts ?? false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr("");
    try {
      const payload = { ...form };
      if (!payload.pin) delete (payload as any).pin;
      if (isEdit) {
        await api.put(`/api/employees/${employee!.id}`, payload);
      } else {
        if (!payload.pin) throw new Error("El PIN es requerido para nuevos empleados");
        await api.post("/api/employees", payload);
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.response?.data?.error || e.message || "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: "#131316", border: "1px solid #2E2E2E", color: "#FFFFFF", fontFamily: "JetBrains Mono, monospace" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #27272A" }}>
          <h2 className="text-base font-bold">{isEdit ? "Editar empleado" : "Nuevo empleado"}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-4 max-h-[70vh] overflow-y-auto flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#0C0C0E] border border-[#27272A] text-sm outline-none focus:border-orange-500/60" />
            </Field>
            <Field label="Rol">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#0C0C0E] border border-[#27272A] text-sm outline-none">
                {ROLES.map(r => <option key={r} value={r} className="bg-[#131316]">{r}</option>)}
              </select>
            </Field>
            <Field label="Teléfono (opcional)">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#0C0C0E] border border-[#27272A] text-sm outline-none" />
            </Field>
            <Field label={isEdit ? "PIN nuevo (vacío = no cambia)" : "PIN (4-6 dígitos)"}>
              <input type="password" inputMode="numeric" pattern="\d*" value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
                placeholder={isEdit ? "Sin cambios" : "1234"} maxLength={6}
                className="w-full px-3 py-2 rounded-lg bg-[#0C0C0E] border border-[#27272A] text-sm outline-none" />
            </Field>
          </div>

          <div>
            <p className="text-[10px] font-bold tracking-wider mb-2" style={{ color: "#666" }}>PERMISOS</p>
            <div className="grid grid-cols-2 gap-1">
              {PERM_KEYS.map(p => (
                <label key={p.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                  <input type="checkbox" checked={(form as any)[p.key]}
                    onChange={(e) => setForm({ ...form, [p.key]: e.target.checked })} />
                  <span className="text-xs">{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer">
              <input type="checkbox" checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              <span className="text-xs">Empleado activo</span>
            </label>
          )}

          {err && (
            <div className="rounded-lg p-2.5 text-xs"
              style={{ background: "#FF5C3315", border: "1px solid #FF5C3340", color: "#FF5C33" }}>
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-bold"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#B8B9B6" }}>
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
              className="px-5 py-2 rounded-full text-xs font-bold text-black disabled:opacity-50"
              style={{ background: "#FF8400" }}>
              {submitting ? "Guardando…" : (isEdit ? "Guardar cambios" : "Crear empleado")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold tracking-wider" style={{ color: "#666" }}>{label.toUpperCase()}</label>
      {children}
    </div>
  );
}
