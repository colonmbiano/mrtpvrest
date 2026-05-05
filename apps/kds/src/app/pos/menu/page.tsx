"use client";
import React, { useState, useEffect } from "react";
import CategoryRail from "@/components/pos/CategoryRail";
import ProductCard from "@/components/pos/ProductCard";
import OrderTypeToggle from "@/components/pos/OrderTypeToggle";
import ModifierPickerModal from "@/components/pos/ModifierPickerModal";
import api from "@/lib/api";
import {
  useTicketStore,
  type Product,
  type CartItem,
  type ModifierSelection,
} from "@/store/ticketStore";

export default function CatalogPage() {
  const {
    getActiveTicket,
    updateTicket,
    addItemToActive,
  } = useTicketStore();

  const ticket = getActiveTicket();

  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCat, setActiveCat] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catsRes, itemsRes] = await Promise.all([
          api.get("/api/menu/categories"),
          api.get("/api/menu/items")
        ]);
        setCategories([{ id: "all", name: "Todos" }, ...catsRes.data]);
        setProducts(itemsRes.data);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredProducts = activeCat === "all" 
    ? products 
    : products.filter((p: any) => p.categoryId === activeCat);

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

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-surf-0">
      <div className="px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4 pb-1">
        <OrderTypeToggle
          active={ticket.type}
          onChange={(type) => updateTicket({ type })}
        />
      </div>

      <CategoryRail
        categories={categories}
        activeId={activeCat}
        onSelect={setActiveCat}
      />
      
      <div className="flex-1 min-h-0 scroll-y p-3 sm:p-4 lg:p-6 pb-24 lg:pb-6 scrollbar-hide">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="aspect-square bg-surf-1 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
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
