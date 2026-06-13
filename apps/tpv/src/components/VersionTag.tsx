"use client";

import { useEffect, useState } from "react";

/**
 * Etiqueta discreta con la versión del bundle OTA activo (Capgo), p.ej. "v0.1.322".
 * Sirve para saber de un vistazo qué release está corriendo una terminal sin
 * tener que mirar logcat. En web (dev) muestra "web"; en una APK recién
 * instalada sin OTA todavía, cae a la versión nativa.
 */
export default function VersionTag({ className = "" }: { className?: string }) {
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // El primer await difiere todo a microtask: no hay set-state síncrono.
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform?.()) {
          if (!cancelled) setVersion("web");
          return;
        }
        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
        const current = await CapacitorUpdater.current();
        if (cancelled) return;
        // bundle.version es "builtin" cuando corre el bundle empacado en la APK
        // (sin OTA aplicado); en ese caso mostramos la versión nativa.
        const bundleVersion = current?.bundle?.version;
        const resolved =
          bundleVersion && bundleVersion !== "builtin"
            ? bundleVersion
            : current?.native || "builtin";
        setVersion(resolved);
      } catch {
        // Plugin no disponible (build web) o error: no mostramos nada.
        if (!cancelled) setVersion("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!version) return null;

  return <span className={className}>v{version}</span>;
}
