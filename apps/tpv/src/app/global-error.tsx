"use client";

/**
 * /apps/tpv/src/app/global-error.tsx — error boundary del root layout.
 *
 * error.tsx atrapa errores dentro de un layout, pero NO atrapa errores
 * en el RootLayout en sí. global-error.tsx es el último recurso: si el
 * layout raíz revienta (Auth/ModalRoot/SyncInitializer, etc.), este
 * componente se monta como reemplazo total — por eso debe renderizar
 * su propio <html><body>.
 *
 * Sin este boundary, un error en el layout raíz deja el WebView con la
 * pantalla genérica "This page couldn't load" de Chromium.
 */

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[TPV GlobalErrorBoundary]", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          background: "var(--bg, #0C0C0E)",
          color: "#fff",
          fontFamily: "'Outfit', system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.5rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "rgba(248,113,113,0.10)",
            border: "1px solid rgba(248,113,113,0.30)",
            color: "#f87171",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <AlertTriangle size={26} strokeWidth={2.5} />
        </div>

        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 900,
            letterSpacing: "-0.02em",
            margin: "0 0 8px",
          }}
        >
          Error inesperado
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "rgba(255,255,255,0.55)",
            maxWidth: 420,
            margin: "0 0 24px",
            lineHeight: 1.5,
          }}
        >
          La aplicación encontró un problema crítico. Reinicia para continuar.
        </p>

        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 16,
            padding: "12px 16px",
            maxWidth: 420,
            width: "100%",
            marginBottom: 24,
            textAlign: "left",
          }}
        >
          <p
            style={{
              fontSize: "0.625rem",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: "rgba(255,255,255,0.35)",
              margin: "0 0 6px",
            }}
          >
            Detalle del error
          </p>
          <p
            style={{
              fontSize: "0.75rem",
              fontFamily: "ui-monospace, monospace",
              color: "rgba(255,255,255,0.65)",
              wordBreak: "break-word",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {error?.message || "Error desconocido"}
          </p>
          {error?.digest && (
            <p
              style={{
                fontSize: "0.625rem",
                fontFamily: "ui-monospace, monospace",
                color: "rgba(255,255,255,0.30)",
                marginTop: 8,
                marginBottom: 0,
              }}
            >
              ID: {error.digest}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={reset}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            height: 48,
            width: "100%",
            maxWidth: 420,
            borderRadius: 12,
            background: "var(--brand, #34C988)",
            color: "var(--brand-fg, #0B1410)",
            fontSize: "0.875rem",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            border: "none",
            cursor: "pointer",
          }}
        >
          <RefreshCw size={16} strokeWidth={2.5} /> Reintentar
        </button>
      </body>
    </html>
  );
}
