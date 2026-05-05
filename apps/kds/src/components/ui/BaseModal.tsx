"use client";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export type BaseModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  closeOnOverlay?: boolean;
  closeOnEsc?: boolean;
  hideCloseButton?: boolean;
  contentClassName?: string;
};

const SIZE: Record<NonNullable<BaseModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export default function BaseModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnOverlay = true,
  closeOnEsc = true,
  hideCloseButton = false,
  contentClassName,
}: BaseModalProps) {
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closeOnEsc, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={() => closeOnOverlay && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${SIZE[size]} rounded-2xl flex flex-col max-h-[90vh] ${contentClassName ?? ""}`}
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
          color: "var(--text-primary)",
        }}
      >
        {(title || !hideCloseButton) && (
          <header
            className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex flex-col gap-1 min-w-0">
              {title && (
                <h2
                  className="text-lg font-bold leading-tight"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
                >
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0"
                style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
              >
                <X size={16} />
              </button>
            )}
          </header>
        )}

        <div className="px-6 py-5 overflow-y-auto scrollbar-hide flex-1">{children}</div>

        {footer && (
          <footer
            className="px-6 py-4 border-t flex items-center justify-end gap-2"
            style={{ borderColor: "var(--border)" }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
