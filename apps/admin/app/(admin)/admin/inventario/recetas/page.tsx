"use client";
import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import Link from "next/link";

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

interface MenuItem {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  categoryId?: string;
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

export default function RecetasPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MenuItem | null>(null);

  const [items, setItems] = useState<RecipeItem[]>([]);
  const [marginErrorPct, setMarginErrorPct] = useState<string>("0");
  const [targetMarginPct, setTargetMarginPct] = useState<string>("");
  const [priceDelivery, setPriceDelivery] = useState<string>("");
  const [platformCommissionPct, setPlatformCommissionPct] = useState<string>("");

  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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
    setLoadingRecipe(true);
    setMsg(null);
    try {
      const { data } = await api.get<RecipeData | null>(`/api/recipes/by-menu-item/${item.id}`);
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

  const marginDineIn = useMemo(() => {
    if (!selected || !selected.price) return null;
    return ((selected.price - totalCost) / selected.price) * 100;
  }, [selected, totalCost]);

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

  const filtered = menuItems.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/inventario" className="text-sm font-bold" style={{ color: "var(--muted)" }}>
          ← Inventario
        </Link>
        <h1 className="font-syne text-3xl font-black">Recetas</h1>
        <Link
          href="/admin/inventario/subrecetas"
          className="ml-auto px-4 py-2 rounded-xl text-xs font-bold border"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          📋 Sub-recetas →
        </Link>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: "minmax(280px, 1fr) 2fr" }}>
        {/* Panel izquierdo: lista de productos */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--surf2)" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
            {filtered.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
                Sin productos
              </p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => selectItem(item)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left border-b transition-all"
                  style={{
                    borderColor: "var(--border)",
                    background: selected?.id === item.id ? "rgba(245,166,35,0.1)" : "var(--surf)",
                    borderLeft: selected?.id === item.id ? "3px solid var(--gold)" : "3px solid transparent",
                  }}
                >
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    <div className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                      ${item.price?.toFixed(2)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Panel derecho: editor */}
        <div
          className="rounded-2xl border p-5 space-y-5"
          style={{ background: "var(--surf)", borderColor: "var(--border)" }}
        >
          {!selected ? (
            <div className="text-center py-20" style={{ color: "var(--muted)" }}>
              <div className="text-4xl mb-3">📋</div>
              <p>Selecciona un producto para editar su receta</p>
            </div>
          ) : loadingRecipe ? (
            <div className="text-center py-20" style={{ color: "var(--muted)" }}>
              <div className="text-2xl mb-3">⏳</div>
              <p>Cargando receta…</p>
            </div>
          ) : (
            <>
              {/* Header del item seleccionado */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <h2 className="font-syne font-bold text-xl truncate">{selected.name}</h2>
                  <p className="text-sm tabular-nums" style={{ color: "var(--muted)" }}>
                    Precio venta: <strong style={{ color: "var(--text)" }}>${selected.price?.toFixed(2)}</strong>
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={generateWithAI}
                    disabled={generating || saving}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold border flex items-center gap-2"
                    style={{ 
                      borderColor: "var(--gold)", 
                      color: "var(--gold)",
                      opacity: generating || saving ? 0.5 : 1
                    }}
                  >
                    {generating ? "✨ Generando..." : "✨ Autogenerar con IA"}
                  </button>
                  <button
                    onClick={saveRecipe}
                    disabled={saving || generating}
                    className="px-5 py-2.5 rounded-xl text-sm font-syne font-black"
                    style={{ background: saving || generating ? "var(--muted)" : "var(--gold)", color: "#000" }}
                  >
                    {saving ? "Guardando…" : "💾 Guardar"}
                  </button>
                </div>
              </div>

              {/* Message */}
              {msg && (
                <div
                  className="rounded-xl px-3 py-2 text-xs font-bold"
                  style={{
                    background: msg.kind === "ok" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                    color: msg.kind === "ok" ? "#10b981" : "#ef4444",
                    border: `1px solid ${msg.kind === "ok" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                  }}
                >
                  {msg.text}
                </div>
              )}

              {/* Items de receta */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    Items de la receta
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => addItem("ingredient")}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold"
                      style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }}
                    >
                      + Ingrediente
                    </button>
                    <button
                      onClick={() => addItem("subrecipe")}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold"
                      style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }}
                    >
                      + Sub-receta
                    </button>
                  </div>
                </div>

                {items.length === 0 ? (
                  <p className="text-sm py-6 text-center" style={{ color: "var(--muted)" }}>
                    Sin items. Agrega un ingrediente o sub-receta para empezar.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.map((it, idx) => {
                      const isSubrecipe = !!it.subRecipeId || it.ingredientId === null;
                      return (
                        <div
                          key={idx}
                          className="grid gap-2 items-center p-2 rounded-xl"
                          style={{
                            background: "var(--surf2)",
                            gridTemplateColumns: "1fr 90px 50px 70px 32px",
                          }}
                        >
                          {isSubrecipe ? (
                            <select
                              value={it.subRecipeId || ""}
                              onChange={(e) => pickSubRecipe(idx, e.target.value)}
                              className="px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}
                            >
                              <option value="">Sub-receta…</option>
                              {subRecipes.map((s) => (
                                <option key={s.id} value={s.id}>
                                  📋 {s.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <select
                              value={it.ingredientId || ""}
                              onChange={(e) => pickIngredient(idx, e.target.value)}
                              className="px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}
                            >
                              <option value="">Ingrediente…</option>
                              {ingredients.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.name} ({BASE_UNIT_LABEL[i.baseUnit]})
                                </option>
                              ))}
                            </select>
                          )}
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Cant."
                            value={it.quantity || ""}
                            onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                            className="px-2 py-2 rounded-lg text-sm outline-none text-right tabular-nums"
                            style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}
                          />
                          <span className="text-xs text-center" style={{ color: "var(--muted)" }}>
                            {BASE_UNIT_LABEL[it.unit]}
                          </span>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            placeholder="Merma %"
                            value={it.wastagePercent || ""}
                            onChange={(e) => updateItem(idx, { wastagePercent: parseFloat(e.target.value) || 0 })}
                            title="% de merma adicional"
                            className="px-2 py-2 rounded-lg text-sm outline-none text-right tabular-nums"
                            style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}
                          />
                          <button
                            onClick={() => removeItem(idx)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs"
                            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pricing canal */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                <NumberField
                  label="Precio delivery"
                  value={priceDelivery}
                  onChange={setPriceDelivery}
                  prefix="$"
                />
                <NumberField
                  label="Comisión plataforma %"
                  value={platformCommissionPct}
                  onChange={setPlatformCommissionPct}
                  suffix="%"
                />
                <NumberField
                  label="Merma extra de prep %"
                  value={marginErrorPct}
                  onChange={setMarginErrorPct}
                  suffix="%"
                />
                <NumberField
                  label="Margen meta %"
                  value={targetMarginPct}
                  onChange={setTargetMarginPct}
                  suffix="%"
                  placeholder="Default policy"
                />
              </div>

              {/* Resumen costos */}
              <div className="pt-4 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
                <SummaryRow label="Costo total (CMV)" value={`$${totalCost.toFixed(2)}`} />
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Helpers de UI ────────────────────────────────────────────────────────────

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
      <label className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "var(--muted)" }}>
            {prefix}
          </span>
        )}
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full py-2 rounded-lg text-sm outline-none tabular-nums"
          style={{
            background: "var(--surf2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            paddingLeft: prefix ? 24 : 12,
            paddingRight: suffix ? 28 : 12,
          }}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: "var(--muted)" }}>
            {suffix}
          </span>
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
  const color = highlight === "good" ? "#10b981" : highlight === "warn" ? "#f59e0b" : highlight === "bad" ? "#ef4444" : "var(--text)";
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <span className="text-base font-black tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
