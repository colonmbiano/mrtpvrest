'use client';

// Confirmación de pago al volver de la pasarela (Checkout Pro de MercadoPago).
// La pasarela regresa al cliente a la tienda con ?status=success|failure|pending
// &orderId=<id> (ver back_urls en store.routes POST /payment/create). Sin este
// componente, el cliente pagaba y caía en la tienda normal, con el carrito vacío
// y SIN ninguna confirmación: no sabía si su pago/pedido se registró.
//
// Qué hace:
//  · Lee los parámetros del retorno una sola vez al montar y limpia la URL
//    (replaceState) para que un refresh o "atrás" no repita el modal ni deje los
//    parámetros expuestos/compartibles.
//  · Consulta el pedido por id (GET /api/store/orders/:id, subconjunto público)
//    y, en éxito/pendiente, hace polling hasta que el webhook marca PAID.
//  · Muestra éxito, pago en revisión o fallo, con el folio y el estado del pedido.

import { useEffect, useRef, useState } from 'react';
import { getApiUrl } from '../lib/config';

const API = getApiUrl();

type ReturnStatus = 'success' | 'failure' | 'pending';

type OrderView = {
  orderNumber?: string | number;
  status?: string;
  paymentStatus?: string;
  total?: number;
  estimatedMinutes?: number | null;
};

type Props = {
  slug: string;
  primary: string;
  currency?: string | null;
  locale?: string | null;
};

// Mismos estados y colores que la pantalla de éxito del checkout (StoreCheckout).
const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  PENDING:    { t: 'Recibido', c: '#f59e0b' },
  CONFIRMED:  { t: 'Confirmado', c: '#3b82f6' },
  PREPARING:  { t: 'En preparación', c: '#8b5cf6' },
  READY:      { t: 'Listo', c: '#10b981' },
  ON_THE_WAY: { t: 'En camino', c: '#06b6d4' },
  DELIVERED:  { t: 'Entregado', c: '#10b981' },
  CANCELLED:  { t: 'Cancelado', c: '#ef4444' },
};

// id de pedido tipo cuid: solo letras/números, sin tocar la URL de otros usos.
const ORDER_ID_RE = /^[a-z0-9]{10,40}$/i;
// Cuántas veces reintentamos antes de dejar de pollear (≈1 min a 5s): si el
// webhook de la pasarela tarda, igual mostramos el pedido como registrado.
const MAX_POLLS = 12;

export default function PaymentReturn({ slug, primary, currency, locale }: Props) {
  const [ret, setRet] = useState<{ status: ReturnStatus; orderId: string } | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fmtMoney = (n: number | undefined) => {
    if (typeof n !== 'number') return '';
    try {
      return new Intl.NumberFormat(locale || 'es-MX', { style: 'currency', currency: currency || 'MXN' }).format(n);
    } catch {
      return `$${n}`;
    }
  };

  // 1) Leer el retorno una sola vez y limpiar la URL.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const status = sp.get('status');
      const orderId = sp.get('orderId');
      const valid = (status === 'success' || status === 'failure' || status === 'pending')
        && !!orderId && ORDER_ID_RE.test(orderId);
      if (valid) setRet({ status: status as ReturnStatus, orderId: orderId as string });
      // Quitamos los parámetros del pago aunque solo venga uno: no deben quedar en
      // la barra (un "compartir" o un refresh no debe reabrir esta pantalla).
      if (status || orderId) {
        sp.delete('status');
        sp.delete('orderId');
        const qs = sp.toString();
        window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
      }
    } catch { /* sin window/URL no hay retorno que mostrar */ }
  }, []);

  // 2) Consultar el pedido y, en éxito/pendiente, pollear hasta PAID.
  useEffect(() => {
    if (!ret) return;
    let stop = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const res = await fetch(
          `${API}/api/store/orders/${encodeURIComponent(ret.orderId)}?r=${encodeURIComponent(slug)}`,
          { cache: 'no-store' },
        );
        if (res.ok) {
          const d: OrderView = await res.json();
          if (!stop) { setOrder(d); setLoaded(true); }
          // Pago confirmado: ya no hace falta seguir consultando.
          if (d?.paymentStatus === 'PAID') return;
        } else if (!stop) {
          setLoaded(true);
        }
      } catch { if (!stop) setLoaded(true); }
      // Solo tiene sentido esperar la confirmación cuando el pago fue aprobado o
      // quedó en revisión; en un fallo no hay nada que pollear.
      if (!stop && ret.status !== 'failure' && polls < MAX_POLLS) {
        polls += 1;
        timer = setTimeout(tick, 5000);
      }
    };
    tick();
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [ret, slug]);

  if (!ret) return null;

  const paid = order?.paymentStatus === 'PAID';
  const folio = order?.orderNumber != null ? String(order.orderNumber) : null;

  // ── Fallo: el pago no se completó ──────────────────────────────────────────
  if (ret.status === 'failure' && !paid) {
    return (
      <Overlay>
        <div className="text-6xl mb-3">😕</div>
        <h2 className="text-2xl font-black mb-1">El pago no se completó</h2>
        {folio && <p className="text-gray-500 mb-2 font-bold">Orden #{folio}</p>}
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Tu pedido quedó registrado pero el pago no se realizó. Puedes intentarlo de nuevo o
          pagar directamente en la tienda.
        </p>
        <CloseButton primary={primary} onClose={() => setRet(null)} label="Entendido" />
      </Overlay>
    );
  }

  // ── Pendiente: pago en revisión de la pasarela ─────────────────────────────
  if (ret.status === 'pending' && !paid) {
    return (
      <Overlay>
        <div className="text-6xl mb-3">⏳</div>
        <h2 className="text-2xl font-black mb-1">Tu pago está en revisión</h2>
        {folio && <p className="text-gray-500 mb-2 font-bold">Orden #{folio}</p>}
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Estamos confirmando tu pago con la pasarela. En cuanto se apruebe, tu pedido entra a
          preparación. Puedes cerrar esta ventana.
        </p>
        <CloseButton primary={primary} onClose={() => setRet(null)} label="Cerrar" />
      </Overlay>
    );
  }

  // ── Éxito (aprobado o esperando la confirmación del webhook) ───────────────
  const st = STATUS_LABEL[order?.status || 'PENDING'] || STATUS_LABEL.PENDING;
  return (
    <Overlay>
      <div className="text-6xl mb-3">🎉</div>
      <h2 className="text-2xl font-black mb-1">{paid ? '¡Pago confirmado!' : '¡Pedido recibido!'}</h2>
      {folio && <p className="text-gray-500 mb-4 font-bold">Orden #{folio}</p>}
      {!folio && <div className="mb-4" />}

      <div className="rounded-2xl p-4 mb-3" style={{ background: `${st.c}14` }}>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Estado</p>
        <p className="text-lg font-black flex items-center justify-center gap-2" style={{ color: st.c }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: st.c }} />{st.t}
        </p>
      </div>

      {/* Mientras el webhook marca PAID mostramos el pago como "confirmándose",
          sin bloquear: el pedido ya está registrado. */}
      <p className="text-xs font-bold mb-2" style={{ color: paid ? '#10b981' : '#f59e0b' }}>
        {paid ? '✓ Pago confirmado' : '⏳ Confirmando tu pago…'}
      </p>

      {typeof order?.total === 'number' && (
        <p className="text-sm text-gray-500 mb-1 font-bold">Total: {fmtMoney(order.total)}</p>
      )}
      {!loaded && <p className="text-xs text-gray-400 mb-1">Cargando tu pedido…</p>}
      <p className="text-xs text-gray-400 mb-5">El estado se actualiza automáticamente.</p>

      <CloseButton primary={primary} onClose={() => setRet(null)} label="Listo" />
    </Overlay>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-[32px] shadow-2xl max-w-sm w-full text-center">
        {children}
      </div>
    </div>
  );
}

function CloseButton({ primary, onClose, label }: { primary: string; onClose: () => void; label: string }) {
  return (
    <button
      onClick={onClose}
      className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-white"
      style={{ background: primary }}
    >
      {label}
    </button>
  );
}
