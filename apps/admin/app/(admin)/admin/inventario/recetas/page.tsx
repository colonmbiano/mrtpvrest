"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, Download, Upload, Save, Sparkles, Plus,
  Layers, X, NotebookText, ClipboardList,
} from "lucide-react";
import api from "@/lib/api";
import ImportTemplateModal from "@/components/ImportTemplateModal";
import {
  WtScreen, PageHeader, WtCard, PrimaryBtn, EmptyState, money,
} from "@/components/warmtech";

// /admin/inventario/recetas · Editor de Recipe (escandallo final 1:1 con
// MenuItem) usando los endpoints nuevos `/api/recipes`.
//
// Una Recipe vincula 1:1 con MenuItem y guarda:
//   · metadata pricing (priceDelivery, platformCommissionPct, marginErrorPct,
//     targetMarginPct)
//   · N RecipeItem (cada uno apunta a Ingredient XOR SubRecipe con qty + unit)
//
// Cost calculation (cliente):
//   totalCost = Σ items.qty × (1+wastage/100) × (ingredient.cost || subRecipeCost)
//   margenDineIn = (MenuItem.price - totalCost) / MenuItem.price
//   margenDelivery = (priceDelivery - totalCost - commission) / priceDelivery

type BaseUnit = "GRAM" | "ML" | "PIECE";

const BASE_UNIT_LABEL: Record<BaseUnit, string> = {
  GRAM: "g", ML: "ml", PIECE: "pz",
};

interface MenuItemVariant {
  id: string;
  name: string;
  price: number;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  categoryId?: string;
  variants?: MenuItemVariant[];
}

interface Ingredient {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  cost: number;
}

interface SubRecipe {
  id: string;
  name: string;
  yieldUnit: BaseUnit;
}

interface RecipeItem {
  // existente en DB (id) o nuevo (sin id)
  id?: string;
  ingredientId: string | null;
  subRecipeId: string | null;
  quantity: number;
  unit: BaseUnit;
  wastagePercent: number;
  // hidratado para display
  refName?: string;
  refCost?: number; // cost por unidad del ingrediente (no aplica a subreceta aún)
}

interface RecipeData {
  id: string;
  menuItemId: string;
  marginErrorPct: number;
  targetMarginPct: number | null;
  priceDelivery: number | null;
  platformCommissionPct: number | null;
  items: Array<{
    id: string;
    ingredientId: string | null;
    subRecipeId: string | null;
    quantity: number;
    unit: BaseUnit;
    wastagePercent: number;
    ingredient?: { id: string; name: string; baseUnit: BaseUnit; cost: number };
    subRecipe?: { id: string; name: string; yieldUnit: BaseUnit };
  }>;
}

const cellCls = "rounded-lg px-3 py-2 text-sm text-tx outline-none transition-colors focus:border-primary";
const cellStyle = { background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;

export default function RecetasPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MenuItem | null>(null);
  // Variante en edición: null = receta base del producto.
  const [variantId, setVariantId] = useState<string | null>(null);

  const [items, setItems] = useState<RecipeItem[]>([]);
  const [marginErrorPct, setMarginErrorPct] = useState<string>("0");
  const [targetMarginPct, setTargetMarginPct] = useState<string>("");
  const [priceDelivery, setPriceDelivery] = useState<string>("");
  const [platformCommissionPct, setPlatformCommissionPct] = useState<string>("");

  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/api/menu/items"),
      api.get("/api/inventory/ingredients"),
      api.get("/api/recipes/subrecipes"),
    ])
      .then(([m, i, s]) => {
        setMenuItems(m.data || []);
        setIngredients(i.data || []);
        setSubRecipes(s.data || []);
      })
      .catch(() => {});
  }, []);

  async function selectItem(item: MenuItem) {
    setSelected(item);
    setVariantId(null);
    await loadRecipe(item.id, null);
  }

  async function pickVariant(vId: string | null) {
    if (!selected) return;
    setVariantId(vId);
    await loadRecipe(selected.id, vId);
  }

  async function loadRecipe(menuItemId: string, vId: string | null) {
    setLoadingRecipe(true);
    setMsg(null);
    try {
      const qs = vId ? `?variantId=${encodeURIComponent(vId)}` : "";
      const { data } = await api.get<RecipeData | null>(`/api/recipes/by-menu-item/${menuItemId}${qs}`);
      if (data) {
        setItems(
          (data.items || []).map((r) => ({
            id: r.id,
            ingredientId: r.ingredientId,
            subRecipeId: r.subRecipeId,
            quantity: Number(r.quantity || 0),
            unit: r.unit,
            wastagePercent: Number(r.wastagePercent || 0),
            refName: r.ingredient?.name || r.subRecipe?.name || "",
            refCost: r.ingredient ? Number(r.ingredient.cost || 0) : undefined,
          })),
        );
        setMarginErrorPct(String(data.marginErrorPct ?? 0));
        setTargetMarginPct(data.targetMarginPct != null ? String(data.targetMarginPct) : "");
        setPriceDelivery(data.priceDelivery != null ? String(data.priceDelivery) : "");
        setPlatformCommissionPct(
          data.platformCommissionPct != null ? String(data.platformCommissionPct) : "",
        );
      } else {
        // Sin receta — formulario vacío para crearla
        setItems([]);
        setMarginErrorPct("0");
        setTargetMarginPct("");
        setPriceDelivery("");
        setPlatformCommissionPct("");
      }
    } catch (err: any) {
      setMsg({ kind: "err", text: err?.response?.data?.error || "No se pudo cargar la receta" });
    } finally {
      setLoadingRecipe(false);
    }
  }

  function addItem(kind: "ingredient" | "subrecipe") {
    setItems((prev) => [
      ...prev,
      {
        ingredientId: kind === "ingredient" ? "" : null,
        subRecipeId: kind === "subrecipe" ? "" : null,
        quantity: 0,
        unit: "GRAM",
        wastagePercent: 0,
      },
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, patch: Partial<RecipeItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function pickIngredient(idx: number, ingredientId: string) {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) {
      updateItem(idx, { ingredientId: "", refName: "", refCost: undefined });
      return;
    }
    updateItem(idx, {
      ingredientId: ing.id,
      subRecipeId: null,
      unit: ing.baseUnit,
      refName: ing.name,
      refCost: Number(ing.cost || 0),
    });
  }

  function pickSubRecipe(idx: number, subRecipeId: string) {
    const sub = subRecipes.find((s) => s.id === subRecipeId);
    if (!sub) {
      updateItem(idx, { subRecipeId: "", refName: "" });
      return;
    }
    updateItem(idx, {
      subRecipeId: sub.id,
      ingredientId: null,
      unit: sub.yieldUnit,
      refName: sub.name,
      refCost: undefined,
    });
  }

  const totalCost = useMemo(() => {
    return items.reduce((acc, it) => {
      const wastage = 1 + (Number(it.wastagePercent || 0) / 100);
      const qty = Number(it.quantity || 0) * wastage;
      const unitCost = it.refCost != null ? it.refCost : 0;
      return acc + qty * unitCost;
    }, 0);
  }, [items]);

  // Precio de referencia para el margen: el de la variante en edición si hay
  // una seleccionada, si no el del producto.
  const effectivePrice = useMemo(() => {
    if (variantId && selected?.variants) {
      const v = selected.variants.find((x) => x.id === variantId);
      if (v) return Number(v.price || 0);
    }
    return Number(selected?.price || 0);
  }, [selected, variantId]);

  const marginDineIn = useMemo(() => {
    if (!effectivePrice) return null;
    return ((effectivePrice - totalCost) / effectivePrice) * 100;
  }, [effectivePrice, totalCost]);

  const marginDelivery = useMemo(() => {
    const p = parseFloat(priceDelivery);
    const commission = parseFloat(platformCommissionPct) || 0;
    if (!Number.isFinite(p) || p <= 0) return null;
    const commissionAmount = (p * commission) / 100;
    return ((p - totalCost - commissionAmount) / p) * 100;
  }, [priceDelivery, platformCommissionPct, totalCost]);

  async function saveRecipe() {
    if (!selected) return;
    // Validar items antes de mandar
    for (const it of items) {
      if (!it.ingredientId && !it.subRecipeId) {
        setMsg({ kind: "err", text: "Hay un item sin ingrediente ni sub-receta seleccionado" });
        return;
      }
      if (!Number.isFinite(Number(it.quantity)) || Number(it.quantity) <= 0) {
        setMsg({ kind: "err", text: `Cantidad inválida en ${it.refName || "item"}` });
        return;
      }
    }
    setSaving(true);
    setMsg(null);
    try {
      await api.post("/api/recipes", {
        menuItemId: selected.id,
        variantId: variantId || undefined,
        marginErrorPct: parseFloat(marginErrorPct) || 0,
        targetMarginPct: targetMarginPct === "" ? null : parseFloat(targetMarginPct),
        priceDelivery: priceDelivery === "" ? null : parseFloat(priceDelivery),
        platformCommissionPct: platformCommissionPct === "" ? null : parseFloat(platformCommissionPct),
        items: items.map((it) => ({
          ingredientId: it.ingredientId || undefined,
          subRecipeId: it.subRecipeId || undefined,
          quantity: Number(it.quantity),
          unit: it.unit,
          wastagePercent: Number(it.wastagePercent) || 0,
        })),
      });
      setMsg({ kind: "ok", text: "Receta guardada" });
    } catch (err: any) {
      setMsg({ kind: "err", text: err?.response?.data?.error || "Error al guardar" });
    } finally {
      setSaving(false);
    }
  }

  async function generateWithAI() {
    if (!selected) return;
    setGenerating(true);
    setMsg(null);
    try {
      await api.post("/api/ai/generate-recipe", { menuItemId: selected.id });

      // Recargar ingredientes y subrecetas (pudieron crearse nuevos)
      const [i, s] = await Promise.all([
        api.get("/api/inventory/ingredients"),
        api.get("/api/recipes/subrecipes"),
      ]);
      setIngredients(i.data || []);
      setSubRecipes(s.data || []);

      // Recargar la receta del item
      await selectItem(selected);
      setMsg({ kind: "ok", text: "Receta generada con IA exitosamente." });
    } catch (err: any) {
      if (err?.response?.data?.action === 'configure_ai_key') {
        setMsg({ kind: "err", text: "Requiere configurar API Key de Gemini en configuración." });
      } else {
        setMsg({ kind: "err", text: err?.response?.data?.error || "Error al generar receta con IA" });
      }
    } finally {
      setGenerating(false);
    }
  }

  async function downloadTemplate() {
    try {
      const res = await api.get("/api/recipes/import/template/recetas", { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla-recetas.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("No se pudo generar la plantilla. Inténtalo de nuevo.");
    }
  }

  function reloadCatalogs() {
    Promise.all([
      api.get("/api/menu/items"),
      api.get("/api/inventory/ingredients"),
      api.get("/api/recipes/subrecipes"),
    ]).then(([m, i, s]) => {
      setMenuItems(m.data || []);
      setIngredients(i.data || []);
      setSubRecipes(s.data || []);
    }).catch(() => {});
  }

  const filtered = menuItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  const headerActions = (
    <>
      <PrimaryBtn ghost full={false} icon={Download} onClick={downloadTemplate}>
        Plantilla
      </PrimaryBtn>
      <PrimaryBtn ghost full={false} icon={Upload} onClick={() => setImportOpen(true)}>
        Subir
      </PrimaryBtn>
      <PrimaryBtn ghost full={false} icon={ChevronRight} href="/admin/inventario/subrecetas">
        Sub-recetas
      </PrimaryBtn>
    </>
  );

  return (
    <WtScreen>
      <ImportTemplateModal
        mode="recetas"
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={reloadCatalogs}
      />

      <PageHeader
        eyebrow="Inventario · Costeo"
        title="Recetas"
        subtitle="Escandallo de cada producto del menú (CMV y márgenes)"
        actions={headerActions}
      />

      {/* navegación + acciones en mobile */}
      <div className="mb-4 md:hidden">
        <a
          href="/admin/inventario"
          className="mb-3 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-tx-mut"
        >
          <ChevronLeft size={15} /> Inventario
        </a>
        <div className="flex flex-wrap gap-2">{headerActions}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(260px,1fr)_2fr]">
        {/* Panel izquierdo: lista de productos */}
        <WtCard className="overflow-hidden">
          <div className="border-b p-3" style={{ borderColor: "var(--bd-1)", background: "var(--surf-2)" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto…"
              className="min-h-11 w-full rounded-xl px-3 text-sm text-tx outline-none focus:border-primary"
              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
            />
          </div>
          <div className="max-h-[50vh] overflow-y-auto warmtech-scrollbar md:max-h-[calc(100vh-300px)]">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-tx-mut">Sin productos</p>
            ) : (
              filtered.map((item) => {
                const active = selected?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectItem(item)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      borderBottom: "1px solid var(--bd-1)",
                      background: active ? "var(--iris-soft)" : "transparent",
                      borderLeft: `3px solid ${active ? "var(--brand-primary)" : "transparent"}`,
                    }}
                  >
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-tx-mut" style={{ background: "var(--surf-2)" }}>
                        <NotebookText size={16} strokeWidth={1.9} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-tx">{item.name}</div>
                      <div className="font-mono text-[11px] tabular-nums text-tx-mut">{money(item.price)}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </WtCard>

        {/* Panel derecho: editor */}
        <WtCard className="p-4 md:p-5">
          {!selected ? (
            <EmptyState icon={ClipboardList} title="Selecciona un producto" hint="Elige un producto del menú para editar su receta." />
          ) : loadingRecipe ? (
            <div className="space-y-3">
              <div className="h-10 animate-pulse rounded-xl bg-surf-2" />
              <div className="h-24 animate-pulse rounded-xl bg-surf-2" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Header del item seleccionado */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--bd-1)" }}>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-xl font-extrabold text-tx-hi">{selected.name}</h2>
                  <p className="text-sm text-tx-mut">
                    Precio venta: <strong className="text-tx">{money(effectivePrice)}</strong>
                    {variantId && selected.variants && (
                      <span className="ml-1 text-tx-mut">
                        · variante <strong className="text-tx">{selected.variants.find((v) => v.id === variantId)?.name}</strong>
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <PrimaryBtn ghost full={false} icon={Sparkles} onClick={generateWithAI} disabled={generating || saving}>
                    {generating ? "Generando…" : "IA"}
                  </PrimaryBtn>
                  <PrimaryBtn full={false} icon={Save} onClick={saveRecipe} disabled={saving || generating}>
                    {saving ? "Guardando…" : "Guardar"}
                  </PrimaryBtn>
                </div>
              </div>

              {/* Selector de variante: cada variante (tamaño/sabor) lleva su
                  propia receta para descontar su propio insumo. "Base" = receta
                  del producto cuando se vende sin variante. */}
              {selected.variants && selected.variants.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Receta por variante</h3>
                  <div className="flex flex-wrap gap-2">
                    <VariantChip active={variantId === null} onClick={() => pickVariant(null)} disabled={loadingRecipe || saving}>
                      Base
                    </VariantChip>
                    {selected.variants.map((v) => (
                      <VariantChip key={v.id} active={variantId === v.id} onClick={() => pickVariant(v.id)} disabled={loadingRecipe || saving}>
                        {v.name} · {money(v.price)}
                      </VariantChip>
                    ))}
                  </div>
                </div>
              )}

              {msg && <Banner msg={msg} />}

              {/* Items de receta */}
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Items de la receta</h3>
                  <div className="flex gap-2">
                    <ChipBtn icon={Plus} onClick={() => addItem("ingredient")}>Ingrediente</ChipBtn>
                    <ChipBtn icon={Layers} onClick={() => addItem("subrecipe")}>Sub-receta</ChipBtn>
                  </div>
                </div>

                {items.length === 0 ? (
                  <p className="py-6 text-center text-sm text-tx-mut">
                    Sin items. Agrega un ingrediente o sub-receta para empezar.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.map((it, idx) => {
                      const isSubrecipe = !!it.subRecipeId || it.ingredientId === null;
                      return (
                        <div
                          key={idx}
                          className="grid items-center gap-2 rounded-xl p-2"
                          style={{ background: "var(--surf-2)", gridTemplateColumns: "1fr 84px 40px 66px 40px" }}
                        >
                          {isSubrecipe ? (
                            <select
                              value={it.subRecipeId || ""}
                              onChange={(e) => pickSubRecipe(idx, e.target.value)}
                              className={cellCls} style={cellStyle}
                            >
                              <option value="">Sub-receta…</option>
                              {subRecipes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          ) : (
                            <select
                              value={it.ingredientId || ""}
                              onChange={(e) => pickIngredient(idx, e.target.value)}
                              className={cellCls} style={cellStyle}
                            >
                              <option value="">Ingrediente…</option>
                              {ingredients.map((i) => (
                                <option key={i.id} value={i.id}>{i.name} ({BASE_UNIT_LABEL[i.baseUnit]})</option>
                              ))}
                            </select>
                          )}
                          <input
                            type="number" step="0.01" min="0" placeholder="Cant." value={it.quantity || ""}
                            onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                            className={`${cellCls} text-right tabular-nums`} style={cellStyle}
                          />
                          <span className="text-center text-xs text-tx-mut">{BASE_UNIT_LABEL[it.unit]}</span>
                          <input
                            type="number" step="1" min="0" placeholder="Merma" value={it.wastagePercent || ""}
                            onChange={(e) => updateItem(idx, { wastagePercent: parseFloat(e.target.value) || 0 })}
                            title="% de merma adicional"
                            className={`${cellCls} text-right tabular-nums`} style={cellStyle}
                          />
                          <button
                            type="button" onClick={() => removeItem(idx)} aria-label="Quitar"
                            className="grid h-9 w-9 place-items-center rounded-lg"
                            style={{ background: "var(--err-soft)", color: "var(--err)" }}
                          >
                            <X size={15} strokeWidth={2.4} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pricing canal */}
              <div className="grid grid-cols-2 gap-3 border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
                <NumberField label="Precio delivery" value={priceDelivery} onChange={setPriceDelivery} prefix="$" />
                <NumberField label="Comisión plataforma %" value={platformCommissionPct} onChange={setPlatformCommissionPct} suffix="%" />
                <NumberField label="Merma extra de prep %" value={marginErrorPct} onChange={setMarginErrorPct} suffix="%" />
                <NumberField label="Margen meta %" value={targetMarginPct} onChange={setTargetMarginPct} suffix="%" placeholder="Default policy" />
              </div>

              {/* Resumen costos */}
              <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
                <SummaryRow label="Costo total (CMV)" value={money(totalCost)} />
                {marginDineIn != null && (
                  <SummaryRow
                    label="Margen mesa"
                    value={`${marginDineIn.toFixed(1)}%`}
                    highlight={marginDineIn >= 60 ? "good" : marginDineIn >= 40 ? "warn" : "bad"}
                  />
                )}
                {marginDelivery != null && (
                  <SummaryRow
                    label="Margen delivery"
                    value={`${marginDelivery.toFixed(1)}%`}
                    highlight={marginDelivery >= 50 ? "good" : marginDelivery >= 30 ? "warn" : "bad"}
                  />
                )}
              </div>
            </div>
          )}
        </WtCard>
      </div>
    </WtScreen>
  );
}

// Helpers de UI ────────────────────────────────────────────────────────────

function Banner({ msg }: { msg: { kind: "ok" | "err"; text: string } }) {
  const ok = msg.kind === "ok";
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs font-bold"
      style={{
        background: ok ? "var(--ok-soft)" : "var(--err-soft)",
        color: ok ? "var(--ok)" : "var(--err)",
      }}
    >
      {msg.text}
    </div>
  );
}

function ChipBtn({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof Plus;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-3 text-xs font-bold text-tx"
      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
    >
      <Icon size={14} strokeWidth={2} /> {children}
    </button>
  );
}

function VariantChip({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-9 items-center rounded-full px-3.5 text-xs font-bold transition-colors disabled:opacity-50"
      style={{
        background: active ? "var(--primary)" : "var(--surf-2)",
        border: `1px solid ${active ? "var(--primary)" : "var(--bd-1)"}`,
        color: active ? "var(--on-primary, #0b0b0d)" : "var(--tx)",
      }}
    >
      {children}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-tx-mut">{prefix}</span>
        )}
        <input
          type="number" step="0.01" min="0" value={value}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="min-h-11 w-full rounded-lg text-sm tabular-nums text-tx outline-none focus:border-primary"
          style={{
            background: "var(--surf-2)",
            border: "1px solid var(--bd-1)",
            color: "var(--tx)",
            paddingLeft: prefix ? 24 : 12,
            paddingRight: suffix ? 28 : 12,
          }}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-tx-mut">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "good" | "warn" | "bad";
}) {
  const color =
    highlight === "good" ? "var(--ok)" :
    highlight === "warn" ? "var(--warn)" :
    highlight === "bad" ? "var(--err)" : "var(--tx-hi)";
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-tx-mut">{label}</span>
      <span className="font-display text-base font-extrabold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}
