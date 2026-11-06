'use client';

import { useState } from 'react';
import {
  ArrowRight, Bell, Bike, CheckCircle2, ChevronRight, CircleDollarSign,
  ClipboardList, Clock3, Headphones, LogOut, Map, MapPin, Navigation, Package,
  RadioTower, ShieldCheck, Wallet, Wifi, WifiOff,
} from 'lucide-react';
import { MarketplaceOffers } from '../MarketplaceOffers';
import { MultiStopPanel } from '../MultiStopPanel';
import { isNetworkOrder } from '@/lib/storeDeliveryPin';

type DeliveryOrder = {
  id: string; orderNumber: string; customerName: string;
  deliveryAddress: string; status: string; total: number;
  source?: string; taskId?: string; restaurantName?: string;
  deliveryFee?: number; notes?: string;
  // Pedido del marketplace que entrega la tienda con sus repartidores (flujo propio con código).
  deliveredByStore?: boolean;
};
type Driver = { id: string; name: string };
interface Props {
  driver: Driver | null;
  orders: DeliveryOrder[];
  availableOrders?: DeliveryOrder[];
  claimingId?: string | null;
  onClaimOrder?: (order: DeliveryOrder) => void;
  isOnline: boolean; // Estado de Internet, NO estado de recepción de ofertas.
  pendingSync?: number;
  unreadNotices?: number;
  onSelectOrder: (order: DeliveryOrder) => void;
  onChat: (order: DeliveryOrder) => void;
  onDeliverOrder: (order: DeliveryOrder) => void;
  onNavigate: (screen: string) => void;
  isSharedCourier?: boolean;
  networkBusy?: boolean;
  networkError?: string;
  onToggleShared?: (enabled: boolean) => void | Promise<void>;
  onMarketplaceOfferAccepted?: (result: { taskId: string; orderId?: string }) => void;
}

// Colores de estado — paleta clara de la guía (Mercadito Colorines).
const STATUS: Record<string, { text: string; color: string }> = {
  PENDING: { text: 'Pendiente', color: '#b45309' },
  CONFIRMED: { text: 'Confirmado', color: '#1d4ed8' },
  PREPARING: { text: 'Preparando', color: '#b45309' },
  READY: { text: 'Listo para recoger', color: '#1d4ed8' },
  ON_THE_WAY: { text: 'En camino', color: '#c6410c' },
  DELIVERED: { text: 'Entregado', color: '#14743b' },
};
const money = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c6410c]';

function OrderCard({ order, onSelectOrder, onChat, onDeliverOrder }: Pick<Props, 'onSelectOrder' | 'onChat' | 'onDeliverOrder'> & { order: DeliveryOrder }) {
  const status = STATUS[order.status] || { text: order.status || 'Sin estado', color: '#8a9a90' };
  const onTheWay = order.status === 'ON_THE_WAY';
  const ready = order.status === 'READY';
  const isMarketplace = isNetworkOrder(order);
  return <article className="relative overflow-hidden rounded-[24px] border border-[#d6e2da] bg-white p-4 shadow-[0_14px_30px_rgba(23,42,42,.06)]">
    <div className="absolute inset-y-0 left-0 w-1 bg-[#c6410c]" aria-hidden="true"/>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#c6410c]">
          <Package size={13}/> Pedido #{order.orderNumber}
        </p>
        <h3 className="mt-2 text-lg font-extrabold text-[#172a2a]">{order.customerName || 'Cliente'}</h3>
        {isMarketplace && <p className="mt-1 text-xs font-bold text-[#1d4ed8]">Red Marketplace</p>}
        {order.deliveredByStore && <p className="mt-1 text-xs font-bold text-[#1d4ed8]">Marketplace · pide el código al cliente</p>}
      </div>
      <span className="rounded-lg px-2.5 py-1.5 text-xs font-black"
        style={{ color: status.color, background: status.color + '18' }}>
        {status.text}
      </span>
    </div>
    <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[#f2f5f3] p-3 text-sm text-[#52665b]">
      <MapPin size={17} className="mt-0.5 shrink-0 text-[#c6410c]"/>
      <span className="line-clamp-2">{order.deliveryAddress || 'Dirección pendiente de confirmar'}</span>
    </div>
    <div className="mt-3 flex items-center justify-between text-xs text-[#8a9a90]">
      <span>Total del pedido (no ganancia)</span>
      <span className="font-extrabold text-[#172a2a]">{money(Number(order.total) || 0)}</span>
    </div>
    <div className="mt-4 flex gap-2">
      <button type="button" onClick={() => onSelectOrder(order)}
        className={'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#c6410c] px-3 text-sm font-black text-white ' + focus}>
        {ready ? 'Recoger' : onTheWay ? 'Ver ruta' : 'Ver detalles'} <ArrowRight size={16}/>
      </button>
      {onTheWay && !isMarketplace && <button type="button" onClick={() => onDeliverOrder(order)}
        className={'min-h-12 rounded-xl border border-[#14743b]/25 bg-[#e8f4ec] px-3 text-xs font-bold text-[#14743b] ' + focus}>Entregar</button>}
      <button type="button" onClick={() => onChat(order)} aria-label={'Chat de pedido ' + order.orderNumber}
        className={'flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-[#d6e2da] bg-white text-[#52665b] ' + focus}>
        <Headphones size={19}/>
      </button>
    </div>
  </article>;
}

export function CourierDashboard({
  driver, orders, availableOrders = [], claimingId = null, onClaimOrder,
  isOnline, pendingSync = 0, unreadNotices = 0,
  onSelectOrder, onChat, onDeliverOrder, onNavigate,
  isSharedCourier = false, networkBusy = false, networkError, onToggleShared, onMarketplaceOfferAccepted,
}: Props) {
  const [tab, setTab] = useState<'route' | 'offers'>('route');
  const firstName = driver?.name?.trim().split(/\s+/)[0] || 'Repartidor';
  const active = orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
  const onTheWay = active.filter(o => o.status === 'ON_THE_WAY').length;
  const waiting = active.length - onTheWay;
  const statusText = !isOnline ? 'Sin Internet' : isSharedCourier ? 'Red compartida activa' : 'Conexión disponible';

  return <div className="min-h-screen bg-[#f7f9f8] pb-[calc(104px+env(safe-area-inset-bottom))] font-sans text-[#172a2a]">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_75%_0%,rgba(250,90,32,.10),transparent_60%)]" aria-hidden="true"/>
    <header className="relative mx-auto max-w-5xl px-4 pb-5 pt-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#c6410c] text-white shadow-[0_10px_25px_rgba(198,65,12,.22)]">
            <Bike size={26} strokeWidth={2.5}/>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#c6410c]">MRTPVREST · REPARTIDORES</p>
            <p className="mt-0.5 text-[15px] font-bold text-[#172a2a]">Hola, {firstName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onNavigate('avisos')}
            className={'relative grid h-11 w-11 place-items-center rounded-2xl border border-[#d6e2da] bg-white text-[#52665b] ' + focus}
            aria-label={'Avisos' + (unreadNotices ? ', ' + unreadNotices + ' sin leer' : '')}>
            <Bell size={20}/>
            {unreadNotices > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#c6410c] px-1 text-[10px] font-black text-white">{Math.min(9, unreadNotices)}{unreadNotices > 9 ? '+' : ''}</span>}
          </button>
          <button type="button" onClick={() => onNavigate('login')} aria-label="Cerrar sesión"
            className={'grid h-11 w-11 place-items-center rounded-2xl border border-[#b42318]/20 bg-[#fbecec] text-[#b42318] ' + focus}>
            <LogOut size={19}/>
          </button>
        </div>
      </div>
      <div className="mt-6 rounded-[28px] border border-[#d6e2da] bg-white p-5 shadow-[0_20px_55px_rgba(23,42,42,.08)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-[#c6410c]">Tu centro de entregas</p>
            <h1 className="mt-2 max-w-sm text-[27px] font-black leading-tight tracking-tight sm:text-3xl">Tu siguiente entrega empieza aquí.</h1>
          </div>
          <span className={'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-extrabold ' +
            (!isOnline ? 'bg-[#fbecec] text-[#b42318]' : isSharedCourier ? 'bg-[#e8f4ec] text-[#14743b]' : 'bg-[#eaefec] text-[#52665b]')}>
            {isOnline ? <Wifi size={14}/> : <WifiOff size={14}/>} {statusText}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[#d6e2da] pt-4">
          {[
            { label: 'En camino', value: onTheWay, icon: Navigation },
            { label: 'Por recoger', value: waiting, icon: Package },
            { label: 'Disponibles', value: availableOrders.length, icon: Clock3 },
          ].map(stat => <div key={stat.label} className="rounded-2xl bg-[#f2f5f3] p-3 text-center">
            <stat.icon className="mx-auto mb-1.5 text-[#c6410c]" size={18}/>
            <p className="text-2xl font-black text-[#172a2a]">{stat.value}</p>
            <p className="mt-1 text-[10px] font-semibold text-[#8a9a90]">{stat.label}</p>
          </div>)}
        </div>
      </div>
      {!isOnline && <p role="alert" className="mt-3 flex items-center gap-2 rounded-xl border border-[#b42318]/25 bg-[#fbecec] px-4 py-3 text-xs font-bold text-[#b42318]">
        <WifiOff size={15}/> Estás sin Internet. Las nuevas asignaciones requieren conexión.
      </p>}
      {pendingSync > 0 && <p role="status" className="mt-3 rounded-xl border border-[#b45309]/25 bg-[#fbf0e0] px-4 py-3 text-xs font-semibold text-[#b45309]">
        {pendingSync} acción{pendingSync === 1 ? '' : 'es'} pendiente{pendingSync === 1 ? '' : 's'} de sincronizar. Una acción pendiente no equivale a una entrega confirmada.
      </p>}
      {networkError && <p role="alert" className="mt-3 rounded-xl border border-[#b42318]/25 bg-[#fbecec] px-4 py-3 text-xs font-bold text-[#b42318]">{networkError}</p>}
    </header>

    <main className="relative mx-auto max-w-5xl space-y-5 px-4 pb-5 sm:px-6">
      <nav aria-label="Trabajo del repartidor" className="grid grid-cols-2 gap-2 rounded-[20px] border border-[#d6e2da] bg-white p-1.5">
        <button type="button" onClick={() => setTab('route')} aria-pressed={tab === 'route'}
          className={'flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-extrabold ' + focus + ' ' +
            (tab === 'route' ? 'bg-[#c6410c] text-white' : 'text-[#52665b] hover:bg-[#f2f5f3]')}>
          <Navigation size={17}/> Mi ruta
          {active.length > 0 && <span className={'rounded-lg px-1.5 py-0.5 text-[10px] ' +
            (tab === 'route' ? 'bg-white/25' : 'bg-[#eaefec]')}>{active.length}</span>}
        </button>
        <button type="button" onClick={() => setTab('offers')} aria-pressed={tab === 'offers'}
          className={'flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-extrabold ' + focus + ' ' +
            (tab === 'offers' ? 'bg-[#c6410c] text-white' : 'text-[#52665b] hover:bg-[#f2f5f3]')}>
          <RadioTower size={17}/> Marketplace
        </button>
      </nav>

      {tab === 'route' ? <>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#c6410c]">Mi operación</p>
            <h2 className="mt-1 text-xl font-black">Entregas de hoy</h2>
          </div>
          <button type="button" onClick={() => onNavigate('map')}
            className={'inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d6e2da] bg-white px-3 text-xs font-bold text-[#52665b] ' + focus}>
            <Map size={16}/> Ver mapa
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {active.map(order => <OrderCard key={order.id} order={order}
            onSelectOrder={onSelectOrder} onChat={onChat} onDeliverOrder={onDeliverOrder}/>)}
        </div>
        {active.length === 0 && <div className="rounded-[24px] border border-dashed border-[#d6e2da] bg-white p-8 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-[#fdeee6] text-[#c6410c]"><CheckCircle2 size={29}/></div>
          <h3 className="text-base font-bold">Sin entregas asignadas</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[#52665b]">Cuando te asignen una entrega de tu negocio aparecerá aquí. Puedes revisar las ofertas compartidas en Marketplace.</p>
          <button type="button" onClick={() => setTab('offers')}
            className={'mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#c6410c] px-4 font-bold text-white ' + focus}>
            Explorar Marketplace <ChevronRight size={16}/>
          </button>
        </div>}

        {availableOrders.length > 0 && <section aria-label="Pedidos disponibles de mi comercio" className="space-y-3 pt-3">
          <h2 className="text-lg font-extrabold">Disponibles en mi tienda</h2>
          <p className="text-xs text-[#52665b]">Pedidos sin repartidor asignado en tu sucursal.</p>
          <div className="grid gap-3 md:grid-cols-2">{availableOrders.map(order => <div key={order.id}
            className="rounded-[20px] border border-[#14743b]/20 bg-[#e8f4ec] p-4">
            <p className="text-sm font-extrabold text-[#14743b]">#{order.orderNumber} · {order.customerName || 'Cliente'}</p>
            <div className="mt-2 flex items-start gap-2 text-xs text-[#52665b]"><MapPin size={15}/>{order.deliveryAddress || 'Dirección pendiente'}</div>
            <p className="mt-2 text-xs text-[#8a9a90]">Total de venta: {money(Number(order.total) || 0)}</p>
            <button type="button" disabled={!onClaimOrder || claimingId === order.id || !isOnline}
              onClick={() => onClaimOrder?.(order)}
              className={'mt-3 min-h-11 w-full rounded-xl bg-[#14743b] text-sm font-black text-white disabled:opacity-40 ' + focus}>
              {claimingId === order.id ? 'Asignando…' : 'Tomar pedido'}
            </button>
          </div>)}</div>
        </section>}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" onClick={() => onNavigate('weekly')} className={'flex items-center gap-3 rounded-[20px] border border-[#d6e2da] bg-white p-4 text-left ' + focus}>
            <ClipboardList size={21} className="text-[#c6410c]"/><span className="text-sm font-bold">Mi desempeño</span><ChevronRight size={15} className="ml-auto text-[#8a9a90]"/>
          </button>
          <button type="button" onClick={() => onNavigate('caja')} className={'flex items-center gap-3 rounded-[20px] border border-[#d6e2da] bg-white p-4 text-left ' + focus}>
            <Wallet size={21} className="text-[#14743b]"/><span className="text-sm font-bold">Mi caja</span><ChevronRight size={15} className="ml-auto text-[#8a9a90]"/>
          </button>
        </div>
      </> : <div className="space-y-5">
        <MultiStopPanel courierId={driver?.id || ''} isOnline={isOnline}/>
        <MarketplaceOffers
          courierId={driver?.id || ''} isSharedCourier={isSharedCourier} isOnline={isOnline}
          busy={networkBusy} onToggleShared={onToggleShared}
          onOfferAccepted={result => onMarketplaceOfferAccepted?.(result)}/>
      </div>}

      <div className="flex items-center justify-center gap-2 pt-3 text-center text-[11px] text-[#8a9a90]">
        <ShieldCheck size={14} /> El servidor valida cada aceptación y confirmación de entrega.
      </div>
    </main>

    <nav aria-label="Navegación del repartidor" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d6e2da] bg-white/95 px-3 pt-2 shadow-[0_-12px_35px_rgba(23,42,42,.08)] backdrop-blur-xl"
      style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
        {[
          { label: 'Inicio', icon: Bike, action: () => setTab('route'), active: tab === 'route' },
          { label: 'Ofertas', icon: RadioTower, action: () => setTab('offers'), active: tab === 'offers' },
          { label: 'Mapa', icon: Map, action: () => onNavigate('map'), active: false },
          { label: 'Caja', icon: CircleDollarSign, action: () => onNavigate('caja'), active: false },
        ].map(item => <button type="button" key={item.label} onClick={item.action}
          aria-current={item.active ? 'page' : undefined}
          className={'flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold transition ' + focus + ' ' +
            (item.active ? 'bg-[#fdeee6] text-[#c6410c]' : 'text-[#8a9a90] hover:text-[#172a2a]')}>
          <item.icon size={21} strokeWidth={item.active ? 2.6 : 1.9}/>
          {item.label}
        </button>)}
      </div>
    </nav>
  </div>;
}
