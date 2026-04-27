"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ShoppingCart, Send, LayoutGrid, LayoutList } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import POSShell from "@/components/tpv/POSShell";
import SideRail from "@/components/tpv/SideRail";
import CategoryTabs from "@/components/tpv/CategoryTabs";
import ProductGrid from "@/components/tpv/ProductGrid";
import TicketPanel from "@/components/tpv/TicketPanel";

type Product = {
  id: string;
  name: string;
  price: number;
  categoryId?: string;
  imageUrl?: string | null;
  promoPrice?: number | null;
};

type CartLine = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
};

export default function WaiterOrderPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const tableId = params.id;

  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCat, setActiveCat] = useState("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [catsRes, itemsRes] = await Promise.all([
          api.get("/api/menu/categories"),
          api.get("/api/menu/items"),
        ]);
        setCategories(catsRes.data);
        setProducts(itemsRes.data);
      } catch (e: any) {
        toast.error("No se pudo cargar el menu");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = activeCat === "all" ? products : products.filter((p) => p.categoryId === activeCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list.map(p => ({
      ...p,
      category: categories.find(c => c.id === p.categoryId)?.name
    }));
  }, [products, activeCat, search, categories]);

  const addToCart = (p: Product) => {
    const price = p.promoPrice ?? p.price;
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.menuItemId === p.id);
      if (idx >= 0) {
        const next = [...prev];
        const current = next[idx]!;
        next[idx] = { ...current, quantity: current.quantity + 1 };
        return next;
      }
      const newLine: CartLine = {
        menuItemId: p.id,
        name: p.name,
        price,
        quantity: 1,
      };
      return [...prev, newLine];
    });
  };

  const changeQty = (menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const removeLine = (menuItemId: string) => {
    setCart((prev) => prev.filter((l) => l.menuItemId !== menuItemId));
  };

  const total = cart.reduce((acc, l) => acc + l.price * l.quantity, 0);

  const handleSend = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      await api.post("/api/orders", {
        type: "DINE_IN",
        tableId,
        items: cart.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          notes: "",
        })),
        customerName: `Mesa ${tableId}`,
        total,
      });
      toast.success("Comanda enviada a cocina");
      router.push(`/meseros/${tableId}`);
    } catch (e: any) {
      toast.error("Error al enviar: " + (e.response?.data?.error || e.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full w-full bg-bgApp">
      <POSShell
        rail={
          <SideRail 
            section="catalog" 
            onSection={() => router.push('/meseros')}
          />
        }
        main={
          <div className="flex flex-col h-full gap-4 p-6 overflow-hidden">
            {/* TOP BAR */}
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-6">
                <button 
                  onClick={() => router.back()}
                  className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-tx-mut hover:text-iris-500 transition-colors group"
                >
                  <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                  ← Volver
                </button>
                <h1 className="text-4xl font-display font-black tracking-tighter uppercase leading-none">
                  Nueva <span className="text-iris-500">Orden</span>
                </h1>
              </div>
              
              <div className="flex items-center gap-4">
                 <div className="flex bg-surf-2 p-1 rounded-2xl border border-bd">
                    <button className="p-2.5 rounded-xl bg-surf-3 text-tx-pri"><LayoutGrid size={18} /></button>
                    <button className="p-2.5 rounded-xl text-tx-mut"><LayoutList size={18} /></button>
                 </div>
              </div>
            </div>

            <CategoryTabs 
              categories={categories} 
              selected={activeCat} 
              onSelect={setActiveCat} 
            />

            <div className="flex-1 overflow-hidden">
              <ProductGrid 
                products={filtered}
                onPick={addToCart}
                searchValue={search}
                onSearchChange={setSearch}
                cols={3}
                currency="$"
              />
            </div>
          </div>
        }
        ticket={
          <TicketPanel 
            tabs={[{ id: "1", name: "Orden Actual" }]}
            activeTabId="1"
            onTabSelect={() => {}}
            onTabAdd={() => {}}
            onTabClose={() => {}}
            
            table={tableId}
            customerName=""
            onCustomerNameChange={() => {}}
            
            orderType="DINE_IN"
            orderTypeOptions={[{ id: "DINE_IN", label: "Mesa", icon: <ShoppingCart size={12} /> }]}
            onOrderTypeChange={() => {}}
            
            lines={cart.map(l => ({ id: l.menuItemId, name: l.name, price: l.price, quantity: l.quantity }))}
            onLineQty={(id, delta) => changeQty(id, delta)}
            onLineRemove={removeLine}
            
            subtotal={total}
            total={total}
            currency="$"
            
            primaryLabel={submitting ? "ENVIANDO..." : "ENVIAR A COCINA"}
            onPrimary={handleSend}
            onClear={() => setCart([])}
          />
        }
      />
    </div>
  );
}


