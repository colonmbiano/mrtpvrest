"use client";
import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import { Plus, Edit2, Trash2, Check, XCircle, Star, Settings2, Copy, Save } from "lucide-react";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";

type Category = {
  id: string;
  name: string;
};

type MenuItemVariant = {
  id?: string;
  name: string;
  price: number;
  isAvailable: boolean;
};

type MenuItemComplement = {
  id?: string;
  name: string;
  price: number;
  isAvailable: boolean;
};

type VariantTemplate = {
  id: string;
  name: string;
  options: { name: string; price: number }[];
};

type MenuItem = {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  isAvailable: boolean;
  isFavorite?: boolean;
  category?: Category;
  variants?: MenuItemVariant[];
  complements?: MenuItemComplement[];
  variantTemplates?: { id: string; name: string }[];
};

export default function MenuEditorPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<VariantTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'variants' | 'complements'>('basic');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [itemsRes, catsRes, tplRes] = await Promise.all([
        api.get("/api/menu/items"),
        api.get("/api/menu/categories"),
        api.get("/api/menu/variant-templates")
      ]);
      setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setCategories(Array.isArray(catsRes.data) ? catsRes.data : []);
      setTemplates(Array.isArray(tplRes.data) ? tplRes.data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) fetchData(); });
    return () => { cancelled = true; };
  }, []);

  const openEditor = async (item: Partial<MenuItem>) => {
    if (item.id) {
      try {
        const { data } = await api.get(`/api/menu/items/${item.id}`);
        setEditingItem({
          ...data,
          variantTemplateIds: data.variantTemplates?.map((t: any) => t.id) || []
        });
      } catch {
        setEditingItem(item);
      }
    } else {
      setEditingItem({ ...item, variantTemplateIds: [] });
    }
    setActiveTab('basic');
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingItem) return;

    try {
      const payload = {
        ...editingItem,
        price: parseFloat(String(editingItem.price)) || 0,
      };

      if (editingItem.id) {
        await api.put(`/api/menu/items/${editingItem.id}`, payload);
        toast.success("Producto actualizado");
      } else {
        await api.post("/api/menu/items", payload);
        toast.success("Producto creado");
      }
      setEditingItem(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Error al guardar platillo");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este platillo?")) return;
    try {
      await api.delete(`/api/menu/items/${id}`);
      toast.success("Producto eliminado");
      fetchData();
    } catch {
      toast.error("Error al eliminar platillo");
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      await api.put(`/api/menu/items/${item.id}`, { isAvailable: !item.isAvailable });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleFavorite = async (item: MenuItem) => {
    const next = !item.isFavorite;
    if (next) {
      const currentCount = items.filter((i) => i.isFavorite).length;
      if (currentCount >= 10) {
        toast.warning("Ya tienes 10+ favoritos — el cajero perderá la ventaja de un solo tap.");
      }
    }
    try {
      await api.patch(`/api/menu/items/${item.id}/favorite`, { isFavorite: next });
      setItems((curr) => curr.map((i) => i.id === item.id ? { ...i, isFavorite: next } : i));
      toast.success(next ? `"${item.name}" marcado como favorito` : `"${item.name}" quitado de favoritos`);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo cambiar favorito");
    }
  };

  // ── Gestión de Variantes (vía Templates) ─────────────────────────
  const toggleTemplate = (tplId: string) => {
    if (!editingItem) return;
    const current = (editingItem as any).variantTemplateIds || [];
    const next = current.includes(tplId) 
      ? current.filter((id: string) => id !== tplId)
      : [...current, tplId];
    setEditingItem({ ...editingItem, variantTemplateIds: next } as any);
  };

  // ── Gestión de Complementos (Directos) ──────────────────────────
  const addComplement = async () => {
    if (!editingItem?.id) {
      toast.error("Guarda el producto primero para añadir complementos");
      return;
    }
    const name = prompt("Nombre del complemento:");
    if (!name) return;
    const priceStr = prompt("Precio adicional ($):", "0");
    const price = parseFloat(priceStr || "0") || 0;

    try {
      const { data } = await api.post(`/api/menu/items/${editingItem.id}/complements`, { name, price });
      setEditingItem({
        ...editingItem,
        complements: [...(editingItem.complements || []), data]
      });
      toast.success("Complemento añadido");
    } catch {
      toast.error("Error al añadir");
    }
  };

  const deleteComplement = async (id: string) => {
    if (!confirm("¿Eliminar complemento?")) return;
    try {
      await api.delete(`/api/menu/items/complements/${id}`);
      setEditingItem({
        ...editingItem,
        complements: editingItem?.complements?.filter(c => i !== id)
      } as any);
      toast.success("Eliminado");
    } catch {
      toast.error("Error al eliminar");
    }
  };

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto font-sans bg-[#0a0a0c] min-h-full">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-12">
        <div className="flex items-start gap-4">
          <BackButton ariaLabel="Volver al panel admin" />
          <div className="space-y-1.5">
            <span className="eyebrow text-amber-500/80">Configuración</span>
            <h1 className="text-4xl font-black text-white tracking-tight leading-none">Catálogo de Menú</h1>
            <p className="text-zinc-500 font-bold text-sm">Configura la oferta gastronómica y precios de la sucursal.</p>
          </div>
        </div>
        <button
          onClick={() => openEditor({ name: "", price: 0, categoryId: "", isAvailable: true })}
          className="h-14 px-8 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-[0.2em] text-xs flex items-center gap-3 transition-all active:scale-95 shadow-[0_10px_30px_rgba(255,184,77,0.25)]"
        >
          <Plus size={20} strokeWidth={3} />
          <span>Nuevo Producto</span>
        </button>
      </div>

      {/* EDITOR MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl">
          <div className="w-full max-w-4xl bg-[#121316] rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* TABS SELECTOR */}
            <div className="flex border-b border-white/5 bg-black/20">
              {[
                { id: 'basic', label: 'General', icon: Edit2 },
                { id: 'variants', label: 'Variantes/Sabores', icon: Copy },
                { id: 'complements', label: 'Extras/Toppings', icon: Plus }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 h-20 flex items-center justify-center gap-3 font-black uppercase tracking-widest text-[10px] transition-all ${
                    activeTab === tab.id ? 'text-amber-500 bg-white/5 border-b-2 border-amber-500' : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-10 overflow-y-auto custom-scrollbar flex-1">
              {activeTab === 'basic' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Nombre Comercial</label>
                    <input
                      autoFocus
                      placeholder="Ej. Hamburguesa Master con Queso"
                      value={editingItem.name || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                      className="w-full h-16 bg-[#0a0a0c] border border-white/5 rounded-2xl px-6 text-white text-xl font-black focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-zinc-800"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Precio Base ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={editingItem.price || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) })}
                        className="w-full h-16 bg-[#0a0a0c] border border-white/5 rounded-2xl px-6 text-white font-black mono text-2xl focus:outline-none focus:border-amber-500/50 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Categoría</label>
                      <select
                        value={editingItem.categoryId || ""}
                        onChange={(e) => setEditingItem({ ...editingItem, categoryId: e.target.value })}
                        className="w-full h-16 bg-[#0a0a0c] border border-white/5 rounded-2xl px-6 text-white font-bold focus:outline-none focus:border-amber-500/50 transition-all appearance-none cursor-pointer"
                      >
                        <option value="">Elegir categoría...</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'variants' && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="p-6 rounded-2xl bg-amber-500/5 border border-amber-500/10 mb-8">
                    <p className="text-amber-500/80 text-xs font-bold leading-relaxed uppercase tracking-wider">
                      Selecciona los grupos de variantes que aplican a este producto. Las opciones se sincronizarán automáticamente.
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {templates.map(tpl => {
                      const selected = ((editingItem as any).variantTemplateIds || []).includes(tpl.id);
                      return (
                        <button
                          key={tpl.id}
                          onClick={() => toggleTemplate(tpl.id)}
                          className={`p-6 rounded-2xl border transition-all text-left group ${
                            selected 
                              ? 'bg-amber-500 border-amber-500 text-[#0a0a0c]' 
                              : 'bg-white/5 border-white/5 text-white hover:border-white/20'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-black uppercase tracking-tighter text-sm">{tpl.name}</span>
                            {selected && <Check size={16} strokeWidth={4} />}
                          </div>
                          <p className={`text-[10px] font-bold uppercase tracking-widest ${selected ? 'text-[#0a0a0c]/60' : 'text-zinc-500'}`}>
                            {tpl.options.length} opciones disponibles
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'complements' && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                   <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Extras Personalizados</h3>
                      <button 
                        type="button"
                        onClick={addComplement}
                        className="h-10 px-4 rounded-xl bg-white/5 border border-white/10 text-white font-black uppercase text-[9px] tracking-widest flex items-center gap-2 hover:bg-white/10"
                      >
                        <Plus size={14} strokeWidth={3} /> Añadir Extra
                      </button>
                   </div>

                   <div className="space-y-3">
                     {editingItem.complements?.map((comp, idx) => (
                       <div key={comp.id || idx} className="flex items-center justify-between p-5 bg-white/5 border border-white/5 rounded-2xl">
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-white uppercase tracking-tight">{comp.name}</span>
                            <span className="text-[10px] font-bold text-amber-500 mono">+${comp.price.toFixed(2)}</span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => comp.id && deleteComplement(comp.id)}
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                       </div>
                     ))}
                     {(!editingItem.complements || editingItem.complements.length === 0) && (
                       <div className="py-12 text-center border-2 border-dashed border-white/5 rounded-[2rem]">
                          <p className="text-zinc-600 font-black uppercase tracking-widest text-[10px]">No hay extras configurados</p>
                       </div>
                     )}
                   </div>
                </div>
              )}
            </div>

            {/* FOOTER ACTIONS */}
            <div className="p-8 bg-black/40 border-t border-white/5 flex gap-4">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="h-16 px-8 rounded-2xl bg-white/5 text-zinc-400 font-black uppercase tracking-[0.2em] text-[10px] active:scale-95 transition-all hover:text-white"
              >
                Cerrar Editor
              </button>
              <button
                onClick={() => handleSave()}
                className="flex-1 h-16 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-[0.2em] text-[10px] active:scale-95 transition-all shadow-[0_10px_30px_rgba(255,184,77,0.2)] flex items-center justify-center gap-3"
              >
                <Save size={18} strokeWidth={3} />
                Guardar todo el Producto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ITEMS LIST */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-full h-24 bg-[#121316] animate-pulse rounded-2xl border border-white/5" />
          ))}
        </div>
      ) : (
        <div className="bg-[#121316] rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-white/5 bg-black/20">
                  <th className="px-8 py-8 text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">Producto</th>
                  <th className="px-8 py-8 text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">Categoría</th>
                  <th className="px-8 py-8 text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">Precio</th>
                  <th className="px-8 py-8 text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em] text-center">Estado</th>
                  <th className="px-8 py-8 text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em] text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((item) => (
                  <tr key={item.id} className="group hover:bg-white/[0.01] transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                         <span className="text-base font-black text-white tracking-tight">{item.name}</span>
                         <div className="flex gap-2 mt-1">
                            <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter">ID: {item.id.slice(-6).toUpperCase()}</span>
                            {item.variants && item.variants.length > 0 && (
                              <span className="text-[9px] text-amber-500/60 font-black uppercase tracking-tighter">· {item.variants.length} Variantes</span>
                            )}
                         </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/5 text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                        {item.category?.name || "General"}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-lg font-black text-white mono tnum">
                      ${Number(item.price).toFixed(2)}
                    </td>
                    <td className="px-8 py-6 text-center">
                      <button
                        onClick={() => toggleAvailability(item)}
                        className={`h-10 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-90 flex items-center gap-2 mx-auto border ${
                          item.isAvailable
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            : "bg-red-500/10 text-red-500 border-red-500/20"
                        }`}
                      >
                        {item.isAvailable ? <Check size={12} strokeWidth={4} /> : <XCircle size={12} strokeWidth={4} />}
                        {item.isAvailable ? "Activo" : "Agotado"}
                      </button>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => toggleFavorite(item)}
                          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all active:scale-90 border ${
                            item.isFavorite
                              ? "bg-amber-500/20 text-amber-500 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                              : "bg-white/5 text-zinc-600 border-white/5"
                          }`}
                        >
                          <Star size={18} fill={item.isFavorite ? "currentColor" : "none"} />
                        </button>
                        <button
                          onClick={() => openEditor(item)}
                          className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/5 text-zinc-400 border border-white/5 active:scale-90 hover:text-amber-500 hover:border-amber-500/30 transition-all"
                        >
                          <Settings2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="w-12 h-12 rounded-xl flex items-center justify-center bg-red-500/5 text-zinc-700 border border-red-500/10 active:scale-90 hover:text-red-500 transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
