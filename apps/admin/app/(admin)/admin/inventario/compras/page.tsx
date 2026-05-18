"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import Link from "next/link";

interface LocationRow { id: string; name: string; isCentralWarehouse?: boolean; }
interface Supplier { id: string; name: string; }
interface LookupIngredient { id: string; name: string; unit?: string; baseUnit?: string; }
interface PurchaseLine { ingredientId: string; qty: string; unitPrice: string; }
interface PurchaseOrder {
  id: string; poNumber: string; totalAmount: number; paymentMethod: string;
  receivedAt: string; createdAt: string;
  supplier?: { name: string }; location?: { name: string };
  createdBy?: { name: string };
  items?: { qtyReceived: number; unitPrice: number; ingredient?: { name: string } }[];
}
interface WarehouseRow {
  id: string; name: string; unit: string; stock: number; minStock: number;
  cost: number; value: number; lowStock: boolean; category?: { name: string } | null;
}
interface WarehouseResp {
  location: { id: string; name: string }; totalValue: number; count: number; ingredients: WarehouseRow[];
}
interface SuggestionRow {
  centralIngredientId: string; name: string; unit: string;
  destStock: number; destMinStock: number; centralStock: number;
  suggestedQty: number; estimatedCost: number;
}
interface TransferRow {
  id: string; createdAt: string; totalCost: number; notes?: string;
  fromLocation?: { name: string }; createdBy?: { name: string };
  items?: { qty: number; ingredient?: { name: string }; toLocation?: { name: string } }[];
}
interface ScanRow { name: string; totalCost: number | string; quantityFound: number | string; matchedId: string; }

const PAYMENT_METHODS = [
  { value: "CASH_DRAWER", label: "Efectivo de caja" },
  { value: "CORPORATE_CARD", label: "Tarjeta corporativa" },
  { value: "TRANSFER", label: "Transferencia" },
];

const money = (n: number) =>
  "$" + Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => s.trim().toLowerCase();

export default function ComprasPage() {
  const [tab, setTab] = useState<"compra" | "historial" | "bodega" | "reparto">("compra");
  const [loading, setLoading] = useState(true);

  // Config + sucursales
  const [centralEnabled, setCentralEnabled] = useState(false);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [savingCfg, setSavingCfg] = useState(false);
  const centralLoc = locations.find(l => l.isCentralWarehouse) || null;
  const branches = locations.filter(l => !l.isCentralWarehouse);

  // Catálogos
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ingredients, setIngredients] = useState<LookupIngredient[]>([]);

  // Form de compra
  const [supplierId, setSupplierId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("TRANSFER");
  const [destLocationId, setDestLocationId] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([{ ingredientId: "", qty: "", unitPrice: "" }]);
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [savingPurchase, setSavingPurchase] = useState(false);

  // IA scan
  const [isScanning, setIsScanning] = useState(false);
  const [scanRows, setScanRows] = useState<ScanRow[]>([]);
  const [scanOpen, setScanOpen] = useState(false);

  // Historial compras
  const [history, setHistory] = useState<PurchaseOrder[]>([]);

  // Bodega
  const [whLocationId, setWhLocationId] = useState("");
  const [warehouse, setWarehouse] = useState<WarehouseResp | null>(null);

  // Reparto
  const [repartoDest, setRepartoDest] = useState("");
  const [suggestion, setSuggestion] = useState<SuggestionRow[]>([]);
  const [repartoQty, setRepartoQty] = useState<Record<string, string>>({});
  const [repartoNotes, setRepartoNotes] = useState("");
  const [savingReparto, setSavingReparto] = useState(false);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);

  const loadBase = useCallback(async () => {
    try {
      const [cfg, locs, sup] = await Promise.all([
        api.get("/api/admin/config"),
        api.get("/api/admin/locations"),
        api.get("/api/purchases/lookup/suppliers").catch(() => ({ data: [] })),
      ]);
      setCentralEnabled(Boolean(cfg.data?.centralWarehouseEnabled));
      const locList: LocationRow[] = locs.data || [];
      setLocations(locList);
      setSuppliers(sup.data || []);
      const central = locList.find(l => l.isCentralWarehouse);
      const defaultDest = cfg.data?.centralWarehouseEnabled && central
        ? central.id
        : (locList[0]?.id || "");
      setDestLocationId(prev => prev || defaultDest);
      setWhLocationId(prev => prev || (central?.id || locList[0]?.id || ""));
    } catch {
      // silencioso — la UI muestra estado vacío
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  // Ingredientes del destino seleccionado (para autocompletar líneas)
  useEffect(() => {
    if (!destLocationId) { setIngredients([]); return; }
    api.get(`/api/purchases/lookup/ingredients?locationId=${destLocationId}`)
      .then(r => setIngredients(r.data || []))
      .catch(() => setIngredients([]));
  }, [destLocationId]);

  useEffect(() => {
    if (tab === "historial") api.get("/api/purchases").then(r => setHistory(r.data || [])).catch(() => setHistory([]));
    if (tab === "reparto") api.get("/api/transfers").then(r => setTransfers(r.data || [])).catch(() => setTransfers([]));
  }, [tab]);

  useEffect(() => {
    if (tab === "bodega" && whLocationId) {
      api.get(`/api/transfers/warehouse?locationId=${whLocationId}`)
        .then(r => setWarehouse(r.data))
        .catch(() => setWarehouse(null));
    }
  }, [tab, whLocationId]);

  // ── Config: activar/desactivar bodega central ──────────────────────────
  async function toggleCentral(next: boolean) {
    setSavingCfg(true);
    try {
      await api.put("/api/admin/config", { centralWarehouseEnabled: next });
      setCentralEnabled(next);
    } catch (e: any) {
      alert(e.response?.data?.error || "Error al guardar configuración");
    } finally { setSavingCfg(false); }
  }

  async function setAsCentral(locationId: string) {
    setSavingCfg(true);
    try {
      await api.put(`/api/admin/locations/${locationId}`, { isCentralWarehouse: true });
      const locs = await api.get("/api/admin/locations");
      setLocations(locs.data || []);
    } catch (e: any) {
      alert(e.response?.data?.error || "Error al asignar bodega central");
    } finally { setSavingCfg(false); }
  }

  // ── Compra ─────────────────────────────────────────────────────────────
  function updateLine(idx: number, patch: Partial<PurchaseLine>) {
    setLines(p => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines(p => [...p, { ingredientId: "", qty: "", unitPrice: "" }]); }
  function removeLine(idx: number) { setLines(p => p.filter((_, i) => i !== idx)); }

  const purchaseTotal = lines.reduce(
    (s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0
  );

  async function submitPurchase() {
    const items = lines
      .filter(l => l.ingredientId && Number(l.qty) > 0 && Number(l.unitPrice) >= 0)
      .map(l => ({ ingredientId: l.ingredientId, qty: Number(l.qty), unitPrice: Number(l.unitPrice) }));
    if (!supplierId) return alert("Selecciona un proveedor");
    if (!destLocationId) return alert("Selecciona el destino");
    if (items.length === 0) return alert("Agrega al menos una línea válida");
    setSavingPurchase(true);
    try {
      await api.post("/api/purchases", {
        supplierId,
        locationId: destLocationId,
        paymentMethod,
        items,
        notes: purchaseNotes || undefined,
      });
      setLines([{ ingredientId: "", qty: "", unitPrice: "" }]);
      setPurchaseNotes("");
      alert("Compra registrada");
      api.get("/api/purchases").then(r => setHistory(r.data || [])).catch(() => {});
    } catch (e: any) {
      alert(e.response?.data?.error || "Error al registrar la compra");
    } finally { setSavingPurchase(false); }
  }

  // ── IA scan de ticket ──────────────────────────────────────────────────
  async function handleScan(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsScanning(true);
    try {
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) { const f = files[i]; if (f) fd.append("images", f); }
      const { data } = await api.post("/api/ai/scan-inventory", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const detected: ScanRow[] = (data.data?.ingredients || []).map((it: any) => {
        const name = it.name || "";
        const match = ingredients.find(g => norm(g.name) === norm(name));
        return {
          name,
          totalCost: it.totalCost ?? 0,
          quantityFound: it.quantityFound ?? 1,
          matchedId: match?.id || "",
        };
      });
      setScanRows(detected);
      setScanOpen(true);
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al escanear el ticket con IA");
    } finally {
      setIsScanning(false);
      e.target.value = "";
    }
  }

  function applyScan() {
    const newLines: PurchaseLine[] = scanRows
      .filter(r => r.matchedId && Number(r.quantityFound) > 0)
      .map(r => {
        const qty = Number(r.quantityFound) || 1;
        const total = Number(r.totalCost) || 0;
        return { ingredientId: r.matchedId, qty: String(qty), unitPrice: String(qty ? +(total / qty).toFixed(4) : 0) };
      });
    if (newLines.length === 0) { alert("Asocia al menos un renglón a un ingrediente existente"); return; }
    setLines(prev => {
      const base = prev.filter(l => l.ingredientId || l.qty || l.unitPrice);
      return [...base, ...newLines];
    });
    setScanOpen(false);
    setScanRows([]);
  }

  // ── Reparto ────────────────────────────────────────────────────────────
  async function loadSuggestion(toLocationId: string) {
    setRepartoDest(toLocationId);
    setSuggestion([]);
    setRepartoQty({});
    if (!toLocationId) return;
    try {
      const { data } = await api.get(`/api/transfers/suggestion?toLocationId=${toLocationId}`);
      const list: SuggestionRow[] = data.list || [];
      setSuggestion(list);
      const q: Record<string, string> = {};
      list.forEach(s => { q[s.centralIngredientId] = String(s.suggestedQty); });
      setRepartoQty(q);
    } catch (e: any) {
      alert(e.response?.data?.error || "Error al calcular la sugerencia");
    }
  }

  const repartoTotal = suggestion.reduce((s, r) => {
    const qty = Number(repartoQty[r.centralIngredientId]) || 0;
    const unit = r.suggestedQty > 0 ? r.estimatedCost / r.suggestedQty : 0;
    return s + qty * unit;
  }, 0);

  async function submitReparto() {
    if (!repartoDest) return alert("Selecciona la sucursal destino");
    const items = suggestion
      .map(r => ({ ingredientId: r.centralIngredientId, toLocationId: repartoDest, qty: Number(repartoQty[r.centralIngredientId]) || 0 }))
      .filter(i => i.qty > 0);
    if (items.length === 0) return alert("No hay cantidades para repartir");
    setSavingReparto(true);
    try {
      await api.post("/api/transfers", { items, notes: repartoNotes || undefined });
      alert("Reparto registrado");
      setSuggestion([]);
      setRepartoQty({});
      setRepartoNotes("");
      api.get("/api/transfers").then(r => setTransfers(r.data || [])).catch(() => {});
    } catch (e: any) {
      alert(e.response?.data?.error || "Error al registrar el reparto");
    } finally { setSavingReparto(false); }
  }

  const TABS: { value: typeof tab; label: string }[] = [
    { value: "compra", label: "🧾 Registrar compra" },
    { value: "historial", label: "📚 Historial" },
    { value: "bodega", label: "🏬 Bodega" },
    ...(centralEnabled ? [{ value: "reparto" as const, label: "🚚 Reparto" }] : []),
  ];

  const inputCls =
    "w-full bg-black border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-orange-500 transition-colors";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne text-3xl font-black text-white">Compras & Bodega</h1>
          <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mt-1">
            Captura de compras, valor de inventario y reparto a sucursales
          </p>
        </div>
        <Link href="/admin/inventario"
          className="px-4 py-2 rounded-xl text-sm font-bold border border-white/10 text-gray-400">
          ← Inventario
        </Link>
      </div>

      {/* ── Configuración Bodega Central ─────────────────────────────────── */}
      <div className="rounded-2xl border p-5 mb-6" style={{ borderColor: "var(--border)", background: "var(--surf)" }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm font-black text-white">Modelo de Bodega Central</p>
            <p className="text-xs text-gray-500 mt-1 max-w-xl">
              Apagado: cada compra entra directo a la bodega de la sucursal.
              Encendido: las compras entran a la Bodega Central y luego se reparten a las sucursales.
            </p>
          </div>
          <button
            onClick={() => toggleCentral(!centralEnabled)}
            disabled={savingCfg}
            className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
            style={{
              background: centralEnabled ? "var(--gold)" : "var(--surf2)",
              color: centralEnabled ? "#000" : "var(--muted)",
              border: "1px solid " + (centralEnabled ? "var(--gold)" : "var(--border)"),
            }}
          >
            {centralEnabled ? "Activado" : "Desactivado"}
          </button>
        </div>
        {centralEnabled && (
          <div className="mt-4 pt-4 border-t flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Sucursal que actúa como Bodega Central</span>
            <select
              value={centralLoc?.id || ""}
              onChange={e => e.target.value && setAsCentral(e.target.value)}
              disabled={savingCfg}
              className="bg-black border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-orange-500"
            >
              <option value="">— elegir —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {!centralLoc && (
              <span className="text-xs text-red-400 font-bold">Falta asignar la Bodega Central</span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className="px-4 py-2 rounded-xl text-sm font-bold"
            style={{
              background: tab === t.value ? "var(--gold)" : "var(--surf)",
              color: tab === t.value ? "#000" : "var(--muted)",
              border: "1px solid " + (tab === t.value ? "var(--gold)" : "var(--border)"),
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-500 text-sm">Cargando…</p>}

      {/* ── TAB: Registrar compra ───────────────────────────────────────── */}
      {!loading && tab === "compra" && (
        <div className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surf)" }}>
          <div className="grid md:grid-cols-3 gap-4 mb-5">
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Proveedor</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={inputCls}>
                <option value="">— selecciona —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">
                Destino {centralEnabled && centralLoc && "(default: Bodega Central)"}
              </label>
              <select value={destLocationId} onChange={e => setDestLocationId(e.target.value)} className={inputCls}>
                <option value="">— selecciona —</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name}{l.isCentralWarehouse ? " · Bodega Central" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-1 block">Método de pago</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inputCls}>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Líneas de compra</p>
            <label className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer transition-all ${isScanning ? "bg-orange-200 text-black animate-pulse" : "bg-orange-500 text-white"}`}>
              {isScanning ? "🤖 Procesando…" : "🤖 Escanear ticket (IA)"}
              {!isScanning && <input type="file" accept="image/*,application/pdf,.xlsx,.csv" multiple onChange={handleScan} className="hidden" />}
            </label>
          </div>

          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select value={l.ingredientId} onChange={e => updateLine(idx, { ingredientId: e.target.value })}
                  className={inputCls + " col-span-6"}>
                  <option value="">— ingrediente —</option>
                  {ingredients.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <input type="number" step="0.001" min="0" placeholder="Cantidad" value={l.qty}
                  onChange={e => updateLine(idx, { qty: e.target.value })} className={inputCls + " col-span-2"} />
                <input type="number" step="0.01" min="0" placeholder="$ unitario" value={l.unitPrice}
                  onChange={e => updateLine(idx, { unitPrice: e.target.value })} className={inputCls + " col-span-2"} />
                <span className="col-span-1 text-xs text-right" style={{ color: "var(--gold)" }}>
                  {money((Number(l.qty) || 0) * (Number(l.unitPrice) || 0))}
                </span>
                <button onClick={() => removeLine(idx)}
                  className="col-span-1 text-red-500/70 hover:text-red-400 text-sm">🗑️</button>
              </div>
            ))}
          </div>

          <button onClick={addLine}
            className="mt-3 text-xs font-bold text-gray-500 hover:text-white border border-white/10 px-4 py-2 rounded-xl">
            + Agregar línea
          </button>

          <textarea value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)}
            placeholder="Notas (opcional)" rows={2}
            className={inputCls + " mt-4 resize-none"} />

          <div className="flex items-center justify-between mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm text-white font-bold">
              Total: <span style={{ color: "var(--gold)" }} className="font-black">{money(purchaseTotal)}</span>
            </p>
            <button onClick={submitPurchase} disabled={savingPurchase}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl uppercase tracking-widest text-xs disabled:opacity-50">
              {savingPurchase ? "Guardando…" : "Registrar compra"}
            </button>
          </div>
        </div>
      )}

      {/* ── TAB: Historial ──────────────────────────────────────────────── */}
      {!loading && tab === "historial" && (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surf2)", borderBottom: "1px solid var(--border)" }}>
                {["Folio", "Fecha", "Proveedor", "Destino", "Pago", "Renglones", "Total"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((po, i) => (
                <tr key={po.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "transparent" : "var(--surf)" }}>
                  <td className="px-4 py-3 font-bold text-white">{po.poNumber}</td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{new Date(po.receivedAt || po.createdAt).toLocaleDateString("es-MX")}</td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{po.supplier?.name || "—"}</td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{po.location?.name || "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>{po.paymentMethod}</td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{po.items?.length ?? 0}</td>
                  <td className="px-4 py-3 font-black" style={{ color: "var(--gold)" }}>{money(po.totalAmount)}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600 text-sm">Sin compras registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB: Bodega ─────────────────────────────────────────────────── */}
      {!loading && tab === "bodega" && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Sucursal</span>
            <select value={whLocationId} onChange={e => setWhLocationId(e.target.value)}
              className="bg-black border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-orange-500">
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}{l.isCentralWarehouse ? " · Bodega Central" : ""}</option>
              ))}
            </select>
            {warehouse && (
              <span className="ml-auto text-sm text-white font-bold">
                Valor de inventario:{" "}
                <span style={{ color: "var(--gold)" }} className="font-black">{money(warehouse.totalValue)}</span>
                <span className="text-gray-500 text-xs ml-2">({warehouse.count} ingredientes)</span>
              </span>
            )}
          </div>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--surf2)", borderBottom: "1px solid var(--border)" }}>
                  {["Ingrediente", "Unidad", "Stock", "Mínimo", "Costo", "Valor"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(warehouse?.ingredients || []).map((g, i) => (
                  <tr key={g.id} style={{
                    borderBottom: "1px solid var(--border)",
                    background: g.lowStock ? "rgba(239,68,68,0.04)" : i % 2 ? "transparent" : "var(--surf)",
                  }}>
                    <td className="px-4 py-3 font-medium text-white">{g.lowStock && <span className="mr-1">⚠️</span>}{g.name}</td>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{g.unit}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: g.lowStock ? "#ef4444" : "#22c55e" }}>{g.stock}</td>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{g.minStock}</td>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{money(g.cost)}</td>
                    <td className="px-4 py-3 font-black" style={{ color: "var(--gold)" }}>{money(g.value)}</td>
                  </tr>
                ))}
                {warehouse && warehouse.ingredients.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-600 text-sm">Bodega vacía</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: Reparto ────────────────────────────────────────────────── */}
      {!loading && tab === "reparto" && (
        <div>
          {!centralLoc && (
            <div className="rounded-2xl border p-5 mb-6 text-sm text-red-400" style={{ borderColor: "var(--border)" }}>
              Asigna primero la Bodega Central en la configuración de arriba.
            </div>
          )}
          <div className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surf)" }}>
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Repartir a</span>
              <select value={repartoDest} onChange={e => loadSuggestion(e.target.value)}
                className="bg-black border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-orange-500">
                <option value="">— sucursal destino —</option>
                {branches.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              {repartoDest && (
                <button onClick={() => loadSuggestion(repartoDest)}
                  className="px-3 py-2 rounded-xl text-xs font-black border border-white/10 text-gray-400 hover:text-white">
                  ↻ Recalcular sugerencia
                </button>
              )}
            </div>

            {repartoDest && suggestion.length === 0 && (
              <p className="text-center text-gray-600 py-6 text-sm">
                Sin sugerencias: ninguna sucursal está bajo mínimo o la Bodega Central no tiene stock.
              </p>
            )}

            {suggestion.length > 0 && (
              <>
                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "var(--surf2)", borderBottom: "1px solid var(--border)" }}>
                        {["Ingrediente", "En sucursal", "Mínimo", "En central", "Repartir"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {suggestion.map((s, i) => (
                        <tr key={s.centralIngredientId} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "transparent" : "var(--surf)" }}>
                          <td className="px-4 py-3 font-medium text-white">{s.name}</td>
                          <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{s.destStock} {s.unit}</td>
                          <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{s.destMinStock}</td>
                          <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{s.centralStock}</td>
                          <td className="px-4 py-3">
                            <input type="number" step="0.001" min="0" max={s.centralStock}
                              value={repartoQty[s.centralIngredientId] ?? ""}
                              onChange={e => setRepartoQty(p => ({ ...p, [s.centralIngredientId]: e.target.value }))}
                              className="w-28 bg-black border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-orange-500" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <textarea value={repartoNotes} onChange={e => setRepartoNotes(e.target.value)}
                  placeholder="Notas del reparto (opcional)" rows={2}
                  className={inputCls + " mt-4 resize-none"} />

                <div className="flex items-center justify-between mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                  <p className="text-sm text-white font-bold">
                    Costo estimado: <span style={{ color: "var(--gold)" }} className="font-black">{money(repartoTotal)}</span>
                  </p>
                  <button onClick={submitReparto} disabled={savingReparto}
                    className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl uppercase tracking-widest text-xs disabled:opacity-50">
                    {savingReparto ? "Guardando…" : "Confirmar reparto"}
                  </button>
                </div>
              </>
            )}
          </div>

          <h3 className="text-sm font-black text-white uppercase tracking-widest mt-8 mb-3">Repartos recientes</h3>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--surf2)", borderBottom: "1px solid var(--border)" }}>
                  {["Fecha", "Desde", "Renglones", "Costo", "Por"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transfers.map((t, i) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "transparent" : "var(--surf)" }}>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{new Date(t.createdAt).toLocaleString("es-MX")}</td>
                    <td className="px-4 py-3 text-white">{t.fromLocation?.name || "—"}</td>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{t.items?.length ?? 0}</td>
                    <td className="px-4 py-3 font-black" style={{ color: "var(--gold)" }}>{money(t.totalCost)}</td>
                    <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{t.createdBy?.name || "—"}</td>
                  </tr>
                ))}
                {transfers.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-600 text-sm">Sin repartos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal revisión IA ───────────────────────────────────────────── */}
      {scanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 overflow-y-auto">
          <div className="w-full max-w-3xl bg-[#111] border border-gray-800 rounded-3xl p-8 my-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">🤖 Revisión de ticket</h2>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">Asocia cada renglón a un ingrediente existente</p>
              </div>
              <button onClick={() => { setScanOpen(false); setScanRows([]); }} className="text-gray-600 hover:text-white text-xl">✕</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    {["Detectado", "Ingrediente", "Cantidad", "Costo total", ""].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scanRows.map((r, idx) => (
                    <tr key={idx} className="border-b border-white/5">
                      <td className="px-3 py-2 text-gray-300">{r.name || "—"}</td>
                      <td className="px-3 py-2">
                        <select value={r.matchedId}
                          onChange={e => setScanRows(p => p.map((x, i) => i === idx ? { ...x, matchedId: e.target.value } : x))}
                          className="bg-black border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm w-full outline-none focus:border-orange-500">
                          <option value="">— omitir —</option>
                          {ingredients.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="0.001" min="0" value={r.quantityFound}
                          onChange={e => setScanRows(p => p.map((x, i) => i === idx ? { ...x, quantityFound: e.target.value } : x))}
                          className="bg-black border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm w-24 outline-none focus:border-orange-500" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="0.01" min="0" value={r.totalCost}
                          onChange={e => setScanRows(p => p.map((x, i) => i === idx ? { ...x, totalCost: e.target.value } : x))}
                          className="bg-black border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm w-24 outline-none focus:border-orange-500" />
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => setScanRows(p => p.filter((_, i) => i !== idx))}
                          className="text-red-500/60 hover:text-red-400 text-xs px-2 py-1 rounded-lg">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {scanRows.length === 0 && <p className="text-center text-gray-600 py-6 text-sm">Sin renglones detectados.</p>}
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-white/10">
              <button onClick={() => { setScanOpen(false); setScanRows([]); }} className="px-5 py-2.5 text-gray-500 font-bold uppercase tracking-widest text-xs">Cancelar</button>
              <button onClick={applyScan} disabled={scanRows.length === 0}
                className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl uppercase tracking-widest text-xs disabled:opacity-50">
                Agregar a la compra
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
