"use client";
/* ════════════════════════════════════════════════════════════════
   WARMTECH · Design-system atoms for the MRTPVREST tenant panel.
   Responsive (mobile-first, scales at md+). Consumes the canonical
   CSS-var tokens in app/globals.css, so the WarmTech palette applies
   automatically: warm Sand/Ember on mobile (media query) and a warm
   accent on desktop via the `.warmtech-shell` wrapper that WtScreen
   adds. Replaces the ad-hoc inline atoms previously living inside
   WarmtechDashboard.

   Icons: lucide-react (already a project dependency).
   ════════════════════════════════════════════════════════════════ */
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

/* ── helpers ─────────────────────────────────────────────────────── */
export const money = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value || 0);

export type Tone = "ac" | "ok" | "warn" | "err" | "info" | "neutral";

const TONE_FG: Record<Tone, string> = {
  ac: "var(--brand-primary)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  err: "var(--err)",
  info: "var(--info)",
  neutral: "var(--tx-mut)",
};
const TONE_BG: Record<Tone, string> = {
  ac: "var(--iris-soft)",
  ok: "var(--ok-soft)",
  warn: "var(--warn-soft)",
  err: "var(--err-soft)",
  info: "var(--info-soft)",
  neutral: "var(--surf-2)",
};

/* ── layout: screen shell ────────────────────────────────────────── */
export function WtScreen({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`warmtech-shell warmtech-enter mx-auto w-full max-w-[1320px] px-[18px] pb-28 pt-3 md:px-8 md:pb-12 md:pt-6 ${className}`}
    >
      {children}
    </div>
  );
}

/* ── desktop page header (mobile uses MobileAdminChrome header) ───── */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 hidden items-end justify-between gap-4 md:flex">
      <div className="min-w-0">
        {eyebrow && (
          <div className="font-mono text-[11px] uppercase tracking-[.16em] text-primary">
            {eyebrow}
          </div>
        )}
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-.04em] text-tx-hi">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-sm text-tx-mut">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ── card ────────────────────────────────────────────────────────── */
export function WtCard({
  children,
  className = "",
  style,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`warmtech-card ${onClick ? "cursor-pointer transition-transform active:scale-[.99]" : ""} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

/* ── section labels ──────────────────────────────────────────────── */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 mt-6 px-1 font-mono text-[10px] uppercase tracking-[.14em] text-tx-dim">
      {children}
    </div>
  );
}

export function SectionHead({
  title,
  action,
  href,
  onAction,
}: {
  title: string;
  action?: string;
  href?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-3 mt-6 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-base font-extrabold text-tx-hi md:text-xl">
        {title}
      </h2>
      {action &&
        (href ? (
          <Link
            href={href}
            className="flex min-h-9 items-center gap-1 text-xs font-bold text-primary"
          >
            {action} <ChevronRight size={14} />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="flex min-h-9 items-center gap-1 text-xs font-bold text-primary"
          >
            {action} <ChevronRight size={14} />
          </button>
        ))}
    </div>
  );
}

/* ── pill (status badge with optional live dot) ──────────────────── */
export function Pill({
  tone = "ac",
  live = false,
  children,
}: {
  tone?: Tone;
  live?: boolean;
  children: ReactNode;
}) {
  const fg = TONE_FG[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] font-mono text-[10.5px] font-semibold tracking-[.02em]"
      style={{ color: fg, background: TONE_BG[tone] }}
    >
      <span
        className={live ? "animate-pulse" : ""}
        style={{ width: 5, height: 5, borderRadius: 3, background: fg, display: "inline-block" }}
      />
      {children}
    </span>
  );
}

/* ── delta (signed percentage) ───────────────────────────────────── */
export function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <span
      className="font-mono text-[10px] font-semibold"
      style={{ color: up ? "var(--ok)" : "var(--err)" }}
    >
      {up ? "+" : ""}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}

/* ── icon badge (rounded icon container) ─────────────────────────── */
export function IconBadge({
  icon: Icon,
  tone = "ac",
  size = 34,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: number;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[10px]"
      style={{ width: size, height: size, background: TONE_BG[tone], color: TONE_FG[tone] }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.9} />
    </span>
  );
}

/* ── stat tile (KPI card) ────────────────────────────────────────── */
export function StatTile({
  icon: Icon,
  value,
  label,
  delta,
  deltaUp = true,
}: {
  icon?: LucideIcon;
  value: ReactNode;
  label: string;
  delta?: string;
  deltaUp?: boolean;
}) {
  return (
    <WtCard className="p-3 md:p-4">
      <div className="flex min-h-6 items-center justify-between">
        {Icon ? (
          <span
            className="grid h-6 w-6 place-items-center rounded-lg text-primary"
            style={{ background: "var(--iris-soft)" }}
          >
            <Icon size={13} strokeWidth={1.9} />
          </span>
        ) : (
          <span />
        )}
        {delta && (
          <span
            className="font-mono text-[10.5px] font-semibold"
            style={{ color: deltaUp ? "var(--ok)" : "var(--err)" }}
          >
            {delta}
          </span>
        )}
      </div>
      <div className="mt-2 font-display text-[22px] font-extrabold leading-none text-tx-hi md:text-2xl">
        {value}
      </div>
      <div className="mt-1 text-[11px] text-tx-mut">{label}</div>
    </WtCard>
  );
}

/* ── segmented control ───────────────────────────────────────────── */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: readonly { value: T; label: string }[] | readonly T[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const items = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <div
      className={`flex gap-1 rounded-[13px] p-1 ${className}`}
      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
    >
      {items.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="min-h-10 flex-1 rounded-[10px] px-2 text-xs font-bold transition-colors"
            style={{
              color: active ? "#fffaf4" : "var(--tx-mut)",
              background: active
                ? "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))"
                : "transparent",
              boxShadow: active ? "0 3px 10px var(--iris-glow)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── filter chips (horizontal scroll) ────────────────────────────── */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: readonly { value: T; label: string }[] | readonly T[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const items = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <div className={`flex gap-2 overflow-x-auto warmtech-scrollbar ${className}`}>
      {items.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="min-h-10 shrink-0 rounded-full px-3.5 text-xs font-bold transition-colors"
            style={{
              border: `1px solid ${active ? "transparent" : "var(--bd-1)"}`,
              color: active ? "#fffaf4" : "var(--tx-mut)",
              background: active ? "var(--brand-primary)" : "var(--surf-1)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── setting / nav row ───────────────────────────────────────────── */
export function SettingRow({
  icon: Icon,
  emoji,
  label,
  sub,
  right,
  href,
  onClick,
  danger = false,
  hot = false,
  badge,
  last = false,
}: {
  icon?: LucideIcon;
  emoji?: string;
  label: string;
  sub?: string;
  right?: ReactNode;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  hot?: boolean;
  badge?: string;
  last?: boolean;
}) {
  const interactive = Boolean(href || onClick);
  const inner = (
    <>
      {(Icon || emoji) && (
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[17px]"
          style={{ background: hot ? "var(--iris-soft)" : "var(--surf-2)" }}
        >
          {emoji ? (
            emoji
          ) : Icon ? (
            <Icon
              size={17}
              strokeWidth={1.9}
              style={{
                color: danger
                  ? "var(--err)"
                  : hot
                    ? "var(--brand-primary)"
                    : "var(--tx-mid)",
              }}
            />
          ) : null}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div
          className="flex items-center gap-2 text-[13.5px] font-semibold"
          style={{ color: danger ? "var(--err)" : "var(--tx)" }}
        >
          <span className="truncate">{label}</span>
          {badge && (
            <span
              className="shrink-0 rounded font-mono text-[8.5px] tracking-[.05em]"
              style={{
                padding: "2px 5px",
                background: "var(--brand-primary)",
                color: "#fffaf4",
              }}
            >
              {badge}
            </span>
          )}
        </div>
        {sub && <div className="mt-0.5 truncate text-[11px] text-tx-mut">{sub}</div>}
      </div>
      {right !== undefined
        ? right
        : interactive && <ChevronRight size={16} className="shrink-0 text-tx-dim" />}
    </>
  );

  const cls =
    "flex min-h-14 w-full items-center gap-3 px-4 text-left";
  const border: CSSProperties = last
    ? {}
    : { borderBottom: "1px solid var(--bd-1)" };

  if (href) {
    return (
      <Link href={href} className={cls} style={border}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} style={border}>
        {inner}
      </button>
    );
  }
  return (
    <div className={cls} style={border}>
      {inner}
    </div>
  );
}

/* ── read-only display field ─────────────────────────────────────── */
export function FormField({
  label,
  value,
  hint,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
        {label}
      </div>
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2.5"
        style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
      >
        <span
          className={`min-w-0 flex-1 truncate text-[13.5px] font-medium text-tx ${mono ? "font-mono" : ""}`}
        >
          {value}
        </span>
        {hint && <span className="shrink-0 text-[11px] text-tx-dim">{hint}</span>}
      </div>
    </div>
  );
}

/* ── buttons ─────────────────────────────────────────────────────── */
export function PrimaryBtn({
  children,
  onClick,
  href,
  icon: Icon,
  ghost = false,
  danger = false,
  full = true,
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  icon?: LucideIcon;
  ghost?: boolean;
  danger?: boolean;
  full?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const style: CSSProperties = danger
    ? { background: "var(--err-soft)", color: "var(--err)", border: "1px solid transparent" }
    : ghost
      ? { background: "var(--surf-2)", color: "var(--tx)", border: "1px solid var(--bd-2)" }
      : {
          background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))",
          color: "#fffaf4",
          boxShadow: "0 6px 18px var(--iris-glow)",
        };
  const cls = `inline-flex min-h-12 items-center justify-center gap-2 rounded-[13px] px-4 text-[13px] font-bold transition-transform active:scale-[.98] disabled:opacity-50 ${full ? "w-full" : ""}`;
  const content = (
    <>
      {Icon && <Icon size={16} strokeWidth={2} />}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} style={style}>
      {content}
    </button>
  );
}

/* ── toggle switch (controlled) ──────────────────────────────────── */
export function Toggle({
  checked,
  onChange,
  label = "Activar",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 rounded-full transition-transform active:scale-95"
      style={{
        width: 42,
        height: 25,
        border: "none",
        background: checked ? "var(--brand-primary)" : "var(--surf-3)",
        transition: "background .2s",
      }}
    >
      <span
        className="absolute rounded-full bg-white"
        style={{
          top: 3,
          left: checked ? 20 : 3,
          width: 19,
          height: 19,
          transition: "left .2s cubic-bezier(.5,1.5,.5,1)",
          boxShadow: "0 1px 3px rgba(0,0,0,.3)",
        }}
      />
    </button>
  );
}

/* ── progress bar ────────────────────────────────────────────────── */
export function ProgressBar({
  pct,
  tone = "ac",
  height = 6,
}: {
  pct: number;
  tone?: Tone;
  height?: number;
}) {
  const fill =
    tone === "ac"
      ? "linear-gradient(90deg,var(--brand-secondary),var(--brand-primary))"
      : TONE_FG[tone];
  return (
    <div
      className="overflow-hidden rounded-full"
      style={{ height, background: "var(--surf-3)" }}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(3, Math.min(100, pct))}%`, background: fill }}
      />
    </div>
  );
}

/* ── avatar (initials) ───────────────────────────────────────────── */
export function Avatar({
  initials,
  size = 40,
  gradient,
}: {
  initials: string;
  size?: number;
  gradient?: string;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center font-display font-extrabold"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        fontSize: size * 0.33,
        color: "#fffaf4",
        background:
          gradient || "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))",
      }}
    >
      {initials}
    </span>
  );
}

/* ── states: loading / error / empty ─────────────────────────────── */
export function LoadingCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-[18px] bg-surf-2" />
      ))}
    </div>
  );
}

export function ErrorState({
  title = "No pudimos cargar la información",
  hint = "Revisa tu conexión e inténtalo de nuevo.",
  onRetry,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <WtCard className="p-6 text-center">
      <div className="font-display text-lg font-extrabold text-tx-hi">{title}</div>
      <p className="mx-auto mt-2 max-w-sm text-sm text-tx-mut">{hint}</p>
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <PrimaryBtn onClick={onRetry} full={false}>
            Reintentar
          </PrimaryBtn>
        </div>
      )}
    </WtCard>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <WtCard className="flex flex-col items-center px-6 py-10 text-center">
      {Icon && (
        <span
          className="mb-3 grid h-12 w-12 place-items-center rounded-2xl text-tx-mut"
          style={{ background: "var(--surf-2)" }}
        >
          <Icon size={24} strokeWidth={1.8} />
        </span>
      )}
      <div className="font-display text-base font-extrabold text-tx-hi">{title}</div>
      {hint && <p className="mx-auto mt-1.5 max-w-xs text-sm text-tx-mut">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </WtCard>
  );
}
