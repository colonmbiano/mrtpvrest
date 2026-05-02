'use client';

import { useMemo, useRef, useState } from 'react';
import { useCart } from '../../lib/cartStore';
import { getApiUrl } from '../../lib/config';
import StorefrontKawaii from './themes/StorefrontKawaii';
import StorefrontHalo from './themes/StorefrontHalo';
import StorefrontBrutalist from './themes/StorefrontBrutalist';
import type { StoreProps } from './themes/types';

const fmt = (n: number) => `$${n.toFixed(0)}`;
const API = getApiUrl();

const THEME_ALIAS: Record<string, string> = {
  MOCHI: 'KAWAII',
  BENTO: 'HALO',
  POCKET: 'BRUTALIST',
};

export default function StorefrontClient({
  store,
  categories,
}: {
  store: StoreProps;
  categories: any[];
}) {
  const raw = store.storefrontTheme || 'KAWAII';
  const theme = THEME_ALIAS[raw] || raw;

  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const clear = useCart(s => s.clear);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());

  const [activeCat, setActiveCat] = useState<string>(categories[0]?.id ?? '');
  const [showCheckout, setShowCheckout] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const catRefs = useRef<Record<string, HTMLElement | null>>({});

  useMemo(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/store/locations?r=${encodeURIComponent(store.slug || '')}`);
        if (res.ok) {
          const locs = await res.json();
          setLocations(locs);
          if (locs.length > 0) setSelectedLocation(locs[0]);
        }
      } catch {}
    })();
  }, [store.slug]);

  const scrollTo = (catId: string) => {
    setActiveCat(catId);
    catRefs.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !deliveryAddress) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/api/store/orders?r=${encodeURIComponent(store.slug || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName, customerPhone, deliveryAddress,
          orderType: 'DELIVERY', paymentMethod: 'CASH',
          locationId: selectedLocation?.id,
          items: lines.map(l => ({ menuItemId: l.id, quantity: l.quantity })),
        }),
      });
      if (res.ok) {
        setOrderSuccess(await res.json());
        clear();
      }
    } catch {
      alert('Error al enviar pedido');
    } finally {
      setIsSubmitting(false);
    }
  };

  const primary = store.primaryColor || '#ff5c35';

  if (orderSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-sm w-full text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-black mb-2">¡Pedido enviado!</h2>
          <p className="text-gray-500 mb-6 font-bold">Orden #{orderSuccess.orderNumber}</p>
          <button
            onClick={() => setOrderSuccess(null)}
            className="w-full py-4 text-white rounded-2xl font-black uppercase tracking-widest"
            style={{ background: primary }}
          >
            Listo
          </button>
        </div>
      </div>
    );
  }

  const themeProps = {
    store, categories, lines, add, remove, total, quantity, primary,
    activeCat, scrollTo, catRefs, fmt,
    onCheckout: () => setShowCheckout(true),
  };

  const Theme =
    theme === 'HALO' ? StorefrontHalo :
    theme === 'BRUTALIST' ? StorefrontBrutalist :
    StorefrontKawaii;

  return (
    <>
      <Theme {...themeProps} />

      {showCheckout && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setShowCheckout(false)}
        >
          <div
            className="bg-white w-full max-w-lg p-8 rounded-t-[32px]"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-2xl font-black uppercase tracking-tighter mb-6">Finalizar Compra</h2>
            <form onSubmit={handleSendOrder} className="space-y-4">
              <input required placeholder="Tu nombre"
                className="w-full p-4 bg-gray-100 rounded-2xl outline-none focus:ring-2"
                value={customerName} onChange={e => setCustomerName(e.target.value)} />
              <input placeholder="Tu teléfono (opcional)"
                className="w-full p-4 bg-gray-100 rounded-2xl outline-none"
                value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
              <textarea required placeholder="Dirección de entrega"
                className="w-full p-4 bg-gray-100 rounded-2xl outline-none h-24"
                value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} />
              <div className="pt-6 border-t border-gray-100 flex items-center justify-between mb-4">
                <span className="font-bold text-gray-400">Total</span>
                <span className="text-3xl font-black" style={{ color: primary }}>{fmt(total)}</span>
              </div>
              <button disabled={isSubmitting} type="submit"
                className="w-full py-5 text-white font-black rounded-2xl shadow-xl transition-all active:scale-95 disabled:opacity-50"
                style={{ background: primary }}>
                {isSubmitting ? 'ENVIANDO...' : 'CONFIRMAR PEDIDO'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
