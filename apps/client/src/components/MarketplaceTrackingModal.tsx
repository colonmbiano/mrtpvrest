'use client';

// Seguimiento de una orden del marketplace (API v1). Consulta /orders/:id/tracking con el
// token en cabecera y se actualiza cada 15 s. El token y el código de entrega solo viven en
// memoria del componente; no se guardan en el navegador.
import { useEffect, useState } from 'react';
import { fetchTracking, isCheckoutUrl, pinForFulfillment, type Fulfillment, type V1Tracking } from '../lib/marketplaceV1Checkout';

const POLL_MS = 15000;

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Esperando el pago',
  PENDING_MERCHANT: 'Pedido recibido',
  ACCEPTED: 'Aceptado por la tienda',
  PREPARING: 'En preparación',
  READY: 'Listo para recoger',
  ON_THE_WAY: 'En camino',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

type Props = {
  orderId: string;
  orderNumber?: string;
  trackingToken: string;
  fulfillment?: Fulfillment | null;
  pickupPin?: string | null;
  deliveryPin?: string | null;
  // Pago en línea: link de Mercado Pago. Se abre en otra pestaña para no perder
  // este seguimiento (el código solo vive aquí, en memoria).
  checkoutUrl?: string | null;
  apiUrl: string | null;
  primary: string;
  onClose: () => void;
};

export default function MarketplaceTrackingModal({ orderId, orderNumber, trackingToken, fulfillment, pickupPin, deliveryPin, checkoutUrl, apiUrl, primary, onClose }: Props) {
  const [tracking, setTracking] = useState<V1Tracking | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const result = await fetchTracking(apiUrl, orderId, trackingToken);
      if (stopped) return;
      if ('ok' in result && result.ok === false) { setError(result.message); return; }
      setError('');
      setTracking(result as V1Tracking);
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [apiUrl, orderId, trackingToken]);

  const label = tracking ? (STATUS_LABEL[tracking.status] ?? 'Actualizando') : 'Consultando…';
  // Código que el comprador necesita según cómo recibe el pedido. Una orden cancelada no muestra ninguno.
  const pin = tracking?.status === 'CANCELLED' ? null : pinForFulfillment(fulfillment, { pickupPin, deliveryPin });

  return (
    <div role="dialog" aria-modal="true" aria-label="Seguimiento del pedido" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Pedido {orderNumber ? `#${orderNumber}` : ''}</p>
            <h2 className="text-xl font-extrabold text-gray-900">{label}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm font-bold text-gray-600 hover:bg-gray-100">Cerrar</button>
        </div>
        {checkoutUrl && isCheckoutUrl(checkoutUrl) && (!tracking || tracking.status === 'PENDING_PAYMENT') && (
          <section className="mb-4 rounded-2xl bg-sky-50 p-4 text-center">
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-base font-extrabold text-white"
              style={{ background: '#009ee3' }}>
              Pagar con Mercado Pago
            </a>
            <p className="mt-2 text-xs text-gray-600">La tienda recibe tu pedido cuando Mercado Pago confirme el pago. Conserva esta ventana.</p>
          </section>
        )}
        {pin && (
          <section aria-label={`${pin.label} ${pin.code.split('').join(' ')}`} className="mb-4 rounded-2xl border-2 p-5 text-center" style={{ borderColor: primary }}>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{pin.label}</p>
            <p className="mt-2 font-mono text-4xl font-extrabold tracking-[0.3em] text-gray-900" aria-hidden="true">{pin.code}</p>
            <p className="mt-3 text-sm text-gray-700">{pin.instruction}</p>
          </section>
        )}
        {tracking?.isStale && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">La ubicación del repartidor no está actualizada.</p>
        )}
        {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
          <div className="h-full w-1/3 animate-pulse rounded-full" style={{ background: primary }} />
        </div>
        <p className="mt-3 text-xs text-gray-500">Se actualiza automáticamente cada 15 segundos.</p>
      </div>
    </div>
  );
}
