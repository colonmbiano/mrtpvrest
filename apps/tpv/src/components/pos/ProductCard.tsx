"use client";
import React, { useRef } from "react";
import { Flame, Plus, Star } from "lucide-react";

export interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  category?: string;
  promoPrice?: number | null;
  isAvailable?: boolean;
  isFavorite?: boolean;
  isPopular?: boolean;
  onClick?: () => void;
  onLongPress?: () => void;
  currency?: string;
}

const TILE_PALETTE = [
  "#121316",
  "#1a1b1f",
  "#22242a",
];

function hashColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TILE_PALETTE[h % TILE_PALETTE.length];
}

const LONG_PRESS_MS = 500;

const ProductCard: React.FC<ProductCardProps> = ({
  id,
  name,
  price,
  imageUrl,
  promoPrice,
  isAvailable = true,
  isFavorite = false,
  isPopular = false,
  onClick,
  onLongPress,
  currency = "$",
}) => {
  const hasPromo = promoPrice && promoPrice < price;
  const displayPrice = hasPromo ? promoPrice : price;
  const tileColor = hashColor(id || name);

  // Long-press: si el dedo se mantiene LONG_PRESS_MS sin moverse mucho ni
  // soltarse, dispara onLongPress y suprime el onClick. Útil para abrir
  // el menú contextual (toggle disponibilidad, marcar favorito).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const handlePointerDown = () => {
    longFired.current = false;
    if (!onLongPress) return;
    cancel();
    timer.current = setTimeout(() => {
      longFired.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  };

  const handleClick = () => {
    cancel();
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    onClick?.();
  };

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={handleClick}
      disabled={!isAvailable}
      className="product-card group relative flex flex-col text-left rounded-2xl overflow-hidden p-3 min-h-[120px] transition-all active:scale-[0.98] border border-white/5 shadow-xl disabled:active:scale-100"
      style={{
        background: imageUrl ? "#0a0a0c" : tileColor,
        opacity: isAvailable ? 1 : 0.55,
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
        <span className="relative z-10 self-start px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest bg-amber-500 text-black shadow-lg">
          PROMO
        </span>
      )}

      {isFavorite && (
        <span
          aria-label="Favorito"
          className="absolute z-10 left-2 top-2 w-6 h-6 rounded-full bg-amber-500/90 text-black flex items-center justify-center shadow-lg"
        >
          <Star size={12} strokeWidth={2.5} fill="currentColor" />
        </span>
      )}

      {isPopular && (
        <span
          aria-label="Popular"
          className="absolute z-10 right-2 top-2 inline-flex h-6 items-center gap-1 rounded-full bg-rose-500/90 px-2 text-[9px] font-black tracking-widest text-white shadow-lg"
        >
          <Flame size={12} strokeWidth={2.5} fill="currentColor" />
          TOP
        </span>
      )}

      {!isAvailable && (
        <span className="absolute z-10 inset-x-2 top-2 px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest bg-red-500/90 text-white text-center">
          AGOTADO
        </span>
      )}

      <div className="flex-1" />

      <div className="relative z-10 flex flex-col gap-0.5">
        <span className="text-[11px] font-black leading-tight text-white tracking-tight line-clamp-2 pr-8">
          {name}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-black tabular-nums text-white mono">
            {currency}{(displayPrice ?? 0).toFixed(0)}
          </span>
          {hasPromo && (
            <span className="text-[10px] line-through tabular-nums text-zinc-500 font-bold mono">
              {price.toFixed(0)}
            </span>
          )}
        </div>
      </div>

      <span
        aria-hidden
        className="absolute z-10 right-2 bottom-2 w-7 h-7 rounded-xl flex items-center justify-center transition-all bg-amber-500 text-[#0a0a0c] shadow-[0_4px_12px_rgba(255,184,77,0.3)] group-active:scale-90"
      >
        <Plus size={14} strokeWidth={3} />
      </span>
    </button>
  );
};

export default ProductCard;
