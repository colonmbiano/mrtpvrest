"use client";
/* Tonos semánticos + badges de estado. Todo via tokens CSS (respeta
   light/dark y el acento del tenant), nada de clases de color fijas. */
import type { ReactNode } from "react";

export type Tone = "ac" | "ok" | "warn" | "err" | "info" | "neutral";

export const TONE_FG: Record<Tone, string> = {
  ac: "var(--brand-primary)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  err: "var(--err)",
  info: "var(--info)",
  neutral: "var(--tx-mut)",
};

export const TONE_BG: Record<Tone, string> = {
  ac: "var(--accent-soft)",
  ok: "var(--ok-soft)",
  warn: "var(--warn-soft)",
  err: "var(--err-soft)",
  info: "var(--info-soft)",
  neutral: "var(--surf-2)",
};

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

/* ── StatusBadge: estados de negocio → tono semántico ────────────── */
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
  | "sin_conexion"
  | "pagado"
  | "vencido";

const STATUS: Record<StatusKey, { label: string; tone: Tone; dot?: boolean }> = {
  disponible: { label: "Disponible", tone: "ok" },
  stock_bajo: { label: "Stock bajo", tone: "warn" },
  sin_stock: { label: "Sin stock", tone: "err" },
  completado: { label: "Completado", tone: "ok" },
  en_proceso: { label: "En proceso", tone: "warn" },
  pendiente: { label: "Pendiente", tone: "neutral" },
  cancelado: { label: "Cancelado", tone: "err" },
  activo: { label: "Activo", tone: "ok", dot: true },
  inactivo: { label: "Inactivo", tone: "neutral", dot: true },
  en_linea: { label: "En línea", tone: "ok", dot: true },
  sin_conexion: { label: "Sin conexión", tone: "warn", dot: true },
  pagado: { label: "Pagado", tone: "ok" },
  vencido: { label: "Vencido", tone: "err" },
};

export function StatusBadge({
  status,
  tone,
  children,
}: {
  status: StatusKey | string;
  tone?: Tone;
  children?: ReactNode;
}) {
  const meta = STATUS[status as StatusKey] ?? { label: String(status), tone: "neutral" as Tone };
  const finalTone = tone ?? meta.tone;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
      style={{
        color: TONE_FG[finalTone],
        background: TONE_BG[finalTone],
        boxShadow: `inset 0 0 0 1px ${finalTone === "neutral" ? "var(--bd-1)" : "transparent"}`,
      }}
    >
      {meta.dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children ?? meta.label}
    </span>
  );
}
