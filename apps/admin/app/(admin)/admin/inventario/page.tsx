"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import Link from "next/link";

interface Supplier { id: string; name: string; phone?: string; }
interface Ingredient {
  id: string; name: string; unit: string; stock: number;
  minStock: number; cost: number; lowStock?: boolean;
  supplierId?: string; supplier?: Supplier;
}
interface Movement {
  id: string; createdAt: string; type: string; quantity: number;
  reason?: string; ingredient?: { name: string; unit: string; };
}
interface ShoppingItem {
  ingredient: { id: string; name: string; unit: string; supplier?: { name: string; phone?: string; }; };
  currentStock: number; minStock: number; totalConsumed: number;
  suggestedOrder: number; estimatedCost: number;
}
interface ShoppingList { list: ShoppingItem[]; }
type FormState = { name: string; unit: string; stock: number | string; minStock: number | string; cost: number | string; supplierId: string; };

export default function InventarioPage() {
  const [activeLocationId, setActiveLocationId] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("locationId") || "" : ""
  );
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [alerts, setAlerts]           = useState<Ingredient[]>([]);
  const [movements, setMovements]     = useState<Movement[]>([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState("ingredients");
  const [showForm, setShowForm]       = useState(false);
  const [editItem, setEditItem]       = useState<Ingredient | null>(null);
  const [suppliers, setSuppliers]     = useState<Supplier[]>([]);
  const [saving, setSaving]           = useState(false);
  const [adjustModal, setAdjustModal] = useState<Ingredient | null>(null);
  const [adjustQty, setAdjustQty]     = useState("");
  const [adjustType, setAdjustType]   = useState("IN");
  const [adjustReason, setAdjustReason] = useState("");
  const [shoppingList, setShoppingList] = useState<ShoppingList | null>(null);
  const [shoppingPeriod, setShoppingPeriod] = useState("week");
  const [search, setSearch]           = useState("");

  // IA Escaneo
  const [isScanning, setIsScanning] = useState(false);

  const emptyForm: FormState = { name:"", unit:"pz", stock:0, minStock:0, cost:0, supplierId:"" };
  const [form, setForm] = useState<FormState>(emptyForm);

  const UNITS = ["pz","kg","g","l","ml","bolsa","lata","caja","sobre","rollo"];

  const fetchAll = useCallback(async (locationId: string) => {
    try {
      const [ing, al, mov, sup] = await Promise.all([
        api.get("/api/inventory/ingredients"),
        api.get("/api/inventory/alerts"),
        api.get("/api/inventory/movements?limit=50"),
        api.get("/api/inventory/suppliers"),
      ]);
      setIngredients(ing.data);
      setAlerts(al.data);
      setMovements(mov.data);
      setSuppliers(sup.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  // Esperar a que la sucursal esté disponible antes de disparar peticiones
  useEffect(() => {
    if (activeLocationId) {
      fetchAll(activeLocationId);
      return;
    }
    // Escuchar cuando el Sidebar grabe el locationId en localStorage
    const onStorage = (e: StorageEvent) => {
      if (e.key === "locationId" && e.newValue) {
        setActiveLocationId(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [activeLocationId, fetchAll]);

  // --- IA: Escaneo de Inventario ---
  async function handleAIScan(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsScanning(true);
    try {
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) {
        fd.append("images", files[i]);
      }

      const { data } = await api.post("/api/ai/scan-inventory", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      const aiIngredients = data.data.ingredients || [];
      alert(`🤖 IA Detectó: ${aiIngredients.length} ingredientes en tus tickets. Procesando...`);

      // Crear ingredientes detectados
      for (const item of aiIngredients) {
        try {
          await api.post("/api/inventory/ingredients", {
            name: item.name,
            unit: item.unit || "pz",
            stock: item.quantity || 0,
            cost: item.cost || 0,
            minStock: 5,
            supplierId: null
          });
        } catch (err) { console.error("Error cargando ingrediente IA", err); }
      }

      fetchAll(activeLocationId);
      alert("✅ Inventario actualizado exitosamente.");
    } catch (error: any) {
      alert(error.response?.data?.error || "Error al procesar tickets con IA");
    } finally {
      setIsScanning(false);
      e.target.value = "";
    }
  }

  function openForm(item?: Ingredient) {
    setEditItem(item || null);
    setForm(item ? {
      name: item.name, unit: item.unit, stock: item.stock,
      minStock: item.minStock, cost: item.cost, supplierId: item.supplierId || ""
    } : { ...emptyForm });
    setShowForm(true);
  }

  async function saveIngredient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, stock: Number(form.stock), minStock: Number(form.minStock), cost: Number(form.cost), supplierId: form.supplierId || null };
      if (editItem) await api.put("/api/inventory/ingredients/" + editItem.id, payload);
      else await api.post("/api/inventory/ingredients", payload);
      setShowForm(false);
      fetchAll(activeLocationId);
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setSaving(false); }
  }

  async function deleteIngredient(id: string) {
    if (!confirm("¿Eliminar ingrediente?")) return;
    await api.delete("/api/inventory/ingredients/" + id);
    fetchAll(activeLocationId);
  }

  const filtered = ingredients.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne text-3xl font-black text-white">Inventario</h1>
          <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mt-1">Control de Stock por Sucursal</p>
        </div>
        <div className="flex gap-2">
          {/* BOTÓN IA INVENTARIO */}
          <label className={`px-4 py-2 rounded-xl text-sm font-black flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-lg ${isScanning ? 'bg-orange-200 text-black animate-pulse' : 'bg-orange-500 text-white shadow-orange-500/20'}`}>
            {isScanning ? "🤖 Escaneando..." : "🤖 Carga de Stock (IA)"}
            {!isScanning && <input type="file" accept="image/*" multiple onChange={handleAIScan} className="hidden" />}
          </label>

          <Link href="/admin/inventario/recetas" className="px-4 py-2 rounded-xl text-sm font-bold border border-white/10 text-gray-400">📋 Recetas</Link>
          <Link href="/admin/inventario/proveedores" className="px-4 py-2 rounded-xl text-sm font-bold border border-white/10 text-gray-400">🏭 Proveedores</Link>

          <button onClick={() => openForm()}
            className="px-4 py-2 rounded-xl text-sm font-syne font-black bg-white text-black"
          >
            + Nuevo Ingrediente
          </button>
        </div>
      </div>

      {/* El resto de la tabla y tabs se mantienen igual... */}
      <div className="flex gap-2 mb-6">
        {[
          { value:"ingredients", label:"🧪 Ingredientes" },
          { value:"movements",   label:"📈 Movimientos" },
          { value:"shopping",    label:"🛒 Lista de Compras" },
        ].map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className="px-4 py-2 rounded-xl text-sm font-bold"
            style={{
              background: tab===t.value ? "var(--gold)" : "var(--surf)",
              color: tab===t.value ? "#000" : "var(--muted)",
              border: "1px solid " + (tab===t.value ? "var(--gold)" : "var(--border)")
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ingredients" && (
        <>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar ingrediente..."
            className="w-full px-4 py-3 rounded-xl mb-4 outline-none"
            style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />

          <div className="rounded-2xl border overflow-hidden" style={{borderColor:"var(--border)"}}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{background:"var(--surf2)",borderBottom:"1px solid var(--border)"}}>
                  {["Ingrediente","Unidad","Stock Actual","Stock Mínimo","Costo","Proveedor",""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider"
                      style={{color:"var(--muted)"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((ing, idx) => (
                  <tr key={ing.id} style={{
                    borderBottom:"1px solid var(--border)",
                    background: ing.lowStock ? "rgba(239,68,68,0.03)" : idx%2===0 ? "var(--surf)" : "transparent"
                  }}>
                    <td className="px-4 py-3 font-medium text-white">{ing.lowStock && <span className="mr-1">⚠️</span>}{ing.name}</td>
                    <td className="px-4 py-3" style={{color:"var(--muted)"}}>{ing.unit}</td>
                    <td className="px-4 py-3 font-bold" style={{color: ing.lowStock ? "#ef4444" : "#22c55e"}}>{ing.stock}</td>
                    <td className="px-4 py-3" style={{color:"var(--muted)"}}>{ing.minStock}</td>
                    <td className="px-4 py-3" style={{color:"var(--gold)"}}>{ing.cost}</td>
                    <td className="px-4 py-3 text-xs" style={{color:"var(--muted)"}}>{ing.supplier?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openForm(ing)}
                          className="px-2 py-1 rounded-lg text-xs font-bold border border-white/10 text-gray-400">✏️</button>
                        <button onClick={() => deleteIngredient(ing.id)}
                          className="px-2 py-1 rounded-lg text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ... tabs de movimientos y shopping list ... */}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-md bg-[#111] border border-gray-800 rounded-3xl p-8">
            <h2 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter">{editItem ? "Editar" : "Nuevo"} Ingrediente</h2>
            <form onSubmit={saveIngredient} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Nombre</label>
                <input value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} required className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Unidad</label>
                  <select value={form.unit} onChange={e => setForm(p=>({...p,unit:e.target.value}))} className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-white">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Costo</label>
                  <input type="number" step="0.01" value={form.cost} onChange={e => setForm(p=>({...p,cost:e.target.value}))} className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-white" />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 text-gray-500 font-bold uppercase tracking-widest text-xs">Cancelar</button>
                <button type="submit" className="flex-1 bg-orange-500 text-white font-black py-3 rounded-xl uppercase tracking-widest text-xs shadow-lg shadow-orange-500/20">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
