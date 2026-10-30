'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Bike, CheckCircle2, Clock3, MapPin, RadioTower, RefreshCw, ShieldCheck, Store, WifiOff } from 'lucide-react';
import { type MarketplaceOffer, getMarketplaceOffers, acceptMarketplaceOffer } from '@/lib/marketplaceDispatch';

interface MarketplaceOffersProps {
  courierId: string;
  isSharedCourier: boolean;
  isOnline?: boolean; // Conectividad a Internet, no disponibilidad del repartidor.
  busy?: boolean;
  onOfferAccepted: (result: { taskId: string; orderId?: string }) => void;
  onToggleShared?: (enabled: boolean) => void | Promise<void>;
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
}
const dateSeconds = (timestamp: number, now: number): number =>
  Math.max(0, Math.ceil((timestamp - now) / 1000));

export function MarketplaceOffers({ courierId, isSharedCourier, isOnline = true, busy = false, onOfferAccepted, onToggleShared }: MarketplaceOffersProps) {
  const [offers, setOffers] = useState<MarketplaceOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState<{ taskId: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!courierId || !isOnline) return;
    setLoading(true);
    try {
      const result = await getMarketplaceOffers(courierId);
      setOffers(result);
      setError('');
    } catch {
      // Conservar ofertas previamente conocidas hasta vencer; no mostrarlas como nuevas.
      setError('No se pudieron actualizar las ofertas. Revisa tu conexión o sesión.');
    } finally {
      setLoading(false);
    }
  }, [courierId, isOnline]);

  useEffect(() => {
    if (!isOnline || !courierId) return;
    // Desacoplar fetch del render; cleanup también cancela el polling.
    const id = window.setTimeout(() => { void refresh(); }, 0);
    const poll = window.setInterval(() => { void refresh(); }, 12000);
    return () => { window.clearTimeout(id); window.clearInterval(poll); };
  }, [refresh, courierId, isOnline]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const activeOffers = offers.filter(offer => offer.expiresAt > now
    && (offer.source === 'OWN' || isSharedCourier && offer.source === 'SHARED'));

  async function handleAccept(offer: MarketplaceOffer) {
    if (acceptingId || !isOnline || busy || dateSeconds(offer.expiresAt, now) <= 0) return;
    setAcceptingId(offer.offerId);
    setError('');
    try {
      const result = await acceptMarketplaceOffer(courierId, offer.offerId);
      if (result.success && result.data?.taskId) {
        setOffers(prev => prev.filter(o => o.offerId !== offer.offerId));
        setAccepted({ taskId: result.data.taskId });
        onOfferAccepted({ taskId: result.data.taskId, orderId: result.data.orderId });
      } else {
        if (result.isConflict || result.error?.toLowerCase().includes('expirad')) {
          setOffers(prev => prev.filter(o => o.offerId !== offer.offerId));
        }
        setError(result.error || 'No fue posible aceptar la oferta.');
      }
    } catch {
      setError('No fue posible confirmar la oferta. Actualiza e intenta nuevamente.');
    } finally {
      setAcceptingId(null);
    }
  }

  return <div className="space-y-4" aria-label="Oportunidades del Marketplace">
    <section className="relative overflow-hidden rounded-[26px] border border-amber-400/20 bg-gradient-to-br from-[#2d2419] via-[#1b1918] to-[#131417] p-5 shadow-[0_18px_45px_rgba(0,0,0,.18)]">
      <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-amber-400/10 blur-2xl" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[.13em] text-amber-300">
            <RadioTower size={15} /> Red de entregas
          </p>
          <h2 className="text-xl font-extrabold text-white">Pedidos de otros negocios</h2>
          <p className="max-w-[280px] text-xs leading-relaxed text-white/55">
            Recibe ofertas de comercios de la red cuando estés disponible y con ubicación verificada.
          </p>
        </div>
        <span className={'shrink-0 rounded-xl px-2.5 py-1.5 text-[11px] font-extrabold ' +
          (isSharedCourier ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/55')}>
          {isSharedCourier ? '● Conectado' : '○ Desactivado'}
        </span>
      </div>
      <button type="button" disabled={!onToggleShared || busy || !isOnline}
        aria-pressed={isSharedCourier}
        onClick={() => { void onToggleShared?.(!isSharedCourier); }}
        className={'relative mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-40 ' +
          (isSharedCourier ? 'border border-white/20 bg-white/10 text-white' : 'bg-amber-400 text-[#211b0e] hover:bg-amber-300')}>
        {busy ? 'Verificando ubicación…' : isSharedCourier ? 'Pausar red compartida' : 'Conectarme a la red'}
        <ArrowRight size={16} />
      </button>
      {!isOnline && <p role="status" className="mt-2 flex items-center gap-2 text-xs text-orange-300">
        <WifiOff size={14} /> Sin conexión. No se pueden tomar ofertas.
      </p>}
      <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-white/45">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-300" />
        El GPS se solicita al conectarte. Las ofertas caducan; solo el servidor confirma la asignación.
      </p>
    </section>

    {accepted && <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
      <p className="flex items-center gap-2 font-extrabold text-emerald-300"><CheckCircle2 size={17}/> Oferta aceptada</p>
      <p className="mt-1 text-xs text-white/65">Tarea {accepted.taskId.slice(0, 10)} · pendiente de sincronizar con la ruta y los datos del comercio.</p>
    </div>}

    <div className="flex items-center justify-between gap-3 pt-1">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-amber-300">Oportunidades</p>
        <h3 className="mt-1 text-xl font-black text-white">{activeOffers.length} oferta{activeOffers.length === 1 ? '' : 's'} disponible{activeOffers.length === 1 ? '' : 's'}</h3>
      </div>
      <button type="button" onClick={() => { void refresh(); }} disabled={loading || !isOnline}
        aria-label="Actualizar ofertas" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-white/80 disabled:opacity-50">
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
      </button>
    </div>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs font-semibold text-rose-300">
      <AlertCircle size={16} className="shrink-0"/> {error}
    </div>}

    {activeOffers.length === 0 && <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[.025] p-8 text-center">
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-300"><Bike size={30}/></div>
      <h3 className="text-lg font-bold text-white">{!isOnline ? 'Sin conexión' : isSharedCourier ? 'Esperando pedidos cercanos' : 'Activa la red compartida'}</h3>
      <p className="mx-auto mt-2 max-w-[300px] text-sm leading-relaxed text-white/50">
        {!isOnline ? 'Reconéctate para consultar ofertas y confirmar asignaciones.'
          : isSharedCourier ? 'Las nuevas ofertas aparecerán aquí mientras haya una asignación disponible.'
          : 'Puedes continuar repartiendo para tu tienda. Conecta la red si quieres recibir ofertas adicionales.'}
      </p>
    </div>}

    {activeOffers.map(offer => {
      const remaining = dateSeconds(offer.expiresAt, now);
      const accepting = acceptingId === offer.offerId;
      return <article key={offer.offerId} className="overflow-hidden rounded-[24px] border border-white/10 bg-[#1b1b20] p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ' +
              (offer.source === 'OWN' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300')}>
              <Store size={12}/> {offer.source === 'OWN' ? 'Mi comercio' : 'Red compartida'}
            </span>
            <h4 className="mt-2 text-base font-extrabold text-white">Entrega #{offer.taskId.slice(0, 8)}</h4>
            <p className="mt-1 text-xs text-white/45">Oferta de despacho verificada</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Pago ofrecido</p>
            <p className="mt-1 text-2xl font-black text-emerald-300">{money(offer.payoutAmount, offer.currency)}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-white/[.035] p-3 text-xs">
          <div className="flex items-center gap-2 text-white/60"><Clock3 size={15} className="text-amber-300"/>
            <span>{remaining > 0 ? remaining + ' s para aceptar' : 'Vencida'}</span>
          </div>
          <div className="flex items-center gap-2 text-white/60"><MapPin size={15} className="text-emerald-300"/>
            <span>Ruta sin publicar</span>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-amber-200/65">El servidor aún no envía tienda, origen ni destino en la oferta. Confirma la ruta con operaciones antes de salir.</p>
        <button type="button" onClick={() => { void handleAccept(offer); }}
          disabled={!!acceptingId || remaining <= 0 || busy || !isOnline}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 text-sm font-black text-[#161510] hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40">
          {accepting ? 'Confirmando con el servidor…' : 'Aceptar oferta'}
          <ArrowRight size={16}/>
        </button>
      </article>;
    })}
  </div>;
}
