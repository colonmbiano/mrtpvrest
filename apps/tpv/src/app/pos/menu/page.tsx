"use client";
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Search, Settings2, Star, X as XIcon } from "lucide-react";
import CategoryChipRail, { FAVORITES_CHIP_ID } from "@/components/pos/CategoryChipRail";
import CategoryGrid from "@/components/pos/CategoryGrid";
import ItemOptionsSheet from "@/components/pos/ItemOptionsSheet";
import OrderTypeToggle from "@/components/pos/OrderTypeToggle";
import ProductCard from "@/components/pos/ProductCard";
import SeatTabs from "@/components/pos/SeatTabs";
import CatalogSettingsSheet from "@/components/modals/CatalogSettingsSheet";
import ProductConfiguratorModal from "@/components/modals/ProductConfiguratorModal";
import api from "@/lib/api";
import { hapticLight } from "@/lib/haptics";
import {
  useTicketStore,
  type CartItem,
  type ModifierSelection,
  type Product,
} from "@/store/ticketStore";
import {
  densityGridClasses,
  useCatalogPrefs,
} from "@/store/catalogPrefsStore";

type View = "categories" | "products" | "favorites" | "search";

interface CategoryLite {
  id: string;
  name: string;
}

export default function CatalogPage() {
  const { getActiveTicket, updateTicket, addItemToActive } = useTicketStore();
  const ticket = getActiveTicket();

  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [view, setView] = useState<View>("categories");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [configProduct, setConfigProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [flatChip, setFlatChip] = useState<string | null>(null);

  const viewMode = useCatalogPrefs((s) => s.viewMode);
  const density = useCatalogPrefs((s) => s.density);
  const gridClass = densityGridClasses[density];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catsRes, itemsRes] = await Promise.all([
          api.get("/api/menu/categories"),
          api.get("/api/menu/items"),
        ]);
        setCategories(Array.isArray(catsRes.data) ? catsRes.data : []);
        setProducts(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    return () => {
      setView("categories");
      setActiveCat(null);
    };
  }, []);

  const [prevTicketId, setPrevTicketId] = useState(ticket.id);
  if (prevTicketId !== ticket.id) {
    setPrevTicketId(ticket.id);
    setView("categories");
    setActiveCat(null);
  }

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) {
      const cid = (p as { categoryId?: string }).categoryId;
      if (!cid) continue;
      map[cid] = (map[cid] ?? 0) + 1;
    }
    return map;
  }, [products]);

  const favoritesItems = useMemo(
    () => products.filter((p) => p.isFavorite),
    [products],
  );

  const filteredProducts = useMemo(() => {
    if (view === "search") {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return [];
      return products.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (view === "favorites") return favoritesItems;
    if (view === "products" && activeCat) {
      return products.filter((p) => (p as { categoryId?: string }).categoryId === activeCat);
    }
    return [];
  }, [view, activeCat, products, favoritesItems, searchQuery]);

  const flatProducts = useMemo(() => {
    if (flatChip === null) return products;
    if (flatChip === FAVORITES_CHIP_ID) {
      return products.filter((p) => p.isFavorite || (p as { isPopular?: boolean }).isPopular);
    }
    return products.filter(
      (p) => (p as { categoryId?: string }).categoryId === flatChip,
    );
  }, [flatChip, products]);

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCat) ?? null,
    [categories, activeCat],
  );

  const hasUsableOptions = (p: Product) =>
    (Array.isArray(p.modifierGroups) &&
      p.modifierGroups.some((g) => Array.isArray(g.modifiers) && g.modifiers.length > 0)) ||
    (Array.isArray(p.complements) &&
      p.complements.some((c) => c.isAvailable !== false));

  const handleProductClick = (p: Product) => {
    hapticLight();
    if ((p.hasVariants && p.variants && p.variants.length > 0) || hasUsableOptions(p)) {
      setConfigProduct(p);
      return;
    }
    addPlainProduct(p);
  };

  const handleProductLongPress = (p: Product) => {
    setOptionsProduct(p);
  };

  const handleAvailabilityToggle = async (next: boolean) => {
    if (!optionsProduct) return;
    const id = optionsProduct.id;
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? ({ ...p, isAvailable: next } as Product) : p)),
    );
    try {
      await api.put(`/api/menu/items/${id}`, { isAvailable: next });
    } catch {
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? ({ ...p, isAvailable: !next } as Product) : p)),
      );
    }
  };

  const handleFavoriteToggle = async (next: boolean) => {
    if (!optionsProduct) return;
    const id = optionsProduct.id;
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isFavorite: next } : p)),
    );
    try {
      await api.patch(`/api/menu/items/${id}/favorite`, { isFavorite: next });
    } catch {
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, isFavorite: !next } : p)),
      );
    }
  };

  const addPlainProduct = (p: Product) => {
    const unit = p.promoPrice || p.price;
    const cartItem: CartItem = {
      ...p,
      menuItemId: p.id,
      quantity: 1,
      subtotal: unit,
      price: unit,
      originalPrice: p.price,
    };
    addItemToActive(cartItem);
  };

  const handleConfiguratorConfirm = (payload: {
    variant: { id: string; name: string } | null;
    modifiers: ModifierSelection[];
    unitPrice: number;
    notes?: string;
  }) => {
    if (!configProduct) return;
    const cartItem: CartItem = {
      ...configProduct,
      menuItemId: configProduct.id,
      quantity: 1,
      subtotal: payload.unitPrice,
      price: payload.unitPrice,
      originalPrice: configProduct.price,
      ...(payload.variant && {
        variantId: payload.variant.id,
        variantName: payload.variant.name,
        name: `${configProduct.name} (${payload.variant.name})`,
      }),
      modifiers: payload.modifiers,
      notes: payload.notes,
    };
    addItemToActive(cartItem);
    setConfigProduct(null);
  };

  const goBackToCategories = () => {
    setView("categories");
    setActiveCat(null);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-surf-0 transition-colors duration-300">
      <div className="px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4 pb-1">
        <OrderTypeToggle
          active={ticket.type}
          onChange={(type) => updateTicket({ type })}
        />
      </div>

      <SeatTabs />

      <div className="px-3 sm:px-4 lg:px-6 pb-2 pt-1 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-mut pointer-events-none"
            />
            <input
              value={searchQuery}
              onChange={(e) => {
                const v = e.target.value;
                setSearchQuery(v);
                if (v.trim()) setView("search");
                else setView("categories");
              }}
              placeholder="Buscar producto..."
              className="w-full h-11 min-h-[44px] bg-surf-2 border border-bd-main rounded-2xl pl-10 pr-10 text-[12px] font-bold text-tx-pri placeholder:text-tx-mut focus:outline-none focus:border-iris-500/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setView("categories");
                }}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 min-h-[32px] rounded-xl bg-surf-3 active:bg-surf-1 text-tx-sec flex items-center justify-center"
              >
                <XIcon size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Ajustes de vista del catálogo"
            className="w-11 h-11 min-h-[44px] min-w-[44px] shrink-0 rounded-2xl bg-surf-2 border border-bd-main active:bg-surf-3 active:scale-95 transition-pos text-tx-sec flex items-center justify-center"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </div>

      {viewMode === "flat" && view !== "search" && (
        <CategoryChipRail
          categories={categories}
          activeId={flatChip}
          onSelect={setFlatChip}
          showFavorites={favoritesItems.length > 0}
        />
      )}

      {viewMode === "drilldown" && view !== "categories" && view !== "search" && (
        <div className="flex items-center gap-3 px-3 sm:px-4 lg:px-6 h-12 border-b border-white/5 shrink-0">
          <button
            type="button"
            onClick={goBackToCategories}
            aria-label="Volver a categorías"
            className="inline-flex items-center gap-2 h-10 px-3 rounded-2xl bg-stone-900 active:bg-stone-700 active:scale-95 transition-all border border-white/5 text-stone-200 font-black uppercase tracking-[0.15em] text-[11px]"
          >
            <ChevronLeft size={16} /> Volver
          </button>
          <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-stone-200 truncate flex items-center gap-1.5">
            {view === "favorites" ? (
              <>
                <Star size={12} strokeWidth={2.5} fill="currentColor" className="text-amber-400" />
                Favoritos
              </>
            ) : (
              activeCategory?.name ?? ""
            )}
          </h2>
        </div>
      )}

      <div className="flex-1 min-h-0 scroll-y p-3 sm:p-4 lg:p-6 pb-24 lg:pb-6 scrollbar-hide">
        {isLoading ? (
          <div className={`grid ${gridClass} gap-2 sm:gap-3`}>
            {[...Array(10)].map((_, i) => (
              <div key={i} className="aspect-square bg-surf-1 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : viewMode === "flat" && view !== "search" ? (
          flatProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <p className="text-stone-500 font-bold uppercase tracking-[0.15em] text-[11px]">
                {flatChip === FAVORITES_CHIP_ID
                  ? "Sin favoritos marcados aún"
                  : flatChip === null
                    ? "Sin productos disponibles"
                    : "Sin productos en esta categoría"}
              </p>
            </div>
          ) : (
            <div className={`grid ${gridClass} gap-2 sm:gap-3 animate-in fade-in duration-200`}>
              {flatProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  {...product}
                  onClick={() => handleProductClick(product)}
                  onLongPress={() => handleProductLongPress(product)}
                />
              ))}
            </div>
          )
        ) : view === "categories" ? (
          categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <p className="text-stone-500 font-bold uppercase tracking-[0.15em] text-[11px]">
                Sin categorías configuradas
              </p>
              <p className="text-stone-600 text-[10px] font-medium max-w-xs text-center">
                Crea tus primeras categorías y productos desde el panel admin.
              </p>
            </div>
          ) : (
            <CategoryGrid
              categories={categories}
              counts={categoryCounts}
              onSelect={(id) => {
                setActiveCat(id);
                setView("products");
              }}
              favoritesCount={favoritesItems.length}
              onPickFavorites={() => setView("favorites")}
            />
          )
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-stone-500 font-bold uppercase tracking-[0.15em] text-[11px]">
              {view === "search"
                ? "Sin resultados para tu búsqueda"
                : view === "favorites"
                  ? "Sin favoritos marcados aún"
                  : "Sin productos en esta categoría"}
            </p>
            {view !== "search" && (
              <button
                type="button"
                onClick={goBackToCategories}
                className="text-amber-500 font-black uppercase tracking-[0.15em] text-[11px] active:scale-95 transition-transform"
              >
                ← Volver a categorías
              </button>
            )}
          </div>
        ) : (
          <div className={`grid ${gridClass} gap-2 sm:gap-3 animate-in fade-in slide-in-from-right-2 duration-200`}>
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                {...product}
                onClick={() => handleProductClick(product)}
                onLongPress={() => handleProductLongPress(product)}
              />
            ))}
          </div>
        )}
      </div>

      {configProduct && (
        <ProductConfiguratorModal
          product={configProduct}
          onClose={() => setConfigProduct(null)}
          onConfirm={handleConfiguratorConfirm}
        />
      )}

      {showSettings && (
        <CatalogSettingsSheet onClose={() => setShowSettings(false)} />
      )}

      {optionsProduct && (
        <ItemOptionsSheet
          product={optionsProduct}
          onClose={() => setOptionsProduct(null)}
          onToggleAvailable={handleAvailabilityToggle}
          onToggleFavorite={handleFavoriteToggle}
        />
      )}
    </div>
  );
}
