"use client";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/* ── Card base ───────────────────────────────────────────────────── */
export function Card({
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
      className={`rounded-ds-xl shadow-card ${onClick ? "cursor-pointer transition-transform active:scale-[.99]" : ""} ${className}`}
      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", ...style }}
    >
      {children}
    </div>
  );
}

/* ── Encabezados de sección ──────────────────────────────────────── */
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
      <h2 className="font-display text-base font-extrabold text-tx-hi md:text-xl">{title}</h2>
      {action &&
        (href ? (
          <Link href={href} className="flex min-h-9 items-center gap-1 text-xs font-bold text-primary">
            {action} <ChevronRight size={14} />
          </Link>
        ) : (
          <button type="button" onClick={onAction} className="flex min-h-9 items-center gap-1 text-xs font-bold text-primary">
            {action} <ChevronRight size={14} />
          </button>
        ))}
    </div>
  );
}

/* ── DataCard: contenedor con header + acción ────────────────────── */
export function DataCard({
  title,
  subtitle,
  action,
  href,
  onAction,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  subtitle?: string;
  action?: string;
  href?: string;
  onAction?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      {(title || action || actions) && (
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--bd-1)" }}>
          <div className="min-w-0">
            {title && <h3 className="truncate font-display text-[15px] font-extrabold text-tx-hi">{title}</h3>}
            {subtitle && <p className="mt-0.5 truncate text-[12px] text-tx-mut">{subtitle}</p>}
          </div>
          {actions}
          {action &&
            (href ? (
              <Link href={href} className="flex shrink-0 items-center gap-1 text-[12px] font-bold text-primary">
                {action} <ChevronRight size={14} />
              </Link>
            ) : (
              <button type="button" onClick={onAction} className="flex shrink-0 items-center gap-1 text-[12px] font-bold text-primary">
                {action} <ChevronRight size={14} />
              </button>
            ))}
        </div>
      )}
      <div className={bodyClassName || "p-5"}>{children}</div>
    </Card>
  );
}

/* ── ActionTile: acceso rápido con icono ─────────────────────────── */
import { TONE_BG, TONE_FG, type Tone } from "./badge";
import type { LucideIcon } from "lucide-react";

export function ActionTile({
  icon: Icon,
  label,
  sub,
  href,
  onClick,
  tone = "ac",
}: {
  icon: LucideIcon;
  label: string;
  sub?: string;
  href?: string;
  onClick?: () => void;
  tone?: Tone;
}) {
  const inner = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: TONE_BG[tone], color: TONE_FG[tone] }}>
        <Icon size={18} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-bold text-tx-hi">{label}</div>
        {sub && <div className="truncate text-[11px] text-tx-mut">{sub}</div>}
      </div>
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-ds-lg border p-3 text-left transition-colors hover:bg-surf-2";
  const style: CSSProperties = { borderColor: "var(--bd-1)", background: "var(--surf-1)" };
  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} style={style}>
      {inner}
    </button>
  );
}

/* ── SettingRow: fila de lista/ajustes ───────────────────────────── */
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
          style={{ background: hot ? "var(--accent-soft)" : "var(--surf-2)" }}
        >
          {emoji ? (
            emoji
          ) : Icon ? (
            <Icon
              size={17}
              strokeWidth={1.9}
              style={{ color: danger ? "var(--err)" : hot ? "var(--brand-primary)" : "var(--tx-mid)" }}
            />
          ) : null}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: danger ? "var(--err)" : "var(--tx)" }}>
          <span className="truncate">{label}</span>
          {badge && (
            <span
              className="shrink-0 rounded font-mono text-[8.5px] tracking-[.05em]"
              style={{ padding: "2px 5px", background: "var(--brand-primary)", color: "var(--accent-contrast)" }}
            >
              {badge}
            </span>
          )}
        </div>
        {sub && <div className="mt-0.5 truncate text-[11px] text-tx-mut">{sub}</div>}
      </div>
      {right !== undefined ? right : interactive && <ChevronRight size={16} className="shrink-0 text-tx-dim" />}
    </>
  );

  const cls = "flex min-h-14 w-full items-center gap-3 px-4 text-left";
  const border: CSSProperties = last ? {} : { borderBottom: "1px solid var(--bd-1)" };

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
