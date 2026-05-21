"use client";
import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ProductCard from "@/components/pos/ProductCard";
import type { Product } from "@/store/ticketStore";
import type { CatalogDensity } from "@/store/catalogPrefsStore";

interface Props {
  products: Product[];
  density: CatalogDensity;
  onProductClick: (p: Product) => void;
  onProductLongPress?: (p: Product) => void;
  emptyLabel?: string;
}

const COLS_BY_DENSITY: Record<
  CatalogDensity,
  { base: number; sm: number; md: number; lg: number; xl: number }
> = {
  3: { base: 2, sm: 3, md: 3, lg: 3, xl: 3 },
  4: { base: 2, sm: 3, md: 4, lg: 4, xl: 4 },
  6: { base: 3, sm: 4, md: 5, lg: 6, xl: 6 },
};

const BP = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

function colsForWidth(density: CatalogDensity, width: number): number {
  const c = COLS_BY_DENSITY[density];
  if (width >= BP.xl) return c.xl;
  if (width >= BP.lg) return c.lg;
  if (width >= BP.md) return c.md;
  if (width >= BP.sm) return c.sm;
  return c.base;
}

const ROW_GAP = 12;
const ROW_HEIGHT = 140;
const OVERSCAN = 4;

function ProductGridBase({
  products,
  density,
  onProductClick,
  onProductLongPress,
  emptyLabel = "Sin productos disponibles",
}: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState<number>(() => COLS_BY_DENSITY[density].md);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setCols(colsForWidth(density, w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [density]);

  const rows = useMemo(() => {
    const out: Product[][] = [];
    for (let i = 0; i < products.length; i += cols) {
      out.push(products.slice(i, i + cols));
    }
    return out;
  }, [products, cols]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT + ROW_GAP,
    overscan: OVERSCAN,
    getItemKey: (idx) => rows[idx]?.[0]?.id ?? `row-${idx}`,
  });

  const clickHandlers = useRef(new Map<string, () => void>());
  const longHandlers = useRef(new Map<string, () => void>());

  useEffect(() => {
    clickHandlers.current.clear();
  }, [onProductClick]);
  useEffect(() => {
    longHandlers.current.clear();
  }, [onProductLongPress]);

  const getClick = useCallback(
    (p: Product) => {
      const cached = clickHandlers.current.get(p.id);
      if (cached) return cached;
      const h = () => onProductClick(p);
      clickHandlers.current.set(p.id, h);
      return h;
    },
    [onProductClick],
  );

  const getLong = useCallback(
    (p: Product) => {
      if (!onProductLongPress) return undefined;
      const cached = longHandlers.current.get(p.id);
      if (cached) return cached;
      const h = () => onProductLongPress(p);
      longHandlers.current.set(p.id, h);
      return h;
    },
    [onProductLongPress],
  );

  if (products.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <p className="text-stone-500 font-bold uppercase tracking-[0.15em] text-[11px]">
          {emptyLabel}
        </p>
      </div>
    );
  }

  const virtualRows = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  return (
    <div
      ref={parentRef}
      className="h-full overflow-y-auto p-3 sm:p-4 pb-24 lg:pb-4 scrollbar-hide"
      style={{
        contain: "strict",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      }}
    >
      <div style={{ height: totalHeight, width: "100%", position: "relative" }}>
        {virtualRows.map((vr) => {
          const row = rows[vr.index];
          if (!row) return null;
          return (
            <div
              key={vr.key}
              data-index={vr.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vr.start}px)`,
                paddingBottom: ROW_GAP,
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: ROW_GAP,
              }}
            >
              {row.map((product) => (
                <ProductCard
                  key={product.id}
                  id={product.id}
                  name={product.name}
                  price={product.price}
                  imageUrl={product.imageUrl}
                  promoPrice={product.promoPrice}
                  isAvailable={product.isAvailable}
                  isFavorite={product.isFavorite}
                  isPopular={product.isPopular}
                  onClick={getClick(product)}
                  onLongPress={getLong(product)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ProductGrid = memo(ProductGridBase);
ProductGrid.displayName = "ProductGrid";
export default ProductGrid;
