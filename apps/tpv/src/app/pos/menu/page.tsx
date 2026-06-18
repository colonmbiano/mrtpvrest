"use client";
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Search, X, Plus, Minus, Check, Delete } from "lucide-react";
import ItemOptionsSheet from "@/components/pos/ItemOptionsSheet";
import api from "@/lib/api";
import { formatModifierGroupName } from "@/lib/formatDisplayName";
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
  buildOptionGroups,
  computeUnitExtra,
  flattenSelections,
  getValidationError,
  hasQuickOptions,
} from "@/lib/modifiers";

type CategoryLite = {
  id: string;
  name: string;
};

const PRIORITY_CATEGORIES = ["Hamburguesas", "Alitas", "Antojitos", "Bebidas"];
const FALLBACK_CATEGORIES: CategoryLite[] = PRIORITY_CATEGORIES.map((name) => ({
  id: `fallback-${name.toLowerCase()}`,
  name,
}));

// ── Caché local del catálogo (stale-while-revalidate) ─────────────────────
// El menú casi nunca cambia, pero antes se bajaba de la nube CADA vez que el
// cajero entraba a tomar un pedido (2 round-trips a Railway con spinner). Ahora
// pintamos al instante lo último cacheado y revalidamos en segundo plano.
const CATALOG_CACHE_KEY = "tpv-catalog-cache-v1";

type CatalogCache = { categories: CategoryLite[]; products: Product[] };

function readCatalogCache(): CatalogCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.categories) || !Array.isArray(parsed?.products)) return null;
    return parsed as CatalogCache;
  } catch {
    return null;
  }
}

function writeCatalogCache(data: CatalogCache): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* cuota llena / modo privado: la caché es best-effort */
  }
}

export default function CatalogPage() {
  const { addItemToActive, replaceItemInActive, setEditingIndex } = useTicketStore();
  // Item de la ronda actual que se está re-editando (tap en el carrito).
  const editingIndex = useTicketStore((s) => s.editingIndex);
  const editingItem = useTicketStore((s) =>
    s.editingIndex == null ? null : s.getActiveTicket().items[s.editingIndex] ?? null,
  );
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

    // 1. Pinta al instante lo último cacheado: el menú se ve de inmediato al
    //    entrar y el cajero no espera a la nube (stale-while-revalidate).
    const cached = readCatalogCache();
    if (cached) {
      // Diferido a microtask: evita el set-state síncrono dentro del effect.
      queueMicrotask(() => {
        if (cancelled) return;
        setCategories(cached.categories);
        setProducts(cached.products);
        setIsLoading(false);
      });
    }

    // 2. Revalida en segundo plano y actualiza la caché.
    const fetchData = async () => {
      try {
        const [catsRes, itemsRes] = await Promise.allSettled([
          api.get("/api/menu/categories?admin=true"),
          api.get("/api/menu/items?admin=true"),
        ]);

        let nextCats = cached?.categories ?? [];
        let nextItems = cached?.products ?? [];
        if (catsRes.status === "fulfilled" && Array.isArray(catsRes.value.data)) {
          nextCats = catsRes.value.data;
        }
        if (itemsRes.status === "fulfilled" && Array.isArray(itemsRes.value.data)) {
          nextItems = itemsRes.value.data;
        }
        if (!cancelled) {
          setCategories(nextCats);
          setProducts(nextItems);
        }
        // Solo cacheamos si al menos una respuesta llegó bien (no pisar con vacío).
        if (catsRes.status === "fulfilled" || itemsRes.status === "fulfilled") {
          writeCatalogCache({ categories: nextCats, products: nextItems });
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

  const addPlainProduct = (product: Product) => {
    const unit = Number(product.promoPrice || product.price || 0);
    const cartItem: CartItem = {
      ...product,
      menuItemId: product.id,
      quantity: 1,
      subtotal: unit,
      price: unit,
      originalPrice: product.price,
      baseName: product.name,
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

  // Producto base para el configurador: en edición es el item del carrito
  // (usando su nombre base, sin el sufijo de variante); en alta es el
  // producto elegido del catálogo.
  const panelProduct: Product | null = editingItem
    ? { ...editingItem, name: editingItem.baseName ?? editingItem.name }
    : configProduct;

  const panelInitial: ConfiguratorInitial | null = editingItem
    ? {
        variantId: editingItem.variantId ?? null,
        selectedModifierIds: (editingItem.modifiers ?? []).map((modifier) => modifier.id),
        quantity: editingItem.quantity,
        notes: editingItem.notes ?? "",
      }
    : null;

  const closeConfigurator = () => {
    setConfigProduct(null);
    if (editingIndex != null) setEditingIndex(null);
  };

  // Índice inválido (el item se borró mientras se editaba): cancelamos la
  // edición para no dejar el store en un estado colgado. Diferido a
  // microtask para no disparar set-state sincrónico dentro del effect.
  useEffect(() => {
    if (editingIndex != null && !editingItem) {
      queueMicrotask(() => setEditingIndex(null));
    }
  }, [editingIndex, editingItem, setEditingIndex]);

  const handleConfiguratorConfirm = (payload: {
    variant: MenuItemVariant | null;
    modifiers: ModifierSelection[];
    unitPrice: number;
    quantity: number;
    notes?: string;
  }) => {
    const source = panelProduct;
    if (!source) return;

    const baseName = source.name;
    const fallbackBasePrice =
      (source as Partial<CartItem>).originalPrice ?? source.price;

    const buildItem = (qty: number): CartItem => ({
      ...source,
      menuItemId: source.id,
      quantity: qty,
      subtotal: payload.unitPrice * qty,
      price: payload.unitPrice,
      originalPrice: fallbackBasePrice,
      baseName,
      variantId: payload.variant?.id ?? null,
      variantName: payload.variant?.name ?? null,
      name: payload.variant ? `${baseName} (${payload.variant.name})` : baseName,
      modifiers: payload.modifiers,
      notes: payload.notes,
    });

    if (editingIndex != null && editingItem) {
      // Editar item existente: reemplazamos en sitio con la cantidad elegida
      // y conservamos el comensal asignado (DINE_IN).
      const updated = buildItem(payload.quantity);
      updated.seatNumber = editingItem.seatNumber ?? null;
      replaceItemInActive(editingIndex, updated);
      return;
    }

    // Alta normal: una unidad por vez para que el merge por modificadores del
    // store agrupe líneas idénticas (igual que el flujo original).
    for (let i = 0; i < payload.quantity; i += 1) {
      addItemToActive(buildItem(1));
    }
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
    setEditingIndex(null);
    setActiveCat("all");
    useUIStore.getState().setSearchQuery("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surf-0 text-tx-pri">
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
            setEditingIndex(null);
            setActiveCat(id);
            useUIStore.getState().setSearchQuery("");
          }}
        />
      )}

      <main className="min-h-0 flex-1 overflow-hidden p-3">
        {panelProduct ? (
          <QuickModifierPanel
            key={`${panelProduct.id}-${editingIndex ?? "new"}`}
            product={panelProduct}
            initial={panelInitial}
            submitLabel={editingItem ? "Guardar cambios" : "Agregar"}
            onBack={closeConfigurator}
            onConfirm={(payload) => {
              handleConfiguratorConfirm(payload);
              closeConfigurator();
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
    <nav className="shrink-0 border-b border-bd bg-surf-1 px-3 py-2">
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
    <nav className="shrink-0 border-b border-bd bg-surf-1 px-3 py-2">
      <div className="flex h-[58px] items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 items-center gap-1.5 rounded-lg border-2 border-bd bg-surf-2 px-3 text-tx-pri active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
        >
          <ChevronLeft size={20} strokeWidth={3} />
          <span className="text-[13px] font-semibold uppercase">Categorías</span>
        </button>
        <span className="min-w-0 flex-1 truncate text-[18px] font-black text-tx-pri">
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
        {categories.map((category) => {
          const tone = categoryTone(category.name);
          const palette = {
            food: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
            wings: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
            snack: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
            drink: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
            neutral: "bg-surf-1 text-tx-pri border-bd active:bg-surf-2",
          }[tone];
          const accent = {
            food: "bg-orange-500",
            wings: "bg-red-500",
            snack: "bg-amber-400",
            drink: "bg-blue-500",
            neutral: "bg-emerald-500",
          }[tone];
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelect(category.id)}
              className={`relative flex h-full flex-col justify-between overflow-hidden rounded-lg border-2 p-3 text-left shadow-sm ${palette} focus:outline-none focus:ring-2 focus:ring-iris-500`}
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${accent}`} />
              <span className="line-clamp-2 pt-1 text-[17px] font-black leading-tight">
                {category.name}
              </span>
              <span className="text-[12px] font-semibold uppercase opacity-60">
                {itemsLabel(counts[category.id] ?? counts[category.name] ?? 0)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// "1 item" / "N items" — evita el "1 ITEMS" agramatical.
function itemsLabel(n: number): string {
  return `${n} ${n === 1 ? "item" : "items"}`;
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
    food: active ? "bg-iris-500 text-iris-fg border-iris-500" : "bg-surf-1 text-tx-sec border-bd active:bg-surf-2",
    wings: active ? "bg-iris-500 text-iris-fg border-iris-500" : "bg-surf-1 text-tx-sec border-bd active:bg-surf-2",
    snack: active ? "bg-iris-500 text-iris-fg border-iris-500" : "bg-surf-1 text-tx-sec border-bd active:bg-surf-2",
    drink: active ? "bg-iris-500 text-iris-fg border-iris-500" : "bg-surf-1 text-tx-sec border-bd active:bg-surf-2",
    neutral: active ? "bg-iris-500 text-iris-fg border-iris-500" : "bg-surf-1 text-tx-sec border-bd active:bg-surf-2",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col justify-center rounded-lg border-2 px-3 text-left shadow-[0_4px_12px_rgba(0,0,0,0.35)] ${palette} focus:outline-none focus:ring-2 focus:ring-iris-500`}
      style={{ width: 116, minWidth: 116, height: 58 }}
    >
      <span className="block truncate text-[13px] font-semibold leading-tight">{label}</span>
      <span className="mt-0.5 block text-[11px] font-semibold uppercase text-current opacity-70">
        {itemsLabel(count)}
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

function QuickModifierPanel({
  product,
  initial,
  submitLabel = "Agregar",
  onBack,
  onConfirm,
}: {
  product: Product;
  initial?: ConfiguratorInitial | null;
  submitLabel?: string;
  onBack: () => void;
  onConfirm: (payload: {
    variant: MenuItemVariant | null;
    modifiers: ModifierSelection[];
    unitPrice: number;
    quantity: number;
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

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    initial?.variantId ?? variants[0]?.id ?? null,
  );
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  // Teclado numérico de cantidad (estilo Loyverse): teclear el número
  // directo en vez de tocar +/− N veces. qtyEntry "" = mostrando el valor
  // del stepper; el primer dígito reemplaza. Entero 1-99.
  const [qtyEntry, setQtyEntry] = useState("");
  const [showQtyPad, setShowQtyPad] = useState(false);
  const stepQty = (next: number) => {
    setQuantity(Math.max(1, Math.min(99, next)));
    setQtyEntry("");
  };
  const pressQtyDigit = (d: string) => {
    const candidate = (qtyEntry === "" ? "" : qtyEntry) + d;
    const num = parseInt(candidate, 10);
    if (Number.isNaN(num) || num > 99) return;
    setQtyEntry(candidate);
    setQuantity(Math.max(1, num));
  };
  const pressQtyBackspace = () => {
    const candidate = qtyEntry.slice(0, -1);
    setQtyEntry(candidate);
    setQuantity(candidate === "" ? 1 : Math.max(1, parseInt(candidate, 10) || 1));
  };
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [selections, setSelections] = useState<Record<string, Modifier[]>>(() => {
    // Modo edición: pre-marcamos los modificadores que el item ya traía.
    // Modo alta: usamos los modificadores marcados como default.
    const initialIds = initial?.selectedModifierIds
      ? new Set(initial.selectedModifierIds)
      : null;
    const out: Record<string, Modifier[]> = {};
    for (const group of groups) {
      if (initialIds) {
        const matched = group.modifiers.filter((modifier) => initialIds.has(modifier.id));
        out[group.id] = group.multiSelect ? matched : matched.slice(0, 1);
      } else {
        const defaults = group.modifiers.filter((modifier) => modifier.isDefault);
        out[group.id] = group.multiSelect ? defaults : defaults.slice(0, 1);
      }
    }
    return out;
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
    onConfirm({
      variant: selectedVariant,
      modifiers,
      unitPrice,
      quantity,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border-2 border-bd bg-surf-1">
      <header className="flex shrink-0 items-center gap-3 border-b border-bd px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-surf-2 text-tx-pri active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
          aria-label="Volver al catalogo"
        >
          <ChevronLeft size={23} strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase text-tx-mut">
            {initial ? "Editar producto" : "Modificadores rapidos"}
          </p>
          <h2 className="truncate text-[22px] font-black text-tx-pri">{product.name}</h2>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-surf-2 text-tx-pri active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
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
                    className={`min-h-20 rounded-lg border-2 p-3 text-left focus:outline-none focus:ring-2 focus:ring-iris-500 ${
                      active
                        ? "border-green-700 bg-green-500 text-black"
                        : "border-bd bg-surf-2 text-tx-pri active:bg-surf-3"
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
              title={formatModifierGroupName(group.name)}
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
                      className={`flex min-h-16 items-center gap-3 rounded-lg border-2 px-3 text-left focus:outline-none focus:ring-2 focus:ring-iris-500 ${
                        active
                          ? "border-green-700 bg-green-500 text-black"
                          : "border-bd bg-surf-2 text-tx-pri active:bg-surf-3"
                      }`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center ${group.multiSelect ? "rounded-md" : "rounded-full"} ${active ? "bg-black text-white" : "border-2 border-bd-strong bg-surf-1"}`}>
                        {active && <Check size={15} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 text-[15px] font-black">{modifier.name}</span>
                      <span className="text-[14px] font-semibold tabular-nums">
                        {modifier.priceAdd > 0 ? `+$${modifier.priceAdd.toFixed(0)}` : "$0"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </OptionSection>
          );
        })}

        <OptionSection title="Cantidad" helper="Toca el número para teclear">
          <div className="inline-flex items-center gap-2 rounded-lg border-2 border-bd bg-surf-2 p-2">
            <button
              type="button"
              onClick={() => stepQty(quantity - 1)}
              className="flex h-12 w-12 items-center justify-center rounded-md bg-surf-1 text-tx-pri active:bg-surf-3"
            >
              <Minus size={20} strokeWidth={3} />
            </button>
            <button
              type="button"
              onClick={() => setShowQtyPad((open) => !open)}
              aria-label="Teclear cantidad"
              className={`w-16 rounded-md text-center text-[24px] font-black tabular-nums text-tx-pri active:bg-surf-3 ${showQtyPad ? "bg-surf-3 ring-2 ring-iris-500" : ""}`}
            >
              {quantity}
            </button>
            <button
              type="button"
              onClick={() => stepQty(quantity + 1)}
              className="flex h-12 w-12 items-center justify-center rounded-md bg-surf-1 text-tx-pri active:bg-surf-3"
            >
              <Plus size={20} strokeWidth={3} />
            </button>
          </div>

          {showQtyPad && (
            <div className="mt-3 grid w-full max-w-[320px] grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pressQtyDigit(d)}
                  className="flex h-14 items-center justify-center rounded-lg border-2 border-bd bg-surf-2 text-[22px] font-black tabular-nums text-tx-pri active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => stepQty(1)}
                className="flex h-14 items-center justify-center rounded-lg border-2 border-bd bg-surf-1 text-[13px] font-semibold uppercase text-tx-mut active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
              >
                C
              </button>
              <button
                type="button"
                onClick={() => pressQtyDigit("0")}
                className="flex h-14 items-center justify-center rounded-lg border-2 border-bd bg-surf-2 text-[22px] font-black tabular-nums text-tx-pri active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
              >
                0
              </button>
              <button
                type="button"
                onClick={pressQtyBackspace}
                aria-label="Borrar"
                className="flex h-14 items-center justify-center rounded-lg border-2 border-bd bg-surf-2 text-tx-pri active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
              >
                <Delete size={22} strokeWidth={2.4} />
              </button>
            </div>
          )}
        </OptionSection>

        <OptionSection title="Nota para cocina" helper="Opcional">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, 200))}
            placeholder="Sin cebolla, termino medio, alergia..."
            rows={2}
            maxLength={200}
            className="w-full resize-none rounded-lg border-2 border-bd bg-surf-2 px-3 py-3 text-[15px] font-bold text-tx-pri outline-none placeholder:text-tx-mut focus:border-iris-500"
          />
        </OptionSection>
      </div>

      <footer className="shrink-0 border-t border-bd bg-surf-1 p-4">
        {validationError && <p className="mb-2 text-[13px] font-semibold text-danger">{validationError}</p>}
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase text-tx-mut">Total configurado</p>
            <p className="text-[15px] font-bold text-tx-sec">${unitPrice.toFixed(2)} por unidad</p>
          </div>
          <span className="text-[28px] font-black tabular-nums text-tx-pri">${totalPrice.toFixed(2)}</span>
          <button
            type="button"
            onClick={confirm}
            disabled={!!validationError}
            className="h-16 min-w-[210px] rounded-lg bg-green-500 px-5 text-[15px] font-black uppercase text-black active:bg-green-600 disabled:opacity-40 disabled:grayscale focus:outline-none focus:ring-2 focus:ring-iris-500"
          >
            {submitLabel}
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
        <h3 className="text-[17px] font-black text-tx-pri">{title}</h3>
        <span className="text-[11px] font-semibold uppercase text-tx-mut">{helper}</span>
      </div>
      {children}
    </section>
  );
}

function ProductSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="h-[132px] rounded-lg border-2 border-bd bg-surf-1 animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-bd bg-surf-1 p-6 text-center">
      <Search size={34} className="text-tx-mut" />
      <p className="text-[16px] font-semibold text-tx-sec">
        {query.trim() ? "Sin resultados para la busqueda" : "Sin productos en esta categoria"}
      </p>
    </div>
  );
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
