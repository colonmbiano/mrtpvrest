'use client';

// Mis pedidos: los pedidos de la cuenta en todas las tiendas del marketplace, del más
// reciente al más viejo. Un pedido activo se sigue en vivo y muestra su código para
// recoger o recibir (se pide al abrirlo y solo vive en memoria). "Volver a pedir"
// abre la tienda con el carrito del enlace compartible (?cart=), que se re-precia
// contra el menú vigente y deja fuera lo que ya no existe.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bike, ChevronRight, RotateCcw, ShoppingBag, Store } from 'lucide-react';
import { getMarketplaceApiUrl } from '@/lib/config';
import { cartShareUrl } from '@/lib/cartLink';
import type { CartLine } from '@/lib/cartStore';
import { fetchCurrentAccount } from '@/lib/marketplaceAccount';
import {
  cancelMyOrder, canCancelOrder, storeWhatsAppUrl, fetchOrderCodes, FINAL_ORDER_STATUSES, listMyOrders, ORDER_STATUS_LABEL, type BuyerOrder,
} from '@/lib/marketplaceOrders';
import MarketplaceTrackingModal from '@/components/MarketplaceTrackingModal';
import { AccountShell, Notice, secondaryButton, textLink } from './AccountUi';

const ACCENT = '#c6410c';
const PAGE = 10;

function money(total: string, currency: string): string {
  const value = Number(total);
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(value); } catch { return `$${total}`; }
}
function when(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date)
    : '';
}
function summary(order: BuyerOrder): string {
  const shown = order.items.slice(0, 3).map(it => `${it.quantity}× ${it.name}`).join(', ');
  return order.items.length > 3 ? `${shown} y ${order.items.length - 3} más` : shown;
}

type Tracked = { order: BuyerOrder; pickupPin: string | null; deliveryPin: string | null };

// Enlace a la tienda con los mismos productos y cantidades. Solo ids: el precio y la
// disponibilidad salen del menú vigente al abrirla.
function reorderUrl(order: BuyerOrder): string | null {
  if (!order.merchant.slug || order.items.length === 0) return null;
  const lines: CartLine[] = order.items.map(it => ({ id: it.menuItemId, menuItemId: it.menuItemId, name: it.name, price: 0, quantity: it.quantity }));
  return cartShareUrl(order.merchant.slug, lines);
}

export default function MyOrders() {
  const router = useRouter();
  const apiUrl = getMarketplaceApiUrl();
  const [orders, setOrders] = useState<BuyerOrder[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [tracked, setTracked] = useState<Tracked | null>(null);

  const load = useCallback(async () => {
    setError('');
    const result = await listMyOrders({ apiUrl, limit: PAGE });
    if (!('ok' in result)) { setOrders(result.orders); setNextBefore(result.nextBefore); return; }
    // Sin sesión: a entrar y volver aquí.
    if (result.reason === 'rejected' && await fetchCurrentAccount() === null) {
      router.replace('/cuenta/entrar?next=/cuenta/pedidos');
      return;
    }
    setError(result.message);
  }, [apiUrl, router]);

  useEffect(() => { load(); }, [load]);

  const more = async () => {
    if (!nextBefore) return;
    setLoadingMore(true);
    const result = await listMyOrders({ apiUrl, limit: PAGE, before: nextBefore });
    setLoadingMore(false);
    if ('ok' in result) { setError(result.message); return; }
    setOrders(old => [...(old ?? []), ...result.orders]);
    setNextBefore(result.nextBefore);
  };

  const cancel = async (orderId: string) => {
    if (cancelling) return;
    setCancelling(orderId);
    const result = await cancelMyOrder(orderId, { apiUrl });
    setCancelling(null);
    if ('ok' in result) { setError(result.message); return; }
    setCancelTarget(null);
    await load();
  };

  const follow = async (order: BuyerOrder) => {
    setOpening(order.orderId);
    // Sin códigos (p. ej. la tienda ya lo entregó o la clave no está) el seguimiento sigue funcionando.
    const codes = await fetchOrderCodes(order.orderId, { apiUrl });
    setOpening(null);
    setTracked({ order, pickupPin: 'ok' in codes ? null : codes.pickupPin, deliveryPin: 'ok' in codes ? null : codes.deliveryPin });
  };

  return <AccountShell title="Mis pedidos" subtitle={<>Tus pedidos en todas las tiendas. <Link href="/cuenta" className={textLink}>Volver a mi cuenta</Link></>}>
    {error && <div className="mb-4"><Notice tone="error">{error}</Notice>
      <button type="button" onClick={load} className={secondaryButton + ' mt-3'}>Reintentar</button></div>}
    {!orders && !error && <p role="status" className="text-sm text-[#617567]">Cargando tus pedidos…</p>}
    {orders && orders.length === 0 && <div className="text-center">
      <ShoppingBag className="mx-auto h-10 w-10 text-[#4c9268]" aria-hidden="true" />
      <p className="mt-3 text-sm leading-relaxed text-[#617567]">Aún no tienes pedidos con esta cuenta.</p>
      <Link href="/" className={textLink + ' mt-2 inline-block text-sm'}>Ver tiendas</Link>
    </div>}
    {orders && orders.length > 0 && <ul className="space-y-3">
      {orders.map(order => {
        const active = !FINAL_ORDER_STATUSES.has(order.status);
        return <li key={order.orderId} className="rounded-2xl border border-[#e4ebe5] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm font-extrabold text-[#23362b]">
                <Store className="h-4 w-4 shrink-0 text-[#e65b27]" aria-hidden="true" />
                {order.merchant.slug ? <Link href={`/${encodeURIComponent(order.merchant.slug)}`} className={textLink + ' no-underline'}>{order.merchant.name || 'Tienda'}</Link> : (order.merchant.name || 'Tienda')}
              </p>
              <p className="mt-0.5 text-xs text-[#697b6d]">
                {order.orderNumber ? `Pedido #${order.orderNumber} · ` : ''}{when(order.placedAt)}
                {order.fulfillment && <> · {order.fulfillment === 'DELIVERY' ? 'A domicilio' : 'Recoger en tienda'}</>}
              </p>
            </div>
            <p className="shrink-0 text-sm font-extrabold text-[#23362b]">{money(order.total, order.currency)}</p>
          </div>
          {order.items.length > 0 && <p className="mt-2 text-sm text-[#4b5f52]">{summary(order)}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className={'rounded-full px-2.5 py-1 text-xs font-bold ' + (active ? 'bg-[#fff1e6] text-[#b2431a]' : 'bg-[#eef3ef] text-[#4b5f52]')}>
              {ORDER_STATUS_LABEL[order.status] ?? 'En proceso'}
            </span>
            <span className="flex flex-wrap gap-2">
              {active && <button type="button" onClick={() => follow(order)} disabled={opening === order.orderId}
                className={secondaryButton + ' gap-1'}>
                <Bike className="h-4 w-4" aria-hidden="true" /> {opening === order.orderId ? 'Abriendo…' : 'Seguir pedido'} <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>}
              {canCancelOrder(order.status) && <button type="button" className={secondaryButton}
                disabled={cancelling !== null} onClick={() => setCancelTarget(order.orderId)}>Cancelar pedido</button>}
              {storeWhatsAppUrl(order.merchant.phone) && <a href={storeWhatsAppUrl(order.merchant.phone)!}
                target="_blank" rel="noopener noreferrer" className={secondaryButton}>WhatsApp de la tienda</a>}
              {/* Documento completo: la tienda arma el carrito al cargar (CartDeepLinkLoader). */}
              {!active && reorderUrl(order) && <a href={reorderUrl(order)!} className={secondaryButton + ' gap-1'}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Volver a pedir
              </a>}
            </span>
          </div>
          {cancelTarget === order.orderId && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">
            <p>¿Quieres cancelar este pedido?</p>
            <button type="button" disabled={cancelling !== null} onClick={() => cancel(order.orderId)} className={secondaryButton + ' mt-2 mr-2'}>Confirmar cancelación</button>
            <button type="button" disabled={cancelling !== null} onClick={() => setCancelTarget(null)} className={secondaryButton}>Volver</button>
          </div>}
        </li>;
      })}
    </ul>}
    {nextBefore && <button type="button" onClick={more} disabled={loadingMore} className={secondaryButton + ' mt-4 w-full'}>
      {loadingMore ? 'Cargando…' : 'Ver pedidos anteriores'}
    </button>}
    {tracked && <MarketplaceTrackingModal orderId={tracked.order.orderId} orderNumber={tracked.order.orderNumber ?? undefined}
      fulfillment={tracked.order.fulfillment} pickupPin={tracked.pickupPin} deliveryPin={tracked.deliveryPin}
      merchantPhone={tracked.order.merchant.phone} apiUrl={apiUrl} primary={ACCENT} onClose={() => { setTracked(null); load(); }} />}
  </AccountShell>;
}
