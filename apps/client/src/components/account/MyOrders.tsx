'use client';

// Mis pedidos: los pedidos de la cuenta en todas las tiendas del marketplace, del más
// reciente al más viejo. Un pedido activo se sigue en vivo y muestra su código para
// recoger o recibir (se pide al abrirlo y solo vive en memoria).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bike, ChevronRight, ShoppingBag, Store } from 'lucide-react';
import { getMarketplaceApiUrl } from '@/lib/config';
import { fetchCurrentAccount } from '@/lib/marketplaceAccount';
import {
  fetchOrderCodes, FINAL_ORDER_STATUSES, listMyOrders, ORDER_STATUS_LABEL, type BuyerOrder,
} from '@/lib/marketplaceOrders';
import MarketplaceTrackingModal from '@/components/MarketplaceTrackingModal';
import { AccountShell, Notice, secondaryButton, textLink } from './AccountUi';

const ACCENT = '#f15a24';
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

export default function MyOrders() {
  const router = useRouter();
  const apiUrl = getMarketplaceApiUrl();
  const [orders, setOrders] = useState<BuyerOrder[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
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
            {active && <button type="button" onClick={() => follow(order)} disabled={opening === order.orderId}
              className={secondaryButton + ' gap-1'}>
              <Bike className="h-4 w-4" aria-hidden="true" /> {opening === order.orderId ? 'Abriendo…' : 'Seguir pedido'} <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>}
          </div>
        </li>;
      })}
    </ul>}
    {nextBefore && <button type="button" onClick={more} disabled={loadingMore} className={secondaryButton + ' mt-4 w-full'}>
      {loadingMore ? 'Cargando…' : 'Ver pedidos anteriores'}
    </button>}
    {tracked && <MarketplaceTrackingModal orderId={tracked.order.orderId} orderNumber={tracked.order.orderNumber ?? undefined}
      fulfillment={tracked.order.fulfillment} pickupPin={tracked.pickupPin} deliveryPin={tracked.deliveryPin}
      apiUrl={apiUrl} primary={ACCENT} onClose={() => { setTracked(null); load(); }} />}
  </AccountShell>;
}
