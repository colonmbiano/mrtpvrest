"use client";
import { Search, Package, SlidersHorizontal, Pencil, Trash2, Check, Plus } from "lucide-react";
import { Card, Button, IconButton, Pill, ProgressBar, EmptyState } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import { stockLevel, type Ingredient } from "./shared";

export function IngredientsTab({
  filtered,
  loading,
  search, setSearch,
  allSelected,
  selectedIds,
  toggleSelect,
  toggleSelectAll,
  openForm,
  openAdjust,
  deleteIngredient,
}: {
  filtered: Ingredient[];
  loading: boolean;
  search: string; setSearch: (v: string) => void;
  allSelected: boolean;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  openForm: (item?: Ingredient) => void;
  openAdjust: (ing: Ingredient) => void;
  deleteIngredient: (id: string) => void;
}) {
  return (
    <div className="mt-4">
      <Card className="mb-3 flex items-center gap-2 p-2.5">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx-mut" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar insumo…"
            className="min-h-11 w-full rounded-ds-md pl-9 pr-3 text-sm outline-none"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
          />
        </div>
        {filtered.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectAll}
            className="hidden min-h-11 items-center gap-2 rounded-ds-md px-3 text-xs font-bold text-tx-mid md:inline-flex"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
          >
            <span
              className="grid h-4 w-4 place-items-center rounded"
              style={{
                background: allSelected ? "var(--brand-primary)" : "transparent",
                border: `1.5px solid ${allSelected ? "var(--brand-primary)" : "var(--bd-2)"}`,
                color: "var(--accent-contrast)",
              }}
            >
              {allSelected && <Check size={11} strokeWidth={3} />}
            </span>
            Todos
          </button>
        )}
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-ds-lg bg-surf-2" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Package} title="Sin insumos"
          hint={search ? "Ningún insumo coincide con tu búsqueda." : "Agrega tu primer insumo o usa la carga inteligente."}
          action={!search ? <Button icon={Plus} onClick={() => openForm()}>Nuevo insumo</Button> : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ing) => {
            const lvl = stockLevel(ing);
            const sel = selectedIds.has(ing.id);
            return (
              <Card
                key={ing.id}
                className="overflow-hidden p-3.5"
                style={sel ? { borderColor: "var(--brand-primary)", boxShadow: "0 0 0 1px var(--accent-soft)" } : undefined}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggleSelect(ing.id)}
                    aria-label={sel ? "Deseleccionar" : "Seleccionar"}
                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded"
                    style={{
                      background: sel ? "var(--brand-primary)" : "transparent",
                      border: `1.5px solid ${sel ? "var(--brand-primary)" : "var(--bd-2)"}`,
                      color: "var(--accent-contrast)",
                    }}
                  >
                    {sel && <Check size={12} strokeWidth={3} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-display text-sm font-extrabold text-tx-hi">{ing.name}</span>
                      <Pill tone={lvl.tone}>{lvl.label}</Pill>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-tx-mut">
                      {ing.supplier?.name || "Sin proveedor"} · {formatMoney(ing.cost)}/{ing.unit}
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-dim">Stock</span>
                    <span className="font-mono text-xs font-semibold" style={{ color: `var(--${lvl.tone})` }}>
                      {ing.stock} {ing.unit} <span className="text-tx-dim">/ mín {ing.minStock}</span>
                    </span>
                  </div>
                  <ProgressBar pct={lvl.pct} tone={lvl.tone} height={7} />
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openAdjust(ing)}
                    className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-ds-md text-xs font-bold text-tx-mid"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                  >
                    <SlidersHorizontal size={14} /> Ajustar
                  </button>
                  <IconButton icon={Pencil} label="Editar" size={40} onClick={() => openForm(ing)} />
                  <IconButton icon={Trash2} label="Eliminar" danger size={40} onClick={() => deleteIngredient(ing.id)} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
