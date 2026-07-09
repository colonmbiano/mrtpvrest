"use client";
import { useEffect, useState } from "react";
import { Save, Plus, Layers, X, ClipboardList } from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, PageTabs, Card, Button, EmptyState, Input,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";

// /admin/inventario/extras · Define qué insumo descuenta cada modificador/extra
// (Papas Gajo Extra → 150g papa, etc.). El mapeo es por NOMBRE a nivel
// restaurante y lo consume el motor de inventario al cobrar (discountInventory).

type BaseUnit = "GRAM" | "ML" | "PIECE";
const UNIT_LABEL: Record<BaseUnit, string> = { GRAM: "g", ML: "ml", PIECE: "pz" };

interface Ingredient { id: string; name: string; baseUnit: BaseUnit; cost: number }
interface SubRecipe { id: string; name: string; yieldUnit: BaseUnit }
interface ModItem {
  ingredientId: string | null;
  subRecipeId: string | null;
  quantity: number;
  unit: BaseUnit;
  ingredient?: { id: string; name: string; baseUnit: BaseUnit; cost: number };
  subRecipe?: { id: string; name: string; yieldUnit: BaseUnit };
}
interface Modifier { name: string; priceAdd: number; count: number; items: ModItem[]; isAvailable?: boolean }

const cellCls = "rounded-lg px-3 py-2 text-sm outline-none";
const cellStyle = { background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;

export default function ExtrasPage() {
  const [mods, setMods] = useState<Modifier[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Modifier | null>(null);
  const [items, setItems] = useState<ModItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function reload() {
    const [m, i, s] = await Promise.all([
      api.get("/api/recipes/modifiers"),
      api.get("/api/inventory/ingredients"),
      api.get("/api/recipes/subrecipes"),
    ]);
    setMods(m.data || []);
    setIngredients(i.data || []);
    setSubRecipes(s.data || []);
  }
  useEffect(() => { reload().catch(() => {}); }, []);

  function selectMod(m: Modifier) {
    setSelected(m);
    setMsg(null);
    setItems(
      (m.items || []).map((it) => ({
        ingredientId: it.ingredientId,
        subRecipeId: it.subRecipeId,
        quantity: Number(it.quantity || 0),
        unit: it.unit,
        ingredient: it.ingredient,
        subRecipe: it.subRecipe,
      })),
    );
  }

  function addRow(kind: "ingredient" | "subrecipe") {
    setItems((p) => [...p, { ingredientId: kind === "ingredient" ? "" : null, subRecipeId: kind === "subrecipe" ? "" : null, quantity: 0, unit: "GRAM" }]);
  }
  function removeRow(idx: number) { setItems((p) => p.filter((_, i) => i !== idx)); }
  function patchRow(idx: number, patch: Partial<ModItem>) { setItems((p) => p.map((it, i) => (i === idx ? { ...it, ...patch } : it))); }

  function pickIngredient(idx: number, id: string) {
    const ing = ingredients.find((x) => x.id === id);
    patchRow(idx, ing ? { ingredientId: ing.id, subRecipeId: null, unit: ing.baseUnit } : { ingredientId: "" });
  }
  function pickSub(idx: number, id: string) {
    const sub = subRecipes.find((x) => x.id === id);
    patchRow(idx, sub ? { subRecipeId: sub.id, ingredientId: null, unit: sub.yieldUnit } : { subRecipeId: "" });
  }

  async function save() {
    if (!selected) return;
    for (const it of items) {
      if (!it.ingredientId && !it.subRecipeId) { setMsg({ kind: "err", text: "Hay una fila sin insumo" }); return; }
      if (!Number.isFinite(Number(it.quantity)) || Number(it.quantity) <= 0) { setMsg({ kind: "err", text: "Cantidad inválida" }); return; }
    }
    setSaving(true); setMsg(null);
    try {
      await api.post("/api/recipes/modifiers", {
        name: selected.name,
        items: items.map((it) => ({
          ingredientId: it.ingredientId || undefined,
          subRecipeId: it.subRecipeId || undefined,
          quantity: Number(it.quantity),
          unit: it.unit,
        })),
      });
      setMsg({ kind: "ok", text: "Extra guardado" });
      await reload();
    } catch (err: any) {
      setMsg({ kind: "err", text: err?.response?.data?.error || "Error al guardar" });
    } finally { setSaving(false); }
  }

  async function toggleAvailability(m: Modifier, next: boolean) {
    try {
      await api.patch("/api/recipes/modifiers/availability", { name: m.name, isAvailable: next });
      await reload();
      setSelected((cur) => (cur && cur.name === m.name ? { ...cur, isAvailable: next } : cur));
      setMsg({ kind: "ok", text: next ? "Extra marcado disponible" : "Extra marcado agotado" });
    } catch {
      setMsg({ kind: "err", text: "No se pudo cambiar la disponibilidad" });
    }
  }

  const filtered = mods.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Inventario · Costeo"
        title="Extras / Modificadores"
        subtitle="Qué insumo descuenta cada extra al venderse"
      />
      <PageTabs set="inventario" />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Lista */}
        <Card className="p-3">
          <div className="mb-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar extra…" />
          </div>
          <div className="max-h-[70vh] space-y-1 overflow-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-tx-mut">Sin modificadores</p>
            ) : (
              filtered.map((m) => {
                const mapped = (m.items?.length ?? 0) > 0;
                const active = selected?.name === m.name;
                return (
                  <button
                    key={m.name}
                    onClick={() => selectMod(m)}
                    className="flex w-full items-center gap-2 rounded-ds-md px-3 py-2 text-left transition-colors"
                    style={{ background: active ? "var(--surf-2)" : "transparent", border: `1px solid ${active ? "var(--bd-1)" : "transparent"}` }}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: mapped ? "var(--ok)" : "var(--bd-2)" }}
                      title={mapped ? "Mapeado" : "Sin mapear"}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-tx">{m.name}</span>
                    {m.isAvailable === false && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase" style={{ background: "var(--err-soft)", color: "var(--err)" }}>Agotado</span>
                    )}
                    <span className="font-mono text-[11px] text-tx-mut">{m.priceAdd > 0 ? `+${formatMoney(m.priceAdd)}` : "—"}</span>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Editor */}
        <Card className="p-4 md:p-5">
          {!selected ? (
            <EmptyState icon={ClipboardList} title="Selecciona un extra" hint="Elige un modificador para decir qué insumo descuenta." />
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--bd-1)" }}>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-xl font-extrabold text-tx-hi">{selected.name}</h2>
                  <p className="text-sm text-tx-mut">
                    {selected.priceAdd > 0 ? <>Cobra <strong className="text-tx">+{formatMoney(selected.priceAdd)}</strong> · </> : null}
                    aparece en <strong className="text-tx">{selected.count}</strong> platillo(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => toggleAvailability(selected, selected.isAvailable === false)}
                  >
                    {selected.isAvailable === false ? "Agotado · marcar disponible" : "Disponible · marcar agotado"}
                  </Button>
                  <Button icon={Save} onClick={save} loading={saving}>Guardar</Button>
                </div>
              </div>

              {msg && (
                <div className="rounded-ds-md px-3 py-2 text-xs font-bold" style={{ background: msg.kind === "ok" ? "var(--ok-soft)" : "var(--err-soft)", color: msg.kind === "ok" ? "var(--ok)" : "var(--err)" }}>
                  {msg.text}
                </div>
              )}

              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Insumos que descuenta</h3>
                  <div className="flex gap-2">
                    <ChipBtn icon={Plus} onClick={() => addRow("ingredient")}>Ingrediente</ChipBtn>
                    <ChipBtn icon={Layers} onClick={() => addRow("subrecipe")}>Sub-receta</ChipBtn>
                  </div>
                </div>

                {items.length === 0 ? (
                  <p className="rounded-ds-md px-3 py-6 text-center text-sm text-tx-mut" style={{ background: "var(--surf-2)" }}>
                    Sin insumos. Agrega lo que consume este extra (ej. 150g papa) o déjalo vacío si no descuenta nada.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.map((it, idx) => {
                      const isSub = it.subRecipeId !== null;
                      return (
                        <div key={idx} className="flex flex-wrap items-center gap-2 rounded-ds-md p-2" style={{ background: "var(--surf-2)" }}>
                          {isSub ? (
                            <select value={it.subRecipeId || ""} onChange={(e) => pickSub(idx, e.target.value)} className={cellCls + " min-w-[180px] flex-1"} style={cellStyle}>
                              <option value="">— Sub-receta —</option>
                              {subRecipes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          ) : (
                            <select value={it.ingredientId || ""} onChange={(e) => pickIngredient(idx, e.target.value)} className={cellCls + " min-w-[180px] flex-1"} style={cellStyle}>
                              <option value="">— Ingrediente —</option>
                              {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                          )}
                          <input
                            type="number" inputMode="decimal" min={0} value={it.quantity || ""}
                            onChange={(e) => patchRow(idx, { quantity: Number(e.target.value) })}
                            className={cellCls + " w-24 text-right"} style={cellStyle} placeholder="Cant."
                          />
                          <span className="w-8 text-sm text-tx-mut">{UNIT_LABEL[it.unit]}</span>
                          <button onClick={() => removeRow(idx)} className="rounded-lg p-2 text-tx-mut hover:text-tx" style={{ background: "var(--surf-1)" }} title="Quitar">
                            <X size={15} strokeWidth={2.4} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="mt-3 text-xs text-tx-mut">
                  Ojo: no mapees los <strong>sabores</strong> de alitas (BBQ, Mango…) si la salsa ya está en la receta base del platillo — sería doble descuento.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function ChipBtn({ icon: Icon, onClick, children }: { icon: typeof Plus; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-3 text-xs font-bold text-tx" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
      <Icon size={14} strokeWidth={2} /> {children}
    </button>
  );
}
