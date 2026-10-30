'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, MapPin, PackageCheck, RefreshCw, ShieldCheck, Truck } from 'lucide-react';
import {
  MULTISTOP_PILOT_ENABLED, fetchMultiOffers, fetchMultiTrips,
  acceptMultiOffer, pickupMultiStop, deliverMultiTrip,
  type MultiOffer, type MultiTrip,
} from '@/lib/marketplaceMultiStop';

const money = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
const border = 'rounded-[22px] border border-white/10 bg-[#191b20] p-4';
const action = 'mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-300 px-4 text-sm font-extrabold text-[#10251b] disabled:cursor-not-allowed disabled:opacity-40';

export function MultiStopPanel({ isOnline, courierId }: { isOnline: boolean; courierId: string }) {
  const [offers, setOffers] = useState<MultiOffer[]>([]);
  const [trips, setTrips] = useState<MultiTrip[]>([]);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!courierId || !isOnline || !MULTISTOP_PILOT_ENABLED) return;
    try {
      const [offered, active] = await Promise.all([fetchMultiOffers(), fetchMultiTrips()]);
      setOffers(offered); setTrips(active); setError('');
    } catch {
      setError('No fue posible consultar las rutas multi-tienda. Actualiza o verifica la sesión.');
    }
  }, [courierId, isOnline]);

  useEffect(() => {
    if (!MULTISTOP_PILOT_ENABLED || !isOnline) return;
    const start = window.setTimeout(() => { void refresh(); }, 0);
    const poll = window.setInterval(() => { void refresh(); }, 15000);
    const ticks = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(start); window.clearInterval(poll); window.clearInterval(ticks);
    };
  }, [refresh, isOnline]);

  const execute = async (fn: () => Promise<MultiTrip>) => {
    if (busy || !isOnline) return;
    setBusy(true); setError('');
    try {
      const updated = await fn();
      setTrips(current => {
        const seen = current.some(t => t.id === updated.id);
        return seen ? current.map(t => t.id === updated.id ? updated : t) : [updated, ...current];
      });
      setOffers(current => current.filter(o => o.tripId !== updated.id));
      setPin(''); setPending('');
    } catch (e) {
      const cause = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { errorCode?: string } } }).response?.data?.errorCode : null;
      setError(cause ? 'El servidor rechazó el cambio: ' + cause
        : e instanceof Error ? e.message : 'No fue posible confirmar el paso.');
    } finally { setBusy(false); }
  };

  if (!MULTISTOP_PILOT_ENABLED) {
    return <section className={border}>
      <p className="flex items-center gap-2 text-sm font-extrabold text-white"><Truck size={17} className="text-amber-300"/> Entregas de varias tiendas</p>
      <p className="mt-2 text-xs leading-relaxed text-white/55">
        Disponible únicamente en el entorno piloto. No se pueden crear rutas de varias tiendas desde esta app productiva.
      </p>
    </section>;
  }

  return <section className="space-y-3" aria-label="Rutas multi-tienda">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-300">Piloto de rutas agrupadas</p>
        <h3 className="mt-1 text-lg font-black text-white">Recogidas de varias tiendas</h3>
      </div>
      <button type="button" aria-label="Actualizar rutas agrupadas" disabled={!isOnline || busy}
        onClick={() => { void refresh(); }}
        className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-white/70 disabled:opacity-40">
        <RefreshCw size={15}/> Actualizar
      </button>
    </div>
    {!isOnline && <p role="status" className="rounded-xl bg-amber-400/10 p-3 text-xs font-semibold text-amber-200">
      Sin conexión. No se aceptan ofertas ni se confirman PIN hasta reconectar.
    </p>}
    {error && <p role="alert" className="flex gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">
      <AlertTriangle size={16} className="shrink-0"/>{error}
    </p>}
    {trips.filter(t => t.status === 'ASSIGNED').map(trip => {
      const next = trip.stops.find(s => s.status === 'PENDING');
      const allPicked = trip.pickedCount === trip.pickupCount;
      const key = next ? 'pickup:' + trip.id + ':' + next.taskId : 'deliver:' + trip.id;
      return <article key={trip.id} className={border}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-extrabold text-white"><Truck size={17} className="text-emerald-300"/> Ruta #{trip.id.slice(-8)}</p>
            <p className="mt-1 text-xs text-white/55">{trip.pickedCount} de {trip.pickupCount} recogidas confirmadas</p>
          </div>
          <span className="rounded-xl bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-300">{money(trip.payoutAmount)}</span>
        </div>
        <div className="mt-4 space-y-3">
          {trip.stops.map((stop, index) =>
            <div key={stop.taskId} className="flex gap-3">
              <div className={'mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ' +
                (stop.status === 'PENDING' ? 'bg-amber-400 text-[#191711]' : 'bg-emerald-400/15 text-emerald-300')}>
                {stop.status === 'PENDING' ? index + 1 : <CheckCircle2 size={17}/>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">{stop.storeName}</p>
                <p className="mt-0.5 text-xs text-white/60">{stop.pickupAddress}</p>
                {stop.status === 'PENDING' && <a target="_blank" rel="noopener noreferrer"
                  href={'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(stop.pickupAddress)}
                  className="mt-1 inline-flex min-h-9 items-center text-xs font-bold text-amber-300 underline underline-offset-4">
                  Abrir indicaciones de recogida
                </a>}
                <p className={'mt-0.5 text-[11px] font-extrabold ' +
                  (stop.status === 'PENDING' ? 'text-amber-300' : 'text-emerald-300')}>
                  {stop.status === 'PENDING' ? 'Pendiente de PIN de tienda' : 'Recogida confirmada'}
                </p>
              </div>
            </div>)}
          <div className="flex gap-3 border-t border-white/10 pt-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60"><MapPin size={17}/></div>
            <div>
              <p className="text-sm font-bold text-white">Entrega al cliente</p>
              <p className="mt-1 text-xs text-white/60">
                {allPicked ? trip.deliveryAddress : 'La dirección se revela cuando confirmes todas las recogidas.'}
              </p>
              {allPicked && trip.deliveryAddress && <a target="_blank" rel="noopener noreferrer"
                href={'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(trip.deliveryAddress)}
                className="mt-1 inline-flex min-h-9 items-center text-xs font-bold text-emerald-300 underline underline-offset-4">
                Abrir indicaciones de entrega
              </a>}
            </div>
          </div>
        </div>
        <label className="mt-4 block text-xs font-bold text-white/75" htmlFor={'pin-' + trip.id}>
          {next ? 'PIN de recogida de ' + next.storeName : 'PIN final de entrega del cliente'}
        </label>
        <input id={'pin-' + trip.id} inputMode="numeric" type="password" autoComplete="off"
          maxLength={6} value={pending === key ? pin : ''}
          onChange={e => { setPending(key); setPin(e.target.value.replace(/\D/g, '')); }}
          placeholder="Código de 4 a 6 dígitos"
          className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-base tracking-[.14em] text-white outline-none focus:border-emerald-300"/>
        <button type="button" disabled={!isOnline || busy || !/^\d{4,6}$/.test(pending === key ? pin : '')}
          className={action}
          onClick={() => {
            const code = pin;
            void execute(() => next
              ? pickupMultiStop(trip, next.taskId, code)
              : deliverMultiTrip(trip, code));
          }}>
          <PackageCheck size={18} className="mr-2"/>
          {busy ? 'Confirmando con servidor…' : next ? 'Confirmar recogida' : 'Confirmar entrega final'}
        </button>
        <p className="mt-2 flex gap-2 text-[11px] leading-relaxed text-white/45">
          <ShieldCheck size={14} className="shrink-0"/> Cada recogida se valida por separado. La entrega final requiere el PIN del cliente.
        </p>
      </article>;
    })}
    {offers.filter(o => Date.parse(o.expiresAt) > now).map(offer =>
      <article key={offer.offerId} className={border}>
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-extrabold text-white"><Truck size={18} className="text-amber-300"/> {offer.pickupCount} tiendas · 1 entrega</p>
          <p className="text-lg font-black text-emerald-300">{money(offer.payoutAmount)}</p>
        </div>
        <p className="mt-2 flex items-center gap-2 text-xs text-amber-300">
          <Clock3 size={14}/> {Math.max(0, Math.ceil((Date.parse(offer.expiresAt) - now) / 1000))} s para aceptar
        </p>
        <p className="mt-2 text-xs text-white/50">Los detalles de recogida se mostrarán después de la asignación. No se garantiza una ruta optimizada.</p>
        <button type="button" disabled={!isOnline || busy} className={action}
          onClick={() => { void execute(() => acceptMultiOffer(offer.offerId)); }}>
          {busy ? 'Confirmando…' : 'Aceptar ruta completa'}
        </button>
      </article>)}
    {trips.filter(t => t.status === 'DELIVERED').slice(0, 2).map(trip =>
      <div key={trip.id} role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-xs font-bold text-emerald-200">
        <CheckCircle2 size={17}/> Ruta #{trip.id.slice(-8)} completada y confirmada por el servidor.
      </div>)}
    {!offers.length && !trips.some(t => t.status === 'ASSIGNED') &&
      <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-white/50">
        Sin ofertas agrupadas. Las asignaciones nuevas se consultan con el servidor de staging.
      </p>}
  </section>;
}
