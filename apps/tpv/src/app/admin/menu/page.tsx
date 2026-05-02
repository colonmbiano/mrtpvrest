"use client";
import React, { useState, useEffect } from "react";
import api from "@/lib/api";

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
  category?: Category;
};

export default function MenuEditorPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

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

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black mb-2 text-white">Editor de Menú</h1>
          <p className="text-gray-400">Administra los platillos, precios y categorías de tu restaurante.</p>
        </div>
        <button
          onClick={() => setEditingItem({ name: "", price: 0, categoryId: "", isAvailable: true })}
          className="bg-[#ffb84d] text-black px-5 py-2.5 rounded-xl font-bold transition-transform hover:scale-105 active:scale-95"
        >
          + Nuevo Platillo
        </button>
      </div>

      {editingItem && (
        <form onSubmit={handleSave} className="bg-[#141417] p-6 rounded-2xl border border-[#2d2d30] mb-8">
          <h2 className="text-xl font-bold mb-4" style={{ color: "#ffb84d" }}>
            {editingItem.id ? "Editar Platillo" : "Nuevo Platillo"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-1">Nombre</label>
              <input
                required
                value={editingItem.name || ""}
                onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-1">Precio ($)</label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={editingItem.price || ""}
                onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) })}
                className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-1">Categoría</label>
              <select
                required
                value={editingItem.categoryId || ""}
                onChange={(e) => setEditingItem({ ...editingItem, categoryId: e.target.value })}
                className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
              >
                <option value="">Selecciona...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setEditingItem(null)}
              className="px-4 py-2 text-gray-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-[#ffb84d] text-black px-5 py-2 rounded-xl font-bold"
            >
              Guardar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-400">Cargando menú...</div>
      ) : (
        <div className="bg-[#141417] rounded-2xl border border-[#2d2d30] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#2d2d30] bg-[#0a0a0c]">
                <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Platillo</th>
                <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Categoría</th>
                <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Precio</th>
                <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-center">Estado</th>
                <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">No hay platillos registrados.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b border-[#2d2d30]/50 hover:bg-[#2d2d30]/20 transition-colors">
                    <td className="p-4 font-bold text-white">{item.name}</td>
                    <td className="p-4 text-sm text-gray-400">{item.category?.name || "Sin categoría"}</td>
                    <td className="p-4 font-bold text-[#ffb84d]">${Number(item.price).toFixed(2)}</td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => toggleAvailability(item)}
                        className={`px-3 py-1 rounded-full text-xs font-bold ${
                          item.isAvailable
                            ? "bg-green-500/10 text-green-500 border border-green-500/20"
                            : "bg-red-500/10 text-red-500 border border-red-500/20"
                        }`}
                      >
                        {item.isAvailable ? "Activo" : "Agotado"}
                      </button>
                    </td>
                    <td className="p-4 flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingItem(item)}
                        className="bg-[#2d2d30] hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
