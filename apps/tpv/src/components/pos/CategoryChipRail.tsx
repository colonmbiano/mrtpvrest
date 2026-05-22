"use client";
import React from "react";
import { Star } from "lucide-react";
import { categoryTone } from "@/lib/categoryTheme";

interface CategoryLite {
  id: string;
  name: string;
}

interface Props {
  categories: CategoryLite[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  showFavorites: boolean;
}

export const FAVORITES_CHIP_ID = "__favorites__";

export default function CategoryChipRail({
  categories,
  activeId,
  onSelect,
  showFavorites,
}: Props) {
  return (
    <div className="px-3 sm:px-4 lg:px-6 pb-2 pt-1 shrink-0">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {showFavorites && (
          <Chip
            active={activeId === FAVORITES_CHIP_ID}
            onClick={() => onSelect(FAVORITES_CHIP_ID)}
          >
            <Star
              size={11}
              strokeWidth={2.5}
              fill="currentColor"
              className="text-amber-400"
            />
            <span>Favoritos</span>
          </Chip>
        )}
        <Chip active={activeId === null} onClick={() => onSelect(null)}>
          Todos
        </Chip>
        {categories.map((c) => (
          <Chip
            key={c.id}
            active={activeId === c.id}
            accent={categoryTone(c.name).accent}
            onClick={() => onSelect(c.id)}
          >
            {c.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  accent,
  children,
}: {
  active: boolean;
  onClick: () => void;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={
        active && accent
          ? { background: accent, borderColor: accent, color: "#0a0a0c" }
          : undefined
      }
      className={`shrink-0 inline-flex items-center gap-1.5 h-9 min-h-[36px] px-4 rounded-full border text-[11px] font-black uppercase tracking-[0.1em] transition-transform duration-100 active:scale-95 whitespace-nowrap ${
        active
          ? accent
            ? ""
            : "border-iris-500 bg-iris-500/15 text-iris-500"
          : "border-bd bg-surf-2 active:bg-surf-3 text-tx-pri"
      }`}
    >
      {children}
    </button>
  );
}
