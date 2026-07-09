"use client";
import type { ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from "lucide-react";
import { Card } from "./card";
import { TONE_BG, TONE_FG, type Tone } from "./badge";

/* ── Sparkline SVG sin dependencias ──────────────────────────────── */
export function Sparkline({ data, color = "var(--brand-primary)" }: { data: number[]; color?: string }) {
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

/* ── StatCard: KPI grande con tendencia y sparkline ──────────────── */
export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp = true,
  trendLabel,
  tone = "ac",
  sparkline,
}: {
  title: string;
  value: ReactNode;
  icon?: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  trendLabel?: string;
  tone?: Tone;
  sparkline?: number[];
}) {
  const TrendIcon = trendUp ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-tx-mut">{title}</div>
          <div className="mt-2 font-display text-[26px] font-extrabold leading-none tracking-[-.02em] text-tx-hi md:text-[30px]">
            {value}
          </div>
        </div>
        {Icon && (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-ds-lg" style={{ background: TONE_BG[tone], color: TONE_FG[tone] }}>
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
        {sparkline && sparkline.length > 1 && <Sparkline data={sparkline} color={TONE_FG[tone]} />}
      </div>
    </Card>
  );
}

/* ── StatTile: KPI compacto ──────────────────────────────────────── */
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
    <Card className="p-3 md:p-4">
      <div className="flex min-h-6 items-center justify-between">
        {Icon ? (
          <span className="grid h-6 w-6 place-items-center rounded-lg text-primary" style={{ background: "var(--accent-soft)" }}>
            <Icon size={13} strokeWidth={1.9} />
          </span>
        ) : (
          <span />
        )}
        {delta && (
          <span className="font-mono text-[10.5px] font-semibold" style={{ color: deltaUp ? "var(--ok)" : "var(--err)" }}>
            {delta}
          </span>
        )}
      </div>
      <div className="mt-2 font-display text-[22px] font-extrabold leading-none text-tx-hi md:text-2xl">{value}</div>
      <div className="mt-1 text-[11px] text-tx-mut">{label}</div>
    </Card>
  );
}

/* ── Delta: porcentaje con signo ─────────────────────────────────── */
export function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <span className="font-mono text-[10px] font-semibold" style={{ color: up ? "var(--ok)" : "var(--err)" }}>
      {up ? "+" : ""}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}

/* ── ProgressBar ─────────────────────────────────────────────────── */
export function ProgressBar({ pct, tone = "ac", height = 6 }: { pct: number; tone?: Tone; height?: number }) {
  const fill = tone === "ac" ? "linear-gradient(90deg,var(--brand-secondary),var(--brand-primary))" : TONE_FG[tone];
  return (
    <div className="overflow-hidden rounded-full" style={{ height, background: "var(--surf-3)" }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, pct))}%`, background: fill }} />
    </div>
  );
}
