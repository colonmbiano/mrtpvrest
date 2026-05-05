"use client";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { ModalProvider } from "@/contexts/ModalContext";
import ModalStack, { type ModalStackHandlers } from "./ModalStack";
import { usePOSStore } from "@/store/usePOSStore";

export default function TPVLayoutWrapper({
  children,
  handlers,
}: {
  children: ReactNode;
  handlers?: ModalStackHandlers;
}) {
  const mode = usePOSStore((s) => s.mode);

  return (
    <ModalProvider>
      {children}
      <ModalStack {...(handlers ?? {})} />
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
