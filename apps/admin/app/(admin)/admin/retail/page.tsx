"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Barcode,
  Boxes,
  Check,
  ClipboardCheck,
  Filter,
  Layers3,
  Package,
  PackagePlus,
  Pencil,
  ReceiptText,
  RefreshCw,
  Search,
  Shirt,
  ShoppingBag,
  Store,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import { money } from "@/components/warmtech";

type Tab = "stock" | "catalog" | "sales";

type Location = {
  id: string;
  name: string;
  isCentralWarehouse?: boolean;
};

type RetailSku = {
  id: string;
  sku: string;
  barcode?: string | null;
  size?: string | null;
  color?: string | null;
  material?: string | null;
  price: number;
  cost: number;
  isActive: boolean;
  product?: RetailProduct;
  stockBalances?: Array<{ qty: number; minQty: number }>;
};

type RetailProduct = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  description?: string | null;
  skus: RetailSku[];
};

type StockRow = {
  id: string;
  locationId: string;
  skuId: string;
  qty: number;
  minQty: number;
  location: Location;
  sku: RetailSku & { product: RetailProduct };
};

type SaleRow = {
  id: string;
  folio: string;
  total: number;
  status: string;
  createdAt: string;
  location?: Location;
  lines: Array<{ id: string; productName: string; skuCode: string; quantity: number; subtotal: number }>;
  payments: Array<{ id: string; method: string; amount: number }>;
};

type SaleAction = "cancel" | "return";

type ProductForm = {
  name: string;
  category: string;
  brand: string;
  sku: string;
  barcode: string;
  size: string;
  color: string;
  material: string;
  price: string;
  cost: string;
};

const emptyProduct: ProductForm = {
  name: "",
  category: "",
  brand: "",
  sku: "",
  barcode: "",
  size: "",
  color: "",
  material: "",
  price: "",
  cost: "",
};

const tabs: Array<{ value: Tab; label: string; icon: LucideIcon }> = [
  { value: "stock", label: "Stock", icon: Boxes },
  { value: "catalog", label: "Catálogo", icon: Shirt },
  { value: "sales", label: "Ventas", icon: ReceiptText },
];

function variantLabel(sku: RetailSku) {
  return [sku.size, sku.color, sku.material].filter(Boolean).join(" / ") || "Variante única";
}

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "response" in error) {
    const maybe = error as { response?: { data?: { error?: string } } };
    if (maybe.response?.data?.error) return maybe.response.data.error;
  }
  if (error instanceof Error) return error.message;
  return "No se pudo completar la accion";
}

function safeDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "es"));
}

export default function RetailAdminPage() {
  const [activeLocationId, setActiveLocationId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("locationId") || "" : "",
  );
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<RetailProduct[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [tab, setTab] = useState<Tab>("stock");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [productMode, setProductMode] = useState<"new" | "existing">("new");
  const [existingProductId, setExistingProductId] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editSku, setEditSku] = useState<RetailSku | null>(null);
  const [editForm, setEditForm] = useState({ price: "", cost: "", barcode: "", isActive: true });
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSkuId, setTransferSkuId] = useState("");
  const [transferToLocationId, setTransferToLocationId] = useState("");
  const [transferQty, setTransferQty] = useState("1");
  const [countOpen, setCountOpen] = useState(false);
  const [countSkuId, setCountSkuId] = useState("");
  const [countQty, setCountQty] = useState("");
  const [saleActionOpen, setSaleActionOpen] = useState(false);
  const [saleAction, setSaleAction] = useState<SaleAction>("cancel");
  const [saleActionSale, setSaleActionSale] = useState<SaleRow | null>(null);
  const [saleActionNotes, setSaleActionNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const locationParam = activeLocationId ? `?locationId=${encodeURIComponent(activeLocationId)}` : "";
      const [locationRes, catalogRes, stockRes, salesRes] = await Promise.all([
        api.get<Location[]>("/api/admin/locations"),
        api.get<{ products: RetailProduct[] }>(`/api/retail/v1/catalog${locationParam}`),
        api.get<StockRow[]>(`/api/retail/v1/stock${locationParam}`),
        api.get<SaleRow[]>(`/api/retail/v1/sales${locationParam ? `${locationParam}&limit=60` : "?limit=60"}`),
      ]);
      const locationRows = Array.isArray(locationRes.data) ? locationRes.data : [];
      setLocations(locationRows);
      setProducts(catalogRes.data.products || []);
      setStock(Array.isArray(stockRes.data) ? stockRes.data : []);
      setSales(Array.isArray(salesRes.data) ? salesRes.data : []);

      if (!activeLocationId && locationRows[0]?.id) {
        localStorage.setItem("locationId", locationRows[0].id);
        setActiveLocationId(locationRows[0].id);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeLocationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "locationId") setActiveLocationId(event.newValue || "");
    };
    const onLocationChanged = () => setActiveLocationId(localStorage.getItem("locationId") || "");
    window.addEventListener("storage", onStorage);
    window.addEventListener("locationChanged", onLocationChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("locationChanged", onLocationChanged);
    };
  }, []);

  function selectLocation(nextLocationId: string) {
    localStorage.setItem("locationId", nextLocationId);
    setActiveLocationId(nextLocationId);
    window.dispatchEvent(new Event("locationChanged"));
  }

  const selectedLocation = locations.find((location) => location.id === activeLocationId);
  const centralWarehouse = locations.find((location) => location.isCentralWarehouse);
  const allSkus = useMemo(() => products.flatMap((product) => product.skus.map((sku) => ({ ...sku, product }))), [products]);
  const q = query.trim().toLowerCase();

  const categoryOptions = useMemo(
    () => uniqueValues(stock.map((row) => row.sku.product.category).concat(products.map((product) => product.category))),
    [products, stock],
  );
  const sizeOptions = useMemo(() => uniqueValues(stock.map((row) => row.sku.size)), [stock]);
  const colorOptions = useMemo(() => uniqueValues(stock.map((row) => row.sku.color)), [stock]);

  const filteredStock = useMemo(() => {
    return stock.filter((row) => {
      const matchesQuery = !q || [row.sku.sku, row.sku.barcode, row.sku.product.name, row.sku.size, row.sku.color, row.location.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
      const matchesCategory = categoryFilter === "all" || row.sku.product.category === categoryFilter;
      const matchesSize = sizeFilter === "all" || row.sku.size === sizeFilter;
      const matchesColor = colorFilter === "all" || row.sku.color === colorFilter;
      return matchesQuery && matchesCategory && matchesSize && matchesColor;
    });
  }, [categoryFilter, colorFilter, q, sizeFilter, stock]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesQuery = !q || [product.name, product.brand, product.category, ...product.skus.map((sku) => sku.sku)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [categoryFilter, products, q]);

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      if (!q) return true;
      return [sale.folio, sale.location?.name, ...sale.lines.flatMap((line) => [line.productName, line.skuCode])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [q, sales]);

  const stats = useMemo(() => {
    const skuCount = allSkus.length;
    const stockUnits = stock.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const lowStock = stock.filter((row) => Number(row.minQty) > 0 && Number(row.qty) <= Number(row.minQty)).length;
    const revenue = sales.reduce((sum, sale) => sale.status === "COMPLETED" ? sum + Number(sale.total || 0) : sum, 0);
    return { skuCount, stockUnits, lowStock, revenue };
  }, [allSkus.length, sales, stock]);

  async function createProductAndSku(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      let productId = existingProductId;
      if (productMode === "new") {
        const productRes = await api.post<RetailProduct>("/api/retail/v1/catalog/products", {
          name: productForm.name,
          category: productForm.category || undefined,
          brand: productForm.brand || undefined,
        });
        productId = productRes.data.id;
      }
      if (!productId) throw new Error("Selecciona o crea un producto");
      await api.post("/api/retail/v1/catalog/skus", {
        productId,
        sku: productForm.sku,
        barcode: productForm.barcode || undefined,
        size: productForm.size || undefined,
        color: productForm.color || undefined,
        material: productForm.material || undefined,
        price: Number(productForm.price),
        cost: Number(productForm.cost || 0),
      });
      setProductOpen(false);
      setProductForm(emptyProduct);
      setProductMode("new");
      setExistingProductId("");
      await load();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(sku: RetailSku) {
    setEditSku(sku);
    setEditForm({
      price: String(sku.price ?? ""),
      cost: String(sku.cost ?? ""),
      barcode: sku.barcode || "",
      isActive: sku.isActive,
    });
    setEditOpen(true);
  }

  async function saveSkuEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editSku) return;
    setSaving(true);
    try {
      await api.put(`/api/retail/v1/catalog/skus/${editSku.id}`, {
        price: Number(editForm.price),
        cost: Number(editForm.cost || 0),
        barcode: editForm.barcode || null,
        isActive: editForm.isActive,
      });
      setEditOpen(false);
      setEditSku(null);
      await load();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function openNewSku() {
    setProductForm(emptyProduct);
    setProductMode("new");
    setExistingProductId("");
    setProductOpen(true);
  }

  async function saveTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/retail/v1/transfers", {
        fromLocationId: activeLocationId,
        items: [{ skuId: transferSkuId, toLocationId: transferToLocationId, qty: Number(transferQty) }],
        notes: "Traspaso desde admin retail",
      });
      setTransferOpen(false);
      setTransferSkuId("");
      setTransferToLocationId("");
      setTransferQty("1");
      await load();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/retail/v1/counts", {
        locationId: activeLocationId,
        clientCountId: `admin-count-${Date.now()}`,
        items: [{ skuId: countSkuId, countedQty: Number(countQty) }],
        notes: "Conteo físico desde admin retail",
      });
      setCountOpen(false);
      setCountSkuId("");
      setCountQty("");
      await load();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveSaleAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saleActionSale) return;
    setSaving(true);
    try {
      const endpoint = saleAction === "cancel" ? "cancel" : "return";
      await api.post(`/api/retail/v1/sales/${saleActionSale.id}/${endpoint}`, {
        notes: saleActionNotes || undefined,
      });
      setSaleActionOpen(false);
      setSaleActionSale(null);
      setSaleActionNotes("");
      await load();
      setTab("sales");
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function openTransfer(row?: StockRow) {
    setTransferSkuId(row?.skuId || allSkus[0]?.id || "");
    setTransferToLocationId(locations.find((location) => location.id !== activeLocationId)?.id || "");
    setTransferQty("1");
    setTransferOpen(true);
  }

  function openCount(row?: StockRow) {
    setCountSkuId(row?.skuId || allSkus[0]?.id || "");
    setCountQty(row ? String(row.qty) : "");
    setCountOpen(true);
  }

  function openSaleAction(sale: SaleRow, action: SaleAction) {
    setSaleActionSale(sale);
    setSaleAction(action);
    setSaleActionNotes("");
    setSaleActionOpen(true);
  }

  const activeFilters = [categoryFilter, sizeFilter, colorFilter].filter((value) => value !== "all").length;

  if (loading && !products.length) {
    return (
      <RetailShell>
        <RetailHeader
          eyebrow="Retail TPV"
          title="Control retail"
          subtitle="Cargando catálogo SKU..."
          actions={<TpvButton icon={RefreshCw} ghost disabled>Sincronizando</TpvButton>}
        />
        <LoadingGrid />
      </RetailShell>
    );
  }

  if (error && !products.length) {
    return (
      <RetailShell>
        <RetailHeader eyebrow="Retail TPV" title="Control retail" subtitle="No pudimos cargar la operación" />
        <StateCard icon={AlertTriangle} title="No pudimos cargar retail" hint={error}>
          <TpvButton icon={RefreshCw} onClick={load}>Reintentar</TpvButton>
        </StateCard>
      </RetailShell>
    );
  }

  return (
    <RetailShell>
      <RetailHeader
        eyebrow="Retail TPV"
        title="Piso de inventario"
        subtitle={`${selectedLocation?.name || "Sucursal"} / stock, SKU y traspasos listos para caja`}
        actions={
          <>
            <TpvButton icon={RefreshCw} ghost onClick={load} disabled={loading}>Actualizar</TpvButton>
            <Link
              href="/admin/retail/pos"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-4 text-sm font-black text-[var(--brand-fg)] shadow-[0_10px_30px_var(--brand-glow)] transition-all hover:bg-[var(--brand-hover)] active:scale-95"
            >
              <ShoppingBag size={17} />
              Caja retail
            </Link>
            <TpvButton icon={PackagePlus} onClick={openNewSku}>Nuevo SKU</TpvButton>
          </>
        }
      />

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard icon={Shirt} label="SKUs activos" value={stats.skuCount.toLocaleString("es-MX")} />
            <StatCard icon={Boxes} label="Piezas aqui" value={stats.stockUnits.toLocaleString("es-MX")} />
            <StatCard icon={AlertTriangle} label="Bajo mínimo" value={stats.lowStock.toLocaleString("es-MX")} tone={stats.lowStock > 0 ? "warn" : "ok"} />
            <StatCard icon={ReceiptText} label="Ventas listadas" value={money(stats.revenue)} />
          </div>

          <TpvCard className="p-3">
            <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
              <div className="flex gap-1 overflow-x-auto scrollbar-hide rounded-2xl border border-white/10 bg-[var(--surface-2)] p-1">
                {tabs.map(({ value, label, icon: Icon }) => {
                  const active = tab === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTab(value)}
                      className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all active:scale-95 ${
                        active ? "bg-[var(--brand)] text-[var(--brand-fg)] shadow-[0_8px_24px_var(--brand-glow)]" : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon size={17} />
                      {label}
                    </button>
                  );
                })}
              </div>

              <label className="flex min-h-12 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-[var(--surface-2)] px-4">
                <Search size={18} className="text-[var(--text-muted)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Escanea o busca SKU, prenda, código..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <FilterChip active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>Todas</FilterChip>
              {categoryOptions.slice(0, 8).map((category) => (
                <FilterChip key={category} active={categoryFilter === category} onClick={() => setCategoryFilter(category)}>
                  {category}
                </FilterChip>
              ))}
              <SelectChip icon={Layers3} label="Talla" value={sizeFilter} onChange={setSizeFilter} options={sizeOptions} />
              <SelectChip icon={Filter} label="Color" value={colorFilter} onChange={setColorFilter} options={colorOptions} />
              {activeFilters > 0 && (
                <button
                  type="button"
                  onClick={() => { setCategoryFilter("all"); setSizeFilter("all"); setColorFilter("all"); }}
                  className="min-h-10 rounded-full px-3 text-xs font-bold text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </TpvCard>

          {tab === "stock" && (
            <section className="space-y-2">
              {filteredStock.map((row) => (
                <StockItem key={row.id} row={row} onTransfer={() => openTransfer(row)} onCount={() => openCount(row)} />
              ))}
              {filteredStock.length === 0 && (
                <StateCard icon={Boxes} title="Sin stock retail" hint="Ajusta los filtros o crea productos y SKUs retail." />
              )}
            </section>
          )}

          {tab === "catalog" && (
            <section className="grid gap-3 xl:grid-cols-2">
              {filteredProducts.map((product) => (
                <TpvCard key={product.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-black tracking-tight text-[var(--text-primary)]">{product.name}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {product.category && <StatusPill>{product.category}</StatusPill>}
                        {product.brand && <StatusPill muted>{product.brand}</StatusPill>}
                        <StatusPill muted>{product.skus.length} SKU</StatusPill>
                      </div>
                    </div>
                    <IconTile icon={Shirt} />
                  </div>
                  <div className="mt-4 space-y-2">
                    {product.skus.map((sku) => (
                      <div key={sku.id} className="rounded-2xl border border-white/10 bg-[var(--surface-2)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate font-mono text-xs font-semibold text-[var(--text-primary)]">{sku.sku}</span>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-[var(--brand)]">{money(sku.price)}</span>
                            <button
                              type="button"
                              onClick={() => openEdit(sku)}
                              aria-label="Editar SKU"
                              title="Editar SKU"
                              className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                            >
                              <Pencil size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--text-secondary)]">{variantLabel(sku)}</div>
                      </div>
                    ))}
                  </div>
                </TpvCard>
              ))}
              {filteredProducts.length === 0 && (
                <StateCard icon={PackagePlus} title="Sin catálogo retail" hint="Crea el primer producto con SKU, talla, color y código de barras." />
              )}
            </section>
          )}

          {tab === "sales" && (
            <section className="space-y-2">
              {filteredSales.map((sale) => (
                <TpvCard key={sale.id} className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[var(--brand)]">{sale.folio}</span>
                        <StatusPill muted={sale.status !== "COMPLETED"}>{sale.status}</StatusPill>
                      </div>
                      <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                        {sale.lines.map((line) => `${line.productName} x${line.quantity}`).join(", ")}
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--text-secondary)]">{sale.location?.name || selectedLocation?.name} / {safeDate(sale.createdAt)}</div>
                    </div>
                    <div className="flex flex-col gap-2 md:items-end">
                      <div className="font-mono text-2xl font-semibold text-[var(--text-primary)]">{money(sale.total)}</div>
                      {sale.status === "COMPLETED" ? (
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          <button
                            type="button"
                            onClick={() => openSaleAction(sale, "return")}
                            className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-black text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                          >
                            <Undo2 size={15} /> Devolver
                          </button>
                          <button
                            type="button"
                            onClick={() => openSaleAction(sale, "cancel")}
                            className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 text-xs font-black text-[var(--danger)]"
                          >
                            <Ban size={15} /> Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="text-[11px] font-bold text-[var(--text-secondary)]">Stock repuesto / venta cerrada</div>
                      )}
                    </div>
                  </div>
                </TpvCard>
              ))}
              {filteredSales.length === 0 && (
                <StateCard icon={ReceiptText} title="Sin ventas retail" hint="Las ventas de la app Windows aparecerán aquí cuando sincronicen." />
              )}
            </section>
          )}
        </div>

        <aside className="space-y-3">
          <TpvCard className="p-4">
            <div className="flex items-center gap-3">
              <IconTile icon={Store} />
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-[var(--text-primary)]">{selectedLocation?.name || "Sucursal retail"}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand)]">
                  {selectedLocation?.isCentralWarehouse ? "Bodega central" : "Sucursal activa"}
                </div>
              </div>
            </div>
            <Field label="Cambiar contexto">
              <select className="retail-input" value={activeLocationId} onChange={(event) => selectLocation(event.target.value)}>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.isCentralWarehouse ? "Bodega / " : ""}{location.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <TpvButton icon={ArrowLeftRight} ghost onClick={() => openTransfer()}>Traspaso</TpvButton>
              <TpvButton icon={ClipboardCheck} ghost onClick={() => openCount()}>Conteo</TpvButton>
            </div>
          </TpvCard>

          <TpvCard className="p-4">
            <div className="mb-4 flex items-center gap-3">
              <IconTile icon={Barcode} />
              <div>
                <div className="text-sm font-black text-[var(--text-primary)]">Lectura SKU</div>
                <div className="text-[11px] text-[var(--text-secondary)]">Barra, talla, color y stock exacto</div>
              </div>
            </div>
            <div className="space-y-2 text-[12px] text-[var(--text-secondary)]">
              <InfoRow label="SKUs activos" value={stats.skuCount.toLocaleString("es-MX")} />
              <InfoRow label="Bajo mínimo" value={stats.lowStock.toLocaleString("es-MX")} />
              <InfoRow label="Bodega" value={centralWarehouse?.name || "Pendiente"} />
            </div>
          </TpvCard>

          <TpvCard className="overflow-hidden">
            <div className="border-b border-white/10 p-4">
              <div className="flex items-center gap-3">
                <IconTile icon={ShoppingBag} />
                <div>
                  <div className="text-sm font-black text-[var(--text-primary)]">Acciones de piso</div>
                  <div className="text-[11px] text-[var(--text-secondary)]">Pensado para operar con táctil</div>
                </div>
              </div>
            </div>
            <button type="button" onClick={openNewSku} className="retail-action-row">
              <PackagePlus size={18} /> Alta rápida de SKU
            </button>
            <button type="button" onClick={() => openTransfer()} className="retail-action-row">
              <ArrowLeftRight size={18} /> Mandar a otra sucursal
            </button>
            <button type="button" onClick={() => openCount()} className="retail-action-row last">
              <ClipboardCheck size={18} /> Ajustar conteo físico
            </button>
          </TpvCard>
        </aside>
      </section>

      {productOpen && (
        <Modal title="Agregar SKU" onClose={() => setProductOpen(false)}>
          <form onSubmit={createProductAndSku} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setProductMode("new")} className={`min-h-11 rounded-2xl border text-sm font-bold transition-all active:scale-95 ${productMode === "new" ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-white/10 bg-white/5 text-[var(--text-secondary)]"}`}>Producto nuevo</button>
              <button type="button" onClick={() => setProductMode("existing")} disabled={products.length === 0} className={`min-h-11 rounded-2xl border text-sm font-bold transition-all active:scale-95 disabled:opacity-40 ${productMode === "existing" ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-white/10 bg-white/5 text-[var(--text-secondary)]"}`}>Producto existente</button>
            </div>
            {productMode === "new" ? (
              <>
                <Field label="Producto">
                  <input className="retail-input" value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} required placeholder="Camisa Oxford Slim" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Categoría"><input className="retail-input" value={productForm.category} onChange={(e) => setProductForm((p) => ({ ...p, category: e.target.value }))} placeholder="Camisas" /></Field>
                  <Field label="Marca"><input className="retail-input" value={productForm.brand} onChange={(e) => setProductForm((p) => ({ ...p, brand: e.target.value }))} /></Field>
                </div>
              </>
            ) : (
              <Field label="Producto existente">
                <select className="retail-input" value={existingProductId} onChange={(e) => setExistingProductId(e.target.value)} required>
                  <option value="">Selecciona producto</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.category ? ` / ${p.category}` : ""} ({p.skus.length} SKU)</option>
                  ))}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU"><input className="retail-input" value={productForm.sku} onChange={(e) => setProductForm((p) => ({ ...p, sku: e.target.value }))} required placeholder="STD-CAM-OXF-M-NEG" /></Field>
              <Field label="Código"><input className="retail-input" value={productForm.barcode} onChange={(e) => setProductForm((p) => ({ ...p, barcode: e.target.value }))} placeholder="780000000001" /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Talla"><input className="retail-input" value={productForm.size} onChange={(e) => setProductForm((p) => ({ ...p, size: e.target.value }))} placeholder="M" /></Field>
              <Field label="Color"><input className="retail-input" value={productForm.color} onChange={(e) => setProductForm((p) => ({ ...p, color: e.target.value }))} placeholder="Negro" /></Field>
              <Field label="Material"><input className="retail-input" value={productForm.material} onChange={(e) => setProductForm((p) => ({ ...p, material: e.target.value }))} placeholder="Algodón" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio"><input className="retail-input" type="number" min="0" step="0.01" value={productForm.price} onChange={(e) => setProductForm((p) => ({ ...p, price: e.target.value }))} required /></Field>
              <Field label="Costo"><input className="retail-input" type="number" min="0" step="0.01" value={productForm.cost} onChange={(e) => setProductForm((p) => ({ ...p, cost: e.target.value }))} /></Field>
            </div>
            <ModalActions saving={saving} onCancel={() => setProductOpen(false)} submitLabel="Crear SKU" />
          </form>
        </Modal>
      )}

      {editOpen && editSku && (
        <Modal title={`Editar ${editSku.sku}`} onClose={() => setEditOpen(false)}>
          <form onSubmit={saveSkuEdit} className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[var(--surface-2)] p-3 text-xs text-[var(--text-secondary)]">{variantLabel(editSku)}</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio"><input className="retail-input" type="number" min="0" step="0.01" value={editForm.price} onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))} required /></Field>
              <Field label="Costo"><input className="retail-input" type="number" min="0" step="0.01" value={editForm.cost} onChange={(e) => setEditForm((f) => ({ ...f, cost: e.target.value }))} /></Field>
            </div>
            <Field label="Código de barras">
              <input className="retail-input" value={editForm.barcode} onChange={(e) => setEditForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="780000000001" />
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[var(--surface-2)] px-4 py-3">
              <span className="text-sm font-bold text-[var(--text-primary)]">SKU activo</span>
              <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-5 w-5 accent-[var(--brand)]" />
            </label>
            {!editForm.isActive && <p className="text-[11px] font-semibold text-[var(--warning)]">Al desactivar, el SKU deja de aparecer en caja y catálogo.</p>}
            <ModalActions saving={saving} onCancel={() => setEditOpen(false)} submitLabel="Guardar cambios" />
          </form>
        </Modal>
      )}

      {transferOpen && (
        <Modal title="Traspaso retail" onClose={() => setTransferOpen(false)}>
          <form onSubmit={saveTransfer} className="space-y-4">
            <Field label="SKU origen">
              <select className="retail-input" value={transferSkuId} onChange={(e) => setTransferSkuId(e.target.value)} required>
                <option value="">Selecciona SKU</option>
                {stock.map((row) => (
                  <option key={row.id} value={row.skuId}>{row.sku.sku} / {row.sku.product.name} / disp {row.qty}</option>
                ))}
              </select>
            </Field>
            <Field label="Sucursal destino">
              <select className="retail-input" value={transferToLocationId} onChange={(e) => setTransferToLocationId(e.target.value)} required>
                <option value="">Selecciona destino</option>
                {locations.filter((location) => location.id !== activeLocationId).map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Cantidad">
              <input className="retail-input" type="number" min="1" step="1" value={transferQty} onChange={(e) => setTransferQty(e.target.value)} required />
            </Field>
            <ModalActions saving={saving} onCancel={() => setTransferOpen(false)} submitLabel="Registrar traspaso" />
          </form>
        </Modal>
      )}

      {countOpen && (
        <Modal title="Conteo físico retail" onClose={() => setCountOpen(false)}>
          <form onSubmit={saveCount} className="space-y-4">
            <Field label="SKU">
              <select className="retail-input" value={countSkuId} onChange={(e) => setCountSkuId(e.target.value)} required>
                <option value="">Selecciona SKU</option>
                {stock.map((row) => (
                  <option key={row.id} value={row.skuId}>{row.sku.sku} / {row.sku.product.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Conteo real">
              <input className="retail-input" type="number" min="0" step="1" value={countQty} onChange={(e) => setCountQty(e.target.value)} required />
            </Field>
            <ModalActions saving={saving} onCancel={() => setCountOpen(false)} submitLabel="Aplicar conteo" />
          </form>
        </Modal>
      )}

      {saleActionOpen && saleActionSale && (
        <Modal
          title={saleAction === "cancel" ? "Cancelar venta retail" : "Registrar devolución"}
          onClose={() => setSaleActionOpen(false)}
        >
          <form onSubmit={saveSaleAction} className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-[var(--surface-2)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-xs font-semibold text-[var(--brand)]">{saleActionSale.folio}</div>
                  <div className="mt-1 text-sm font-black text-[var(--text-primary)]">
                    {saleAction === "cancel" ? "Se regresará todo el stock de esta venta." : "Se marcará como devuelta y se regresará el stock vendido."}
                  </div>
                </div>
                <div className="font-mono text-xl font-semibold text-[var(--text-primary)]">{money(saleActionSale.total)}</div>
              </div>
              <div className="mt-3 space-y-2 text-xs text-[var(--text-secondary)]">
                {saleActionSale.lines.map((line) => (
                  <div key={line.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <span className="min-w-0 truncate">{line.productName} / {line.skuCode}</span>
                    <span className="font-mono text-[var(--text-primary)]">+{line.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
            <Field label="Motivo">
              <textarea
                className="retail-input min-h-[92px] resize-none py-3"
                value={saleActionNotes}
                onChange={(event) => setSaleActionNotes(event.target.value)}
                placeholder={saleAction === "cancel" ? "Error de captura, pago no concretado..." : "Cambio de talla, devolución de cliente..."}
              />
            </Field>
            <ModalActions
              saving={saving}
              onCancel={() => setSaleActionOpen(false)}
              submitLabel={saleAction === "cancel" ? "Cancelar y reponer stock" : "Devolver y reponer stock"}
            />
          </form>
        </Modal>
      )}

    </RetailShell>
  );
}

function RetailShell({ children }: { children: ReactNode }) {
  return (
    <main className="tpv-retail relative -mx-[18px] min-h-[calc(100vh-72px)] overflow-hidden px-[18px] pb-28 pt-3 font-sans md:-mx-8 md:px-8 md:pb-12 md:pt-6">
      <RetailSkinStyles />
      <div className="relative z-10 mx-auto w-full max-w-[1460px]">{children}</div>
    </main>
  );
}

function RetailSkinStyles() {
  return (
    <style jsx global>{`
      .tpv-retail {
        --bg: var(--surf-1);
        --surface-1: var(--surf-1);
        --surface-2: var(--surf-2);
        --surface-3: var(--surf-3);
        --text-primary: var(--tx-hi);
        --text-secondary: var(--tx-mut);
        --text-muted: var(--tx-dim);
        --border: var(--bd-1);
        --brand: var(--brand-primary);
        --brand-hover: var(--iris-600);
        --brand-soft: var(--iris-soft);
        --brand-glow: var(--iris-glow);
        --brand-fg: #0b1410;
        --success: var(--ok);
        --success-soft: var(--ok-soft);
        --warning: var(--warn);
        --warning-soft: var(--warn-soft);
        --danger: var(--err);
        --danger-soft: var(--err-soft);
        background: var(--surf-2);
        color: var(--tx-hi);
      }
      .retail-input {
        width: 100%;
        min-height: 46px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: var(--surface-2);
        color: var(--text-primary);
        outline: none;
        padding: 0 12px;
        font-size: 13px;
        font-weight: 700;
      }
      .retail-input:focus {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px var(--brand-soft);
      }
      .retail-input::placeholder { color: var(--text-muted); }
      .retail-input option {
        background: var(--surface-1);
        color: var(--text-primary);
      }
      .retail-action-row {
        display: flex;
        min-height: 56px;
        width: 100%;
        align-items: center;
        gap: 12px;
        border-bottom: 1px solid rgba(255,255,255,.08);
        padding: 0 16px;
        color: var(--text-secondary);
        text-align: left;
        font-size: 13px;
        font-weight: 800;
        transition: background .15s ease, color .15s ease, transform .15s ease;
      }
      .retail-action-row:hover {
        background: rgba(255,255,255,.04);
        color: var(--text-primary);
      }
      .retail-action-row:active { transform: scale(.99); }
      .retail-action-row.last { border-bottom: 0; }
    `}</style>
  );
}

function RetailHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">{eyebrow}</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--text-primary)] md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm font-medium text-[var(--text-secondary)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

function TpvCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-[var(--border)] bg-[var(--surface-1)] ${className}`}>
      {children}
    </div>
  );
}

function TpvButton({
  children,
  icon: Icon,
  onClick,
  type = "button",
  ghost = false,
  disabled = false,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  type?: "button" | "submit";
  ghost?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition-all active:scale-95 disabled:opacity-45 ${
        ghost
          ? "border border-white/10 bg-white/5 text-[var(--text-primary)] hover:bg-white/10"
          : "bg-[var(--brand)] text-[var(--brand-fg)] shadow-[0_10px_30px_var(--brand-glow)] hover:bg-[var(--brand-hover)]"
      }`}
    >
      {Icon && <Icon size={17} />}
      {children}
    </button>
  );
}

function IconTile({ icon: Icon, tone = "brand" }: { icon: LucideIcon; tone?: "brand" | "warn" | "muted" }) {
  const style =
    tone === "warn"
      ? { color: "var(--warning)", background: "var(--warning-soft)", borderColor: "rgba(224,162,42,.2)" }
      : tone === "muted"
        ? { color: "var(--text-secondary)", background: "rgba(255,255,255,.05)", borderColor: "rgba(255,255,255,.1)" }
        : { color: "var(--brand)", background: "var(--brand-soft)", borderColor: "rgba(52,201,136,.22)" };
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border" style={style}>
      <Icon size={20} strokeWidth={1.9} />
    </span>
  );
}

function StatCard({ icon, label, value, tone = "brand" }: { icon: LucideIcon; label: string; value: string; tone?: "brand" | "ok" | "warn" }) {
  const Icon = icon;
  return (
    <TpvCard className="p-4">
      <div className="flex items-center justify-between gap-3">
        <IconTile icon={Icon} tone={tone === "warn" ? "warn" : "brand"} />
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Vivo
        </span>
      </div>
      <div className="mt-4 font-mono text-2xl font-semibold leading-none text-[var(--text-primary)]">{value}</div>
      <div className="mt-1 text-[11px] font-semibold text-[var(--text-secondary)]">{label}</div>
    </TpvCard>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-full border px-3 text-xs font-bold transition-all active:scale-95 ${
        active
          ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
          : "border-white/10 bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      }`}
    >
      {children}
    </button>
  );
}

function SelectChip({
  icon: Icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 pl-3 pr-2 text-xs font-bold text-[var(--text-secondary)]">
      <Icon size={14} />
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-[120px] bg-transparent text-xs font-bold text-[var(--text-primary)] outline-none"
      >
        <option value="all">Todas</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function StockItem({ row, onTransfer, onCount }: { row: StockRow; onTransfer: () => void; onCount: () => void }) {
  const low = Number(row.minQty) > 0 && Number(row.qty) <= Number(row.minQty);
  return (
    <TpvCard className={`p-3 transition-colors ${low ? "border-[var(--warning)]/40" : ""}`}>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px_112px] xl:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <IconTile icon={Package} tone={low ? "warn" : "brand"} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-black text-[var(--text-primary)]">{row.sku.product.name}</h3>
              {low && <StatusPill warn>Bajo mínimo</StatusPill>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
              <span className="font-mono text-[var(--brand)]">{row.sku.sku}</span>
              <span>{variantLabel(row.sku)}</span>
              {row.sku.barcode && <span className="font-mono">{row.sku.barcode}</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Stock" value={Number(row.qty).toLocaleString("es-MX")} tone={low ? "warn" : "ok"} />
          <Metric label="Min" value={Number(row.minQty).toLocaleString("es-MX")} />
          <Metric label="Precio" value={money(row.sku.price)} />
        </div>
        <div className="flex gap-2 xl:justify-end">
          <button type="button" onClick={onTransfer} aria-label="Traspasar SKU" title="Traspasar SKU" className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)] transition-transform active:scale-95">
            <ArrowLeftRight size={18} />
          </button>
          <button type="button" onClick={onCount} aria-label="Conteo físico" title="Conteo físico" className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/5 text-[var(--text-secondary)] transition-transform active:scale-95 hover:text-[var(--text-primary)]">
            <ClipboardCheck size={18} />
          </button>
        </div>
      </div>
    </TpvCard>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "ok" | "warn" | "neutral" }) {
  const color = tone === "ok" ? "var(--success)" : tone === "warn" ? "var(--warning)" : "var(--text-primary)";
  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--surface-2)] px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[.12em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}

function StatusPill({ children, muted = false, warn = false }: { children: ReactNode; muted?: boolean; warn?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider"
      style={{
        background: warn ? "var(--warning-soft)" : muted ? "rgba(255,255,255,.06)" : "var(--brand-soft)",
        color: warn ? "var(--warning)" : muted ? "var(--text-secondary)" : "var(--brand)",
      }}
    >
      {children}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[var(--surface-2)] px-3 py-2">
      <span>{label}</span>
      <span className="min-w-0 truncate font-mono font-semibold text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 ml-1 block font-mono text-[9.5px] font-semibold uppercase tracking-[.14em] text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4">
      <div className="tpv-retail my-4 max-h-[calc(100dvh-4rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-[2rem] border border-white/10 bg-[var(--surface-1)] p-5 shadow-2xl md:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-black text-[var(--text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/5 text-[var(--text-secondary)] transition-transform active:scale-95"
          >
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ saving, onCancel, submitLabel }: { saving: boolean; onCancel: () => void; submitLabel: string }) {
  return (
    <div className="flex flex-col gap-3 pt-2 sm:flex-row">
      <TpvButton ghost onClick={onCancel} disabled={saving}>Cancelar</TpvButton>
      <TpvButton type="submit" icon={Check} disabled={saving}>{saving ? "Guardando..." : submitLabel}</TpvButton>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-32 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
      ))}
    </div>
  );
}

function StateCard({ icon: Icon, title, hint, children }: { icon: LucideIcon; title: string; hint?: string; children?: ReactNode }) {
  return (
    <TpvCard className="flex flex-col items-center px-6 py-10 text-center">
      <IconTile icon={Icon} tone="muted" />
      <div className="mt-4 text-base font-black text-[var(--text-primary)]">{title}</div>
      {hint && <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-secondary)]">{hint}</p>}
      {children && <div className="mt-5">{children}</div>}
    </TpvCard>
  );
}

