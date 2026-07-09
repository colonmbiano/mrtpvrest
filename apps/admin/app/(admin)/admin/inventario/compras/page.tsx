"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, PageTabs, Segmented, LoadingState, useToast,
} from "@/components/ds";
import {
  norm,
  type LocationRow, type Supplier, type LookupIngredient, type PurchaseLine,
  type PurchaseOrder, type WarehouseResp, type SuggestionRow, type TransferRow,
  type ScanRow, type TabKey,
} from "./_components/shared";
import { ComprasConfig } from "./_components/ComprasConfig";
import { PurchaseTab } from "./_components/PurchaseTab";
import { HistoryTab } from "./_components/HistoryTab";
import { WarehouseTab } from "./_components/WarehouseTab";
import { RepartoTab } from "./_components/RepartoTab";
import { ScanReviewModal } from "./_components/ScanReviewModal";

export default function ComprasPage() {
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>("compra");
  const [loading, setLoading] = useState(true);

  // Config + sucursales
  const [centralEnabled, setCentralEnabled] = useState(false);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [savingCfg, setSavingCfg] = useState(false);
  const [blockStock, setBlockStock] = useState(false);
  const [packingStage, setPackingStage] = useState(false);
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
      setBlockStock(Boolean(cfg.data?.blockOnInsufficientStock));
      setPackingStage(Boolean(cfg.data?.hasPackingStage));
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
      toast.error(e.response?.data?.error || "Error al guardar configuración");
    } finally { setSavingCfg(false); }
  }

  // ── Config: bloquear venta sin stock suficiente ────────────────────────
  async function toggleBlockStock(next: boolean) {
    setSavingCfg(true);
    try {
      await api.put("/api/admin/config", { blockOnInsufficientStock: next });
      setBlockStock(next);
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Error al guardar configuración");
    } finally { setSavingCfg(false); }
  }

  // ── Config: etapa de empaque (PACKING + checklist en KDS) ──────────────
  async function togglePackingStage(next: boolean) {
    setSavingCfg(true);
    try {
      await api.put("/api/admin/config", { hasPackingStage: next });
      setPackingStage(next);
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Error al guardar configuración");
    } finally { setSavingCfg(false); }
  }

  async function setAsCentral(locationId: string) {
    setSavingCfg(true);
    try {
      await api.put(`/api/admin/locations/${locationId}`, { isCentralWarehouse: true });
      const locs = await api.get("/api/admin/locations");
      setLocations(locs.data || []);
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Error al asignar bodega central");
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
    if (!supplierId) { toast.error("Selecciona un proveedor"); return; }
    if (!destLocationId) { toast.error("Selecciona el destino"); return; }
    if (items.length === 0) { toast.error("Agrega al menos una línea válida"); return; }
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
      toast.success("Compra registrada");
      api.get("/api/purchases").then(r => setHistory(r.data || [])).catch(() => {});
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Error al registrar la compra");
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
      toast.error(err.response?.data?.error || "Error al escanear el ticket con IA");
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
    if (newLines.length === 0) { toast.error("Asocia al menos un renglón a un ingrediente existente"); return; }
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
      toast.error(e.response?.data?.error || "Error al calcular la sugerencia");
    }
  }

  const repartoTotal = suggestion.reduce((s, r) => {
    const qty = Number(repartoQty[r.centralIngredientId]) || 0;
    const unit = r.suggestedQty > 0 ? r.estimatedCost / r.suggestedQty : 0;
    return s + qty * unit;
  }, 0);

  async function submitReparto() {
    if (!repartoDest) { toast.error("Selecciona la sucursal destino"); return; }
    const items = suggestion
      .map(r => ({ ingredientId: r.centralIngredientId, toLocationId: repartoDest, qty: Number(repartoQty[r.centralIngredientId]) || 0 }))
      .filter(i => i.qty > 0);
    if (items.length === 0) { toast.error("No hay cantidades para repartir"); return; }
    setSavingReparto(true);
    try {
      await api.post("/api/transfers", { items, notes: repartoNotes || undefined });
      toast.success("Reparto registrado");
      setSuggestion([]);
      setRepartoQty({});
      setRepartoNotes("");
      api.get("/api/transfers").then(r => setTransfers(r.data || [])).catch(() => {});
    } catch (e: any) {
      toast.error(e.response?.data?.error || "Error al registrar el reparto");
    } finally { setSavingReparto(false); }
  }

  const TABS: { value: TabKey; label: string }[] = [
    { value: "compra", label: "Compra" },
    { value: "historial", label: "Historial" },
    { value: "bodega", label: "Bodega" },
    ...(centralEnabled ? [{ value: "reparto" as const, label: "Reparto" }] : []),
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Inventario · Abastecimiento"
        title="Compras & Bodega"
        subtitle="Captura de compras, valor de inventario y reparto a sucursales"
      />
      <PageTabs set="inventario" />

      <ComprasConfig
        blockStock={blockStock}
        packingStage={packingStage}
        centralEnabled={centralEnabled}
        savingCfg={savingCfg}
        locations={locations}
        centralLoc={centralLoc}
        onToggleBlockStock={toggleBlockStock}
        onTogglePackingStage={togglePackingStage}
        onToggleCentral={toggleCentral}
        onSetAsCentral={setAsCentral}
      />

      {/* Tabs internos de la página */}
      <Segmented value={tab} onChange={setTab} options={TABS} className="mb-5 md:max-w-[520px]" />

      {loading ? (
        <LoadingState label="Cargando…" />
      ) : (
        <>
          {tab === "compra" && (
            <PurchaseTab
              suppliers={suppliers}
              locations={locations}
              ingredients={ingredients}
              centralEnabled={centralEnabled}
              centralLoc={centralLoc}
              supplierId={supplierId} setSupplierId={setSupplierId}
              destLocationId={destLocationId} setDestLocationId={setDestLocationId}
              paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
              lines={lines} updateLine={updateLine} addLine={addLine} removeLine={removeLine}
              purchaseNotes={purchaseNotes} setPurchaseNotes={setPurchaseNotes}
              purchaseTotal={purchaseTotal}
              savingPurchase={savingPurchase} onSubmit={submitPurchase}
              isScanning={isScanning} onScan={handleScan}
            />
          )}

          {tab === "historial" && <HistoryTab history={history} />}

          {tab === "bodega" && (
            <WarehouseTab
              locations={locations}
              whLocationId={whLocationId}
              setWhLocationId={setWhLocationId}
              warehouse={warehouse}
            />
          )}

          {tab === "reparto" && (
            <RepartoTab
              centralLoc={centralLoc}
              branches={branches}
              repartoDest={repartoDest}
              onLoadSuggestion={loadSuggestion}
              suggestion={suggestion}
              repartoQty={repartoQty}
              setRepartoQty={setRepartoQty}
              repartoNotes={repartoNotes}
              setRepartoNotes={setRepartoNotes}
              repartoTotal={repartoTotal}
              savingReparto={savingReparto}
              onSubmit={submitReparto}
              transfers={transfers}
            />
          )}
        </>
      )}

      {/* Modal revisión IA */}
      <ScanReviewModal
        open={scanOpen}
        rows={scanRows}
        setRows={setScanRows}
        ingredients={ingredients}
        onCancel={() => { setScanOpen(false); setScanRows([]); }}
        onApply={applyScan}
      />
    </PageShell>
  );
}
