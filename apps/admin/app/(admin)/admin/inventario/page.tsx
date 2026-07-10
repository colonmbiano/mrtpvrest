"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Sparkles, FileDown, FileUp, ShoppingCart, ClipboardList, Factory,
  Plus, Package, TrendingUp, AlertTriangle, Boxes, CheckCircle2, Wallet, X, Trash2, Vault,
} from "lucide-react";
import api from "@/lib/api";
import Link from "next/link";
import ImportTemplateModal from "@/components/ImportTemplateModal";
import {
  PageShell, PageHeader, PageTabs, Segmented, StatTile, Button, useToast, useConfirm,
} from "@/components/ds";
import {
  emptyForm, unitOptionsFor, defaultUnitFor, toBaseQty, stockLevel,
  type Ingredient, type Movement, type Supplier, type IngredientType,
  type IngredientCategory, type SuggestionGroup, type FormState, type ScannedItem,
} from "./_components/shared";
import { IngredientsTab } from "./_components/IngredientsTab";
import { MovementsList } from "./_components/MovementsList";
import { ShoppingList } from "./_components/ShoppingList";
import { AdjustStockModal } from "./_components/AdjustStockModal";
import { ScanReviewModal } from "./_components/ScanReviewModal";
import { IngredientFormModal } from "./_components/IngredientFormModal";

export default function InventarioPage() {
  const toast = useToast();
  const confirm = useConfirm();
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
  const [types, setTypes]             = useState<IngredientType[]>([]);
  const [categories, setCategories]   = useState<IngredientCategory[]>([]);
  const [saving, setSaving]           = useState(false);
  const [adjustModal, setAdjustModal] = useState<Ingredient | null>(null);
  const [adjustQty, setAdjustQty]     = useState("");
  const [adjustType, setAdjustType]   = useState("IN");
  const [adjustUnit, setAdjustUnit]   = useState("kg");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [shoppingList, setShoppingList] = useState<SuggestionGroup[] | null>(null);
  const [shoppingLoading, setShoppingLoading] = useState(false);
  const [search, setSearch]           = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // IA Escaneo
  const [isScanning, setIsScanning] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [isSavingBulk, setIsSavingBulk] = useState(false);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [importOpen, setImportOpen] = useState(false);

  const fetchAll = useCallback(async (_locationId: string) => {
    try {
      const [ing, al, mov, sup, typ, cat] = await Promise.all([
        api.get("/api/inventory/ingredients"),
        api.get("/api/inventory/alerts"),
        api.get("/api/inventory/movements?limit=50"),
        api.get("/api/inventory/suppliers"),
        api.get("/api/recipes/types").catch(() => ({ data: [] })),
        api.get("/api/recipes/categories").catch(() => ({ data: [] })),
      ]);
      setIngredients(ing.data);
      setAlerts(al.data);
      setMovements(mov.data);
      setSuppliers(sup.data);
      setTypes(typ.data || []);
      setCategories(cat.data || []);
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

  // Lista de compras (sugerencias de compra basadas en consumo)
  const fetchShoppingList = useCallback(async () => {
    setShoppingLoading(true);
    try {
      const { data } = await api.get("/api/inventory/purchase-suggestions");
      setShoppingList(data.suggestions || []);
    } catch {
      setShoppingList([]);
    } finally {
      setShoppingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "shopping" && shoppingList === null && activeLocationId) {
      fetchShoppingList();
    }
  }, [tab, shoppingList, activeLocationId, fetchShoppingList]);

  // --- IA: Escaneo de Inventario ---
  async function handleAIScan(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsScanning(true);
    try {
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f) fd.append("images", f);
      }
      const { data } = await api.post("/api/ai/scan-inventory", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const detected = (data.data?.ingredients || []).map((item: { name?: string; totalCost?: number; quantityFound?: number }) => ({
        name: item.name || "",
        totalCost: item.totalCost ?? 0,
        quantityFound: item.quantityFound ?? 1,
        unit: "pz",
      }));
      setScannedItems(detected);
      setIsReviewOpen(true);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Error al procesar tickets con IA");
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
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Error al guardar");
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
      typeId: item.typeId || "",
      categoryId: item.categoryId || "",
      baseUnit: item.baseUnit || "PIECE",
      pesoBruto: item.pesoBruto ?? "",
      pesoNeto: item.pesoNeto ?? "",
      isPackaging: Boolean(item.isPackaging),
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
        // Campos del módulo de costeo
        typeId: form.typeId || null,
        categoryId: form.categoryId || null,
        baseUnit: form.baseUnit,
        pesoBruto: form.pesoBruto !== "" ? Number(form.pesoBruto) : null,
        pesoNeto:  form.pesoNeto  !== "" ? Number(form.pesoNeto)  : null,
        isPackaging: Boolean(form.isPackaging),
      };
      if (editItem) await api.put("/api/inventory/ingredients/" + editItem.id, payload);
      else await api.post("/api/inventory/ingredients", payload);
      setShowForm(false);
      fetchAll(activeLocationId);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Error");
    }
    finally { setSaving(false); }
  }

  async function deleteIngredient(id: string) {
    if (!(await confirm({ title: "¿Eliminar ingrediente?", danger: true, confirmLabel: "Eliminar" }))) return;
    await api.delete("/api/inventory/ingredients/" + id);
    fetchAll(activeLocationId);
  }

  function openAdjust(ing: Ingredient) {
    setAdjustModal(ing);
    setAdjustQty("");
    setAdjustType("IN");
    setAdjustUnit(defaultUnitFor(ing.baseUnit));
    setAdjustReason("");
  }

  async function saveAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustModal) return;
    setAdjustSaving(true);
    try {
      // Convertimos a la unidad base del insumo antes de enviar (el endpoint
      // recibe siempre la unidad base: g/ml/pz).
      await api.post("/api/inventory/movements", {
        ingredientId: adjustModal.id,
        type: adjustType,
        quantity: toBaseQty(Number(adjustQty), adjustUnit, adjustModal.baseUnit),
        reason: adjustReason || undefined,
      });
      setAdjustModal(null);
      fetchAll(activeLocationId);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Error al registrar movimiento");
    } finally {
      setAdjustSaving(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(i => i.id)));
  }
  async function bulkDelete() {
    if (!(await confirm({ title: `¿Eliminar ${selectedIds.size} ingrediente(s)?`, body: "Esta acción no se puede deshacer.", danger: true, confirmLabel: "Eliminar" }))) return;
    await Promise.all([...selectedIds].map(id => api.delete("/api/inventory/ingredients/" + id).catch(() => {})));
    setSelectedIds(new Set()); fetchAll(activeLocationId);
  }

  const filtered = ingredients.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  // Contadores de salud de stock
  const stockCounts = useMemo(() => {
    let suficiente = 0, bajo = 0, critico = 0;
    for (const ing of ingredients) {
      const lvl = stockLevel(ing);
      if (lvl.tone === "ok") suficiente++;
      else if (lvl.tone === "warn") bajo++;
      else critico++;
    }
    return { suficiente, bajo, critico };
  }, [ingredients]);

  // Descarga una plantilla Excel pre-llenada (insumos o recetas) generada por
  // el backend con los datos actuales del restaurante.
  async function downloadTemplate(type: "insumos" | "recetas") {
    try {
      const res = await api.get(`/api/recipes/import/template/${type}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plantilla-${type}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo generar la plantilla. Revisa tu conexión e inténtalo de nuevo.");
    }
  }

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <PageShell>
      <ImportTemplateModal mode="insumos" open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => fetchAll(activeLocationId)} />

      <PageHeader
        eyebrow="Control de stock por sucursal"
        title="Inventario"
        subtitle={`${ingredients.length} insumos · ${alerts.length} en alerta`}
        actions={
          <>
            <ScanButton isScanning={isScanning} onScan={handleAIScan} label="Carga inteligente" />
            <Button icon={Plus} onClick={() => openForm()}>Nuevo insumo</Button>
          </>
        }
      />
      <PageTabs set="inventario" />

      {/* mobile primary actions */}
      <div className="mb-4 flex flex-wrap gap-2 md:hidden">
        <div className="flex-1">
          <ScanButton isScanning={isScanning} onScan={handleAIScan} label="Carga inteligente" full />
        </div>
        <Button icon={Plus} onClick={() => openForm()}>Insumo</Button>
      </div>

      {/* stats de salud de stock */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={Boxes} value={ingredients.length} label="Insumos totales" />
        <StatTile icon={CheckCircle2} value={stockCounts.suficiente} label="Suficiente" />
        <StatTile icon={AlertTriangle} value={stockCounts.bajo} label="Stock bajo" />
        <StatTile icon={TrendingUp} value={stockCounts.critico} label="Crítico" />
      </div>

      {/* atajos a otras secciones */}
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <ShortcutLink href="/admin/inventario/compras" icon={ShoppingCart} label="Compras & Bodega" />
        <ShortcutLink href="/admin/inventario/recetas" icon={ClipboardList} label="Recetas" />
        <ShortcutLink href="/admin/inventario/extras" icon={Plus} label="Extras / Modificadores" />
        <ShortcutLink href="/admin/inventario/proveedores" icon={Factory} label="Proveedores" />
        <ShortcutLink href="/admin/inventario/por-pagar" icon={Wallet} label="Cuentas por pagar" />
        <ShortcutLink href="/admin/inventario/boveda" icon={Vault} label="Bóveda" />
        <button
          type="button"
          onClick={() => downloadTemplate("insumos")}
          title="Descarga un Excel con tus insumos actuales para editarlo y volverlo a subir"
          className="flex min-h-12 items-center justify-center gap-2 rounded-ds-lg px-3 text-[12px] font-bold text-tx-mid"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
        >
          <FileDown size={15} /> Plantilla
        </button>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          title="Sube la plantilla de insumos editada"
          className="flex min-h-12 items-center justify-center gap-2 rounded-ds-lg px-3 text-[12px] font-bold text-tx-mid"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
        >
          <FileUp size={15} /> Subir
        </button>
      </div>

      {/* tabs */}
      <div className="mt-5">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "ingredients", label: "Insumos" },
            { value: "movements", label: "Movimientos" },
            { value: "shopping", label: "Compras" },
          ] as const}
          className="md:max-w-[420px]"
        />
      </div>

      {tab === "ingredients" && (
        <IngredientsTab
          filtered={filtered}
          loading={loading}
          search={search} setSearch={setSearch}
          allSelected={allSelected}
          selectedIds={selectedIds}
          toggleSelect={toggleSelect}
          toggleSelectAll={toggleSelectAll}
          openForm={openForm}
          openAdjust={openAdjust}
          deleteIngredient={deleteIngredient}
        />
      )}

      {tab === "movements" && <MovementsList movements={movements} loading={loading} />}

      {tab === "shopping" && (
        <ShoppingList shoppingList={shoppingList} shoppingLoading={shoppingLoading} onRefresh={fetchShoppingList} />
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-ds-lg px-5 py-3"
          style={{ background: "var(--surf-1)", border: "1px solid var(--brand-primary)", boxShadow: "var(--shadow-lg)" }}>
          <span className="rounded-lg px-2 py-1 font-mono text-[10px] font-black uppercase tracking-widest"
            style={{ background: "var(--accent-soft)", color: "var(--brand-primary)" }}>
            {selectedIds.size} seleccionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <button onClick={bulkDelete}
            className="flex items-center gap-1.5 rounded-ds-md px-3 py-1.5 text-xs font-black"
            style={{ background: "var(--err-soft)", color: "var(--err)", border: "1px solid transparent" }}>
            <Trash2 size={14} /> Eliminar
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            aria-label="Limpiar selección"
            className="grid h-7 w-7 place-items-center rounded-ds-md"
            style={{ background: "var(--surf-2)", color: "var(--tx-mut)" }}>
            <X size={15} />
          </button>
        </div>
      )}

      {adjustModal && (
        <AdjustStockModal
          ing={adjustModal}
          adjustType={adjustType} setAdjustType={setAdjustType}
          adjustQty={adjustQty} setAdjustQty={setAdjustQty}
          adjustUnit={adjustUnit} setAdjustUnit={setAdjustUnit}
          adjustReason={adjustReason} setAdjustReason={setAdjustReason}
          adjustSaving={adjustSaving}
          onClose={() => setAdjustModal(null)}
          onSubmit={saveAdjust}
        />
      )}

      <ScanReviewModal
        open={isReviewOpen}
        scannedItems={scannedItems}
        setScannedItems={setScannedItems}
        isSavingBulk={isSavingBulk}
        onCancel={() => { setIsReviewOpen(false); setScannedItems([]); }}
        onConfirm={handleBulkConfirm}
      />

      <IngredientFormModal
        open={showForm}
        isEditing={!!editItem}
        form={form} setForm={setForm}
        suppliers={suppliers}
        types={types}
        categories={categories}
        saving={saving}
        onClose={() => setShowForm(false)}
        onSubmit={saveIngredient}
      />
    </PageShell>
  );
}

/* ── pequeños helpers de UI locales ────────────────────────────────── */
function ScanButton({ isScanning, onScan, label, full = false }: {
  isScanning: boolean;
  onScan: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
  full?: boolean;
}) {
  return (
    <label
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-ds-md px-4 text-[13px] font-bold transition-transform active:scale-[.98] ${full ? "w-full" : ""}`}
      style={{
        background: isScanning
          ? "var(--warn-soft)"
          : "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))",
        color: isScanning ? "var(--warn)" : "var(--accent-contrast)",
        boxShadow: isScanning ? "none" : "0 6px 18px var(--accent-glow)",
      }}
    >
      <Sparkles size={16} className={isScanning ? "animate-pulse" : ""} />
      {isScanning ? "Procesando…" : label}
      {!isScanning && <input type="file" accept="image/*,application/pdf,.xlsx,.csv" multiple onChange={onScan} className="hidden" />}
    </label>
  );
}

function ShortcutLink({ href, icon: Icon, label }: { href: string; icon: typeof ShoppingCart; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center justify-center gap-2 rounded-ds-lg px-3 text-[12px] font-bold text-tx-mid"
      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
    >
      <Icon size={15} className="text-primary" /> {label}
    </Link>
  );
}
