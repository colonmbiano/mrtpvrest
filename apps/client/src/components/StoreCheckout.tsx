'use client';

import { useMemo, useState } from 'react';
import { useCart } from '../lib/cartStore';
import { getApiUrl } from '../lib/config';
import { computeDeliveryPreview, type DeliveryConfig } from '../lib/delivery';

const API = getApiUrl();
const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;

type StoreCheckoutProps = {
  open: boolean;
  onClose: () => void;
  slug: string;
  primary: string;
  locations?: any[];
  delivery?: DeliveryConfig | null;
  minOrderAmount?: number;
};

// Checkout completo para los temas modernos (Mochi/Bento/Pocket): datos del
// cliente, ubicación GPS, vista previa de envío por distancia y creación de la
// orden contra POST /api/store/orders.
export default function StoreCheckout({
  open, onClose, slug, primary, locations = [], delivery, minOrderAmount = 0,
}: StoreCheckoutProps) {
  const lines = useCart(s => s.lines);
  const total = useCart(s => s.total());
  const clear = useCart(s => s.clear);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'' | 'loading' | 'ok' | 'error'>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<any>(null);

  const selectedLocation = locations[0] || null;
  const preview = useMemo(() => computeDeliveryPreview(delivery, total, coords), [delivery, total, coords]);
  const needsLocationForFee = delivery?.mode === 'DISTANCE' && !!delivery?.origin && !coords;
  const grandTotal = total + (preview.outOfRange ? 0 : preview.fee);
  const belowMin = minOrderAmount > 0 && total < minOrderAmount;

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoStatus('error'); return; }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStatus('ok'); },
      () => setGeoStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!customerName || !deliveryAddress) return;
    if (belowMin) { setError(`El pedido mínimo es de ${fmt(minOrderAmount)}.`); return; }
    if (preview.outOfRange) { setError('Tu ubicación está fuera del área de cobertura de envío.'); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/api/store/orders?r=${encodeURIComponent(slug)}`, {
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
      if (res.ok) { setSuccess(data); clear(); }
      else setError(data?.error || 'No se pudo enviar el pedido.');
    } catch {
      setError('Error de red al enviar el pedido.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  if (success) {
    return (
      <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-sm w-full text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-black mb-2">¡Pedido enviado!</h2>
          <p className="text-gray-500 mb-6 font-bold">Orden #{success.orderNumber}</p>
          <button
            onClick={() => { setSuccess(null); onClose(); }}
            className="w-full py-4 text-white rounded-2xl font-black uppercase tracking-widest"
            style={{ background: primary }}
          >
            Listo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-lg p-8 rounded-t-[32px] sm:rounded-[32px] max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black uppercase tracking-tighter">Finalizar Compra</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-800" aria-label="Cerrar">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="py-10 text-center text-gray-400 font-bold">Tu carrito está vacío</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input required placeholder="Tu nombre"
              className="w-full p-4 bg-gray-100 rounded-2xl outline-none focus:ring-2"
              value={customerName} onChange={e => setCustomerName(e.target.value)} />
            <input placeholder="Tu teléfono (opcional)"
              className="w-full p-4 bg-gray-100 rounded-2xl outline-none"
              value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
            <textarea required placeholder="Dirección de entrega"
              className="w-full p-4 bg-gray-100 rounded-2xl outline-none h-24"
              value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} />

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

            <div className="pt-6 border-t border-gray-100 space-y-2">
              <div className="flex items-center justify-between text-sm font-bold text-gray-500">
                <span>Subtotal</span><span>{fmt(total)}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-bold text-gray-500">
                <span>
                  Envío
                  {preview.distanceKm != null && <span className="text-gray-400 font-medium"> · {preview.distanceKm} km</span>}
                </span>
                <span>
                  {preview.outOfRange ? 'Fuera de cobertura'
                    : needsLocationForFee ? 'Calcula con tu ubicación'
                    : preview.fee === 0 ? 'Gratis'
                    : fmt(preview.fee)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="font-bold text-gray-400">Total</span>
                <span className="text-3xl font-black" style={{ color: primary }}>{fmt(grandTotal)}</span>
              </div>
            </div>

            {belowMin && <p className="text-amber-600 text-xs font-bold">Pedido mínimo: {fmt(minOrderAmount)}.</p>}
            {error && <p className="text-red-500 text-xs font-bold">{error}</p>}

            <button disabled={isSubmitting || preview.outOfRange || belowMin} type="submit"
              className="w-full py-5 text-white font-black rounded-2xl shadow-xl transition-all active:scale-95 disabled:opacity-50"
              style={{ background: primary }}>
              {isSubmitting ? 'ENVIANDO...' : 'CONFIRMAR PEDIDO'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
