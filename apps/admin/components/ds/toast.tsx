"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; text: string };

type ToastApi = {
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const KIND_META: Record<ToastKind, { icon: typeof CheckCircle2; fg: string; bg: string }> = {
  success: { icon: CheckCircle2, fg: "var(--ok)", bg: "var(--ok-soft)" },
  error: { icon: AlertCircle, fg: "var(--err)", bg: "var(--err-soft)" },
  info: { icon: Info, fg: "var(--info)", bg: "var(--info-soft)" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-3), { id, kind, text }]);
    const ttl = kind === "error" ? 6000 : 3500;
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ttl);
  }, []);

  const api: ToastApi = {
    success: (text) => push("success", text),
    error: (text) => push("error", text),
    info: (text) => push("info", text),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-8" role="status" aria-live="polite">
          {toasts.map((toast) => {
            const meta = KIND_META[toast.kind];
            const Icon = meta.icon;
            return (
              <div
                key={toast.id}
                className="ds-enter pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-ds-md px-3.5 py-3 text-[13px] font-semibold"
                style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", boxShadow: "var(--shadow-lg)", color: "var(--tx)" }}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: meta.bg, color: meta.fg }}>
                  <Icon size={15} strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1">{toast.text}</span>
                <button
                  type="button"
                  aria-label="Cerrar aviso"
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  className="shrink-0 text-tx-dim transition-colors hover:text-tx"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}

const FALLBACK: ToastApi = {
  success: () => {},
  error: (text) => window.alert(text),
  info: () => {},
};

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? FALLBACK;
}
