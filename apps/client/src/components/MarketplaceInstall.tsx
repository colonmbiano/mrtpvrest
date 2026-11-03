'use client';

// Instalar la app del marketplace. En Chrome, Edge y Samsung Internet usa el aviso
// nativo (beforeinstallprompt); en iPhone y iPad no existe y se explica cómo
// agregarla a la pantalla de inicio. Instalada (modo standalone) no se muestra.
import { useState, useSyncExternalStore } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { secondaryButton } from '@/components/account/AccountUi';

const noSubscribe = () => () => {};
function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  // iPadOS se presenta como Mac de escritorio; lo delata la pantalla táctil.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function useInstall() {
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();
  const [busy, setBusy] = useState(false);
  const install = async () => {
    setBusy(true);
    try { await promptInstall(); } finally { setBusy(false); }
  };
  return { canInstall, isInstalled, install, busy };
}

// Botón de la cabecera de la portada: solo cuando el navegador puede instalarla.
export function InstallAppButton({ className }: { className: string }) {
  const { canInstall, install, busy } = useInstall();
  if (!canInstall) return null;
  return <button type="button" onClick={install} disabled={busy} aria-label="Instalar la app" className={className}>
    <Download className="h-4 w-4" aria-hidden="true" />
    <span className="hidden sm:inline">{busy ? 'Abriendo…' : 'Instalar app'}</span>
  </button>;
}

// Sección de Mi cuenta: botón o, en iPhone y iPad, cómo agregarla a inicio.
export function InstallAppSection() {
  const { canInstall, isInstalled, install, busy } = useInstall();
  const appleMobile = useSyncExternalStore(noSubscribe, isAppleMobile, () => false);
  if (isInstalled || (!canInstall && !appleMobile)) return null;
  return <section aria-labelledby="account-install" className="mt-7">
    <h2 id="account-install" className="flex items-center gap-2 text-base font-extrabold">
      <Smartphone className="h-5 w-5 text-[#e65b27]" aria-hidden="true" /> Instala la app
    </h2>
    {canInstall ? <>
      <p className="mt-3 text-sm leading-relaxed text-[#617567]">Abre el marketplace desde tu pantalla de inicio, como cualquier app.</p>
      <button type="button" onClick={install} disabled={busy} className={secondaryButton + ' mt-3 gap-2'}>
        <Download className="h-4 w-4" aria-hidden="true" /> {busy ? 'Abriendo…' : 'Instalar app'}
      </button>
    </> : <p className="mt-3 text-sm leading-relaxed text-[#617567]">
      En iPhone o iPad, toca <strong className="text-[#304438]">Compartir</strong> y luego <strong className="text-[#304438]">«Agregar a inicio»</strong>. Así también te llegan los avisos de tus pedidos.
    </p>}
  </section>;
}
