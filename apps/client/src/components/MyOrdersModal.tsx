'use client';

// "Mis pedidos": historial del cliente logueado + "Volver a pedir" en 1 toque.
// Reconstruye el carrito contra el menú vigente (lib/reorder) y prefilла los
// datos de contacto/entrega en el perfil local que ya lee el checkout, para que
// la recompra sea de 2 toques (revisar → pagar) al estilo OlaClick.
import { useEffect, useState } from 'react';
import { fetchMyOrders, getAuth, type CustomerOrder } from '../lib/customerAuth';
import { useCart } from '../lib/cartStore';
import { reorderIntoCart } from '../lib/reorder';
import type { StoreProduct } from './ProductModal';
import { useMoney } from './StoreLocaleContext';

const STATUS: Record<string, { t: string; c: string }> = {
  PENDING: { t: 'Recibido', c: '#f59e0b' },
  CONFIRMED: { t: 'Confirmado', c: '#3b82f6' },
  PREPARING: { t: 'En preparación', c: '#8b5cf6' },
  READY: { t: 'Listo', c: '#10b981' },
  ON_THE_WAY: { t: 'En camino', c: '#06b6d4' },
  DELIVERED: { t: 'Entregado', c: '#10b981' },
  CANCELLED: { t: 'Cancelado', c: '#ef4444' },
};

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

type Props = {
  open: boolean;
  onClose: () => void;
  slug: string;
  primary: string;
  products: StoreProduct[];
  // Se llama tras un "Volver a pedir" exitoso → el tema abre el carrito/checkout.
  onReordered: () => void;
};

export default function MyOrdersModal({ open, onClose, slug, primary, products, onReordered }: Props) {
  const fmt = useMoney();
  const add = useCart((s) => s.add);
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open) return;
    if (!getAuth(slug)) {
      setError('Inicia sesión para ver tus pedidos.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setNotice('');
    fetchMyOrders(slug)
      .then((data) => { if (!cancelled) setOrders(data); })
      .catch(() => { if (!cancelled) setError('No se pudieron cargar tus pedidos.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, slug]);

  const handleReorder = (order: CustomerOrder) => {
    const { added, skipped } = reorderIntoCart(order, products, add);
    if (added === 0) {
      setNotice('Ninguno de esos productos sigue disponible. Arma tu pedido desde el menú 🙏.');
      return;
    }
    // Prefill de contacto/entrega en el perfil local que ya consume el checkout.
    try {
      localStorage.setItem(
        `mrtpv:customer:${slug}`,
        JSON.stringify({
          name: order.customerName || '',
          phone: order.customerPhone || '',
          address: order.deliveryAddress || '',
          coords: order.deliveryLat && order.deliveryLng ? { lat: order.deliveryLat, lng: order.deliveryLng } : undefined,
        }),
      );
    } catch {}
    onClose();
    onReordered();
    if (skipped.length > 0) {
      // Avisamos qué se omitió (combos / no disponibles) para que el cliente decida.
      setTimeout(() => {
        const list = skipped.map((s) => `• ${s.name} (${s.reason})`).join('\n');
        try { window.alert(`Agregué ${added} producto(s) a tu carrito.\n\nEstos no se pudieron agregar automáticamente:\n${list}`); } catch {}
      }, 150);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] max-h-[88vh] flex flex-col overflow-hidden bg-white text-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 shrink-0 flex items-center justify-between" style={{ borderBottom: '1px solid #f0f0f0' }}>
          <h2 className="text-xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Mis pedidos</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#f3f4f6' }}>✕</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {loading && <p className="text-sm text-gray-400 text-center py-8">Cargando tus pedidos…</p>}
          {error && !loading && <p className="text-sm font-semibold text-center py-8" style={{ color: '#ef4444' }}>{error}</p>}
          {notice && <p className="text-sm font-semibold" style={{ color: primary }}>{notice}</p>}
          {!loading && !error && orders && orders.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">Aún no tienes pedidos. ¡Haz el primero! 🍔</p>
          )}

          {!loading && orders && orders.map((o) => {
            const st = STATUS[o.status] || { t: o.status, c: '#9ca3af' };
            const summary = (o.items || [])
              .map((i) => `${i.quantity}× ${i.name}`)
              .join(', ');
            return (
              <div key={o.id} className="rounded-2xl border-2 p-4" style={{ borderColor: '#eef0f2' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm">#{o.orderNumber}</span>
                  <span className="text-[11px] font-black uppercase tracking-wider px-2 py-1 rounded-full" style={{ background: `${st.c}1a`, color: st.c }}>{st.t}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">{fmtDate(o.createdAt)}</p>
                <p className="text-sm text-gray-600 mt-2 line-clamp-2">{summary}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="font-bold">{fmt(o.total)}</span>
                  <button
                    onClick={() => handleReorder(o)}
                    className="px-4 py-2.5 rounded-xl font-bold uppercase tracking-widest text-white text-[12px] active:scale-95 transition-all"
                    style={{ background: primary }}
                  >
                    ↻ Volver a pedir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
