"use client";
import React, { useState } from "react";
import { ChevronLeft, Search, Plus, ShoppingCart, Send } from "lucide-react";
import Button from "@/components/ui/Button";
import CategoryRail from "@/components/pos/CategoryRail";
import ProductCard from "@/components/pos/ProductCard";
import { useRouter } from "next/navigation";

const MOCK_CATEGORIES = [
  { id: 'all', name: 'Todos' },
  { id: 'tacos', name: 'Tacos' },
  { id: 'tortas', name: 'Tortas' },
  { id: 'bebidas', name: 'Bebidas' },
];

const MOCK_PRODUCTS = [
  { id: '1', name: 'Taco al Pastor', price: 35, category: 'tacos' },
  { id: '2', name: 'Taco de Suadero', price: 38, category: 'tacos' },
  { id: '4', name: 'Gringa Pastor', price: 95, category: 'tacos', promoPrice: 79 },
  { id: '9', name: 'Agua de Jamaica', price: 38, category: 'bebidas' },
];

export default function WaiterOrderPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [activeCat, setActiveCat] = useState("all");
  const [cartCount, setCartCount] = useState(0);
  const [total, setTotal] = useState(0);

  const filtered = activeCat === "all" ? MOCK_PRODUCTS : MOCK_PRODUCTS.filter(p => p.category === activeCat);

  const handleAdd = (p: any) => {
    setCartCount(prev => prev + 1);
    setTotal(prev => prev + (p.promoPrice || p.price));
  };

  return (
    <div className="h-full flex flex-col bg-surf-0">
      {/* HEADER */}
      <div className="p-4 border-b border-bd bg-surf-1 flex items-center gap-4 shrink-0">
        <button 
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-surf-2 border border-bd flex items-center justify-center text-tx-sec"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex flex-col">
          <span className="eyebrow !text-[10px]">NUEVA COMANDA</span>
          <h2 className="text-[16px] font-black leading-none">Mesa {params.id}</h2>
        </div>
      </div>

      {/* SEARCH */}
      <div className="p-4 bg-surf-1/50 border-b border-bd">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-dis" size={14} />
          <input 
            placeholder="Buscar producto..." 
            className="w-full h-10 bg-surf-2 border border-bd rounded-xl pl-10 pr-4 text-[13px] focus:outline-none focus:border-iris-500"
          />
        </div>
      </div>

      {/* CATEGORIES */}
      <CategoryRail 
        categories={MOCK_CATEGORIES} 
        activeId={activeCat} 
        onSelect={setActiveCat} 
      />

      {/* PRODUCTS GRID */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        <div className="grid grid-cols-2 gap-3 pb-32">
          {filtered.map(product => (
            <ProductCard 
              key={product.id}
              {...product}
              onClick={() => handleAdd(product)}
            />
          ))}
        </div>
      </div>

      {/* BOTTOM TICKET BAR */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-bd bg-surf-1 flex flex-col gap-3 shadow-2xl backdrop-blur-xl">
        <button className="h-12 bg-surf-2 border border-bd rounded-2xl flex items-center px-4 gap-3 active:scale-95 transition-all">
          <div className="w-7 h-7 rounded-lg bg-iris-soft text-iris-500 flex items-center justify-center font-black text-xs">
            {cartCount}
          </div>
          <div className="flex-1 text-left">
            <div className="text-[10px] font-bold text-tx-dis uppercase tracking-tighter leading-none">Comanda</div>
            <div className="mono tnum text-[14px] font-black">${total}</div>
          </div>
          <ChevronLeft className="rotate-180 text-tx-dis" size={16} />
        </button>

        <Button 
          variant="primary" 
          fullWidth 
          size="xl" 
          className="h-14 font-black uppercase tracking-[0.1em] text-sm gap-3 shadow-lg shadow-iris-glow disabled:opacity-50"
          disabled={cartCount === 0}
          onClick={() => console.log("Send to kitchen")}
        >
          <Send size={18} />
          Enviar a cocina
        </Button>
      </div>
    </div>
  );
}
