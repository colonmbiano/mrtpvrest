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

// Paleta tipo "bento colorido" del Pencil ANTLd. Cada tile rellena con un color
// sólido determinístico derivado del nombre del producto, dándole identidad
// visual sin requerir foto. Si hay imageUrl, la foto cubre el tile.
const TILE_PALETTE = [
  "#FF8400", "#FFB84D", "#88D66C", "#F472B6", "#A78BFA", "#60A5FA",
  "#34D399", "#F87171", "#FB923C", "#C084FC", "#FACC15", "#22D3EE",
];

function hashColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TILE_PALETTE[h % TILE_PALETTE.length];
}

// Aproximación de luminancia para decidir si el texto va negro o blanco
function isLight(hex: string) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
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
  const lightTile = isLight(tileColor);
  const textOnTile = lightTile ? "#0C0C0E" : "#FFFFFF";
  const subtextOnTile = lightTile ? "rgba(12,12,14,0.7)" : "rgba(255,255,255,0.85)";

  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col text-left rounded-2xl overflow-hidden p-3.5 min-h-[140px] transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: imageUrl ? "transparent" : tileColor,
        boxShadow: `0 6px 18px ${tileColor}40, 0 1px 2px rgba(0,0,0,0.2)`,
      }}
    >
      {imageUrl && (
        <>
          <img
            src={imageUrl}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.55) 100%)",
            }}
          />
        </>
      )}

      {hasPromo && (
        <span
          className="relative z-10 self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mb-1"
          style={{
            background: imageUrl
              ? "rgba(255,255,255,0.95)"
              : (lightTile ? "rgba(12,12,14,0.85)" : "rgba(255,255,255,0.95)"),
            color: imageUrl
              ? "#0C0C0E"
              : (lightTile ? "#FFFFFF" : "#0C0C0E"),
          }}
        >
          PROMO
        </span>
      )}

      <div className="flex-1" />

      <div className="relative z-10 flex flex-col gap-0.5">
        <span
          className="text-[13px] font-bold leading-tight line-clamp-2"
          style={{ color: imageUrl ? "#FFFFFF" : textOnTile }}
        >
          {name}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-base font-bold tabular-nums"
            style={{
              color: imageUrl ? "#FFFFFF" : textOnTile,
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            {currency}
            {(displayPrice ?? 0).toFixed(0)}
          </span>
          {hasPromo && (
            <span
              className="text-[10px] line-through tabular-nums"
              style={{
                color: imageUrl ? "rgba(255,255,255,0.7)" : subtextOnTile,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              {price.toFixed(0)}
            </span>
          )}
        </div>
      </div>

      <span
        aria-hidden
        className="absolute z-10 right-2.5 bottom-2.5 w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 group-active:scale-95"
        style={{
          background: "#FF8400",
          color: "#0C0C0E",
          boxShadow: "0 3px 8px rgba(0,0,0,0.4)",
        }}
      >
        <Plus size={14} strokeWidth={3} />
      </span>
    </button>
  );
};

export default ProductCard;
