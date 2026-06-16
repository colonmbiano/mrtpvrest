"use client";

/**
 * /apps/tpv/src/app/error.tsx — error boundary global de Next.js.
 *
 * Sin este archivo, cualquier excepción de React no capturada hace que
 * el WebView de Android muestre su pantalla genérica "This page couldn't
 * load. Reload to try again, or go back" — que no da pistas del error
 * real ni un camino claro de recuperación.
 *
 * Con este boundary:
 *   - El usuario ve un mensaje localizado con el detalle del error.
 *   - Puede reintentar in-situ (reset()) o volver al hub.
 *   - El error se loguea a consola para diagnostico via adb logcat /
 *     Chrome DevTools remoto (chrome://inspect).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[TPV ErrorBoundary]", error);
  }, [error]);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[var(--bg)] px-6 py-8 text-white overflow-y-auto"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400 mb-5">
        <AlertTriangle size={26} strokeWidth={2.5} />
      </div>

      <h1 className="text-2xl font-black tracking-tight text-white mb-2 text-center">
        Algo salió mal
      </h1>
      <p className="text-sm font-semibold text-white/55 text-center max-w-md mb-6">
        No pudimos cargar esta pantalla. Intenta de nuevo, o vuelve al inicio.
      </p>

      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 max-w-md w-full mb-6">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-1.5">
          Detalle del error
        </p>
        <p className="text-xs font-mono text-white/65 break-words leading-relaxed">
          {error?.message || "Error desconocido"}
        </p>
        {error?.digest && (
          <p className="text-[10px] font-mono text-white/30 mt-2">
            ID: {error.digest}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 w-full max-w-md">
        <button
          type="button"
          onClick={reset}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-black uppercase tracking-[0.2em] text-[var(--brand-fg)] transition-colors active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
        >
          <RefreshCw size={16} strokeWidth={2.5} /> Reintentar
        </button>
        <button
          type="button"
          onClick={() => router.push("/hub")}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-black uppercase tracking-[0.2em] text-white/85 transition-colors active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <Home size={16} strokeWidth={2.5} /> Volver al inicio
        </button>
      </div>
    </div>
  );
}
