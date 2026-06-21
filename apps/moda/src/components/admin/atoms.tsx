"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

// ── Contexto del drawer (sidebar móvil) ──────────────────────────────────────
export const DrawerContext = createContext<{ open: () => void }>({ open: () => {} });
export const useDrawer = () => useContext(DrawerContext);

// ── Tonos de acento reutilizados por StatCard / iconos ───────────────────────
type Tone = "green" | "orange" | "blue" | "purple" | "red";
const toneStyle: Record<Tone, { bg: string; fg: string }> = {
  green: { bg: "var(--iris-soft)", fg: "var(--brand-dark)" },
  orange: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  blue: { bg: "var(--info-soft)", fg: "var(--info)" },
  purple: { bg: "var(--purple-soft)", fg: "var(--purple)" },
  red: { bg: "var(--err-soft)", fg: "var(--err)" },
};
const toneStroke: Record<Tone, string> = {
  green: "#22c55e", orange: "#f59e0b", blue: "#3b82f6", purple: "#8b5cf6", red: "#ef4444",
};

// ── Sparkline (mini curva) ───────────────────────────────────────────────────
export function Sparkline({ data, color = "#22c55e", w = 104, h = 36 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / range) * (h - 6)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gid = `sg-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true" className="shrink-0">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.18" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Gráfica de área de ventas (hoy vs ayer) ──────────────────────────────────
export function SalesAreaChart({ data, height = 210 }: { data: Array<{ h: string; hoy: number; ayer: number }>; height?: number }) {
  const W = 720, H = height, padL = 44, padB = 26, padT = 8, padR = 8;
  const max = Math.max(...data.map((d) => Math.max(d.hoy, d.ayer)), 1);
  const niceMax = Math.ceil(max / 2000) * 2000;
  const x = (i: number) => padL + (i / (data.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / niceMax) * (H - padT - padB);
  const path = (key: "hoy" | "ayer") => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const area = `${path("hoy")} L${x(data.length - 1).toFixed(1)},${H - padB} L${padL},${H - padB} Z`;
  const ticks = [0, niceMax / 4, niceMax / 2, (niceMax * 3) / 4, niceMax];
  const fmtK = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Ventas del día por hora, hoy vs ayer" style={{ display: "block" }}>
      <defs><linearGradient id="salesfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22c55e" stopOpacity="0.20" /><stop offset="1" stopColor="#22c55e" stopOpacity="0" /></linearGradient></defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="var(--font-dm-mono), monospace">{fmtK(t)}</text>
        </g>
      ))}
      {data.map((d, i) => (i % 2 === 0 ? <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8" fontFamily="var(--font-dm-mono), monospace">{d.h}</text> : null))}
      <path d={`${path("ayer")}`} fill="none" stroke="#cbd5e1" strokeWidth="1.6" strokeDasharray="3 3" />
      <path d={area} fill="url(#salesfill)" />
      <path d={path("hoy")} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── StatCard (KPI) ───────────────────────────────────────────────────────────
export function StatCard({ title, value, icon: Icon, tone = "green", trend, trendTone = "up", trendLabel, spark }: {
  title: string; value: string; icon: LucideIcon; tone?: Tone;
  trend?: string; trendTone?: "up" | "down" | "warn"; trendLabel?: string; spark?: number[];
}) {
  const ts = toneStyle[tone];
  const trendColor = trendTone === "warn" ? "var(--warn)" : trendTone === "down" ? "var(--err)" : "var(--ok)";
  const mark = trendTone === "warn" ? "⚠" : trendTone === "down" ? "▼" : "▲";
  return (
    <div className="rounded-[20px] border bg-[var(--surf-1)] p-4" style={{ borderColor: "var(--bd-1)", boxShadow: "var(--shadow-soft)" }}>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: ts.bg, color: ts.fg }}><Icon size={20} strokeWidth={2} /></span>
        <span className="text-[13px] font-semibold text-[var(--tx-mut)]">{title}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="tnum text-[26px] font-extrabold leading-none tracking-tight text-[var(--tx-hi)]" style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}>{value}</div>
          {trend && (
            <div className="mt-2 flex items-center gap-1.5 text-[12px]">
              <span className="tnum font-semibold" style={{ color: trendColor }}>{mark} {trend}</span>
              {trendLabel && <span className="text-[var(--tx-dim)]">{trendLabel}</span>}
            </div>
          )}
        </div>
        {spark && <Sparkline data={spark} color={toneStroke[tone]} />}
      </div>
    </div>
  );
}

// ── StatusBadge ──────────────────────────────────────────────────────────────
const statusStyles: Record<string, { bg: string; fg: string; dot?: boolean }> = {
  disponible: { bg: "var(--ok-soft)", fg: "var(--ok)", dot: true },
  stock_bajo: { bg: "var(--warn-soft)", fg: "var(--warn)", dot: true },
  sin_stock: { bg: "var(--err-soft)", fg: "var(--err)", dot: true },
  completado: { bg: "var(--ok-soft)", fg: "var(--ok)" },
  en_proceso: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  activo: { bg: "transparent", fg: "var(--ok)", dot: true },
  inactivo: { bg: "transparent", fg: "var(--tx-dim)", dot: true },
  vip: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  frecuente: { bg: "var(--info-soft)", fg: "var(--info)" },
  nuevo: { bg: "var(--purple-soft)", fg: "var(--purple)" },
  administrador: { bg: "var(--ok-soft)", fg: "var(--ok)" },
  gerente: { bg: "var(--purple-soft)", fg: "var(--purple)" },
  cajero: { bg: "var(--info-soft)", fg: "var(--info)" },
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const key = status.toLowerCase().replace(/\s+/g, "_");
  const s = statusStyles[key] || { bg: "var(--surf-2)", fg: "var(--tx-mut)" };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: s.bg, color: s.fg }}>
      {s.dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.fg }} />}
      {label || status}
    </span>
  );
}

// ── DataCard ─────────────────────────────────────────────────────────────────
export function DataCard({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-[20px] border bg-[var(--surf-1)]", className)} style={{ borderColor: "var(--bd-1)", boxShadow: "var(--shadow-soft)" }}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h2 className="text-[15px] font-bold text-[var(--tx-hi)]">{title}</h2>
        {action}
      </div>
      <div className="p-5 pt-3">{children}</div>
    </section>
  );
}

// ── ActionTile ───────────────────────────────────────────────────────────────
export function ActionTile({ icon: Icon, title, subtitle, onClick, href }: { icon: LucideIcon; title: string; subtitle?: string; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "var(--iris-soft)", color: "var(--brand-dark)" }}><Icon size={18} /></span>
      <span className="mt-2 block text-[13px] font-bold text-[var(--tx-hi)]">{title}</span>
      {subtitle && <span className="block text-[11px] text-[var(--tx-mut)]">{subtitle}</span>}
    </>
  );
  const cls = "flex flex-col rounded-[16px] border bg-[var(--surf-1)] p-3.5 text-left transition-colors hover:bg-[var(--surf-2)]";
  if (href) return <a href={href} className={cls} style={{ borderColor: "var(--bd-1)" }}>{inner}</a>;
  return <button type="button" onClick={onClick} className={cls} style={{ borderColor: "var(--bd-1)" }}>{inner}</button>;
}

// ── TablePagination ──────────────────────────────────────────────────────────
export function TablePagination({ info, page = 1, totalPages = 1, onPage }: { info?: string; page?: number; totalPages?: number; onPage?: (p: number) => void }) {
  const pages = Array.from({ length: Math.min(totalPages, 4) }, (_, i) => i + 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-2 text-[12px] text-[var(--tx-mut)]">
      <span>{info}</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPage?.(Math.max(1, page - 1))} className="grid h-8 w-8 place-items-center rounded-lg border hover:bg-[var(--surf-2)]" style={{ borderColor: "var(--bd-1)" }} aria-label="Anterior">‹</button>
        {pages.map((p) => (
          <button key={p} type="button" onClick={() => onPage?.(p)} className={cx("h-8 min-w-8 rounded-lg px-2 text-[12px] font-semibold", p === page ? "text-white" : "border text-[var(--tx-mut)] hover:bg-[var(--surf-2)]")} style={p === page ? { background: "var(--brand-primary)" } : { borderColor: "var(--bd-1)" }}>{p}</button>
        ))}
        {totalPages > 4 && <span className="px-1">…</span>}
        {totalPages > 4 && <button type="button" onClick={() => onPage?.(totalPages)} className="h-8 min-w-8 rounded-lg border px-2 text-[12px] font-semibold text-[var(--tx-mut)] hover:bg-[var(--surf-2)]" style={{ borderColor: "var(--bd-1)" }}>{totalPages}</button>}
        <button type="button" onClick={() => onPage?.(Math.min(totalPages, page + 1))} className="grid h-8 w-8 place-items-center rounded-lg border hover:bg-[var(--surf-2)]" style={{ borderColor: "var(--bd-1)" }} aria-label="Siguiente">›</button>
      </div>
    </div>
  );
}

// ── ToggleSwitch ─────────────────────────────────────────────────────────────
export function ToggleSwitch({ on, onChange, label }: { on: boolean; onChange?: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange?.(!on)} className="relative h-6 w-11 shrink-0 rounded-full transition-colors" style={{ background: on ? "var(--brand-primary)" : "var(--bd-2)" }}>
      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? "22px" : "2px" }} />
    </button>
  );
}

// ── SectionTabs ──────────────────────────────────────────────────────────────
export function SectionTabs({ tabs, active, onChange }: { tabs: Array<{ key: string; label: string; sub?: string; icon: LucideIcon }>; active: string; onChange: (k: string) => void }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}>
      {tabs.map(({ key, label, sub, icon: Icon }) => {
        const a = key === active;
        return (
          <button key={key} type="button" onClick={() => onChange(key)} className="flex items-center gap-3 rounded-[16px] border bg-[var(--surf-1)] px-4 py-3 text-left transition-colors" style={{ borderColor: a ? "var(--brand-primary)" : "var(--bd-1)", boxShadow: a ? "0 0 0 3px var(--iris-soft)" : "none" }}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: a ? "var(--iris-soft)" : "var(--surf-2)", color: a ? "var(--brand-dark)" : "var(--tx-mut)" }}><Icon size={17} /></span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold text-[var(--tx-hi)]">{label}</span>
              {sub && <span className="block truncate text-[11px] text-[var(--tx-mut)]">{sub}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[20px] border bg-[var(--surf-1)] px-6 py-16 text-center" style={{ borderColor: "var(--bd-1)" }}>
      <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "var(--surf-2)", color: "var(--tx-mut)" }}><Icon size={26} /></span>
      <div className="mt-4 text-base font-bold text-[var(--tx-hi)]">{title}</div>
      {hint && <p className="mt-1.5 max-w-sm text-sm text-[var(--tx-mut)]">{hint}</p>}
    </div>
  );
}
