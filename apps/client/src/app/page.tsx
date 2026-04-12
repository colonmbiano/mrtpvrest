"use client";
import { useEffect, useState, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const SLUG = process.env.NEXT_PUBLIC_STORE_SLUG || "masterburguers";
const ACCENT = "#ff5c35";

// ── Types ────────────────────────────────────────────────────────────────────
type Variant    = { id: string; name: string; price: number };
type Complement = { id: string; name: string; price: number; isRequired: boolean };
type MenuItem   = {
  id: string; name: string; description?: string; price: number;
  promoPrice?: number; isPromo: boolean; image?: string;
  categoryId: string; variants: Variant[]; complements: Complement[];
};
type Category   = { id: string; name: string; items: MenuItem[] };
type StoreInfo  = { id: string; name: string; logo?: string; phone?: string };
type CartItem   = { menuItem: MenuItem; variant?: Variant; quantity: number };

// ── Helpers ──────────────────────────────────────────────────────────────────
const price = (item: MenuItem, variant?: Variant) =>
  variant ? variant.price : (item.isPromo && item.promoPrice ? item.promoPrice : item.price);

const fmt = (n: number) => `$${n.toFixed(0)}`;

const cartTotal = (cart: CartItem[]) =>
  cart.reduce((s, c) => s + price(c.menuItem, c.variant) * c.quantity, 0);

const cartQty = (cart: CartItem[]) =>
  cart.reduce((s, c) => s + c.quantity, 0);

// ── VariantPicker modal ───────────────────────────────────────────────────────
function VariantPicker({ item, onAdd, onClose }: {
  item: MenuItem;
  onAdd: (item: MenuItem, variant?: Variant) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Variant | undefined>(
    item.variants.length === 1 ? item.variants[0] : undefined
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl p-6 pb-10 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {item.image && (
          <img src={item.image} alt={item.name}
            className="w-full h-44 object-cover rounded-2xl mb-4" />
        )}
        <h3 className="text-xl font-black mb-1">{item.name}</h3>
        {item.description && (
          <p className="text-sm text-gray-500 mb-4">{item.description}</p>
        )}
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
          Elige una opción
        </p>
        <div className="flex flex-col gap-2 mb-6">
          {item.variants.map(v => (
            <button
              key={v.id}
              onClick={() => setSelected(v)}
              className="flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all"
              style={{
                borderColor: selected?.id === v.id ? ACCENT : "#e5e7eb",
                background:  selected?.id === v.id ? ACCENT + "10" : "white",
              }}
            >
              <span className="font-semibold">{v.name}</span>
              <span className="font-black" style={{ color: ACCENT }}>{fmt(v.price)}</span>
            </button>
          ))}
        </div>
        <button
          disabled={!selected}
          onClick={() => { onAdd(item, selected); onClose(); }}
          className="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wide transition-all disabled:opacity-40"
          style={{ background: ACCENT, color: "#fff" }}
        >
          Agregar al pedido
        </button>
      </div>
    </div>
  );
}

// ── Checkout modal ────────────────────────────────────────────────────────────
function CheckoutModal({ cart, onClose, onSuccess }: {
  cart: CartItem[];
  onClose: () => void;
  onSuccess: (order: { orderNumber: string; total: number }) => void;
}) {
  const [name, setName]         = useState("");
  const [phone, setPhone]       = useState("");
  const [type, setType]         = useState<"TAKEOUT" | "DELIVERY">("TAKEOUT");
  const [address, setAddress]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const subtotal = cartTotal(cart);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Ingresa tu nombre"); return; }
    if (type === "DELIVERY" && !address.trim()) { setError("Ingresa tu dirección de entrega"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/store/orders?r=${SLUG}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map(c => ({
            menuItemId: c.menuItem.id,
            variantId:  c.variant?.id || null,
            quantity:   c.quantity,
          })),
          customerName:    name.trim(),
          customerPhone:   phone.trim() || undefined,
          orderType:       type,
          deliveryAddress: type === "DELIVERY" ? address.trim() : undefined,
          paymentMethod:   "CASH_ON_DELIVERY",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al crear el pedido");
      }
      const data = await res.json();
      onSuccess({ orderNumber: data.orderNumber, total: data.total });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-xl font-black">Tu pedido</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        {/* Scroll area */}
        <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-5">

          {/* Items del carrito */}
          <div className="flex flex-col gap-3">
            {cart.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">{c.menuItem.name}</p>
                  {c.variant && <p className="text-xs text-gray-400">{c.variant.name}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">x{c.quantity}</p>
                  <p className="font-black text-sm" style={{ color: ACCENT }}>
                    {fmt(price(c.menuItem, c.variant) * c.quantity)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-3 flex justify-between font-black text-base">
            <span>Total</span>
            <span style={{ color: ACCENT }}>{fmt(subtotal)}</span>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">Nombre *</label>
              <input
                type="text" placeholder="Tu nombre" value={name}
                onChange={e => setName(e.target.value)} required
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-[#ff5c35] transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">Teléfono</label>
              <input
                type="tel" placeholder="555-123-4567" value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-[#ff5c35] transition-colors"
              />
            </div>

            {/* Tipo de pedido */}
            <div>
              <label className="text-xs font-bold text-gray-500 mb-2 block">Tipo de pedido</label>
              <div className="grid grid-cols-2 gap-2">
                {(["TAKEOUT", "DELIVERY"] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setType(t)}
                    className="py-3 rounded-2xl text-sm font-bold border-2 transition-all"
                    style={{
                      borderColor: type === t ? ACCENT : "#e5e7eb",
                      background:  type === t ? ACCENT : "white",
                      color:       type === t ? "#fff" : "#374151",
                    }}
                  >
                    {t === "TAKEOUT" ? "🥡 Para llevar" : "🛵 A domicilio"}
                  </button>
                ))}
              </div>
            </div>

            {type === "DELIVERY" && (
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">Dirección de entrega *</label>
                <input
                  type="text" placeholder="Calle, número, colonia" value={address}
                  onChange={e => setAddress(e.target.value)} required
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-[#ff5c35] transition-colors"
                />
              </div>
            )}

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <button
              type="submit" disabled={loading}
              className="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wide transition-all disabled:opacity-50 hover:brightness-110 active:scale-95"
              style={{ background: ACCENT, color: "#fff" }}
            >
              {loading ? "Enviando..." : `Confirmar pedido · ${fmt(subtotal)}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────────────
function SuccessScreen({ orderNumber, total, onNew }: {
  orderNumber: string; total: number; onNew: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white px-6 text-center">
      <div className="text-8xl mb-6 animate-bounce">✅</div>
      <h1 className="text-3xl font-black mb-2">¡Pedido recibido!</h1>
      <p className="text-gray-500 mb-1 text-sm">Número de pedido</p>
      <p className="text-2xl font-black mb-6" style={{ color: ACCENT }}>{orderNumber}</p>
      <p className="text-gray-600 mb-2">Total: <strong>{fmt(total)}</strong></p>
      <p className="text-gray-500 text-sm mb-10 max-w-xs">
        Tu pedido está siendo preparado. Te avisaremos cuando esté listo.
      </p>
      <button
        onClick={onNew}
        className="px-8 py-4 rounded-2xl font-black uppercase tracking-wide text-white"
        style={{ background: ACCENT }}
      >
        Hacer otro pedido
      </button>
    </div>
  );
}

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({ item, onAdd }: { item: MenuItem; onAdd: (item: MenuItem) => void }) {
  const basePrice = item.isPromo && item.promoPrice ? item.promoPrice : item.price;

  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-sm flex flex-col">
      {item.image ? (
        <img src={item.image} alt={item.name} className="w-full h-40 object-cover" />
      ) : (
        <div className="w-full h-32 bg-gray-100 flex items-center justify-center text-4xl">🍽️</div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <p className="font-black text-sm leading-tight mb-1">{item.name}</p>
        {item.description && (
          <p className="text-xs text-gray-400 line-clamp-2 mb-3 flex-1">{item.description}</p>
        )}
        <div className="flex items-center justify-between mt-auto">
          <div>
            {item.isPromo && item.promoPrice && (
              <p className="text-xs line-through text-gray-300">{fmt(item.price)}</p>
            )}
            <p className="font-black text-base" style={{ color: ACCENT }}>{fmt(basePrice)}</p>
          </div>
          <button
            onClick={() => onAdd(item)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md active:scale-90 transition-transform"
            style={{ background: ACCENT }}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StorePage() {
  const [storeInfo, setStoreInfo]     = useState<StoreInfo | null>(null);
  const [categories, setCategories]   = useState<Category[]>([]);
  const [cart, setCart]               = useState<CartItem[]>([]);
  const [activeCat, setActiveCat]     = useState<string>("");
  const [variantItem, setVariantItem] = useState<MenuItem | null>(null);
  const [checkout, setCheckout]       = useState(false);
  const [success, setSuccess]         = useState<{ orderNumber: string; total: number } | null>(null);
  const [loading, setLoading]         = useState(true);
  const catRefs                       = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/store/info?r=${SLUG}`).then(r => r.json()),
      fetch(`${API}/api/store/menu?r=${SLUG}`).then(r => r.json()),
    ]).then(([info, menu]) => {
      setStoreInfo(info);
      setCategories(menu.categories || []);
      if (menu.categories?.length) setActiveCat(menu.categories[0].id);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleAdd(item: MenuItem, variant?: Variant) {
    if (!variant && item.variants.length > 0) {
      setVariantItem(item);
      return;
    }
    setCart(prev => {
      const idx = prev.findIndex(
        c => c.menuItem.id === item.id && c.variant?.id === variant?.id
      );
      if (idx >= 0) {
        return prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { menuItem: item, variant, quantity: 1 }];
    });
  }

  function handleRemoveOne(index: number) {
    setCart(prev => {
      const updated = [...prev];
      if (updated[index].quantity > 1) {
        updated[index] = { ...updated[index], quantity: updated[index].quantity - 1 };
      } else {
        updated.splice(index, 1);
      }
      return updated;
    });
  }

  function scrollToCategory(id: string) {
    setActiveCat(id);
    catRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-10 h-10 rounded-full border-4 border-gray-200 animate-spin"
        style={{ borderTopColor: ACCENT }} />
    </div>
  );

  const qty   = cartQty(cart);
  const total = cartTotal(cart);

  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto relative">

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white shadow-sm px-5 py-4 flex items-center justify-between">
        <div>
          {storeInfo?.logo && (
            <img src={storeInfo.logo} alt={storeInfo?.name} className="h-8 mb-1 object-contain" />
          )}
          <h1 className="text-lg font-black leading-tight">{storeInfo?.name || "Menú"}</h1>
        </div>
        <div className="flex items-center gap-1.5 bg-green-50 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-bold text-green-700">Abierto</span>
        </div>
      </header>

      {/* ── Category nav ── */}
      {categories.length > 0 && (
        <nav className="sticky top-[68px] z-20 bg-white border-b border-gray-100">
          <div className="flex overflow-x-auto gap-2 px-4 py-3">
            {categories.map(cat => (
              <button key={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                className="flex-none px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all"
                style={{
                  background: activeCat === cat.id ? ACCENT : "#f3f4f6",
                  color:      activeCat === cat.id ? "#fff" : "#374151",
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* ── Menu sections ── */}
      <main className="px-4 pt-6 pb-36 flex flex-col gap-8">
        {categories.map(cat => (
          <section key={cat.id} ref={el => { catRefs.current[cat.id] = el; }}>
            <h2 className="text-lg font-black mb-4 px-1">{cat.name}</h2>
            {cat.items.length === 0 ? (
              <p className="text-gray-400 text-sm px-1">Sin productos disponibles</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {cat.items.map(item => (
                  <ProductCard key={item.id} item={item}
                    onAdd={i => handleAdd(i)} />
                ))}
              </div>
            )}
          </section>
        ))}

        {categories.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-5xl mb-4">🍽️</p>
            <p className="text-gray-500">El menú no está disponible en este momento.</p>
          </div>
        )}
      </main>

      {/* ── Floating cart button ── */}
      {qty > 0 && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 pb-6 z-40">
          <button
            onClick={() => setCheckout(true)}
            className="w-full py-4 rounded-2xl font-black text-base shadow-2xl flex items-center justify-between px-6 transition-all active:scale-95"
            style={{ background: ACCENT, color: "#fff" }}
          >
            <span className="bg-white/20 rounded-xl px-2.5 py-0.5 text-sm font-black">{qty}</span>
            <span className="uppercase tracking-wide">Ver pedido</span>
            <span className="font-black">{fmt(total)}</span>
          </button>
        </div>
      )}

      {/* ── Modals ── */}
      {variantItem && (
        <VariantPicker item={variantItem}
          onAdd={(item, variant) => { handleAdd(item, variant); }}
          onClose={() => setVariantItem(null)}
        />
      )}

      {checkout && (
        <CheckoutModal
          cart={cart}
          onClose={() => setCheckout(false)}
          onSuccess={order => { setCheckout(false); setCart([]); setSuccess(order); }}
        />
      )}

      {success && (
        <SuccessScreen
          orderNumber={success.orderNumber}
          total={success.total}
          onNew={() => setSuccess(null)}
        />
      )}
    </div>
  );
}
