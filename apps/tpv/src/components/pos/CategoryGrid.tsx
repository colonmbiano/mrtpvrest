import React from "react";
import { categoryTone, itemsLabel } from "@/lib/catalog-helpers";
import { type CatalogDensity } from "@/store/catalogPrefsStore";

export type CategoryLite = {
  id: string;
  name: string;
  isActive?: boolean;
};

export function CategoryGrid({
  categories,
  counts,
  favoritesCount,
  density,
  onSelect,
}: {
  categories: CategoryLite[];
  counts: Record<string, number>;
  favoritesCount: number;
  density: CatalogDensity;
  onSelect: (id: string) => void;
}) {
  // Columnas fluidas: el nº de tarjetas se calcula del ANCHO REAL disponible
  // (catálogo junto al sidebar), no de breakpoints de viewport. La density
  // (S/M/L) controla el ancho mínimo de tarjeta → más densidad = más columnas.
  const minColWidth = density === 6 ? 120 : density === 3 ? 180 : 140;
  const rowHeight = density === 6 ? 108 : density === 3 ? 144 : 124;

  return (
    <div className="h-full overflow-y-auto overscroll-contain scrollbar-hide">
      <div
        className="grid gap-2.5 pb-4"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${minColWidth}px, 1fr))`,
          gridAutoRows: `${rowHeight}px`,
        }}
      >
        {favoritesCount > 0 && (
          <button
            type="button"
            onClick={() => onSelect("favorites")}
            className="relative flex h-full flex-col justify-between overflow-hidden rounded-lg border-2 border-bd bg-surf-1 p-3 text-left text-tx-pri shadow-sm active:bg-surf-2 focus:outline-none focus:ring-2 focus:ring-iris-500"
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-amber-400" />
            <span className="line-clamp-2 pt-1 text-[17px] font-black leading-tight">
              ★ Favoritos
            </span>
            <span className="text-[12px] font-semibold uppercase opacity-60">
              {itemsLabel(favoritesCount)}
            </span>
          </button>
        )}
        {categories.map((category) => {
          const tone = categoryTone(category.name);
          const palette = {
            food: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
            wings: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
            snack: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
            drink: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
            neutral: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
          }[tone];
          const accent = {
            food: "bg-orange-500",
            wings: "bg-red-500",
            snack: "bg-amber-400",
            drink: "bg-blue-500",
            neutral: "bg-emerald-500",
          }[tone];
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelect(category.id)}
              className={`relative flex h-full flex-col justify-between overflow-hidden rounded-lg border-2 p-3 text-left shadow-sm ${palette} focus:outline-none focus:ring-2 focus:ring-iris-500`}
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${accent}`} />
              <span className="line-clamp-2 pt-1 text-[17px] font-black leading-tight">
                {category.name}
              </span>
              <span className="text-[12px] font-semibold uppercase opacity-60">
                {itemsLabel(counts[category.id] ?? counts[category.name] ?? 0)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// "1 item" / "N items" — evita el "1 ITEMS" agramatical.
export function CategoryButton({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone: "food" | "wings" | "snack" | "drink" | "neutral";
  onClick: () => void;
}) {
  const palette = {
    food: active ? "bg-iris-500 text-iris-fg border-iris-500" : "bg-surf-1 text-tx-sec border-bd active:bg-surf-2",
    wings: active ? "bg-iris-500 text-iris-fg border-iris-500" : "bg-surf-1 text-tx-sec border-bd active:bg-surf-2",
    snack: active ? "bg-iris-500 text-iris-fg border-iris-500" : "bg-surf-1 text-tx-sec border-bd active:bg-surf-2",
    drink: active ? "bg-iris-500 text-iris-fg border-iris-500" : "bg-surf-1 text-tx-sec border-bd active:bg-surf-2",
    neutral: active ? "bg-iris-500 text-iris-fg border-iris-500" : "bg-surf-1 text-tx-sec border-bd active:bg-surf-2",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col justify-center rounded-lg border-2 px-3 text-left shadow-[0_4px_12px_rgba(0,0,0,0.35)] ${palette} focus:outline-none focus:ring-2 focus:ring-iris-500`}
      style={{ width: 116, minWidth: 116, height: 58 }}
    >
      <span className="block truncate text-[13px] font-semibold leading-tight">{label}</span>
      <span className="mt-0.5 block text-[11px] font-semibold uppercase text-current opacity-70">
        {itemsLabel(count)}
      </span>
    </button>
  );
}

