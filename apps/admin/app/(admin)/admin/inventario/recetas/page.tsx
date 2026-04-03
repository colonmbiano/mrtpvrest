"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import Link from "next/link";

interface MenuItem { id: string; name: string; price: number; imageUrl?: string; }
interface Ingredient { id: string; name: string; unit: string; }
interface RecipeItem { ingredientId: string; name: string; unit: string; quantity: number; }

export default function RecetasPage() {
  const [menuItems, setMenuItems]     = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [selected, setSelected]       = useState<MenuItem | null>(null);
  const [recipe, setRecipe]           = useState<RecipeItem[]>([]);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState("");
  const [newIng, setNewIng]           = useState("");
  const [newQty, setNewQty]           = useState("");

  useEffect(() => {
    Promise.all([
      api.get("/api/menu/items"),
      api.get("/api/inventory/ingredients"),
    ]).then(([m, i]) => {
      setMenuItems(m.data);
      setIngredients(i.data);
    });
  }, []);

  async function selectItem(item: MenuItem) {
    setSelected(item);
    const { data } = await api.get("/api/inventory/recipes/" + item.id);
    setRecipe(data.map((r: any) => ({ ingredientId: r.ingredientId, name: r.ingredient.name, unit: r.ingredient.unit, quantity: r.quantity })));
  }

  function addIngredient() {
    if (!newIng || !newQty) return;
    const ing = ingredients.find(i => i.id === newIng);
    if (!ing) return;
    if (recipe.find(r => r.ingredientId === newIng)) { alert("Ya está en la receta"); return; }
    setRecipe(p => [...p, { ingredientId: newIng, name: ing.name, unit: ing.unit, quantity: Number(newQty) }]);
    setNewIng(""); setNewQty("");
  }

  function removeFromRecipe(ingredientId: string) {
    setRecipe(p => p.filter(r => r.ingredientId !== ingredientId));
  }

  function updateQty(ingredientId: string, qty: string) {
    setRecipe(p => p.map(r => r.ingredientId === ingredientId ? { ...r, quantity: Number(qty) } : r));
  }

  async function saveRecipe() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post("/api/inventory/recipes/" + selected.id, { items: recipe });
      alert("✅ Receta guardada");
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setSaving(false); }
  }

  const filtered = menuItems.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/inventario" className="text-sm font-bold" style={{color:"var(--muted)"}}>← Inventario</Link>
        <h1 className="font-syne text-3xl font-black">Recetas</h1>
      </div>
      <div className="grid gap-6" style={{gridTemplateColumns:"1fr 1.5fr"}}>
        <div className="rounded-2xl border overflow-hidden" style={{borderColor:"var(--border)"}}>
          <div className="px-4 py-3 border-b" style={{borderColor:"var(--border)",background:"var(--surf2)"}}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
          </div>
          <div className="overflow-y-auto" style={{maxHeight:"600px"}}>
            {filtered.map(item => (
              <button key={item.id} onClick={() => selectItem(item)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left border-b transition-all"
                style={{
                  borderColor:"var(--border)",
                  background: selected?.id===item.id ? "rgba(245,166,35,0.1)" : "var(--surf)",
                  borderLeft: selected?.id===item.id ? "3px solid var(--gold)" : "3px solid transparent",
                }}>
                {item.imageUrl && <img src={item.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />}
                <div>
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="text-xs" style={{color:"var(--muted)"}}>{item.price}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border p-5" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
          {!selected ? (
            <div className="text-center py-20" style={{color:"var(--muted)"}}>
              <div className="text-4xl mb-3">📋</div>
              <p>Selecciona un producto para editar su receta</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-syne font-bold text-lg">{selected.name}</h2>
                <button onClick={saveRecipe} disabled={saving}
                  className="px-4 py-2 rounded-xl text-sm font-syne font-black"
                  style={{background: saving ? "var(--muted)" : "var(--gold)",color:"#000"}}>
                  {saving ? "Guardando..." : "💾 Guardar receta"}
                </button>
              </div>
              <div className="flex flex-col gap-2 mb-4">
                {recipe.length === 0 ? (
                  <p className="text-sm py-4 text-center" style={{color:"var(--muted)"}}>Sin ingredientes aún</p>
                ) : recipe.map(r => (
                  <div key={r.ingredientId} className="flex items-center gap-3 p-3 rounded-xl"
                    style={{background:"var(--surf2)"}}>
                    <span className="flex-1 text-sm font-medium">{r.name}</span>
                    <input type="number" step="0.01" value={r.quantity}
                      onChange={e => updateQty(r.ingredientId, e.target.value)}
                      className="w-24 px-3 py-1.5 rounded-xl text-sm outline-none text-right"
                      style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                    <span className="text-xs w-10" style={{color:"var(--muted)"}}>{r.unit}</span>
                    <button onClick={() => removeFromRecipe(r.ingredientId)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                      style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>✕</button>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4" style={{borderColor:"var(--border)"}}>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>Agregar ingrediente</p>
                <div className="flex gap-2">
                  <select value={newIng} onChange={e => setNewIng(e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}}>
                    <option value="">Seleccionar...</option>
                    {ingredients.filter(i => !recipe.find(r => r.ingredientId===i.id)).map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                    ))}
                  </select>
                  <input type="number" step="0.01" value={newQty} onChange={e => setNewQty(e.target.value)}
                    placeholder="Cant."
                    className="w-24 px-3 py-2.5 rounded-xl text-sm outline-none text-center"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                  <button onClick={addIngredient}
                    className="px-4 py-2 rounded-xl text-sm font-bold"
                    style={{background:"var(--gold)",color:"#000"}}>+</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}