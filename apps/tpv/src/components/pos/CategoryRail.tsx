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
    <div className="w-full overflow-x-auto scrollbar-hide border-b border-bd bg-surf-0 sticky top-0 z-10">
      <div className="flex px-4 sm:px-6 gap-6 min-w-max">
        {categories.map((cat) => {
          const isActive = activeId === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={`
                relative h-12 flex items-center justify-center
                text-[13px] font-medium transition-all
                ${isActive ? "text-tx-pri" : "text-tx-mut hover:text-tx-pri"}
              `}
            >
              {cat.name}
              
              {/* UNDERLINE (Linear Style) */}
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
