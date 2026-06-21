"use client";

import { useEffect } from "react";

// Notifica al plugin de Capgo que el bundle actual cargó correctamente. Si no
// se llama dentro del timeout (default 10s), el plugin asume que el bundle está
// roto y revierte al anterior en el siguiente arranque. Esta es la salvaguarda
// que evita que un mal release deje a las tablets de meseros muertas.
export default function OtaUpdater() {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Lazy import — el módulo nativo solo existe corriendo en Android. En
      // desarrollo web el dynamic import puede fallar y lo silenciamos.
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform?.()) return;
        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
        if (cancelled) return;
        await CapacitorUpdater.notifyAppReady();
      } catch (err) {
        // No bloqueamos la UI si el plugin no está disponible (build web).
        if (process.env.NODE_ENV !== "production") {
          console.debug("[OtaUpdater] notifyAppReady skipped:", err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
