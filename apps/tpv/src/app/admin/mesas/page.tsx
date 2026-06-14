"use client";

/**
 * /admin/mesas — CRUD de mesas y zonas para la sucursal activa.
 *
 * Este apartado configura el salón del restaurante:
 *   - Crear/editar/borrar ZONAS (Terraza, Barra, Patio…) con icono propio.
 *   - Crear mesas una a una o EN LOTE (prefijo + cantidad) para el alta inicial.
 *   - Definir capacidad (comensales) por mesa.
 *   - Mover una mesa de zona en un tap (chip inline, sin abrir el modal).
 *   - Ver estado en vivo (Disponible / Ocupada / Por limpiar) y liberar a mano
 *     mesas que se quedaron OCUPADAS por órdenes viejas no cerradas.
 *
 * Flow rápido:
 *   - Barra de zonas arriba: filtra el grid y da acceso a crear/editar zonas.
 *   - "+ Nueva mesa" abre un modal; con "Crear varias" das de alta N mesas
 *     numeradas de un golpe (Mesa 1…Mesa 12).
 *   - Las acciones (liberar, asignar zona, borrar) son OPTIMISTAS: el grid
 *     responde al instante y solo refetch tras crear en lote.
 */

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  Plus, Edit3, Trash2, Users, MapPin, Grid3x3,
  CircleCheck, CircleAlert, CirclePause, RotateCcw,
  Layers, X, Check, ChevronDown,
} from "lucide-react";
import { AdminScreen, AdminHeader } from "@/components/admin/AdminScreen";

type TableStatus = "AVAILABLE" | "OCCUPIED" | "DIRTY";

interface Zone {
  id: string;
  name: string;
  icon?: string | null;
  order?: number;
}

interface TableRow {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  isActive: boolean;
  zone?: { id: string; name: string; icon?: string | null } | null;
  zoneId?: string | null;
}

interface FormState {
  id?: string;
  name: string;
  capacity: number;
  zoneId: string | null;
  // alta en lote (solo al crear)
  bulk: boolean;
  quantity: number;
  startAt: number;
}

interface ZoneForm {
  id?: string;
  name: string;
  icon: string;
}

const EMPTY_FORM: FormState = { name: "", capacity: 4, zoneId: null, bulk: false, quantity: 4, startAt: 1 };
const EMPTY_ZONE: ZoneForm = { name: "", icon: "" };

// Filtro especial de "sin zona" (las mesas con zoneId null se agrupan aquí).
const NO_ZONE = "__none__";
const ALL_ZONES = "__all__";

// Presets de icono para las zonas — emoji simple, lo que guarda el schema.
const ZONE_ICONS = ["🪑", "🌴", "🛋️", "🍺", "🌿", "☀️", "🏠", "🚪", "🎉", "⭐", "🍽️", "💺", "🪟", "🔥", "🌙", "🏖️"];

const STATUS_META: Record<TableStatus, { label: string; color: string; bg: string; Icon: typeof CircleCheck }> = {
  AVAILABLE: { label: "Disponible", color: "#88D66C", bg: "rgba(136,214,108,0.10)", Icon: CircleCheck },
  OCCUPIED:  { label: "Ocupada",    color: "#FF8B6E", bg: "rgba(255,92,51,0.10)",  Icon: CircleAlert },
  DIRTY:     { label: "Por limpiar", color: "#ffb84d", bg: "rgba(255,184,77,0.10)", Icon: CirclePause },
};

export default function MesasAdminPage() {
  const [tables, setTables]   = useState<TableRow[]>([]);
  const [zones, setZones]     = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal de mesa
  const [form, setForm]       = useState<FormState>(EMPTY_FORM);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);

  // Modal de zona
  const [zoneForm, setZoneForm] = useState<ZoneForm>(EMPTY_ZONE);
  const [isZoneFormOpen, setIsZoneFormOpen] = useState(false);
  const [savingZone, setSavingZone] = useState(false);

  // Filtro y acciones inline
  const [activeZone, setActiveZone] = useState<string>(ALL_ZONES);
  const [zonePickerId, setZonePickerId] = useState<string | null>(null);
  const [busyId, setBusyId]   = useState<string | null>(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [t, z] = await Promise.all([
        api.get<TableRow[]>("/api/tables"),
        api.get<Zone[]>("/api/zones").catch(() => ({ data: [] as Zone[] })),
      ]);
      setTables(Array.isArray(t.data) ? t.data : []);
      setZones(Array.isArray(z.data) ? z.data : []);
    } catch (err) {
      console.error(err);
      toast.error("No pudimos cargar las mesas");
    } finally {
      setLoading(false);
    }
  }

  // ── Derivados ──────────────────────────────────────────────────────────────

  // Conteo de mesas por zona, en vivo (refleja updates optimistas al instante).
  const countByZone = useMemo(() => {
    const map: Record<string, number> = { [NO_ZONE]: 0 };
    for (const t of tables) {
      const k = t.zoneId ?? t.zone?.id ?? NO_ZONE;
      map[k] = (map[k] ?? 0) + 1;
    }
    return map;
  }, [tables]);

  const sortedZones = useMemo(
    () => [...zones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)),
    [zones],
  );

  const visibleTables = useMemo(() => {
    if (activeZone === ALL_ZONES) return tables;
    if (activeZone === NO_ZONE) return tables.filter(t => !(t.zoneId ?? t.zone?.id));
    return tables.filter(t => (t.zoneId ?? t.zone?.id) === activeZone);
  }, [tables, activeZone]);

  // Cuando vemos "Todas", agrupamos por zona (incluye "Sin zona" al final).
  const groups = useMemo(() => {
    if (activeZone !== ALL_ZONES) return null;
    const out: { key: string; label: string; icon: string | null; list: TableRow[] }[] = [];
    for (const z of sortedZones) {
      const list = tables.filter(t => (t.zoneId ?? t.zone?.id) === z.id);
      if (list.length) out.push({ key: z.id, label: z.name, icon: z.icon ?? null, list });
    }
    const none = tables.filter(t => !(t.zoneId ?? t.zone?.id));
    if (none.length) out.push({ key: NO_ZONE, label: "Sin zona", icon: null, list: none });
    return out;
  }, [tables, sortedZones, activeZone]);

  const stats = {
    total:     tables.length,
    available: tables.filter(t => t.status === "AVAILABLE").length,
    occupied:  tables.filter(t => t.status === "OCCUPIED").length,
    dirty:     tables.filter(t => t.status === "DIRTY").length,
  };

  // ── Mesa: abrir modal ──────────────────────────────────────────────────────

  function openNew() {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      // Si el usuario está filtrando una zona real, la pre-selecciona.
      zoneId: activeZone !== ALL_ZONES && activeZone !== NO_ZONE ? activeZone : null,
    });
    setIsFormOpen(true);
  }

  function openEdit(t: TableRow) {
    setEditingId(t.id);
    setForm({
      ...EMPTY_FORM,
      id: t.id,
      name: t.name,
      capacity: t.capacity ?? 4,
      zoneId: t.zoneId ?? t.zone?.id ?? null,
    });
    setIsFormOpen(true);
  }

  // ── Mesa: guardar (una o varias) ───────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim()) { toast.error("Nombre requerido"); return; }
    setSaving(true);

    // Alta en lote: prefijo + cantidad + desde. Secuencial para respetar el
    // UNIQUE(name) por sucursal y poder saltar duplicados sin abortar todo.
    if (!editingId && form.bulk) {
      const qty = Math.max(1, Math.min(50, form.quantity || 1));
      const prefix = form.name.trim();
      const tid = toast.loading(`Creando ${qty} mesas…`);
      let ok = 0, skipped = 0;
      try {
        for (let i = 0; i < qty; i++) {
          const nm = `${prefix} ${form.startAt + i}`.trim();
          try {
            await api.post("/api/tables", { name: nm, capacity: form.capacity, zoneId: form.zoneId || null }, { timeout: 20000 });
            ok++;
          } catch (err: unknown) {
            const e = err as { response?: { status?: number } };
            if (e.response?.status === 409) { skipped++; continue; } // ya existía
            throw err;
          }
        }
        toast.success(
          skipped ? `${ok} mesas creadas · ${skipped} ya existían` : `${ok} mesas creadas`,
          { id: tid },
        );
        closeForm();
        fetchAll();
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: string } }; message?: string };
        toast.error("Error tras crear " + ok + ": " + (e.response?.data?.error || e.message || "fallo"), { id: tid });
        fetchAll();
      } finally {
        setSaving(false);
      }
      return;
    }

    // Alta/edición individual.
    const tid = toast.loading(editingId ? "Actualizando mesa…" : "Creando mesa…");
    try {
      const payload = { name: form.name.trim(), capacity: form.capacity, zoneId: form.zoneId || null };
      if (editingId) {
        const { data } = await api.patch<TableRow>(`/api/tables/${editingId}`, payload, { timeout: 20000 });
        setTables(prev => prev.map(t => (t.id === editingId
          ? { ...t, name: data.name, capacity: data.capacity, zoneId: data.zoneId, zone: data.zone }
          : t)));
        toast.success("Mesa actualizada", { id: tid });
      } else {
        const { data } = await api.post<TableRow>("/api/tables", payload, { timeout: 20000 });
        setTables(prev => [...prev, data]);
        toast.success("Mesa creada", { id: tid });
      }
      closeForm();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error("Error: " + (e.response?.data?.error || e.message || "fallo"), { id: tid });
    } finally {
      setSaving(false);
    }
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  // ── Mesa: borrar / liberar / asignar zona (optimista) ──────────────────────

  async function handleDelete(t: TableRow) {
    if (!confirm(`¿Eliminar "${t.name}"?\n\nLas órdenes pasadas se conservan; la mesa solo desaparece del TPV.`)) return;
    setBusyId(t.id);
    const snapshot = tables;
    setTables(prev => prev.filter(x => x.id !== t.id)); // optimista
    try {
      await api.delete(`/api/tables/${t.id}`, { timeout: 15000 });
      toast.success(`"${t.name}" eliminada`);
    } catch (err: unknown) {
      setTables(snapshot); // rollback
      const e = err as { response?: { data?: { error?: string } } };
      toast.error("No se pudo eliminar: " + (e.response?.data?.error || ""));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRelease(t: TableRow) {
    if (t.status === "AVAILABLE") return;
    setBusyId(t.id);
    const snapshot = tables;
    setTables(prev => prev.map(x => (x.id === t.id ? { ...x, status: "AVAILABLE" } : x))); // optimista
    try {
      await api.patch(`/api/tables/${t.id}`, { status: "AVAILABLE" }, { timeout: 15000 });
      toast.success(`"${t.name}" disponible`);
    } catch (err: unknown) {
      setTables(snapshot);
      const e = err as { response?: { data?: { error?: string } } };
      toast.error("No se pudo liberar: " + (e.response?.data?.error || ""));
    } finally {
      setBusyId(null);
    }
  }

  async function quickAssignZone(t: TableRow, zoneId: string | null) {
    setZonePickerId(null);
    if ((t.zoneId ?? t.zone?.id ?? null) === zoneId) return;
    const snapshot = tables;
    const z = zoneId ? zones.find(zz => zz.id === zoneId) ?? null : null;
    setTables(prev => prev.map(x => (x.id === t.id
      ? { ...x, zoneId, zone: z ? { id: z.id, name: z.name, icon: z.icon } : null }
      : x))); // optimista
    try {
      const { data } = await api.patch<TableRow>(`/api/tables/${t.id}`, { zoneId }, { timeout: 15000 });
      setTables(prev => prev.map(x => (x.id === t.id ? { ...x, zoneId: data.zoneId, zone: data.zone } : x)));
    } catch (err: unknown) {
      setTables(snapshot);
      const e = err as { response?: { data?: { error?: string } } };
      toast.error("No se pudo mover de zona: " + (e.response?.data?.error || ""));
    }
  }

  // ── Zona: CRUD ─────────────────────────────────────────────────────────────

  function openNewZone() {
    setZoneForm(EMPTY_ZONE);
    setIsZoneFormOpen(true);
  }

  function openEditZone(z: Zone) {
    setZoneForm({ id: z.id, name: z.name, icon: z.icon ?? "" });
    setIsZoneFormOpen(true);
  }

  async function handleSaveZone(e: React.FormEvent) {
    e.preventDefault();
    if (savingZone) return;
    if (!zoneForm.name.trim()) { toast.error("Nombre de zona requerido"); return; }
    setSavingZone(true);
    const tid = toast.loading(zoneForm.id ? "Actualizando zona…" : "Creando zona…");
    try {
      const payload = { name: zoneForm.name.trim(), icon: zoneForm.icon || null };
      if (zoneForm.id) {
        const { data } = await api.patch<Zone>(`/api/zones/${zoneForm.id}`, payload, { timeout: 15000 });
        setZones(prev => prev.map(z => (z.id === zoneForm.id ? { ...z, name: data.name, icon: data.icon } : z)));
        // Propaga el rename a las mesas ya cargadas.
        setTables(prev => prev.map(t => (t.zone?.id === zoneForm.id
          ? { ...t, zone: { id: t.zone.id, name: data.name, icon: data.icon } }
          : t)));
        toast.success("Zona actualizada", { id: tid });
      } else {
        const { data } = await api.post<Zone>("/api/zones", { ...payload, order: zones.length }, { timeout: 15000 });
        setZones(prev => [...prev, data]);
        toast.success("Zona creada", { id: tid });
      }
      setIsZoneFormOpen(false);
      setZoneForm(EMPTY_ZONE);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error("Error: " + (e.response?.data?.error || e.message || "fallo"), { id: tid });
    } finally {
      setSavingZone(false);
    }
  }

  async function handleDeleteZone(z: Zone) {
    const n = countByZone[z.id] ?? 0;
    if (!confirm(
      `¿Eliminar la zona "${z.name}"?` +
      (n ? `\n\nSus ${n} mesa${n !== 1 ? "s" : ""} quedarán "Sin zona" (no se borran).` : ""),
    )) return;
    const snapZones = zones, snapTables = tables;
    // optimista: quita la zona y deja sus mesas sin zona.
    setZones(prev => prev.filter(x => x.id !== z.id));
    setTables(prev => prev.map(t => (t.zone?.id === z.id || t.zoneId === z.id ? { ...t, zoneId: null, zone: null } : t)));
    if (activeZone === z.id) setActiveZone(ALL_ZONES);
    try {
      await api.delete(`/api/zones/${z.id}`, { timeout: 15000 });
      toast.success(`Zona "${z.name}" eliminada`);
    } catch (err: unknown) {
      setZones(snapZones); setTables(snapTables);
      const e = err as { response?: { data?: { error?: string } } };
      toast.error("No se pudo eliminar la zona: " + (e.response?.data?.error || ""));
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AdminScreen onClick={() => setZonePickerId(null)}>
      <AdminHeader
        icon={Grid3x3}
        title="Mesas y Zonas"
        subtitle="Crea zonas, da de alta tus mesas (una o varias) y controla su estado."
        action={
          <div className="flex items-center gap-3">
            <button
              onClick={openNewZone}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-zinc-200 px-5 py-3 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all border border-white/10"
            >
              <Layers size={16} /> Nueva Zona
            </button>
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95"
              style={{ background: "var(--brand)", color: "var(--brand-fg)", boxShadow: "0 10px 30px var(--brand-glow)" }}
            >
              <Plus size={18} /> Nueva Mesa
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatTile label="Total"       value={stats.total}     color="zinc"    icon={<Grid3x3 size={20} />} />
        <StatTile label="Disponibles" value={stats.available} color="emerald" icon={<CircleCheck size={20} />} />
        <StatTile label="Ocupadas"    value={stats.occupied}  color="rose"    icon={<CircleAlert size={20} />} />
        <StatTile label="Por limpiar" value={stats.dirty}     color="amber"   icon={<CirclePause size={20} />} />
      </div>

      {/* ── Barra de zonas (filtro + gestión) ── */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ZoneChip
          active={activeZone === ALL_ZONES}
          onClick={() => setActiveZone(ALL_ZONES)}
          label="Todas"
          count={tables.length}
          icon={<Grid3x3 size={13} />}
        />
        {sortedZones.map((z) => (
          <ZoneChip
            key={z.id}
            active={activeZone === z.id}
            onClick={() => setActiveZone(z.id)}
            onEdit={() => openEditZone(z)}
            label={z.name}
            count={countByZone[z.id] ?? 0}
            emoji={z.icon || "📍"}
          />
        ))}
        <ZoneChip
          active={activeZone === NO_ZONE}
          onClick={() => setActiveZone(NO_ZONE)}
          label="Sin zona"
          count={countByZone[NO_ZONE] ?? 0}
          icon={<MapPin size={13} />}
          muted
        />
        <button
          onClick={openNewZone}
          className="shrink-0 flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-iris-soft text-iris-500 hover:bg-iris-soft font-black uppercase tracking-wider text-[11px] active:scale-95 transition-all border border-iris-glow"
        >
          <Plus size={14} /> Zona
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">Cargando mesas…</span>
        </div>
      ) : tables.length === 0 ? (
        <EmptyState onCreate={openNew} />
      ) : visibleTables.length === 0 ? (
        <div className="bg-[#121316] rounded-[2rem] p-14 border border-white/5 text-center">
          <p className="text-zinc-400 font-bold mb-1">Esta zona no tiene mesas todavía.</p>
          <p className="text-zinc-600 text-sm mb-6">Crea una mesa aquí o mueve una existente desde su chip de zona.</p>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 bg-iris-500 text-iris-fg px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95"
          >
            <Plus size={16} /> Nueva mesa aquí
          </button>
        </div>
      ) : groups ? (
        // Vista "Todas": secciones por zona.
        <div className="space-y-10">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="flex items-center gap-3 mb-4">
                {g.icon
                  ? <span className="text-base leading-none">{g.icon}</span>
                  : <MapPin size={16} className="text-iris-500" />}
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-300">{g.label}</h2>
                <span className="text-[10px] font-bold text-zinc-500">{g.list.length} mesa{g.list.length !== 1 ? "s" : ""}</span>
              </div>
              <TableGrid
                list={g.list} zones={sortedZones} busyId={busyId}
                zonePickerId={zonePickerId} setZonePickerId={setZonePickerId}
                onEdit={openEdit} onRelease={handleRelease} onDelete={handleDelete} onAssign={quickAssignZone}
              />
            </section>
          ))}
        </div>
      ) : (
        // Vista filtrada por una zona concreta.
        <TableGrid
          list={visibleTables} zones={sortedZones} busyId={busyId}
          zonePickerId={zonePickerId} setZonePickerId={setZonePickerId}
          onEdit={openEdit} onRelease={handleRelease} onDelete={handleDelete} onAssign={quickAssignZone}
        />
      )}

      {/* ── Modal mesa ── */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg bg-[#0a0a0c] p-8 rounded-[2rem] border border-white/10 shadow-2xl space-y-6 max-h-[90dvh] overflow-y-auto"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight mb-1">
                  {editingId ? "Editar Mesa" : form.bulk ? "Crear varias mesas" : "Nueva Mesa"}
                </h2>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Configuración</p>
              </div>
              <button type="button" onClick={closeForm} className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 flex items-center justify-center">
                <X size={18} />
              </button>
            </div>

            {/* Toggle alta en lote (solo al crear) */}
            {!editingId && (
              <div className="flex gap-2 p-1 bg-[#121316] rounded-2xl border border-white/5">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, bulk: false })}
                  className={`flex-1 h-11 rounded-xl font-black uppercase tracking-wider text-[11px] transition-all ${!form.bulk ? "bg-iris-500 text-iris-fg" : "text-zinc-400 hover:text-white"}`}
                >
                  Una mesa
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, bulk: true })}
                  className={`flex-1 h-11 rounded-xl font-black uppercase tracking-wider text-[11px] transition-all ${form.bulk ? "bg-iris-500 text-iris-fg" : "text-zinc-400 hover:text-white"}`}
                >
                  Crear varias
                </button>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">
                  {form.bulk ? "Prefijo" : "Nombre"}
                </label>
                <input
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={form.bulk ? "Ej. Mesa, Barra, Terraza" : "Ej. Mesa 1, Barra A, Terraza 3"}
                  className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Cantidad + desde (solo lote) */}
              {form.bulk && (
                <div className="grid grid-cols-2 gap-4">
                  <NumberStepper
                    label="Cantidad" value={form.quantity} min={1} max={50}
                    onChange={(v) => setForm({ ...form, quantity: v })}
                  />
                  <NumberStepper
                    label="Empezar desde" value={form.startAt} min={0} max={999}
                    onChange={(v) => setForm({ ...form, startAt: v })}
                  />
                </div>
              )}

              {form.bulk && form.name.trim() && (
                <div className="text-xs text-zinc-400 font-bold bg-iris-soft border border-iris-glow rounded-xl px-4 py-3">
                  Creará:{" "}
                  <span className="text-iris-500">
                    {form.name.trim()} {form.startAt}
                    {form.quantity > 1 && <>, {form.name.trim()} {form.startAt + 1}</>}
                    {form.quantity > 2 && <span className="text-zinc-500"> … </span>}
                    {form.quantity > 2 && <>{form.name.trim()} {form.startAt + form.quantity - 1}</>}
                  </span>
                  <span className="text-zinc-500"> · {Math.max(1, Math.min(50, form.quantity || 1))} mesas</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <NumberStepper
                  label="Comensales" value={form.capacity} min={1} max={50}
                  onChange={(v) => setForm({ ...form, capacity: v })}
                />
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Zona</label>
                  <div className="relative">
                    <select
                      value={form.zoneId ?? ""}
                      onChange={(e) => setForm({ ...form, zoneId: e.target.value || null })}
                      className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl pl-5 pr-10 text-white font-bold focus:outline-none focus:border-amber-500 appearance-none"
                    >
                      <option value="">Sin zona</option>
                      {sortedZones.map((z) => (
                        <option key={z.id} value={z.id}>{z.icon ? `${z.icon} ` : ""}{z.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="flex-1 h-14 rounded-2xl bg-zinc-900 text-zinc-400 font-bold hover:text-white disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-[2] h-14 rounded-2xl bg-iris-500 text-iris-fg font-black uppercase tracking-widest text-xs active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-[#0a0a0c]/30 border-t-[#0a0a0c] rounded-full animate-spin" />
                    Guardando…
                  </>
                ) : editingId ? "Guardar cambios" : form.bulk ? `Crear ${Math.max(1, Math.min(50, form.quantity || 1))} mesas` : "Crear mesa"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal zona ── */}
      {isZoneFormOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form
            onSubmit={handleSaveZone}
            className="w-full max-w-md bg-[#0a0a0c] p-8 rounded-[2rem] border border-white/10 shadow-2xl space-y-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight mb-1">
                  {zoneForm.id ? "Editar Zona" : "Nueva Zona"}
                </h2>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Áreas del salón</p>
              </div>
              <button type="button" onClick={() => setIsZoneFormOpen(false)} className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 flex items-center justify-center">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Nombre de la zona</label>
              <input
                required
                autoFocus
                value={zoneForm.name}
                onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                placeholder="Ej. Terraza, Barra, Patio, Salón VIP"
                className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Icono (opcional)</label>
              <div className="grid grid-cols-8 gap-2">
                <button
                  type="button"
                  onClick={() => setZoneForm({ ...zoneForm, icon: "" })}
                  className={`h-11 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${!zoneForm.icon ? "bg-iris-500 text-iris-fg" : "bg-[#121316] border border-white/5 text-zinc-500 hover:border-white/20"}`}
                  title="Sin icono"
                >
                  <MapPin size={16} />
                </button>
                {ZONE_ICONS.map((emo) => (
                  <button
                    type="button"
                    key={emo}
                    onClick={() => setZoneForm({ ...zoneForm, icon: emo })}
                    className={`h-11 rounded-xl flex items-center justify-center text-lg transition-all ${zoneForm.icon === emo ? "bg-iris-soft border border-iris-500 scale-105" : "bg-[#121316] border border-white/5 hover:border-white/20"}`}
                  >
                    {emo}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              {zoneForm.id && (
                <button
                  type="button"
                  onClick={() => { const z = zones.find(zz => zz.id === zoneForm.id); if (z) { setIsZoneFormOpen(false); handleDeleteZone(z); } }}
                  className="h-14 px-5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold flex items-center justify-center"
                  title="Eliminar zona"
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsZoneFormOpen(false)}
                disabled={savingZone}
                className="flex-1 h-14 rounded-2xl bg-zinc-900 text-zinc-400 font-bold hover:text-white disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingZone}
                className="flex-[2] h-14 rounded-2xl bg-iris-500 text-iris-fg font-black uppercase tracking-widest text-xs active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingZone ? (
                  <>
                    <span className="w-4 h-4 border-2 border-[#0a0a0c]/30 border-t-[#0a0a0c] rounded-full animate-spin" />
                    Guardando…
                  </>
                ) : zoneForm.id ? "Guardar zona" : "Crear zona"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AdminScreen>
  );
}

// ── Grid de mesas ─────────────────────────────────────────────────────────────

function TableGrid({
  list, zones, busyId, zonePickerId, setZonePickerId,
  onEdit, onRelease, onDelete, onAssign,
}: {
  list: TableRow[];
  zones: Zone[];
  busyId: string | null;
  zonePickerId: string | null;
  setZonePickerId: (id: string | null) => void;
  onEdit: (t: TableRow) => void;
  onRelease: (t: TableRow) => void;
  onDelete: (t: TableRow) => void;
  onAssign: (t: TableRow, zoneId: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {list.map((t) => {
        const meta = STATUS_META[t.status] ?? STATUS_META.AVAILABLE;
        const StatusIcon = meta.Icon;
        const zoneName = t.zone?.name ?? null;
        const zoneIcon = t.zone?.icon ?? null;
        const pickerOpen = zonePickerId === t.id;
        return (
          <div
            key={t.id}
            className="relative bg-[#121316] p-6 rounded-[2rem] border border-white/5 hover:border-iris-glow transition-all"
          >
            <div className="flex justify-between items-start mb-5">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33` }}
              >
                <StatusIcon size={24} />
              </div>
              <span
                className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl"
                style={{ background: meta.bg, color: meta.color }}
              >
                {meta.label}
              </span>
            </div>

            <h3 className="text-2xl font-black text-white tracking-tight mb-2">{t.name}</h3>

            <div className="flex items-center gap-2 mb-5">
              <span className="inline-flex items-center gap-1 text-xs text-zinc-400 font-bold">
                <Users size={12} /> {t.capacity ?? 4} pers.
              </span>
              {/* Chip de zona — tap para reasignar inline */}
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setZonePickerId(pickerOpen ? null : t.id); }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 active:scale-95 transition-all"
                >
                  {zoneIcon ? <span className="leading-none">{zoneIcon}</span> : <MapPin size={11} className="text-zinc-500" />}
                  {zoneName ?? "Sin zona"}
                  <ChevronDown size={11} className="text-zinc-500" />
                </button>
                {pickerOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 top-full mt-2 z-30 w-48 max-h-60 overflow-y-auto bg-[#16171b] border border-white/10 rounded-2xl shadow-2xl p-1.5"
                  >
                    <ZonePickerItem
                      label="Sin zona" active={!(t.zoneId ?? t.zone?.id)}
                      onClick={() => onAssign(t, null)} icon={<MapPin size={13} className="text-zinc-500" />}
                    />
                    {zones.map((z) => (
                      <ZonePickerItem
                        key={z.id} label={z.name} emoji={z.icon || "📍"}
                        active={(t.zoneId ?? t.zone?.id) === z.id}
                        onClick={() => onAssign(t, z.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => onEdit(t)}
                disabled={busyId === t.id}
                className="flex-1 h-11 rounded-2xl bg-white/5 hover:bg-white/10 text-zinc-300 font-bold text-xs uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Edit3 size={14} /> Editar
              </button>
              {t.status !== "AVAILABLE" && (
                <button
                  onClick={() => onRelease(t)}
                  disabled={busyId === t.id}
                  title="Marcar como disponible"
                  className="h-11 px-4 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <RotateCcw size={14} /> Liberar
                </button>
              )}
              <button
                onClick={() => onDelete(t)}
                disabled={busyId === t.id}
                className="h-11 w-11 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40"
                aria-label="Eliminar mesa"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ZonePickerItem({ label, emoji, icon, active, onClick }: {
  label: string; emoji?: string; icon?: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-left transition-all ${active ? "bg-iris-soft text-iris-500" : "text-zinc-300 hover:bg-white/5"}`}
    >
      {emoji ? <span className="text-base leading-none">{emoji}</span> : icon}
      <span className="flex-1 truncate">{label}</span>
      {active && <Check size={14} className="text-iris-500 shrink-0" />}
    </button>
  );
}

// ── Chip de zona (filtro) ─────────────────────────────────────────────────────

function ZoneChip({ active, onClick, onEdit, label, count, emoji, icon, muted }: {
  active: boolean;
  onClick: () => void;
  onEdit?: () => void;
  label: string;
  count: number;
  emoji?: string;
  icon?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`group shrink-0 flex items-center gap-2 h-9 pl-3.5 pr-2.5 rounded-full font-black uppercase tracking-wider text-[11px] cursor-pointer transition-all active:scale-95 border ${
        active
          ? "bg-iris-500 text-iris-fg border-iris-500"
          : muted
            ? "bg-white/[0.03] text-zinc-500 border-white/5 hover:text-zinc-300 hover:border-white/15"
            : "bg-white/5 text-zinc-300 border-white/5 hover:border-white/20"
      }`}
    >
      {emoji ? <span className="text-sm leading-none not-italic normal-case">{emoji}</span> : icon}
      <span>{label}</span>
      <span className={`min-w-[18px] text-center px-1.5 py-0.5 rounded-full text-[10px] ${active ? "bg-black/15" : "bg-white/10"}`}>{count}</span>
      {onEdit && (
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className={`-mr-0.5 ml-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${active ? "hover:bg-black/15 text-[#0a0a0c]/70" : "opacity-0 group-hover:opacity-100 hover:bg-white/10 text-zinc-400"}`}
          title={`Editar zona ${label}`}
        >
          <Edit3 size={11} />
        </span>
      )}
    </div>
  );
}

// ── Stepper numérico reutilizable ─────────────────────────────────────────────

function NumberStepper({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          className="w-12 h-14 rounded-2xl bg-white/5 border border-white/10 text-white font-black active:scale-95"
        >−</button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(clamp(parseInt(e.target.value, 10) || min))}
          className="flex-1 w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-3 text-white font-black text-center text-lg focus:outline-none focus:border-amber-500"
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          className="w-12 h-14 rounded-2xl bg-white/5 border border-white/10 text-white font-black active:scale-95"
        >+</button>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="bg-[#121316] rounded-[2.5rem] p-20 border border-white/5 text-center">
      <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto mb-6 text-zinc-700">
        <Grid3x3 size={40} />
      </div>
      <h3 className="text-xl font-black text-white mb-2">Sin mesas configuradas</h3>
      <p className="text-zinc-500 max-w-xs mx-auto text-sm font-medium mb-6">
        Empieza creando tus mesas. Con &ldquo;Crear varias&rdquo; das de alta toda la sala (Mesa 1…Mesa 12) en un solo paso.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 bg-iris-500 text-iris-fg px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95"
      >
        <Plus size={18} /> Crear mesas
      </button>
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

const STAT_PALETTE: Record<string, { text: string; bg: string }> = {
  zinc:    { text: "text-zinc-300",    bg: "bg-zinc-500/10 text-zinc-400" },
  emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10 text-emerald-400" },
  rose:    { text: "text-rose-400",    bg: "bg-rose-500/10 text-rose-400" },
  amber:   { text: "text-amber-400",   bg: "bg-amber-500/10 text-amber-400" },
};

function StatTile({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  const fallback = STAT_PALETTE.zinc!;
  const palette  = STAT_PALETTE[color] ?? fallback;
  return (
    <div className="bg-[#121316] p-5 rounded-3xl border border-white/5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${palette.bg}`}>
        {icon}
      </div>
      <p className={`text-3xl font-black tracking-tight ${palette.text}`}>{value}</p>
      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-1">{label}</p>
    </div>
  );
}
