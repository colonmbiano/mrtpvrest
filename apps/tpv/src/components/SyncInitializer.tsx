'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { initBackgroundSync, stopBackgroundSync } from '@/lib/offline';
import { TPV_AUTH_REQUIRED_EVENT } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

export default function SyncInitializer() {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (isAuthenticated || typeof document === 'undefined') return;
    const protectedPage = /^\/(hub|pos|cierre|meseros|admin|centro)(\/|$)/.test(pathname ?? '');
    if (!protectedPage && !document.cookie.includes('tpv-session-active=true')) return;

    // La sesión viva ya no se persiste: tras recargar, una cookie antigua no
    // puede abrir el POS con employee=null ni dejar detenida la cola. Borramos
    // también el JWT anterior y exigimos el PIN local (funciona sin backend).
    if (document.cookie.includes('tpv-session-active=true')) logout();
    router.replace('/locked');
  }, [isAuthenticated, logout, pathname, router]);

  useEffect(() => {
    // Solo iniciar sync si estamos autenticados (tenemos permisos/contexto)
    if (!isAuthenticated) {
      stopBackgroundSync();
      return;
    }
    initBackgroundSync();
    return stopBackgroundSync;
  }, [isAuthenticated]);

  useEffect(() => {
    const requireFreshPin = () => {
      logout();
      router.replace('/locked');
    };
    window.addEventListener(TPV_AUTH_REQUIRED_EVENT, requireFreshPin);
    return () =>
      window.removeEventListener(TPV_AUTH_REQUIRED_EVENT, requireFreshPin);
  }, [logout, router]);

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
