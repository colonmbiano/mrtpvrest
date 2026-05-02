"use client";
import React from "react";

interface Category {
  id: string;
  name: string;
}

interface CategoryRailProps {
  categories: Category[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Mapa categoryId -> número a mostrar como badge (ej. cantidad de productos) */
  counts?: Record<string, number>;
}

const CategoryRail: React.FC<CategoryRailProps> = ({
  categories,
  activeId,
  onSelect,
  counts,
}) => {
  return (
    <div className="w-full overflow-x-auto scrollbar-hide border-b border-bd bg-surf-0 sticky top-0 z-10">
      <div className="flex px-4 sm:px-6 gap-6 min-w-max">
        {categories.map((cat) => {
          const isActive = activeId === cat.id;
          const count = counts?.[cat.id];
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={`
                relative h-12 flex items-center justify-center gap-1.5
                text-[13px] font-medium transition-all
                ${isActive ? "text-tx-pri" : "text-tx-mut hover:text-tx-pri"}
              `}
            >
              <span className="uppercase tracking-wide">{cat.name}</span>
              {typeof count === "number" && (
                <span
                  className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
                  style={{
                    background: isActive ? "rgba(255,132,0,0.18)" : "rgba(255,255,255,0.06)",
                    color: isActive ? "#FF8400" : "#B8B9B6",
                    minWidth: 20,
                  }}
                >
                  {count}
                </span>
              )}

              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-iris-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryRail;
