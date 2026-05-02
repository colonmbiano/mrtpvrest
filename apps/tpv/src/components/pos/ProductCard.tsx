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

  return (
    <button
      onClick={onClick}
      className="group flex flex-col text-left rounded-lg bg-surf-2 border border-bd p-3 transition-all hover:border-bd-strong active:scale-[0.98] hover:bg-surf-3"
    >
      {/* IMAGEN / PLACEHOLDER */}
      <div className="relative w-full aspect-square mb-3 rounded-md overflow-hidden bg-surf-1/50 border border-bd">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-surf-1 to-surf-2 opacity-50" />
        )}
      </div>

      {/* INFO */}
      <div className="flex flex-col gap-1">
        <span className="text-tx-pri text-[13px] font-medium leading-tight line-clamp-2">
          {name}
        </span>
        <div className="flex items-center justify-between mt-auto pt-1">
          <span className="text-iris-500 text-[13px] font-bold mono tnum">
            {currency}{displayPrice?.toFixed(2)}
          </span>
          {hasPromo && (
            <span className="text-tx-dis text-[10px] font-medium line-through mono tnum">
              {price.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

export default ProductCard;
