"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, Plus, Save, Trash2, X, Soup, NotebookText, Layers,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, PrimaryBtn, SectionHead, EmptyState, money,
} from "@/components/warmtech";

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

const inputCls =
  "w-full rounded-xl px-3 py-2.5 text-sm text-tx outline-none transition-colors focus:border-primary";
const inputStyle = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;
const cellCls =
  "rounded-lg px-3 py-2 text-sm text-tx outline-none transition-colors focus:border-primary";
const cellStyle = { background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;

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
    <WtScreen>
      <PageHeader
        eyebrow="Inventario · Recetas"
        title="Sub-recetas"
        subtitle="Preparaciones base reusables (salsas, mezclas, bases)"
        actions={
          <PrimaryBtn full={false} icon={Plus} onClick={() => select("new")}>
            Nueva sub-receta
          </PrimaryBtn>
        }
      />

      {/* navegación + acción en mobile */}
      <div className="mb-4 flex items-center justify-between gap-2 md:hidden">
        <a
          href="/admin/inventario/recetas"
          className="inline-flex min-h-9 items-center gap-1 text-xs font-bold text-tx-mut"
        >
          <ChevronLeft size={15} /> Recetas
        </a>
        <PrimaryBtn full={false} icon={Plus} onClick={() => select("new")}>
          Nueva
        </PrimaryBtn>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(260px,1fr)_2fr]">
        {/* Lista */}
        <WtCard className="overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto warmtech-scrollbar md:max-h-[calc(100vh-240px)]">
            {subRecipes.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={Soup} title="Sin sub-recetas" hint="Crea la primera con el botón de arriba." />
              </div>
            ) : (
              subRecipes.map((s) => {
                const active = selectedId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => select(s.id)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      borderBottom: "1px solid var(--bd-1)",
                      background: active ? "var(--iris-soft)" : "transparent",
                      borderLeft: `3px solid ${active ? "var(--brand-primary)" : "transparent"}`,
                    }}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-primary" style={{ background: "var(--surf-2)" }}>
                      <NotebookText size={16} strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-tx">{s.name}</div>
                      <div className="truncate text-[11px] text-tx-mut">
                        Rinde {s.yieldQty} {BASE_UNIT_LABEL[s.yieldUnit]} · {s.items?.length || 0} items
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </WtCard>

        {/* Editor */}
        <WtCard className="p-4 md:p-5">
          {!selectedId ? (
            <EmptyState icon={Soup} title="Selecciona una sub-receta" hint="Elige una de la lista o crea una nueva para editar." />
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre (ej. Salsa verde, Mezcla quesos)"
                  className="min-h-12 flex-1 rounded-xl px-3 text-base font-bold text-tx outline-none focus:border-primary"
                  style={inputStyle}
                />
                <PrimaryBtn full={false} icon={Save} onClick={save} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </PrimaryBtn>
                {selectedId !== "new" && (
                  <button
                    type="button"
                    onClick={remove}
                    title="Eliminar"
                    aria-label="Eliminar"
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-[13px]"
                    style={{ background: "var(--err-soft)", color: "var(--err)" }}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>

              {msg && <Banner msg={msg} />}

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Descripción opcional (instrucciones, notas)"
                className={`${inputCls} resize-none`}
                style={inputStyle}
              />

              {/* Yield */}
              <div className="grid grid-cols-3 gap-3 border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Rendimiento</label>
                  <input
                    type="number" step="0.01" min="0" value={yieldQty}
                    onChange={(e) => setYieldQty(e.target.value)} placeholder="0"
                    className={`${cellCls} w-full tabular-nums`} style={cellStyle}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Unidad</label>
                  <select
                    value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value as BaseUnit)}
                    className={`${cellCls} w-full`} style={cellStyle}
                  >
                    <option value="GRAM">Gramos</option>
                    <option value="ML">Mililitros</option>
                    <option value="PIECE">Piezas</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Margen error %</label>
                  <input
                    type="number" step="1" min="0" value={marginErrorPct}
                    onChange={(e) => setMarginErrorPct(e.target.value)}
                    className={`${cellCls} w-full tabular-nums`} style={cellStyle}
                  />
                </div>
              </div>

              {/* Items */}
              <div className="border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">
                    Ingredientes de la preparación
                  </h3>
                  <div className="flex gap-2">
                    <ChipBtn icon={Plus} onClick={() => addItem("ingredient")}>Ingrediente</ChipBtn>
                    <ChipBtn icon={Layers} onClick={() => addItem("subrecipe")}>Sub-receta</ChipBtn>
                  </div>
                </div>

                {items.length === 0 ? (
                  <p className="py-6 text-center text-sm text-tx-mut">Sin ingredientes.</p>
                ) : (
                  <div className="space-y-2">
                    {items.map((it, idx) => {
                      const isNested = !!it.nestedSubRecipeId || it.ingredientId === null;
                      return (
                        <div
                          key={idx}
                          className="grid items-center gap-2 rounded-xl p-2"
                          style={{ background: "var(--surf-2)", gridTemplateColumns: "1fr 90px 44px 40px" }}
                        >
                          {isNested ? (
                            <select
                              value={it.nestedSubRecipeId || ""}
                              onChange={(e) => pickNested(idx, e.target.value)}
                              className={cellCls} style={cellStyle}
                            >
                              <option value="">Sub-receta…</option>
                              {subRecipes.filter((s) => s.id !== selectedId).map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
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
                            type="number" step="0.01" min="0" value={it.qty || ""}
                            onChange={(e) => updateItem(idx, { qty: parseFloat(e.target.value) || 0 })}
                            className={`${cellCls} text-right tabular-nums`} style={cellStyle}
                          />
                          <span className="text-center text-xs text-tx-mut">{BASE_UNIT_LABEL[it.unit]}</span>
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

              {/* Resumen */}
              <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-tx-mut">Costo total (insumos)</span>
                  <span className="font-display text-base font-extrabold tabular-nums text-tx-hi">{money(totalCost)}</span>
                </div>
                {costPerYield != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-tx-mut">Costo por {BASE_UNIT_LABEL[yieldUnit]}</span>
                    <span className="font-display text-base font-extrabold tabular-nums text-primary">
                      ${costPerYield.toFixed(4)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </WtCard>
      </div>
    </WtScreen>
  );
}

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
