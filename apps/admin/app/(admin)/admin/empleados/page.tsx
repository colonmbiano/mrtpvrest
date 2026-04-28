"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

const ROLES = [
  { value:"ADMIN",    label:"👑 Administrador", color:"#f59e0b" },
  { value:"CASHIER",  label:"💵 Cajero",         color:"#22c55e" },
  { value:"WAITER",   label:"🧑‍🍳 Mesero",         color:"#3b82f6" },
  { value:"DELIVERY", label:"🛵 Repartidor",     color:"#8b5cf6" },
  { value:"COOK",     label:"👨‍🍳 Cocinero",       color:"#ef4444" },
];

const ROLE_DEFAULTS: Record<string,any> = {
  ADMIN:    { canCharge:true,  canDiscount:true,  canModifyTickets:true,  canDeleteTickets:true,  canConfigSystem:true,  canTakeDelivery:true,  canTakeTakeout:true },
  CASHIER:  { canCharge:true,  canDiscount:true,  canModifyTickets:true,  canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:false, canTakeTakeout:true },
  WAITER:   { canCharge:false, canDiscount:false, canModifyTickets:false, canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:false, canTakeTakeout:true },
  DELIVERY: { canCharge:true,  canDiscount:false, canModifyTickets:false, canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:true,  canTakeTakeout:false },
  COOK:     { canCharge:false, canDiscount:false, canModifyTickets:false, canDeleteTickets:false, canConfigSystem:false, canTakeDelivery:false, canTakeTakeout:false },
};

const DAYS = ["LUN","MAR","MIE","JUE","VIE","SAB","DOM"];
const PERMS = [
  { key:"canCharge",        label:"💵 Cobrar tickets" },
  { key:"canDiscount",      label:"🏷️ Aplicar descuentos" },
  { key:"canModifyTickets", label:"✏️ Modificar tickets" },
  { key:"canDeleteTickets", label:"🗑️ Eliminar tickets" },
  { key:"canConfigSystem",  label:"⚙️ Configurar sistema" },
  { key:"canTakeDelivery",  label:"🛵 Tomar pedidos delivery" },
  { key:"canTakeTakeout",   label:"🥡 Tomar pedidos para llevar" },
];

const emptyForm = {
  name:"", phone:"", pin:"", role:"WAITER", photo:null as string|null,
  tables:[] as string[], scheduleStart:"", scheduleEnd:"", scheduleDays:[] as string[],
  isActive:true,
  canCharge:false, canDiscount:false, canModifyTickets:false, canDeleteTickets:false,
  canConfigSystem:false, canTakeDelivery:false, canTakeTakeout:true,
};

export default function EmpleadosPage() {
  const [employees, setEmployees]   = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editEmp, setEditEmp]       = useState<any>(null);
  const [form, setForm]             = useState<any>(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [filterRole, setFilterRole] = useState("ALL");
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shifts, setShifts]         = useState<any[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [activeTab, setActiveTab]   = useState<"list"|"detail">("list");

  async function fetchEmployees() {
    try {
      // Importante: El interceptor de API ya envía x-restaurant-id y x-location-id
      const { data } = await api.get("/api/employees");
      setEmployees(data);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => {
    fetchEmployees();
    // Escuchar cambios de sucursal
    const handleRefresh = () => fetchEmployees();
    window.addEventListener('locationChanged', handleRefresh);
    return () => window.removeEventListener('locationChanged', handleRefresh);
  }, []);

  function openForm(emp?: any) {
    setEditEmp(emp || null);
    if (emp) {
      setForm({
        name: emp.name, phone: emp.phone||"", pin: emp.pin, role: emp.role,
        photo: emp.photo||null, tables: emp.tables||[],
        scheduleStart: emp.scheduleStart||"", scheduleEnd: emp.scheduleEnd||"",
        scheduleDays: emp.scheduleDays||[], isActive: emp.isActive,
        canCharge: emp.canCharge, canDiscount: emp.canDiscount,
        canModifyTickets: emp.canModifyTickets, canDeleteTickets: emp.canDeleteTickets,
        canConfigSystem: emp.canConfigSystem, canTakeDelivery: emp.canTakeDelivery,
        canTakeTakeout: emp.canTakeTakeout,
      });
    } else {
      setForm({ ...emptyForm, ...ROLE_DEFAULTS.WAITER });
    }
    setShowForm(true);
  }

  async function saveEmployee(e: React.FormEvent) {
    e.preventDefault();

    // Verificamos si hay sucursal seleccionada
    if (!localStorage.getItem("locationId")) {
      alert("⚠️ Error: No hay una sucursal seleccionada en la barra lateral.");
      return;
    }

    setSaving(true);
    try {
      if (editEmp) await api.put(`/api/employees/${editEmp.id}`, form);
      else await api.post("/api/employees", form);
      setShowForm(false);
      fetchEmployees();
    } catch (err: any) { alert(err.response?.data?.error || "Error al guardar empleado"); }
    finally { setSaving(false); }
  }

  // ... (Resto del componente igual) ...

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map((e: any) => e.id)));
  }
  async function bulkToggleActive(isActive: boolean) {
    await Promise.all([...selectedIds].map(id => api.put(`/api/employees/${id}`, { isActive }).catch(() => {})));
    setSelectedIds(new Set()); fetchEmployees();
  }
  async function bulkDelete() {
    if (!confirm(`¿Eliminar ${selectedIds.size} empleado(s)? Esta acción no se puede deshacer.`)) return;
    let hasError = false;
    await Promise.all([...selectedIds].map(id => api.delete(`/api/employees/${id}`).catch((err) => {
      hasError = true;
      console.error(err);
    })));
    if (hasError) {
      alert("Error al eliminar uno o más empleados. Verifique si tienen registros asociados o intente de nuevo.");
    }
    setSelectedIds(new Set()); fetchEmployees();
  }

  function closeForm() {
    setShowForm(false);
    setForm({ ...emptyForm });
    setEditEmp(null);
  }

  async function deleteEmployee(id: string, role: string) {
    if (!confirm("¿Eliminar empleado?")) return;
    try {
      await api.delete(`/api/employees/${id}`);
      fetchEmployees();
    } catch (err: any) {
      alert(err?.response?.data?.error || "Error al eliminar empleado");
    }
  }

  async function viewDetail(emp: any) {
    setSelectedEmp(emp);
    setActiveTab("detail");
    setLoadingShifts(true);
    try {
      const { data } = await api.get(`/api/employees/${emp.id}/shifts`);
      setShifts(data);
    } catch {} finally { setLoadingShifts(false); }
  }

  function exportCSV() {
    window.open("/api/employees/report/attendance", "_blank");
  }

  function toggleDay(day: string) {
    setForm((p: any) => ({
      ...p,
      scheduleDays: p.scheduleDays.includes(day)
        ? p.scheduleDays.filter((d: string) => d !== day)
        : [...p.scheduleDays, day]
    }));
  }

  const filtered = filterRole === "ALL" ? employees : employees.filter(e => e.role === filterRole);
  const onShift   = employees.filter(e => e.shifts?.length > 0);

  function formatDur(start: string, end: string|null) {
    if (!end) return "En turno";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne text-3xl font-black">Empleados</h1>
          <p className="text-sm mt-1" style={{color:"var(--muted)"}}>
            {employees.length} empleados · <span style={{color:"#22c55e"}}>{onShift.length} en turno ahora</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV}
            className="px-4 py-2 rounded-xl text-sm font-bold border"
            style={{borderColor:"var(--border)",color:"var(--muted)"}}>
            📊 Exportar asistencia
          </button>
          <button onClick={() => openForm()}
            className="px-4 py-2 rounded-xl text-sm font-syne font-black"
            style={{background:"var(--gold)",color:"#000"}}>
            + Nuevo empleado
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setActiveTab("list")}
          className="px-4 py-2 rounded-xl text-sm font-bold"
          style={{background: activeTab==="list" ? "var(--gold)" : "var(--surf)", color: activeTab==="list" ? "#000" : "var(--muted)"}}>
          Lista
        </button>
        {selectedEmp && (
          <button onClick={() => setActiveTab("detail")}
            className="px-4 py-2 rounded-xl text-sm font-bold"
            style={{background: activeTab==="detail" ? "var(--gold)" : "var(--surf)", color: activeTab==="detail" ? "#000" : "var(--muted)"}}>
            {selectedEmp.name}
          </button>
        )}
      </div>

      {activeTab === "list" && (
        <>
          {/* Filtro por rol */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 items-center">
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 cursor-pointer"
              style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--muted)"}}>
              <input type="checkbox" className="rounded cursor-pointer accent-[var(--gold)]"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onChange={toggleSelectAll} />
              Seleccionar todo
            </label>
            <button onClick={() => setFilterRole("ALL")}
              className="px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
              style={{background: filterRole==="ALL" ? "var(--gold)" : "var(--surf)", color: filterRole==="ALL" ? "#000" : "var(--muted)", border:"1px solid var(--border)"}}>
              Todos ({employees.length})
            </button>
            {ROLES.map(r => {
              const count = employees.filter(e => e.role === r.value).length;
              return (
                <button key={r.value} onClick={() => setFilterRole(r.value)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
                  style={{background: filterRole===r.value ? r.color : "var(--surf)", color: filterRole===r.value ? "#000" : "var(--muted)", border:"1px solid var(--border)"}}>
                  {r.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Grid empleados */}
          {loading ? (
            <div className="text-center py-12" style={{color:"var(--muted)"}}>Cargando...</div>
          ) : (
            <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))"}}>
              {filtered.map((emp: any) => {
                const role = ROLES.find(r => r.value === emp.role);
                const isOnShift = emp.shifts?.length > 0;
                const sel = selectedIds.has(emp.id);
                return (
                  <div key={emp.id} className="rounded-2xl border overflow-hidden relative"
                    style={{background:"var(--surf)", borderColor: sel ? "var(--gold)" : isOnShift ? "#22c55e" : "var(--border)",
                      opacity: emp.isActive ? 1 : 0.5}}>
                    <input type="checkbox" checked={sel} onChange={() => toggleSelect(emp.id)}
                      className="absolute top-3 right-3 rounded cursor-pointer z-10 accent-[var(--gold)] w-4 h-4" />
                    <div className="p-4 flex items-center gap-3">
                      {emp.photo ? (
                        <img src={emp.photo} alt="" className="w-14 h-14 rounded-full object-cover border-2" style={{borderColor: role?.color || "var(--border)"}} />
                      ) : (
                        <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl border-2" style={{background:"var(--surf2)",borderColor: role?.color || "var(--border)"}}>
                          {role?.label.split(" ")[0]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-syne font-black truncate">{emp.name}</div>
                        <div className="text-xs mt-0.5" style={{color: role?.color}}>{role?.label}</div>
                        {emp.phone && <div className="text-xs" style={{color:"var(--muted)"}}>{emp.phone}</div>}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {isOnShift && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{background:"rgba(34,197,94,0.15)",color:"#22c55e"}}>En turno</span>
                        )}
                        {!emp.isActive && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>Inactivo</span>
                        )}
                      </div>
                    </div>

                    <div className="px-4 pb-3 flex flex-wrap gap-1">
                      {PERMS.filter(p => emp[p.key]).map(p => (
                        <span key={p.key} className="text-xs px-2 py-0.5 rounded-full"
                          style={{background:"rgba(245,166,35,0.1)",color:"var(--gold)"}}>
                          {p.label}
                        </span>
                      ))}
                    </div>

                    {(emp.scheduleStart || emp.scheduleDays?.length > 0) && (
                      <div className="px-4 pb-3 text-xs" style={{color:"var(--muted)"}}>
                        🕐 {emp.scheduleStart || "?"} - {emp.scheduleEnd || "?"}
                        {emp.scheduleDays?.length > 0 && ` · ${emp.scheduleDays.join(", ")}`}
                      </div>
                    )}

                    <div className="flex gap-2 px-4 pb-4">
                      <button onClick={() => viewDetail(emp)}
                        className="flex-1 py-2 rounded-xl text-xs font-bold border"
                        style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                        📋 Historial
                      </button>
                      <button onClick={() => openForm(emp)}
                        className="flex-1 py-2 rounded-xl text-xs font-bold border"
                        style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                        Editar
                      </button>
                      <button onClick={() => deleteEmployee(emp.id, emp.role)}
                        className="px-3 py-2 rounded-xl text-xs"
                        style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === "detail" && selectedEmp && (
        <div className="max-w-2xl">
          <div className="rounded-2xl border p-6 mb-4" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <div className="flex items-center gap-4 mb-4">
              {selectedEmp.photo ? (
                <img src={selectedEmp.photo} alt="" className="w-20 h-20 rounded-full object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl" style={{background:"var(--surf2)"}}>
                  {ROLES.find(r => r.value === selectedEmp.role)?.label.split(" ")[0]}
                </div>
              )}
              <div>
                <h2 className="font-syne font-black text-2xl">{selectedEmp.name}</h2>
                <p style={{color: ROLES.find(r => r.value === selectedEmp.role)?.color}}>
                  {ROLES.find(r => r.value === selectedEmp.role)?.label}
                </p>
                {selectedEmp.phone && <p className="text-sm" style={{color:"var(--muted)"}}>{selectedEmp.phone}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="rounded-xl p-3" style={{background:"var(--surf2)"}}>
                <div className="text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Turnos este mes</div>
                <div className="text-2xl font-black" style={{color:"var(--gold)"}}>{shifts.filter(s => new Date(s.startAt) > new Date(Date.now() - 30*24*60*60*1000)).length}</div>
              </div>
              <div className="rounded-xl p-3" style={{background:"var(--surf2)"}}>
                <div className="text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Horas este mes</div>
                <div className="text-2xl font-black" style={{color:"var(--gold)"}}>
                  {shifts.filter(s => s.endAt && new Date(s.startAt) > new Date(Date.now() - 30*24*60*60*1000))
                    .reduce((acc, s) => acc + (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 3600000, 0).toFixed(1)}h
                </div>
              </div>
            </div>

            <div className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>Permisos</div>
            <div className="flex flex-wrap gap-2">
              {PERMS.map(p => (
                <span key={p.key} className="text-xs px-3 py-1.5 rounded-full font-bold"
                  style={{
                    background: selectedEmp[p.key] ? "rgba(34,197,94,0.1)" : "var(--surf2)",
                    color: selectedEmp[p.key] ? "#22c55e" : "var(--muted)",
                    border: `1px solid ${selectedEmp[p.key] ? "rgba(34,197,94,0.2)" : "var(--border)"}`
                  }}>
                  {selectedEmp[p.key] ? "✓" : "✗"} {p.label}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{borderColor:"var(--border)"}}>
            <div className="px-5 py-3 border-b font-syne font-bold" style={{borderColor:"var(--border)",background:"var(--surf2)"}}>
              Historial de turnos
            </div>
            {loadingShifts ? (
              <div className="text-center py-8" style={{color:"var(--muted)"}}>Cargando...</div>
            ) : shifts.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{color:"var(--muted)"}}>Sin turnos registrados</div>
            ) : shifts.map((shift: any) => (
              <div key={shift.id} className="flex items-center justify-between px-5 py-3 border-b" style={{borderColor:"var(--border)"}}>
                <div>
                  <div className="text-sm font-medium">{new Date(shift.startAt).toLocaleDateString('es-MX',{weekday:'short',day:'numeric',month:'short'})}</div>
                  <div className="text-xs" style={{color:"var(--muted)"}}>
                    {new Date(shift.startAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}
                    {shift.endAt && ` → ${new Date(shift.endAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}`}
                  </div>
                </div>
                <span className="text-sm font-bold px-3 py-1 rounded-full"
                  style={{background: shift.endAt ? "var(--surf2)" : "rgba(34,197,94,0.1)", color: shift.endAt ? "var(--muted)" : "#22c55e"}}>
                  {formatDur(shift.startAt, shift.endAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border"
          style={{background:"var(--surf)",borderColor:"var(--gold)",boxShadow:"0 8px 32px rgba(0,0,0,0.4)"}}>
          <span className="text-xs font-black uppercase tracking-widest px-2 py-1 rounded-lg" style={{background:"rgba(245,166,35,0.15)",color:"var(--gold)"}}>
            {selectedIds.size} seleccionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <button onClick={() => bulkToggleActive(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-black text-green-400 border border-green-500/30 bg-green-500/10 hover:bg-green-500/20 transition-all">
            Activar
          </button>
          <button onClick={() => bulkToggleActive(false)}
            className="px-3 py-1.5 rounded-xl text-xs font-black text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20 transition-all">
            Desactivar
          </button>
          <button onClick={bulkDelete}
            className="px-3 py-1.5 rounded-xl text-xs font-black text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-all">
            🗑️ Eliminar
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="w-7 h-7 rounded-xl flex items-center justify-center text-sm transition-all"
            style={{background:"var(--surf2)",color:"var(--muted)"}}>✕</button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{background:"rgba(0,0,0,0.85)"}}>
          <div className="w-full max-w-2xl rounded-2xl border my-4" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0" style={{borderColor:"var(--border)"}}>
              <h2 className="font-syne font-black text-xl">{editEmp ? "Editar" : "Nuevo"} empleado</h2>
              <button onClick={closeForm} className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{background:"var(--surf2)",color:"var(--muted)"}}>✕</button>
            </div>
            <form onSubmit={saveEmployee} className="p-6 overflow-y-auto" style={{maxHeight:"80vh"}}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>Nombre completo</label>
                  <input value={form.name} onChange={e => setForm((p:any)=>({...p,name:e.target.value}))} required
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>Teléfono</label>
                  <input value={form.phone} onChange={e => setForm((p:any)=>({...p,phone:e.target.value}))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>PIN (4-6 dígitos)</label>
                  <input value={form.pin} onChange={e => setForm((p:any)=>({...p,pin:e.target.value}))} required maxLength={6}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none font-mono tracking-widest"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{color:"var(--muted)"}}>Rol</label>
                <div className="grid grid-cols-5 gap-2">
                  {ROLES.map(r => (
                    <button key={r.value} type="button" onClick={() => { const defs = ROLE_DEFAULTS[r.value] || ROLE_DEFAULTS.WAITER; setForm((p:any)=>({...p,role:r.value,...defs})) }}
                      className="py-2 rounded-xl text-xs font-bold text-center"
                      style={{background: form.role===r.value ? r.color : "var(--surf2)", color: form.role===r.value ? "#000" : "var(--muted)", border:`1px solid ${form.role===r.value ? r.color : "var(--border)"}`}}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{color:"var(--muted)"}}>Horario</label>
                <div className="flex gap-3 mb-2">
                  <div className="flex-1">
                    <label className="text-xs mb-1 block" style={{color:"var(--muted)"}}>Entrada</label>
                    <input type="time" value={form.scheduleStart} onChange={e => setForm((p:any)=>({...p,scheduleStart:e.target.value}))}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs mb-1 block" style={{color:"var(--muted)"}}>Salida</label>
                    <input type="time" value={form.scheduleEnd} onChange={e => setForm((p:any)=>({...p,scheduleEnd:e.target.value}))}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                  </div>
                </div>
                <div className="flex gap-2">
                  {DAYS.map(d => (
                    <button key={d} type="button" onClick={() => toggleDay(d)}
                      className="flex-1 py-1.5 rounded-xl text-xs font-bold"
                      style={{background: form.scheduleDays.includes(d) ? "var(--gold)" : "var(--surf2)", color: form.scheduleDays.includes(d) ? "#000" : "var(--muted)"}}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {form.role === "WAITER" && (
                <div className="mb-4">
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>Mesas asignadas (separadas por coma)</label>
                  <input value={form.tables.join(",")} onChange={e => setForm((p:any)=>({...p,tables:e.target.value.split(",").map((t:string)=>t.trim()).filter(Boolean)}))}
                    placeholder="1,2,3,4"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                </div>
              )}

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider" style={{color:"var(--muted)"}}>Permisos individuales</label>
                  <button type="button" onClick={() => setForm((p:any)=>({...p,...ROLE_DEFAULTS[form.role]}))}
                    className="text-xs px-2 py-1 rounded-lg"
                    style={{background:"var(--surf2)",color:"var(--gold)"}}>
                    Restaurar por rol
                  </button>
                </div>
                <div className="rounded-xl border divide-y" style={{borderColor:"var(--border)"}}>
                  {PERMS.map(p => (
                    <div key={p.key} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm">{p.label}</span>
                      <button type="button" onClick={() => setForm((prev:any)=>({...prev,[p.key]:!prev[p.key]}))}
                        className="w-11 h-6 rounded-full transition-all relative flex-shrink-0"
                        style={{background: form[p.key] ? "var(--gold)" : "var(--surf2)"}}>
                        <div className="w-5 h-5 rounded-full absolute top-0.5 transition-all"
                          style={{background:"white", left: form[p.key] ? "24px" : "2px"}} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between mb-6">
                <span className="text-sm font-medium">Empleado activo</span>
                <button type="button" onClick={() => setForm((p:any)=>({...p,isActive:!p.isActive}))}
                  className="w-11 h-6 rounded-full transition-all relative"
                  style={{background: form.isActive ? "var(--gold)" : "var(--surf2)"}}>
                  <div className="w-5 h-5 rounded-full absolute top-0.5 transition-all"
                    style={{background:"white", left: form.isActive ? "24px" : "2px"}} />
                </button>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={closeForm}
                  className="flex-1 py-3 rounded-xl font-bold border"
                  style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-xl font-syne font-black"
                  style={{background: saving ? "var(--muted)" : "var(--gold)",color:"#000"}}>
                  {saving ? "..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
