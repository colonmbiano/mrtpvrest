"use client";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { usePOSStore } from "@/store/usePOSStore";
import { useHardwareBack } from "@/hooks/useHardwareBack";
import { usePromoSync } from "@/hooks/usePromoSync";
import {
  readUiScale,
  applyUiScale,
  UI_SCALE_CHANGED_EVENT,
} from "@/lib/appearance";

/**
 * Aplica el tamaño de letra UI persistido en localStorage al boot y se
 * mantiene en sync si cambia en caliente (ConfigMenu o /admin/apariencia
 * emiten `ui-scale-changed`). Lógica centralizada en `@/lib/appearance`.
 */
function useUiScale(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => applyUiScale(readUiScale());
    sync();
    window.addEventListener(UI_SCALE_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(UI_SCALE_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
}

/**
 * Lightweight root: aplica el tamaño de letra UI y monta el Toaster global.
 *
 * Aquí también se engancha el hardware Back button de Android (Capacitor)
 * a la navegación de Next.js, para que el personal no cierre la app por
 * accidente al apretar Atrás en menús de configuración.
 */
export default function ModalRoot({ children }: { children: ReactNode }) {
  const mode = usePOSStore((s) => s.mode);
  useHardwareBack();
  useUiScale();
  // Sincroniza las promos del negocio (solo si el doble pantalla está activo).
  usePromoSync();

  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        theme={mode}
        richColors
        closeButton
        toastOptions={{
          style: {
            background: "var(--surface-1)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          },
        }}
      />
    </>
  );
}
