"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Power, X, Search, ShieldCheck } from "lucide-react";
import api from "@/lib/api";
import BackButton from "@/components/BackButton";

const ROLES = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN", "COOK", "DELIVERY"];

const PERM_KEYS = [
  { key: "canCharge", label: "Cobrar / Apertura Cajón" },
  { key: "canDiscount", label: "Aplicar Descuentos" },
  { key: "canModifyTickets", label: "Modificar Comandas" },
  { key: "canDeleteTickets", label: "Eliminar Registros" },
  { key: "canConfigSystem", label: "Configurar Sistema" },
  { key: "canTakeDelivery", label: "Atender Domicilios" },
  { key: "canTakeTakeout", label: "Atender Llevar" },
  { key: "canManageShifts", label: "Gestión de Turnos" },
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

const ROLE_STYLE: Record<string, { bg: string; text: string }> = {
  OWNER:    { bg: "bg-amber-500/10", text: "text-amber-500" },
  ADMIN:    { bg: "bg-amber-500/10", text: "text-amber-500" },
  MANAGER:  { bg: "bg-blue-500/10",  text: "text-blue-400" },
  CASHIER:  { bg: "bg-zinc-800",     text: "text-zinc-300" },
  WAITER:   { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  KITCHEN:  { bg: "bg-orange-500/10", text: "text-orange-400" },
  COOK:     { bg: "bg-orange-500/10", text: "text-orange-400" },
  DELIVERY: { bg: "bg-cyan-500/10",   text: "text-cyan-400" },
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
      setError(e?.response?.data?.error || "Error de conexión con el servidor");
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
    <div className="min-h-full p-6 sm:p-10 font-sans bg-[#0a0a0c]">
      {/* Header WARM TECH */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 mb-12">
        <div className="flex items-start gap-4">
          <BackButton ariaLabel="Volver al panel admin" />
          <div className="space-y-1.5">
            <span className="eyebrow text-amber-500/80">Recursos Humanos</span>
            <h1 className="text-4xl font-black text-white tracking-tight leading-none">Gestión de Personal</h1>
            <p className="text-sm font-bold text-zinc-500">
              {employees.length} usuarios registrados en la plataforma
            </p>
          </div>
        </div>
        <button onClick={() => setCreating(true)}
          className="h-14 px-8 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-[0.2em] text-xs flex items-center gap-3 transition-all active:scale-95 shadow-[0_10px_30px_rgba(255,184,77,0.25)]">
          <Plus size={20} strokeWidth={3} /> Nuevo empleado
        </button>
      </div>

      {/* Search - TOUCH OPTIMIZED */}
      <div className="relative mb-10">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
        <input 
          value={search} 
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrar por nombre, cargo o ID…"
          className="w-full h-16 bg-[#121316] border border-white/5 rounded-2xl pl-14 pr-6 text-white font-bold outline-none focus:border-amber-500/50 transition-all placeholder:text-zinc-700" 
        />
      </div>

      {error && (
        <div className="mb-10 rounded-[1.25rem] p-5 text-sm font-black uppercase tracking-widest bg-red-500/10 border border-red-500/20 text-red-500 animate-in fade-in">
          Error: {error}
        </div>
      )}

      {/* Employees Table - OBSIDIAN STYLE */}
      <div className="rounded-[2.5rem] bg-[#121316] border border-white/5 shadow-2xl overflow-hidden">
        <div className="grid grid-cols-[1fr_160px_160px_140px_160px] gap-6 px-10 py-6 text-[10px] font-black tracking-[0.3em] uppercase bg-black/20 text-zinc-600 border-b border-white/5">
          <span>Identidad</span>
          <span>Jerarquía</span>
          <span>Contacto</span>
          <span className="text-center">Estado</span>
          <span className="text-right">Controles</span>
        </div>

        {loading ? (
          <div className="px-10 py-24 text-center">
             <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
             <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sincronizando base de datos...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-10 py-24 text-center opacity-40">
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-500 italic">
              {search ? "No hay coincidencias para el filtro" : "Lista de personal vacía"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(emp => {
              const style = ROLE_STYLE[emp.role] || ROLE_STYLE.WAITER;
              return (
                <div key={emp.id}
                  className="grid grid-cols-[1fr_160px_160px_140px_160px] gap-6 px-10 py-6 items-center active:bg-white/[0.02] transition-colors group">
                  <div className="flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-xl ${style.bg} ${style.text}`}>
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                       <span className="font-black text-white tracking-tight">{emp.name}</span>
                       <span className="text-[10px] text-zinc-600 font-bold uppercase">ID: {emp.id.slice(-6).toUpperCase()}</span>
                    </div>
                  </div>
                  <div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/5 ${style.bg} ${style.text}`}>
                      {emp.role}
                    </span>
                  </div>
                  <span className="text-[13px] font-black mono text-zinc-400">{emp.phone || "—"}</span>
                  <div className="flex justify-center">
                    <button onClick={() => handleToggle(emp)}
                      className={`h-10 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-90 flex items-center gap-2 border ${
                        emp.isActive 
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                          : "bg-zinc-800 text-zinc-500 border-white/5"
                      }`}>
                      <Power size={12} strokeWidth={3} />
                      {emp.isActive ? "Activo" : "Baja"}
                    </button>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => setEditing(emp)}
                      className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/5 text-zinc-500 active:text-amber-500 transition-all active:scale-90 border border-white/5">
                      <Pencil size={18} />
                    </button>
                    <button onClick={() => handleDelete(emp)}
                      className="w-12 h-12 rounded-xl flex items-center justify-center bg-red-500/5 text-zinc-700 active:text-red-500 transition-all active:scale-90 border border-red-500/10">
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

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[#121316] rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between p-10 border-b border-white/5 bg-black/20">
          <div className="flex flex-col gap-1">
             <span className="eyebrow text-amber-500">Expediente de Personal</span>
             <h2 className="text-3xl font-black text-white tracking-tight">{isEdit ? "Editar Colaborador" : "Registrar Empleado"}</h2>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#0a0a0c] text-zinc-500 active:text-white transition-all active:scale-90 border border-white/5">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={submit} className="p-10 max-h-[70vh] overflow-y-auto flex flex-col gap-10 scrollbar-hide">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <Field label="Nombre del Colaborador">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nombre completo"
                className="w-full h-14 px-6 rounded-2xl bg-[#0a0a0c] border border-white/5 text-white font-bold outline-none focus:border-amber-500/50 transition-all placeholder:text-zinc-700" />
            </Field>
            <Field label="Cargo Operativo">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full h-14 px-6 rounded-2xl bg-[#0a0a0c] border border-white/5 text-white font-bold outline-none focus:border-amber-500/50 transition-all appearance-none cursor-pointer">
                {ROLES.map(r => <option key={r} value={r} className="bg-[#121316]">{r}</option>)}
              </select>
            </Field>
            <Field label="Teléfono de Contacto">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+52 000 000 0000"
                className="w-full h-14 px-6 rounded-2xl bg-[#0a0a0c] border border-white/5 text-white font-black mono outline-none focus:border-amber-500/50 transition-all placeholder:text-zinc-700" />
            </Field>
            <Field label={isEdit ? "Cambiar PIN de Acceso" : "PIN Inicial (4-6 dígitos)"}>
              <input type="password" inputMode="numeric" pattern="\d*" value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
                placeholder={isEdit ? "••••••" : "Ej. 2580"} maxLength={6}
                className="w-full h-14 px-6 rounded-2xl bg-[#0a0a0c] border border-white/5 text-white font-black mono text-lg outline-none focus:border-amber-500/50 transition-all placeholder:text-zinc-700" />
            </Field>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-6 ml-1">
               <ShieldCheck size={18} className="text-amber-500" />
               <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">Privilegios y Permisos de Sistema</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {PERM_KEYS.map(p => (
                <label key={p.key} className="group flex items-center gap-4 px-6 py-4 rounded-2xl bg-[#0a0a0c] border border-white/5 active:bg-white/[0.03] cursor-pointer transition-all active:scale-95">
                  <input type="checkbox" className="w-5 h-5 accent-amber-500 rounded-lg" checked={(form as any)[p.key]}
                    onChange={(e) => setForm({ ...form, [p.key]: e.target.checked })} />
                  <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400 group-active:text-white">{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          {err && (
            <div className="rounded-2xl p-5 text-[10px] font-black uppercase tracking-widest bg-red-500/10 border border-red-500/20 text-red-500">
              {err}
            </div>
          )}

          <div className="flex gap-4 mt-4">
            <button type="button" onClick={onClose}
              className="flex-1 h-16 rounded-2xl bg-white/5 text-zinc-500 font-black uppercase tracking-[0.2em] text-[10px] active:scale-95 transition-all active:text-white">
              Cerrar
            </button>
            <button type="submit" disabled={submitting}
              className="flex-[2] h-16 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-[0.2em] text-[10px] active:scale-95 transition-all shadow-xl disabled:opacity-20 shadow-amber-500/20">
              {submitting ? "Procesando..." : (isEdit ? "Guardar Cambios" : "Dar de Alta Empleado")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-[10px] font-black tracking-[0.2em] text-zinc-500 uppercase ml-1">{label}</label>
      {children}
    </div>
  );
}
