"use client";
import { useEffect, useState } from "react";
import {
  BarChart3, Plus, X, Users, Ban, ListChecks, CheckCircle2, Trash2, Download,
} from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, Card, Chips, Button, EmptyState, useToast, useConfirm,
} from "@/components/ds";
import { ROLES, emptyForm, ROLE_DEFAULTS, roleMeta, mxToday } from "./_components/shared";
import { EmployeeCard } from "./_components/EmployeeCard";
import { EmployeeFormModal } from "./_components/EmployeeFormModal";
import { EmployeeDetail } from "./_components/EmployeeDetail";

export default function EmpleadosPage() {
  const toast = useToast();
  const confirm = useConfirm();

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
  const [exportFrom, setExportFrom] = useState<string>(mxToday());
  const [exportTo, setExportTo]     = useState<string>(mxToday());
  const [exporting, setExporting]   = useState(false);
  const [listFrom, setListFrom]     = useState<string>(mxToday());
  const [listTo, setListTo]         = useState<string>(mxToday());
  const [exportingRole, setExportingRole] = useState(false);

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
        canManageDriverCash: emp.canManageDriverCash,
        canViewExpectedCash: emp.canViewExpectedCash,
        canManageShifts: emp.canManageShifts,
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
      toast.error("Error: No hay una sucursal seleccionada en la barra lateral.");
      return;
    }

    setSaving(true);
    try {
      if (editEmp) await api.put(`/api/employees/${editEmp.id}`, form);
      else await api.post("/api/employees", form);
      setShowForm(false);
      fetchEmployees();
    } catch (err: any) { toast.error(err.response?.data?.error || "Error al guardar empleado"); }
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
    if (!(await confirm({ title: `¿Eliminar ${selectedIds.size} empleado(s)?`, body: "Esta acción no se puede deshacer.", danger: true, confirmLabel: "Eliminar" }))) return;
    let hasError = false;
    await Promise.all([...selectedIds].map((id) => api.delete(`/api/employees/${id}`).catch((err) => {
      hasError = true;
      console.error(err);
    })));
    if (hasError) {
      toast.error("Error al eliminar uno o más empleados. Verifique si tienen registros asociados o intente de nuevo.");
    }
    setSelectedIds(new Set()); fetchEmployees();
  }

  function closeForm() {
    setShowForm(false);
    setForm({ ...emptyForm });
    setEditEmp(null);
  }

  async function deleteEmployee(id: string) {
    // NOTA e2e: el test 04-empleados usa `page.on('dialog', d => d.accept())`
    // y hace UN solo click en el botón eliminar (último de la tarjeta). Un
    // useConfirm() del ds requeriría un segundo click que el test no ejecuta,
    // por eso el borrado individual conserva el confirm nativo (auto-aceptado
    // por el test). El borrado masivo sí usa useConfirm().
    if (!window.confirm("¿Eliminar empleado?")) return;
    try {
      await api.delete(`/api/employees/${id}`);
      fetchEmployees();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Error al eliminar empleado");
    }
  }

  async function viewDetail(emp: any) {
    setSelectedEmp(emp);
    setActiveTab("detail");
    const date = mxToday();
    setActivityDate(date);
    setExportFrom(date);
    setExportTo(date);
    fetchActivity(emp.id, date);
  }

  async function exportActivityCSV() {
    if (!selectedEmp) return;
    const from = exportFrom, to = exportTo;
    if (to < from) { toast.error("La fecha 'hasta' no puede ser anterior a 'desde'."); return; }
    setExporting(true);
    try {
      const res = await api.get(`/api/employees/${selectedEmp.id}/activity-export`, {
        params: { from, to }, responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `actividad_${(selectedEmp.name || "empleado").trim().replace(/\s+/g, "_")}_${from}_${to}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo exportar la actividad.");
    } finally { setExporting(false); }
  }

  async function exportRoleCSV() {
    if (listTo < listFrom) { toast.error("La fecha 'hasta' no puede ser anterior a 'desde'."); return; }
    setExportingRole(true);
    try {
      const res = await api.get(`/api/employees/export-activity`, {
        params: { from: listFrom, to: listTo, ...(filterRole !== "ALL" ? { role: filterRole } : {}) },
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8" }));
      const scope = filterRole === "ALL" ? "todos" : filterRole.toLowerCase();
      const a = document.createElement("a");
      a.href = url;
      a.download = `actividad_${scope}_${listFrom}_${listTo}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo exportar la actividad del rol.");
    } finally { setExportingRole(false); }
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

  const filtered = filterRole === "ALL" ? employees : employees.filter((e) => e.role === filterRole);
  const onShift  = employees.filter((e) => e.shifts?.length > 0);

  const roleChips = [
    { value: "ALL", label: `Todos (${employees.length})` },
    ...ROLES.map((r) => ({ value: r.value, label: `${r.short} (${employees.filter((e) => e.role === r.value).length})` })),
  ];

  const tabBtn = "min-h-10 shrink-0 rounded-full px-4 text-xs font-bold transition-colors";
  const tabStyle = (active: boolean) => ({
    border: `1px solid ${active ? "transparent" : "var(--bd-1)"}`,
    color: active ? "var(--accent-contrast)" : "var(--tx-mut)",
    background: active ? "var(--brand-primary)" : "var(--surf-1)",
  });

  return (
    <PageShell>
      <PageHeader
        eyebrow="Personal"
        title="Empleados"
        subtitle={`${employees.length} empleados · ${onShift.length} en turno ahora`}
        actions={
          <>
            <Button variant="secondary" icon={BarChart3} onClick={exportCSV}>Exportar asistencia</Button>
            <Button icon={Plus} onClick={() => openForm()}>Nuevo empleado</Button>
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
        <Button variant="secondary" full icon={BarChart3} onClick={exportCSV}>Asistencia</Button>
        <Button full icon={Plus} onClick={() => openForm()}>Nuevo</Button>
      </div>

      {/* tabs */}
      <div className="ds-scrollbar mb-4 flex gap-2 overflow-x-auto">
        <button type="button" onClick={() => setActiveTab("list")} className={tabBtn} style={tabStyle(activeTab === "list")}>
          Lista
        </button>
        {selectedEmp && (
          <button type="button" onClick={() => setActiveTab("detail")} className={tabBtn} style={tabStyle(activeTab === "detail")}>
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
              className="grid min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-tx-mut"
              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", display: "flex" }}
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

          {/* exportar actividad del rol filtrado (CSV) */}
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-ds-lg p-3"
            style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">
                Exportar {filterRole === "ALL" ? "todos" : (roleMeta(filterRole)?.short.toLowerCase() ?? filterRole)} · desde
              </div>
              <input type="date" value={listFrom} max={mxToday()}
                onChange={(e) => setListFrom(e.target.value)}
                className="rounded-ds-md px-3 py-1.5 text-xs outline-none"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
            </div>
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">hasta</div>
              <input type="date" value={listTo} max={mxToday()}
                onChange={(e) => setListTo(e.target.value)}
                className="rounded-ds-md px-3 py-1.5 text-xs outline-none"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
            </div>
            <Button icon={Download} onClick={exportRoleCSV} disabled={exportingRole}>
              {exportingRole ? "Generando…" : "Exportar CSV"}
            </Button>
          </div>

          {/* grid empleados */}
          {loading ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-ds-xl bg-surf-2" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Sin empleados"
              hint="Agrega tu primer empleado para empezar a gestionar tu equipo."
              action={<Button icon={Plus} onClick={() => openForm()}>Nuevo empleado</Button>}
            />
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
              {filtered.map((emp: any) => (
                <EmployeeCard
                  key={emp.id}
                  emp={emp}
                  selected={selectedIds.has(emp.id)}
                  onToggleSelect={() => toggleSelect(emp.id)}
                  onDetail={() => viewDetail(emp)}
                  onEdit={() => openForm(emp)}
                  onDelete={() => deleteEmployee(emp.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "detail" && selectedEmp && (
        <EmployeeDetail
          emp={selectedEmp}
          shifts={shifts}
          loadingShifts={loadingShifts}
          activity={activity}
          loadingActivity={loadingActivity}
          activityDate={activityDate}
          onActivityDate={(date) => { setActivityDate(date); fetchActivity(selectedEmp.id, date); }}
          exportFrom={exportFrom} setExportFrom={setExportFrom}
          exportTo={exportTo} setExportTo={setExportTo}
          exporting={exporting}
          onExportActivity={exportActivityCSV}
        />
      )}

      {/* floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          className="fixed inset-x-3 bottom-24 z-40 flex flex-wrap items-center justify-center gap-2 rounded-ds-lg px-4 py-3 md:inset-x-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:flex-nowrap"
          style={{ background: "var(--surf-1)", border: "1px solid var(--brand-primary)", boxShadow: "var(--shadow-lg)" }}
        >
          <span
            className="rounded-lg px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest"
            style={{ background: "var(--accent-soft)", color: "var(--brand-primary)" }}
          >
            {selectedIds.size} sel.
          </span>
          <button
            type="button"
            onClick={() => bulkToggleActive(true)}
            className="inline-flex min-h-10 items-center gap-1 rounded-ds-md px-3 text-xs font-bold"
            style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
          >
            <CheckCircle2 size={14} /> Activar
          </button>
          <button
            type="button"
            onClick={() => bulkToggleActive(false)}
            className="inline-flex min-h-10 items-center gap-1 rounded-ds-md px-3 text-xs font-bold"
            style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
          >
            <Ban size={14} /> Desactivar
          </button>
          <button
            type="button"
            onClick={bulkDelete}
            className="inline-flex min-h-10 items-center gap-1 rounded-ds-md px-3 text-xs font-bold"
            style={{ background: "var(--err-soft)", color: "var(--err)" }}
          >
            <Trash2 size={14} /> Eliminar
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            aria-label="Cerrar selección"
            className="grid h-9 w-9 place-items-center rounded-ds-md text-tx-mut"
            style={{ background: "var(--surf-2)" }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* modal form */}
      <EmployeeFormModal
        open={showForm}
        editEmp={editEmp}
        form={form}
        setForm={setForm}
        saving={saving}
        onClose={closeForm}
        onSubmit={saveEmployee}
      />
    </PageShell>
  );
}
