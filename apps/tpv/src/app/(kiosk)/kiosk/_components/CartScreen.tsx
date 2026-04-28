"use client";
import type { CartItem } from "../_lib/types";
import { cartTotal, formatPrice } from "../_lib/format";

type Props = {
  cart: CartItem[];
  tableNumber: string;
  ordering: boolean;
  onTableChange: (v: string) => void;
  onUpdateQty: (idx: number, delta: number) => void;
  onBack: () => void;
  onPlaceOrder: () => void;
};

export default function CartScreen({
  cart,
  tableNumber,
  ordering,
  onTableChange,
  onUpdateQty,
  onBack,
  onPlaceOrder,
}: Props) {
  const total = cartTotal(cart);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-gray-800">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-white hover:bg-gray-700 transition-colors"
        >
          ←
        </button>
        <h1 className="text-xl font-black text-white flex-1">Tu pedido</h1>
        <span className="text-gray-400 text-sm">{cart.reduce((s, c) => s + c.quantity, 0)} artículo(s)</span>
      </header>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 text-gray-500">
            <span className="text-5xl">🛒</span>
            <p>Tu carrito está vacío</p>
          </div>
        ) : (
          cart.map((item, idx) => (
            <div key={idx} className="bg-gray-900 rounded-2xl p-4 flex gap-3 items-start">
              <div className="flex-1">
                <p className="font-bold text-white">{item.name}</p>
                {item.modifiers.map((m, mi) => (
                  <p key={mi} className="text-xs text-gray-400">+ {m.name} {m.price > 0 ? `(${formatPrice(m.price)})` : ""}</p>
                ))}
                <p className="text-green-400 font-bold mt-1">
                  {formatPrice((item.price + item.modifiers.reduce((s, m) => s + m.price, 0)) * item.quantity)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdateQty(idx, -1)}
                  className="w-8 h-8 rounded-lg bg-gray-800 text-white font-bold flex items-center justify-center hover:bg-gray-700 transition-colors"
                >−</button>
                <span className="text-white font-bold w-6 text-center">{item.quantity}</span>
                <button
                  onClick={() => onUpdateQty(idx, 1)}
                  className="w-8 h-8 rounded-lg bg-gray-800 text-white font-bold flex items-center justify-center hover:bg-gray-700 transition-colors"
                >+</button>
              </div>
            </div>
          ))
        )}

        {cart.length > 0 && (
          <div className="mt-2">
            <label className="block text-xs text-gray-400 mb-1 font-bold uppercase tracking-widest">
              Número de mesa (opcional)
            </label>
            <input
              type="number"
              value={tableNumber}
              onChange={(e) => onTableChange(e.target.value)}
              placeholder="Ej. 5"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="p-4 border-t border-gray-800">
          <div className="flex justify-between text-white font-black text-xl mb-4">
            <span>Total</span>
            <span className="text-green-400">{formatPrice(total)}</span>
          </div>
          <button
            onClick={onPlaceOrder}
            disabled={ordering}
            className="w-full py-4 bg-green-500 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black rounded-2xl text-xl transition-colors flex items-center justify-center gap-2"
          >
            {ordering ? (
              <>
                <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Procesando…
              </>
            ) : (
              "Pagar con QR →"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
