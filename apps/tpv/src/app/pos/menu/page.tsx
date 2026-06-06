"use client";
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Search, X, Plus, Minus, Check } from "lucide-react";
import ItemOptionsSheet from "@/components/pos/ItemOptionsSheet";
import api from "@/lib/api";
import { useCatalogPrefs, type CatalogDensity } from "@/store/catalogPrefsStore";
import { hapticLight } from "@/lib/haptics";
import {
  useTicketStore,
  type CartItem,
  type MenuItemVariant,
  type Modifier,
  type ModifierGroup,
  type ModifierSelection,
  type Product,
} from "@/store/ticketStore";
import { useUIStore } from "@/store/useUIStore";
import {
  COMPLEMENT_MODIFIER_PREFIX,
  VARIANT_MODIFIER_PREFIX,
} from "@/components/pos/ModifierPickerModal";

type CategoryLite = {
  id: string;
  name: string;
};

const PRIORITY_CATEGORIES = ["Hamburguesas", "Alitas", "Antojitos", "Bebidas"];
const FALLBACK_CATEGORIES: CategoryLite[] = PRIORITY_CATEGORIES.map((name) => ({
  id: `fallback-${name.toLowerCase()}`,
  name,
}));

const COMPLEMENTS_GROUP_ID = "__complements";
const VARIANTS_GROUP_ID = "__variants";

export default function CatalogPage() {
  const { addItemToActive } = useTicketStore();
  const searchQuery = useUIStore((s) => s.searchQuery);
  const density = useCatalogPrefs((s) => s.density);
  const viewMode = useCatalogPrefs((s) => s.viewMode);

  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCat, setActiveCat] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [configProduct, setConfigProduct] = useState<Product | null>(null);
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const [catsRes, itemsRes] = await Promise.allSettled([
          api.get("/api/menu/categories?admin=true"),
          api.get("/api/menu/items?admin=true"),
        ]);

        if (!cancelled && catsRes.status === "fulfilled") {
          setCategories(Array.isArray(catsRes.value.data) ? catsRes.value.data : []);
        }
        if (!cancelled && itemsRes.status === "fulfilled") {
          setProducts(Array.isArray(itemsRes.value.data) ? itemsRes.value.data : []);
        }
      } catch (error) {
        console.error("Error loading POS catalog:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleCategories = useMemo(() => {
    const base = categories.length > 0 ? categories : FALLBACK_CATEGORIES;
    return [...base].sort((a, b) => {
      const ai = PRIORITY_CATEGORIES.findIndex((name) => sameCategory(a.name, name));
      const bi = PRIORITY_CATEGORIES.findIndex((name) => sameCategory(b.name, name));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [categories]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const product of products) {
      const cid = product.categoryId || getCategoryIdOrName(product.category) || "";
      if (!cid) continue;
      counts[cid] = (counts[cid] || 0) + 1;
    }
    return counts;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim();
    if (query) return fuzzyFilter(products, query);
    if (activeCat === "all") return products;

    const selected = visibleCategories.find((cat) => cat.id === activeCat);
    return products.filter((product) => {
      if (product.categoryId && product.categoryId === activeCat) return true;
      if (!selected) return false;
      return sameCategory(product.category || "", selected.name);
    });
  }, [activeCat, products, searchQuery, visibleCategories]);

  const hasQuickOptions = (product: Product) =>
    (product.hasVariants && (product.variants?.some((v) => v.isAvailable !== false) ?? false)) ||
    (product.modifierGroups?.some((group) => group.modifiers?.length > 0) ?? false) ||
    (product.complements?.some((complement) => complement.isAvailable !== false) ?? false);

  const addPlainProduct = (product: Product) => {
    const unit = Number(product.promoPrice || product.price || 0);
    const cartItem: CartItem = {
      ...product,
      menuItemId: product.id,
      quantity: 1,
      subtotal: unit,
      price: unit,
      originalPrice: product.price,
    };
    addItemToActive(cartItem);
  };

  const handleProductClick = (product: Product) => {
    if (product.isAvailable === false) return;
    hapticLight();
    if (hasQuickOptions(product)) {
      setConfigProduct(product);
      return;
    }
    addPlainProduct(product);
  };

  const handleConfiguratorConfirm = (payload: {
    variant: MenuItemVariant | null;
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
  };

  const handleAvailabilityToggle = async (next: boolean) => {
    if (!optionsProduct) return;
    const id = optionsProduct.id;
    setProducts((prev) =>
      prev.map((product) => (product.id === id ? ({ ...product, isAvailable: next } as Product) : product)),
    );
    try {
      await api.put(`/api/menu/items/${id}`, { isAvailable: next });
    } catch {
      setProducts((prev) =>
        prev.map((product) => (product.id === id ? ({ ...product, isAvailable: !next } as Product) : product)),
      );
    }
  };

  const handleFavoriteToggle = async (next: boolean) => {
    if (!optionsProduct) return;
    const id = optionsProduct.id;
    setProducts((prev) =>
      prev.map((product) => (product.id === id ? { ...product, isFavorite: next } : product)),
    );
    try {
      await api.patch(`/api/menu/items/${id}/favorite`, { isFavorite: next });
    } catch {
      setProducts((prev) =>
        prev.map((product) => (product.id === id ? { ...product, isFavorite: !next } : product)),
      );
    }
  };

  const isSearching = searchQuery.trim().length > 0;
  // Modo drill-down: sin búsqueda activa y sin categoría elegida mostramos
  // primero una cuadrícula de categorías; al elegir una, se entra a sus items.
  // El modo flat mantiene el chip-rail con todos los productos visibles.
  const showCategoryOverview =
    viewMode === "drilldown" && !isSearching && activeCat === "all";
  const selectedCategory = visibleCategories.find((cat) => cat.id === activeCat);

  const goToCategories = () => {
    setConfigProduct(null);
    setActiveCat("all");
    useUIStore.getState().setSearchQuery("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#ebe5dc] text-slate-950">
      {viewMode === "drilldown" ? (
        !showCategoryOverview && (
          <DrilldownHeader
            title={
              isSearching
                ? "Resultados"
                : selectedCategory?.name || "Todos los productos"
            }
            onBack={goToCategories}
          />
        )
      ) : (
        <CategoryBar
          categories={visibleCategories}
          counts={categoryCounts}
          activeId={isSearching ? "search" : activeCat}
          onSelect={(id) => {
            setConfigProduct(null);
            setActiveCat(id);
            useUIStore.getState().setSearchQuery("");
          }}
        />
      )}

      <main className="min-h-0 flex-1 overflow-hidden p-3">
        {configProduct ? (
          <QuickModifierPanel
            key={configProduct.id}
            product={configProduct}
            onBack={() => setConfigProduct(null)}
            onConfirm={(payload) => {
              handleConfiguratorConfirm(payload);
              setConfigProduct(null);
            }}
          />
        ) : isLoading ? (
          <ProductSkeleton />
        ) : showCategoryOverview ? (
          <CategoryGrid
            categories={visibleCategories}
            counts={categoryCounts}
            density={density}
            onSelect={(id) => {
              setConfigProduct(null);
              setActiveCat(id);
            }}
          />
        ) : filteredProducts.length === 0 ? (
          <EmptyState query={searchQuery} />
        ) : (
          <ProductGrid
            products={filteredProducts}
            onPick={handleProductClick}
            onLongPress={setOptionsProduct}
            density={density}
          />
        )}
      </main>

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

function CategoryBar({
  categories,
  counts,
  activeId,
  onSelect,
}: {
  categories: CategoryLite[];
  counts: Record<string, number>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="shrink-0 border-b border-[#d8cbbb] bg-[#f7f0e6] px-3 py-2">
      <div className="flex h-[58px] gap-2 overflow-x-auto scrollbar-hide">
        <CategoryButton
          label="Todos"
          count={Object.values(counts).reduce((sum, count) => sum + count, 0)}
          active={activeId === "all"}
          tone="neutral"
          onClick={() => onSelect("all")}
        />
        {categories.map((category) => (
          <CategoryButton
            key={category.id}
            label={category.name}
            count={counts[category.id] ?? counts[category.name] ?? 0}
            active={activeId === category.id}
            tone={categoryTone(category.name)}
            onClick={() => onSelect(category.id)}
          />
        ))}
      </div>
    </nav>
  );
}

function DrilldownHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <nav className="shrink-0 border-b border-[#d8cbbb] bg-[#f7f0e6] px-3 py-2">
      <div className="flex h-[58px] items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 items-center gap-1.5 rounded-lg border-2 border-[#6b5641] bg-[#1e1b18] px-3 text-[#f8e8d0] active:bg-[#28221c] focus:outline-none focus:ring-2 focus:ring-[#ff8400]"
        >
          <ChevronLeft size={20} strokeWidth={3} />
          <span className="text-[13px] font-black uppercase">Categorías</span>
        </button>
        <span className="min-w-0 flex-1 truncate text-[18px] font-black text-slate-950">
          {title}
        </span>
      </div>
    </nav>
  );
}

function CategoryGrid({
  categories,
  counts,
  density,
  onSelect,
}: {
  categories: CategoryLite[];
  counts: Record<string, number>;
  density: CatalogDensity;
  onSelect: (id: string) => void;
}) {
  const gridClass =
    density === 3
      ? "grid-cols-2 sm:grid-cols-3"
      : density === 6
        ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6"
        : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5";
  const rowHeight = density === 6 ? 108 : density === 3 ? 144 : 124;

  return (
    <div className="h-full overflow-y-auto overscroll-contain scrollbar-hide">
      <div
        className={`grid gap-2.5 pb-4 ${gridClass}`}
        style={{ gridAutoRows: `${rowHeight}px` }}
      >
        {categories.map((category) => {
          const tone = categoryTone(category.name);
          const palette = {
            food: "bg-[#fff4e7] text-slate-950 border-orange-300 active:bg-[#ffe8cf]",
            wings: "bg-[#fff0ee] text-slate-950 border-red-300 active:bg-[#ffe2df]",
            snack: "bg-[#fff7e6] text-slate-950 border-amber-300 active:bg-[#ffedc6]",
            drink: "bg-[#eef6ff] text-slate-950 border-blue-300 active:bg-[#dcecff]",
            neutral: "bg-white text-slate-950 border-slate-300 active:bg-slate-100",
          }[tone];
          const accent = {
            food: "bg-orange-500",
            wings: "bg-red-500",
            snack: "bg-amber-400",
            drink: "bg-blue-500",
            neutral: "bg-slate-500",
          }[tone];
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelect(category.id)}
              className={`relative flex h-full flex-col justify-between overflow-hidden rounded-lg border-2 p-3 text-left shadow-sm ${palette} focus:outline-none focus:ring-2 focus:ring-slate-950`}
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${accent}`} />
              <span className="line-clamp-2 pt-1 text-[17px] font-black leading-tight">
                {category.name}
              </span>
              <span className="text-[12px] font-black uppercase opacity-60">
                {counts[category.id] ?? counts[category.name] ?? 0} items
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategoryButton({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone: "food" | "wings" | "snack" | "drink" | "neutral";
  onClick: () => void;
}) {
  const palette = {
    food: active ? "bg-orange-600 text-white border-orange-700" : "bg-[#251914] text-orange-100 border-orange-500/35 active:bg-[#321f16]",
    wings: active ? "bg-red-600 text-white border-red-700" : "bg-[#251719] text-red-100 border-red-500/35 active:bg-[#321b1e]",
    snack: active ? "bg-amber-500 text-black border-amber-600" : "bg-[#261f14] text-amber-100 border-amber-500/40 active:bg-[#342916]",
    drink: active ? "bg-blue-600 text-white border-blue-700" : "bg-[#161f2b] text-blue-100 border-blue-400/35 active:bg-[#1b2838]",
    neutral: active ? "bg-slate-950 text-white border-slate-950" : "bg-[#1e1b18] text-[#f8e8d0] border-[#6b5641] active:bg-[#28221c]",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col justify-center rounded-lg border-2 px-3 text-left shadow-[0_4px_12px_rgba(44,31,19,0.18)] ${palette} focus:outline-none focus:ring-2 focus:ring-[#ff8400]`}
      style={{ width: 116, minWidth: 116, height: 58 }}
    >
      <span className="block truncate text-[13px] font-black leading-tight">{label}</span>
      <span className="mt-0.5 block text-[11px] font-black uppercase text-current opacity-70">
        {count} items
      </span>
    </button>
  );
}

function ProductGrid({
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
  const gridClass =
    density === 3
      ? "grid-cols-2 sm:grid-cols-3"
      : density === 6
        ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6"
        : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5";
  const rowHeight = density === 6 ? 108 : density === 3 ? 144 : 124;

  return (
    <div className="h-full overflow-y-auto overscroll-contain scrollbar-hide">
      <div
        className={`grid gap-2.5 pb-4 ${gridClass}`}
        style={{ gridAutoRows: `${rowHeight}px` }}
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

function ProductTile({
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
      card: "bg-[#fff4e7] text-slate-950 border-orange-300 active:bg-[#ffe8cf]",
      accent: "bg-orange-500",
      button: "bg-orange-500 text-black",
    },
    wings: {
      card: "bg-[#fff0ee] text-slate-950 border-red-300 active:bg-[#ffe2df]",
      accent: "bg-red-500",
      button: "bg-red-500 text-white",
    },
    snack: {
      card: "bg-[#fff7e6] text-slate-950 border-amber-300 active:bg-[#ffedc6]",
      accent: "bg-amber-400",
      button: "bg-amber-400 text-black",
    },
    drink: {
      card: "bg-[#eef6ff] text-slate-950 border-blue-300 active:bg-[#dcecff]",
      accent: "bg-blue-500",
      button: "bg-blue-500 text-white",
    },
    neutral: {
      card: "bg-white text-slate-950 border-slate-300 active:bg-slate-100",
      accent: "bg-slate-500",
      button: "bg-slate-950 text-white",
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
      className={`product-card relative flex h-full flex-col overflow-hidden rounded-lg border-2 p-3 text-left shadow-sm ${palette.card} disabled:opacity-45 disabled:grayscale focus:outline-none focus:ring-2 focus:ring-slate-950`}
      style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
    >
      <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${palette.accent}`} />
      {quantity > 0 && (
        <span className="absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-950 px-2 text-[12px] font-black text-white">
          x{quantity}
        </span>
      )}
      {product.isAvailable === false && (
        <span className="mb-2 inline-flex self-start rounded-md bg-slate-950 px-2 py-1 text-[10px] font-black uppercase text-white">
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

function QuickModifierPanel({
  product,
  onBack,
  onConfirm,
}: {
  product: Product;
  onBack: () => void;
  onConfirm: (payload: {
    variant: MenuItemVariant | null;
    modifiers: ModifierSelection[];
    unitPrice: number;
    notes?: string;
  }) => void;
}) {
  const variants = useMemo(
    () => (product.variants ?? []).filter((variant) => variant.isAvailable !== false),
    [product],
  );
  const variantMultiSelect = !!product.variantMultiSelect && variants.length > 0;
  const groups = useMemo(
    () => buildOptionGroups(product, variants, variantMultiSelect),
    [product, variantMultiSelect, variants],
  );

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(variants[0]?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [selections, setSelections] = useState<Record<string, Modifier[]>>(() => {
    const initial: Record<string, Modifier[]> = {};
    for (const group of groups) {
      const defaults = group.modifiers.filter((modifier) => modifier.isDefault);
      initial[group.id] = group.multiSelect ? defaults : defaults.slice(0, 1);
    }
    return initial;
  });

  const selectedVariant = useMemo(
    () => (variantMultiSelect ? null : variants.find((variant) => variant.id === selectedVariantId) ?? null),
    [selectedVariantId, variantMultiSelect, variants],
  );
  const basePrice = Number(selectedVariant?.price ?? product.promoPrice ?? product.price ?? 0);
  const unitPrice = basePrice + computeUnitExtra(groups, selections);
  const totalPrice = unitPrice * quantity;
  const validationError = getValidationError(groups, selections, variants.length, selectedVariant, variantMultiSelect);

  const toggle = (group: ModifierGroup, modifier: Modifier) => {
    setSelections((prev) => {
      const current = prev[group.id] || [];
      const isSelected = current.some((item) => item.id === modifier.id);
      if (group.multiSelect) {
        if (isSelected) return { ...prev, [group.id]: current.filter((item) => item.id !== modifier.id) };
        if (group.maxSelection > 0 && current.length >= group.maxSelection) return prev;
        return { ...prev, [group.id]: [...current, modifier] };
      }

      if (isSelected) return group.required ? prev : { ...prev, [group.id]: [] };
      return { ...prev, [group.id]: [modifier] };
    });
  };

  const confirm = () => {
    if (validationError) return;
    const modifiers = flattenSelections(groups, selections);
    for (let i = 0; i < quantity; i += 1) {
      onConfirm({
        variant: selectedVariant,
        modifiers,
        unitPrice,
        notes: notes.trim() || undefined,
      });
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border-2 border-slate-300 bg-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-300 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-200 text-slate-950 active:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-950"
          aria-label="Volver al catalogo"
        >
          <ChevronLeft size={23} strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase text-slate-500">Modificadores rapidos</p>
          <h2 className="truncate text-[22px] font-black text-slate-950">{product.name}</h2>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white active:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-950"
          aria-label="Cerrar modificadores"
        >
          <X size={21} strokeWidth={3} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!variantMultiSelect && variants.length > 0 && (
          <OptionSection title="Variantes" helper="Elige 1">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {variants.map((variant) => {
                const active = selectedVariantId === variant.id;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setSelectedVariantId(variant.id)}
                    className={`min-h-20 rounded-lg border-2 p-3 text-left focus:outline-none focus:ring-2 focus:ring-slate-950 ${
                      active
                        ? "border-green-700 bg-green-500 text-black"
                        : "border-slate-300 bg-slate-100 text-slate-950 active:bg-slate-200"
                    }`}
                  >
                    <span className="block text-[16px] font-black">{variant.name}</span>
                    <span className="mt-1 block text-[18px] font-black tabular-nums">
                      ${Number(variant.price || 0).toFixed(0)}
                    </span>
                  </button>
                );
              })}
            </div>
          </OptionSection>
        )}

        {groups.map((group) => {
          const selectedIds = new Set((selections[group.id] || []).map((modifier) => modifier.id));
          const min = Math.max(group.required ? 1 : 0, group.minSelection || 0);
          const max = group.maxSelection || 0;
          const free = group.freeModifiersLimit || 0;
          return (
            <OptionSection
              key={group.id}
              title={group.name}
              helper={`${group.multiSelect ? `${min > 0 ? `Min ${min} / ` : ""}${max > 0 ? `Max ${max}` : "Varios"}` : "Elige 1"}${free > 0 ? ` / ${free} sin costo` : ""}`}
            >
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {group.modifiers.map((modifier) => {
                  const active = selectedIds.has(modifier.id);
                  return (
                    <button
                      key={modifier.id}
                      type="button"
                      onClick={() => toggle(group, modifier)}
                      className={`flex min-h-16 items-center gap-3 rounded-lg border-2 px-3 text-left focus:outline-none focus:ring-2 focus:ring-slate-950 ${
                        active
                          ? "border-green-700 bg-green-500 text-black"
                          : "border-slate-300 bg-slate-100 text-slate-950 active:bg-slate-200"
                      }`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center ${group.multiSelect ? "rounded-md" : "rounded-full"} ${active ? "bg-black text-white" : "border-2 border-slate-400 bg-white"}`}>
                        {active && <Check size={15} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 text-[15px] font-black">{modifier.name}</span>
                      <span className="text-[14px] font-black tabular-nums">
                        {modifier.priceAdd > 0 ? `+$${modifier.priceAdd.toFixed(0)}` : "$0"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </OptionSection>
          );
        })}

        <OptionSection title="Cantidad" helper="Antes de agregar">
          <div className="inline-flex items-center gap-2 rounded-lg border-2 border-slate-300 bg-slate-100 p-2">
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              className="flex h-12 w-12 items-center justify-center rounded-md bg-white text-slate-950 active:bg-slate-200"
            >
              <Minus size={20} strokeWidth={3} />
            </button>
            <span className="w-16 text-center text-[24px] font-black tabular-nums">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.min(99, value + 1))}
              className="flex h-12 w-12 items-center justify-center rounded-md bg-white text-slate-950 active:bg-slate-200"
            >
              <Plus size={20} strokeWidth={3} />
            </button>
          </div>
        </OptionSection>

        <OptionSection title="Nota para cocina" helper="Opcional">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, 200))}
            placeholder="Sin cebolla, termino medio, alergia..."
            rows={2}
            maxLength={200}
            className="w-full resize-none rounded-lg border-2 border-slate-300 bg-white px-3 py-3 text-[15px] font-bold text-slate-950 outline-none placeholder:text-slate-400 focus:border-slate-950"
          />
        </OptionSection>
      </div>

      <footer className="shrink-0 border-t border-slate-300 bg-slate-100 p-4">
        {validationError && <p className="mb-2 text-[13px] font-black text-red-700">{validationError}</p>}
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase text-slate-500">Total configurado</p>
            <p className="text-[15px] font-bold text-slate-700">${unitPrice.toFixed(2)} por unidad</p>
          </div>
          <span className="text-[28px] font-black tabular-nums text-slate-950">${totalPrice.toFixed(2)}</span>
          <button
            type="button"
            onClick={confirm}
            disabled={!!validationError}
            className="h-16 min-w-[210px] rounded-lg bg-green-500 px-5 text-[15px] font-black uppercase text-black active:bg-green-600 disabled:opacity-40 disabled:grayscale focus:outline-none focus:ring-2 focus:ring-slate-950"
          >
            Agregar
          </button>
        </div>
      </footer>
    </section>
  );
}

function OptionSection({
  title,
  helper,
  children,
}: {
  title: string;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-black text-slate-950">{title}</h3>
        <span className="text-[11px] font-black uppercase text-slate-500">{helper}</span>
      </div>
      {children}
    </section>
  );
}

function ProductSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="h-[132px] rounded-lg border-2 border-slate-300 bg-slate-200" />
      ))}
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center">
      <Search size={34} className="text-slate-400" />
      <p className="text-[16px] font-black text-slate-700">
        {query.trim() ? "Sin resultados para la busqueda" : "Sin productos en esta categoria"}
      </p>
    </div>
  );
}

function buildOptionGroups(
  product: Product,
  variants: MenuItemVariant[],
  variantMultiSelect: boolean,
): ModifierGroup[] {
  const variantGroups: ModifierGroup[] = variantMultiSelect
    ? [
        {
          id: VARIANTS_GROUP_ID,
          name: "Variantes",
          required: (product.variantMinSelection ?? 0) > 0,
          multiSelect: true,
          minSelection: product.variantMinSelection ?? 0,
          maxSelection: product.variantMaxSelection ?? 0,
          freeModifiersLimit: 0,
          modifiers: variants.map((variant) => ({
            id: `${VARIANT_MODIFIER_PREFIX}${variant.id}`,
            groupId: VARIANTS_GROUP_ID,
            name: variant.name,
            priceAdd: Number(variant.price || 0),
          })),
        },
      ]
    : [];

  const complements = (product.complements || []).filter((complement) => complement.isAvailable !== false);
  const complementGroups: ModifierGroup[] =
    complements.length === 0
      ? []
      : [
          {
            id: COMPLEMENTS_GROUP_ID,
            name: "Complementos",
            required: false,
            multiSelect: true,
            minSelection: 0,
            maxSelection: 0,
            freeModifiersLimit: 0,
            modifiers: complements.map((complement) => ({
              id: `${COMPLEMENT_MODIFIER_PREFIX}${complement.id}`,
              groupId: COMPLEMENTS_GROUP_ID,
              name: complement.name,
              priceAdd: Number(complement.price || 0),
            })),
          },
        ];

  return [...variantGroups, ...(product.modifierGroups || []), ...complementGroups];
}

function computeUnitExtra(groups: ModifierGroup[], selectionsByGroup: Record<string, Modifier[]>): number {
  let extra = 0;
  for (const group of groups) {
    const selected = selectionsByGroup[group.id] || [];
    const free = group.freeModifiersLimit || 0;
    [...selected]
      .sort((a, b) => a.priceAdd - b.priceAdd)
      .forEach((modifier, index) => {
        if (index >= free) extra += Number(modifier.priceAdd || 0);
      });
  }
  return extra;
}

function getValidationError(
  groups: ModifierGroup[],
  selections: Record<string, Modifier[]>,
  variantCount: number,
  selectedVariant: MenuItemVariant | null,
  variantMultiSelect: boolean,
): string | null {
  if (!variantMultiSelect && variantCount > 0 && !selectedVariant) return "Selecciona una variante";
  for (const group of groups) {
    const count = (selections[group.id] || []).length;
    const min = Math.max(group.required ? 1 : 0, group.minSelection || 0);
    if (count < min) return `Selecciona ${min} en ${group.name}`;
    if (group.maxSelection > 0 && count > group.maxSelection) return `Maximo ${group.maxSelection} en ${group.name}`;
  }
  return null;
}

function flattenSelections(
  groups: ModifierGroup[],
  selections: Record<string, Modifier[]>,
): ModifierSelection[] {
  const modifiers: ModifierSelection[] = [];
  for (const group of groups) {
    for (const modifier of selections[group.id] || []) {
      modifiers.push({
        id: modifier.id,
        groupId: group.id,
        name: modifier.name,
        priceAdd: modifier.priceAdd,
      });
    }
  }
  return modifiers;
}

function fuzzyFilter(products: Product[], query: string): Product[] {
  const normalizedQuery = normalize(query);
  return products
    .map((product) => ({
      product,
      score: fuzzyScore(normalize(product.name), normalizedQuery),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .map((item) => item.product);
}

function fuzzyScore(value: string, query: string): number {
  if (!query) return 1;
  if (value.includes(query)) return 100 - value.indexOf(query);

  let score = 0;
  let queryIndex = 0;
  for (let i = 0; i < value.length && queryIndex < query.length; i += 1) {
    if (value[i] === query[queryIndex]) {
      score += 3;
      queryIndex += 1;
    }
  }
  return queryIndex === query.length ? score : 0;
}

function getCategoryIdOrName(category: unknown): string {
  if (typeof category === "string") return category;
  if (category && typeof category === "object") {
    if ("id" in category && typeof (category as any).id === "string") return (category as any).id;
    if ("name" in category && typeof (category as any).name === "string") return (category as any).name;
  }
  return "";
}

function sameCategory(a: unknown, b: unknown): boolean {
  const left = normalize(a);
  const right = normalize(b);
  return left === right || left.includes(right) || right.includes(left);
}

function normalize(value: unknown): string {
  if (typeof value === "string") {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }
  if (value && typeof value === "object" && "name" in value) {
    return normalize((value as { name?: unknown }).name);
  }
  return "";
}

function categoryTone(name: unknown): "food" | "wings" | "snack" | "drink" | "neutral" {
  const normalized = normalize(name);
  if (normalized.includes("bebida") || normalized.includes("agua") || normalized.includes("refresco")) return "drink";
  if (normalized.includes("alita") || normalized.includes("boneless")) return "wings";
  if (normalized.includes("antojit") || normalized.includes("taco") || normalized.includes("nacho")) return "snack";
  if (normalized.includes("hamburg") || normalized.includes("burger") || normalized.includes("comida")) return "food";
  return "neutral";
}
