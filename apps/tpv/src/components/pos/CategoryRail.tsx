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
}

const CategoryRail: React.FC<CategoryRailProps> = ({
  categories,
  activeId,
  onSelect,
}) => {
  return (
    <div className="w-full overflow-x-auto scrollbar-hide border-b border-bd bg-surf-0">
      <div className="flex px-2 min-w-max">
        {categories.map((cat) => {
          const isActive = activeId === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={`
                relative h-12 px-5 flex items-center justify-center
                text-[13px] font-bold uppercase tracking-widest transition-pos
                ${isActive ? "text-iris-500" : "text-tx-mut hover:text-tx-sec"}
              `}
            >
              {cat.name}
              
              {/* UNDERLINE ANIMADO */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-iris-500 rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryRail;
