"use client";
import React from "react";
import { Plus } from "lucide-react";

export interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  category?: string;
  promoPrice?: number | null;
  onClick?: () => void;
  currency?: string;
}

// Paleta de colores Warm Tech para productos sin imagen
const TILE_PALETTE = [
  "#121316", // Base Obsidian
  "#1a1b1f", // Surface 2
  "#22242a", // Surface 3
];

function hashColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TILE_PALETTE[h % TILE_PALETTE.length];
}

const ProductCard: React.FC<ProductCardProps> = ({
  id,
  name,
  price,
  imageUrl,
  promoPrice,
  onClick,
  currency = "$",
}) => {
  const hasPromo = promoPrice && promoPrice < price;
  const displayPrice = hasPromo ? promoPrice : price;
  const tileColor = hashColor(id || name);

  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col text-left rounded-3xl overflow-hidden p-4 min-h-[160px] transition-all active:scale-[0.98] border border-white/5 shadow-xl"
      style={{
        background: imageUrl ? "#0a0a0c" : tileColor,
      }}
    >
      {imageUrl && (
        <>
          <img
            src={imageUrl}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover opacity-60 transition-transform duration-700 group-active:scale-110"
          />
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(180deg, rgba(10,10,12,0) 0%, rgba(10,10,12,0.8) 100%)",
            }}
          />
        </>
      )}

      {hasPromo && (
        <span className="relative z-10 self-start px-2.5 py-1 rounded-lg text-[9px] font-black tracking-widest bg-amber-500 text-black shadow-lg">
          PROMO
        </span>
      )}

      <div className="flex-1" />

      <div className="relative z-10 flex flex-col gap-1">
        <span className="text-sm font-black leading-tight text-white tracking-tight line-clamp-2 pr-4">
          {name}
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-black tabular-nums text-white mono">
            {currency}{(displayPrice ?? 0).toFixed(0)}
          </span>
          {hasPromo && (
            <span className="text-[11px] line-through tabular-nums text-zinc-500 font-bold mono">
              {price.toFixed(0)}
            </span>
          )}
        </div>
      </div>

      <span
        aria-hidden
        className="absolute z-10 right-3 bottom-3 w-8 h-8 rounded-2xl flex items-center justify-center transition-all bg-amber-500 text-[#0a0a0c] shadow-[0_5px_15px_rgba(255,184,77,0.3)] group-active:scale-90"
      >
        <Plus size={18} strokeWidth={3} />
      </span>
    </button>
  );
};

export default ProductCard;
