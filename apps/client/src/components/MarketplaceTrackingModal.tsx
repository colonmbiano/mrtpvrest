'use client';

// Seguimiento de una orden del marketplace (API v1). Consulta /orders/:id/tracking con el
// token en cabecera y se actualiza cada 15 s. El token solo vive en memoria del componente.
import { useEffect, useState } from 'react';
import { fetchTracking, type V1Tracking } from '../lib/marketplaceV1Checkout';

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
  apiUrl: string | null;
  primary: string;
  onClose: () => void;
};

export default function MarketplaceTrackingModal({ orderId, orderNumber, trackingToken, apiUrl, primary, onClose }: Props) {
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

  return (
    <div role="dialog" aria-modal="true" aria-label="Seguimiento del pedido" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Pedido {orderNumber ? `#${orderNumber}` : ''}</p>
            <h2 className="text-xl font-extrabold text-gray-900">{label}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm font-bold text-gray-600 hover:bg-gray-100">Cerrar</button>
        </div>
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
