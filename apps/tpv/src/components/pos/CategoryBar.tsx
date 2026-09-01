import React, { useRef, useEffect, memo } from "react";
import { ChevronLeft } from "lucide-react";
import { CategoryButton } from "./CategoryGrid";
import { categoryTone } from "@/lib/catalog-helpers";
import type { CategoryLite } from "./CategoryGrid";

export function CategoryBar({
  categories,
  counts,
  favoritesCount,
  activeId,
  onSelect,
}: {
  categories: CategoryLite[];
  counts: Record<string, number>;
  favoritesCount: number;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="shrink-0 border-b border-bd bg-surf-1 px-3 py-2">
      <div className="flex h-[58px] gap-2 overflow-x-auto scrollbar-hide">
        <CategoryButton
          label="Todos"
          count={Object.values(counts).reduce((sum, count) => sum + count, 0)}
          active={activeId === "all"}
          tone="neutral"
          onClick={() => onSelect("all")}
        />
        {favoritesCount > 0 && (
          <CategoryButton
            label="★ Favoritos"
            count={favoritesCount}
            active={activeId === "favorites"}
            tone="neutral"
            onClick={() => onSelect("favorites")}
          />
        )}
        {categories.map((category) => (
          <CategoryButton
            key={category.id}
            label={category.name}
            count={counts[category.id] ?? counts[category.name] ?? 0}
            active={activeId === category.id}
            tone={categoryTone(category.name)}
            onClick={() => onSelect(category.id)}
          />
        ))}
      </div>
    </nav>
  );
}

export function DrilldownHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <nav className="shrink-0 border-b border-bd bg-surf-1 px-3 py-2">
      <div className="flex h-[58px] items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 items-center gap-1.5 rounded-lg border-2 border-bd bg-surf-2 px-3 text-tx-pri active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
        >
          <ChevronLeft size={20} strokeWidth={3} />
          <span className="text-[13px] font-semibold uppercase">Categorías</span>
        </button>
        <span className="min-w-0 flex-1 truncate text-[18px] font-black text-tx-pri">
          {title}
        </span>
      </div>
    </nav>
  );
}

