"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function PWAInstallBanner() {
  const pathname = usePathname();
  const [prompt, setPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // El service worker /sw-delivery.js es específico para la app del repartidor.
    // Antes se registraba en cualquier ruta con scope '/', interceptando y
    // cacheando TODAS las páginas del dominio (admin, onboarding, register...),
    // lo que hacía que los bundles nuevos de Next.js no llegaran al navegador.
    //
    // Solución: solo registrarlo cuando estamos bajo /repartidor, y DESREGISTRAR
    // cualquier SW activo cuando navegamos fuera de ahí. Esto destraba usuarios
    // que tengan un SW cacheando JS viejo de antes de este fix.
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const isDeliveryRoute = pathname?.startsWith("/repartidor") ?? false;

    if (isDeliveryRoute) {
      navigator.serviceWorker.register('/sw-delivery.js', { scope: '/repartidor/' })
        .then(reg => console.log('SW registrado:', reg.scope))
        .catch(err => console.log('SW error:', err));
    } else {
      // Limpia SW viejos que pudieron quedar registrados con scope '/'
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => {
          const scope = reg.scope || "";
          if (scope.endsWith("/repartidor/") || scope.includes("/repartidor")) return; // conservar
          reg.unregister().catch(() => {});
        });
      }).catch(() => {});

      // Purgar caches viejos dejados por el SW global
      if ("caches" in window) {
        caches.keys().then(keys => {
          keys.forEach(k => {
            if (k === "delivery-v1") caches.delete(k).catch(() => {});
          });
        }).catch(() => {});
      }
    }

    // Capturar evento de instalación (solo si estamos en ruta delivery)
    const handler = (e: any) => {
      if (!isDeliveryRoute) return;
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
  }, [pathname]);

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