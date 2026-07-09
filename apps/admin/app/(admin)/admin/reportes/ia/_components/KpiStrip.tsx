"use client";
import { DeltaPill } from "./DeltaPill";
import type { StatsResponse } from "./types";

/* KPIs del período (GET /api/dashboard/stats): 2 columnas en móvil, 4 en desktop.
   Formateo compacto: $1.2M / $45.3k / $980 — igual que el diseño original. */

const fmt = (raw: number | undefined | null) => {
  const n = Number(raw ?? 0);
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}`
    : n >= 1_000
      ? `$${(n / 1_000).toFixed(1)}`
      : `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
};

const sml = (raw: number | undefined | null) => {
  const n = Number(raw ?? 0);
  return n >= 1_000_000 ? "M" : n >= 1_000 ? "k" : "";
};

const fmtPct = (raw: number | undefined | null) => {
  const d = Number(raw ?? 0);
  return `${d >= 0 ? "↑" : "↓"} ${Math.abs(d).toFixed(1)}%`;
};

/* Bordes por celda: divisores internos en 2 cols (móvil) y 4 cols (desktop). */
const CELL_BORDER = [
  "border-r",
  "md:border-r",
  "border-r border-t md:border-t-0",
  "border-t md:border-t-0",
];

export function KpiStrip({ stats }: { stats: StatsResponse | null }) {
  const rows = [
    {
      label: "Ventas totales",
      value: stats ? fmt(stats.sales.value) : "—",
      sml: stats ? sml(stats.sales.value) : "",
      up: (stats?.sales.delta ?? 0) >= 0,
      delta: stats ? fmtPct(stats.sales.delta) : "",
      sub: stats ? `vs ${fmt(stats.sales.prev)}` : "sin datos",
    },
    {
      label: "Pedidos",
      value: stats ? (stats.orders.value ?? 0).toLocaleString("es-MX") : "—",
      sml: "",
      up: (stats?.orders.delta ?? 0) >= 0,
      delta: stats ? fmtPct(stats.orders.delta) : "",
      sub: stats ? `vs ${(stats.orders.prev ?? 0).toLocaleString("es-MX")}` : "sin datos",
    },
    {
      label: "Ticket promedio",
      value: stats ? `$${stats.averageTicket?.value ?? 0}` : "—",
      sml: "",
      up: (stats?.averageTicket?.delta ?? 0) >= 0,
      delta: stats ? fmtPct(stats.averageTicket?.delta) : "",
      sub: stats ? `vs $${stats.averageTicket?.prev ?? 0}` : "sin datos",
    },
    {
      label: "Prep. activa",
      value: stats ? `${stats.prepMinutes?.value ?? 0}` : "—",
      sml: "min",
      up: true,
      delta: "",
      sub: stats ? `${stats.prepMinutes?.activeCount ?? 0} activos` : "sin datos",
    },
  ];

  return (
    <div className="grid grid-cols-2 border-b md:grid-cols-4" style={{ borderColor: "var(--bd-1)" }}>
      {rows.map((k, i) => (
        <div key={k.label} className={`px-4 py-4 md:px-5 ${CELL_BORDER[i]}`} style={{ borderColor: "var(--bd-1)" }}>
          <div className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-dim">{k.label}</div>
          <div className="mt-1.5 font-display text-2xl font-extrabold leading-none tracking-[-.02em] text-tx-hi">
            {k.value}
            <span className="text-[13px] font-semibold text-tx-mut">{k.sml}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-1.5">
            {k.delta ? <DeltaPill up={k.up}>{k.delta}</DeltaPill> : <span />}
            <span className="text-[11px] text-tx-mut">{k.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
