"use client";

/**
 * /admin/grupos-impresoras — CRUD de Printer Groups.
 *
 * Cada grupo agrupa N impresoras + N categorías. Al cobrar, los items
 * de una categoría enrutan al grupo configurado, y todas las
 * impresoras del grupo reciben copia del ticket. Multi-grupo: una
 * categoría puede pertenecer a varios grupos a la vez.
 *
 * Override item-level se gestiona desde /admin/menu (no acá).
 *
 * Estilo diseño operativo consistente con /admin/mesas y /admin/impresoras.
 */

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  Plus, Edit3, Trash2, Layers, Printer as PrinterIcon, Tag,
} from "lucide-react";
import BackButton from "@/components/BackButton";
import { formatDisplayName } from "@/lib/formatDisplayName";

interface Printer { id: string; name: string; type: string; ip: string | null; }
interface Category { id: string; name: string; }
interface MemberRow { printerGroupId: string; printerId: string; printer?: Printer; }
interface CategoryLink { printerGroupId: string; categoryId: string; category?: Category; }

interface PrinterGroup {
  id: string;
  name: string;
  members:    MemberRow[];
  categories: CategoryLink[];
}

interface FormState {
  id?: string;
  name: string;
  printerIds: string[];
  categoryIds: string[];
}

const EMPTY_FORM: FormState = { name: "", printerIds: [], categoryIds: [] };

export default function GruposImpresorasPage() {
  const [groups, setGroups]         = useState<PrinterGroup[]>([]);
  const [printers, setPrinters]     = useState<Printer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [busyId, setBusyId]         = useState<string | null>(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [g, p, c] = await Promise.all([
        api.get<PrinterGroup[]>("/api/printer-groups"),
        api.get<Printer[]>("/api/printers"),
        api.get<Category[]>("/api/menu/categories"),
      ]);
      setGroups(Array.isArray(g.data) ? g.data : []);
      setPrinters(Array.isArray(p.data) ? p.data : []);
      setCategories(Array.isArray(c.data) ? c.data : []);
    } catch (err) {
      console.error(err);
      toast.error("No pudimos cargar los grupos");
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  }

  function openEdit(g: PrinterGroup) {
    setEditingId(g.id);
    setForm({
      id: g.id,
      name: g.name,
      printerIds:  g.members.map((m) => m.printerId),
      categoryIds: g.categories.map((c) => c.categoryId),
    });
    setIsFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim()) { toast.error("Nombre requerido"); return; }
    setSaving(true);
    const tid = toast.loading(editingId ? "Actualizando grupo…" : "Creando grupo…");
    try {
      const payload = {
        name: form.name.trim(),
        printerIds: form.printerIds,
        categoryIds: form.categoryIds,
      };
      if (editingId) {
        await api.patch(`/api/printer-groups/${editingId}`, payload, { timeout: 20000 });
        toast.success("Grupo actualizado", { id: tid });
      } else {
        await api.post("/api/printer-groups", payload, { timeout: 20000 });
        toast.success("Grupo creado", { id: tid });
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

  async function handleDelete(g: PrinterGroup) {
    if (!confirm(`¿Eliminar grupo "${g.name}"?\n\nLas comandas de items con override caerán al fallback legacy hasta que reasignes.`)) return;
    setBusyId(g.id);
    try {
      await api.delete(`/api/printer-groups/${g.id}`, { timeout: 15000 });
      toast.success(`"${g.name}" eliminado`);
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error("No se pudo eliminar: " + (e.response?.data?.error || ""));
    } finally {
      setBusyId(null);
    }
  }

  const togglePrinter = (id: string) => {
    setForm((f) => ({
      ...f,
      printerIds: f.printerIds.includes(id)
        ? f.printerIds.filter((x) => x !== id)
        : [...f.printerIds, id],
    }));
  };
  const toggleCategory = (id: string) => {
    setForm((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter((x) => x !== id)
        : [...f.categoryIds, id],
    }));
  };

  return (
    <div className="p-8 max-w-6xl mx-auto min-h-screen font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
        <div className="flex items-start gap-4">
          <BackButton ariaLabel="Volver al panel admin" />
          <div>
            <span className="text-[10px] font-black tracking-[0.2em] uppercase text-zinc-500 block mb-2">
              Configuración
            </span>
            <h1 className="text-3xl font-black text-white tracking-tight mb-1">Grupos de Impresoras</h1>
            <p className="text-sm text-zinc-400 font-medium">
              Define qué impresoras reciben cada categoría. Una categoría puede ir a varios grupos.
            </p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-amber-500 text-[#0a0a0c] px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 shadow-lg shadow-amber-500/20"
        >
          <Plus size={18} /> Nuevo grupo
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">Cargando grupos…</span>
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-[#121316] rounded-[2.5rem] p-20 border border-white/5 text-center">
          <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto mb-6 text-zinc-700">
            <Layers size={40} />
          </div>
          <h3 className="text-xl font-black text-white mb-2">Sin grupos configurados</h3>
          <p className="text-zinc-500 max-w-sm mx-auto text-sm font-medium mb-6">
            Antes de configurar grupos, asegúrate de tener impresoras y categorías creadas. Cada grupo agrupa una o más impresoras + las categorías que enrutan a esas impresoras.
          </p>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 bg-amber-500 text-[#0a0a0c] px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95"
          >
            <Plus size={18} /> Crear primer grupo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {groups.map((g) => (
            <div key={g.id} className="bg-[#121316] p-6 rounded-[2rem] border border-white/5 hover:border-amber-500/30 transition-all">
              <div className="flex justify-between items-start mb-5">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/30 flex items-center justify-center">
                  <Layers size={24} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(g)}
                    className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 active:scale-95 transition-all flex items-center justify-center"
                    title="Editar"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(g)}
                    disabled={busyId === g.id}
                    className="w-10 h-10 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <h3 className="text-xl font-black text-white tracking-tight mb-4">{formatDisplayName(g.name)}</h3>

              <div className="space-y-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 flex items-center gap-1.5">
                    <PrinterIcon size={10} /> Impresoras ({g.members.length})
                  </p>
                  {g.members.length === 0 ? (
                    <p className="text-[10px] text-zinc-600 italic">Sin impresoras asignadas</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {g.members.map((m) => (
                        <span
                          key={m.printerId}
                          className="text-[10px] font-bold text-zinc-300 bg-white/5 border border-white/10 rounded-lg px-2 py-1"
                        >
                          {m.printer?.name ?? "?"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 flex items-center gap-1.5">
                    <Tag size={10} /> Categorías ({g.categories.length})
                  </p>
                  {g.categories.length === 0 ? (
                    <p className="text-[10px] text-zinc-600 italic">Sin categorías asignadas</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {g.categories.map((c) => (
                        <span
                          key={c.categoryId}
                          className="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1"
                        >
                          {c.category?.name ?? "?"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form
            onSubmit={handleSave}
            className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#0a0a0c] rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-white/10 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-black text-white tracking-tight mb-1">
                  {editingId ? "Editar grupo" : "Nuevo grupo"}
                </h2>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Enrutamiento de impresoras</p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={saving}
                className="text-zinc-500 hover:text-white text-2xl leading-none disabled:opacity-40"
                aria-label="Cerrar"
              >×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Nombre del grupo</label>
                <input
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. Cocina caliente, Barra, Postre"
                  className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <p className="text-[11px] font-black text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <PrinterIcon size={12} /> Impresoras ({form.printerIds.length})
                </p>
                {printers.length === 0 ? (
                  <p className="text-zinc-600 text-sm italic">Aún no hay impresoras. Créalas en /admin/impresoras.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {printers.map((p) => {
                      const active = form.printerIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => togglePrinter(p.id)}
                          className="flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-95 text-left"
                          style={{
                            background:  active ? "rgba(255,184,77,0.10)" : "#121316",
                            borderColor: active ? "#ffb84d"               : "rgba(255,255,255,0.05)",
                          }}
                        >
                          <span className="w-3 h-3 rounded-full" style={{ background: active ? "#ffb84d" : "rgba(255,255,255,0.10)" }} />
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-sm font-black text-white truncate">{formatDisplayName(p.name)}</span>
                            <span className="text-[10px] text-zinc-500 truncate">{p.type} · {p.ip || "sin IP"}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <p className="text-[11px] font-black text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Tag size={12} /> Categorías ({form.categoryIds.length})
                </p>
                {categories.length === 0 ? (
                  <p className="text-zinc-600 text-sm italic">Aún no hay categorías. Créalas en /admin/menu.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {categories.map((c) => {
                      const active = form.categoryIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleCategory(c.id)}
                          className="flex items-center gap-2 p-2.5 rounded-xl border transition-all active:scale-95 text-left"
                          style={{
                            background:  active ? "rgba(255,184,77,0.10)" : "#121316",
                            borderColor: active ? "#ffb84d"               : "rgba(255,255,255,0.05)",
                          }}
                        >
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: active ? "#ffb84d" : "rgba(255,255,255,0.10)" }} />
                          <span className="text-[12px] font-black text-white truncate">{formatDisplayName(c.name)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-white/10 flex gap-3 bg-[#0a0a0c]">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={saving}
                className="flex-1 h-12 rounded-2xl bg-zinc-900 text-zinc-400 font-bold uppercase text-xs tracking-widest hover:text-white disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-[2] h-12 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-widest text-xs active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-3 h-3 border-2 border-[#0a0a0c]/30 border-t-[#0a0a0c] rounded-full animate-spin" />
                    Guardando…
                  </>
                ) : editingId ? "Guardar cambios" : "Crear grupo"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
