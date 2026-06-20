'use client';

import React, { useEffect, useState } from 'react';

/**
 * Etiqueta discreta con la versión de la app del repartidor.
 * - En la APK: versión del bundle OTA activo (Capgo), p.ej. "v0.1.12"; si la
 *   APK corre el bundle empacado sin OTA, cae a la versión nativa.
 * - En web (delivery.mrtpvrest.com): versión de package.json inyectada en build
 *   vía NEXT_PUBLIC_APP_VERSION (ver next.config.mjs).
 * Mismo patrón que el VersionTag del TPV, adaptado a estilos inline.
 */
export default function VersionTag({ style }: { style?: React.CSSProperties }) {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform?.()) {
          if (!cancelled) setVersion(process.env.NEXT_PUBLIC_APP_VERSION || '');
          return;
        }
        const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
        const current = await CapacitorUpdater.current();
        if (cancelled) return;
        const bundleVersion = current?.bundle?.version;
        const resolved =
          bundleVersion && bundleVersion !== 'builtin'
            ? bundleVersion
            : current?.native || process.env.NEXT_PUBLIC_APP_VERSION || 'builtin';
        setVersion(resolved);
      } catch {
        if (!cancelled) setVersion(process.env.NEXT_PUBLIC_APP_VERSION || '');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (!version) return null;

  return <span style={style}>v{version}</span>;
}
