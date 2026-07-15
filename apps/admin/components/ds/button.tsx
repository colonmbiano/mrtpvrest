"use client";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Loader2, type LucideIcon } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))",
    color: "var(--accent-contrast)",
    border: "1px solid transparent",
    boxShadow: "0 6px 18px var(--accent-glow)",
  },
  secondary: {
    background: "var(--surf-1)",
    color: "var(--tx)",
    border: "1px solid var(--bd-2)",
  },
  ghost: {
    background: "transparent",
    color: "var(--tx-mid)",
    border: "1px solid transparent",
  },
  danger: {
    background: "var(--err-soft)",
    color: "var(--err)",
    border: "1px solid transparent",
  },
};

export function Button({
  children,
  onClick,
  href,
  icon: Icon,
  variant = "primary",
  size = "md",
  full = false,
  type = "button",
  disabled = false,
  loading = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  icon?: LucideIcon;
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const sizing = size === "sm" ? "min-h-9 px-3 text-[12px] rounded-[10px]" : "min-h-11 px-4 text-[13px] rounded-ds-md";
  const cls = `inline-flex items-center justify-center gap-2 font-bold transition-transform active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none ${sizing} ${full ? "w-full" : ""} ${className}`;
  const style = VARIANT[variant];
  const content = (
    <>
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon && <Icon size={16} strokeWidth={2} />}
      {children}
    </>
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={cls} style={style}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={cls} style={style}>
      {content}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  variant = "secondary",
  size = 40,
  danger = false,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: number;
  danger?: boolean;
  disabled?: boolean;
}) {
  const style = danger ? VARIANT.danger : VARIANT[variant];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid shrink-0 place-items-center rounded-[10px] transition-transform active:scale-95 disabled:opacity-50"
      style={{ width: size, height: size, ...style, boxShadow: "none" }}
    >
      <Icon size={Math.round(size * 0.45)} strokeWidth={2} />
    </button>
  );
}
