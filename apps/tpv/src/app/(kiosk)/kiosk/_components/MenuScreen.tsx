"use client";
import type { CartItem, Category, MenuItem } from "../_lib/types";
import { cartTotal, formatPrice } from "../_lib/format";

type Props = {
  categories: Category[];
  cart: CartItem[];
  loading: boolean;
  activeCategory: string;
  onSelectCategory: (id: string) => void;
  onSelectItem: (item: MenuItem) => void;
  onOpenCart: () => void;
};

export default function MenuScreen({
  categories,
  cart,
  loading,
  activeCategory,
  onSelectCategory,
  onSelectItem,
  onOpenCart,
}: Props) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
        <h1 className="text-2xl font-black text-white" style={{ fontFamily: "Syne, sans-serif" }}>
          ¿Qué vas a pedir?
        </h1>
        <button
          onClick={onOpenCart}
          className="relative flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-400 text-black font-black rounded-xl transition-colors"
        >
          🛒
          {cart.length > 0 && (
            <>
              <span className="hidden sm:inline">{formatPrice(cartTotal(cart))}</span>
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-white text-black text-[10px] font-black rounded-full flex items-center justify-center">
                {cart.reduce((s, c) => s + c.quantity, 0)}
              </span>
            </>
          )}
        </button>
      </header>

      {!loading && categories.length > 0 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-gray-800">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                onSelectCategory(cat.id);
                document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior: "smooth" });
              }}
              className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
              style={{
                background: activeCategory === cat.id ? "#22c55e" : "#1f2937",
                color: activeCategory === cat.id ? "#000" : "#9ca3af",
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-500">
            <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            Cargando menú…
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-20 text-gray-500">No hay productos disponibles</div>
        ) : (
          categories.map((cat) => (
            <div key={cat.id} id={`cat-${cat.id}`} className="mb-8">
              <h2 className="text-lg font-black text-white mb-3 px-1">{cat.name}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {cat.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onSelectItem(item)}
                    className="bg-gray-900 rounded-2xl overflow-hidden text-left hover:ring-2 hover:ring-green-500 transition-all active:scale-95"
                  >
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-32 object-cover"
                      />
                    ) : (
                      <div className="w-full h-32 bg-gray-800 flex items-center justify-center text-4xl">🍽️</div>
                    )}
                    <div className="p-3">
                      <p className="font-bold text-white text-sm leading-tight line-clamp-2">{item.name}</p>
                      <p className="text-green-400 font-black mt-1">{formatPrice(item.price)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
