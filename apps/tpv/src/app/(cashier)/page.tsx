"use client";
import React, { useState, useEffect } from "react";
import CategoryRail from "@/components/pos/CategoryRail";
import ProductCard from "@/components/pos/ProductCard";
import TicketLine from "@/components/pos/TicketLine";
import OrderTypeToggle from "@/components/pos/OrderTypeToggle";
import Button from "@/components/ui/Button";
import { Plus, Trash2, Printer, CreditCard } from "lucide-react";
import api from "@/lib/api";
import { useTicketStore, type Product, type CartItem } from "@/store/ticketStore";

export default function CatalogPage() {
  const { 
    getActiveTicket, 
    updateTicket, 
    addItemToActive, 
    changeItemQty, 
    removeItem, 
    clearActiveItems 
  } = useTicketStore();
  
  const ticket = getActiveTicket();
  
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCat, setActiveCat] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

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

  const handleAddToCart = (p: Product) => {
    const cartItem: CartItem = {
      ...p,
      menuItemId: p.id,
      quantity: 1,
      subtotal: p.promoPrice || p.price,
      price: p.promoPrice || p.price,
      originalPrice: p.price
    };
    addItemToActive(cartItem);
  };

  const subtotal = ticket.items.reduce((acc, item) => acc + item.subtotal, 0);
  const total = subtotal - ticket.discount;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-surf-0">
      <CategoryRail 
        categories={categories} 
        activeId={activeCat} 
        onSelect={setActiveCat} 
      />
      
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="aspect-square bg-surf-1 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProducts.map((product) => (
              <ProductCard 
                key={product.id} 
                {...product} 
                onClick={() => handleAddToCart(product)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
