"use client";
import React, { useState } from "react";
import CategoryRail from "@/components/pos/CategoryRail";
import ProductCard from "@/components/pos/ProductCard";

const MOCK_CATEGORIES = [
  { id: 'all', name: 'Todos' },
  { id: 'tacos', name: 'Tacos' },
  { id: 'tortas', name: 'Tortas' },
  { id: 'bowls', name: 'Bowls' },
  { id: 'bebidas', name: 'Bebidas' },
  { id: 'postres', name: 'Postres' },
  { id: 'extras', name: 'Extras' },
];

const MOCK_PRODUCTS = [
  { id: '1', name: 'Taco al Pastor', price: 35, category: 'tacos' },
  { id: '2', name: 'Taco de Suadero', price: 38, category: 'tacos' },
  { id: '3', name: 'Taco de Bistec', price: 42, category: 'tacos' },
  { id: '4', name: 'Gringa Pastor', price: 95, category: 'tacos', promoPrice: 79 },
  { id: '5', name: 'Torta Cubana', price: 145, category: 'tortas' },
  { id: '6', name: 'Torta Milanesa', price: 120, category: 'tortas' },
  { id: '7', name: 'Bowl de Pollo', price: 165, category: 'bowls' },
  { id: '8', name: 'Bowl Vegetariano', price: 145, category: 'bowls' },
  { id: '9', name: 'Agua de Jamaica', price: 38, category: 'bebidas' },
  { id: '10', name: 'Refresco 600ml', price: 32, category: 'bebidas' },
  { id: '11', name: 'Cerveza Artesanal', price: 78, category: 'bebidas' },
  { id: '12', name: 'Flan Napolitano', price: 65, category: 'postres' },
];

export default function CashierPage() {
  const [activeCat, setActiveCat] = useState("all");
  
  const filteredProducts = activeCat === "all" 
    ? MOCK_PRODUCTS 
    : MOCK_PRODUCTS.filter(p => p.category === activeCat);

  return (
    <div className="h-full flex flex-col bg-surf-0">
      {/* RIEL DE CATEGORÍAS */}
      <CategoryRail 
        categories={MOCK_CATEGORIES} 
        activeId={activeCat} 
        onSelect={setActiveCat} 
      />

      {/* GRID DE PRODUCTOS */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {filteredProducts.map((product) => (
            <ProductCard 
              key={product.id}
              {...product}
              onClick={() => console.log("Añadido:", product.name)}
            />
          ))}
        </div>
        
        {filteredProducts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full opacity-20 py-20">
            <span className="text-4xl mb-4">🔍</span>
            <p className="font-bold uppercase tracking-widest text-[12px]">Sin productos en esta categoría</p>
          </div>
        )}
      </div>
    </div>
  );
}
