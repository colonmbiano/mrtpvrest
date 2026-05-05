"use client";
import { Search, PackageSearch } from "lucide-react";
import ProductCard, { type ProductCardData } from "./ProductCard";

export default function ProductGrid({
  products,
  onPick,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar platillo...",
  cols = 3,
  currency = "$",
}: {
  products: ProductCardData[];
  onPick: (product: ProductCardData) => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  cols?: 3 | 4;
  currency?: string;
}) {
  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      <div className="relative">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full h-12 pl-11 pr-4 rounded-xl text-sm outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide pr-1">
        {products.length === 0 ? (
          <EmptyState />
        ) : (
          <div
            className={`grid gap-4 ${cols === 4 ? "grid-cols-4" : "grid-cols-3"}`}
          >
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onClick={() => onPick(p)} currency={currency} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="h-full flex flex-col items-center justify-center gap-3 py-16"
      style={{ color: "var(--text-muted)" }}
    >
      <PackageSearch size={42} />
      <p className="text-sm font-semibold">Sin resultados</p>
      <p className="text-xs">Ajusta tu búsqueda o categoría</p>
    </div>
  );
}
