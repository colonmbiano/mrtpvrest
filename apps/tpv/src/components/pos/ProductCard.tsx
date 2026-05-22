"use client";
import React, { memo, useCallback, useRef } from "react";
import { Flame, Plus, Star } from "lucide-react";
import { useTicketStore } from "@/store/ticketStore";
import { categoryTone } from "@/lib/categoryTheme";

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

const LONG_PRESS_MS = 500;

// Suscripción atómica: sólo lee la cantidad de este producto en el ticket
// activo. Cuando otros productos cambian, este card NO se re-renderiza
// porque Zustand devuelve la misma primitiva (number) y el selector se
// short-circuita en el comparador por defecto (Object.is).
function useQuantityForProduct(productId: string): number {
  return useTicketStore((s) => s.quantitiesByProduct?.[productId] ?? 0);
}

function ProductCardBase({
  id,
  name,
  price,
  imageUrl,
  category,
  promoPrice,
  isAvailable = true,
  isFavorite = false,
  isPopular = false,
  onClick,
  onLongPress,
  currency = "$",
}: ProductCardProps) {
  const quantityInTicket = useQuantityForProduct(id);

  const hasPromo = !!promoPrice && promoPrice < price;
  const displayPrice = hasPromo ? promoPrice! : price;
  const tone = categoryTone(category);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(() => {
    longFired.current = false;
    if (!onLongPress) return;
    cancel();
    timer.current = setTimeout(() => {
      longFired.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }, [onLongPress, cancel]);

  const handleClick = useCallback(() => {
    cancel();
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    if (!isAvailable) return;
    onClick?.();
  }, [cancel, isAvailable, onClick]);

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={handleClick}
      aria-disabled={!isAvailable}
      className="product-card relative flex flex-col text-left rounded-2xl overflow-hidden p-3 min-h-[120px] border border-white/5 active:scale-[0.97] active:brightness-125 transition-transform duration-100 disabled:active:scale-100 select-none"
      style={{
        background: imageUrl ? "#0a0a0c" : tone.tile,
        opacity: isAvailable ? 1 : 0.55,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Franja superior de acento semántico (azul=bebida, cálido=comida,
          verde=modificador). Identificación de familia de un vistazo. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 z-10 pointer-events-none"
        style={{ background: tone.accent }}
      />

      {imageUrl && (
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
        />
      )}

      {hasPromo && (
        <span
          className="relative z-10 self-start px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest text-black"
          style={{ background: tone.accent }}
        >
          PROMO
        </span>
      )}

      {isFavorite && (
        <span
          aria-label="Favorito"
          className="absolute z-10 left-2 top-3 w-6 h-6 rounded-full bg-[#ffb84d] text-black flex items-center justify-center"
        >
          <Star size={12} strokeWidth={2.5} fill="currentColor" />
        </span>
      )}

      {isPopular && (
        <span
          aria-label="Popular"
          className="absolute z-10 right-2 top-3 inline-flex h-6 items-center gap-1 rounded-full bg-rose-500 px-2 text-[9px] font-black tracking-widest text-white"
        >
          <Flame size={12} strokeWidth={2.5} fill="currentColor" />
          TOP
        </span>
      )}

      {!isAvailable && (
        <span className="absolute z-10 inset-x-2 top-3 px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest bg-red-500 text-white text-center">
          AGOTADO
        </span>
      )}

      {quantityInTicket > 0 && isAvailable && (
        <span
          aria-label={`${quantityInTicket} en comanda`}
          className="absolute z-20 left-2 bottom-2 min-w-[26px] h-[26px] px-1.5 rounded-full bg-[#88d66c] text-black text-[11px] font-black tabular-nums flex items-center justify-center"
        >
          ×{quantityInTicket}
        </span>
      )}

      <div className="flex-1" />

      <div
        className="relative z-10 flex flex-col gap-0.5 rounded-lg"
        style={imageUrl ? { background: "#0a0a0ccc", padding: "4px 6px", margin: "-4px -6px" } : undefined}
      >
        <span className="text-[11px] font-black leading-tight text-white tracking-tight line-clamp-2 pr-8">
          {name}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-black tabular-nums text-white mono">
            {currency}
            {(displayPrice ?? 0).toFixed(0)}
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
        className="absolute z-10 right-2 bottom-2 w-7 h-7 rounded-xl flex items-center justify-center"
        style={{ background: tone.accent, color: tone.accentFg }}
      >
        <Plus size={14} strokeWidth={3} />
      </span>
    </button>
  );
}

// Comparador estricto: re-render sólo si cambia alguna prop primitiva o
// la referencia de los handlers. ProductGrid cachea los handlers por id
// para que la igualdad referencial se preserve entre renders del parent.
function propsAreEqual(prev: ProductCardProps, next: ProductCardProps): boolean {
  return (
    prev.id === next.id &&
    prev.name === next.name &&
    prev.price === next.price &&
    prev.category === next.category &&
    prev.promoPrice === next.promoPrice &&
    prev.imageUrl === next.imageUrl &&
    prev.isAvailable === next.isAvailable &&
    prev.isFavorite === next.isFavorite &&
    prev.isPopular === next.isPopular &&
    prev.currency === next.currency &&
    prev.onClick === next.onClick &&
    prev.onLongPress === next.onLongPress
  );
}

const ProductCard = memo(ProductCardBase, propsAreEqual);
ProductCard.displayName = "ProductCard";
export default ProductCard;
