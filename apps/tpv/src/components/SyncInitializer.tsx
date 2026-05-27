'use client';

import { useEffect } from 'react';
import { initBackgroundSync } from '@/lib/offline';
import { useAuthStore } from '@/store/authStore';

export default function SyncInitializer() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    // Solo iniciar sync si estamos autenticados (tenemos permisos/contexto)
    if (isAuthenticated) {
      initBackgroundSync();
    }
  }, [isAuthenticated]);

  // Service worker — solo en web (Vercel). En Capacitor el WebView ya sirve
  // los assets desde el APK, así que un SW activo solo genera conflictos
  // de cache. Detectamos Capacitor por window.Capacitor (inyectado por el
  // runtime nativo) y por el protocolo `capacitor:`/`file:`.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const isCapacitor =
      // @ts-expect-error — Capacitor inyecta esto en runtime
      Boolean(window.Capacitor) ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:';
    if (isCapacitor) return;

    // Lazy register para no bloquear el primer paint.
    const id = window.setTimeout(() => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => console.warn('[sw] registration failed:', err));
    }, 1500);
    return () => window.clearTimeout(id);
  }, []);

  return null;
}
