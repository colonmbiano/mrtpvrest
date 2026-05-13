"use client";
import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import Link from "next/link";

// /admin/inventario/subrecetas · CRUD de SubRecipes (preparaciones base
// reusables como "salsa verde", "mezcla de quesos"). Cada SubRecipe tiene
// yieldQty + yieldUnit y N items (Ingredient o nested SubRecipe).

type BaseUnit = "GRAM" | "ML" | "PIECE";

const BASE_UNIT_LABEL: Record<BaseUnit, string> = {
  GRAM: "g", ML: "ml", PIECE: "pz",
};

interface Ingredient {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  cost: number;
}

interface SubRecipeItem {
  id?: string;
  ingredientId: string | null;
  nestedSubRecipeId: string | null;
  qty: number;
  unit: BaseUnit;
  refName?: string;
  refCost?: number;
}

interface SubRecipe {
  id: string;
  name: string;
  description: string | null;
  yieldQty: number;
  yieldUnit: BaseUnit;
  marginErrorPct: number;
  isActive: boolean;
  items: Array<{
    id: string;
    ingredientId: string | null;
    nestedSubRecipeId: string | null;
    qty: number;
    unit: BaseUnit;
    ingredient?: { id: string; name: string; baseUnit: BaseUnit; cost: number };
    nestedSubRecipe?: { id: string; name: string; yieldUnit: BaseUnit };
  }>;
}

export default function SubRecetasPage() {
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [yieldQty, setYieldQty] = useState("");
  const [yieldUnit, setYieldUnit] = useState<BaseUnit>("GRAM");
  const [marginErrorPct, setMarginErrorPct] = useState("0");
  const [items, setItems] = useState<SubRecipeItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function reload() {
    Promise.all([
      api.get("/api/recipes/subrecipes"),
      api.get("/api/inventory/ingredients"),
    ])
      .then(([s, i]) => {
        setSubRecipes(s.data || []);
        setIngredients(i.data || []);
      })
      .catch(() => {});
  }

  useEffect(() => {
    reload();
  }, []);

  function loadForm(sub: SubRecipe | null) {
    if (!sub) {
      setName("");
      setDescription("");
      setYieldQty("");
      setYieldUnit("GRAM");
      setMarginErrorPct("0");
      setItems([]);
      return;
    }
    setName(sub.name);
    setDescription(sub.description || "");
    setYieldQty(String(sub.yieldQty));
    setYieldUnit(sub.yieldUnit);
    setMarginErrorPct(String(sub.marginErrorPct ?? 0));
    setItems(
      (sub.items || []).map((it) => ({
        id: it.id,
        ingredientId: it.ingredientId,
        nestedSubRecipeId: it.nestedSubRecipeId,
        qty: Number(it.qty || 0),
        unit: it.unit,
        refName: it.ingredient?.name || it.nestedSubRecipe?.name || "",
        refCost: it.ingredient ? Number(it.ingredient.cost || 0) : undefined,
      })),
    );
  }

  function select(id: string | "new") {
    setMsg(null);
    setSelectedId(id);
    if (id === "new") loadForm(null);
    else loadForm(subRecipes.find((s) => s.id === id) || null);
  }

  function addItem(kind: "ingredient" | "subrecipe") {
    setItems((prev) => [
      ...prev,
      {
        ingredientId: kind === "ingredient" ? "" : null,
        nestedSubRecipeId: kind === "subrecipe" ? "" : null,
        qty: 0,
        unit: "GRAM",
      },
    ]);
  }

  function pickIngredient(idx: number, ingredientId: string) {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) return;
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? { ...it, ingredientId: ing.id, nestedSubRecipeId: null, unit: ing.baseUnit, refName: ing.name, refCost: Number(ing.cost || 0) }
          : it,
      ),
    );
  }

  function pickNested(idx: number, subId: string) {
    const sub = subRecipes.find((s) => s.id === subId);
    if (!sub) return;
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? { ...it, nestedSubRecipeId: sub.id, ingredientId: null, unit: sub.yieldUnit, refName: sub.name, refCost: undefined }
          : it,
      ),
    );
  }

  function updateItem(idx: number, patch: Partial<SubRecipeItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const totalCost = useMemo(() => {
    return items.reduce((acc, it) => {
      const c = it.refCost != null ? it.refCost : 0;
      return acc + Number(it.qty || 0) * c;
    }, 0);
  }, [items]);

  const costPerYield = useMemo(() => {
    const y = parseFloat(yieldQty);
    if (!Number.isFinite(y) || y <= 0) return null;
    const margin = 1 - (parseFloat(marginErrorPct) || 0) / 100;
    return margin > 0 ? totalCost / (y * margin) : null;
  }, [totalCost, yieldQty, marginErrorPct]);

  async function save() {
    if (!name.trim()) return setMsg({ kind: "err", text: "Nombre requerido" });
    const y = parseFloat(yieldQty);
    if (!Number.isFinite(y) || y <= 0) return setMsg({ kind: "err", text: "Rendimiento debe ser > 0" });
    for (const it of items) {
      if (!it.ingredientId && !it.nestedSubRecipeId) {
        return setMsg({ kind: "err", text: "Hay un item sin elegir" });
      }
      if (!Number.isFinite(Number(it.qty)) || Number(it.qty) <= 0) {
        return setMsg({ kind: "err", text: `Cantidad inválida en ${it.refName || "item"}` });
      }
    }
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        name: name.trim(),
        description: description || null,
        yieldQty: y,
        yieldUnit,
        marginErrorPct: parseFloat(marginErrorPct) || 0,
        items: items.map((it) => ({
          ingredientId: it.ingredientId || undefined,
          nestedSubRecipeId: it.nestedSubRecipeId || undefined,
          qty: Number(it.qty),
          unit: it.unit,
        })),
      };
      if (selectedId === "new") {
        const { data } = await api.post("/api/recipes/subrecipes", payload);
        setMsg({ kind: "ok", text: "Sub-receta creada" });
        reload();
        setSelectedId(data.id);
      } else {
        await api.put(`/api/recipes/subrecipes/${selectedId}`, payload);
        setMsg({ kind: "ok", text: "Sub-receta actualizada" });
        reload();
      }
    } catch (err: any) {
      setMsg({ kind: "err", text: err?.response?.data?.error || "Error al guardar" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (selectedId === "new" || !selectedId) return;
    if (!confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/api/recipes/subrecipes/${selectedId}`);
      setMsg({ kind: "ok", text: "Eliminada" });
      reload();
      setSelectedId(null);
      loadForm(null);
    } catch (err: any) {
      setMsg({ kind: "err", text: err?.response?.data?.error || "Error al eliminar" });
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/inventario/recetas" className="text-sm font-bold" style={{ color: "var(--muted)" }}>
          ← Recetas
        </Link>
        <h1 className="font-syne text-3xl font-black">Sub-recetas</h1>
        <button
          onClick={() => select("new")}
          className="ml-auto px-4 py-2 rounded-xl text-sm font-bold"
          style={{ background: "var(--gold)", color: "#000" }}
        >
          + Nueva sub-receta
        </button>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: "minmax(280px, 1fr) 2fr" }}>
        {/* Lista */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
            {subRecipes.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
                Sin sub-recetas. Crea la primera arriba.
              </p>
            ) : (
              subRecipes.map((s) => (
                <button
                  key={s.id}
                  onClick={() => select(s.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left border-b transition-all"
                  style={{
                    borderColor: "var(--border)",
                    background: selectedId === s.id ? "rgba(245,166,35,0.1)" : "var(--surf)",
                    borderLeft: selectedId === s.id ? "3px solid var(--gold)" : "3px solid transparent",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">📋 {s.name}</div>
                    <div className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                      Rinde {s.yieldQty} {BASE_UNIT_LABEL[s.yieldUnit]} · {s.items?.length || 0} items
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Editor */}
        <div
          className="rounded-2xl border p-5 space-y-5"
          style={{ background: "var(--surf)", borderColor: "var(--border)" }}
        >
          {!selectedId ? (
            <div className="text-center py-20" style={{ color: "var(--muted)" }}>
              <div className="text-4xl mb-3">🥣</div>
              <p>Selecciona una sub-receta para editar o crea una nueva</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre (ej. Salsa verde, Mezcla quesos)"
                  className="flex-1 px-3 py-2.5 rounded-xl text-base font-bold outline-none"
                  style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl text-sm font-syne font-black shrink-0"
                  style={{ background: saving ? "var(--muted)" : "var(--gold)", color: "#000" }}
                >
                  {saving ? "Guardando…" : "💾 Guardar"}
                </button>
                {selectedId !== "new" && (
                  <button
                    onClick={remove}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-sm shrink-0"
                    style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                    title="Eliminar"
                  >
                    🗑
                  </button>
                )}
              </div>

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

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Descripción opcional (instrucciones, notas)"
                className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />

              {/* Yield */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--muted)" }}>
                    Rendimiento
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={yieldQty}
                    onChange={(e) => setYieldQty(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none tabular-nums"
                    style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--muted)" }}>
                    Unidad
                  </label>
                  <select
                    value={yieldUnit}
                    onChange={(e) => setYieldUnit(e.target.value as BaseUnit)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }}
                  >
                    <option value="GRAM">Gramos</option>
                    <option value="ML">Mililitros</option>
                    <option value="PIECE">Piezas</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--muted)" }}>
                    Margen error %
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={marginErrorPct}
                    onChange={(e) => setMarginErrorPct(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none tabular-nums"
                    style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }}
                  />
                </div>
              </div>

              {/* Items */}
              <div className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    Ingredientes de la preparación
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
                    Sin ingredientes.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.map((it, idx) => {
                      const isNested = !!it.nestedSubRecipeId || it.ingredientId === null;
                      return (
                        <div
                          key={idx}
                          className="grid gap-2 items-center p-2 rounded-xl"
                          style={{
                            background: "var(--surf2)",
                            gridTemplateColumns: "1fr 90px 50px 32px",
                          }}
                        >
                          {isNested ? (
                            <select
                              value={it.nestedSubRecipeId || ""}
                              onChange={(e) => pickNested(idx, e.target.value)}
                              className="px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}
                            >
                              <option value="">Sub-receta…</option>
                              {subRecipes
                                .filter((s) => s.id !== selectedId)
                                .map((s) => (
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
                            value={it.qty || ""}
                            onChange={(e) => updateItem(idx, { qty: parseFloat(e.target.value) || 0 })}
                            className="px-2 py-2 rounded-lg text-sm outline-none text-right tabular-nums"
                            style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}
                          />
                          <span className="text-xs text-center" style={{ color: "var(--muted)" }}>
                            {BASE_UNIT_LABEL[it.unit]}
                          </span>
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

              {/* Resumen */}
              <div className="pt-4 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: "var(--muted)" }}>Costo total (insumos)</span>
                  <span className="text-base font-black tabular-nums">${totalCost.toFixed(2)}</span>
                </div>
                {costPerYield != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: "var(--muted)" }}>
                      Costo por {BASE_UNIT_LABEL[yieldUnit]}
                    </span>
                    <span className="text-base font-black tabular-nums" style={{ color: "var(--gold)" }}>
                      ${costPerYield.toFixed(4)}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
