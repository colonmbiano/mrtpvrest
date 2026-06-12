"use client";
import { useEffect } from "react";

// Registra el Service Worker (PWA) solo en navegador web.
// Se salta el WebView de Capacitor (APK): ahí las actualizaciones van por OTA
// (Capgo) y un SW cacheando el shell podría chocar con el bundle servido por OTA.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // No registrar dentro del contenedor nativo Capacitor.
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    if (isNative) return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Fallback silencioso: contexto no seguro, etc. La app sigue funcionando.
      });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
