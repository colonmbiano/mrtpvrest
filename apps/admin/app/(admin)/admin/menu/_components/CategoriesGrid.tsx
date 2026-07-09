"use client";
import { FolderOpen, UtensilsCrossed } from "lucide-react";
import { Card, EmptyState, IconBadge } from "@/components/ds";

/* Grid de categorías (landing del drill-down). Al clickear una tarjeta se entra
   a la vista de productos filtrada por esa categoría. */
export function CategoriesGrid({
  cats,
  itemCountByCat,
  totalItems,
  showAllTile,
  onOpenCategory,
  onOpenAll,
}: {
  cats: any[];
  itemCountByCat: Record<string, number>;
  totalItems: number;
  showAllTile: boolean;
  onOpenCategory: (id: string) => void;
  onOpenAll: () => void;
}) {
  if (cats.length === 0 && !showAllTile) {
    return (
      <EmptyState icon={FolderOpen} title="Sin categorías"
        hint="Crea tu primera categoría al agregar un platillo." />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {cats.length === 0 ? (
        <div className="col-span-full">
          <EmptyState icon={FolderOpen} title="Sin categorías"
            hint="Crea tu primera categoría al agregar un platillo." />
        </div>
      ) : (
        cats.map((c) => {
          const count = itemCountByCat[c.id] || 0;
          return (
            <Card key={c.id}
              onClick={() => onOpenCategory(c.id)}
              className="flex flex-col items-start gap-2 p-4 md:p-5">
              <div className="flex w-full items-center justify-between">
                <IconBadge icon={FolderOpen} tone="ac" size={34} />
                <span className="rounded-full px-2 py-1 font-mono text-[10px] font-bold text-tx-mut"
                  style={{ background: "var(--surf-2)" }}>{count}</span>
              </div>
              <h3 className="font-display text-base font-extrabold leading-tight text-tx-hi">{c.name}</h3>
              <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">
                {count === 1 ? "1 producto" : `${count} productos`}
              </span>
            </Card>
          );
        })
      )}
      {/* Tile especial: ver todo */}
      {showAllTile && (
        <button type="button"
          onClick={onOpenAll}
          className="flex flex-col items-start gap-2 rounded-ds-xl border border-dashed p-4 text-left transition-all active:scale-[0.98] md:p-5"
          style={{ borderColor: "var(--bd-2)" }}>
          <div className="flex w-full items-center justify-between">
            <IconBadge icon={UtensilsCrossed} tone="neutral" size={34} />
            <span className="rounded-full px-2 py-1 font-mono text-[10px] font-bold text-tx-mut"
              style={{ background: "var(--surf-2)" }}>{totalItems}</span>
          </div>
          <h3 className="font-display text-base font-extrabold leading-tight text-tx-hi">Ver todos los productos</h3>
          <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">
            Lista completa
          </span>
        </button>
      )}
    </div>
  );
}
