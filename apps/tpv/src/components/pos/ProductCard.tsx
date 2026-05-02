"use client";
import React from "react";

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

const ProductCard: React.FC<ProductCardProps> = ({
  name,
  price,
  imageUrl,
  promoPrice,
  onClick,
  currency = "$",
}) => {
  const hasPromo = promoPrice && promoPrice < price;
  const displayPrice = hasPromo ? promoPrice : price;
  const discount = hasPromo ? Math.round(((price - (promoPrice ?? 0)) / price) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className="group flex flex-col text-left rounded-lg overflow-hidden transition-pos hover:translate-y-[-2px] bg-surf-1 border border-bd shadow-sm active:scale-[0.98]"
    >
      {/* IMAGEN / PLACEHOLDER */}
      <div className="relative w-full aspect-[4/3] overflow-hidden bg-surf-2">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full img-placeholder" />
        )}

        {/* BADGE DESCUENTO */}
        {hasPromo && (
          <div className="absolute top-2 right-2 bg-success text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
            -{discount}%
          </div>
        )}
      </div>

      {/* INFO */}
      <div className="p-3 flex flex-col gap-0.5">
        <span className="text-tx-pri text-[14px] font-semibold leading-tight line-clamp-2">
          {name}
        </span>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-tx-pri text-[14px] font-bold mono tnum">
            {currency}{displayPrice?.toFixed(2)}
          </span>
          {hasPromo && (
            <span className="text-tx-mut text-[11px] font-medium line-through mono tnum">
              {currency}{price.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

export default ProductCard;
