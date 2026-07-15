"use client";
import { Save, Trash2, X, Soup, Plus, Layers } from "lucide-react";
import { Button, IconButton, EmptyState, Textarea } from "@/components/ds";
import { formatMoney } from "@/lib/format";

export type BaseUnit = "GRAM" | "ML" | "PIECE";

export const BASE_UNIT_LABEL: Record<BaseUnit, string> = { GRAM: "g", ML: "ml", PIECE: "pz" };

export interface Ingredient { id: string; name: string; baseUnit: BaseUnit; cost: number }

export interface SubRecipeItem {
  id?: string;
  ingredientId: string | null;
  nestedSubRecipeId: string | null;
  qty: number;
  unit: BaseUnit;
  refName?: string;
  refCost?: number;
}

export interface SubRecipe {
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

const cellCls = "rounded-lg px-3 py-2 text-sm text-tx outline-none transition-colors focus:border-primary";
const cellStyle = { background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;

export function SubRecipeEditor({
  selectedId,
  ingredients,
  subRecipes,
  name, setName,
  description, setDescription,
  yieldQty, setYieldQty,
  yieldUnit, setYieldUnit,
  marginErrorPct, setMarginErrorPct,
  items,
  addItem, pickIngredient, pickNested, updateItem, removeItem,
  totalCost, costPerYield,
  saving, msg, onSave, onRemove,
}: {
  selectedId: string | "new" | null;
  ingredients: Ingredient[];
  subRecipes: SubRecipe[];
  name: string; setName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  yieldQty: string; setYieldQty: (v: string) => void;
  yieldUnit: BaseUnit; setYieldUnit: (v: BaseUnit) => void;
  marginErrorPct: string; setMarginErrorPct: (v: string) => void;
  items: SubRecipeItem[];
  addItem: (kind: "ingredient" | "subrecipe") => void;
  pickIngredient: (idx: number, id: string) => void;
  pickNested: (idx: number, id: string) => void;
  updateItem: (idx: number, patch: Partial<SubRecipeItem>) => void;
  removeItem: (idx: number) => void;
  totalCost: number;
  costPerYield: number | null;
  saving: boolean;
  msg: { kind: "ok" | "err"; text: string } | null;
  onSave: () => void;
  onRemove: () => void;
}) {
  if (!selectedId) {
    return <EmptyState icon={Soup} title="Selecciona una sub-receta" hint="Elige una de la lista o crea una nueva para editar." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (ej. Salsa verde, Mezcla quesos)"
          className="min-h-12 flex-1 rounded-ds-md px-3 text-base font-bold text-tx outline-none focus:border-primary"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
        />
        <Button icon={Save} onClick={onSave} loading={saving}>Guardar</Button>
        {selectedId !== "new" && (
          <IconButton icon={Trash2} label="Eliminar" danger size={44} onClick={onRemove} />
        )}
      </div>

      {msg && <Banner msg={msg} />}

      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Descripción opcional (instrucciones, notas)"
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
                  className="grid grid-cols-[1fr_44px_40px] items-center gap-2 rounded-ds-md p-2 sm:grid-cols-[1fr_90px_44px_40px]"
                  style={{ background: "var(--surf-2)" }}
                >
                  {isNested ? (
                    <select
                      value={it.nestedSubRecipeId || ""}
                      onChange={(e) => pickNested(idx, e.target.value)}
                      className={`${cellCls} col-span-full sm:col-span-1`} style={cellStyle}
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
                      className={`${cellCls} col-span-full sm:col-span-1`} style={cellStyle}
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
          <span className="font-display text-base font-extrabold tabular-nums text-tx-hi">{formatMoney(totalCost)}</span>
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
  );
}

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
