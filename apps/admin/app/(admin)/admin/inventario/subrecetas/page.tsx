"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Soup, NotebookText } from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, PageTabs, Card, Button, EmptyState, useToast, useConfirm,
} from "@/components/ds";
import {
  SubRecipeEditor, BASE_UNIT_LABEL,
  type BaseUnit, type Ingredient, type SubRecipe, type SubRecipeItem,
} from "./_components/SubRecipeEditor";

// /admin/inventario/subrecetas · CRUD de SubRecipes (preparaciones base
// reusables como "salsa verde", "mezcla de quesos"). Cada SubRecipe tiene
// yieldQty + yieldUnit y N items (Ingredient o nested SubRecipe).

export default function SubRecetasPage() {
  const toast = useToast();
  const confirm = useConfirm();
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
    if (!(await confirm({ title: `¿Eliminar "${name}"?`, body: "Esta acción no se puede deshacer.", danger: true, confirmLabel: "Eliminar" }))) return;
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
    <PageShell>
      <PageHeader
        eyebrow="Inventario · Recetas"
        title="Sub-recetas"
        subtitle="Preparaciones base reusables (salsas, mezclas, bases)"
        actions={<Button icon={Plus} onClick={() => select("new")}>Nueva sub-receta</Button>}
      />
      <PageTabs set="inventario" />

      {/* Acción en mobile (PageHeader es hidden en <md) */}
      <div className="mb-4 md:hidden">
        <Button full icon={Plus} onClick={() => select("new")}>Nueva sub-receta</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(260px,1fr)_2fr]">
        {/* Lista */}
        <Card className="overflow-hidden">
          <div className="ds-scrollbar max-h-[60vh] overflow-y-auto md:max-h-[calc(100vh-240px)]">
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
                      background: active ? "var(--accent-soft)" : "transparent",
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
        </Card>

        {/* Editor */}
        <Card className="p-4 md:p-5">
          <SubRecipeEditor
            selectedId={selectedId}
            ingredients={ingredients}
            subRecipes={subRecipes}
            name={name} setName={setName}
            description={description} setDescription={setDescription}
            yieldQty={yieldQty} setYieldQty={setYieldQty}
            yieldUnit={yieldUnit} setYieldUnit={setYieldUnit}
            marginErrorPct={marginErrorPct} setMarginErrorPct={setMarginErrorPct}
            items={items}
            addItem={addItem}
            pickIngredient={pickIngredient}
            pickNested={pickNested}
            updateItem={updateItem}
            removeItem={removeItem}
            totalCost={totalCost}
            costPerYield={costPerYield}
            saving={saving}
            msg={msg}
            onSave={save}
            onRemove={remove}
          />
        </Card>
      </div>
    </PageShell>
  );
}
