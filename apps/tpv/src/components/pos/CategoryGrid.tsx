"use client";

/**
 * CategoryGrid — vista A del catálogo POS.
 *
 * Sustituye la cinta horizontal de categorías. El cajero ve primero un
 * grid de tiles compactos (tipografía 11px, padding
 * reducido), tap → entra a los productos de esa categoría. El primer
 * tile, cuando hay favoritos pinned, es "★ Favoritos" — atajo a los
 * platillos de mayor rotación.
 *
 * Estética diseño operativo: stone-900 reposo / stone-800 hover / stone-700
 * active, rounded-2xl, ámbar para acentos. Feedback táctil con
 * `active:scale-[0.98]` para que el cajero sienta cada tap.
 */

import { Star, ChefHat } from "lucide-react";
import { formatDisplayName } from "@/lib/formatDisplayName";

interface CategoryLite {
  id: string;
  name: string;
  icon?: string | null;
}

interface CategoryGridProps {
  categories: CategoryLite[];
  counts: Record<string, number>;
  onSelect: (categoryId: string) => void;
  /** Cantidad de items con isFavorite=true. Si > 0, prepend tile especial. */
  favoritesCount?: number;
  onPickFavorites?: () => void;
}

export default function CategoryGrid({
  categories,
  counts,
  onSelect,
  favoritesCount = 0,
  onPickFavorites,
}: CategoryGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 animate-in fade-in duration-200">
      {favoritesCount > 0 && onPickFavorites && (
        <button
          type="button"
          onClick={onPickFavorites}
          aria-label={`Ver ${favoritesCount} platillos favoritos`}
          className="group flex flex-col items-start gap-1 px-3 py-3 min-h-[88px] rounded-2xl bg-amber-500/10 active:bg-amber-500/20 active:scale-[0.98] transition-all duration-100 border border-amber-500/40 focus-visible:ring-2 focus-visible:ring-amber-500 outline-none text-left"
        >
          <div className="flex items-center gap-1.5 text-amber-400">
            <Star size={14} strokeWidth={2.5} fill="currentColor" />
            <span className="text-[9px] font-bold uppercase tracking-[0.15em]">Top</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.05em] text-amber-100 leading-tight line-clamp-2">
            Favoritos
          </span>
          <span className="text-[9px] font-bold text-amber-400/80 mt-auto">
            {favoritesCount} platillo{favoritesCount !== 1 ? "s" : ""}
          </span>
        </button>
      )}

      {categories.map((cat) => {
        const count = counts[cat.id] ?? 0;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            aria-label={`Ver productos de ${formatDisplayName(cat.name)}`}
            className="group flex flex-col items-start gap-1 px-3 py-3 min-h-[88px] rounded-2xl bg-[#121316] active:bg-[#1a1b1e] active:scale-95 transition-all duration-150 border border-white/5 focus-visible:ring-2 focus-visible:ring-amber-500 outline-none text-left shadow-md"
          >
            <ChefHat size={12} className="text-zinc-500 group-active:text-amber-500 transition-colors" />
            <span className="text-[11px] font-black uppercase tracking-[0.05em] text-tx-pri leading-tight line-clamp-2">
              {formatDisplayName(cat.name)}
            </span>
            <span className="text-[9px] font-bold text-tx-mut mt-auto">
              {count} {count === 1 ? "item" : "items"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
