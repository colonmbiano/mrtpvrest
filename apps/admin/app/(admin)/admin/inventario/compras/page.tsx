"use client";
import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft, BookOpen, Truck, Bot, Plus, Trash2,
  X, RotateCw, ScanLine, AlertTriangle, PackageOpen,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, PrimaryBtn, Segmented, Toggle, Pill,
  EmptyState, money,
} from "@/components/warmtech";

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

const norm = (s: string) => s.trim().toLowerCase();

const inputCls = "min-h-11 w-full rounded-xl px-3 text-sm text-tx outline-none transition-colors focus:border-primary";
const inputStyle = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;
const cellCls = "rounded-lg px-3 py-2 text-sm text-tx outline-none transition-colors focus:border-primary";
const cellStyle = { background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;

type TabKey = "compra" | "historial" | "bodega" | "reparto";

export default function ComprasPage() {
  const [tab, setTab] = useState<TabKey>("compra");
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

  const TABS: { value: TabKey; label: string }[] = [
    { value: "compra", label: "Compra" },
    { value: "historial", label: "Historial" },
    { value: "bodega", label: "Bodega" },
    ...(centralEnabled ? [{ value: "reparto" as const, label: "Reparto" }] : []),
  ];

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Inventario · Abastecimiento"
        title="Compras & Bodega"
        subtitle="Captura de compras, valor de inventario y reparto a sucursales"
        actions={
          <PrimaryBtn ghost full={false} icon={ChevronLeft} href="/admin/inventario">
            Inventario
          </PrimaryBtn>
        }
      />

      {/* navegación en mobile */}
      <a
        href="/admin/inventario"
        className="mb-3 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-tx-mut md:hidden"
      >
        <ChevronLeft size={15} /> Inventario
      </a>

      {/* ── Configuración Bodega Central ─────────────────────────────────── */}
      <WtCard className="mb-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-extrabold text-tx-hi">Modelo de Bodega Central</p>
            <p className="mt-1 max-w-xl text-xs text-tx-mut">
              Apagado: cada compra entra directo a la bodega de la sucursal.
              Encendido: las compras entran a la Bodega Central y luego se reparten a las sucursales.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Pill tone={centralEnabled ? "ok" : "neutral"}>{centralEnabled ? "Activado" : "Desactivado"}</Pill>
            <Toggle checked={centralEnabled} onChange={(n) => !savingCfg && toggleCentral(n)} label="Bodega central" />
          </div>
        </div>
        {centralEnabled && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
            <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Sucursal como Bodega Central</span>
            <select
              value={centralLoc?.id || ""}
              onChange={e => e.target.value && setAsCentral(e.target.value)}
              disabled={savingCfg}
              className={cellCls}
              style={cellStyle}
            >
              <option value="">— elegir —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {!centralLoc && (
              <span className="flex items-center gap-1 text-xs font-bold text-err">
                <AlertTriangle size={13} /> Falta asignar la Bodega Central
              </span>
            )}
          </div>
        )}
      </WtCard>

      {/* Tabs */}
      <Segmented value={tab} onChange={setTab} options={TABS} className="mb-5 md:max-w-[520px]" />

      {loading && <p className="text-sm text-tx-mut">Cargando…</p>}

      {/* ── TAB: Registrar compra ───────────────────────────────────────── */}
      {!loading && tab === "compra" && (
        <WtCard className="p-4 md:p-6">
          <div className="mb-5 grid gap-4 md:grid-cols-3">
            <Field label="Proveedor">
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">— selecciona —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label={`Destino${centralEnabled && centralLoc ? " (default: Bodega Central)" : ""}`}>
              <select value={destLocationId} onChange={e => setDestLocationId(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">— selecciona —</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}{l.isCentralWarehouse ? " · Bodega Central" : ""}</option>
                ))}
              </select>
            </Field>
            <Field label="Método de pago">
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inputCls} style={inputStyle}>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[.14em] text-primary">Líneas de compra</p>
            <label
              className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] px-3 text-xs font-bold ${isScanning ? "animate-pulse" : ""}`}
              style={{
                background: isScanning ? "var(--warn-soft)" : "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))",
                color: isScanning ? "var(--warn)" : "#fffaf4",
              }}
            >
              {isScanning ? <Bot size={15} /> : <ScanLine size={15} />}
              {isScanning ? "Procesando…" : "Escanear ticket (IA)"}
              {!isScanning && <input type="file" accept="image/*,application/pdf,.xlsx,.csv" multiple onChange={handleScan} className="hidden" />}
            </label>
          </div>

          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 items-center gap-2">
                <select value={l.ingredientId} onChange={e => updateLine(idx, { ingredientId: e.target.value })}
                  className={`${cellCls} col-span-12 sm:col-span-6`} style={cellStyle}>
                  <option value="">— ingrediente —</option>
                  {ingredients.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <input type="number" step="0.001" min="0" placeholder="Cantidad" value={l.qty}
                  onChange={e => updateLine(idx, { qty: e.target.value })}
                  className={`${cellCls} col-span-5 tabular-nums sm:col-span-2`} style={cellStyle} />
                <input type="number" step="0.01" min="0" placeholder="$ unitario" value={l.unitPrice}
                  onChange={e => updateLine(idx, { unitPrice: e.target.value })}
                  className={`${cellCls} col-span-5 tabular-nums sm:col-span-2`} style={cellStyle} />
                <span className="col-span-1 text-right font-mono text-xs tabular-nums text-primary sm:col-span-1">
                  {money((Number(l.qty) || 0) * (Number(l.unitPrice) || 0))}
                </span>
                <button onClick={() => removeLine(idx)} aria-label="Quitar línea"
                  className="col-span-1 grid h-9 w-9 place-items-center justify-self-end rounded-lg"
                  style={{ background: "var(--err-soft)", color: "var(--err)" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <button onClick={addLine}
            className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-3 text-xs font-bold text-tx"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
            <Plus size={14} strokeWidth={2} /> Agregar línea
          </button>

          <textarea value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)}
            placeholder="Notas (opcional)" rows={2}
            className="mt-4 w-full resize-none rounded-xl px-3 py-2.5 text-sm text-tx outline-none focus:border-primary"
            style={inputStyle} />

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
            <p className="text-sm font-bold text-tx">
              Total: <span className="font-display font-extrabold text-primary">{money(purchaseTotal)}</span>
            </p>
            <PrimaryBtn full={false} onClick={submitPurchase} disabled={savingPurchase}>
              {savingPurchase ? "Guardando…" : "Registrar compra"}
            </PrimaryBtn>
          </div>
        </WtCard>
      )}

      {/* ── TAB: Historial ──────────────────────────────────────────────── */}
      {!loading && tab === "historial" && (
        history.length === 0 ? (
          <EmptyState icon={BookOpen} title="Sin compras registradas" hint="Las órdenes de compra aparecerán aquí." />
        ) : (
          <>
            {/* Desktop: tabla */}
            <WtCard className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--bd-1)" }}>
                    {["Folio", "Fecha", "Proveedor", "Destino", "Pago", "Renglones", "Total"].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-tx-mut">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((po) => (
                    <tr key={po.id} style={{ borderBottom: "1px solid var(--bd-1)" }}>
                      <td className="px-4 py-3 font-bold text-tx-hi">{po.poNumber}</td>
                      <td className="px-4 py-3 text-tx-mut">{new Date(po.receivedAt || po.createdAt).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}</td>
                      <td className="px-4 py-3 text-tx-mut">{po.supplier?.name || "—"}</td>
                      <td className="px-4 py-3 text-tx-mut">{po.location?.name || "—"}</td>
                      <td className="px-4 py-3 text-xs text-tx-mut">{po.paymentMethod}</td>
                      <td className="px-4 py-3 text-tx-mut">{po.items?.length ?? 0}</td>
                      <td className="px-4 py-3 font-display font-extrabold text-primary">{money(po.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </WtCard>
            {/* Mobile: cards */}
            <div className="space-y-3 md:hidden">
              {history.map((po) => (
                <WtCard key={po.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm font-extrabold text-tx-hi">{po.poNumber}</span>
                    <span className="font-display text-base font-extrabold text-primary">{money(po.totalAmount)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-tx-mut">
                    {new Date(po.receivedAt || po.createdAt).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })} · {po.supplier?.name || "—"} · {po.location?.name || "—"}
                  </div>
                  <div className="mt-1 text-[11px] text-tx-mut">{po.paymentMethod} · {po.items?.length ?? 0} renglones</div>
                </WtCard>
              ))}
            </div>
          </>
        )
      )}

      {/* ── TAB: Bodega ─────────────────────────────────────────────────── */}
      {!loading && tab === "bodega" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Sucursal</span>
            <select value={whLocationId} onChange={e => setWhLocationId(e.target.value)} className={cellCls} style={cellStyle}>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}{l.isCentralWarehouse ? " · Bodega Central" : ""}</option>
              ))}
            </select>
            {warehouse && (
              <span className="ml-auto text-sm font-bold text-tx">
                Valor de inventario:{" "}
                <span className="font-display font-extrabold text-primary">{money(warehouse.totalValue)}</span>
                <span className="ml-2 text-xs text-tx-mut">({warehouse.count} ingredientes)</span>
              </span>
            )}
          </div>

          {warehouse && warehouse.ingredients.length === 0 ? (
            <EmptyState icon={PackageOpen} title="Bodega vacía" hint="No hay ingredientes con stock en esta sucursal." />
          ) : (
            <>
              {/* Desktop: tabla */}
              <WtCard className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--bd-1)" }}>
                      {["Ingrediente", "Unidad", "Stock", "Mínimo", "Costo", "Valor"].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-tx-mut">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(warehouse?.ingredients || []).map((g) => (
                      <tr key={g.id} style={{
                        borderBottom: "1px solid var(--bd-1)",
                        background: g.lowStock ? "var(--err-soft)" : undefined,
                      }}>
                        <td className="px-4 py-3 font-medium text-tx-hi">
                          {g.lowStock && <AlertTriangle size={13} className="mr-1 inline text-err" />}{g.name}
                        </td>
                        <td className="px-4 py-3 text-tx-mut">{g.unit}</td>
                        <td className="px-4 py-3 font-bold" style={{ color: g.lowStock ? "var(--err)" : "var(--ok)" }}>{g.stock}</td>
                        <td className="px-4 py-3 text-tx-mut">{g.minStock}</td>
                        <td className="px-4 py-3 text-tx-mut">{money(g.cost)}</td>
                        <td className="px-4 py-3 font-display font-extrabold text-primary">{money(g.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </WtCard>
              {/* Mobile: cards */}
              <div className="space-y-3 md:hidden">
                {(warehouse?.ingredients || []).map((g) => (
                  <WtCard key={g.id} className="p-4" style={g.lowStock ? { borderColor: "var(--err)" } : undefined}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 font-semibold text-tx-hi">
                        {g.lowStock && <AlertTriangle size={14} className="shrink-0 text-err" />}
                        <span className="truncate">{g.name}</span>
                      </span>
                      <span className="font-display font-extrabold text-primary">{money(g.value)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-tx-mut">
                      <span>Stock: <strong style={{ color: g.lowStock ? "var(--err)" : "var(--ok)" }}>{g.stock} {g.unit}</strong></span>
                      <span>Mín: {g.minStock}</span>
                      <span>Costo: {money(g.cost)}</span>
                    </div>
                  </WtCard>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: Reparto ────────────────────────────────────────────────── */}
      {!loading && tab === "reparto" && (
        <div className="space-y-6">
          {!centralLoc && (
            <WtCard className="p-4 text-sm text-err">
              <span className="flex items-center gap-2">
                <AlertTriangle size={15} /> Asigna primero la Bodega Central en la configuración de arriba.
              </span>
            </WtCard>
          )}
          <WtCard className="p-4 md:p-6">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Repartir a</span>
              <select value={repartoDest} onChange={e => loadSuggestion(e.target.value)} className={cellCls} style={cellStyle}>
                <option value="">— sucursal destino —</option>
                {branches.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              {repartoDest && (
                <button onClick={() => loadSuggestion(repartoDest)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-3 text-xs font-bold text-tx"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                  <RotateCw size={14} /> Recalcular
                </button>
              )}
            </div>

            {repartoDest && suggestion.length === 0 && (
              <p className="py-6 text-center text-sm text-tx-mut">
                Sin sugerencias: ninguna sucursal está bajo mínimo o la Bodega Central no tiene stock.
              </p>
            )}

            {suggestion.length > 0 && (
              <>
                {/* Desktop: tabla */}
                <div className="hidden overflow-x-auto rounded-2xl md:block" style={{ border: "1px solid var(--bd-1)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--bd-1)", background: "var(--surf-2)" }}>
                        {["Ingrediente", "En sucursal", "Mínimo", "En central", "Repartir"].map(h => (
                          <th key={h} className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-tx-mut">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {suggestion.map((s) => (
                        <tr key={s.centralIngredientId} style={{ borderBottom: "1px solid var(--bd-1)" }}>
                          <td className="px-4 py-3 font-medium text-tx-hi">{s.name}</td>
                          <td className="px-4 py-3 text-tx-mut">{s.destStock} {s.unit}</td>
                          <td className="px-4 py-3 text-tx-mut">{s.destMinStock}</td>
                          <td className="px-4 py-3 text-tx-mut">{s.centralStock}</td>
                          <td className="px-4 py-3">
                            <input type="number" step="0.001" min="0" max={s.centralStock}
                              value={repartoQty[s.centralIngredientId] ?? ""}
                              onChange={e => setRepartoQty(p => ({ ...p, [s.centralIngredientId]: e.target.value }))}
                              className={`${cellCls} w-28 tabular-nums`} style={cellStyle} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile: cards */}
                <div className="space-y-3 md:hidden">
                  {suggestion.map((s) => (
                    <div key={s.centralIngredientId} className="rounded-2xl p-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                      <div className="mb-2 font-semibold text-tx-hi">{s.name}</div>
                      <div className="mb-2 flex flex-wrap gap-x-3 text-[11px] text-tx-mut">
                        <span>En sucursal: {s.destStock} {s.unit}</span>
                        <span>Mín: {s.destMinStock}</span>
                        <span>En central: {s.centralStock}</span>
                      </div>
                      <label className="flex items-center gap-2">
                        <span className="text-[11px] text-tx-mut">Repartir</span>
                        <input type="number" step="0.001" min="0" max={s.centralStock}
                          value={repartoQty[s.centralIngredientId] ?? ""}
                          onChange={e => setRepartoQty(p => ({ ...p, [s.centralIngredientId]: e.target.value }))}
                          className={`${cellCls} flex-1 tabular-nums`} style={cellStyle} />
                      </label>
                    </div>
                  ))}
                </div>

                <textarea value={repartoNotes} onChange={e => setRepartoNotes(e.target.value)}
                  placeholder="Notas del reparto (opcional)" rows={2}
                  className="mt-4 w-full resize-none rounded-xl px-3 py-2.5 text-sm text-tx outline-none focus:border-primary"
                  style={inputStyle} />

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
                  <p className="text-sm font-bold text-tx">
                    Costo estimado: <span className="font-display font-extrabold text-primary">{money(repartoTotal)}</span>
                  </p>
                  <PrimaryBtn full={false} onClick={submitReparto} disabled={savingReparto}>
                    {savingReparto ? "Guardando…" : "Confirmar reparto"}
                  </PrimaryBtn>
                </div>
              </>
            )}
          </WtCard>

          <div>
            <h3 className="mb-3 font-display text-base font-extrabold text-tx-hi md:text-xl">Repartos recientes</h3>
            {transfers.length === 0 ? (
              <EmptyState icon={Truck} title="Sin repartos" hint="Los repartos a sucursales aparecerán aquí." />
            ) : (
              <>
                {/* Desktop: tabla */}
                <WtCard className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--bd-1)" }}>
                        {["Fecha", "Desde", "Renglones", "Costo", "Por"].map(h => (
                          <th key={h} className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-tx-mut">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.map((t) => (
                        <tr key={t.id} style={{ borderBottom: "1px solid var(--bd-1)" }}>
                          <td className="px-4 py-3 text-tx-mut">{new Date(t.createdAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}</td>
                          <td className="px-4 py-3 text-tx-hi">{t.fromLocation?.name || "—"}</td>
                          <td className="px-4 py-3 text-tx-mut">{t.items?.length ?? 0}</td>
                          <td className="px-4 py-3 font-display font-extrabold text-primary">{money(t.totalCost)}</td>
                          <td className="px-4 py-3 text-tx-mut">{t.createdBy?.name || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </WtCard>
                {/* Mobile: cards */}
                <div className="space-y-3 md:hidden">
                  {transfers.map((t) => (
                    <WtCard key={t.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-tx-hi">{t.fromLocation?.name || "—"}</span>
                        <span className="font-display font-extrabold text-primary">{money(t.totalCost)}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-tx-mut">
                        {new Date(t.createdAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })} · {t.items?.length ?? 0} renglones · {t.createdBy?.name || "—"}
                      </div>
                    </WtCard>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal revisión IA ───────────────────────────────────────────── */}
      {scanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,.85)" }}>
          <WtCard className="my-4 w-full max-w-3xl p-5 md:p-7">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl text-primary" style={{ background: "var(--iris-soft)" }}>
                  <Bot size={20} />
                </span>
                <div>
                  <h2 className="font-display text-xl font-extrabold text-tx-hi">Revisión de ticket</h2>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-tx-mut">Asocia cada renglón a un ingrediente existente</p>
                </div>
              </div>
              <button onClick={() => { setScanOpen(false); setScanRows([]); }} aria-label="Cerrar"
                className="grid h-9 w-9 place-items-center rounded-lg text-tx-mut" style={{ background: "var(--surf-2)" }}>
                <X size={16} />
              </button>
            </div>

            {scanRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-tx-mut">Sin renglones detectados.</p>
            ) : (
              <div className="space-y-2">
                {scanRows.map((r, idx) => (
                  <div key={idx} className="grid items-center gap-2 rounded-xl p-2"
                    style={{ background: "var(--surf-2)", gridTemplateColumns: "1fr 1fr 70px 80px 36px" }}>
                    <span className="truncate text-xs text-tx-mut" title={r.name || "—"}>{r.name || "—"}</span>
                    <select value={r.matchedId}
                      onChange={e => setScanRows(p => p.map((x, i) => i === idx ? { ...x, matchedId: e.target.value } : x))}
                      className={cellCls} style={cellStyle}>
                      <option value="">— omitir —</option>
                      {ingredients.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <input type="number" step="0.001" min="0" value={r.quantityFound}
                      onChange={e => setScanRows(p => p.map((x, i) => i === idx ? { ...x, quantityFound: e.target.value } : x))}
                      className={`${cellCls} tabular-nums`} style={cellStyle} />
                    <input type="number" step="0.01" min="0" value={r.totalCost}
                      onChange={e => setScanRows(p => p.map((x, i) => i === idx ? { ...x, totalCost: e.target.value } : x))}
                      className={`${cellCls} tabular-nums`} style={cellStyle} />
                    <button onClick={() => setScanRows(p => p.filter((_, i) => i !== idx))} aria-label="Quitar"
                      className="grid h-9 w-9 place-items-center rounded-lg"
                      style={{ background: "var(--err-soft)", color: "var(--err)" }}>
                      <X size={14} strokeWidth={2.4} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-2 border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
              <PrimaryBtn ghost full={false} onClick={() => { setScanOpen(false); setScanRows([]); }}>Cancelar</PrimaryBtn>
              <PrimaryBtn full={false} onClick={applyScan} disabled={scanRows.length === 0}>Agregar a la compra</PrimaryBtn>
            </div>
          </WtCard>
        </div>
      )}
    </WtScreen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">{label}</label>
      {children}
    </div>
  );
}
