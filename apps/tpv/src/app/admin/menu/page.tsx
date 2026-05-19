"use client";
import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import { Plus, Edit2, Trash2, Check, XCircle, Star } from "lucide-react";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";

type Category = {
  id: string;
  name: string;
};

type MenuItem = {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  isAvailable: boolean;
  isFavorite?: boolean;
  category?: Category;
};

export default function MenuEditorPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [itemsRes, catsRes] = await Promise.all([
        api.get("/api/menu/items"),
        api.get("/api/menu/categories")
      ]);
      setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setCategories(Array.isArray(catsRes.data) ? catsRes.data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    // Arranque diferido (ver impresoras): evita set-state-in-effect del
    // setLoading(true) síncrono de fetchData, mismo comportamiento.
    queueMicrotask(() => { if (!cancelled) fetchData(); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      if (editingItem.id) {
        await api.put(`/api/menu/items/${editingItem.id}`, editingItem);
      } else {
        await api.post("/api/menu/items", editingItem);
      }
      setEditingItem(null);
      fetchData();
    } catch {
      alert("Error al guardar platillo");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este platillo?")) return;
    try {
      await api.delete(`/api/menu/items/${id}`);
      fetchData();
    } catch {
      alert("Error al eliminar platillo");
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

  // toggleFavorite — pinea/despinea un item al tile "★ Favoritos" del POS.
  // Soft warning si el restaurante ya tiene 10+ favoritos: el tile aún
  // funciona con más, pero el cajero pierde la ventaja "1 tap" cuando hay
  // demasiados; dejamos que el admin decida.
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
      // Optimismo local antes del refetch.
      setItems((curr) => curr.map((i) => i.id === item.id ? { ...i, isFavorite: next } : i));
      toast.success(next ? `"${item.name}" marcado como favorito` : `"${item.name}" quitado de favoritos`);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo cambiar favorito");
    }
  };

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto font-sans bg-[#0a0a0c] min-h-full">
      {/* HEADER DISEÑO OPERATIVO */}
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
          onClick={() => setEditingItem({ name: "", price: 0, categoryId: "", isAvailable: true })}
          className="h-14 px-8 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-[0.2em] text-xs flex items-center gap-3 transition-all active:scale-95 shadow-[0_10px_30px_rgba(255,184,77,0.25)]"
        >
          <Plus size={20} strokeWidth={3} />
          <span>Nuevo Producto</span>
        </button>
      </div>

      {/* FORM MODAL STYLE */}
      {editingItem && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
          <form 
            onSubmit={handleSave} 
            className="w-full max-w-2xl bg-[#121316] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl animate-in zoom-in-95 duration-200"
          >
            <div className="mb-8">
               <span className="eyebrow text-amber-500 mb-2 block">Editor de Producto</span>
               <h2 className="text-3xl font-black text-white">{editingItem.id ? "Actualizar Platillo" : "Crear Nuevo Platillo"}</h2>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Nombre Comercial</label>
                <input
                  required
                  autoFocus
                  placeholder="Ej. Hamburguesa Master con Queso"
                  value={editingItem.name || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="w-full h-14 bg-[#0a0a0c] border border-white/5 rounded-2xl px-6 text-white font-bold focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-zinc-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Precio Unitario ($)</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={editingItem.price || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) })}
                    className="w-full h-14 bg-[#0a0a0c] border border-white/5 rounded-2xl px-6 text-white font-black mono text-lg focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Clasificación</label>
                  <select
                    required
                    value={editingItem.categoryId || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, categoryId: e.target.value })}
                    className="w-full h-14 bg-[#0a0a0c] border border-white/5 rounded-2xl px-6 text-white font-bold focus:outline-none focus:border-amber-500/50 transition-all appearance-none cursor-pointer"
                  >
                    <option value="" className="bg-[#121316]">Elegir categoría...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id} className="bg-[#121316]">
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-12">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="flex-1 h-14 rounded-2xl bg-white/5 text-zinc-400 font-black uppercase tracking-[0.2em] text-[10px] active:scale-95 transition-all active:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 h-14 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-[0.2em] text-[10px] active:scale-95 transition-all shadow-lg"
              >
                Guardar Cambios
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MENU TABLE - TOUCH OPTIMIZED */}
      {loading ? (
        <div className="flex flex-col gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-full h-20 bg-[#121316] animate-pulse rounded-2xl border border-white/5" />
          ))}
        </div>
      ) : (
        <div className="bg-[#121316] rounded-[2rem] border border-white/5 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-white/5 bg-black/20">
                  <th className="px-8 py-6 text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">Descripción del Producto</th>
                  <th className="px-8 py-6 text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">Categoría</th>
                  <th className="px-8 py-6 text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">Precio Venta</th>
                  <th className="px-8 py-6 text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em] text-center">Disponibilidad</th>
                  <th className="px-8 py-6 text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em] text-right">Controles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center text-zinc-600 font-black uppercase tracking-[0.2em] opacity-40">Sin productos registrados</td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="transition-colors active:bg-white/[0.02]">
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                           <span className="text-base font-black text-white tracking-tight leading-tight">{item.name}</span>
                           <span className="text-[10px] text-zinc-600 font-bold uppercase mt-1">ID: {item.id.slice(-6).toUpperCase()}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                          {item.category?.name || "Sin Clasificar"}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-lg font-black text-amber-500 mono tnum">
                          ${Number(item.price).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <button
                          onClick={() => toggleAvailability(item)}
                          className={`h-10 px-4 rounded-xl text-[9px] font-black uppercase tracking-[0.15em] transition-all active:scale-90 flex items-center gap-2 mx-auto border ${
                            item.isAvailable
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-red-500/10 text-red-500 border-red-500/20"
                          }`}
                        >
                          {item.isAvailable ? <Check size={12} strokeWidth={4} /> : <XCircle size={12} strokeWidth={4} />}
                          {item.isAvailable ? "En Existencia" : "Agotado"}
                        </button>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex gap-3 justify-end">
                          <button
                            onClick={() => toggleFavorite(item)}
                            title={item.isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
                            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all active:scale-90 border ${
                              item.isFavorite
                                ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
                                : "bg-white/5 text-zinc-600 active:text-amber-500 border-white/5"
                            }`}
                          >
                            <Star size={18} strokeWidth={item.isFavorite ? 2.5 : 2} fill={item.isFavorite ? "currentColor" : "none"} />
                          </button>
                          <button
                            onClick={() => setEditingItem(item)}
                            className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/5 text-zinc-500 active:text-amber-500 transition-all active:scale-90 border border-white/5"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="w-12 h-12 rounded-xl flex items-center justify-center bg-red-500/5 text-zinc-700 active:text-red-500 transition-all active:scale-90 border border-red-500/10"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
