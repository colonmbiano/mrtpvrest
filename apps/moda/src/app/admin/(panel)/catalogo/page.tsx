"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Filter, ChevronDown, PackagePlus, Pencil, ArrowLeftRight, ClipboardCheck,
  AlertTriangle, Shirt, Boxes, DollarSign, RefreshCw, X, PackageCheck, PackagePlus as PackagePlusIcon, Plus,
} from "lucide-react";
import api from "@/lib/admin-api";
import { money, num } from "@/lib/admin-format";
import { StatCard, DataCard, StatusBadge } from "@/components/admin/atoms";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { sparkUp, sparkWarn, sparkUp2, sparkFlat } from "@/lib/admin-mock";

type Location = { id: string; name: string; isCentralWarehouse?: boolean };
type RetailSku = { id: string; sku: string; barcode?: string | null; size?: string | null; color?: string | null; material?: string | null; price: number; cost: number; isActive: boolean };
type RetailProduct = { id: string; name: string; brand?: string | null; category?: string | null; skus: RetailSku[] };
type StockRow = { id: string; locationId: string; skuId: string; qty: number; minQty: number; location: Location; sku: RetailSku & { product: RetailProduct } };

const inputCls = "h-11 w-full rounded-xl border bg-[var(--surf-1)] px-3.5 text-[13px] text-[var(--tx-hi)] outline-none focus:border-[var(--brand-primary)]";
const variantLabel = (s: { size?: string | null; color?: string | null; material?: string | null }) => [s.size, s.color, s.material].filter(Boolean).join(" / ") || "Variante única";
const errMsg = (e: unknown) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e instanceof Error ? e.message : "No se pudo completar la acción");
const stockStatus = (qty: number, minQty: number) => (qty <= 0 ? "sin_stock" : minQty > 0 && qty <= minQty ? "stock_bajo" : "disponible");
const statusLabel: Record<string, string> = { sin_stock: "Sin stock", stock_bajo: "Stock bajo", disponible: "Disponible" };

const emptyProduct = { name: "", category: "", brand: "", sku: "", barcode: "", size: "", color: "", material: "", price: "", cost: "" };

export default function CatalogoPage() {
  const [activeLocationId, setActiveLocationId] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("moda-admin-locationId") || "" : ""));
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<RetailProduct[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<null | "product" | "edit" | "transfer" | "count">(null);
  const [form, setForm] = useState({ ...emptyProduct });
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [existingId, setExistingId] = useState("");
  const [editSku, setEditSku] = useState<RetailSku | null>(null);
  const [editForm, setEditForm] = useState({ price: "", cost: "", barcode: "", isActive: true });
  const [tForm, setTForm] = useState({ skuId: "", toLocationId: "", qty: "1" });
  const [cForm, setCForm] = useState({ skuId: "", qty: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const q = activeLocationId ? `?locationId=${encodeURIComponent(activeLocationId)}` : "";
    try {
      const [loc, cat, stk] = await Promise.all([
        api.get<Location[]>("/api/admin/locations"),
        api.get<{ products: RetailProduct[] }>(`/api/retail/v1/catalog${q}`),
        api.get<StockRow[]>(`/api/retail/v1/stock${q}`),
      ]);
      const locs = Array.isArray(loc.data) ? loc.data : [];
      setLocations(locs);
      setProducts(cat.data.products || []);
      setStock(Array.isArray(stk.data) ? stk.data : []);
      if (!activeLocationId && locs[0]?.id) { localStorage.setItem("moda-admin-locationId", locs[0].id); setActiveLocationId(locs[0].id); }
    } catch { /* noop */ } finally { setLoading(false); }
  }, [activeLocationId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = () => setActiveLocationId(localStorage.getItem("moda-admin-locationId") || "");
    window.addEventListener("locationChanged", h);
    return () => window.removeEventListener("locationChanged", h);
  }, []);

  const categories = useMemo(() => Array.from(new Set(stock.map((r) => r.sku.product.category).filter(Boolean) as string[])).sort(), [stock]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stock.filter((r) => {
      const okQ = !q || [r.sku.sku, r.sku.barcode, r.sku.product.name, r.sku.size, r.sku.color].filter(Boolean).join(" ").toLowerCase().includes(q);
      const okCat = categoryFilter === "all" || r.sku.product.category === categoryFilter;
      const st = stockStatus(Number(r.qty), Number(r.minQty));
      const okStock = stockFilter === "all" || st === stockFilter;
      return okQ && okCat && okStock;
    });
  }, [stock, query, categoryFilter, stockFilter]);

  const stats = useMemo(() => {
    const skuCount = products.reduce((n, p) => n + (p.skus?.length || 0), 0);
    const low = stock.filter((r) => stockStatus(Number(r.qty), Number(r.minQty)) !== "disponible").length;
    const value = stock.reduce((n, r) => n + Number(r.qty || 0) * Number(r.sku.price || 0), 0);
    return { skuCount, low, cats: categories.length, value };
  }, [products, stock, categories]);

  const allSkus = useMemo(() => products.flatMap((p) => p.skus.map((s) => ({ ...s, product: p }))), [products]);

  async function createProductAndSku(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      let productId = existingId;
      if (mode === "new") {
        const r = await api.post<RetailProduct>("/api/retail/v1/catalog/products", { name: form.name, category: form.category || undefined, brand: form.brand || undefined });
        productId = r.data.id;
      }
      if (!productId) throw new Error("Selecciona o crea un producto");
      await api.post("/api/retail/v1/catalog/skus", { productId, sku: form.sku, barcode: form.barcode || undefined, size: form.size || undefined, color: form.color || undefined, material: form.material || undefined, price: Number(form.price), cost: Number(form.cost || 0) });
      setModal(null); setForm({ ...emptyProduct }); setMode("new"); setExistingId(""); await load();
    } catch (err) { alert(errMsg(err)); } finally { setSaving(false); }
  }
  function openEdit(s: RetailSku) { setEditSku(s); setEditForm({ price: String(s.price ?? ""), cost: String(s.cost ?? ""), barcode: s.barcode || "", isActive: s.isActive }); setModal("edit"); }
  async function saveEdit(e: FormEvent) {
    e.preventDefault(); if (!editSku) return; setSaving(true);
    try { await api.put(`/api/retail/v1/catalog/skus/${editSku.id}`, { price: Number(editForm.price), cost: Number(editForm.cost || 0), barcode: editForm.barcode || null, isActive: editForm.isActive }); setModal(null); setEditSku(null); await load(); }
    catch (err) { alert(errMsg(err)); } finally { setSaving(false); }
  }
  async function saveTransfer(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try { await api.post("/api/retail/v1/transfers", { fromLocationId: activeLocationId, items: [{ skuId: tForm.skuId, toLocationId: tForm.toLocationId, qty: Number(tForm.qty) }], notes: "Traspaso desde admin" }); setModal(null); setTForm({ skuId: "", toLocationId: "", qty: "1" }); await load(); }
    catch (err) { alert(errMsg(err)); } finally { setSaving(false); }
  }
  async function saveCount(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try { await api.post("/api/retail/v1/counts", { locationId: activeLocationId, clientCountId: `admin-count-${typeof window !== "undefined" ? Date.now() : 0}`, items: [{ skuId: cForm.skuId, countedQty: Number(cForm.qty) }], notes: "Conteo físico desde admin" }); setModal(null); setCForm({ skuId: "", qty: "" }); await load(); }
    catch (err) { alert(errMsg(err)); } finally { setSaving(false); }
  }

  const alerts = stock.filter((r) => stockStatus(Number(r.qty), Number(r.minQty)) !== "disponible").slice(0, 4);
  const updates = [
    { icon: PackagePlusIcon, text: "Nuevo producto agregado: Campera Puffer Beige (CMP-012)", time: "Hace 15 min" },
    { icon: Pencil, text: "Producto actualizado: Jean Slim Fit Azul (JEA-002)", time: "Hace 2 h" },
    { icon: PackageCheck, text: "Imagen actualizada: Camisa Oversize Negra (CAM-001)", time: "Hace 3 h" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <AdminTopbar title="Catálogo & Stock" subtitle="Gestiona tu inventario de productos, categorías y niveles de stock." searchPlaceholder="Buscar productos, SKU, categoría…" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-xl border bg-[var(--surf-1)] px-3 sm:max-w-xs" style={{ borderColor: "var(--bd-1)" }}>
          <Search size={16} className="text-[var(--tx-dim)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar productos…" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none text-[var(--tx-hi)] placeholder:text-[var(--tx-dim)]" />
        </label>
        <span className="inline-flex h-10 items-center gap-2 rounded-xl border bg-[var(--surf-1)] px-3 text-[13px] font-semibold text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)" }}><Filter size={15} /> Filtros</span>
        <Select value={categoryFilter} onChange={setCategoryFilter} label="Categoría" options={[{ v: "all", t: "Todas" }, ...categories.map((c) => ({ v: c, t: c }))]} />
        <Select value={stockFilter} onChange={setStockFilter} label="Estado de stock" options={[{ v: "all", t: "Todos" }, { v: "disponible", t: "Disponible" }, { v: "stock_bajo", t: "Stock bajo" }, { v: "sin_stock", t: "Sin stock" }]} />
        <button type="button" onClick={() => { setForm({ ...emptyProduct }); setMode("new"); setExistingId(""); setModal("product"); }} className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-bold text-white" style={{ background: "var(--brand-primary)" }}><PackagePlus size={16} /> Nuevo producto</button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Shirt} tone="green" title="Productos activos" value={loading ? "—" : num(stats.skuCount)} trend="12.5%" trendLabel="vs. mes anterior" spark={sparkUp} />
        <StatCard icon={AlertTriangle} tone="orange" title="Stock bajo" value={loading ? "—" : num(stats.low)} trend={`${stats.low} por revisar`} trendTone="warn" spark={sparkWarn} />
        <StatCard icon={Boxes} tone="purple" title="Categorías" value={loading ? "—" : num(stats.cats)} trend="catálogo" trendTone="up" spark={sparkFlat} />
        <StatCard icon={DollarSign} tone="blue" title="Valor inventario" value={loading ? "—" : money(stats.value)} trend="8.7%" trendLabel="vs. mes anterior" spark={sparkUp2} />
      </div>

      <DataCard title="Inventario de productos" className="mt-4" action={<button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--tx-mut)] disabled:opacity-50"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Actualizar</button>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-[var(--tx-dim)]" style={{ borderColor: "var(--bd-1)" }}>
                <th className="py-2.5 pr-3">Producto</th><th className="py-2.5 pr-3">SKU</th><th className="py-2.5 pr-3">Categoría</th><th className="py-2.5 pr-3">Precio</th><th className="py-2.5 pr-3">Stock</th><th className="py-2.5 pr-3">Estado</th><th className="py-2.5">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = stockStatus(Number(r.qty), Number(r.minQty));
                return (
                  <tr key={r.id} className="border-b text-[13px]" style={{ borderColor: "var(--bd-1)" }}>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: "var(--surf-2)", color: "var(--tx-dim)" }}><Shirt size={16} /></span>
                        <span className="min-w-0"><span className="block truncate font-semibold text-[var(--tx-hi)]">{r.sku.product.name}</span><span className="block truncate text-[11px] text-[var(--tx-mut)]">{variantLabel(r.sku)}</span></span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 font-mono text-[12px] text-[var(--tx-mut)]">{r.sku.sku}</td>
                    <td className="py-3 pr-3 text-[var(--tx-mut)]">{r.sku.product.category || "—"}</td>
                    <td className="tnum py-3 pr-3 font-semibold text-[var(--tx-hi)]">{money(r.sku.price)}</td>
                    <td className="tnum py-3 pr-3 text-[var(--tx-hi)]">{num(r.qty)} uds.</td>
                    <td className="py-3 pr-3"><StatusBadge status={st} label={statusLabel[st]} /></td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => openEdit(r.sku)} aria-label="Editar SKU" className="grid h-8 w-8 place-items-center rounded-lg border text-[var(--tx-mut)] hover:bg-[var(--surf-2)]" style={{ borderColor: "var(--bd-1)" }}><Pencil size={14} /></button>
                        <button type="button" onClick={() => { setTForm({ skuId: r.skuId, toLocationId: locations.find((l) => l.id !== activeLocationId)?.id || "", qty: "1" }); setModal("transfer"); }} aria-label="Traspasar" className="grid h-8 w-8 place-items-center rounded-lg border text-[var(--tx-mut)] hover:bg-[var(--surf-2)]" style={{ borderColor: "var(--bd-1)" }}><ArrowLeftRight size={14} /></button>
                        <button type="button" onClick={() => { setCForm({ skuId: r.skuId, qty: String(r.qty) }); setModal("count"); }} aria-label="Conteo" className="grid h-8 w-8 place-items-center rounded-lg border text-[var(--tx-mut)] hover:bg-[var(--surf-2)]" style={{ borderColor: "var(--bd-1)" }}><ClipboardCheck size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-[13px] text-[var(--tx-mut)]">Sin productos. Crea el primero con “Nuevo producto”.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="pt-2 text-[12px] text-[var(--tx-mut)]">Mostrando {num(rows.length)} de {num(stats.skuCount)} SKUs</div>
      </DataCard>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataCard title="Alertas de inventario">
          {alerts.length === 0 ? <p className="py-6 text-center text-[13px] text-[var(--tx-mut)]">Todo el stock está sobre su mínimo. 🎉</p> : (
            <ul className="space-y-2">
              {alerts.map((r) => {
                const st = stockStatus(Number(r.qty), Number(r.minQty));
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-xl px-2 py-2" style={{ background: "var(--surf-2)" }}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: st === "sin_stock" ? "var(--err-soft)" : "var(--warn-soft)", color: st === "sin_stock" ? "var(--err)" : "var(--warn)" }}><AlertTriangle size={16} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-[var(--tx-hi)]">{r.sku.product.name} ({r.sku.sku})</span><span className="block text-[11px] text-[var(--tx-mut)]">{st === "sin_stock" ? "Sin stock disponible" : "Stock por debajo del mínimo"}</span></span>
                    <span className="tnum shrink-0 text-[13px] font-bold" style={{ color: st === "sin_stock" ? "var(--err)" : "var(--warn)" }}>{num(r.qty)} uds.</span>
                  </li>
                );
              })}
            </ul>
          )}
        </DataCard>
        <DataCard title="Actualizaciones recientes">
          <ul className="space-y-1">
            {updates.map((u, i) => { const Icon = u.icon; return (
              <li key={i} className="flex items-center gap-3 px-1 py-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: "var(--iris-soft)", color: "var(--brand-dark)" }}><Icon size={15} /></span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--tx-hi)]">{u.text}</span>
                <span className="shrink-0 text-[11px] text-[var(--tx-dim)]">{u.time}</span>
              </li>
            ); })}
          </ul>
        </DataCard>
      </div>

      {modal === "product" && (
        <Modal title="Agregar producto / SKU" onClose={() => setModal(null)}>
          <form onSubmit={createProductAndSku} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMode("new")} className="min-h-10 rounded-xl border text-[13px] font-semibold" style={{ borderColor: mode === "new" ? "var(--brand-primary)" : "var(--bd-1)", color: mode === "new" ? "var(--brand-dark)" : "var(--tx-mut)", background: mode === "new" ? "var(--iris-soft)" : "var(--surf-1)" }}>Producto nuevo</button>
              <button type="button" onClick={() => setMode("existing")} disabled={products.length === 0} className="min-h-10 rounded-xl border text-[13px] font-semibold disabled:opacity-40" style={{ borderColor: mode === "existing" ? "var(--brand-primary)" : "var(--bd-1)", color: mode === "existing" ? "var(--brand-dark)" : "var(--tx-mut)", background: mode === "existing" ? "var(--iris-soft)" : "var(--surf-1)" }}>Producto existente</button>
            </div>
            {mode === "new" ? (
              <>
                <Field label="Producto"><input className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Camisa Oxford Slim" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Categoría"><input className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Camisas" /></Field>
                  <Field label="Marca"><input className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
                </div>
              </>
            ) : (
              <Field label="Producto existente"><select className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={existingId} onChange={(e) => setExistingId(e.target.value)} required><option value="">Selecciona producto</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.category ? ` / ${p.category}` : ""} ({p.skus.length} SKU)</option>)}</select></Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU"><input className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required placeholder="CAM-OXF-M-NEG" /></Field>
              <Field label="Código de barras"><input className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Talla"><input className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="M" /></Field>
              <Field label="Color"><input className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Negro" /></Field>
              <Field label="Material"><input className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} placeholder="Algodón" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio"><input type="number" min="0" step="0.01" className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></Field>
              <Field label="Costo"><input type="number" min="0" step="0.01" className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
            </div>
            <ModalActions saving={saving} onCancel={() => setModal(null)} label="Crear SKU" icon={Plus} />
          </form>
        </Modal>
      )}

      {modal === "edit" && editSku && (
        <Modal title={`Editar ${editSku.sku}`} onClose={() => setModal(null)}>
          <form onSubmit={saveEdit} className="space-y-3">
            <div className="rounded-xl border px-3 py-2 text-[12px] text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)", background: "var(--surf-2)" }}>{variantLabel(editSku)}</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio"><input type="number" min="0" step="0.01" className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} required /></Field>
              <Field label="Costo"><input type="number" min="0" step="0.01" className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={editForm.cost} onChange={(e) => setEditForm({ ...editForm, cost: e.target.value })} /></Field>
            </div>
            <Field label="Código de barras"><input className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={editForm.barcode} onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })} /></Field>
            <label className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--bd-1)" }}>
              <span className="text-[13px] font-semibold text-[var(--tx-hi)]">SKU activo</span>
              <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} className="h-5 w-5 accent-[var(--brand-primary)]" />
            </label>
            <ModalActions saving={saving} onCancel={() => setModal(null)} label="Guardar cambios" />
          </form>
        </Modal>
      )}

      {modal === "transfer" && (
        <Modal title="Traspaso entre sucursales" onClose={() => setModal(null)}>
          <form onSubmit={saveTransfer} className="space-y-3">
            <Field label="SKU origen"><select className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={tForm.skuId} onChange={(e) => setTForm({ ...tForm, skuId: e.target.value })} required><option value="">Selecciona SKU</option>{stock.map((r) => <option key={r.id} value={r.skuId}>{r.sku.sku} / {r.sku.product.name} / disp {num(r.qty)}</option>)}</select></Field>
            <Field label="Sucursal destino"><select className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={tForm.toLocationId} onChange={(e) => setTForm({ ...tForm, toLocationId: e.target.value })} required><option value="">Selecciona destino</option>{locations.filter((l) => l.id !== activeLocationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            <Field label="Cantidad"><input type="number" min="1" step="1" className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={tForm.qty} onChange={(e) => setTForm({ ...tForm, qty: e.target.value })} required /></Field>
            <ModalActions saving={saving} onCancel={() => setModal(null)} label="Registrar traspaso" icon={ArrowLeftRight} />
          </form>
        </Modal>
      )}

      {modal === "count" && (
        <Modal title="Conteo físico" onClose={() => setModal(null)}>
          <form onSubmit={saveCount} className="space-y-3">
            <Field label="SKU"><select className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={cForm.skuId} onChange={(e) => setCForm({ ...cForm, skuId: e.target.value })} required><option value="">Selecciona SKU</option>{allSkus.map((s) => <option key={s.id} value={s.id}>{s.sku} / {s.product.name}</option>)}</select></Field>
            <Field label="Conteo real"><input type="number" min="0" step="1" className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={cForm.qty} onChange={(e) => setCForm({ ...cForm, qty: e.target.value })} required /></Field>
            <ModalActions saving={saving} onCancel={() => setModal(null)} label="Aplicar conteo" icon={ClipboardCheck} />
          </form>
        </Modal>
      )}
    </div>
  );
}

function Select({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: Array<{ v: string; t: string }> }) {
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-xl border bg-[var(--surf-1)] px-3 text-[13px] text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)" }}>
      <span className="text-[var(--tx-dim)]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent font-semibold text-[var(--tx-hi)] outline-none">{options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}</select>
      <ChevronDown size={13} className="text-[var(--tx-dim)]" />
    </label>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[12px] font-semibold text-[var(--tx-mut)]">{label}</span>{children}</label>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-6 w-full max-w-xl rounded-[20px] border bg-[var(--surf-1)] p-5 shadow-2xl" style={{ borderColor: "var(--bd-1)" }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-[var(--tx-hi)]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-lg text-[var(--tx-mut)] hover:bg-[var(--surf-2)]"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function ModalActions({ saving, onCancel, label, icon: Icon }: { saving: boolean; onCancel: () => void; label: string; icon?: typeof Plus }) {
  return (
    <div className="flex gap-2 pt-2">
      <button type="button" onClick={onCancel} className="flex-1 rounded-xl border py-2.5 text-[13px] font-semibold text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)" }}>Cancelar</button>
      <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: "var(--brand-primary)" }}>{Icon && <Icon size={15} />}{saving ? "Guardando…" : label}</button>
    </div>
  );
}
