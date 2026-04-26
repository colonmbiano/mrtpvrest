"use client";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { ModalProvider } from "@/contexts/ModalContext";
import { usePOSStore } from "@/store/usePOSStore";

/**
 * Lightweight root: provides ModalContext + Toaster app-wide.
 * Each page mounts its own <ModalStack handlers={...}/> with its
 * domain-specific callbacks.
 */
export default function ModalRoot({ children }: { children: ReactNode }) {
  const mode = usePOSStore((s) => s.mode);

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
