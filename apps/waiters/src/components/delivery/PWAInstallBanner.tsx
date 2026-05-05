"use client";
import { useEffect, useState } from "react";

export default function PWAInstallBanner() {
  const [prompt, setPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Registrar service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-delivery.js')
        .then(reg => console.log('SW registrado:', reg.scope))
        .catch(err => console.log('SW error:', err));
    }

    // Capturar evento de instalación
    const handler = (e: any) => {
      e.preventDefault();
      setPrompt(e);
      setShowBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Detectar si ya está instalada
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function install() {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') { setInstalled(true); setShowBanner(false); }
  }

  if (installed || !showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4" style={{background:"var(--surf)",borderTop:"1px solid var(--border)"}}>
      <div className="flex items-center gap-3">
        <div className="text-2xl">📱</div>
        <div className="flex-1">
          <div className="font-syne font-black text-sm">Instalar app</div>
          <div className="text-xs" style={{color:"var(--muted)"}}>Accede sin internet y más rápido</div>
        </div>
        <button onClick={() => setShowBanner(false)} className="px-2 py-1 text-xs" style={{color:"var(--muted)"}}>No</button>
        <button onClick={install} className="px-4 py-2 rounded-xl text-sm font-black" style={{background:"var(--gold)",color:"#000"}}>
          Instalar
        </button>
      </div>
    </div>
  );
}