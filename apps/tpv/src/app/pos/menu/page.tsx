"use client";
import React, { useState, useEffect, useMemo } from "react";
import { ChevronLeft, Star } from "lucide-react";
import CategoryGrid from "@/components/pos/CategoryGrid";
import ProductCard from "@/components/pos/ProductCard";
import OrderTypeToggle from "@/components/pos/OrderTypeToggle";
import ModifierPickerModal from "@/components/pos/ModifierPickerModal";
import SeatTabs from "@/components/pos/SeatTabs";
import api from "@/lib/api";
import {
  useTicketStore,
  type Product,
  type CartItem,
  type ModifierSelection,
} from "@/store/ticketStore";

/**
 * Catálogo POS — drill-down estilo Loyverse.
 *
 * Vistas:
 *   A) "categories" — grid de tiles. Si hay favoritos pinned, primer
 *      tile es "★ Favoritos".
 *   B) "products"   — grid de productos de una categoría. BackHeader
 *      con flecha ← para volver.
 *   C) "favorites"  — productos isFavorite=true (atajo). Mismo
 *      BackHeader que B.
 *
 * Reset al desmontar y al cambiar `ticket.id` (el cajero saltó de Ticket 1
 * a Ticket 2 — no debe quedar atrapado en la vista del ticket anterior).
 */

type View = "categories" | "products" | "favorites";

interface CategoryLite {
  id: string;
  name: string;
}

export default function CatalogPage() {
  const {
    getActiveTicket,
    updateTicket,
    addItemToActive,
  } = useTicketStore();

  const ticket = getActiveTicket();

  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [view, setView] = useState<View>("categories");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catsRes, itemsRes] = await Promise.all([
          api.get("/api/menu/categories"),
          api.get("/api/menu/items"),
        ]);
        if (cancelled) return;
        setCategories(Array.isArray(catsRes.data) ? catsRes.data : []);
        setProducts(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      } catch (error) {
        if (cancelled) return;
        console.error("Error loading data:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reset al desmontar — al volver al catálogo siempre arranca en vista A.
  useEffect(() => {
    return () => {
      setView("categories");
      setActiveCat(null);
    };
  }, []);

  // Reset al cambiar ticket activo — evita que el cajero salte a otro
  // ticket y siga "atrapado" viendo la categoría del anterior. Patrón
  // derived-state: corre en render, no en effect.
  const [prevTicketId, setPrevTicketId] = useState(ticket.id);
  if (prevTicketId !== ticket.id) {
    setPrevTicketId(ticket.id);
    setView("categories");
    setActiveCat(null);
  }

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) {
      const cid = (p as unknown as { categoryId?: string }).categoryId;
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
    if (view === "favorites") return favoritesItems;
    if (view === "products" && activeCat) {
      return products.filter((p) => (p as unknown as { categoryId?: string }).categoryId === activeCat);
    }
    return [];
  }, [view, activeCat, products, favoritesItems]);

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCat) ?? null,
    [categories, activeCat],
  );

  const handleProductClick = (p: Product) => {
    if (p.modifierGroups && p.modifierGroups.length > 0) {
      setPickerProduct(p);
      return;
    }
    addPlainProduct(p);
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

  const handlePickerConfirm = (mods: ModifierSelection[], unitExtra: number) => {
    if (!pickerProduct) return;
    const base = pickerProduct.promoPrice || pickerProduct.price;
    const unit = base + unitExtra;
    const cartItem: CartItem = {
      ...pickerProduct,
      menuItemId: pickerProduct.id,
      quantity: 1,
      subtotal: unit,
      price: unit,
      originalPrice: pickerProduct.price,
      modifiers: mods,
    };
    addItemToActive(cartItem);
    setPickerProduct(null);
  };

  const goBackToCategories = () => {
    setView("categories");
    setActiveCat(null);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-surf-0">
      <div className="px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4 pb-1">
        <OrderTypeToggle
          active={ticket.type}
          onChange={(type) => updateTicket({ type })}
        />
      </div>

      <SeatTabs />

      {view !== "categories" && (
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="aspect-square bg-surf-1 animate-pulse rounded-2xl" />
            ))}
          </div>
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
              onSelect={(id) => { setActiveCat(id); setView("products"); }}
              favoritesCount={favoritesItems.length}
              onPickFavorites={() => setView("favorites")}
            />
          )
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-stone-500 font-bold uppercase tracking-[0.15em] text-[11px]">
              {view === "favorites" ? "Sin favoritos marcados aún" : "Sin productos en esta categoría"}
            </p>
            <button
              type="button"
              onClick={goBackToCategories}
              className="text-amber-500 font-black uppercase tracking-[0.15em] text-[11px] active:scale-95 transition-transform"
            >
              ← Volver a categorías
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-3 animate-in fade-in slide-in-from-right-2 duration-200">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                {...product}
                onClick={() => handleProductClick(product)}
              />
            ))}
          </div>
        )}
      </div>

      {pickerProduct && (
        <ModifierPickerModal
          product={pickerProduct}
          onClose={() => setPickerProduct(null)}
          onConfirm={handlePickerConfirm}
        />
      )}
    </div>
  );
}
