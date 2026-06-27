"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Sparkles, FileDown, FileUp, ShoppingCart, ClipboardList, Factory,
  Plus, Search, Package, TrendingUp, AlertTriangle, X, Pencil, Trash2,
  Boxes, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, Check,
  CheckCircle2, MessageCircle, RotateCw,
} from "lucide-react";
import api from "@/lib/api";
import Link from "next/link";
import ImportTemplateModal from "@/components/ImportTemplateModal";
import {
  WtScreen, PageHeader, WtCard, StatTile, Pill, Segmented, PrimaryBtn,
  ProgressBar, SectionLabel, EmptyState, IconBadge, money, type Tone,
} from "@/components/warmtech";

interface Supplier { id: string; name: string; phone?: string; }
interface IngredientType { id: string; name: string; }
interface IngredientCategory { id: string; name: string; color?: string | null; }
interface Ingredient {
  id: string; name: string; unit: string; stock: number;
  minStock: number; cost: number; lowStock?: boolean;
  supplierId?: string; supplier?: Supplier;
  purchaseUnit?: string; purchaseCost?: number; conversionFactor?: number;
  // Nuevos campos del módulo costeo
  typeId?: string | null; type?: IngredientType | null;
  categoryId?: string | null; category?: IngredientCategory | null;
  baseUnit?: "GRAM" | "ML" | "PIECE";
  pesoBruto?: number | null; pesoNeto?: number | null;
  isPackaging?: boolean;
}
interface Movement {
  id: string; createdAt: string; type: string; quantity: number;
  reason?: string; ingredient?: { name: string; unit: string; };
}
interface SuggestionItem {
  ingredient: { id: string; name: string; stock: number; minStock: number; unit: string; baseUnit?: string; };
  supplier: { id: string; name: string; phone?: string; leadTimeDays?: number; minOrderAmount?: number; } | null;
  dailyAvgConsumption: number;
  daysOfStock: number | null;
  leadTimeDays: number;
  urgency: "URGENTE" | "PRONTO";
  qtySuggestedBase: number;
  qtySuggestedPurchase: number;
  purchaseUnit?: string;
  unitPrice: number;
  lineTotal: number;
}
interface SuggestionGroup {
  supplier: SuggestionItem["supplier"];
  items: SuggestionItem[];
  urgentCount: number;
  totalAmount: number;
  belowMinOrder?: boolean;
}
type FormState = {
  name: string; unit: string; stock: number | string; minStock: number | string;
  cost: number | string; supplierId: string;
  purchaseUnit: string; purchaseCost: number | string; conversionFactor: number | string;
  // Nuevos
  typeId: string; categoryId: string;
  baseUnit: "GRAM" | "ML" | "PIECE";
  pesoBruto: number | string; pesoNeto: number | string;
  isPackaging: boolean;
};

/* ── helpers de stock ──────────────────────────────────────────────── */
type StockLevel = { tone: Tone; label: string; pct: number };
function stockLevel(ing: Ingredient): StockLevel {
  const min = Number(ing.minStock) || 0;
  const stock = Number(ing.stock) || 0;
  // Referencia "lleno" = 2× el mínimo (heurística visual). Si no hay mínimo,
  // tratamos cualquier stock > 0 como suficiente.
  const target = min > 0 ? min * 2 : Math.max(stock, 1);
  const pct = Math.round((stock / target) * 100);
  if (min > 0 && stock <= min * 0.5) return { tone: "err", label: "Crítico", pct };
  if (ing.lowStock || (min > 0 && stock <= min)) return { tone: "warn", label: "Bajo", pct };
  return { tone: "ok", label: "Suficiente", pct };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

type MovMeta = { label: string; icon: typeof ArrowDownToLine; tone: Tone };
const MOV_META: Record<string, MovMeta> = {
  IN:     { label: "Entrada", icon: ArrowDownToLine, tone: "ok" },
  OUT:    { label: "Salida",  icon: ArrowUpFromLine, tone: "err" },
  ADJUST: { label: "Ajuste",  icon: SlidersHorizontal, tone: "info" },
};
const movMeta = (type: string): MovMeta => MOV_META[type] ?? MOV_META.OUT!;

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
  const [scannedItems, setScannedItems] = useState<{ name: string; totalCost: number | string; quantityFound: number | string; unit: string; }[]>([]);
  const [isSavingBulk, setIsSavingBulk] = useState(false);

  const emptyForm: FormState = {
    name:"", unit:"pz", stock:0, minStock:0, cost:0, supplierId:"",
    purchaseUnit:"", purchaseCost:"", conversionFactor:1,
    typeId:"", categoryId:"", baseUnit:"PIECE",
    pesoBruto:"", pesoNeto:"", isPackaging:false,
  };
  const [form, setForm] = useState<FormState>(emptyForm);

  const UNITS = ["pz","kg","g","l","ml","bolsa","lata","caja","sobre","rollo"];

  // Conversión de la unidad de captura → unidad base del insumo (lo que guarda
  // el stock). El insumo se compra en kg/L pero el inventario vive en g/ml; sin
  // esto, teclear "100" sumaba 100 g en vez de 100 kg.
  const UNIT_FAMILIES = {
    GRAM:  [{ value: "kg", label: "kg", factor: 1000 }, { value: "g", label: "g", factor: 1 }],
    ML:    [{ value: "L", label: "L", factor: 1000 }, { value: "ml", label: "ml", factor: 1 }],
    PIECE: [{ value: "pz", label: "pz", factor: 1 }],
  };
  const unitOptionsFor = (baseUnit?: string) =>
    UNIT_FAMILIES[(baseUnit as keyof typeof UNIT_FAMILIES)] ?? UNIT_FAMILIES.PIECE;
  const defaultUnitFor = (baseUnit?: string) => (baseUnit === "GRAM" ? "kg" : baseUnit === "ML" ? "L" : "pz");
  const baseUnitLabel = (baseUnit?: string) => (baseUnit === "GRAM" ? "g" : baseUnit === "ML" ? "ml" : "pz");
  const toBaseQty = (qty: number, unit: string, baseUnit?: string) => {
    const o = unitOptionsFor(baseUnit).find((u) => u.value === unit);
    return qty * (o?.factor ?? 1);
  };

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
      alert(err.response?.data?.error || "Error al procesar tickets con IA");
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
      alert(err.response?.data?.error || "Error");
    }
    finally { setSaving(false); }
  }

  async function deleteIngredient(id: string) {
    if (!confirm("¿Eliminar ingrediente?")) return;
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
      alert(err.response?.data?.error || "Error al registrar movimiento");
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
    if (!confirm(`¿Eliminar ${selectedIds.size} ingrediente(s)? Esta acción no se puede deshacer.`)) return;
    await Promise.all([...selectedIds].map(id => api.delete("/api/inventory/ingredients/" + id).catch(() => {})));
    setSelectedIds(new Set()); fetchAll(activeLocationId);
  }

  const [importOpen, setImportOpen] = useState(false);

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
      alert("No se pudo generar la plantilla. Revisa tu conexión e inténtalo de nuevo.");
    }
  }

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <WtScreen>
      <ImportTemplateModal mode="insumos" open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => fetchAll(activeLocationId)} />

      <PageHeader
        eyebrow="Control de stock por sucursal"
        title="Inventario"
        subtitle={`${ingredients.length} insumos · ${alerts.length} en alerta`}
        actions={
          <>
            <label
              className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-[13px] px-4 text-[13px] font-bold text-white transition-transform active:scale-[.98]"
              style={{
                background: isScanning
                  ? "var(--warn-soft)"
                  : "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))",
                color: isScanning ? "var(--warn)" : "#fffaf4",
                boxShadow: isScanning ? "none" : "0 6px 18px var(--iris-glow)",
              }}
            >
              <Sparkles size={16} className={isScanning ? "animate-pulse" : ""} />
              {isScanning ? "Procesando…" : "Carga inteligente"}
              {!isScanning && <input type="file" accept="image/*,application/pdf,.xlsx,.csv" multiple onChange={handleAIScan} className="hidden" />}
            </label>
            <PrimaryBtn full={false} icon={Plus} onClick={() => openForm()}>
              Nuevo insumo
            </PrimaryBtn>
          </>
        }
      />

      {/* mobile primary actions */}
      <div className="mb-4 flex flex-wrap gap-2 md:hidden">
        <label
          className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[13px] px-4 text-[13px] font-bold"
          style={{
            background: isScanning
              ? "var(--warn-soft)"
              : "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))",
            color: isScanning ? "var(--warn)" : "#fffaf4",
            boxShadow: isScanning ? "none" : "0 6px 18px var(--iris-glow)",
          }}
        >
          <Sparkles size={16} className={isScanning ? "animate-pulse" : ""} />
          {isScanning ? "Procesando…" : "Carga inteligente"}
          {!isScanning && <input type="file" accept="image/*,application/pdf,.xlsx,.csv" multiple onChange={handleAIScan} className="hidden" />}
        </label>
        <PrimaryBtn full={false} icon={Plus} onClick={() => openForm()}>
          Insumo
        </PrimaryBtn>
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
        <button
          type="button"
          onClick={() => downloadTemplate("insumos")}
          title="Descarga un Excel con tus insumos actuales para editarlo y volverlo a subir"
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl px-3 text-[12px] font-bold text-tx-mid"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
        >
          <FileDown size={15} /> Plantilla
        </button>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          title="Sube la plantilla de insumos editada"
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl px-3 text-[12px] font-bold text-tx-mid"
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

      {/* ── TAB: INSUMOS ─────────────────────────────────────────────── */}
      {tab === "ingredients" && (
        <div className="mt-4">
          <WtCard className="mb-3 flex items-center gap-2 p-2.5">
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx-mut" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar insumo…"
                className="min-h-11 w-full rounded-xl pl-9 pr-3 text-sm outline-none"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
              />
            </div>
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="hidden min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold text-tx-mid md:inline-flex"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
              >
                <span
                  className="grid h-4 w-4 place-items-center rounded"
                  style={{
                    background: allSelected ? "var(--brand-primary)" : "transparent",
                    border: `1.5px solid ${allSelected ? "var(--brand-primary)" : "var(--bd-2)"}`,
                  }}
                >
                  {allSelected && <Check size={11} strokeWidth={3} color="#fffaf4" />}
                </span>
                Todos
              </button>
            )}
          </WtCard>

          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-[18px] bg-surf-2" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Package} title="Sin insumos"
              hint={search ? "Ningún insumo coincide con tu búsqueda." : "Agrega tu primer insumo o usa la carga inteligente."}
              action={!search && <PrimaryBtn full={false} icon={Plus} onClick={() => openForm()}>Nuevo insumo</PrimaryBtn>} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((ing) => {
                const lvl = stockLevel(ing);
                const sel = selectedIds.has(ing.id);
                return (
                  <WtCard
                    key={ing.id}
                    className="overflow-hidden p-3.5"
                    style={sel ? { borderColor: "var(--brand-primary)", boxShadow: "0 0 0 1px var(--iris-soft)" } : undefined}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleSelect(ing.id)}
                        aria-label={sel ? "Deseleccionar" : "Seleccionar"}
                        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded"
                        style={{
                          background: sel ? "var(--brand-primary)" : "transparent",
                          border: `1.5px solid ${sel ? "var(--brand-primary)" : "var(--bd-2)"}`,
                        }}
                      >
                        {sel && <Check size={12} strokeWidth={3} color="#fffaf4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-display text-sm font-extrabold text-tx-hi">{ing.name}</span>
                          <Pill tone={lvl.tone}>{lvl.label}</Pill>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-tx-mut">
                          {ing.supplier?.name || "Sin proveedor"} · {money(ing.cost)}/{ing.unit}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1.5 flex items-baseline justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-dim">Stock</span>
                        <span className="font-mono text-xs font-semibold" style={{ color: `var(--${lvl.tone === "ok" ? "ok" : lvl.tone === "warn" ? "warn" : "err"})` }}>
                          {ing.stock} {ing.unit} <span className="text-tx-dim">/ mín {ing.minStock}</span>
                        </span>
                      </div>
                      <ProgressBar pct={lvl.pct} tone={lvl.tone} height={7} />
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openAdjust(ing)}
                        className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-tx-mid"
                        style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                      >
                        <SlidersHorizontal size={14} /> Ajustar
                      </button>
                      <button
                        type="button"
                        onClick={() => openForm(ing)}
                        aria-label="Editar"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-tx-mid"
                        style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteIngredient(ing.id)}
                        aria-label="Eliminar"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                        style={{ background: "var(--err-soft)", color: "var(--err)" }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </WtCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: MOVIMIENTOS ─────────────────────────────────────────── */}
      {tab === "movements" && (
        <div className="mt-4">
          {loading ? (
            <div className="grid grid-cols-1 gap-2">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-[14px] bg-surf-2" />)}
            </div>
          ) : movements.length === 0 ? (
            <EmptyState icon={TrendingUp} title="Sin movimientos"
              hint="Las entradas, salidas y ajustes de stock aparecerán aquí." />
          ) : (
            <WtCard className="overflow-hidden">
              {movements.map((mov, idx) => {
                const meta = movMeta(mov.type);
                const Icon = meta.icon;
                return (
                  <div
                    key={mov.id}
                    className="flex items-center gap-3 px-3.5 py-3"
                    style={idx === movements.length - 1 ? {} : { borderBottom: "1px solid var(--bd-1)" }}
                  >
                    <IconBadge icon={Icon} tone={meta.tone} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-tx">
                        {mov.ingredient?.name || "Insumo"}
                      </div>
                      <div className="truncate text-[11px] text-tx-mut">
                        {meta.label} · {fmtDate(mov.createdAt)}
                        {mov.reason ? ` · ${mov.reason}` : ""}
                      </div>
                    </div>
                    <span
                      className="shrink-0 font-mono text-sm font-bold"
                      style={{ color: `var(--${meta.tone === "ok" ? "ok" : meta.tone === "err" ? "err" : "info"})` }}
                    >
                      {mov.type === "OUT" ? "−" : mov.type === "IN" ? "+" : "="}{mov.quantity} {mov.ingredient?.unit || ""}
                    </span>
                  </div>
                );
              })}
            </WtCard>
          )}
        </div>
      )}

      {/* ── TAB: LISTA DE COMPRAS ────────────────────────────────────── */}
      {tab === "shopping" && (
        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <SectionLabel>Sugerencias por consumo (últimos 30 días)</SectionLabel>
            <button
              type="button"
              onClick={fetchShoppingList}
              aria-label="Recalcular"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-tx-mut"
              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
            >
              <RotateCw size={16} className={shoppingLoading ? "animate-spin" : ""} />
            </button>
          </div>

          {shoppingLoading ? (
            <div className="grid grid-cols-1 gap-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-36 animate-pulse rounded-[18px] bg-surf-2" />)}
            </div>
          ) : !shoppingList || shoppingList.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Sin compras sugeridas"
              hint="Cuando tus insumos se acerquen al mínimo según su consumo, las sugerencias aparecerán aquí." />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {shoppingList.map((group, gi) => {
                const phone = group.supplier?.phone?.replace(/\D/g, "");
                return (
                  <WtCard key={group.supplier?.id || `nogroup-${gi}`} className="overflow-hidden p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-display text-base font-extrabold text-tx-hi">
                            {group.supplier?.name || "Sin proveedor asignado"}
                          </span>
                          {group.urgentCount > 0 && <Pill tone="err" live>{group.urgentCount} urgente{group.urgentCount !== 1 ? "s" : ""}</Pill>}
                        </div>
                        <div className="mt-0.5 text-[11px] text-tx-mut">
                          {group.items.length} insumo{group.items.length !== 1 ? "s" : ""}
                          {group.belowMinOrder && " · bajo el mínimo de pedido"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-display text-base font-extrabold text-primary">{money(group.totalAmount)}</div>
                        <div className="text-[10px] text-tx-dim">estimado</div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      {group.items.map((it) => (
                        <div
                          key={it.ingredient.id}
                          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-semibold text-tx">{it.ingredient.name}</span>
                              <Pill tone={it.urgency === "URGENTE" ? "err" : "warn"}>{it.urgency === "URGENTE" ? "Urgente" : "Pronto"}</Pill>
                            </div>
                            <div className="text-[10.5px] text-tx-mut">
                              Stock {it.ingredient.stock} · {it.daysOfStock != null ? `${it.daysOfStock.toFixed(1)} días` : "sin consumo"}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-mono text-[13px] font-bold text-tx">
                              {it.qtySuggestedPurchase} {it.purchaseUnit || it.ingredient.unit}
                            </div>
                            <div className="font-mono text-[10px] text-tx-mut">{money(it.lineTotal)}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {phone && (
                      <a
                        href={`https://wa.me/${phone}`}
                        target="_blank" rel="noopener noreferrer"
                        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-bold"
                        style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
                      >
                        <MessageCircle size={16} /> Pedir por WhatsApp
                      </a>
                    )}
                  </WtCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl px-5 py-3 shadow-2xl"
          style={{ background: "var(--surf-1)", border: "1px solid var(--brand-primary)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          <span className="rounded-lg px-2 py-1 font-mono text-[10px] font-black uppercase tracking-widest"
            style={{ background: "var(--iris-soft)", color: "var(--brand-primary)" }}>
            {selectedIds.size} seleccionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <button onClick={bulkDelete}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black"
            style={{ background: "var(--err-soft)", color: "var(--err)", border: "1px solid transparent" }}>
            <Trash2 size={14} /> Eliminar
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            aria-label="Limpiar selección"
            className="grid h-7 w-7 place-items-center rounded-xl"
            style={{ background: "var(--surf-2)", color: "var(--tx-mut)" }}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── Modal de Ajuste de Stock ───────────────────────────────────── */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,.78)" }}>
          <WtCard className="my-4 w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-extrabold text-tx-hi">Ajustar stock</h2>
                <p className="mt-0.5 text-[11px] text-tx-mut">{adjustModal.name} · actual {adjustModal.stock} {baseUnitLabel(adjustModal.baseUnit)}</p>
              </div>
              <button onClick={() => setAdjustModal(null)} aria-label="Cerrar"
                className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut"
                style={{ background: "var(--surf-2)" }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={saveAdjust} className="flex flex-col gap-4">
              <div>
                <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Tipo de movimiento</div>
                <Segmented
                  value={adjustType}
                  onChange={setAdjustType}
                  options={[
                    { value: "IN", label: "Entrada" },
                    { value: "OUT", label: "Salida" },
                    { value: "ADJUST", label: "Conteo" },
                  ] as const}
                />
              </div>
              <div>
                <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
                  {adjustType === "ADJUST" ? "Stock real contado" : "Cantidad"}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number" step="0.001" min="0" required autoFocus
                    value={adjustQty} onChange={e => setAdjustQty(e.target.value)}
                    className="min-w-0 flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                  />
                  <select
                    value={adjustUnit} onChange={e => setAdjustUnit(e.target.value)}
                    className="rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                  >
                    {unitOptionsFor(adjustModal.baseUnit).map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
                {adjustQty && adjustUnit !== baseUnitLabel(adjustModal.baseUnit) && (
                  <p className="mt-1.5 text-[11px] text-tx-mut">
                    = {toBaseQty(Number(adjustQty), adjustUnit, adjustModal.baseUnit).toLocaleString("es-MX")} {baseUnitLabel(adjustModal.baseUnit)}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Motivo (opcional)</label>
                <input
                  value={adjustReason} onChange={e => setAdjustReason(e.target.value)}
                  placeholder="Ej. compra, merma, conteo físico"
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                />
              </div>
              <div className="flex gap-3 pt-1">
                <PrimaryBtn ghost onClick={() => setAdjustModal(null)}>Cancelar</PrimaryBtn>
                <PrimaryBtn type="submit" disabled={adjustSaving || !adjustQty}>
                  {adjustSaving ? "Guardando…" : "Registrar"}
                </PrimaryBtn>
              </div>
            </form>
          </WtCard>
        </div>
      )}

      {/* ── Modal de Revisión IA ───────────────────────────────────────── */}
      {isReviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,.85)" }}>
          <WtCard className="my-4 w-full max-w-3xl p-6 md:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconBadge icon={Sparkles} tone="ac" size={40} />
                <div>
                  <h2 className="font-display text-xl font-extrabold text-tx-hi md:text-2xl">Revisión de ticket</h2>
                  <p className="mt-0.5 text-[11px] text-tx-mut">Verifica y corrige antes de guardar</p>
                </div>
              </div>
              <button onClick={() => { setIsReviewOpen(false); setScannedItems([]); }} aria-label="Cerrar"
                className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut" style={{ background: "var(--surf-2)" }}>
                <X size={16} />
              </button>
            </div>

            <div className="overflow-x-auto warmtech-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--bd-1)" }}>
                    {["Ingrediente", "Costo total ($)", "Cantidad / rendimiento", "Unidad", "Costo unitario", ""].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-mono text-[10px] font-bold uppercase tracking-wider text-tx-dim">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scannedItems.map((item, idx) => {
                    const cost = Number(item.totalCost) && Number(item.quantityFound)
                      ? (Number(item.totalCost) / Number(item.quantityFound)).toFixed(4)
                      : "—";
                    return (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--bd-1)" }}>
                        <td className="px-3 py-2">
                          <input
                            value={item.name}
                            onChange={e => setScannedItems(p => p.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                            className="w-full rounded-lg px-3 py-1.5 text-sm outline-none"
                            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number" step="0.01" min="0"
                            value={item.totalCost}
                            onChange={e => setScannedItems(p => p.map((x, i) => i === idx ? { ...x, totalCost: e.target.value } : x))}
                            className="w-24 rounded-lg px-3 py-1.5 text-sm outline-none"
                            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number" step="0.001" min="1"
                            value={item.quantityFound}
                            onChange={e => setScannedItems(p => p.map((x, i) => i === idx ? { ...x, quantityFound: e.target.value } : x))}
                            className="w-24 rounded-lg px-3 py-1.5 text-sm outline-none"
                            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={item.unit}
                            onChange={e => setScannedItems(p => p.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))}
                            className="rounded-lg px-3 py-1.5 text-sm outline-none"
                            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                          >
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="font-mono text-sm font-bold text-primary">${cost}</span>
                          <span className="ml-1 text-xs text-tx-dim">/{item.unit}</span>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setScannedItems(p => p.filter((_, i) => i !== idx))}
                            aria-label="Quitar fila"
                            className="grid h-8 w-8 place-items-center rounded-lg"
                            style={{ background: "var(--err-soft)", color: "var(--err)" }}
                          ><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {scannedItems.length === 0 && (
              <p className="py-6 text-center text-sm text-tx-mut">Sin ingredientes. Agrega manualmente o cancela.</p>
            )}

            <div className="mt-6 flex items-center justify-between pt-4" style={{ borderTop: "1px solid var(--bd-1)" }}>
              <button
                type="button"
                onClick={() => setScannedItems(p => [...p, { name: "", totalCost: 0, quantityFound: 1, unit: "pz" }])}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-tx-mid"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
              >
                <Plus size={14} /> Agregar fila
              </button>
              <div className="flex gap-3">
                <PrimaryBtn ghost full={false} onClick={() => { setIsReviewOpen(false); setScannedItems([]); }}>
                  Cancelar
                </PrimaryBtn>
                <PrimaryBtn full={false} icon={Check} disabled={isSavingBulk || scannedItems.length === 0} onClick={handleBulkConfirm}>
                  {isSavingBulk ? "Guardando…" : `Confirmar ${scannedItems.length}`}
                </PrimaryBtn>
              </div>
            </div>
          </WtCard>
        </div>
      )}

      {/* ── Modal Nuevo / Editar Ingrediente ───────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,.8)" }}>
          <WtCard className="my-4 w-full max-w-md p-6 md:p-8">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-xl font-extrabold text-tx-hi md:text-2xl">{editItem ? "Editar" : "Nuevo"} insumo</h2>
              <button onClick={() => setShowForm(false)} aria-label="Cerrar"
                className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut" style={{ background: "var(--surf-2)" }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={saveIngredient} className="space-y-4">

              {/* Nombre */}
              <Field label="Nombre del insumo">
                <input value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} required
                  placeholder="Ej. Tomate, Pollo, Harina"
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
              </Field>

              {/* Compra */}
              <div className="space-y-3 rounded-2xl p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">Unidad de compra</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Presentación">
                    <input value={form.purchaseUnit} onChange={e => setForm(p=>({...p,purchaseUnit:e.target.value}))}
                      placeholder="Caja, Costal, Bolsa"
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
                  </Field>
                  <Field label="Costo de compra ($)">
                    <input type="number" step="0.01" min="0" value={form.purchaseCost}
                      onChange={e => setForm(p=>({...p,purchaseCost:e.target.value}))}
                      placeholder="600"
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
                  </Field>
                </div>
                <Field label="Rendimiento (cantidad que incluye)">
                  <input type="number" step="0.001" min="1" value={form.conversionFactor}
                    onChange={e => setForm(p=>({...p,conversionFactor:e.target.value}))}
                    placeholder="40"
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
                </Field>
              </div>

              {/* Receta */}
              <div className="space-y-3 rounded-2xl p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">Unidad de receta</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Unidad de uso">
                    <select value={form.unit} onChange={e => setForm(p=>({...p,unit:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </Field>
                  <Field label="Costo unitario manual ($)">
                    <input type="number" step="0.0001" min="0" value={form.cost}
                      onChange={e => setForm(p=>({...p,cost:e.target.value}))}
                      disabled={form.purchaseCost !== ""}
                      placeholder={form.purchaseCost !== "" ? "Automático" : "15"}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none disabled:opacity-40"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
                  </Field>
                </div>

                {/* Costo calculado */}
                {form.purchaseCost !== "" && Number(form.conversionFactor) > 0 && (
                  <div className="rounded-xl px-4 py-3" style={{ background: "var(--iris-soft)" }}>
                    <p className="text-xs font-bold text-primary">
                      Costo unitario calculado:{" "}
                      <span className="font-mono text-tx-hi">
                        ${(Number(form.purchaseCost) / Number(form.conversionFactor)).toFixed(4)}
                      </span>{" "}
                      por <span className="font-bold text-tx-hi">{form.unit}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Stock */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Stock actual">
                  <input type="number" step="0.01" min="0" value={form.stock}
                    onChange={e => setForm(p=>({...p,stock:e.target.value}))}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
                </Field>
                <Field label="Stock mínimo">
                  <input type="number" step="0.01" min="0" value={form.minStock}
                    onChange={e => setForm(p=>({...p,minStock:e.target.value}))}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
                </Field>
              </div>

              {/* Proveedor */}
              <Field label="Proveedor">
                <select value={form.supplierId} onChange={e => setForm(p=>({...p,supplierId:e.target.value}))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}>
                  <option value="">Sin proveedor</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>

              {/* Taxonomía: Tipo + Categoría + Unidad base */}
              <div className="space-y-3 rounded-2xl p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">Clasificación para costeo</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tipo / Estación">
                    <select value={form.typeId} onChange={e => setForm(p=>({...p,typeId:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}>
                      <option value="">— sin tipo —</option>
                      {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Categoría">
                    <select value={form.categoryId} onChange={e => setForm(p=>({...p,categoryId:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}>
                      <option value="">— sin categoría —</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Unidad base (normalizada)" hint="Las recetas y stock se normalizan a esta unidad internamente (Kg → 1000g, L → 1000ml).">
                  <select value={form.baseUnit} onChange={e => setForm(p=>({...p,baseUnit:e.target.value as FormState["baseUnit"]}))}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}>
                    <option value="GRAM">Gramos (peso)</option>
                    <option value="ML">Mililitros (volumen)</option>
                    <option value="PIECE">Piezas (conteo)</option>
                  </select>
                </Field>
              </div>

              {/* Factor de corrección (peso bruto vs neto) */}
              <div className="space-y-3 rounded-2xl p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                <div className="flex items-baseline justify-between">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">Factor de corrección</p>
                  {form.pesoBruto !== "" && form.pesoNeto !== "" && Number(form.pesoNeto) > 0 && (
                    <p className="font-mono text-[10px] font-bold tabular-nums text-primary">
                      = {(Number(form.pesoBruto) / Number(form.pesoNeto)).toFixed(3)}x
                    </p>
                  )}
                </div>
                <p className="-mt-1 text-[10px] text-tx-mut">
                  Merma al limpiar / pelar / desemilar antes de usar en receta.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Peso bruto">
                    <input type="number" step="0.01" min="0" value={form.pesoBruto}
                      onChange={e => setForm(p=>({...p,pesoBruto:e.target.value}))}
                      placeholder="1000"
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
                  </Field>
                  <Field label="Peso neto utilizable">
                    <input type="number" step="0.01" min="0" value={form.pesoNeto}
                      onChange={e => setForm(p=>({...p,pesoNeto:e.target.value}))}
                      placeholder="950"
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
                  </Field>
                </div>
              </div>

              {/* Packaging flag */}
              <label className="flex cursor-pointer items-center gap-3 rounded-xl p-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                <input
                  type="checkbox"
                  checked={form.isPackaging}
                  onChange={e => setForm(p=>({...p,isPackaging:e.target.checked}))}
                  className="h-5 w-5 cursor-pointer accent-[var(--brand-primary)]"
                />
                <div>
                  <p className="text-sm font-bold text-tx">Es empaque / desechable</p>
                  <p className="text-[10px] text-tx-mut">Charolas, vasos térmicos, bolsas — costea delivery por orden.</p>
                </div>
              </label>

              <div className="flex gap-3 pt-1">
                <PrimaryBtn ghost onClick={() => setShowForm(false)}>Cancelar</PrimaryBtn>
                <PrimaryBtn type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</PrimaryBtn>
              </div>
            </form>
          </WtCard>
        </div>
      )}
    </WtScreen>
  );
}

/* ── pequeños helpers de UI locales ────────────────────────────────── */
function ShortcutLink({ href, icon: Icon, label }: { href: string; icon: typeof ShoppingCart; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center justify-center gap-2 rounded-2xl px-3 text-[12px] font-bold text-tx-mid"
      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
    >
      <Icon size={15} className="text-primary" /> {label}
    </Link>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 ml-1 block font-mono text-[9.5px] font-bold uppercase tracking-[.12em] text-tx-mut">{label}</label>
      {children}
      {hint && <p className="ml-1 mt-1.5 text-[10px] text-tx-dim">{hint}</p>}
    </div>
  );
}
