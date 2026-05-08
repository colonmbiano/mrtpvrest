"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Lista de rutas donde el back nativo NO debe navegar atrás:
// - /locked      → barrera de seguridad PIN; no se puede saltar
// - /            → root redirect (transitorio)
// - /pos/order-type → root operativo del POS post-login
// - /kds         → root operativo del KDS
// - /meseros     → root operativo de meseros (sin barra final)
// - /hub         → selector de workspace
const ROOT_OPERATIVE_PATHS = new Set<string>([
  "/",
  "/hub",
  "/locked",
  "/pos/order-type",
  "/meseros",
]);

const SECURITY_LOCKED_PATHS = new Set<string>(["/locked", "/setup"]);

interface CapacitorAppPlugin {
  addListener: (
    event: "backButton",
    handler: (event: { canGoBack: boolean }) => void
  ) => Promise<{ remove: () => Promise<void> }>;
  exitApp: () => Promise<void>;
  minimizeApp?: () => Promise<void>;
}

/**
 * useHardwareBack — engancha el botón Atrás de Android (Capacitor) a la
 * navegación de Next.js en lugar de cerrar la app.
 *
 * Reglas:
 *  - Si hay un overlay/modal abierto (data-modal-open="true" en body),
 *    se delega al modal para que se cierre. Útil para que cualquier
 *    componente modal pueda capturar el evento via DOM.
 *  - En rutas de seguridad (/locked, /setup) el botón se ignora —
 *    no se permite regresar a una pantalla autenticada.
 *  - En rutas operativas root (/, /hub, /pos/order-type, /kds, /meseros)
 *    el botón intenta minimizar la app si está disponible; si no, se
 *    ignora silenciosamente (NO sale).
 *  - En el resto, ejecuta router.back().
 *
 * Es seguro llamar este hook fuera de Capacitor (web). Detecta
 * dinámicamente el plugin y se autoanula si no hay nativo.
 */
export function useHardwareBack(): void {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let removeFn: (() => Promise<void>) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const mod = await import("@capacitor/app");
        if (cancelled) return;
        const App = (mod as unknown as { App: CapacitorAppPlugin }).App;
        if (!App) return;

        const handle = await App.addListener("backButton", () => {
          // 1. Bloqueo de seguridad: nunca regresar desde /locked o /setup.
          if (SECURITY_LOCKED_PATHS.has(pathname)) return;

          // 2. Si hay un modal abierto, delegamos disparando un evento DOM
          //    que cualquier componente modal puede escuchar para cerrarse.
          const modalOpen =
            typeof document !== "undefined" &&
            document.body.dataset.modalOpen === "true";
          if (modalOpen) {
            window.dispatchEvent(new CustomEvent("hardware-back"));
            return;
          }

          // 3. Rutas operativas root: intentar minimizar; si no, no-op.
          if (ROOT_OPERATIVE_PATHS.has(pathname)) {
            App.minimizeApp?.().catch(() => { /* sin acción si no hay API */ });
            return;
          }

          // 4. Comportamiento normal: navegar atrás conservando estado.
          router.back();
        });

        removeFn = () => handle.remove();
      } catch {
        // Sin Capacitor (web). El listener no aplica.
      }
    })();

    return () => {
      cancelled = true;
      if (removeFn) removeFn().catch(() => { /* noop */ });
    };
  }, [router, pathname]);
}
