"use client";

/**
 * /admin/mesas — CRUD de mesas y zonas para la sucursal activa.
 *
 * Esta página es el "apartado para configurar mesas" que pidió el admin:
 *   - Crear/editar/borrar mesas.
 *   - Definir capacidad (comensales) por mesa.
 *   - Asignar zona (Terraza, Barra, etc.).
 *   - Ver estado en vivo (Disponible / Ocupada / Sucia) y liberar a mano
 *     mesas que se quedaron OCUPADAS por órdenes viejas no cerradas.
 *
 * Flow: lista en grid → tap card edita inline; botón "+ Nueva mesa" abre
 * un form modal con los mismos campos. La liberación es un click directo
 * en la card (PATCH status=AVAILABLE) para que el flujo POS pueda volver
 * a usarla sin tener que pasar por edición completa.
 */

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  Plus, Edit3, Trash2, Users, MapPin, Grid3x3,
  CircleCheck, CircleAlert, CirclePause, RotateCcw,
} from "lucide-react";
import BackButton from "@/components/BackButton";

type TableStatus = "AVAILABLE" | "OCCUPIED" | "DIRTY";

interface Zone {
  id: string;
  name: string;
  icon?: string | null;
}

interface TableRow {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  isActive: boolean;
  zone?: { id: string; name: string } | null;
  zoneId?: string | null;
}

interface FormState {
  id?: string;
  name: string;
  capacity: number;
  zoneId: string | null;
}

const EMPTY_FORM: FormState = { name: "", capacity: 4, zoneId: null };

const STATUS_META: Record<TableStatus, { label: string; color: string; bg: string; Icon: typeof CircleCheck }> = {
  AVAILABLE: { label: "Disponible", color: "#88D66C", bg: "rgba(136,214,108,0.10)", Icon: CircleCheck },
  OCCUPIED:  { label: "Ocupada",    color: "#FF8B6E", bg: "rgba(255,92,51,0.10)",  Icon: CircleAlert },
  DIRTY:     { label: "Por limpiar", color: "#ffb84d", bg: "rgba(255,184,77,0.10)", Icon: CirclePause },
};

export default function MesasAdminPage() {
  const [tables, setTables]   = useState<TableRow[]>([]);
  const [zones, setZones]     = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm]       = useState<FormState>(EMPTY_FORM);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
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

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  }

  function openEdit(t: TableRow) {
    setEditingId(t.id);
    setForm({ id: t.id, name: t.name, capacity: t.capacity ?? 4, zoneId: t.zoneId ?? t.zone?.id ?? null });
    setIsFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim()) { toast.error("Nombre requerido"); return; }
    setSaving(true);
    const tid = toast.loading(editingId ? "Actualizando mesa…" : "Creando mesa…");
    try {
      const payload = {
        name: form.name.trim(),
        capacity: form.capacity,
        zoneId: form.zoneId || null,
      };
      if (editingId) {
        await api.patch(`/api/tables/${editingId}`, payload, { timeout: 20000 });
        toast.success("Mesa actualizada", { id: tid });
      } else {
        await api.post("/api/tables", payload, { timeout: 20000 });
        toast.success("Mesa creada", { id: tid });
      }
      setIsFormOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error("Error: " + (e.response?.data?.error || e.message || "fallo"), { id: tid });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: TableRow) {
    if (!confirm(`¿Eliminar "${t.name}"?\n\nLas órdenes pasadas se conservan; la mesa solo desaparece del TPV.`)) return;
    setBusyId(t.id);
    try {
      await api.delete(`/api/tables/${t.id}`, { timeout: 15000 });
      toast.success(`"${t.name}" eliminada`);
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error("No se pudo eliminar: " + (e.response?.data?.error || ""));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRelease(t: TableRow) {
    if (t.status === "AVAILABLE") return;
    setBusyId(t.id);
    try {
      await api.patch(`/api/tables/${t.id}`, { status: "AVAILABLE" }, { timeout: 15000 });
      toast.success(`"${t.name}" marcada como disponible`);
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error("No se pudo liberar: " + (e.response?.data?.error || ""));
    } finally {
      setBusyId(null);
    }
  }

  const grouped = tables.reduce<Record<string, TableRow[]>>((acc, t) => {
    const key = t.zone?.name || "Sin zona";
    (acc[key] ||= []).push(t);
    return acc;
  }, {});

  const stats = {
    total:     tables.length,
    available: tables.filter(t => t.status === "AVAILABLE").length,
    occupied:  tables.filter(t => t.status === "OCCUPIED").length,
    dirty:     tables.filter(t => t.status === "DIRTY").length,
  };

  return (
    <div className="p-8 max-w-6xl mx-auto min-h-[100dvh] font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
        <div className="flex items-start gap-4">
          <BackButton ariaLabel="Volver al panel admin" />
          <div>
            <span className="text-[10px] font-black tracking-[0.2em] uppercase text-zinc-500 block mb-2">Configuración</span>
            <h1 className="text-3xl font-black text-white tracking-tight mb-1">Mesas y Zonas</h1>
            <p className="text-sm text-zinc-400 font-medium">
              Define cuántas mesas tienes, su capacidad y a qué zona pertenecen.
            </p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-amber-500 text-[#0a0a0c] px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 shadow-lg shadow-amber-500/20"
        >
          <Plus size={18} /> Nueva Mesa
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatTile label="Total"      value={stats.total}     color="zinc"    icon={<Grid3x3 size={20} />} />
        <StatTile label="Disponibles" value={stats.available} color="emerald" icon={<CircleCheck size={20} />} />
        <StatTile label="Ocupadas"   value={stats.occupied}  color="rose"    icon={<CircleAlert size={20} />} />
        <StatTile label="Por limpiar" value={stats.dirty}     color="amber"   icon={<CirclePause size={20} />} />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">Cargando mesas…</span>
        </div>
      ) : tables.length === 0 ? (
        <div className="bg-[#121316] rounded-[2.5rem] p-20 border border-white/5 text-center">
          <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto mb-6 text-zinc-700">
            <Grid3x3 size={40} />
          </div>
          <h3 className="text-xl font-black text-white mb-2">Sin mesas configuradas</h3>
          <p className="text-zinc-500 max-w-xs mx-auto text-sm font-medium mb-6">
            Empieza creando la primera mesa de tu sucursal. Después podrás dividir el ticket por comensal.
          </p>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 bg-amber-500 text-[#0a0a0c] px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95"
          >
            <Plus size={18} /> Crear primera mesa
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(grouped).map(([zoneName, list]) => (
            <section key={zoneName}>
              <div className="flex items-center gap-3 mb-4">
                <MapPin size={16} className="text-amber-500" />
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-300">{zoneName}</h2>
                <span className="text-[10px] font-bold text-zinc-500">{list.length} mesa{list.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {list.map((t) => {
                  const meta = STATUS_META[t.status] ?? STATUS_META.AVAILABLE;
                  const StatusIcon = meta.Icon;
                  return (
                    <div
                      key={t.id}
                      className="relative bg-[#121316] p-6 rounded-[2rem] border border-white/5 hover:border-amber-500/30 transition-all"
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

                      <h3 className="text-2xl font-black text-white tracking-tight mb-1">{t.name}</h3>
                      <div className="flex items-center gap-3 text-xs text-zinc-400 font-bold mb-5">
                        <span className="inline-flex items-center gap-1">
                          <Users size={12} /> {t.capacity ?? 4} pers.
                        </span>
                        {t.zone?.name && <span className="text-zinc-600">·</span>}
                        {t.zone?.name && <span>{t.zone.name}</span>}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(t)}
                          disabled={busyId === t.id}
                          className="flex-1 h-11 rounded-2xl bg-white/5 hover:bg-white/10 text-zinc-300 font-bold text-xs uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                        >
                          <Edit3 size={14} /> Editar
                        </button>
                        {t.status !== "AVAILABLE" && (
                          <button
                            onClick={() => handleRelease(t)}
                            disabled={busyId === t.id}
                            title="Marcar como disponible"
                            className="h-11 px-4 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                          >
                            <RotateCcw size={14} /> Liberar
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(t)}
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
            </section>
          ))}
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg bg-[#0a0a0c] p-8 rounded-[2rem] border border-white/10 shadow-2xl space-y-6"
          >
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight mb-1">
                {editingId ? "Editar Mesa" : "Nueva Mesa"}
              </h2>
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Configuración</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Nombre</label>
                <input
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. Mesa 1, Barra A, Terraza 3"
                  className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">
                    Comensales
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, capacity: Math.max(1, form.capacity - 1) })}
                      className="w-12 h-14 rounded-2xl bg-white/5 border border-white/10 text-white font-black active:scale-95"
                    >−</button>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={form.capacity}
                      onChange={(e) => setForm({ ...form, capacity: Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1)) })}
                      className="flex-1 h-14 bg-[#121316] border border-white/5 rounded-2xl px-3 text-white font-black text-center text-lg focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, capacity: Math.min(50, form.capacity + 1) })}
                      className="w-12 h-14 rounded-2xl bg-white/5 border border-white/10 text-white font-black active:scale-95"
                    >+</button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Zona</label>
                  <select
                    value={form.zoneId ?? ""}
                    onChange={(e) => setForm({ ...form, zoneId: e.target.value || null })}
                    className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500 appearance-none"
                  >
                    <option value="">Sin zona</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={saving}
                className="flex-1 h-14 rounded-2xl bg-zinc-900 text-zinc-400 font-bold hover:text-white disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-[2] h-14 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-widest text-xs active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-[#0a0a0c]/30 border-t-[#0a0a0c] rounded-full animate-spin" />
                    Guardando…
                  </>
                ) : editingId ? "Guardar cambios" : "Crear mesa"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Stat tile ───────────────────────────────────────────────────────────────

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
