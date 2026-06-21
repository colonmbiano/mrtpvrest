"use client";
/* ════════════════════════════════════════════════════════════════
   RETAIL · Componentes premium del rediseño del admin (tema claro).
   Tipo Shopify / Stripe / Linear: tarjetas blancas, sombras suaves,
   bordes redondeados grandes, acento verde. Consumen los tokens
   CSS-var de globals.css, así que respetan el acento del tenant.
   ════════════════════════════════════════════════════════════════ */
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { WtCard } from "./ui";

export type RetailTone = "green" | "orange" | "blue" | "purple" | "red" | "slate";

const TONE: Record<RetailTone, { fg: string; bg: string }> = {
  green:  { fg: "var(--ok)",   bg: "var(--ok-soft)"   },
  orange: { fg: "var(--warn)", bg: "var(--warn-soft)" },
  blue:   { fg: "var(--info)", bg: "var(--info-soft)" },
  purple: { fg: "#8b5cf6",     bg: "rgba(139,92,246,.12)" },
  red:    { fg: "var(--err)",  bg: "var(--err-soft)"  },
  slate:  { fg: "var(--tx-mut)", bg: "var(--surf-2)"  },
};

/* ── sparkline (SVG inline, sin dependencias) ────────────────────── */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const w = 88;
  const h = 30;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${w},${h} L0,${h} Z`;
  const id = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── StatCard (KPI premium) ──────────────────────────────────────── */
export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp = true,
  trendLabel,
  tone = "green",
  sparkline,
}: {
  title: string;
  value: ReactNode;
  icon?: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  trendLabel?: string;
  tone?: RetailTone;
  sparkline?: number[];
}) {
  const t = TONE[tone];
  const TrendIcon = trendUp ? ArrowUpRight : ArrowDownRight;
  return (
    <WtCard className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-tx-mut">{title}</div>
          <div className="mt-2 font-display text-[26px] font-extrabold leading-none tracking-[-.02em] text-tx-hi md:text-[30px]">
            {value}
          </div>
        </div>
        {Icon && (
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
            style={{ background: t.bg, color: t.fg }}
          >
            <Icon size={20} strokeWidth={2} />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {trend && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold"
              style={{
                color: trendUp ? "var(--ok)" : "var(--err)",
                background: trendUp ? "var(--ok-soft)" : "var(--err-soft)",
              }}
            >
              <TrendIcon size={12} strokeWidth={2.4} />
              {trend}
            </span>
          )}
          {trendLabel && <span className="text-[11px] text-tx-dim">{trendLabel}</span>}
        </div>
        {sparkline && sparkline.length > 1 && <Sparkline data={sparkline} color={t.fg} />}
      </div>
    </WtCard>
  );
}

/* ── StatusBadge (estados de tabla) ──────────────────────────────── */
type StatusKey =
  | "disponible"
  | "stock_bajo"
  | "sin_stock"
  | "completado"
  | "en_proceso"
  | "pendiente"
  | "cancelado"
  | "activo"
  | "inactivo"
  | "en_linea"
  | "sin_conexion";

const STATUS: Record<StatusKey, { label: string; cls: string; dot?: boolean }> = {
  disponible:  { label: "Disponible",  cls: "bg-green-50 text-green-700 ring-1 ring-green-200" },
  stock_bajo:  { label: "Stock bajo",  cls: "bg-orange-50 text-orange-700 ring-1 ring-orange-200" },
  sin_stock:   { label: "Sin stock",   cls: "bg-red-50 text-red-700 ring-1 ring-red-200" },
  completado:  { label: "Completado",  cls: "bg-green-50 text-green-700 ring-1 ring-green-200" },
  en_proceso:  { label: "En proceso",  cls: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200" },
  pendiente:   { label: "Pendiente",   cls: "bg-slate-100 text-slate-600 ring-1 ring-slate-200" },
  cancelado:   { label: "Cancelado",   cls: "bg-red-50 text-red-700 ring-1 ring-red-200" },
  activo:      { label: "Activo",      cls: "bg-green-50 text-green-700 ring-1 ring-green-200", dot: true },
  inactivo:    { label: "Inactivo",    cls: "bg-slate-100 text-slate-500 ring-1 ring-slate-200", dot: true },
  en_linea:    { label: "En línea",    cls: "bg-green-50 text-green-700 ring-1 ring-green-200", dot: true },
  sin_conexion:{ label: "Sin conexión",cls: "bg-orange-50 text-orange-700 ring-1 ring-orange-200", dot: true },
};

export function StatusBadge({ status, children }: { status: StatusKey | string; children?: ReactNode }) {
  const meta = STATUS[status as StatusKey] ?? {
    label: String(status),
    cls: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${meta.cls}`}>
      {meta.dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children ?? meta.label}
    </span>
  );
}

/* ── DataCard (contenedor con título + acción) ───────────────────── */
export function DataCard({
  title,
  subtitle,
  action,
  href,
  onAction,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  subtitle?: string;
  action?: string;
  href?: string;
  onAction?: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <WtCard className={`overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--bd-1)" }}>
          <div className="min-w-0">
            {title && <h3 className="truncate font-display text-[15px] font-extrabold text-tx-hi">{title}</h3>}
            {subtitle && <p className="mt-0.5 truncate text-[12px] text-tx-mut">{subtitle}</p>}
          </div>
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
    </WtCard>
  );
}

/* ── ActionTile (acción rápida) ──────────────────────────────────── */
export function ActionTile({
  icon: Icon,
  label,
  sub,
  href,
  onClick,
  tone = "green",
}: {
  icon: LucideIcon;
  label: string;
  sub?: string;
  href?: string;
  onClick?: () => void;
  tone?: RetailTone;
}) {
  const t = TONE[tone];
  const inner = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: t.bg, color: t.fg }}>
        <Icon size={18} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-bold text-tx-hi">{label}</div>
        {sub && <div className="truncate text-[11px] text-tx-mut">{sub}</div>}
      </div>
    </>
  );
  const cls =
    "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors hover:bg-surf-2";
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

/* ── TablePagination ─────────────────────────────────────────────── */
export function TablePagination({
  page,
  pageCount,
  onPage,
  total,
}: {
  page: number;
  pageCount: number;
  onPage: (next: number) => void;
  total?: number;
}) {
  const canPrev = page > 1;
  const canNext = page < pageCount;
  const btn = "grid h-9 w-9 place-items-center rounded-xl border text-tx-mid transition-colors disabled:opacity-40";
  const btnStyle: CSSProperties = { borderColor: "var(--bd-1)", background: "var(--surf-1)" };
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-3">
      <span className="text-[12px] text-tx-mut">
        {total != null ? `${total} resultados · ` : ""}Página {page} de {Math.max(1, pageCount)}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} style={btnStyle} disabled={!canPrev} onClick={() => canPrev && onPage(page - 1)} aria-label="Página anterior">
          <ChevronLeft size={16} />
        </button>
        <button type="button" className={btn} style={btnStyle} disabled={!canNext} onClick={() => canNext && onPage(page + 1)} aria-label="Página siguiente">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ── SectionTabs (tabs de Configuración) ─────────────────────────── */
export function SectionTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { value: T; label: string; icon?: LucideIcon; sub?: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto warmtech-scrollbar pb-1">
      {tabs.map((tab) => {
        const active = tab.value === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className="flex min-w-[140px] shrink-0 items-center gap-3 rounded-2xl border p-3 text-left transition-colors"
            style={{
              borderColor: active ? "var(--brand-primary)" : "var(--bd-1)",
              background: active ? "var(--iris-soft)" : "var(--surf-1)",
            }}
          >
            {Icon && (
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                style={{
                  background: active ? "var(--brand-primary)" : "var(--surf-2)",
                  color: active ? "#fff" : "var(--tx-mut)",
                }}
              >
                <Icon size={17} strokeWidth={2} />
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold" style={{ color: active ? "var(--tx-hi)" : "var(--tx-mid)" }}>
                {tab.label}
              </div>
              {tab.sub && <div className="truncate text-[11px] text-tx-mut">{tab.sub}</div>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
