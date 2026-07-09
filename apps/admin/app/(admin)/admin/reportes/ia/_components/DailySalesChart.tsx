"use client";
import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { chartColors } from "@/lib/theme/chartColors";
import type { DailyPoint, SalesByDay } from "./types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const fmtAxis = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}k` : `${Math.round(v)}`;

const fmtMoney = (v: number) => `$${Math.round(v).toLocaleString("es-MX")}`;

type View = {
  data: ChartData<"line">;
  options: ChartOptions<"line">;
  peak: DailyPoint;
  peakLabel: string;
  hasWeekend: boolean;
};

/* Evolución diaria de ventas (GET /api/dashboard/sales-by-day) con chart.js.
   Los colores se leen de los tokens en runtime vía chartColors() (el canvas
   no entiende CSS vars), así respetan tema y acento del tenant. */
export function DailySalesChart({ daily, loading }: { daily: SalesByDay | null; loading: boolean }) {
  const view = useMemo<View | null>(() => {
    const series = daily?.series ?? [];
    const hasData = series.some((p) => (p.revenue ?? 0) > 0);
    if (!hasData) return null;

    const colors = chartColors();
    const labels = series.map((p) =>
      new Date(p.date).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }).replace(".", "")
    );
    const weekend = series.map((p) => {
      const d = new Date(p.date).getDay();
      return (d === 0 || d === 6) && (p.revenue || 0) > 0;
    });

    let peakIdx = 0;
    series.forEach((p, i) => {
      if ((p.revenue || 0) > (series[peakIdx]!.revenue || 0)) peakIdx = i;
    });
    const peak = series[peakIdx]!;
    const peakLabel = new Date(peak.date)
      .toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short" })
      .toUpperCase();

    const data: ChartData<"line"> = {
      labels,
      datasets: [
        {
          data: series.map((p) => p.revenue || 0),
          borderColor: colors.accent,
          backgroundColor: colors.accentGlow,
          fill: true,
          borderWidth: 2,
          tension: 0,
          pointRadius: series.map((_, i) => (weekend[i] ? 3.5 : 0)),
          pointHoverRadius: 4,
          pointBackgroundColor: colors.ok,
          pointBorderColor: colors.ok,
        },
      ],
    };

    const options: ChartOptions<"line"> = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          backgroundColor: colors.surface,
          titleColor: colors.text,
          bodyColor: colors.textMuted,
          borderColor: colors.grid,
          borderWidth: 1,
          displayColors: false,
          callbacks: {
            label: (ctx) => {
              const p = series[ctx.dataIndex];
              return ` ${fmtMoney(p?.revenue || 0)} · ${p?.orders ?? 0} pedidos`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: colors.textMuted,
            font: { family: "'DM Mono', ui-monospace, monospace", size: 9 },
            maxTicksLimit: 8,
            maxRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: colors.grid },
          border: { display: false },
          ticks: {
            color: colors.textMuted,
            font: { family: "'DM Mono', ui-monospace, monospace", size: 10 },
            callback: (v) => fmtAxis(Number(v)),
          },
        },
      },
    };

    return { data, options, peak, peakLabel, hasWeekend: weekend.some(Boolean) };
  }, [daily]);

  return (
    <div className="rounded-ds-lg p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
      {!view ? (
        <div className="px-4 py-12 text-center text-[13px] text-tx-mut">
          {loading ? "Cargando ventas por día…" : "Sin ventas registradas en este periodo"}
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] text-tx-mid">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--brand-primary)" }} />
              Ventas del día
            </span>
            {view.hasWeekend && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--ok)" }} />
                Fin de semana
              </span>
            )}
            {(view.peak.revenue || 0) > 0 && (
              <span className="ml-auto font-mono text-[10px] tracking-[.08em] text-tx-mut">
                PICO · {view.peakLabel} —{" "}
                <span className="font-semibold text-tx-hi">
                  {fmtMoney(view.peak.revenue || 0)} · {view.peak.orders} pedidos
                </span>
              </span>
            )}
          </div>
          <div className="h-[220px]">
            <Line data={view.data} options={view.options} />
          </div>
        </>
      )}
    </div>
  );
}
