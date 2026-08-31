import React, { memo, useCallback } from "react";
import { Search, Plus } from "lucide-react";
import { type CatalogDensity } from "@/store/catalogPrefsStore";
import { type Product, useTicketStore } from "@/store/ticketStore";
import { itemsLabel, sameCategory, categoryTone } from "@/lib/catalog-helpers";

export function ProductGrid({
  products,
  onPick,
  onLongPress,
  density,
}: {
  products: Product[];
  onPick: (product: Product) => void;
  onLongPress: (product: Product) => void;
  density: CatalogDensity;
}) {
  // Columnas fluidas: el nº de tarjetas se calcula del ANCHO REAL disponible
  // (catálogo junto al sidebar), no de breakpoints de viewport. La density
  // (S/M/L) controla el ancho mínimo de tarjeta → más densidad = más columnas.
  const minColWidth = density === 6 ? 120 : density === 3 ? 180 : 140;
  const rowHeight = density === 6 ? 108 : density === 3 ? 144 : 124;

  return (
    <div className="h-full overflow-y-auto overscroll-contain scrollbar-hide">
      <div
        className="grid gap-2.5 pb-4"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${minColWidth}px, 1fr))`,
          gridAutoRows: `${rowHeight}px`,
        }}
      >
        {products.map((product) => (
          <ProductTile
            key={product.id}
            product={product}
            onPick={() => onPick(product)}
            onLongPress={() => onLongPress(product)}
          />
        ))}
      </div>
    </div>
  );
}

export function ProductTile({
  product,
  onPick,
  onLongPress,
}: {
  product: Product;
  onPick: () => void;
  onLongPress: () => void;
}) {
  const quantity = useTicketStore((s) => s.quantitiesByProduct?.[product.id] ?? 0);
  const tone = categoryTone(product.category || product.name);
  const palette = {
    food: {
      card: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
      accent: "bg-orange-500",
      button: "bg-orange-500 text-black",
    },
    wings: {
      card: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
      accent: "bg-red-500",
      button: "bg-red-500 text-white",
    },
    snack: {
      card: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
      accent: "bg-amber-400",
      button: "bg-amber-400 text-black",
    },
    drink: {
      card: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
      accent: "bg-blue-500",
      button: "bg-blue-500 text-white",
    },
    neutral: {
      card: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
      accent: "bg-emerald-500",
      button: "bg-emerald-500 text-black",
    },
  }[tone];
  const price = Number(product.promoPrice || product.price || 0);
  const isDisabled = product.isAvailable === false;

  return (
    <button
      type="button"
      onClick={onPick}
      onContextMenu={(event) => {
        event.preventDefault();
        onLongPress();
      }}
      disabled={isDisabled}
      className={`product-card relative flex h-full flex-col overflow-hidden rounded-lg border-2 p-3 text-left shadow-sm ${palette.card} disabled:opacity-45 disabled:grayscale focus:outline-none focus:ring-2 focus:ring-iris-500`}
      style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
    >
      <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${palette.accent}`} />
      {quantity > 0 && (
        <span className="absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-iris-500 px-2 text-[12px] font-semibold text-iris-fg">
          x{quantity}
        </span>
      )}
      {product.isAvailable === false && (
        <span className="mb-2 inline-flex self-start rounded-md bg-surf-3 px-2 py-1 text-[10px] font-semibold uppercase text-tx-sec">
          Agotado
        </span>
      )}
      <span className="line-clamp-2 pr-8 pt-1 text-[16px] font-black leading-tight">
        {product.name}
      </span>
      <span className="mt-auto pt-2 text-[25px] font-black tabular-nums leading-none">
        ${price.toFixed(0)}
      </span>
      <span className={`absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-md ${palette.button}`}>
        <Plus size={22} strokeWidth={3} />
      </span>
    </button>
  );
}

type ConfiguratorInitial = {
  variantId?: string | null;
  selectedModifierIds?: string[];
  quantity?: number;
  notes?: string;
};

export function ProductSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="h-[132px] rounded-lg border-2 border-bd bg-surf-1 animate-pulse" />
      ))}
    </div>
  );
}

export function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-bd bg-surf-1 p-6 text-center">
      <Search size={34} className="text-tx-mut" />
      <p className="text-[16px] font-semibold text-tx-sec">
        {query.trim() ? "Sin resultados para la busqueda" : "Sin productos en esta categoria"}
      </p>
    </div>
  );
}

