"use client";

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { getApiUrl } from "@/lib/config";

// ─── Types ───────────────────────────────────────────────────────────────────

type Modifier = { id: string; name: string; price: number };
type ModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  modifiers: Modifier[];
};
type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  modifierGroups: ModifierGroup[];
};
type Category = { id: string; name: string; items: MenuItem[] };

type CartItem = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  modifiers: { modifierId: string; name: string; price: number }[];
};

type Screen = "menu" | "cart" | "payment" | "success" | "error" | "forbidden" | "no-provider";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

function cartTotal(cart: CartItem[]) {
  return cart.reduce(
    (sum, item) =>
      sum + (item.price + item.modifiers.reduce((s, m) => s + m.price, 0)) * item.quantity,
    0
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function KioskPage() {
  const [screen, setScreen]         = useState<Screen>("menu");
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart]             = useState<CartItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [loading, setLoading]       = useState(true);
  const [ordering, setOrdering]     = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<string | null>(null);
  const [orderId, setOrderId]       = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<string>("");

  // Lee el resultado de pago de MP desde la URL (back_urls)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const oid    = params.get("orderId");
    if (status === "success") { setOrderId(oid); setScreen("success"); }
    if (status === "failure") { setScreen("error"); }
  }, []);

  const loadMenu = useCallback(async () => {
    try {
      setLoading(true);
      const baseUrl      = getApiUrl();
      const restaurantId = typeof window !== "undefined" ? localStorage.getItem("restaurantId") : null;
      const locationId   = typeof window !== "undefined" ? localStorage.getItem("locationId")   : null;
      const headers: Record<string, string> = {};
      if (restaurantId) headers["x-restaurant-id"] = restaurantId;
      if (locationId)   headers["x-location-id"]   = locationId;

      const { data } = await axios.get(`${baseUrl}/api/kiosk/menu`, { headers });
      const cats = (data as Category[]).filter((c) => c.items.length > 0);
      setCategories(cats);
      if (cats[0]) setActiveCategory(cats[0].id);
    } catch (err: any) {
      if (err?.response?.status === 403) setScreen("forbidden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen === "menu") loadMenu();
  }, [screen, loadMenu]);

  function addToCart(item: MenuItem, mods: CartItem["modifiers"]) {
    setCart((prev) => {
      const existing = prev.find(
        (c) => c.menuItemId === item.id && JSON.stringify(c.modifiers) === JSON.stringify(mods)
      );
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id && JSON.stringify(c.modifiers) === JSON.stringify(mods)
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [
        ...prev,
        { menuItemId: item.id, name: item.name, price: item.price, quantity: 1, modifiers: mods },
      ];
    });
    setSelectedItem(null);
  }

  function updateQty(idx: number, delta: number) {
    setCart((prev) =>
      prev
        .map((c, i) => (i === idx ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  }

  async function placeOrder() {
    if (!cart.length || ordering) return;
    setOrdering(true);
    try {
      const baseUrl      = getApiUrl();
      const restaurantId = typeof window !== "undefined" ? localStorage.getItem("restaurantId") : null;
      const locationId   = typeof window !== "undefined" ? localStorage.getItem("locationId")   : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (restaurantId) headers["x-restaurant-id"] = restaurantId;
      if (locationId)   headers["x-location-id"]   = locationId;

      const { data } = await axios.post(
        `${baseUrl}/api/kiosk/orders`,
        {
          items: cart.map((c) => ({
            menuItemId: c.menuItemId,
            quantity:   c.quantity,
            modifiers:  c.modifiers.map((m) => ({ modifierId: m.modifierId })),
          })),
          tableNumber: tableNumber ? Number(tableNumber) : null,
          locationId:  locationId ?? undefined,
        },
        { headers }
      );

      setOrderId(data.order?.id ?? null);
      setPaymentProvider(data.provider ?? null);
      if (data.checkoutUrl) {
        setCheckoutUrl(data.checkoutUrl);
        setScreen("payment");
      } else {
        setScreen("success");
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "";
      if (err?.response?.status === 400 && /pasarela/i.test(msg)) {
        setScreen("no-provider");
      } else {
        setScreen("error");
      }
    } finally {
      setOrdering(false);
    }
  }

  function resetKiosk() {
    setCart([]);
    setCheckoutUrl(null);
    setPaymentProvider(null);
    setOrderId(null);
    setTableNumber("");
    setScreen("menu");
  }

  // ─── Screens ─────────────────────────────────────────────────────────────

  if (screen === "forbidden") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-gray-950">
        <span className="text-6xl">🔒</span>
        <h1 className="text-2xl font-black text-white">Módulo Kiosko no activado</h1>
        <p className="text-gray-400 max-w-sm">
          Este restaurante no tiene el módulo Kiosko habilitado en su plan. Contacta al administrador.
        </p>
      </div>
    );
  }

  if (screen === "no-provider") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-gray-950">
        <span className="text-6xl">💳</span>
        <h1 className="text-2xl font-black text-white">Pasarela de pago no configurada</h1>
        <p className="text-gray-400 max-w-sm">
          El administrador debe activar al menos una pasarela (MercadoPago, Stripe, etc.) en Admin → Integraciones.
        </p>
        <button
          onClick={() => setScreen("cart")}
          className="mt-4 px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm transition-colors"
        >
          Volver al carrito
        </button>
      </div>
    );
  }

  if (screen === "success") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center bg-gray-950">
        <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center text-5xl">✅</div>
        <h1 className="text-3xl font-black text-white">¡Pedido confirmado!</h1>
        {orderId && <p className="text-gray-400 text-sm">Orden #{orderId.slice(-6).toUpperCase()}</p>}
        <p className="text-gray-300">Tu pedido está en camino a la cocina. Espera tu turno.</p>
        <button
          onClick={resetKiosk}
          className="mt-4 px-8 py-3 bg-green-500 hover:bg-green-400 text-black font-black rounded-2xl text-lg transition-colors"
        >
          Nuevo pedido
        </button>
      </div>
    );
  }

  if (screen === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center bg-gray-950">
        <div className="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center text-5xl">❌</div>
        <h1 className="text-3xl font-black text-white">Error en el pago</h1>
        <p className="text-gray-300">El pago no pudo procesarse. Intenta nuevamente.</p>
        <button
          onClick={resetKiosk}
          className="mt-4 px-8 py-3 bg-red-500 hover:bg-red-400 text-black font-black rounded-2xl text-lg transition-colors"
        >
          Intentar de nuevo
        </button>
      </div>
    );
  }

  if (screen === "payment" && checkoutUrl) {
    const providerLabel = paymentProvider === "STRIPE" ? "Stripe"
      : paymentProvider === "MERCADOPAGO" ? "MercadoPago"
      : "pasarela";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center bg-gray-950">
        <div className="w-24 h-24 rounded-full bg-blue-500/20 flex items-center justify-center text-5xl">📲</div>
        <h1 className="text-3xl font-black text-white">Escanea para pagar</h1>
        <p className="text-gray-300 max-w-sm">
          Toca el botón para pagar con {providerLabel}, o escanea el código QR que aparece en tu celular.
        </p>
        <a
          href={checkoutUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-8 py-4 bg-blue-500 hover:bg-blue-400 text-white font-black rounded-2xl text-lg transition-colors"
        >
          Pagar con {providerLabel} →
        </a>
        <button
          onClick={resetKiosk}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          Cancelar y volver
        </button>
      </div>
    );
  }

  // ─── Cart screen ──────────────────────────────────────────────────────────

  if (screen === "cart") {
    const total = cartTotal(cart);
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <header className="flex items-center gap-4 px-6 py-4 border-b border-gray-800">
          <button
            onClick={() => setScreen("menu")}
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
                    onClick={() => updateQty(idx, -1)}
                    className="w-8 h-8 rounded-lg bg-gray-800 text-white font-bold flex items-center justify-center hover:bg-gray-700 transition-colors"
                  >−</button>
                  <span className="text-white font-bold w-6 text-center">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(idx, 1)}
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
                onChange={(e) => setTableNumber(e.target.value)}
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
              onClick={placeOrder}
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

  // ─── Menu screen ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
        <h1 className="text-2xl font-black text-white" style={{ fontFamily: "Syne, sans-serif" }}>
          ¿Qué vas a pedir?
        </h1>
        <button
          onClick={() => setScreen("cart")}
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

      {/* Category tabs */}
      {!loading && categories.length > 0 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-gray-800">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
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

      {/* Menu items */}
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
                    onClick={() => setSelectedItem(item)}
                    className="bg-gray-900 rounded-2xl overflow-hidden text-left hover:ring-2 hover:ring-green-500 transition-all active:scale-95"
                  >
                    {item.imageUrl ? (
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

      {/* Item detail modal */}
      {selectedItem && (
        <ItemModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onAdd={(mods) => addToCart(selectedItem, mods)}
        />
      )}
    </div>
  );
}

// ─── Item Modal ───────────────────────────────────────────────────────────────

function ItemModal({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  onClose: () => void;
  onAdd: (mods: CartItem["modifiers"]) => void;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  function toggleMod(groupId: string, modId: string, maxSel: number) {
    setSelected((prev) => {
      const current = prev[groupId] ?? [];
      if (current.includes(modId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== modId) };
      }
      if (maxSel === 1) return { ...prev, [groupId]: [modId] };
      if (current.length >= maxSel) return prev;
      return { ...prev, [groupId]: [...current, modId] };
    });
  }

  function buildModifiers(): CartItem["modifiers"] {
    const mods: CartItem["modifiers"] = [];
    for (const group of item.modifierGroups) {
      for (const modId of selected[group.id] ?? []) {
        const mod = group.modifiers.find((m) => m.id === modId);
        if (mod) mods.push({ modifierId: mod.id, name: mod.name, price: mod.price });
      }
    }
    return mods;
  }

  const extraTotal = buildModifiers().reduce((s, m) => s + m.price, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {item.imageUrl && (
          <img src={item.imageUrl} alt={item.name} className="w-full h-48 object-cover rounded-t-3xl" />
        )}
        <div className="p-5">
          <h2 className="text-xl font-black text-white">{item.name}</h2>
          {item.description && <p className="text-gray-400 text-sm mt-1">{item.description}</p>}
          <p className="text-green-400 font-black text-xl mt-2">
            {formatPrice(item.price + extraTotal)}
          </p>

          {item.modifierGroups.map((group) => (
            <div key={group.id} className="mt-4">
              <p className="font-bold text-white text-sm mb-2">
                {group.name}
                {group.required && <span className="ml-1 text-red-400 text-xs">*requerido</span>}
              </p>
              <div className="flex flex-col gap-1.5">
                {group.modifiers.map((mod) => {
                  const isSelected = (selected[group.id] ?? []).includes(mod.id);
                  return (
                    <button
                      key={mod.id}
                      onClick={() => toggleMod(group.id, mod.id, group.maxSelections || 1)}
                      className="flex items-center justify-between px-4 py-3 rounded-xl transition-colors"
                      style={{
                        background: isSelected ? "#22c55e22" : "#1f2937",
                        border: `2px solid ${isSelected ? "#22c55e" : "transparent"}`,
                      }}
                    >
                      <span className="text-white text-sm">{mod.name}</span>
                      <span className="text-gray-400 text-sm">
                        {mod.price > 0 ? `+${formatPrice(mod.price)}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-2xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => onAdd(buildModifiers())}
              className="flex-1 py-3 bg-green-500 hover:bg-green-400 text-black font-black rounded-2xl transition-colors"
            >
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
