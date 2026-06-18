"use client";

/**
 * RoutingTab — enrutamiento de comandas vía Printer Groups (paradigma único).
 *
 * Reemplaza /admin/grupos-impresoras + PrinterCategoriesModal. Un grupo
 * agrupa N impresoras + N categorías; opcionalmente, un producto puede
 * sobreescribir el ruteo de su categoría (override por item).
 *
 * Si hay impresoras con categorías legacy (Printer.categories[]), ofrece
 * migrarlas a grupos con un click para que los grupos sean la única fuente.
 */

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Plus, Edit3, Trash2, Layers, Printer as PrinterIcon, Tag, ArrowRightLeft } from "lucide-react";
import { formatDisplayName } from "@/lib/formatDisplayName";

interface Printer { id: string; name: string; type: string; ip: string | null; categories?: string[] }
interface Category { id: string; name: string }
interface MemberRow { printerId: string; printer?: { name?: string } }
interface CategoryLink { categoryId: string; category?: { name?: string } }
interface PrinterGroup { id: string; name: string; members: MemberRow[]; categories: CategoryLink[] }
interface GroupRef { printerGroup?: { id: string; name: string } }
interface MenuItemRow { id: string; name: string; printerGroups?: GroupRef[] }

interface FormState { id?: string; name: string; printerIds: string[]; categoryIds: string[] }
const EMPTY_FORM: FormState = { name: "", printerIds: [], categoryIds: [] };

export default function RoutingTab() {
  const [groups, setGroups] = useState<PrinterGroup[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Override por producto
  const [overrideCat, setOverrideCat] = useState<string>("");
  const [items, setItems] = useState<MenuItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [savingItem, setSavingItem] = useState<string | null>(null);

  const legacyCount = printers.filter((p) => (p.categories?.length ?? 0) > 0).length;

  const fetchAll = async () => {
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
    } catch {
      toast.error("No pudimos cargar el ruteo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) fetchAll(); });
    return () => { cancelled = true; };
  }, []);

  const loadItems = async (categoryId: string) => {
    setOverrideCat(categoryId);
    if (!categoryId) { setItems([]); return; }
    setItemsLoading(true);
    try {
      const { data } = await api.get<MenuItemRow[]>(`/api/menu/items?categoryId=${categoryId}`);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error("No se pudieron cargar los productos");
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  };

  const openNew = () => { setEditingId(null); setForm(EMPTY_FORM); setIsFormOpen(true); };
  const openEdit = (g: PrinterGroup) => {
    setEditingId(g.id);
    setForm({ id: g.id, name: g.name, printerIds: g.members.map((m) => m.printerId), categoryIds: g.categories.map((c) => c.categoryId) });
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim()) { toast.error("Nombre requerido"); return; }
    setSaving(true);
    const tid = toast.loading(editingId ? "Actualizando grupo…" : "Creando grupo…");
    try {
      const payload = { name: form.name.trim(), printerIds: form.printerIds, categoryIds: form.categoryIds };
      if (editingId) await api.patch(`/api/printer-groups/${editingId}`, payload, { timeout: 20000 });
      else await api.post("/api/printer-groups", payload, { timeout: 20000 });
      toast.success(editingId ? "Grupo actualizado" : "Grupo creado", { id: tid });
      setIsFormOpen(false); setEditingId(null); setForm(EMPTY_FORM);
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error("Error: " + (e.response?.data?.error || e.message || "fallo"), { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g: PrinterGroup) => {
    if (!confirm(`¿Eliminar grupo "${g.name}"?`)) return;
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
  };

  const migrateLegacy = async () => {
    if (!confirm(`Convertir las categorías legacy de ${legacyCount} impresora(s) en grupos? Es seguro e idempotente.`)) return;
    const tid = toast.loading("Migrando ruteo legacy…");
    try {
      const { data } = await api.post<{ migrated: number }>("/api/printer-groups/migrate-legacy", {}, { timeout: 30000 });
      toast.success(`Migradas ${data.migrated} impresora(s) a grupos`, { id: tid });
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error("Error: " + (e.response?.data?.error || "fallo"), { id: tid });
    }
  };

  const toggleId = (key: "printerIds" | "categoryIds", id: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));

  const toggleItemGroup = async (item: MenuItemRow, groupId: string) => {
    const current = (item.printerGroups ?? []).map((r) => r.printerGroup?.id).filter((x): x is string => Boolean(x));
    const next = current.includes(groupId) ? current.filter((x) => x !== groupId) : [...current, groupId];
    setSavingItem(item.id);
    try {
      await api.post(`/api/printer-groups/by-item/${item.id}`, { groupIds: next });
      await loadItems(overrideCat);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error("Error: " + (e.response?.data?.error || "fallo"));
    } finally {
      setSavingItem(null);
    }
  };

  return (
    <div className="space-y-8">
      {legacyCount > 0 && (
        <div className="flex items-center justify-between gap-4 bg-iris-soft border border-iris-glow rounded-2xl p-5">
          <div>
            <p className="text-sm font-semibold text-iris-500">{legacyCount} impresora(s) con ruteo legacy</p>
            <p className="text-xs text-zinc-400 font-medium mt-1">Migra las categorías por-impresora a grupos para tener una sola fuente de ruteo.</p>
          </div>
          <button onClick={migrateLegacy} className="flex items-center gap-2 bg-iris-500 text-iris-fg px-5 py-3 rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 shrink-0">
            <ArrowRightLeft size={16} /> Migrar
          </button>
        </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-5">
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Grupos de impresión</h2>
            <p className="text-sm text-zinc-400 font-medium">Cada grupo: impresoras + categorías que enrutan a ellas.</p>
          </div>
          <button onClick={openNew} className="flex items-center gap-2 bg-iris-500 text-iris-fg px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 shadow-lg">
            <Plus size={18} /> Nuevo grupo
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: "var(--brand-soft)", borderTopColor: "var(--brand)" }} /></div>
        ) : groups.length === 0 ? (
          <div className="bg-[var(--surface-1)] rounded-[2rem] p-12 border border-white/5 text-center">
            <Layers size={36} className="mx-auto text-zinc-700 mb-4" />
            <h3 className="text-lg font-black text-white mb-2">Sin grupos configurados</h3>
            <p className="text-zinc-500 max-w-sm mx-auto text-sm font-medium">Crea impresoras y categorías primero, luego agrúpalas aquí.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {groups.map((g) => (
              <div key={g.id} className="bg-[var(--surface-1)] p-6 rounded-[2rem] border border-white/5 hover:border-iris-glow transition-all">
                <div className="flex justify-between items-start mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-iris-soft text-iris-500 border border-iris-glow flex items-center justify-center"><Layers size={24} /></div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(g)} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 active:scale-95 flex items-center justify-center"><Edit3 size={14} /></button>
                    <button onClick={() => handleDelete(g)} disabled={busyId === g.id} className="w-10 h-10 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 active:scale-95 flex items-center justify-center disabled:opacity-40"><Trash2 size={14} /></button>
                  </div>
                </div>
                <h3 className="text-xl font-black text-white tracking-tight mb-4">{formatDisplayName(g.name)}</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5 flex items-center gap-1.5"><PrinterIcon size={10} /> Impresoras ({g.members.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.members.length === 0 ? <span className="text-[10px] text-zinc-600 italic">Sin impresoras</span> :
                        g.members.map((m) => <span key={m.printerId} className="text-[10px] font-bold text-zinc-300 bg-white/5 border border-white/10 rounded-lg px-2 py-1">{m.printer?.name ?? "?"}</span>)}
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5 flex items-center gap-1.5"><Tag size={10} /> Categorías ({g.categories.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.categories.length === 0 ? <span className="text-[10px] text-zinc-600 italic">Sin categorías</span> :
                        g.categories.map((c) => <span key={c.categoryId} className="text-[10px] font-bold text-iris-500 bg-iris-soft border border-iris-glow rounded-lg px-2 py-1">{c.category?.name ?? "?"}</span>)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Override por producto */}
      <div className="border-t border-white/5 pt-8">
        <h2 className="text-xl font-black text-white tracking-tight mb-1">Override por producto</h2>
        <p className="text-sm text-zinc-400 font-medium mb-5">Opcional: enruta un producto a grupos distintos a los de su categoría.</p>
        <select value={overrideCat} onChange={(e) => loadItems(e.target.value)}
          className="w-full max-w-sm h-14 bg-[var(--surface-1)] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-[var(--brand)] appearance-none mb-5">
          <option value="">Elige una categoría…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {itemsLoading ? (
          <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "var(--brand-soft)", borderTopColor: "var(--brand)" }} /></div>
        ) : overrideCat && items.length === 0 ? (
          <p className="text-zinc-600 text-sm italic">Sin productos en esta categoría.</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const itemGroupIds = new Set((item.printerGroups ?? []).map((r) => r.printerGroup?.id));
              return (
                <div key={item.id} className="bg-[var(--surface-1)] border border-white/5 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="text-sm font-semibold text-white truncate">{formatDisplayName(item.name)}</span>
                    {savingItem === item.id && <span className="text-[10px] text-iris-500 font-bold">Guardando…</span>}
                  </div>
                  {groups.length === 0 ? (
                    <p className="text-[11px] text-zinc-600 italic">Crea grupos arriba para poder asignar.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {groups.map((g) => {
                        const active = itemGroupIds.has(g.id);
                        return (
                          <button key={g.id} type="button" disabled={savingItem === item.id} onClick={() => toggleItemGroup(item, g.id)}
                            className="text-[11px] font-semibold rounded-lg px-3 py-1.5 border transition-all active:scale-95 disabled:opacity-50"
                            style={{ background: active ? "var(--brand-soft)" : "var(--bg)", borderColor: active ? "var(--brand)" : "rgba(255,255,255,0.08)", color: active ? "var(--brand)" : "#a1a1aa" }}>
                            {g.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form onSubmit={handleSave} className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[var(--bg)] rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-black text-white tracking-tight mb-1">{editingId ? "Editar grupo" : "Nuevo grupo"}</h2>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Enrutamiento de impresoras</p>
              </div>
              <button type="button" onClick={() => setIsFormOpen(false)} disabled={saving} className="text-zinc-500 hover:text-white text-2xl leading-none disabled:opacity-40" aria-label="Cerrar">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider ml-1">Nombre del grupo</label>
                <input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. Cocina caliente, Barra, Postre"
                  className="w-full h-14 bg-[var(--surface-1)] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-[var(--brand)]" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2"><PrinterIcon size={12} /> Impresoras ({form.printerIds.length})</p>
                {printers.length === 0 ? <p className="text-zinc-600 text-sm italic">Crea impresoras en el tab Dispositivos.</p> : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {printers.map((p) => {
                      const active = form.printerIds.includes(p.id);
                      return (
                        <button key={p.id} type="button" onClick={() => toggleId("printerIds", p.id)}
                          className="flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-95 text-left"
                          style={{ background: active ? "var(--brand-soft)" : "var(--surface-1)", borderColor: active ? "var(--brand)" : "rgba(255,255,255,0.05)" }}>
                          <span className="w-3 h-3 rounded-full" style={{ background: active ? "var(--brand)" : "rgba(255,255,255,0.10)" }} />
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-sm font-semibold text-white truncate">{formatDisplayName(p.name)}</span>
                            <span className="text-[10px] text-zinc-500 truncate">{p.type} · {p.ip || "sin IP"}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Tag size={12} /> Categorías ({form.categoryIds.length})</p>
                {categories.length === 0 ? <p className="text-zinc-600 text-sm italic">Crea categorías en /admin/menu.</p> : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {categories.map((c) => {
                      const active = form.categoryIds.includes(c.id);
                      return (
                        <button key={c.id} type="button" onClick={() => toggleId("categoryIds", c.id)}
                          className="flex items-center gap-2 p-2.5 rounded-xl border transition-all active:scale-95 text-left"
                          style={{ background: active ? "var(--brand-soft)" : "var(--surface-1)", borderColor: active ? "var(--brand)" : "rgba(255,255,255,0.05)" }}>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: active ? "var(--brand)" : "rgba(255,255,255,0.10)" }} />
                          <span className="text-[12px] font-semibold text-white truncate">{formatDisplayName(c.name)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-white/10 flex gap-3 bg-[var(--bg)]">
              <button type="button" onClick={() => setIsFormOpen(false)} disabled={saving} className="flex-1 h-12 rounded-2xl bg-zinc-900 text-zinc-400 font-bold uppercase text-xs tracking-widest hover:text-white disabled:opacity-40">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-[2] h-12 rounded-2xl bg-iris-500 text-iris-fg font-black uppercase tracking-widest text-xs active:scale-95 disabled:opacity-60">
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear grupo"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
