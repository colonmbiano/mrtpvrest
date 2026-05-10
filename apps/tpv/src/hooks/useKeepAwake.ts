"use client";
import { useEffect } from "react";

/**
 * useKeepAwake — mantiene la pantalla encendida mientras el componente
 * que lo monta esté vivo. Pensado para el shell de POS donde el cajero
 * puede tener la app abierta esperando al cliente sin tocar la pantalla
 * por minutos.
 *
 * - Solo aplica en plataforma nativa Android (Capacitor). En web es no-op.
 * - Detecta dinámicamente el plugin para no romper el bundle si no está
 *   instalado o si el dispositivo no lo soporta.
 * - Libera el wake lock al desmontar (allowSleep) para no consumir batería
 *   en pantallas que ya no necesitan estar despiertas.
 */
export function useKeepAwake(active: boolean = true): void {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    let cancelled = false;
    let didKeep = false;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { KeepAwake } = await import("@capacitor-community/keep-awake");
        if (cancelled) return;
        await KeepAwake.keepAwake();
        didKeep = true;
      } catch {
        /* noop — sin plugin o sin soporte */
      }
    })();

    return () => {
      cancelled = true;
      if (!didKeep) return;
      (async () => {
        try {
          const { KeepAwake } = await import("@capacitor-community/keep-awake");
          await KeepAwake.allowSleep();
        } catch {
          /* noop */
        }
      })();
    };
  }, [active]);
}

export default useKeepAwake;
