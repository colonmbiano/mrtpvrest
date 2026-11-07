'use client';

import { useEffect, useState } from 'react';
import { C } from '@/lib/tokens';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

export function CourierInstall() {
  const [hidden, setHidden] = useState(true);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [instructions, setInstructions] = useState(false);
  useEffect(() => {
    const native = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone;
    setHidden(Boolean(native || standalone));
    const offer = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const installed = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', offer);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  if (hidden) return null;

  async function install() {
    if (prompt) {
      setPrompt(null);
      try { await prompt.prompt(); return; } catch { /* El navegador puede haber descartado el aviso. */ }
    }
    setInstructions(true);
  }
  return <div style={{ marginTop: 16, textAlign: 'center' }}>
    <button type="button" onClick={install} style={{ minHeight: 44, color: C.green, fontWeight: 700 }}>
      Instalar app de reparto
    </button>
    {instructions && <p role="status" style={{ color: C.textDim, fontSize: 13 }}>
      En Android, abre el menú del navegador y elige «Instalar aplicación» o «Agregar a la pantalla principal».
      En iPhone, abre esta página en Safari y elige Compartir → Agregar a inicio.
    </p>}
  </div>;
}
