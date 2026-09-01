"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { get, set } from 'idb-keyval';
import { ChevronLeft, Search, X, Plus, Minus, Check, Delete } from "lucide-react";
import ItemOptionsSheet from "@/components/pos/ItemOptionsSheet";
import api from "@/lib/api";
import { formatModifierGroupName } from "@/lib/formatDisplayName";
import { useCatalogPrefs, type CatalogDensity } from "@/store/catalogPrefsStore";
import { hapticLight } from "@/lib/haptics";
import { isPromoActiveNow } from "@/lib/promo-window";
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
import { CATALOG_REFRESH_EVENT, fuzzyFilter, sameCategory, getCategoryIdOrName } from "@/lib/catalog-helpers";
import { CategoryGrid } from "@/components/pos/CategoryGrid";
import { CategoryBar, DrilldownHeader } from "@/components/pos/CategoryBar";
import { ProductGrid, ProductSkeleton, EmptyState } from "@/components/pos/ProductGrid";
import { WeightEntryModal } from "@/components/pos/WeightEntryModal";
import { QuickModifierPanel, type ConfiguratorInitial } from "@/components/pos/QuickModifierPanel";

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
  // false = categoría oculta: no se muestra en el POS ni sus productos. Se
  // controla con el toggle de /admin/menu (category.isActive).
  isActive?: boolean;
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
const CATALOG_CACHE_KEY = "tpv-catalog-cache-v2";

// El catálogo casi no cambia durante un turno, pero el cajero entra/sale del
// menú decenas de veces (una por pedido). Revalidar en CADA entrada = 2
// llamadas a Railway repetidas sin necesidad. Con este TTL solo revalidamos si
// el cache dejó de estar "fresco"; los cambios locales (disponibilidad/
// favorito) se escriben al cache al instante (write-through) para no quedar
// stale dentro de la ventana.
const CATALOG_TTL_MS = 5 * 60 * 1000;

type CatalogCache = {
  categories: CategoryLite[];
  products: Product[];
  // Epoch ms del último fetch exitoso. Ausente en caches viejos → se trata como
  // stale (revalida una vez) y al escribir queda con timestamp.
  fetchedAt?: number;
};

async function readCatalogCache(): Promise<CatalogCache | null> {
  if (typeof window === "undefined") return null;
  try {
    const data = await get(CATALOG_CACHE_KEY);
    if (!data || !Array.isArray(data?.categories) || !Array.isArray(data?.products)) return null;
    return data as CatalogCache;
  } catch {
    return null;
  }
}

async function writeCatalogCache(data: CatalogCache): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await set(CATALOG_CACHE_KEY, data);
  } catch {
    /* cuota llena / modo privado: la caché es best-effort */
  }
}

// Escribe un cambio puntual (disponibilidad/favorito) directo al cache, sin
// tocar el resto ni `fetchedAt` (no queremos reiniciar el TTL por un toggle).
// Así, dentro de la ventana del TTL, el siguiente montaje pinta el estado
// correcto en vez de revertir el toggle a lo último que trajo la red.
async function patchCatalogCacheProduct(id: string, patch: Partial<Product>): Promise<void> {
  const cache = await readCatalogCache();
  if (!cache) return;
  await writeCatalogCache({
    ...cache,
    products: cache.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  });
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
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);

  // Re-baja categorías + productos de la nube y refresca estado + cache. La usa
  // tanto la revalidación en segundo plano (al entrar con cache stale) como el
  // refresh forzado del botón "Sincronizar" (ignora el TTL).
  const loadCatalog = useCallback(async () => {
    try {
      const [catsRes, itemsRes] = await Promise.allSettled([
        api.get("/api/menu/categories?admin=true"),
        api.get("/api/menu/items?admin=true"),
      ]);

      const cached = await readCatalogCache();
      let nextCats = cached?.categories ?? [];
      let nextItems = cached?.products ?? [];
      if (catsRes.status === "fulfilled" && Array.isArray(catsRes.value.data)) {
        nextCats = catsRes.value.data;
      }
      if (itemsRes.status === "fulfilled" && Array.isArray(itemsRes.value.data)) {
        nextItems = itemsRes.value.data;
      }
      setCategories(nextCats);
      setProducts(nextItems);
      // Solo cacheamos si al menos una respuesta llegó bien (no pisar con vacío).
      if (catsRes.status === "fulfilled" || itemsRes.status === "fulfilled") {
        await writeCatalogCache({ categories: nextCats, products: nextItems, fetchedAt: Date.now() });
      }
    } catch (error) {
      console.error("Error loading POS catalog:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    readCatalogCache().then((cached) => {
      if (cancelled) return;
      if (cached) {
        setCategories(cached.categories);
        setProducts(cached.products);
        setIsLoading(false);
      }

      const isFresh =
        !!cached?.fetchedAt && Date.now() - cached.fetchedAt < CATALOG_TTL_MS;
      if (!isFresh) {
        void loadCatalog();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadCatalog]);

  // Refresh forzado: el botón "Sincronizar" del header dispara este evento para
  // re-bajar el menú ignorando el TTL (productos/cambios recién hechos en
  // /admin/menu aparecen de inmediato en vez de esperar la ventana fresca).
  useEffect(() => {
    const onRefresh = () => {
      void loadCatalog();
    };
    window.addEventListener(CATALOG_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(CATALOG_REFRESH_EVENT, onRefresh);
  }, [loadCatalog]);

  // Categorías ocultas (isActive=false desde /admin/menu). Sus productos NO se
  // venden ni se muestran en el POS (ni en favoritos, "todos" o búsqueda).
  const hiddenCategoryIds = useMemo(
    () => new Set(categories.filter((c) => c.isActive === false).map((c) => c.id)),
    [categories],
  );

  // Precio promo DINÁMICO: fuera de su ventana (día + hora, contra el reloj del
  // equipo) apagamos promoPrice, así el producto se pinta y se agrega a precio
  // normal. Dentro de la ventana se respeta promoPrice. Un tick re-evalúa cada
  // 30s para que el cambio ocurra solo al cruzar el horario, sin recargar. El
  // cobro final igual lo re-valida el backend (server-side es lo autoritativo).
  const [promoTick, setPromoTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPromoTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const gatedProducts = useMemo(() => {
    const now = new Date();
    void promoTick; // el tick fuerza re-evaluar la ventana contra el reloj actual
    return products.map((p) =>
      p.isPromo && p.promoPrice != null && !isPromoActiveNow(p, now)
        ? { ...p, promoPrice: null }
        : p,
    );
  }, [products, promoTick]);

  // Productos vendibles = los que NO pertenecen a una categoría oculta.
  const sellableProducts = useMemo(
    () => gatedProducts.filter((p) => !p.categoryId || !hiddenCategoryIds.has(p.categoryId)),
    [gatedProducts, hiddenCategoryIds],
  );

  const visibleCategories = useMemo(() => {
    const base = categories.length > 0
      ? categories.filter((c) => c.isActive !== false)
      : FALLBACK_CATEGORIES;
    return [...base].sort((a, b) => {
      const ai = PRIORITY_CATEGORIES.findIndex((name) => sameCategory(a.name, name));
      const bi = PRIORITY_CATEGORIES.findIndex((name) => sameCategory(b.name, name));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [categories]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const product of sellableProducts) {
      const cid = product.categoryId || getCategoryIdOrName(product.category) || "";
      if (!cid) continue;
      counts[cid] = (counts[cid] || 0) + 1;
    }
    return counts;
  }, [sellableProducts]);

  // Acceso rápido a los productos más vendidos: el cajero marca sus tops como
  // favorito (long-press → ⭐). isPopular cuenta también por si el backend lo
  // setea. Una pestaña fija al frente evita el scroll/búsqueda en cada pedido.
  const favoritesCount = useMemo(
    () => sellableProducts.filter((p) => p.isFavorite || p.isPopular).length,
    [sellableProducts],
  );

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim();
    if (query) return fuzzyFilter(sellableProducts, query);
    if (activeCat === "favorites") {
      return sellableProducts.filter((p) => p.isFavorite || p.isPopular);
    }
    if (activeCat === "all") return sellableProducts;

    const selected = visibleCategories.find((cat) => cat.id === activeCat);
    return sellableProducts.filter((product) => {
      if (product.categoryId && product.categoryId === activeCat) return true;
      if (!selected) return false;
      return sameCategory(product.category || "", selected.name);
    });
  }, [activeCat, sellableProducts, searchQuery, visibleCategories]);

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

  // Agrega un producto vendido por peso (báscula): `price` es por kg, la
  // línea guarda los kg en weightKg y cobra price × kg.
  const addWeightProduct = (product: Product, kg: number) => {
    const unit = Number(product.promoPrice || product.price || 0);
    const weightKg = Math.round(kg * 1000) / 1000;
    const cartItem: CartItem = {
      ...product,
      menuItemId: product.id,
      quantity: 1,
      weightKg,
      subtotal: unit * weightKg,
      price: unit,
      originalPrice: product.price,
      baseName: product.name,
    };
    addItemToActive(cartItem);
  };

  const handleProductClick = (product: Product) => {
    if (product.isAvailable === false) return;
    hapticLight();
    if (product.soldByWeight) {
      setWeightProduct(product);
      return;
    }
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
      // Write-through al cache: con el TTL del catálogo, sin esto el toggle se
      // revertía visualmente al re-entrar al menú dentro de la ventana fresca.
      patchCatalogCacheProduct(id, { isAvailable: next });
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
      patchCatalogCacheProduct(id, { isFavorite: next });
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
                : activeCat === "favorites"
                ? "Favoritos"
                : selectedCategory?.name || "Todos los productos"
            }
            onBack={goToCategories}
          />
        )
      ) : (
        <CategoryBar
          categories={visibleCategories}
          counts={categoryCounts}
          favoritesCount={favoritesCount}
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
            favoritesCount={favoritesCount}
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

      {weightProduct && (
        <WeightEntryModal
          product={weightProduct}
          onClose={() => setWeightProduct(null)}
          onConfirm={(kg) => {
            addWeightProduct(weightProduct, kg);
            setWeightProduct(null);
          }}
        />
      )}
    </div>
  );
}

// Captura de peso (kg) para productos vendidos por báscula. El `price` del
// producto es por kg; muestra el total en vivo (price × kg). Chips rápidos
// para los pesos más comunes + entrada libre decimal.

