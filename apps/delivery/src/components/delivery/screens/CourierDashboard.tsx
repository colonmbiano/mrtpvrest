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

const STATUS: Record<string, { text: string; color: string }> = {
  PENDING: { text: 'Pendiente', color: '#f8bf66' },
  CONFIRMED: { text: 'Confirmado', color: '#a78bfa' },
  PREPARING: { text: 'Preparando', color: '#f8bf66' },
  READY: { text: 'Listo para recoger', color: '#a78bfa' },
  ON_THE_WAY: { text: 'En camino', color: '#8cdda1' },
  DELIVERED: { text: 'Entregado', color: '#8cdda1' },
};
const money = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300';

function OrderCard({ order, onSelectOrder, onChat, onDeliverOrder }: Pick<Props, 'onSelectOrder' | 'onChat' | 'onDeliverOrder'> & { order: DeliveryOrder }) {
  const status = STATUS[order.status] || { text: order.status || 'Sin estado', color: '#bdc2ce' };
  const onTheWay = order.status === 'ON_THE_WAY';
  const ready = order.status === 'READY';
  const isMarketplace = isNetworkOrder(order);
  return <article className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#1a1b20] p-4 shadow-[0_14px_30px_rgba(0,0,0,.12)]">
    <div className="absolute inset-y-0 left-0 w-1 bg-amber-400" aria-hidden="true"/>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-amber-300">
          <Package size={13}/> Pedido #{order.orderNumber}
        </p>
        <h3 className="mt-2 text-lg font-extrabold text-white">{order.customerName || 'Cliente'}</h3>
        {isMarketplace && <p className="mt-1 text-xs font-bold text-sky-300">Red Marketplace</p>}
        {order.deliveredByStore && <p className="mt-1 text-xs font-bold text-sky-300">Marketplace · pide el código al cliente</p>}
      </div>
      <span className="rounded-lg px-2.5 py-1.5 text-xs font-black"
        style={{ color: status.color, background: status.color + '18' }}>
        {status.text}
      </span>
    </div>
    <div className="mt-3 flex items-start gap-2 rounded-2xl bg-white/[.035] p-3 text-sm text-white/65">
      <MapPin size={17} className="mt-0.5 shrink-0 text-amber-300"/>
      <span className="line-clamp-2">{order.deliveryAddress || 'Dirección pendiente de confirmar'}</span>
    </div>
    <div className="mt-3 flex items-center justify-between text-xs text-white/45">
      <span>Total del pedido (no ganancia)</span>
      <span className="font-extrabold text-white/80">{money(Number(order.total) || 0)}</span>
    </div>
    <div className="mt-4 flex gap-2">
      <button type="button" onClick={() => onSelectOrder(order)}
        className={'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 text-sm font-black text-[#181714] ' + focus}>
        {ready ? 'Recoger' : onTheWay ? 'Ver ruta' : 'Ver detalles'} <ArrowRight size={16}/>
      </button>
      {onTheWay && !isMarketplace && <button type="button" onClick={() => onDeliverOrder(order)}
        className={'min-h-12 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 text-xs font-bold text-emerald-300 ' + focus}>Entregar</button>}
      <button type="button" onClick={() => onChat(order)} aria-label={'Chat de pedido ' + order.orderNumber}
        className={'flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 ' + focus}>
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

  return <div className="min-h-screen bg-[#0e0f13] pb-[calc(104px+env(safe-area-inset-bottom))] font-sans text-white">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_75%_0%,rgba(244,176,71,.13),transparent_60%)]" aria-hidden="true"/>
    <header className="relative mx-auto max-w-5xl px-4 pb-5 pt-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400 text-[#171513] shadow-[0_10px_25px_rgba(255,184,77,.22)]">
            <Bike size={26} strokeWidth={2.5}/>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-300">MRTPVREST · REPARTIDORES</p>
            <p className="mt-0.5 text-[15px] font-bold text-white/85">Hola, {firstName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onNavigate('avisos')}
            className={'relative grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white/75 ' + focus}
            aria-label={'Avisos' + (unreadNotices ? ', ' + unreadNotices + ' sin leer' : '')}>
            <Bell size={20}/>
            {unreadNotices > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[10px] font-black text-white">{Math.min(9, unreadNotices)}{unreadNotices > 9 ? '+' : ''}</span>}
          </button>
          <button type="button" onClick={() => onNavigate('login')} aria-label="Cerrar sesión"
            className={'grid h-11 w-11 place-items-center rounded-2xl border border-rose-400/15 bg-rose-500/10 text-rose-300 ' + focus}>
            <LogOut size={19}/>
          </button>
        </div>
      </div>
      <div className="mt-6 rounded-[28px] border border-amber-400/15 bg-gradient-to-br from-[#272119] via-[#1c1d20] to-[#17181c] p-5 shadow-[0_20px_55px_rgba(0,0,0,.2)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-amber-300">Tu centro de entregas</p>
            <h1 className="mt-2 max-w-sm text-[27px] font-black leading-tight tracking-tight sm:text-3xl">Tu siguiente entrega empieza aquí.</h1>
          </div>
          <span className={'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-extrabold ' +
            (!isOnline ? 'bg-rose-400/10 text-rose-300' : isSharedCourier ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/10 text-white/75')}>
            {isOnline ? <Wifi size={14}/> : <WifiOff size={14}/>} {statusText}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
          {[
            { label: 'En camino', value: onTheWay, icon: Navigation },
            { label: 'Por recoger', value: waiting, icon: Package },
            { label: 'Disponibles', value: availableOrders.length, icon: Clock3 },
          ].map(stat => <div key={stat.label} className="rounded-2xl bg-white/[.035] p-3 text-center">
            <stat.icon className="mx-auto mb-1.5 text-amber-300" size={18}/>
            <p className="text-2xl font-black text-white">{stat.value}</p>
            <p className="mt-1 text-[10px] font-semibold text-white/50">{stat.label}</p>
          </div>)}
        </div>
      </div>
      {!isOnline && <p role="alert" className="mt-3 flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-200">
        <WifiOff size={15}/> Estás sin Internet. Las nuevas asignaciones requieren conexión.
      </p>}
      {pendingSync > 0 && <p role="status" className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs font-semibold text-amber-200">
        {pendingSync} acción{pendingSync === 1 ? '' : 'es'} pendiente{pendingSync === 1 ? '' : 's'} de sincronizar. Una acción pendiente no equivale a una entrega confirmada.
      </p>}
      {networkError && <p role="alert" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-200">{networkError}</p>}
    </header>

    <main className="relative mx-auto max-w-5xl space-y-5 px-4 pb-5 sm:px-6">
      <nav aria-label="Trabajo del repartidor" className="grid grid-cols-2 gap-2 rounded-[20px] border border-white/10 bg-[#191a1f] p-1.5">
        <button type="button" onClick={() => setTab('route')} aria-pressed={tab === 'route'}
          className={'flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-extrabold ' + focus + ' ' +
            (tab === 'route' ? 'bg-amber-400 text-[#191611]' : 'text-white/60 hover:bg-white/5')}>
          <Navigation size={17}/> Mi ruta
          {active.length > 0 && <span className={'rounded-lg px-1.5 py-0.5 text-[10px] ' +
            (tab === 'route' ? 'bg-black/10' : 'bg-white/10')}>{active.length}</span>}
        </button>
        <button type="button" onClick={() => setTab('offers')} aria-pressed={tab === 'offers'}
          className={'flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-extrabold ' + focus + ' ' +
            (tab === 'offers' ? 'bg-amber-400 text-[#191611]' : 'text-white/60 hover:bg-white/5')}>
          <RadioTower size={17}/> Marketplace
        </button>
      </nav>

      {tab === 'route' ? <>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-300">Mi operación</p>
            <h2 className="mt-1 text-xl font-black">Entregas de hoy</h2>
          </div>
          <button type="button" onClick={() => onNavigate('map')}
            className={'inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-white/70 ' + focus}>
            <Map size={16}/> Ver mapa
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {active.map(order => <OrderCard key={order.id} order={order}
            onSelectOrder={onSelectOrder} onChat={onChat} onDeliverOrder={onDeliverOrder}/>)}
        </div>
        {active.length === 0 && <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[.025] p-8 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-amber-400/10 text-amber-300"><CheckCircle2 size={29}/></div>
          <h3 className="text-base font-bold">Sin entregas asignadas</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/50">Cuando te asignen una entrega de tu negocio aparecerá aquí. Puedes revisar las ofertas compartidas en Marketplace.</p>
          <button type="button" onClick={() => setTab('offers')}
            className={'mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-4 font-bold text-[#1a1711] ' + focus}>
            Explorar Marketplace <ChevronRight size={16}/>
          </button>
        </div>}

        {availableOrders.length > 0 && <section aria-label="Pedidos disponibles de mi comercio" className="space-y-3 pt-3">
          <h2 className="text-lg font-extrabold">Disponibles en mi tienda</h2>
          <p className="text-xs text-white/50">Pedidos sin repartidor asignado en tu sucursal.</p>
          <div className="grid gap-3 md:grid-cols-2">{availableOrders.map(order => <div key={order.id}
            className="rounded-[20px] border border-emerald-400/20 bg-[#191e1d] p-4">
            <p className="text-sm font-extrabold text-emerald-300">#{order.orderNumber} · {order.customerName || 'Cliente'}</p>
            <div className="mt-2 flex items-start gap-2 text-xs text-white/60"><MapPin size={15}/>{order.deliveryAddress || 'Dirección pendiente'}</div>
            <p className="mt-2 text-xs text-white/40">Total de venta: {money(Number(order.total) || 0)}</p>
            <button type="button" disabled={!onClaimOrder || claimingId === order.id || !isOnline}
              onClick={() => onClaimOrder?.(order)}
              className={'mt-3 min-h-11 w-full rounded-xl bg-emerald-300 text-sm font-black text-[#11231b] disabled:opacity-40 ' + focus}>
              {claimingId === order.id ? 'Asignando…' : 'Tomar pedido'}
            </button>
          </div>)}</div>
        </section>}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" onClick={() => onNavigate('weekly')} className={'flex items-center gap-3 rounded-[20px] border border-white/10 bg-[#1a1b20] p-4 text-left ' + focus}>
            <ClipboardList size={21} className="text-amber-300"/><span className="text-sm font-bold">Mi desempeño</span><ChevronRight size={15} className="ml-auto text-white/40"/>
          </button>
          <button type="button" onClick={() => onNavigate('caja')} className={'flex items-center gap-3 rounded-[20px] border border-white/10 bg-[#1a1b20] p-4 text-left ' + focus}>
            <Wallet size={21} className="text-emerald-300"/><span className="text-sm font-bold">Mi caja</span><ChevronRight size={15} className="ml-auto text-white/40"/>
          </button>
        </div>
      </> : <div className="space-y-5">
        <MultiStopPanel courierId={driver?.id || ''} isOnline={isOnline}/>
        <MarketplaceOffers
          courierId={driver?.id || ''} isSharedCourier={isSharedCourier} isOnline={isOnline}
          busy={networkBusy} onToggleShared={onToggleShared}
          onOfferAccepted={result => onMarketplaceOfferAccepted?.(result)}/>
      </div>}

      <div className="flex items-center justify-center gap-2 pt-3 text-center text-[11px] text-white/35">
        <ShieldCheck size={14} /> El servidor valida cada aceptación y confirmación de entrega.
      </div>
    </main>

    <nav aria-label="Navegación del repartidor" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#17181c]/95 px-3 pt-2 shadow-[0_-12px_35px_rgba(0,0,0,.35)] backdrop-blur-xl"
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
            (item.active ? 'bg-amber-400/10 text-amber-300' : 'text-white/45 hover:text-white')}>
          <item.icon size={21} strokeWidth={item.active ? 2.6 : 1.9}/>
          {item.label}
        </button>)}
      </div>
    </nav>
  </div>;
}
