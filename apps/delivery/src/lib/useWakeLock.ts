"use client";
import { useEffect, useRef } from "react";

// useWakeLock — mantiene la pantalla encendida mientras `active` es true.
// Pensado para el tracking GPS del repartidor: si la pantalla se apaga,
// iOS/Android suspenden el WebView y el watchPosition deja de emitir.
//
// - Usa la Screen Wake Lock API (navigator.wakeLock.request('screen')).
// - Re-adquiere el lock en `visibilitychange`: iOS lo libera automáticamente
//   al cambiar de tab/app, así que hay que volver a pedirlo al regresar.
// - Si la API no existe (Safari viejo, contexto no seguro), no hace nada
//   (fallback silencioso) — el tracking sigue funcionando, solo sin lock.
export function useWakeLock(active: boolean) {
  const lockRef = useRef<any>(null);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      // Solo tiene sentido pedirlo con la pestaña visible.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const lock = await (navigator as any).wakeLock.request("screen");
        if (cancelled) {
          lock.release?.();
          return;
        }
        lockRef.current = lock;
        // El navegador puede soltar el lock por su cuenta; lo marcamos null
        // para que visibilitychange lo vuelva a pedir.
        lock.addEventListener?.("release", () => {
          lockRef.current = null;
        });
      } catch {
        // Fallback silencioso: permiso denegado, batería baja, API ausente, etc.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !lockRef.current) acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      lockRef.current?.release?.().catch?.(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
