'use client';

import { useMemo, useRef, useState } from 'react';
import { useCart } from '../../lib/cartStore';
import { getApiUrl } from '../../lib/config';
import StorefrontKawaii from './themes/StorefrontKawaii';
import StorefrontHalo from './themes/StorefrontHalo';
import StorefrontBrutalist from './themes/StorefrontBrutalist';
import type { StoreProps } from './themes/types';

import { computeDeliveryPreview } from '../../lib/delivery';

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
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'' | 'loading' | 'ok' | 'error'>('');
  const [checkoutError, setCheckoutError] = useState('');
  const catRefs = useRef<Record<string, HTMLElement | null>>({});

  const delivery = store.delivery;
  const minOrder = store.minOrderAmount || 0;

  // Vista previa del envío (lógica compartida con el backend vía lib/delivery).
  const deliveryPreview = useMemo(() => computeDeliveryPreview(delivery, total, coords), [delivery, coords, total]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoStatus('error'); return; }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStatus('ok'); },
      () => setGeoStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const grandTotal = total + (deliveryPreview.outOfRange ? 0 : deliveryPreview.fee);
  const needsLocationForFee = delivery?.mode === 'DISTANCE' && !!delivery?.origin && !coords;

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
    setCheckoutError('');
    if (!customerName || !deliveryAddress) return;
    if (minOrder > 0 && total < minOrder) {
      setCheckoutError(`El pedido mínimo es de ${fmt(minOrder)}.`);
      return;
    }
    if (deliveryPreview.outOfRange) {
      setCheckoutError('Tu ubicación está fuera del área de cobertura de envío.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/api/store/orders?r=${encodeURIComponent(store.slug || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName, customerPhone, deliveryAddress,
          orderType: 'DELIVERY', paymentMethod: 'CASH',
          locationId: selectedLocation?.id,
          deliveryLat: coords?.lat ?? null,
          deliveryLng: coords?.lng ?? null,
          items: lines.map(l => ({ menuItemId: l.id, quantity: l.quantity })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrderSuccess(data);
        clear();
      } else {
        setCheckoutError(data?.error || 'No se pudo enviar el pedido.');
      }
    } catch {
      setCheckoutError('Error de red al enviar el pedido.');
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

              {/* Ubicación GPS para envío por distancia */}
              {delivery?.mode === 'DISTANCE' && (
                <button type="button" onClick={useMyLocation}
                  className="w-full p-4 rounded-2xl font-bold text-sm border-2 transition-all"
                  style={{ borderColor: coords ? '#10b981' : primary, color: coords ? '#10b981' : primary }}>
                  {geoStatus === 'loading' ? 'Obteniendo ubicación…'
                    : coords ? '✓ Ubicación detectada — toca para actualizar'
                    : '📍 Usar mi ubicación para calcular el envío'}
                </button>
              )}
              {geoStatus === 'error' && (
                <p className="text-amber-600 text-xs font-bold">No pudimos obtener tu ubicación. Revisa los permisos del navegador.</p>
              )}

              {/* Desglose */}
              <div className="pt-6 border-t border-gray-100 space-y-2 mb-2">
                <div className="flex items-center justify-between text-sm font-bold text-gray-500">
                  <span>Subtotal</span><span>{fmt(total)}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-bold text-gray-500">
                  <span>
                    Envío
                    {deliveryPreview.distanceKm != null && <span className="text-gray-400 font-medium"> · {deliveryPreview.distanceKm} km</span>}
                  </span>
                  <span>
                    {deliveryPreview.outOfRange ? 'Fuera de cobertura'
                      : needsLocationForFee ? 'Calcula con tu ubicación'
                      : deliveryPreview.fee === 0 ? 'Gratis'
                      : fmt(deliveryPreview.fee)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="font-bold text-gray-400">Total</span>
                  <span className="text-3xl font-black" style={{ color: primary }}>{fmt(grandTotal)}</span>
                </div>
              </div>

              {minOrder > 0 && total < minOrder && (
                <p className="text-amber-600 text-xs font-bold">Pedido mínimo: {fmt(minOrder)}.</p>
              )}
              {checkoutError && <p className="text-red-500 text-xs font-bold">{checkoutError}</p>}

              <button disabled={isSubmitting || deliveryPreview.outOfRange || (minOrder > 0 && total < minOrder)} type="submit"
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
