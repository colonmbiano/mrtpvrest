"use client";
import React, { useState, useEffect, useMemo } from "react";
import { ChevronLeft, Search } from "lucide-react";
import CategoryRail from "@/components/pos/CategoryRail";
import ProductCard from "@/components/pos/ProductCard";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";
import type { Product } from "./_lib/types";
import { useOrderCart } from "./_hooks/useOrderCart";
import CartSheet from "./_components/CartSheet";
import BottomTicketBar from "./_components/BottomTicketBar";

type Category = { id: string; name: string };

export default function WaiterOrderPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const tableId = params.id;

  const [categories, setCategories] = useState<Category[]>([{ id: "all", name: "Todos" }]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCat, setActiveCat] = useState("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showSheet, setShowSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { cart, count, total, addToCart, changeQty, removeLine } = useOrderCart();

  useEffect(() => {
    (async () => {
      try {
        const [catsRes, itemsRes] = await Promise.all([
          api.get<Category[]>("/api/menu/categories"),
          api.get<Product[]>("/api/menu/items"),
        ]);
        setCategories([{ id: "all", name: "Todos" }, ...catsRes.data]);
        setProducts(itemsRes.data);
      } catch {
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
    return list;
  }, [products, activeCat, search]);

  async function handleSend() {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      await api.post("/api/orders/tpv", {
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
  }

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
          <h2 className="text-[16px] font-black leading-none">Mesa {tableId}</h2>
        </div>
      </div>

      {/* SEARCH */}
      <div className="p-4 bg-surf-1/50 border-b border-bd">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-dis" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full h-10 bg-surf-2 border border-bd rounded-xl pl-10 pr-4 text-[13px] focus:outline-none focus:border-iris-500"
          />
        </div>
      </div>

      <CategoryRail categories={categories} activeId={activeCat} onSelect={setActiveCat} />

      {/* PRODUCTS GRID */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 pb-32">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-square bg-surf-1 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-tx-mut text-[13px] py-12">Sin productos</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-32">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                id={product.id}
                name={product.name}
                price={product.price}
                imageUrl={product.imageUrl}
                promoPrice={product.promoPrice}
                onClick={() => addToCart(product)}
              />
            ))}
          </div>
        )}
      </div>

      <BottomTicketBar
        count={count}
        total={total}
        submitting={submitting}
        onOpenSheet={() => setShowSheet(true)}
        onSend={handleSend}
      />

      {showSheet && (
        <CartSheet
          tableId={tableId}
          cart={cart}
          total={total}
          onClose={() => setShowSheet(false)}
          onChangeQty={changeQty}
          onRemove={removeLine}
        />
      )}
    </div>
  );
}
