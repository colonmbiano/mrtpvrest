"use client";

/**
 * ConfirmModal — confirmación in-app (reemplazo de window.confirm).
 *
 * En la APK (Capacitor WebView) `window.confirm()` es síncrono y bloquea el
 * hilo JS; si el diálogo nativo no llega a mostrarse, el flujo queda "trabado"
 * (el caso reportado al anular un producto ya enviado a cocina). Este modal es
 * React puro —se renderiza confiablemente como el resto de modales del TPV— y
 * no bloquea el hilo.
 *
 * Usa los tokens Fresco del TPV (var(--brand), etc.) y el mismo z-index alto
 * que GuestCountModal para quedar por encima de todo.
 */

import { AlertTriangle, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Pinta el botón de confirmar en rojo (acciones destructivas). */
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  onClose,
  onConfirm,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.5)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-white/10 bg-white/5">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border"
              style={{
                background: danger ? "var(--danger-soft, rgba(242,120,90,0.14))" : "var(--brand-soft, rgba(255,255,255,0.06))",
                borderColor: danger ? "var(--danger, #F2785A)" : "var(--brand)",
                color: danger ? "var(--danger, #F2785A)" : "var(--brand)",
              }}
            >
              <AlertTriangle size={18} strokeWidth={2.5} />
            </div>
            <h3 className="text-lg font-black text-white tracking-tight leading-snug pt-1">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 transition-transform text-white/85 flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mensaje */}
        <div className="px-6 py-5">
          <p className="text-sm font-semibold text-white/80 leading-relaxed">{message}</p>
        </div>

        {/* Acciones */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[56px] rounded-2xl text-sm font-black uppercase tracking-[0.15em] text-white/85 bg-white/5 border border-white/10 active:scale-95 transition-transform"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 min-h-[56px] rounded-2xl text-sm font-black uppercase tracking-[0.15em] active:scale-95 transition-transform"
            style={{
              background: danger ? "var(--danger, #F2785A)" : "var(--brand)",
              color: danger ? "#ffffff" : "var(--brand-fg)",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
