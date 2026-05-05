"use client";
import React, { useState, useEffect, useMemo } from "react";
import { ChevronLeft, Search, Send, Minus, Plus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import CategoryRail from "@/components/pos/CategoryRail";
import ProductCard from "@/components/pos/ProductCard";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";

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

  const [categories, setCategories] = useState<any[]>([{ id: "all", name: "Todos" }]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCat, setActiveCat] = useState("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showSheet, setShowSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [catsRes, itemsRes] = await Promise.all([
          api.get("/api/menu/categories"),
          api.get("/api/menu/items"),
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

  const addToCart = (p: Product) => {
    const price = p.promoPrice ?? p.price;
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.menuItemId === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { menuItemId: p.id, name: p.name, price, quantity: 1 }];
    });
  };

  const changeQty = (menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const removeLine = (menuItemId: string) => {
    setCart((prev) => prev.filter((l) => l.menuItemId !== menuItemId));
  };

  const cartCount = cart.reduce((acc, l) => acc + l.quantity, 0);
  const total = cart.reduce((acc, l) => acc + l.price * l.quantity, 0);

  // Counts por categoría (para badges del rail)
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: products.length };
    for (const p of products) {
      const k = p.categoryId || "_unknown";
      map[k] = (map[k] || 0) + 1;
    }
    return map;
  }, [products]);

  const handleSend = async () => {
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
  };

  return (
    <div className="h-full flex flex-col bg-surf-0">
      {/* HEADER */}
      <div
        className="px-4 py-3 border-b border-bd flex items-center gap-3 shrink-0"
        style={{ background: "#1A1A1A", color: "#FFFFFF", fontFamily: "JetBrains Mono, monospace" }}
      >
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex flex-col flex-1">
          <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: "#666" }}>NUEVA COMANDA</span>
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-bold leading-none">Mesa {tableId}</h2>
            <span className="text-[11px]" style={{ color: "#B8B9B6" }}>· en preparación</span>
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end px-3 py-1.5 rounded-xl gap-0.5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <span className="text-[9px] font-bold tracking-wider" style={{ color: "#666" }}>EN COMANDA</span>
          <span className="text-sm font-bold tabular-nums">
            {cartCount} {cartCount === 1 ? "producto" : "productos"}
          </span>
        </div>
        <div className="flex flex-col items-end px-3 py-1.5 rounded-xl gap-0.5"
          style={{ background: "rgba(136,214,108,0.1)", border: "1px solid rgba(136,214,108,0.3)" }}>
          <span className="text-[9px] font-bold tracking-wider" style={{ color: "#88D66C" }}>TOTAL</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: "#88D66C" }}>
            ${total.toFixed(2)}
          </span>
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

      {/* CATEGORIES */}
      <CategoryRail categories={categories} activeId={activeCat} onSelect={setActiveCat} counts={categoryCounts} />

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

      {/* BOTTOM TICKET BAR */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-bd bg-surf-1 flex flex-col gap-3 shadow-2xl backdrop-blur-xl">
        <button
          onClick={() => cartCount > 0 && setShowSheet(true)}
          className="h-12 bg-surf-2 border border-bd rounded-2xl flex items-center px-4 gap-3 active:scale-95 transition-all disabled:opacity-50"
          disabled={cartCount === 0}
        >
          <div className="w-7 h-7 rounded-lg bg-iris-soft text-iris-500 flex items-center justify-center font-black text-xs">
            {cartCount}
          </div>
          <div className="flex-1 text-left">
            <div className="text-[10px] font-bold text-tx-dis uppercase tracking-tighter leading-none">
              Comanda
            </div>
            <div className="mono tnum text-[14px] font-black">${total.toFixed(2)}</div>
          </div>
          <ChevronLeft className="rotate-90 text-tx-dis" size={16} />
        </button>

        <Button
          variant="primary"
          fullWidth
          size="xl"
          className="h-14 font-black uppercase tracking-[0.1em] text-sm gap-3 shadow-lg shadow-iris-glow disabled:opacity-50"
          disabled={cartCount === 0 || submitting}
          onClick={handleSend}
        >
          <Send size={18} />
          {submitting ? "Enviando..." : "Enviar a cocina"}
        </Button>
      </div>

      {/* CART SHEET */}
      {showSheet && (
        <div
          className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSheet(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[80%] bg-surf-1 border-t border-bd rounded-t-3xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-bd flex items-center justify-between">
              <div>
                <div className="eyebrow !text-[10px]">COMANDA</div>
                <div className="text-[16px] font-black">Mesa {tableId}</div>
              </div>
              <button
                onClick={() => setShowSheet(false)}
                className="w-9 h-9 rounded-xl bg-surf-2 border border-bd flex items-center justify-center text-tx-sec"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
              {cart.map((l) => (
                <div
                  key={l.menuItemId}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-surf-2 border border-bd"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold truncate">{l.name}</div>
                    <div className="mono tnum text-[12px] text-tx-mut">${l.price.toFixed(2)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => changeQty(l.menuItemId, -1)}
                      className="w-8 h-8 rounded-lg bg-surf-3 border border-bd flex items-center justify-center"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="mono tnum text-[14px] font-black w-6 text-center">
                      {l.quantity}
                    </span>
                    <button
                      onClick={() => changeQty(l.menuItemId, 1)}
                      className="w-8 h-8 rounded-lg bg-iris-soft border border-iris-500 text-iris-500 flex items-center justify-center"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      onClick={() => removeLine(l.menuItemId)}
                      className="ml-1 w-8 h-8 rounded-lg bg-surf-3 border border-bd flex items-center justify-center text-tx-mut"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-bd flex items-center justify-between">
              <div className="eyebrow !text-[10px]">TOTAL</div>
              <div className="mono tnum text-2xl font-black">${total.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
