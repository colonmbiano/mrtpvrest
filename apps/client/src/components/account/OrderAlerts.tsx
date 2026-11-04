'use client';

// "Avisos de tus pedidos" en Mi cuenta: suscribe este navegador a los avisos push
// de los pedidos de la cuenta. Sin service worker (desarrollo) o en navegadores sin
// push solo explica por qué no se puede.
import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { getMarketplaceApiUrl } from '@/lib/config';
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/marketplacePush';
import { Notice, secondaryButton } from './AccountUi';

const STATE_TEXT: Record<PushState, string> = {
  on: 'Te avisamos en este dispositivo cuando tu pedido se confirme, salga o esté listo.',
  off: 'Recibe un aviso en este dispositivo cuando tu pedido se confirme, salga o esté listo.',
  denied: 'Bloqueaste las notificaciones de este sitio. Permítelas en los ajustes de tu navegador para recibir avisos.',
  unavailable: 'Los avisos funcionan en la app publicada o instalada.',
  unsupported: 'Este navegador no admite avisos. En iPhone, agrega el sitio a tu pantalla de inicio y ábrelo desde ahí.',
};

export default function OrderAlerts() {
  const apiUrl = getMarketplaceApiUrl();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    getPushState().then(next => { if (alive) setState(next); });
    return () => { alive = false; };
  }, []);

  const toggle = async () => {
    setBusy(true); setError('');
    const result = state === 'on' ? await disablePush(apiUrl) : await enablePush(apiUrl);
    if (!result.ok) setError(result.message);
    setState(await getPushState());
    setBusy(false);
  };

  return <section aria-labelledby="account-alerts" className="mt-7">
    <h2 id="account-alerts" className="flex items-center gap-2 text-base font-extrabold">
      <Bell className="h-5 w-5 text-[#e65b27]" aria-hidden="true" /> Avisos de tus pedidos
    </h2>
    {state === null
      ? <p role="status" className="mt-3 text-sm text-[#617567]">Revisando avisos…</p>
      : <p className="mt-3 text-sm leading-relaxed text-[#617567]">{STATE_TEXT[state]}</p>}
    {(state === 'on' || state === 'off') && <button type="button" onClick={toggle} disabled={busy} aria-pressed={state === 'on'} className={secondaryButton + ' mt-3 gap-2'}>
      {state === 'on'
        ? <><BellOff className="h-4 w-4" aria-hidden="true" /> {busy ? 'Apagando…' : 'Apagar avisos'}</>
        : <><Bell className="h-4 w-4" aria-hidden="true" /> {busy ? 'Activando…' : 'Activar avisos'}</>}
    </button>}
    {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
  </section>;
}
