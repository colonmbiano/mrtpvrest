"use client";

// Listas de precio por tipo de cliente (Público, Contratista, Mayoreo…).
//
// El backend ya resolvía el precio por lista al cobrar y el POS ya sabía
// elegirla, pero las listas y sus precios solo se podían crear por API o por
// seed: sin esta pantalla la función existía y era invendible.
//
// Dos reglas que la UI tiene que hacer evidentes porque se pagan en dinero:
//
//  1. HEREDA. Un SKU sin fila en la lista NO vale 0: cobra su precio de
//     catálogo. Por eso el input vacío muestra el precio de catálogo como
//     placeholder y la fila se marca "hereda" — un input en blanco que
//     pareciera "sin precio" invitaría a capturar 179 precios de más.
//  2. La lista compite con el escalón de mayoreo y gana el MÁS BARATO
//     (`unitPriceFor` en lib/retail.ts, espejo de `priceFor` del backend). Un
//     precio de lista más caro que el catálogo casi siempre es un dedazo, así
//     que se marca en pantalla.
//
// El precio lo sigue resolviendo el servidor al cobrar: esto es captura, no
// autoridad.

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Star, Trash2, Pencil, X, RefreshCw, Percent, Tags,
  AlertTriangle, ChevronDown, Users, Check,
} from "lucide-react";
import api from "@/lib/admin-api";
import { money, num } from "@/lib/admin-format";
import { DataCard } from "@/components/admin/atoms";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { DEFAULT_GIRO, giroConfig, isGiro, type Giro, type SkuAttrKey } from "@/lib/giro";
import { setGiro as cacheGiro } from "@/lib/tenant";

type PriceList = { id: string; name: string; isDefault: boolean; sortOrder: number };
type PriceListItem = { id: string; priceListId: string; price: number | string };
type RetailSku = {
  id: string; sku: string; barcode?: string | null;
  size?: string | null; color?: string | null; material?: string | null; style?: string | null;
  price: number | string; cost: number | string; isActive: boolean;
  unitOfMeasure?: string | null;
  priceListItems?: PriceListItem[];
};
type RetailProduct = { id: string; name: string; brand?: string | null; category?: string | null; skus: RetailSku[] };
/** Fila de la tabla: el SKU con su producto ya resuelto. */
type Row = RetailSku & { product: RetailProduct };

/** skuId → precio de ese SKU en una lista. Se mantiene aparte del catálogo para
 *  poder refrescar una celda sin re-fetchear (y perder el scroll de 179 filas). */
type ItemMap = Record<string, { id: string; price: number }>;
/** priceListId → sus precios. Se indexan TODAS las listas de una vez, no solo la
 *  seleccionada: si se re-derivara al cambiar de lista, saldría del catálogo que
 *  se bajó al cargar —, y ese catálogo no tiene los precios capturados desde esta
 *  pantalla. Cambiar de lista y volver los borraría de la vista aunque estén en la
 *  BD. Aquí las escrituras parchan este índice y sobreviven al ir y venir. */
type ItemsByList = Record<string, ItemMap>;

const inputCls = "h-11 w-full rounded-xl border bg-[var(--surf-1)] px-3.5 text-[13px] text-[var(--tx-hi)] outline-none focus:border-[var(--brand-primary)]";
const errMsg = (e: unknown) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e instanceof Error ? e.message : "No se pudo completar la acción");
const variantLabelFor = (giro: Giro, s: Partial<Record<SkuAttrKey, string | null | undefined>>) =>
  giroConfig(giro).attrs.map((a) => s[a.key]).filter(Boolean).join(" / ");
/** Los precios son Decimal(12,2) en la BD: redondear igual evita mandar un
 *  243.79999999999998 salido de multiplicar por un porcentaje. */
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Margen sobre precio de venta. null si no hay costo capturado: un margen de
 *  100% porque el costo está en 0 sería peor que no decir nada. */
const marginPct = (price: number, cost: number): number | null =>
  price > 0 && cost > 0 ? ((price - cost) / price) * 100 : null;

// El servidor acepta 500 por transacción. Con eso un catálogo típico entra de un
// solo viaje y es atómico de verdad; arriba de 500 se parte en varias
// transacciones (cada una entra o no entra completa).
const CHUNK = 500;

export default function ListasPage() {
  const [giro, setGiroState] = useState<Giro>(DEFAULT_GIRO);
  const [lists, setLists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<RetailProduct[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [itemsByList, setItemsByList] = useState<ItemsByList>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busySkus, setBusySkus] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<null | "new" | "rename" | "bulk">(null);
  const [listForm, setListForm] = useState({ name: "", isDefault: false });
  const [bulkForm, setBulkForm] = useState({ pct: "", roundPeso: true });

  const selected = useMemo(() => lists.find((l) => l.id === selectedId) || null, [lists, selectedId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ products: RetailProduct[]; giro?: string; priceLists?: PriceList[] }>(
        "/api/retail/v1/catalog",
      );
      if (isGiro(data.giro)) { setGiroState(data.giro); cacheGiro(data.giro); }
      setProducts(data.products || []);
      const pls = data.priceLists || [];
      setLists(pls);
      // Preselección: la misma que hace el POS (la default), o la primera.
      setSelectedId((prev) => (prev && pls.some((l) => l.id === prev) ? prev : pls.find((l) => l.isDefault)?.id || pls[0]?.id || ""));
      setDrafts({});
    } catch (e) { alert(errMsg(e)); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const allRows: Row[] = useMemo(
    () => products.flatMap((p) => (p.skus || []).map((s) => ({ ...s, product: p }))),
    [products],
  );

  // Se re-deriva SOLO cuando llega catálogo nuevo (load), nunca al cambiar de
  // lista: ver ItemsByList.
  useEffect(() => {
    const byList: ItemsByList = {};
    for (const r of allRows) {
      for (const it of r.priceListItems || []) {
        (byList[it.priceListId] ||= {})[r.id] = { id: it.id, price: Number(it.price) };
      }
    }
    setItemsByList(byList);
  }, [allRows]);

  const items: ItemMap = useMemo(() => itemsByList[selectedId] || {}, [itemsByList, selectedId]);
  // Lo tecleado y no confirmado no debe arrastrarse a otra lista.
  useEffect(() => { setDrafts({}); }, [selectedId]);

  const categories = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.product.category).filter(Boolean) as string[])).sort(),
    [allRows],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((r) => {
      const okQ = !q || [r.sku, r.barcode, r.product.name, r.size, r.color, r.material, r.style]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
      const okCat = categoryFilter === "all" || r.product.category === categoryFilter;
      return okQ && okCat;
    });
  }, [allRows, query, categoryFilter]);

  const withPrice = useMemo(() => rows.filter((r) => items[r.id] !== undefined).length, [rows, items]);

  function markBusy(skuId: string, on: boolean) {
    setBusySkus((s) => { const n = new Set(s); if (on) n.add(skuId); else n.delete(skuId); return n; });
  }

  // ── Escritura de un precio ────────────────────────────────────────────────
  async function savePrice(sku: Row, price: number) {
    markBusy(sku.id, true);
    try {
      const { data } = await api.put<PriceListItem>("/api/retail/v1/catalog/price-list-items", {
        priceListId: selectedId, skuId: sku.id, price,
      });
      setItemsByList((m) => ({ ...m, [selectedId]: { ...(m[selectedId] || {}), [sku.id]: { id: data.id, price } } }));
    } catch (e) { alert(errMsg(e)); } finally { markBusy(sku.id, false); }
  }

  /** Quitar el precio NO es ponerlo en 0: devuelve el SKU a precio de catálogo. */
  async function clearPrice(sku: Row, itemId: string) {
    markBusy(sku.id, true);
    try {
      await api.delete(`/api/retail/v1/catalog/price-list-items/${itemId}`);
      setItemsByList((m) => { const l = { ...(m[selectedId] || {}) }; delete l[sku.id]; return { ...m, [selectedId]: l }; });
    } catch (e) { alert(errMsg(e)); } finally { markBusy(sku.id, false); }
  }

  /**
   * Confirma lo tecleado en una fila. Se llama al salir del input o con Enter.
   * El draft se descarta SIEMPRE al confirmar: si la escritura falla, la celda
   * revierte al valor que el servidor tiene de verdad en vez de quedarse
   * mostrando un precio que nadie guardó.
   */
  async function commit(sku: Row) {
    const raw = drafts[sku.id];
    if (raw === undefined) return; // no lo tocaron
    setDrafts((d) => { const n = { ...d }; delete n[sku.id]; return n; });
    const existing = items[sku.id];
    const trimmed = raw.trim();

    if (trimmed === "") { if (existing) await clearPrice(sku, existing.id); return; }

    const price = round2(Number(trimmed));
    if (!Number.isFinite(price) || price < 0) { alert("El precio no puede ser negativo."); return; }
    if (existing && Math.abs(existing.price - price) < 0.005) return; // sin cambio real

    const catalog = Number(sku.price);
    if (price > catalog) {
      // OJO con la semántica: el min() de `unitPriceFor` es entre la lista y el
      // ESCALÓN, no entre la lista y el catálogo. Un precio de lista arriba del
      // catálogo SÍ se cobra — el cliente paga más que el público. Es válido
      // (una lista puede ser un recargo) pero casi siempre es un dedazo, así que
      // se avisa sin bloquear.
      if (!confirm(`${money(price)} es MÁS caro que el precio de catálogo (${money(catalog)}).\n\nEste cliente pagaría MÁS que el público general — este precio sí se cobra. ¿Es a propósito?`)) return;
    }
    const cost = Number(sku.cost || 0);
    if (cost > 0 && price < cost) {
      if (!confirm(`${money(price)} está por DEBAJO del costo (${money(cost)}). Cada venta perdería ${money(cost - price)}.\n\n¿Guardar de todos modos?`)) return;
    }
    await savePrice(sku, price);
  }

  // ── Listas ────────────────────────────────────────────────────────────────
  async function createList(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const { data } = await api.post<PriceList>("/api/retail/v1/catalog/price-lists", {
        name: listForm.name.trim(),
        isDefault: listForm.isDefault,
        sortOrder: lists.length,
      });
      setModal(null); setListForm({ name: "", isDefault: false });
      await load();
      setSelectedId(data.id);
    } catch (e) { alert(errMsg(e)); } finally { setSaving(false); }
  }

  async function renameList(e: FormEvent) {
    e.preventDefault(); if (!selected) return; setSaving(true);
    try {
      await api.put(`/api/retail/v1/catalog/price-lists/${selected.id}`, { name: listForm.name.trim() });
      setModal(null); await load();
    } catch (e) { alert(errMsg(e)); } finally { setSaving(false); }
  }

  async function makeDefault(l: PriceList) {
    setSaving(true);
    try {
      await api.put(`/api/retail/v1/catalog/price-lists/${l.id}`, { isDefault: true });
      // Una sola default por restaurante: el backend apaga las demás.
      setLists((ls) => ls.map((x) => ({ ...x, isDefault: x.id === l.id })));
    } catch (e) { alert(errMsg(e)); } finally { setSaving(false); }
  }

  async function deleteList(l: PriceList) {
    const n = Object.keys(items).length;
    if (!confirm(`¿Eliminar la lista «${l.name}»?\n\nSe borran también sus ${n} precio(s). Los SKUs vuelven a precio de catálogo para esos clientes. Las ventas ya cobradas no cambian.`)) return;
    setSaving(true);
    try { await api.delete(`/api/retail/v1/catalog/price-lists/${l.id}`); setSelectedId(""); await load(); }
    catch (e) { alert(errMsg(e)); } finally { setSaving(false); }
  }

  // ── Alta masiva por porcentaje ────────────────────────────────────────────
  // Lo que hace vendible la pantalla: nadie captura 179 precios a mano para
  // decir "al contratista le hago 8% de descuento".
  const bulkPct = Number(bulkForm.pct);
  const bulkValid = Number.isFinite(bulkPct) && bulkPct > 0 && bulkPct < 100;
  const bulkPriceFor = useCallback(
    (r: Row) => {
      const raw = Number(r.price) * (1 - bulkPct / 100);
      const out = bulkForm.roundPeso ? Math.round(raw) : round2(raw);
      // Redondear a peso no puede regalar el artículo: un SKU de $0.80 con -50%
      // daría $0.00. Ahí gana el precio con centavos.
      return out === 0 && raw > 0 ? round2(raw) : out;
    },
    [bulkPct, bulkForm.roundPeso],
  );
  const bulkUnderCost = useMemo(
    () => (bulkValid ? rows.filter((r) => Number(r.cost || 0) > 0 && bulkPriceFor(r) < Number(r.cost)).length : 0),
    [bulkValid, rows, bulkPriceFor],
  );

  async function applyBulk(e: FormEvent) {
    e.preventDefault();
    if (!selected || !bulkValid) return;
    const payload = rows.map((r) => ({ skuId: r.id, price: bulkPriceFor(r) }));
    if (!payload.length) return;
    if (!confirm(`Se escribirán ${payload.length} precio(s) en «${selected.name}» a ${bulkPct}% abajo de catálogo.${bulkUnderCost ? `\n\n⚠️ ${bulkUnderCost} quedarían por debajo del costo.` : ""}\n\nLos precios que ya tenías en esta lista se sobrescriben. ¿Continuar?`)) return;
    setSaving(true);
    try {
      for (let i = 0; i < payload.length; i += CHUNK) {
        await api.put("/api/retail/v1/catalog/price-list-items/bulk", {
          priceListId: selected.id, items: payload.slice(i, i + CHUNK),
        });
      }
      setModal(null); setBulkForm({ pct: "", roundPeso: true });
      await load();
    } catch (e) { alert(errMsg(e)); } finally { setSaving(false); }
  }

  const cfg = giroConfig(giro);

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <AdminTopbar title="Listas de precio" subtitle="Un precio distinto por tipo de cliente. El mostrador elige la lista al cobrar." searchPlaceholder="Buscar SKU, producto…" />

      {/* Selector de lista */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {lists.map((l) => {
          const active = l.id === selectedId;
          return (
            <button
              key={l.id} type="button" onClick={() => setSelectedId(l.id)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-semibold transition-colors"
              style={{
                borderColor: active ? "var(--brand-primary)" : "var(--bd-1)",
                background: active ? "var(--iris-soft)" : "var(--surf-1)",
                color: active ? "var(--brand-dark)" : "var(--tx-mut)",
              }}
            >
              <Tags size={15} />
              {l.name}
              {l.isDefault && <Star size={13} fill="currentColor" style={{ color: "var(--warn)" }} />}
            </button>
          );
        })}
        <button type="button" onClick={() => { setListForm({ name: "", isDefault: lists.length === 0 }); setModal("new"); }}
          className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-bold text-white" style={{ background: "var(--brand-primary)" }}>
          <Plus size={16} /> Nueva lista
        </button>
      </div>

      {loading ? (
        <DataCard title="Precios"><p className="py-10 text-center text-[13px] text-[var(--tx-mut)]">Cargando…</p></DataCard>
      ) : !selected ? (
        <DataCard title="Sin listas de precio">
          <div className="px-2 py-8 text-center">
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "var(--iris-soft)", color: "var(--brand-dark)" }}><Users size={22} /></span>
            <p className="mx-auto max-w-lg text-[13px] text-[var(--tx-mut)]">
              Una lista de precio es un <b className="text-[var(--tx-hi)]">tipo de cliente</b>: al cobrar, el mostrador la elige y
              {cfg.wholesale ? " el precio cambia solo. Lo típico en este giro es «Público» y «Contratista»." : " el precio cambia solo. Por ejemplo «Público» y «Mayoreo»."}
            </p>
            <p className="mx-auto mt-2 max-w-lg text-[12px] text-[var(--tx-dim)]">
              Sin listas, todos pagan el precio de catálogo. No hace falta capturar todo el catálogo: los SKUs que no toques siguen en su precio normal.
            </p>
            <button type="button" onClick={() => { setListForm({ name: "", isDefault: true }); setModal("new"); }}
              className="mx-auto mt-5 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-bold text-white" style={{ background: "var(--brand-primary)" }}>
              <Plus size={16} /> Crear la primera lista
            </button>
          </div>
        </DataCard>
      ) : (
        <DataCard
          title={`Precios de «${selected.name}»`}
          action={
            <div className="flex items-center gap-1.5">
              {selected.isDefault ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}><Star size={12} fill="currentColor" /> Predeterminada</span>
              ) : (
                <button type="button" onClick={() => makeDefault(selected)} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold text-[var(--tx-mut)] disabled:opacity-50" style={{ borderColor: "var(--bd-1)" }}><Star size={12} /> Hacer predeterminada</button>
              )}
              <button type="button" onClick={() => { setListForm({ name: selected.name, isDefault: selected.isDefault }); setModal("rename"); }} aria-label="Renombrar lista" title="Renombrar" className="grid h-7 w-7 place-items-center rounded-lg border text-[var(--tx-mut)] hover:bg-[var(--surf-2)]" style={{ borderColor: "var(--bd-1)" }}><Pencil size={13} /></button>
              <button type="button" onClick={() => deleteList(selected)} disabled={saving} aria-label="Eliminar lista" title="Eliminar" className="grid h-7 w-7 place-items-center rounded-lg border text-[var(--tx-mut)] hover:text-red-500 disabled:opacity-50" style={{ borderColor: "var(--bd-1)" }}><Trash2 size={13} /></button>
              <button type="button" onClick={load} disabled={loading} aria-label="Actualizar" className="grid h-7 w-7 place-items-center rounded-lg border text-[var(--tx-mut)] disabled:opacity-50" style={{ borderColor: "var(--bd-1)" }}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
            </div>
          }
        >
          <div className="mb-3 rounded-xl border px-3 py-2 text-[12px] text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)", background: "var(--surf-2)" }}>
            {selected.isDefault
              ? <>Esta lista viene <b className="text-[var(--tx-hi)]">preseleccionada</b> en la caja. </>
              : <>La caja la elige a mano al cobrar. </>}
            Un SKU sin precio aquí <b className="text-[var(--tx-hi)]">hereda</b> el de catálogo — solo captura los que cambian.
            {cfg.wholesale && <> Si además tiene mayoreo por volumen, se cobra <b className="text-[var(--tx-hi)]">el más barato de los dos</b>.</>}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-xl border bg-[var(--surf-1)] px-3 sm:max-w-xs" style={{ borderColor: "var(--bd-1)" }}>
              <Search size={16} className="text-[var(--tx-dim)]" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar SKU, producto…" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none text-[var(--tx-hi)] placeholder:text-[var(--tx-dim)]" />
            </label>
            <label className="inline-flex h-10 items-center gap-2 rounded-xl border bg-[var(--surf-1)] px-3 text-[13px] text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)" }}>
              <span className="text-[var(--tx-dim)]">Categoría</span>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="bg-transparent font-semibold text-[var(--tx-hi)] outline-none">
                <option value="all">Todas</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={13} className="text-[var(--tx-dim)]" />
            </label>
            <button type="button" onClick={() => { setBulkForm({ pct: "", roundPeso: true }); setModal("bulk"); }} disabled={rows.length === 0}
              className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-semibold text-[var(--tx-hi)] disabled:opacity-50" style={{ borderColor: "var(--bd-1)" }}>
              <Percent size={15} /> Aplicar % sobre catálogo
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-[var(--tx-dim)]" style={{ borderColor: "var(--bd-1)" }}>
                  <th className="py-2.5 pr-3">Producto</th>
                  <th className="py-2.5 pr-3">SKU</th>
                  <th className="py-2.5 pr-3 text-right">Catálogo</th>
                  <th className="py-2.5 pr-3 text-right">Costo</th>
                  <th className="py-2.5 pr-3">Precio en «{selected.name}»</th>
                  <th className="py-2.5 text-right">Margen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const item = items[r.id];
                  const catalog = Number(r.price);
                  const cost = Number(r.cost || 0);
                  const effective = item ? item.price : catalog;
                  const m = marginPct(effective, cost);
                  const busy = busySkus.has(r.id);
                  const variant = variantLabelFor(giro, r);
                  return (
                    <tr key={r.id} className="border-b text-[13px]" style={{ borderColor: "var(--bd-1)" }}>
                      <td className="py-2.5 pr-3">
                        <span className="block truncate font-semibold text-[var(--tx-hi)]">{r.product.name}</span>
                        {variant && <span className="block truncate text-[11px] text-[var(--tx-mut)]">{variant}</span>}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[12px] text-[var(--tx-mut)]">{r.sku}</td>
                      <td className="tnum py-2.5 pr-3 text-right text-[var(--tx-hi)]">{money(catalog)}</td>
                      <td className="tnum py-2.5 pr-3 text-right text-[var(--tx-dim)]">{cost > 0 ? money(cost) : "—"}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min="0" step="0.01" inputMode="decimal"
                            className="h-9 w-28 rounded-lg border bg-[var(--surf-1)] px-2.5 text-right text-[13px] font-semibold tnum text-[var(--tx-hi)] outline-none focus:border-[var(--brand-primary)] disabled:opacity-50"
                            style={{ borderColor: item ? "var(--brand-primary)" : "var(--bd-1)" }}
                            placeholder={catalog.toFixed(2)}
                            disabled={busy}
                            value={drafts[r.id] ?? (item ? String(item.price) : "")}
                            onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                            onBlur={() => commit(r)}
                            // Escape descarta el draft pero NO hace blur: un
                            // blur() aquí dispararía commit() en este mismo tick,
                            // leyendo el draft viejo del closure (setDrafts aún
                            // no re-renderizó) y guardando justo lo que se quiso
                            // cancelar. Sin blur, el commit posterior ya no
                            // encuentra draft y sale sin escribir.
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") setDrafts((d) => { const n = { ...d }; delete n[r.id]; return n; });
                            }}
                            // Sin esto, un scroll sobre la tabla cambia precios.
                            onWheel={(e) => e.currentTarget.blur()}
                            aria-label={`Precio de ${r.sku} en ${selected.name}`}
                          />
                          {busy ? (
                            <RefreshCw size={13} className="animate-spin text-[var(--tx-dim)]" />
                          ) : item ? (
                            <button type="button" onClick={() => clearPrice(r, item.id)} title="Quitar precio (vuelve a catálogo)" aria-label={`Quitar precio de ${r.sku}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--tx-dim)] hover:text-red-500"><X size={13} /></button>
                          ) : (
                            <span className="shrink-0 text-[11px] text-[var(--tx-dim)]">hereda</span>
                          )}
                        </div>
                      </td>
                      <td className="tnum py-2.5 text-right">
                        {m === null ? <span className="text-[var(--tx-dim)]">—</span> : (
                          <span className="inline-flex items-center gap-1 font-semibold" style={{ color: m <= 0 ? "var(--err)" : "var(--tx-hi)" }}>
                            {m <= 0 && <AlertTriangle size={12} />}{m.toFixed(1)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-[13px] text-[var(--tx-mut)]">
                    {allRows.length === 0 ? "Aún no hay SKUs en el catálogo." : "Ningún SKU coincide con el filtro."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="pt-2 text-[12px] text-[var(--tx-mut)]">
            {num(withPrice)} con precio propio · {num(rows.length - withPrice)} heredan catálogo
            {rows.length !== allRows.length && <> · mostrando {num(rows.length)} de {num(allRows.length)}</>}
          </div>
        </DataCard>
      )}

      {(modal === "new" || modal === "rename") && (
        <Modal title={modal === "new" ? "Nueva lista de precio" : `Renombrar «${selected?.name}»`} onClose={() => setModal(null)}>
          <form onSubmit={modal === "new" ? createList : renameList} className="space-y-3">
            <Field label="Nombre">
              <input className={inputCls} style={{ borderColor: "var(--bd-1)" }} value={listForm.name}
                onChange={(e) => setListForm({ ...listForm, name: e.target.value })} required autoFocus
                placeholder={cfg.wholesale ? "Contratista" : "Mayoreo"} />
            </Field>
            {modal === "new" && (
              <>
                <label className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--bd-1)" }}>
                  <span>
                    <span className="block text-[13px] font-semibold text-[var(--tx-hi)]">Preseleccionar en la caja</span>
                    <span className="block text-[11px] text-[var(--tx-mut)]">El mostrador arranca con esta lista. Solo una puede serlo.</span>
                  </span>
                  <input type="checkbox" checked={listForm.isDefault} onChange={(e) => setListForm({ ...listForm, isDefault: e.target.checked })} className="h-5 w-5 shrink-0 accent-[var(--brand-primary)]" />
                </label>
                <p className="text-[12px] text-[var(--tx-dim)]">
                  La lista nace vacía: todos los SKUs heredan su precio de catálogo hasta que captures los que cambian.
                </p>
              </>
            )}
            <ModalActions saving={saving} onCancel={() => setModal(null)} label={modal === "new" ? "Crear lista" : "Guardar"} icon={modal === "new" ? Plus : Check} />
          </form>
        </Modal>
      )}

      {modal === "bulk" && selected && (
        <Modal title={`Aplicar % sobre catálogo · «${selected.name}»`} onClose={() => setModal(null)}>
          <form onSubmit={applyBulk} className="space-y-3">
            <div className="rounded-xl border px-3 py-2 text-[12px] text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)", background: "var(--surf-2)" }}>
              Calcula el precio de cada SKU a partir del de catálogo y lo escribe en esta lista.
              Aplica a los <b className="text-[var(--tx-hi)]">{num(rows.length)}</b> SKU(s) que estás viendo ahora
              {rows.length !== allRows.length ? " (filtro activo)" : ""} y sobrescribe lo que ya hubiera.
              Después puedes corregir cualquiera a mano.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Descuento sobre catálogo (%)">
                <input type="number" min="0.1" max="99.9" step="0.1" className={inputCls} style={{ borderColor: "var(--bd-1)" }}
                  value={bulkForm.pct} onChange={(e) => setBulkForm({ ...bulkForm, pct: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()} placeholder="8" required autoFocus />
              </Field>
              <label className="flex items-end pb-3">
                <span className="flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--bd-1)" }}>
                  <span className="text-[12px] font-semibold text-[var(--tx-hi)]">Redondear a peso</span>
                  <input type="checkbox" checked={bulkForm.roundPeso} onChange={(e) => setBulkForm({ ...bulkForm, roundPeso: e.target.checked })} className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]" />
                </span>
              </label>
            </div>

            {/* Vista previa: un % mal tecleado se ve aquí y no en la caja. */}
            {bulkValid && (
              <div className="space-y-2">
                <div className="rounded-xl border divide-y" style={{ borderColor: "var(--bd-1)" }}>
                  {rows.slice(0, 3).map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]">
                      <span className="min-w-0 flex-1 truncate text-[var(--tx-mut)]">{r.product.name}</span>
                      <span className="tnum shrink-0 text-[var(--tx-dim)] line-through">{money(Number(r.price))}</span>
                      <span className="tnum shrink-0 font-bold text-[var(--tx-hi)]">{money(bulkPriceFor(r))}</span>
                    </div>
                  ))}
                  {rows.length > 3 && <div className="px-3 py-1.5 text-center text-[11px] text-[var(--tx-dim)]">y {num(rows.length - 3)} más</div>}
                </div>
                {bulkUnderCost > 0 && (
                  <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-[12px]" style={{ background: "var(--err-soft)", color: "var(--err)" }}>
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span><b>{bulkUnderCost}</b> SKU(s) quedarían por debajo de su costo. Se guardan igual si continúas, pero cada venta perdería dinero.</span>
                  </div>
                )}
              </div>
            )}
            <ModalActions saving={saving} onCancel={() => setModal(null)} label={bulkValid ? `Escribir ${num(rows.length)} precios` : "Escribir precios"} icon={Percent} disabled={!bulkValid} />
          </form>
        </Modal>
      )}
    </div>
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
function ModalActions({ saving, onCancel, label, icon: Icon, disabled }: { saving: boolean; onCancel: () => void; label: string; icon?: typeof Plus; disabled?: boolean }) {
  return (
    <div className="flex gap-2 pt-2">
      <button type="button" onClick={onCancel} className="flex-1 rounded-xl border py-2.5 text-[13px] font-semibold text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)" }}>Cancelar</button>
      <button type="submit" disabled={saving || disabled} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: "var(--brand-primary)" }}>{Icon && <Icon size={15} />}{saving ? "Guardando…" : label}</button>
    </div>
  );
}
