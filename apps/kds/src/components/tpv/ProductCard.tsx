"use client";
import { ImageOff } from "lucide-react";

export type ProductCardData = {
  id: string;
  name: string;
  price: number;
  category?: string;
  imageUrl?: string | null;
};

export default function ProductCard({
  product,
  onClick,
  currency = "$",
}: {
  product: ProductCardData;
  onClick?: () => void;
  currency?: string;
}) {
  const price = `${currency}${product.price.toFixed(2)}`;

  return (
    <button
      onClick={onClick}
      className="group flex flex-col text-left rounded-2xl overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="relative w-full aspect-[4/3] overflow-hidden" style={{ background: "var(--surface-3)" }}>
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
            <ImageOff size={28} />
          </div>
        )}

        <div
          className="absolute top-2 right-2 px-2.5 py-1 rounded-lg text-xs font-bold"
          style={{
            background: "var(--brand)",
            color: "var(--brand-fg)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {price}
        </div>
      </div>

      <div className="p-3 flex flex-col gap-1">
        {product.category && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}
          >
            {product.category}
          </span>
        )}
        <span
          className="text-sm font-bold leading-tight line-clamp-2"
          style={{ color: "var(--text-primary)" }}
        >
          {product.name}
        </span>
      </div>
    </button>
  );
}
