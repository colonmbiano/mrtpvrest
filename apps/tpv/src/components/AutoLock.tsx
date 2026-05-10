"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

// Bloquea la terminal automáticamente cuando el tablet se duerme o el
// cajero manda la app al fondo. En el siguiente resume se hace logout y
// se redirige a /locked para que reingrese el PIN.
//
// Diseño:
// - Usa el evento `appStateChange` de Capacitor (más fiable en Android
//   que `visibilitychange` cuando la pantalla se apaga).
// - Fallback a `visibilitychange` para que también funcione en el dev
//   server web sin Capacitor.
// - Si la app estuvo más de UNLOCK_GRACE_MS en background, fuerza unlock.
//   Esto evita que un dim de pantalla < 5s pida PIN sin razón.
// - No hace nada si el usuario ya está en /locked, /setup o no hay sesión.

const UNLOCK_GRACE_MS = 5_000; // 5 s de gracia antes de pedir PIN

export default function AutoLock() {
  const router = useRouter();
  const pathname = usePathname();
  const logout = useAuthStore((s) => s.logout);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    let pausedAt: number | null = null;
    let cancelled = false;
    let removeCapListener: (() => void) | null = null;

    const lockNow = () => {
      // Saltar si ya estamos en una pantalla pre-login.
      if (
        pathname?.startsWith("/locked") ||
        pathname?.startsWith("/setup")
      )
        return;
      logout();
      router.replace("/locked");
    };

    const handleBackground = () => {
      pausedAt = Date.now();
    };

    const handleForeground = () => {
      if (pausedAt == null) return;
      const elapsed = Date.now() - pausedAt;
      pausedAt = null;
      if (elapsed >= UNLOCK_GRACE_MS) lockNow();
    };

    // Web fallback (también dispara cuando el tablet apaga la pantalla).
    const onVisibility = () => {
      if (document.visibilityState === "hidden") handleBackground();
      else if (document.visibilityState === "visible") handleForeground();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Capacitor App listener — más fiable en Android.
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform?.()) return;
        const { App } = await import("@capacitor/app");
        if (cancelled) return;
        const handle = await App.addListener("appStateChange", (state) => {
          if (state.isActive) handleForeground();
          else handleBackground();
        });
        removeCapListener = () => handle.remove();
      } catch {
        // Sin Capacitor: el visibilitychange ya cubre el caso web.
      }
    })();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      removeCapListener?.();
    };
  }, [isAuthenticated, logout, router, pathname]);

  return null;
}
