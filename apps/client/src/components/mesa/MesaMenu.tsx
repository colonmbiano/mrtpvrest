'use client';

/**
 * Menú de mesa (autoservicio por QR).
 *
 * Shell propio, NO un cuarto tema. El storefront normal tiene forma de
 * domicilio — selector de tipo de pedido, envío, mínimo de compra, «enviar por
 * WhatsApp» en cuatro superficies por tema — y cada una necesitaba una
 * excepción para mesa. Aquí no existen: lo que sobra no se esconde, no está.
 *
 * Se reutiliza lo que sí es común:
 *   · `ProductModal` — variantes, modificadores y combos (componente ya
 *     compartido por los tres temas).
 *   · `useCart` — el mismo carrito, así que el comensal no pierde nada si el
 *     enlace lo trajo desde el storefront normal.
 *   · `StoreCheckout` en modo mesa — cupones, puntos, propina, POST del pedido
 *     y seguimiento en vivo, ya sin WhatsApp ni pago en línea.
 *
 * El color sale del tenant (`accent`), así que esto sirve para cualquier
 * restaurante sin multiplicarse por tema.
 */

import { useMemo, useState } from 'react';
import { Search, ShoppingBag, Plus, Minus, Trash2, X, UtensilsCrossed } from 'lucide-react';
import { useCart } from '../../lib/cartStore';
import { cldImage } from '../../lib/cloudinary';
import ProductModal, { needsModal, type StoreProduct } from '../ProductModal';
import StoreCheckout from '../StoreCheckout';
import { StoreLocaleProvider, useMoney } from '../StoreLocaleContext';

type Category = { id: string; name: string; items?: StoreProduct[] };

type Props = {
  slug: string;
  storeName: string;
  logo: string | null;
  accent: string;
  currency?: string | null;
  currencyLocale?: string | null;
  categories: Category[];
  locations: any[];
  /** Etiqueta de la mesa (sale del payload firmado). Puede faltar: «Barra». */
  tableLabel: string | null;
  /** Token firmado del QR — es lo que ata el pedido a la mesa real. */
  tableToken: string;
  locationId: string | null;
};

export default function MesaMenu(props: Props) {
  return (
    <StoreLocaleProvider currency={props.currency} locale={props.currencyLocale}>
      <Shell {...props} />
    </StoreLocaleProvider>
  );
}

function Shell({
  slug, storeName, logo, accent, categories, locations, tableLabel, tableToken, locationId,
}: Props) {
  const fmt = useMoney();
  const lines = useCart(s => s.lines);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);

  const [query, setQuery] = useState('');
  const [modalProduct, setModalProduct] = useState<StoreProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .map(c => ({
        ...c,
        items: (c.items || []).filter(p => !q || p.name.toLowerCase().includes(q)),
      }))
      .filter(c => c.items.length > 0);
  }, [categories, query]);

  // Producto sin opciones → directo al carrito; con variantes/modificadores →
  // el modal compartido se encarga (y arma la línea con su firma correcta).
  const pick = (p: StoreProduct) => {
    if (needsModal(p)) { setModalProduct(p); return; }
    const price = Number(p.promoPrice ?? p.price ?? 0);
    add({ id: p.id, menuItemId: p.id, name: p.name, price, quantity: 1 });
  };

  return (
    <div className="min-h-screen bg-white pb-32 text-gray-900">
      {/* Cabecera: la mesa siempre visible, es lo que distingue este menú. */}
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur" style={{ borderColor: `${accent}22` }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cldImage(logo, { width: 96 }) || ''} alt={storeName} className="h-10 w-10 shrink-0 rounded-xl object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black leading-tight">{storeName}</p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-black" style={{ color: accent }}>
              <UtensilsCrossed className="h-3 w-3" />
              {tableLabel ? `Mesa ${tableLabel}` : 'Pedido en tu mesa'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex h-11 w-11 items-center justify-center rounded-2xl text-white"
            style={{ background: accent }}
            aria-label="Ver mi pedido"
          >
            <ShoppingBag className="h-5 w-5" />
            {quantity > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-900 px-1 text-[11px] font-black text-white">
                {quantity}
              </span>
            )}
          </button>
        </div>

        <div className="mx-auto max-w-3xl px-4 pb-3">
          <div className="flex items-center gap-2 rounded-2xl border px-3 py-2" style={{ borderColor: '#e5e7eb' }}>
            <Search className="h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar en el menú"
              className="w-full bg-transparent text-sm font-bold outline-none placeholder:font-medium placeholder:text-gray-400"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4">
        {visible.length === 0 ? (
          <p className="py-16 text-center text-sm font-bold text-gray-400">
            {query ? `Sin resultados para “${query}”` : 'El menú está vacío por ahora.'}
          </p>
        ) : (
          visible.map(cat => (
            <section key={cat.id} className="pt-6">
              <h2 className="mb-3 text-[13px] font-black uppercase tracking-widest text-gray-400">{cat.name}</h2>
              <div className="space-y-2">
                {cat.items!.map(p => (
                  <ProductRow key={p.id} product={p} accent={accent} fmt={fmt} onPick={() => pick(p)} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Barra flotante: el total y el paso siguiente, siempre a la vista. */}
      {quantity > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3" style={{ borderColor: '#e5e7eb' }}>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-2xl px-5 py-4 text-white"
            style={{ background: accent }}
          >
            <span className="text-sm font-black">Ver mi pedido · {quantity}</span>
            <span className="text-lg font-black">{fmt(total)}</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <CartSheet
          accent={accent}
          fmt={fmt}
          lines={lines}
          total={total}
          onClose={() => setCartOpen(false)}
          onRemove={remove}
          onAdd={line => add({ id: line.id, menuItemId: line.menuItemId, name: line.name, price: line.price, variantId: line.variantId, modifierIds: line.modifierIds, comboSelections: line.comboSelections, note: line.note, quantity: 1 })}
          onSend={() => { setCartOpen(false); setCheckoutOpen(true); }}
        />
      )}

      {modalProduct && (
        <ProductModal product={modalProduct} accent={accent} variant="light" onClose={() => setModalProduct(null)} />
      )}

      {/* Checkout en modo mesa: sin WhatsApp (whatsappOrder ausente) y sin pago
          en línea (onlinePayment=false, que además evita liberar la mesa al
          pagar mientras el comensal sigue sentado). */}
      <StoreCheckout
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        slug={slug}
        primary={accent}
        locations={locations}
        minOrderAmount={0}
        onlinePayment={false}
        initialOrderType="DINE_IN"
        lockedTable={tableLabel}
        lockedTableToken={tableToken}
        lockedLocationId={locationId}
      />
    </div>
  );
}

function ProductRow({
  product, accent, fmt, onPick,
}: { product: StoreProduct; accent: string; fmt: (n: number) => string; onPick: () => void }) {
  const price = Number(product.promoPrice ?? product.price ?? 0);
  const img = cldImage((product as any).imageUrl || (product as any).image, { width: 200 });
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99]"
      style={{ borderColor: '#e5e7eb' }}
    >
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={product.name} loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black leading-tight">{product.name}</p>
        {(product as any).description && (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-gray-500">{(product as any).description}</p>
        )}
        <p className="mt-1 text-sm font-black" style={{ color: accent }}>{fmt(price)}</p>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: accent }}>
        <Plus className="h-5 w-5" />
      </span>
    </button>
  );
}

function CartSheet({
  accent, fmt, lines, total, onClose, onRemove, onAdd, onSend,
}: {
  accent: string;
  fmt: (n: number) => string;
  lines: ReturnType<typeof useCart.getState>['lines'];
  total: number;
  onClose: () => void;
  onRemove: (id: string) => void;
  onAdd: (line: ReturnType<typeof useCart.getState>['lines'][number]) => void;
  onSend: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-t-3xl bg-white"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: '#e5e7eb' }}>
          <div>
            <p className="text-lg font-black">Tu pedido</p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
              {lines.length} {lines.length === 1 ? 'producto' : 'productos'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <p className="py-10 text-center text-sm font-bold text-gray-400">Tu pedido está vacío.</p>
          ) : (
            <div className="space-y-2">
              {lines.map(l => (
                <div key={l.id} className="flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: '#e5e7eb' }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black leading-tight">{l.name}</p>
                    {l.note && <p className="mt-0.5 text-[11px] font-bold text-gray-400">“{l.note}”</p>}
                    <p className="mt-1 text-sm font-black" style={{ color: accent }}>{fmt(l.price * l.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-2 py-1">
                    <button type="button" onClick={() => onRemove(l.id)} className="p-1" aria-label="Quitar uno">
                      {l.quantity === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                    </button>
                    <span className="min-w-5 text-center text-sm font-black">{l.quantity}</span>
                    <button type="button" onClick={() => onAdd(l)} className="p-1" aria-label="Agregar uno">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4" style={{ borderColor: '#e5e7eb' }}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-400">Total</span>
            <span className="text-2xl font-black" style={{ color: accent }}>{fmt(total)}</span>
          </div>
          {/* Un solo camino: a cocina. Sin «pagar» ni WhatsApp — el comensal
              está sentado y paga al final, en su mesa o en la caja. */}
          <button
            type="button"
            disabled={lines.length === 0}
            onClick={onSend}
            className="w-full rounded-2xl py-4 text-sm font-black uppercase tracking-widest text-white disabled:opacity-40"
            style={{ background: accent }}
          >
            Enviar a cocina
          </button>
        </div>
      </div>
    </div>
  );
}
