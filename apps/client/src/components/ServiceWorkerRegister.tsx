'use client';

// Registra el service worker de next-pwa (/sw.js): next-pwa 5.6 solo inyecta su
// registro en el entry del Pages Router, que el App Router no carga. Lo montan las
// páginas del marketplace; con scope "/" cubre todo el origen.
import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Sin /sw.js en desarrollo, en la copia aislada ni en la vista previa (next.config.mjs).
    if (process.env.NEXT_PUBLIC_PWA_ENABLED !== 'true' || !('serviceWorker' in navigator)) return;
    const register = () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}); };
    // Al terminar de cargar, para no competir con la página por la red.
    if (document.readyState === 'complete') { register(); return; }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}
