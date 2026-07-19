"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./button";

/* El overlay usa `fixed inset-0`: los e2e localizan modales con `.fixed.inset-0`. */

/*
 * Bloqueo de scroll del body con contador: con modales anidados (p.ej. un
 * ConfirmDialog encima de un Modal) el que se cierra primero no debe devolver
 * el scroll mientras el de atrás siga abierto.
 */
let scrollLocks = 0;
let prevBodyOverflow = "";

function lockBodyScroll() {
  if (scrollLocks === 0) {
    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLocks += 1;
  return () => {
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) document.body.style.overflow = prevBodyOverflow;
  };
}

function Overlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const unlock = lockBodyScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [onClose]);

  if (!mounted) return null;

  /*
   * Portal a <body>: `position: fixed` se resuelve contra el ancestro más
   * cercano con `transform`/`filter`/`contain`, no contra el viewport. Los
   * modales viven dentro de <PageShell>, así que cualquier transform en la
   * página los anclaba al alto del documento y quedaban fuera de pantalla
   * (sin poder desplazarse, porque el body está bloqueado). El portal los
   * saca del árbol de la página y los inmuniza.
   */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(11,18,32,.55)", backdropFilter: "blur(2px)" }}
      />
      {children}
    </div>,
    document.body,
  );
}

const SIZES = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" } as const;

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  footer,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  size?: keyof typeof SIZES;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`ds-enter relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-ds-xl pb-[env(safe-area-inset-bottom)] md:rounded-ds-xl md:pb-0 ${SIZES[size]}`}
        /* `dvh` descuenta la barra de URL del navegador móvil; los navegadores
           que no la soporten descartan esta línea y usan el `92vh` de la clase. */
        style={{ maxHeight: "92dvh", background: "var(--surf-1)", border: "1px solid var(--bd-1)", boxShadow: "var(--shadow-lg)" }}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--bd-1)" }}>
            <div className="min-w-0">
              {title && <h2 className="truncate font-display text-lg font-extrabold text-tx-hi">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-[12px] text-tx-mut">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-tx-mid"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="ds-scrollbar min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: "var(--bd-1)", background: "var(--surf-2)" }}>
            {footer}
          </div>
        )}
      </div>
    </Overlay>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  footer,
  side = "right",
  width = 480,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  side?: "right" | "left";
  width?: number;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`ds-enter absolute inset-y-0 flex w-full flex-col overflow-hidden md:w-auto ${side === "right" ? "right-0" : "left-0"}`}
        style={{ background: "var(--surf-1)", boxShadow: "var(--shadow-lg)", maxWidth: "100vw", width }}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--bd-1)" }}>
          <div className="min-w-0">
            {title && <h2 className="truncate font-display text-lg font-extrabold text-tx-hi">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12px] text-tx-mut">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-tx-mid"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="ds-scrollbar min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: "var(--bd-1)", background: "var(--surf-2)" }}>
            {footer}
          </div>
        )}
      </div>
    </Overlay>
  );
}

/* ── ConfirmDialog + useConfirm(): sustituye window.confirm ──────── */
type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setCurrent(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setCurrent(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {current && (
        <Overlay onClose={() => settle(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={current.title}
            className="ds-enter relative max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-t-ds-xl p-5 pb-[max(20px,env(safe-area-inset-bottom))] md:rounded-ds-xl md:pb-5"
            style={{ maxHeight: "92dvh", background: "var(--surf-1)", border: "1px solid var(--bd-1)", boxShadow: "var(--shadow-lg)" }}
          >
            <h2 className="font-display text-base font-extrabold text-tx-hi">{current.title}</h2>
            {current.body && <p className="mt-2 text-sm text-tx-mut">{current.body}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => settle(false)}>
                {current.cancelLabel ?? "Cancelar"}
              </Button>
              <Button variant={current.danger ? "danger" : "primary"} onClick={() => settle(true)}>
                {current.confirmLabel ?? "Confirmar"}
              </Button>
            </div>
          </div>
        </Overlay>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Fallback si el provider no está montado (p.ej. pantallas fuera del layout admin).
    return async (opts: ConfirmOptions) => window.confirm(opts.body ? `${opts.title}\n\n${opts.body}` : opts.title);
  }
  return ctx;
}
