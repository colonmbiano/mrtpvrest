"use client";
import React, { useEffect, useState } from "react";
import { Download, X, Monitor } from "lucide-react";

export default function TPVInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        // @ts-expect-error navigator.standalone exists on iOS Safari
        Boolean(window.navigator.standalone))
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [isStandalone]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsStandalone(true);
      setDeferredPrompt(null);
    }
  };

  if (isStandalone || !deferredPrompt || dismissed) return null;

  return (
    <aside
      aria-label="Instalación de Punto de Venta"
      className="fixed bottom-4 right-4 z-50 max-w-sm p-4 rounded-2xl bg-[var(--surface-1)] border border-white/15 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <div className="w-10 h-10 rounded-xl bg-[var(--brand-soft)] border border-[var(--brand)]/30 flex items-center justify-center text-[var(--brand)] shrink-0">
        <Monitor size={20} strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-xs font-bold text-white tracking-wide">
          Instalar TPV en esta PC
        </h3>
        <p className="text-[11px] text-white/50 leading-tight mt-0.5">
          Abre en pantalla completa y opera 100% offline.
        </p>
      </div>
      <button
        onClick={handleInstall}
        className="px-3 py-1.5 rounded-lg bg-[var(--brand)] text-[var(--brand-fg)] text-xs font-black shrink-0 active:scale-95 transition-transform flex items-center gap-1.5"
      >
        <Download size={13} strokeWidth={3} />
        Instalar
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-white/40 hover:text-white/80 p-1 shrink-0"
        aria-label="Cerrar aviso de instalación"
      >
        <X size={14} />
      </button>
    </aside>
  );
}
