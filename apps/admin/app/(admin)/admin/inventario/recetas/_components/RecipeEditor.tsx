"use client";
import { useEffect, useMemo, useState } from "react";
import { Save, Sparkles, Plus, Layers, X, ClipboardList } from "lucide-react";
import api from "@/lib/api";
import { Button, EmptyState } from "@/components/ds";
import { formatMoney } from "@/lib/format";

export type BaseUnit = "GRAM" | "ML" | "PIECE";

export const BASE_UNIT_LABEL: Record<BaseUnit, string> = {
  GRAM: "g", ML: "ml", PIECE: "pz",
};

export interface MenuItemVariant { id: string; name: string; price: number }

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  categoryId?: string;
  variants?: MenuItemVariant[];
}

export interface Ingredient {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  cost: number;
}

export interface SubRecipe {
  id: string;
  name: string;
  yieldUnit: BaseUnit;
}

interface RecipeItem {
  id?: string;
  ingredientId: string | null;
  subRecipeId: string | null;
  quantity: number;
  unit: BaseUnit;
  wastagePercent: number;
  refName?: string;
  refCost?: number;
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

export function RecipeEditor({
  selected,
  ingredients,
  subRecipes,
  onCatalogsReload,
}: {
  selected: MenuItem | null;
  ingredients: Ingredient[];
  subRecipes: SubRecipe[];
  onCatalogsReload: () => void;
}) {
  // Variante en edición: null = receta base del platillo.
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

  // Cuando cambia el producto seleccionado, cargar su receta base.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected) return;
    setVariantId(null);
    loadRecipe(selected.id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

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
  // una seleccionada, si no el del platillo.
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
      onCatalogsReload();

      // Recargar la receta del item (receta base)
      setVariantId(null);
      await loadRecipe(selected.id, null);
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

  if (!selected) {
    return <EmptyState icon={ClipboardList} title="Selecciona un producto" hint="Elige un producto del menú para editar su receta." />;
  }

  if (loadingRecipe) {
    return (
      <div className="space-y-3">
        <div className="h-10 animate-pulse rounded-ds-md bg-surf-2" />
        <div className="h-24 animate-pulse rounded-ds-md bg-surf-2" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header del item seleccionado */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--bd-1)" }}>
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl font-extrabold text-tx-hi">{selected.name}</h2>
          <p className="text-sm text-tx-mut">
            Precio venta: <strong className="text-tx">{formatMoney(effectivePrice)}</strong>
            {variantId && selected.variants && (
              <span className="ml-1 text-tx-mut">
                · variante <strong className="text-tx">{selected.variants.find((v) => v.id === variantId)?.name}</strong>
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" icon={Sparkles} onClick={generateWithAI} loading={generating} disabled={generating || saving}>
            IA
          </Button>
          <Button icon={Save} onClick={saveRecipe} loading={saving} disabled={saving || generating}>
            Guardar
          </Button>
        </div>
      </div>

      {/* Selector de variante: cada variante (tamaño/sabor) lleva su
          propia receta para descontar su propio insumo. "Base" = receta
          del platillo cuando se vende sin variante. */}
      {selected.variants && selected.variants.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Receta por variante</h3>
          <div className="flex flex-wrap gap-2">
            <VariantChip active={variantId === null} onClick={() => pickVariant(null)} disabled={loadingRecipe || saving}>
              Base
            </VariantChip>
            {selected.variants.map((v) => (
              <VariantChip key={v.id} active={variantId === v.id} onClick={() => pickVariant(v.id)} disabled={loadingRecipe || saving}>
                {v.name} · {formatMoney(v.price)}
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
                  className="grid grid-cols-[1fr_40px_66px_40px] items-center gap-2 rounded-ds-md p-2 sm:grid-cols-[1fr_84px_40px_66px_40px]"
                  style={{ background: "var(--surf-2)" }}
                >
                  {isSubrecipe ? (
                    <select
                      value={it.subRecipeId || ""}
                      onChange={(e) => pickSubRecipe(idx, e.target.value)}
                      className={`${cellCls} col-span-full sm:col-span-1`} style={cellStyle}
                    >
                      <option value="">Sub-receta…</option>
                      {subRecipes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  ) : (
                    <select
                      value={it.ingredientId || ""}
                      onChange={(e) => pickIngredient(idx, e.target.value)}
                      className={`${cellCls} col-span-full sm:col-span-1`} style={cellStyle}
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
        <SummaryRow label="Costo total (CMV)" value={formatMoney(totalCost)} />
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
  );
}

// Helpers de UI ────────────────────────────────────────────────────────────

function Banner({ msg }: { msg: { kind: "ok" | "err"; text: string } }) {
  const ok = msg.kind === "ok";
  return (
    <div
      className="rounded-ds-md px-3 py-2 text-xs font-bold"
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
        background: active ? "var(--brand-primary)" : "var(--surf-2)",
        border: `1px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`,
        color: active ? "var(--accent-contrast)" : "var(--tx)",
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
