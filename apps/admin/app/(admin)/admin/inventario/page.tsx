"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import Link from "next/link";

interface Supplier { id: string; name: string; phone?: string; }
interface Ingredient {
  id: string; name: string; unit: string; stock: number;
  minStock: number; cost: number; lowStock?: boolean;
  supplierId?: string; supplier?: Supplier;
  purchaseUnit?: string; purchaseCost?: number; conversionFactor?: number;
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
type FormState = { name: string; unit: string; stock: number | string; minStock: number | string; cost: number | string; supplierId: string; purchaseUnit: string; purchaseCost: number | string; conversionFactor: number | string; };

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
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [scannedItems, setScannedItems] = useState<{ name: string; totalCost: number | string; quantityFound: number | string; unit: string; }[]>([]);
  const [isSavingBulk, setIsSavingBulk] = useState(false);

  const emptyForm: FormState = { name:"", unit:"pz", stock:0, minStock:0, cost:0, supplierId:"", purchaseUnit:"", purchaseCost:"", conversionFactor:1 };
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
      for (let i = 0; i < files.length; i++) fd.append("images", files[i]);
      const { data } = await api.post("/api/ai/scan-inventory", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const detected = (data.data?.ingredients || []).map((item: any) => ({
        name: item.name || "",
        totalCost: item.totalCost ?? 0,
        quantityFound: item.quantityFound ?? 1,
        unit: "pz",
      }));
      setScannedItems(detected);
      setIsReviewOpen(true);
    } catch (error: any) {
      alert(error.response?.data?.error || "Error al procesar tickets con IA");
    } finally {
      setIsScanning(false);
      e.target.value = "";
    }
  }

  async function handleBulkConfirm() {
    setIsSavingBulk(true);
    try {
      await api.post("/api/inventory/bulk-confirm", { items: scannedItems });
      setIsReviewOpen(false);
      setScannedItems([]);
      fetchAll(activeLocationId);
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al guardar");
    } finally {
      setIsSavingBulk(false); }
  }

  function openForm(item?: Ingredient) {
    setEditItem(item || null);
    setForm(item ? {
      name: item.name, unit: item.unit, stock: item.stock,
      minStock: item.minStock, cost: item.cost, supplierId: item.supplierId || "",
      purchaseUnit: item.purchaseUnit || "", purchaseCost: item.purchaseCost ?? "",
      conversionFactor: item.conversionFactor ?? 1,
    } : { ...emptyForm });
    setShowForm(true);
  }

  async function saveIngredient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        unit: form.unit,
        stock: Number(form.stock),
        minStock: Number(form.minStock),
        supplierId: form.supplierId || null,
        purchaseUnit: form.purchaseUnit || null,
        purchaseCost: form.purchaseCost !== "" ? Number(form.purchaseCost) : null,
        conversionFactor: Number(form.conversionFactor) || 1,
        // cost se calcula en backend; solo enviamos si no hay purchaseCost
        ...(form.purchaseCost === "" && { cost: Number(form.cost) }),
      };
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

      {/* ── Modal de Revisión IA ───────────────────────────────────────── */}
      {isReviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 overflow-y-auto">
          <div className="w-full max-w-3xl bg-[#111] border border-gray-800 rounded-3xl p-8 my-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">🤖 Revisión de Ticket</h2>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">Verifica y corrige antes de guardar</p>
              </div>
              <button onClick={() => setIsReviewOpen(false)} className="text-gray-600 hover:text-white transition-colors text-xl">✕</button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    {["Ingrediente","Costo Total ($)","Cantidad / Rendimiento","Unidad","Costo por Unidad",""].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scannedItems.map((item, idx) => {
                    const cost = Number(item.totalCost) && Number(item.quantityFound)
                      ? (Number(item.totalCost) / Number(item.quantityFound)).toFixed(4)
                      : "—";
                    return (
                      <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-3 py-2">
                          <input
                            value={item.name}
                            onChange={e => setScannedItems(p => p.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                            className="bg-black border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm w-full outline-none focus:border-orange-500 transition-colors"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number" step="0.01" min="0"
                            value={item.totalCost}
                            onChange={e => setScannedItems(p => p.map((x, i) => i === idx ? { ...x, totalCost: e.target.value } : x))}
                            className="bg-black border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm w-24 outline-none focus:border-orange-500 transition-colors"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number" step="0.001" min="1"
                            value={item.quantityFound}
                            onChange={e => setScannedItems(p => p.map((x, i) => i === idx ? { ...x, quantityFound: e.target.value } : x))}
                            className="bg-black border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm w-24 outline-none focus:border-orange-500 transition-colors"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={item.unit}
                            onChange={e => setScannedItems(p => p.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))}
                            className="bg-black border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-orange-500 transition-colors"
                          >
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-orange-400 font-black text-sm">${cost}</span>
                          <span className="text-gray-600 text-xs ml-1">/{item.unit}</span>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setScannedItems(p => p.filter((_, i) => i !== idx))}
                            className="text-red-500/60 hover:text-red-400 transition-colors text-xs px-2 py-1 rounded-lg hover:bg-red-500/10"
                          >🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {scannedItems.length === 0 && (
              <p className="text-center text-gray-600 py-6 text-sm">Sin ingredientes. Agrega manualmente o cancela.</p>
            )}

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
              <button
                onClick={() => setScannedItems(p => [...p, { name: "", totalCost: 0, quantityFound: 1, unit: "pz" }])}
                className="text-xs font-bold text-gray-500 hover:text-white transition-colors border border-white/10 px-4 py-2 rounded-xl hover:border-white/30"
              >
                + Agregar fila
              </button>
              <div className="flex gap-3">
                <button onClick={() => setIsReviewOpen(false)} className="px-5 py-2.5 text-gray-500 font-bold uppercase tracking-widest text-xs">
                  Cancelar
                </button>
                <button
                  onClick={handleBulkConfirm}
                  disabled={isSavingBulk || scannedItems.length === 0}
                  className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl uppercase tracking-widest text-xs shadow-lg shadow-orange-500/20 disabled:opacity-50 transition-all"
                >
                  {isSavingBulk ? "Guardando..." : `✓ Confirmar ${scannedItems.length} ingredientes`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 overflow-y-auto">
          <div className="w-full max-w-md bg-[#111] border border-gray-800 rounded-3xl p-8 my-4">
            <h2 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter">{editItem ? "Editar" : "Nuevo"} Ingrediente</h2>
            <form onSubmit={saveIngredient} className="space-y-4">

              {/* Nombre */}
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Nombre del Ingrediente</label>
                <input value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} required
                  placeholder="Ej. Tomate, Pollo, Harina"
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-orange-500 transition-colors" />
              </div>

              {/* Compra */}
              <div className="bg-black/40 border border-white/5 rounded-2xl p-4 space-y-3">
                <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Unidad de Compra</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Presentación</label>
                    <input value={form.purchaseUnit} onChange={e => setForm(p=>({...p,purchaseUnit:e.target.value}))}
                      placeholder="Ej. Caja, Costal, Bolsa"
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-orange-500 transition-colors" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Costo de Compra ($)</label>
                    <input type="number" step="0.01" min="0" value={form.purchaseCost}
                      onChange={e => setForm(p=>({...p,purchaseCost:e.target.value}))}
                      placeholder="Ej. 600"
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-orange-500 transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Rendimiento (cantidad que incluye)</label>
                  <input type="number" step="0.001" min="1" value={form.conversionFactor}
                    onChange={e => setForm(p=>({...p,conversionFactor:e.target.value}))}
                    placeholder="Ej. 40"
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-orange-500 transition-colors" />
                </div>
              </div>

              {/* Receta */}
              <div className="bg-black/40 border border-white/5 rounded-2xl p-4 space-y-3">
                <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Unidad de Receta</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Unidad de Uso</label>
                    <select value={form.unit} onChange={e => setForm(p=>({...p,unit:e.target.value}))}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-orange-500 transition-colors">
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Costo unitario manual ($)</label>
                    <input type="number" step="0.0001" min="0" value={form.cost}
                      onChange={e => setForm(p=>({...p,cost:e.target.value}))}
                      disabled={form.purchaseCost !== ""}
                      placeholder={form.purchaseCost !== "" ? "Calculado automáticamente" : "Ej. 15"}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-orange-500 transition-colors disabled:opacity-40" />
                  </div>
                </div>

                {/* Costo calculado */}
                {form.purchaseCost !== "" && Number(form.conversionFactor) > 0 && (
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3">
                    <p className="text-xs text-orange-400 font-bold">
                      Costo unitario calculado:{" "}
                      <span className="text-white font-black">
                        ${(Number(form.purchaseCost) / Number(form.conversionFactor)).toFixed(4)}
                      </span>{" "}
                      por <span className="text-white font-black">{form.unit}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Stock */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Stock Actual</label>
                  <input type="number" step="0.01" min="0" value={form.stock}
                    onChange={e => setForm(p=>({...p,stock:e.target.value}))}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-orange-500 transition-colors" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Stock Mínimo</label>
                  <input type="number" step="0.01" min="0" value={form.minStock}
                    onChange={e => setForm(p=>({...p,minStock:e.target.value}))}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-orange-500 transition-colors" />
                </div>
              </div>

              {/* Proveedor */}
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Proveedor</label>
                <select value={form.supplierId} onChange={e => setForm(p=>({...p,supplierId:e.target.value}))}
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-orange-500 transition-colors">
                  <option value="">Sin proveedor</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 text-gray-500 font-bold uppercase tracking-widest text-xs">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 bg-orange-500 text-white font-black py-3 rounded-xl uppercase tracking-widest text-xs shadow-lg shadow-orange-500/20 disabled:opacity-50">
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
