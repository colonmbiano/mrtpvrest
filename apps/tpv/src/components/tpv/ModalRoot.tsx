"use client";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { ModalProvider } from "@/contexts/ModalContext";
import { usePOSStore } from "@/store/usePOSStore";
import { useHardwareBack } from "@/hooks/useHardwareBack";

/**
 * Lightweight root: provides ModalContext + Toaster app-wide.
 * Each page mounts its own <ModalStack handlers={...}/> with its
 * domain-specific callbacks.
 *
 * Aquí también se engancha el hardware Back button de Android (Capacitor)
 * a la navegación de Next.js, para que el personal no cierre la app por
 * accidente al apretar Atrás en menús de configuración.
 */
export default function ModalRoot({ children }: { children: ReactNode }) {
  const mode = usePOSStore((s) => s.mode);
  useHardwareBack();

  return (
    <ModalProvider>
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
    </ModalProvider>
  );
}
