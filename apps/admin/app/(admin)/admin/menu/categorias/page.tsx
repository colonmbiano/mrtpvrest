"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import api from "@/lib/api";

export default function CategoriasPage() {
  const [cats, setCats] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [editCat, setEditCat] = useState<any>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  async function fetchData() {
    const [c, i] = await Promise.all([
      api.get("/api/menu/categories"),
      // Traer TODOS los items incluyendo inactivos para el panel admin
      api.get("/api/menu/items?admin=true").catch(() => api.get("/api/menu/items")),
    ]);
    setCats(c.data);
    setAllItems(i.data);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  function openForm(cat?: any) {
    setEditCat(cat || null);
    setName(cat?.name || "");
    setShowForm(true);
  }

  function openItems(cat: any) {
    setEditCat(cat);
    setSearch("");
    setShowItems(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editCat && !showItems) {
        await api.put(`/api/menu/categories/${editCat.id}`, { name });
      } else {
        await api.post("/api/menu/categories", { name });
      }
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al guardar");
    } finally { setSaving(false); }
  }

  async function assignItem(item: any, catId: string) {
    try {
      await api.put(`/api/menu/items/${item.id}`, { categoryId: catId });
      // Actualizar state local inmediatamente sin recargar
      setAllItems(p => p.map(i => i.id === item.id ? { ...i, categoryId: catId } : i));
    } catch {
      alert("Error al reasignar");
    }
  }

  async function removeFromCategory(item: any) {
    // No se puede quitar sin asignar a otra — mejor mover a una categoría "Sin categoría" 
    // o simplemente confirmar y dejar sin categoryId no es posible por constraint
    // La solución: mostramos un selector para mover a otra categoría
    const otherCats = cats.filter(c => c.id !== editCat?.id);
    if (otherCats.length === 0) {
      alert("No hay otras categorías disponibles. Crea otra categoría primero.");
      return;
    }
    const options = otherCats.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const input = prompt(`¿A qué categoría mover "${item.name}"?\n\n${options}\n\nEscribe el número:`);
    if (!input) return;
    const idx = parseInt(input) - 1;
    if (isNaN(idx) || idx < 0 || idx >= otherCats.length) {
      alert("Opción inválida");
      return;
    }
    await assignItem(item, otherCats[idx].id);
  }

  async function toggleActive(cat: any) {
    try {
      await api.put(`/api/menu/categories/${cat.id}`, { isActive: !cat.isActive });
      fetchData();
    } catch { alert("Error al actualizar"); }
  }

  async function deleteCat(cat: any) {
    const itemCount = allItems.filter(i => i.categoryId === cat.id).length;
    if (itemCount > 0) {
      alert(`No puedes eliminar "${cat.name}" porque tiene ${itemCount} producto(s) asignado(s).\n\nPrimero mueve los productos a otra categoría desde "Ver productos".`);
      return;
    }
    if (!confirm(`¿Eliminar "${cat.name}"?`)) return;
    try {
      await api.delete(`/api/menu/categories/${cat.id}`);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al eliminar");
    }
  }

  const catItems = allItems.filter(i => i.categoryId === editCat?.id);
  const otherItems = allItems.filter(i => i.categoryId !== editCat?.id &&
    (search === "" || i.name.toLowerCase().includes(search.toLowerCase())));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne text-3xl font-black">Categorias</h1>
          <p className="text-sm mt-1" style={{color:"var(--muted)"}}>Organiza tu menu por secciones</p>
        </div>
        <button onClick={() => openForm()}
          className="px-4 py-2 rounded-xl text-sm font-syne font-black"
          style={{background:"var(--gold)",color:"#000"}}>
          + Nueva categoria
        </button>
      </div>

      {/* Modal nombre */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.8)"}}>
          <div className="w-full max-w-sm rounded-2xl p-6 border" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <h2 className="font-syne font-black text-xl mb-5">{editCat ? "Editar categoria" : "Nueva categoria"}</h2>
            <form onSubmit={save} className="flex flex-col gap-4">
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Ej: Hamburguesas, Tacos, Bebidas..."
                required autoFocus
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}} />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm border"
                  style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-xl font-syne font-black text-sm"
                  style={{background: saving ? "var(--muted)" : "var(--gold)",color:"#000"}}>
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal productos */}
      {showItems && editCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.9)"}}>
          <div className="w-full max-w-2xl rounded-2xl border flex flex-col" style={{background:"var(--surf)",borderColor:"var(--border)",maxHeight:"90vh"}}>
            <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0" style={{borderColor:"var(--border)"}}>
              <div>
                <h2 className="font-syne font-black text-xl">📂 {editCat.name}</h2>
                <p className="text-xs mt-0.5" style={{color:"var(--muted)"}}>{catItems.length} productos en esta categoria</p>
              </div>
              <button onClick={() => setShowItems(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center font-bold"
                style={{background:"var(--surf2)",color:"var(--muted)"}}>✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Productos en esta categoria */}
              <div>
                <h3 className="font-syne font-bold text-sm mb-3" style={{color:"var(--gold)"}}>
                  En esta categoria ({catItems.length})
                </h3>
                {catItems.length === 0 ? (
                  <p className="text-sm" style={{color:"var(--muted)"}}>Sin productos aun</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {catItems.map(item => (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border"
                        style={{background:"rgba(245,166,35,0.05)",borderColor:"rgba(245,166,35,0.2)"}}>
                        <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center text-xl"
                          style={{background:"var(--surf2)"}}>
                          {item.imageUrl ? (
                            <Image src={item.imageUrl} alt={item.name} width={40} height={40} className="object-cover w-full h-full" />
                          ) : "🍔"}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{item.name}</div>
                          <div className="text-xs" style={{color:"var(--gold)"}}>${item.price}</div>
                        </div>
                        <button onClick={() => removeFromCategory(item)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold"
                          style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.2)"}}>
                          Mover ↗
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Agregar productos de otras categorias */}
              <div>
                <h3 className="font-syne font-bold text-sm mb-3" style={{color:"var(--muted)"}}>
                  Agregar desde otras categorias
                </h3>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none mb-3"
                  style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                <div className="flex flex-col gap-2">
                  {otherItems.slice(0, 20).map(item => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border"
                      style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
                      <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center text-xl"
                        style={{background:"var(--surf)"}}>
                        {item.imageUrl ? (
                          <Image src={item.imageUrl} alt={item.name} width={40} height={40} className="object-cover w-full h-full" />
                        ) : "🍔"}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{item.name}</div>
                        <div className="text-xs" style={{color:"var(--muted)"}}>
                          {cats.find(c => c.id === item.categoryId)?.name || "Sin categoria"}
                        </div>
                      </div>
                      <button onClick={() => assignItem(item, editCat.id)}
                        className="px-3 py-1.5 rounded-xl text-xs font-syne font-black"
                        style={{background:"var(--gold)",color:"#000"}}>
                        + Agregar
                      </button>
                    </div>
                  ))}
                  {otherItems.length === 0 && (
                    <p className="text-sm text-center py-4" style={{color:"var(--muted)"}}>
                      Todos los productos estan en esta categoria
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lista de categorias */}
      {loading ? (
        <div className="text-center py-20" style={{color:"var(--muted)"}}>Cargando...</div>
      ) : (
        <div className="flex flex-col gap-3">
          {cats.map(cat => {
            const itemCount = allItems.filter(i => i.categoryId === cat.id).length;
            return (
              <div key={cat.id} className="flex items-center gap-4 px-5 py-4 rounded-2xl border"
                style={{background:"var(--surf)",borderColor:"var(--border)",opacity: cat.isActive ? 1 : 0.5}}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{background:"var(--surf2)"}}>📂</div>
                <div className="flex-1">
                  <div className="font-syne font-bold">{cat.name}</div>
                  <div className="text-xs mt-0.5" style={{color:"var(--muted)"}}>{itemCount} productos</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button onClick={() => openItems(cat)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border"
                    style={{borderColor:"var(--gold)",color:"var(--gold)"}}>
                    Ver productos
                  </button>
                  <button onClick={() => toggleActive(cat)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold"
                    style={{
                      background: cat.isActive ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                      color: cat.isActive ? "#22c55e" : "#ef4444",
                      border: `1px solid ${cat.isActive ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`
                    }}>
                    {cat.isActive ? "Activa" : "Inactiva"}
                  </button>
                  <button onClick={() => openForm(cat)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border"
                    style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                    Editar
                  </button>
                  <button onClick={() => deleteCat(cat)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold"
                    style={{
                      background: itemCount > 0 ? "rgba(100,100,100,0.1)" : "rgba(239,68,68,0.1)",
                      color: itemCount > 0 ? "var(--muted)" : "#ef4444",
                      border: `1px solid ${itemCount > 0 ? "var(--border)" : "rgba(239,68,68,0.2)"}`,
                      cursor: itemCount > 0 ? "not-allowed" : "pointer",
                    }}
                    title={itemCount > 0 ? `Mueve los ${itemCount} productos primero` : "Eliminar categoría"}>
                    {itemCount > 0 ? `🔒 ${itemCount} items` : "🗑️"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}