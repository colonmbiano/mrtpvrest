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
    <section className="relative overflow-hidden rounded-[26px] border border-[#d6e2da] bg-white p-5 shadow-[0_18px_45px_rgba(23,42,42,.08)]">
      <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[#fdeee6] blur-2xl" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[.13em] text-[#c6410c]">
            <RadioTower size={15} /> Red de entregas
          </p>
          <h2 className="text-xl font-extrabold text-[#172a2a]">Pedidos de otros negocios</h2>
          <p className="max-w-[280px] text-xs leading-relaxed text-[#52665b]">
            Recibe ofertas de comercios de la red cuando estés disponible y con ubicación verificada.
          </p>
        </div>
        <span className={'shrink-0 rounded-xl px-2.5 py-1.5 text-[11px] font-extrabold ' +
          (isSharedCourier ? 'bg-[#e8f4ec] text-[#14743b]' : 'bg-[#eaefec] text-[#52665b]')}>
          {isSharedCourier ? '● Conectado' : '○ Desactivado'}
        </span>
      </div>
      <button type="button" disabled={!onToggleShared || busy || !isOnline}
        aria-pressed={isSharedCourier}
        onClick={() => { void onToggleShared?.(!isSharedCourier); }}
        className={'relative mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-40 ' +
          (isSharedCourier ? 'border border-[#d6e2da] bg-[#eaefec] text-[#172a2a]' : 'bg-[#c6410c] text-white hover:bg-[#a8370a]')}>
        {busy ? 'Verificando ubicación…' : isSharedCourier ? 'Pausar red compartida' : 'Conectarme a la red'}
        <ArrowRight size={16} />
      </button>
      {!isOnline && <p role="status" className="mt-2 flex items-center gap-2 text-xs text-[#b45309]">
        <WifiOff size={14} /> Sin conexión. No se pueden tomar ofertas.
      </p>}
      <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-[#8a9a90]">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#14743b]" />
        El GPS se solicita al conectarte. Las ofertas caducan; solo el servidor confirma la asignación.
      </p>
    </section>

    {accepted && <div role="status" className="rounded-2xl border border-[#14743b]/30 bg-[#e8f4ec] p-4">
      <p className="flex items-center gap-2 font-extrabold text-[#14743b]"><CheckCircle2 size={17}/> Oferta aceptada</p>
      <p className="mt-1 text-xs text-[#52665b]">Tarea {accepted.taskId.slice(0, 10)} · pendiente de sincronizar con la ruta y los datos del comercio.</p>
    </div>}

    <div className="flex items-center justify-between gap-3 pt-1">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#c6410c]">Oportunidades</p>
        <h3 className="mt-1 text-xl font-black text-[#172a2a]">{activeOffers.length} oferta{activeOffers.length === 1 ? '' : 's'} disponible{activeOffers.length === 1 ? '' : 's'}</h3>
      </div>
      <button type="button" onClick={() => { void refresh(); }} disabled={loading || !isOnline}
        aria-label="Actualizar ofertas" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d6e2da] bg-[#f2f5f3] px-3 text-xs font-bold text-[#172a2a] disabled:opacity-50">
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
      </button>
    </div>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#b42318]/25 bg-[#fbecec] p-3 text-xs font-semibold text-[#b42318]">
      <AlertCircle size={16} className="shrink-0"/> {error}
    </div>}

    {activeOffers.length === 0 && <div className="rounded-[24px] border border-dashed border-[#d6e2da] bg-[#f2f5f3] p-8 text-center">
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#fdeee6] text-[#c6410c]"><Bike size={30}/></div>
      <h3 className="text-lg font-bold text-[#172a2a]">{!isOnline ? 'Sin conexión' : isSharedCourier ? 'Esperando pedidos cercanos' : 'Activa la red compartida'}</h3>
      <p className="mx-auto mt-2 max-w-[300px] text-sm leading-relaxed text-[#8a9a90]">
        {!isOnline ? 'Reconéctate para consultar ofertas y confirmar asignaciones.'
          : isSharedCourier ? 'Las nuevas ofertas aparecerán aquí mientras haya una asignación disponible.'
          : 'Puedes continuar repartiendo para tu tienda. Conecta la red si quieres recibir ofertas adicionales.'}
      </p>
    </div>}

    {activeOffers.map(offer => {
      const remaining = dateSeconds(offer.expiresAt, now);
      const accepting = acceptingId === offer.offerId;
      return <article key={offer.offerId} className="overflow-hidden rounded-[24px] border border-[#d6e2da] bg-white p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ' +
              (offer.source === 'OWN' ? 'bg-[#e8f4ec] text-[#14743b]' : 'bg-[#fdeee6] text-[#c6410c]')}>
              <Store size={12}/> {offer.source === 'OWN' ? 'Mi comercio' : 'Red compartida'}
            </span>
            <h4 className="mt-2 text-base font-extrabold text-[#172a2a]">Entrega #{offer.taskId.slice(0, 8)}</h4>
            <p className="mt-1 text-xs text-[#8a9a90]">Oferta de despacho verificada</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a9a90]">Pago ofrecido</p>
            <p className="mt-1 text-2xl font-black text-[#14743b]">{money(offer.payoutAmount, offer.currency)}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[#f2f5f3] p-3 text-xs">
          <div className="flex items-center gap-2 text-[#52665b]"><Clock3 size={15} className="text-[#c6410c]"/>
            <span>{remaining > 0 ? remaining + ' s para aceptar' : 'Vencida'}</span>
          </div>
          <div className="flex items-center gap-2 text-[#52665b]"><MapPin size={15} className="text-[#14743b]"/>
            <span>Ruta sin publicar</span>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[#b45309]/70">El servidor aún no envía tienda, origen ni destino en la oferta. Confirma la ruta con operaciones antes de salir.</p>
        <button type="button" onClick={() => { void handleAccept(offer); }}
          disabled={!!acceptingId || remaining <= 0 || busy || !isOnline}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#c6410c] px-3 text-sm font-black text-white hover:bg-[#a8370a] disabled:cursor-not-allowed disabled:opacity-40">
          {accepting ? 'Confirmando con el servidor…' : 'Aceptar oferta'}
          <ArrowRight size={16}/>
        </button>
      </article>;
    })}
  </div>;
}
