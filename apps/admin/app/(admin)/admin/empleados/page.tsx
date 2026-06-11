"use client";
import { useEffect, useState } from "react";
import {
  Crown, Banknote, ChefHat, Bike, Soup, BarChart3, Plus, X, Clock,
  History, Pencil, Trash2, Users, Tag, Ban, Unlock, ListChecks,
  CheckCircle2, RotateCcw, type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, SectionLabel, Pill, Chips,
  PrimaryBtn, Toggle, Avatar, EmptyState, money, type Tone,
} from "@/components/warmtech";

// Fecha de hoy en hora de México (YYYY-MM-DD), no en la zona del navegador.
function mxToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}
const PAY_LABELS: Record<string, string> = {
  CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia",
  CASH_ON_DELIVERY: "Efectivo", MP: "Mercado Pago", OTHER: "Otro",
};

const ROLES: { value: string; label: string; short: string; icon: LucideIcon; tone: Tone }[] = [
  { value: "ADMIN",    label: "Administrador", short: "Admin",       icon: Crown,   tone: "warn" },
  { value: "CASHIER",  label: "Cajero",        short: "Cajero",      icon: Banknote, tone: "ok"  },
  { value: "WAITER",   label: "Mesero",        short: "Mesero",      icon: Soup,    tone: "info" },
  { value: "DELIVERY", label: "Repartidor",    short: "Repartidor",  icon: Bike,    tone: "ac"   },
  { value: "COOK",     label: "Cocinero",      short: "Cocinero",    icon: ChefHat, tone: "err"  },
];

// Set canónico de permisos operativos (RBAC real · Fase 10). Alineado con
// ROLE_DEFAULTS del backend (employees.routes.js). Solo incluye permisos con
// enforcement real; las columnas legacy sin operación quedan deprecadas.
const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  ADMIN:    { canCharge: true,  canApplyDiscounts: true,  canCancelItems: true,  canReopenTables: true,  canManageUsers: true  },
  CASHIER:  { canCharge: true,  canApplyDiscounts: true,  canCancelItems: false, canReopenTables: false, canManageUsers: false },
  WAITER:   { canCharge: false, canApplyDiscounts: false, canCancelItems: false, canReopenTables: false, canManageUsers: false },
  DELIVERY: { canCharge: true,  canApplyDiscounts: false, canCancelItems: false, canReopenTables: false, canManageUsers: false },
  COOK:     { canCharge: false, canApplyDiscounts: false, canCancelItems: false, canReopenTables: false, canManageUsers: false },
};

const DAYS = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];
const PERMS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "canCharge",         label: "Cobrar / abrir cajón",            icon: Banknote   },
  { key: "canApplyDiscounts", label: "Aplicar descuentos / cortesías",  icon: Tag        },
  { key: "canCancelItems",    label: "Anular productos enviados",        icon: Trash2     },
  { key: "canReopenTables",   label: "Reabrir cuentas cerradas",         icon: Unlock     },
  { key: "canManageUsers",    label: "Gestionar empleados",              icon: Users      },
];

const emptyForm = {
  name: "", phone: "", pin: "", role: "WAITER", photo: null as string | null,
  tables: [] as string[], scheduleStart: "", scheduleEnd: "", scheduleDays: [] as string[],
  isActive: true,
  canCharge: false, canApplyDiscounts: false, canCancelItems: false,
  canReopenTables: false, canManageUsers: false,
};

function roleMeta(value: string) {
  return ROLES.find((r) => r.value === value);
}
function initials(name: string) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

const inputCls = "w-full rounded-xl px-3.5 py-2.5 text-sm outline-none";
const inputStyle = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;

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
  const [activeTab, setActiveTab]   = useState<"list" | "detail">("list");
  const [activity, setActivity]     = useState<any>(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityDate, setActivityDate] = useState<string>(mxToday());

  async function fetchEmployees() {
    try {
      // Importante: El interceptor de API ya envía x-restaurant-id y x-location-id
      const { data } = await api.get("/api/employees");
      setEmployees(data);
    } catch (err: any) {
      console.error("Error cargando empleados:", err?.response?.data || err);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    // Esperamos a que locationId esté disponible en localStorage.
    // El Sidebar lo escribe de forma asíncrona: si ya está listo lo usamos
    // de inmediato; si no, esperamos el evento 'locationChanged'.
    const locationId = localStorage.getItem("locationId");
    if (locationId) {
      fetchEmployees();
    } else {
      const handleReady = () => {
        fetchEmployees();
        window.removeEventListener("locationChanged", handleReady);
      };
      window.addEventListener("locationChanged", handleReady);
      return () => window.removeEventListener("locationChanged", handleReady);
    }

    // Escuchar cambios de sucursal
    const handleRefresh = () => fetchEmployees();
    window.addEventListener("locationChanged", handleRefresh);
    return () => window.removeEventListener("locationChanged", handleRefresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openForm(emp?: any) {
    setEditEmp(emp || null);
    if (emp) {
      setForm({
        // PIN intencionalmente vacío en edit. emp.pin del backend es el hash
        // bcrypt — pre-llenarlo provocaba que al "Guardar" sin tocar el campo
        // se mandara el hash como nuevo PIN, el regex /\d{4,6}/ del backend
        // lo rechazaba, y el cambio no surtía efecto. Vacío = no cambia.
        name: emp.name, phone: emp.phone || "", pin: "", role: emp.role,
        photo: emp.photo || null, tables: emp.tables || [],
        scheduleStart: emp.scheduleStart || "", scheduleEnd: emp.scheduleEnd || "",
        scheduleDays: emp.scheduleDays || [], isActive: emp.isActive,
        canCharge: emp.canCharge,
        // Descuento unificado: prioriza el flag Fase 10, cae al legacy.
        canApplyDiscounts: emp.canApplyDiscounts ?? emp.canDiscount,
        canCancelItems: emp.canCancelItems,
        canReopenTables: emp.canReopenTables,
        canManageUsers: emp.canManageUsers,
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
      alert("Error: No hay una sucursal seleccionada en la barra lateral.");
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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map((e: any) => e.id)));
  }
  async function bulkToggleActive(isActive: boolean) {
    await Promise.all([...selectedIds].map((id) => api.put(`/api/employees/${id}`, { isActive }).catch(() => {})));
    setSelectedIds(new Set()); fetchEmployees();
  }
  async function bulkDelete() {
    if (!confirm(`¿Eliminar ${selectedIds.size} empleado(s)? Esta acción no se puede deshacer.`)) return;
    let hasError = false;
    await Promise.all([...selectedIds].map((id) => api.delete(`/api/employees/${id}`).catch((err) => {
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

  async function deleteEmployee(id: string, _role: string) {
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
    const date = mxToday();
    setActivityDate(date);
    fetchActivity(emp.id, date);
  }

  async function fetchActivity(empId: string, date: string) {
    setLoadingActivity(true);
    setLoadingShifts(true);
    try {
      const { data } = await api.get(`/api/employees/${empId}/activity`, { params: { date } });
      setActivity(data);
      setShifts(data.shifts || []);
    } catch {
      setActivity(null);
      setShifts([]);
    } finally {
      setLoadingActivity(false);
      setLoadingShifts(false);
    }
  }

  function exportCSV() {
    window.open("/api/employees/report/attendance", "_blank");
  }

  function toggleDay(day: string) {
    setForm((p: any) => ({
      ...p,
      scheduleDays: p.scheduleDays.includes(day)
        ? p.scheduleDays.filter((d: string) => d !== day)
        : [...p.scheduleDays, day],
    }));
  }

  const filtered = filterRole === "ALL" ? employees : employees.filter((e) => e.role === filterRole);
  const onShift  = employees.filter((e) => e.shifts?.length > 0);

  function formatDur(start: string, end: string | null) {
    if (!end) return "En turno";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  const roleChips = [
    { value: "ALL", label: `Todos (${employees.length})` },
    ...ROLES.map((r) => ({ value: r.value, label: `${r.short} (${employees.filter((e) => e.role === r.value).length})` })),
  ];

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Personal"
        title="Empleados"
        subtitle={`${employees.length} empleados · ${onShift.length} en turno ahora`}
        actions={
          <>
            <PrimaryBtn ghost full={false} icon={BarChart3} onClick={exportCSV}>
              Exportar asistencia
            </PrimaryBtn>
            <PrimaryBtn full={false} icon={Plus} onClick={() => openForm()}>
              Nuevo empleado
            </PrimaryBtn>
          </>
        }
      />

      {/* mobile summary */}
      <div className="mb-3 flex items-center gap-2 md:hidden">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--ok)" }} />
        <span className="text-[11px] text-tx-mut">
          {employees.length} empleados · {onShift.length} en turno
        </span>
      </div>

      {/* mobile actions */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:hidden">
        <PrimaryBtn ghost icon={BarChart3} onClick={exportCSV}>Asistencia</PrimaryBtn>
        <PrimaryBtn icon={Plus} onClick={() => openForm()}>Nuevo</PrimaryBtn>
      </div>

      {/* tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto warmtech-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab("list")}
          className="min-h-10 shrink-0 rounded-full px-4 text-xs font-bold transition-colors"
          style={{
            border: `1px solid ${activeTab === "list" ? "transparent" : "var(--bd-1)"}`,
            color: activeTab === "list" ? "#fffaf4" : "var(--tx-mut)",
            background: activeTab === "list" ? "var(--brand-primary)" : "var(--surf-1)",
          }}
        >
          Lista
        </button>
        {selectedEmp && (
          <button
            type="button"
            onClick={() => setActiveTab("detail")}
            className="min-h-10 shrink-0 rounded-full px-4 text-xs font-bold transition-colors"
            style={{
              border: `1px solid ${activeTab === "detail" ? "transparent" : "var(--bd-1)"}`,
              color: activeTab === "detail" ? "#fffaf4" : "var(--tx-mut)",
              background: activeTab === "detail" ? "var(--brand-primary)" : "var(--surf-1)",
            }}
          >
            {selectedEmp.name}
          </button>
        )}
      </div>

      {activeTab === "list" && (
        <>
          {/* filtro por rol + seleccionar todo */}
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              aria-label="Seleccionar todo"
              className="grid min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold"
              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx-mut)", display: "flex" }}
            >
              <ListChecks size={15} />
              <span className="hidden sm:inline">
                {filtered.length > 0 && selectedIds.size === filtered.length ? "Quitar" : "Todo"}
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <Chips options={roleChips} value={filterRole} onChange={setFilterRole} />
            </div>
          </div>

          {/* grid empleados */}
          {loading ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-[18px] bg-surf-2" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Sin empleados"
              hint="Agrega tu primer empleado para empezar a gestionar tu equipo."
              action={<PrimaryBtn full={false} icon={Plus} onClick={() => openForm()}>Nuevo empleado</PrimaryBtn>}
            />
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
              {filtered.map((emp: any) => {
                const role = roleMeta(emp.role);
                const RoleIcon = role?.icon ?? Users;
                const isOnShift = emp.shifts?.length > 0;
                const sel = selectedIds.has(emp.id);
                return (
                  <WtCard
                    key={emp.id}
                    className="relative overflow-hidden"
                    style={{
                      borderColor: sel ? "var(--brand-primary)" : isOnShift ? "var(--ok)" : undefined,
                      opacity: emp.isActive ? 1 : 0.55,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelect(emp.id)}
                      aria-label={sel ? "Deseleccionar" : "Seleccionar"}
                      className="absolute right-3 top-3 z-10 grid h-6 w-6 place-items-center rounded-md"
                      style={{
                        background: sel ? "var(--brand-primary)" : "var(--surf-2)",
                        border: `1px solid ${sel ? "transparent" : "var(--bd-1)"}`,
                        color: "#fffaf4",
                      }}
                    >
                      {sel && <CheckCircle2 size={14} />}
                    </button>

                    <div className="flex items-center gap-3 p-4">
                      {emp.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={emp.photo} alt="" className="h-12 w-12 rounded-xl object-cover" />
                      ) : (
                        <Avatar initials={initials(emp.name)} size={48} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display font-extrabold text-tx-hi">{emp.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--tx-mut)" }}>
                          <RoleIcon size={12} style={{ color: `var(--${role?.tone === "ac" ? "brand-primary" : role?.tone})` }} />
                          {role?.label}
                        </div>
                        {emp.phone && <div className="truncate text-[11px] text-tx-dim">{emp.phone}</div>}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 px-4">
                      {isOnShift && <Pill tone="ok" live>En turno</Pill>}
                      {!emp.isActive && <Pill tone="err">Inactivo</Pill>}
                    </div>

                    {PERMS.some((p) => emp[p.key]) && (
                      <div className="flex flex-wrap gap-1 px-4 pt-2">
                        {PERMS.filter((p) => emp[p.key]).map((p) => (
                          <span
                            key={p.key}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10px] font-semibold"
                            style={{ background: "var(--iris-soft)", color: "var(--brand-primary)" }}
                          >
                            <p.icon size={10} /> {p.label}
                          </span>
                        ))}
                      </div>
                    )}

                    {(emp.scheduleStart || emp.scheduleDays?.length > 0) && (
                      <div className="flex items-center gap-1.5 px-4 pt-2 text-[11px] text-tx-mut">
                        <Clock size={12} /> {emp.scheduleStart || "?"} - {emp.scheduleEnd || "?"}
                        {emp.scheduleDays?.length > 0 && ` · ${emp.scheduleDays.join(", ")}`}
                      </div>
                    )}

                    <div className="flex gap-2 p-4 pt-3">
                      <button
                        type="button"
                        onClick={() => viewDetail(emp)}
                        className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-tx-mut"
                        style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                      >
                        <History size={14} /> Historial
                      </button>
                      <button
                        type="button"
                        onClick={() => openForm(emp)}
                        aria-label="Editar"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-tx-mut"
                        style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEmployee(emp.id, emp.role)}
                        aria-label="Eliminar"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                        style={{ background: "var(--err-soft)", color: "var(--err)" }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </WtCard>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === "detail" && selectedEmp && (
        <div className="max-w-2xl">
          <WtCard className="mb-4 p-6">
            <div className="mb-4 flex items-center gap-4">
              {selectedEmp.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedEmp.photo} alt="" className="h-20 w-20 rounded-2xl object-cover" />
              ) : (
                <Avatar initials={initials(selectedEmp.name)} size={80} />
              )}
              <div className="min-w-0">
                <h2 className="font-display text-2xl font-extrabold text-tx-hi">{selectedEmp.name}</h2>
                <div className="mt-1 flex items-center gap-1.5 text-sm" style={{ color: "var(--tx-mid)" }}>
                  {(() => {
                    const role = roleMeta(selectedEmp.role);
                    const RoleIcon = role?.icon ?? Users;
                    return <><RoleIcon size={14} /> {role?.label}</>;
                  })()}
                </div>
                {selectedEmp.phone && <p className="text-sm text-tx-mut">{selectedEmp.phone}</p>}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <WtCard className="p-3" style={{ background: "var(--surf-2)" }}>
                <div className="text-[11px] text-tx-mut">Turnos este mes</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-primary">
                  {shifts.filter((s) => new Date(s.startAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length}
                </div>
              </WtCard>
              <WtCard className="p-3" style={{ background: "var(--surf-2)" }}>
                <div className="text-[11px] text-tx-mut">Horas este mes</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-primary">
                  {shifts.filter((s) => s.endAt && new Date(s.startAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
                    .reduce((acc, s) => acc + (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 3600000, 0).toFixed(1)}h
                </div>
              </WtCard>
            </div>

            <SectionLabel>Permisos</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {PERMS.map((p) => {
                const on = selectedEmp[p.key];
                return (
                  <span
                    key={p.key}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                    style={{
                      background: on ? "var(--ok-soft)" : "var(--surf-2)",
                      color: on ? "var(--ok)" : "var(--tx-mut)",
                      border: `1px solid ${on ? "transparent" : "var(--bd-1)"}`,
                    }}
                  >
                    <p.icon size={12} /> {p.label}
                  </span>
                );
              })}
            </div>
          </WtCard>

          {/* ── Actividad del día (según rol) ─────────────────────────── */}
          {(() => {
            const isDelivery = selectedEmp.role === "DELIVERY";
            const sum = activity?.orderSummary;
            const orders: any[] = activity?.orders ?? [];
            const cashShifts: any[] = activity?.cashShifts ?? [];
            const fmtTime = (d: string) =>
              new Date(d).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });
            return (
              <WtCard className="mb-4 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                  style={{ background: "var(--surf-2)", borderBottom: "1px solid var(--bd-1)" }}>
                  <span className="font-display font-bold text-tx-hi">
                    {isDelivery ? "Entregas del día" : "Pedidos tomados"}
                  </span>
                  <input
                    type="date" value={activityDate} max={mxToday()}
                    onChange={(e) => { setActivityDate(e.target.value); fetchActivity(selectedEmp.id, e.target.value); }}
                    className="rounded-xl px-3 py-1.5 text-xs outline-none"
                    style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                  />
                </div>

                {loadingActivity ? (
                  <div className="py-8 text-center text-sm text-tx-mut">Cargando actividad…</div>
                ) : (
                  <div className="p-4">
                    {/* tiles resumen */}
                    <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <WtCard className="p-3" style={{ background: "var(--surf-2)" }}>
                        <div className="text-[11px] text-tx-mut">{isDelivery ? "Entregas" : "Pedidos"}</div>
                        <div className="mt-1 font-display text-2xl font-extrabold text-primary">{sum?.count ?? 0}</div>
                      </WtCard>
                      <WtCard className="p-3" style={{ background: "var(--surf-2)" }}>
                        <div className="text-[11px] text-tx-mut">Total vendido</div>
                        <div className="mt-1 font-display text-2xl font-extrabold text-primary">{money(sum?.total ?? 0)}</div>
                      </WtCard>
                      {Boolean(sum?.cancelled) && (
                        <WtCard className="p-3" style={{ background: "var(--surf-2)" }}>
                          <div className="text-[11px] text-tx-mut">Anulados</div>
                          <div className="mt-1 font-display text-2xl font-extrabold" style={{ color: "var(--err)" }}>{sum.cancelled}</div>
                        </WtCard>
                      )}
                    </div>

                    {/* desglose por método */}
                    {sum && Object.keys(sum.byMethod || {}).length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {Object.entries(sum.byMethod as Record<string, number>).map(([k, v]) => (
                          <span key={k} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                            style={{ background: "var(--surf-2)", color: "var(--tx-mid)", border: "1px solid var(--bd-1)" }}>
                            {PAY_LABELS[k] || k}: <b className="text-tx-hi">{money(v)}</b>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* lista de pedidos */}
                    {orders.length === 0 ? (
                      <div className="rounded-2xl py-8 text-center text-xs text-tx-mut" style={{ border: "1px dashed var(--bd-1)" }}>
                        {!isDelivery && (selectedEmp.role === "WAITER" || selectedEmp.role === "CASHIER")
                          ? "Sin pedidos atribuidos este día. La atribución por empleado empezó a registrarse en esta versión: los pedidos anteriores no la tienen."
                          : isDelivery
                            ? "Sin entregas asignadas este día."
                            : "Sin pedidos tomados este día."}
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--bd-1)" }}>
                        {orders.map((o, i) => {
                          const cancelled = o.status === "CANCELLED";
                          const cashDue = (o.paymentMethod === "CASH" || o.paymentMethod === "CASH_ON_DELIVERY") && !o.cashCollected && !cancelled;
                          return (
                            <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5"
                              style={{ borderTop: i ? "1px solid var(--bd-1)" : undefined, opacity: cancelled ? 0.5 : 1 }}>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-sm font-medium text-tx">
                                  <span className="font-mono text-[11px] text-tx-mut">{fmtTime(o.createdAt)}</span>
                                  <span className="truncate">{o.customer || "Público general"}</span>
                                  {cancelled && <Pill tone="err">Anulado</Pill>}
                                  {cashDue && <Pill tone="warn">Efectivo pend.</Pill>}
                                </div>
                                <div className="text-[11px] text-tx-mut">
                                  {o.orderNumber} · {PAY_LABELS[o.paymentMethod] || o.paymentMethod}
                                </div>
                              </div>
                              <div className="shrink-0 font-display text-sm font-extrabold text-primary"
                                style={cancelled ? { textDecoration: "line-through" } : undefined}>
                                {money(o.total || 0)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* turnos de caja (cajero/admin) */}
                    {cashShifts.length > 0 && (
                      <div className="mt-4">
                        <SectionLabel>Turnos de caja</SectionLabel>
                        <div className="flex flex-col gap-2">
                          {cashShifts.map((cs) => (
                            <WtCard key={cs.id} className="p-3" style={{ background: "var(--surf-2)" }}>
                              <div className="mb-1 flex items-center justify-between">
                                <span className="text-xs font-semibold text-tx">
                                  {fmtTime(cs.openedAt)}{cs.closedAt ? ` → ${fmtTime(cs.closedAt)}` : ""}
                                </span>
                                {cs.isOpen ? <Pill tone="ok" live>Abierto</Pill> : <Pill tone="neutral">Cerrado</Pill>}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-tx-mut">
                                <span>Efectivo <b className="text-tx-hi">{money(cs.totalCash || 0)}</b></span>
                                <span>Tarjeta <b className="text-tx-hi">{money(cs.totalCard || 0)}</b></span>
                                <span>Transfer. <b className="text-tx-hi">{money(cs.totalTransfer || 0)}</b></span>
                                {Boolean(cs.totalExpenses) && <span>Gastos <b style={{ color: "var(--err)" }}>{money(cs.totalExpenses)}</b></span>}
                              </div>
                            </WtCard>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </WtCard>
            );
          })()}

          <WtCard className="overflow-hidden">
            <div className="px-5 py-3 font-display font-bold text-tx-hi" style={{ background: "var(--surf-2)", borderBottom: "1px solid var(--bd-1)" }}>
              Historial de turnos
            </div>
            {loadingShifts ? (
              <div className="py-8 text-center text-sm text-tx-mut">Cargando...</div>
            ) : shifts.length === 0 ? (
              <div className="py-8 text-center text-sm text-tx-mut">Sin turnos registrados</div>
            ) : shifts.map((shift: any) => (
              <div key={shift.id} className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--bd-1)" }}>
                <div>
                  <div className="text-sm font-medium text-tx">{new Date(shift.startAt).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}</div>
                  <div className="text-[11px] text-tx-mut">
                    {new Date(shift.startAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                    {shift.endAt && ` → ${new Date(shift.endAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`}
                  </div>
                </div>
                {shift.endAt ? (
                  <Pill tone="neutral">{formatDur(shift.startAt, shift.endAt)}</Pill>
                ) : (
                  <Pill tone="ok" live>En turno</Pill>
                )}
              </div>
            ))}
          </WtCard>
        </div>
      )}

      {/* floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-3 md:bottom-6"
          style={{ background: "var(--surf-1)", border: "1px solid var(--brand-primary)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
        >
          <span
            className="rounded-lg px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest"
            style={{ background: "var(--iris-soft)", color: "var(--brand-primary)" }}
          >
            {selectedIds.size} sel.
          </span>
          <button
            type="button"
            onClick={() => bulkToggleActive(true)}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-xs font-bold"
            style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
          >
            <CheckCircle2 size={14} /> Activar
          </button>
          <button
            type="button"
            onClick={() => bulkToggleActive(false)}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-xs font-bold"
            style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
          >
            <Ban size={14} /> Desactivar
          </button>
          <button
            type="button"
            onClick={bulkDelete}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-xs font-bold"
            style={{ background: "var(--err-soft)", color: "var(--err)" }}
          >
            <Trash2 size={14} /> Eliminar
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            aria-label="Cerrar selección"
            className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut"
            style={{ background: "var(--surf-2)" }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* modal form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,0.8)" }}>
          <WtCard className="my-4 w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--bd-1)" }}>
              <h2 className="font-display text-xl font-extrabold text-tx-hi">{editEmp ? "Editar" : "Nuevo"} empleado</h2>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Cerrar"
                className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut"
                style={{ background: "var(--surf-2)" }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={saveEmployee} className="overflow-y-auto p-6" style={{ maxHeight: "78vh" }}>
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Nombre completo</label>
                  <input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} required className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Teléfono</label>
                  <input value={form.phone} onChange={(e) => setForm((p: any) => ({ ...p, phone: e.target.value }))} className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
                    {editEmp ? "PIN nuevo (vacío = no cambia)" : "PIN (4-6 dígitos)"}
                  </label>
                  <input
                    value={form.pin}
                    onChange={(e) => setForm((p: any) => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                    inputMode="numeric"
                    pattern="\d*"
                    {...(!editEmp && { required: true })}
                    maxLength={6}
                    placeholder={editEmp ? "Sin cambios" : "1234"}
                    className={`${inputCls} font-mono tracking-widest`}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-2 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Rol</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {ROLES.map((r) => {
                    const RoleIcon = r.icon;
                    const active = form.role === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => { const defs = ROLE_DEFAULTS[r.value] || ROLE_DEFAULTS.WAITER; setForm((p: any) => ({ ...p, role: r.value, ...defs })); }}
                        className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-bold transition-colors"
                        style={{
                          background: active ? "var(--brand-primary)" : "var(--surf-2)",
                          color: active ? "#fffaf4" : "var(--tx-mut)",
                          border: `1px solid ${active ? "transparent" : "var(--bd-1)"}`,
                        }}
                      >
                        <RoleIcon size={16} /> {r.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-2 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Horario</label>
                <div className="mb-2 flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] text-tx-mut">Entrada</label>
                    <input type="time" value={form.scheduleStart} onChange={(e) => setForm((p: any) => ({ ...p, scheduleStart: e.target.value }))} className={inputCls} style={inputStyle} />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] text-tx-mut">Salida</label>
                    <input type="time" value={form.scheduleEnd} onChange={(e) => setForm((p: any) => ({ ...p, scheduleEnd: e.target.value }))} className={inputCls} style={inputStyle} />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {DAYS.map((d) => {
                    const active = form.scheduleDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        className="min-h-10 flex-1 rounded-xl text-[11px] font-bold transition-colors"
                        style={{
                          background: active ? "var(--brand-primary)" : "var(--surf-2)",
                          color: active ? "#fffaf4" : "var(--tx-mut)",
                          border: `1px solid ${active ? "transparent" : "var(--bd-1)"}`,
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              {form.role === "WAITER" && (
                <div className="mb-4">
                  <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Mesas asignadas (separadas por coma)</label>
                  <input
                    value={form.tables.join(",")}
                    onChange={(e) => setForm((p: any) => ({ ...p, tables: e.target.value.split(",").map((t: string) => t.trim()).filter(Boolean) }))}
                    placeholder="1,2,3,4"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
              )}

              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <label className="font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Permisos individuales</label>
                  <button
                    type="button"
                    onClick={() => setForm((p: any) => ({ ...p, ...ROLE_DEFAULTS[form.role] }))}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-primary"
                    style={{ background: "var(--surf-2)" }}
                  >
                    <RotateCcw size={12} /> Restaurar por rol
                  </button>
                </div>
                <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--bd-1)" }}>
                  {PERMS.map((p, i) => (
                    <div
                      key={p.key}
                      className="flex items-center justify-between px-4 py-2.5"
                      style={i < PERMS.length - 1 ? { borderBottom: "1px solid var(--bd-1)" } : undefined}
                    >
                      <span className="flex items-center gap-2 text-[13.5px] text-tx">
                        <p.icon size={15} className="text-tx-mut" /> {p.label}
                      </span>
                      <Toggle checked={!!form[p.key]} onChange={(next) => setForm((prev: any) => ({ ...prev, [p.key]: next }))} label={p.label} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-6 flex items-center justify-between rounded-xl px-4 py-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                <span className="text-sm font-medium text-tx">Empleado activo</span>
                <Toggle checked={!!form.isActive} onChange={(next) => setForm((p: any) => ({ ...p, isActive: next }))} label="Empleado activo" />
              </div>

              <div className="flex gap-3">
                <PrimaryBtn ghost onClick={closeForm}>Cancelar</PrimaryBtn>
                <PrimaryBtn type="submit" disabled={saving}>{saving ? "..." : "Guardar"}</PrimaryBtn>
              </div>
            </form>
          </WtCard>
        </div>
      )}
    </WtScreen>
  );
}
