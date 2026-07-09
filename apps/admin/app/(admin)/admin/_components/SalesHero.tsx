"use client";

import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Filler, Tooltip,
} from "chart.js";
import { Card, Delta } from "@/components/ds";
import { chartColors } from "@/lib/theme/chartColors";
import { formatMoney } from "@/lib/format";
import { PERIOD_LABELS, type Period, type SalesDay } from "./types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

/* Tarjeta hero de ventas: total del periodo + delta + gráfica de área. */
export default function SalesHero({
  period,
  sales,
  series,
}: {
  period: Period;
  sales: { value: number; delta: number };
  series: SalesDay[];
}) {
  const chartData = useMemo(() => {
    // chart.js pinta en canvas y no entiende CSS-vars: leemos los tokens
    // reales (acento del tenant, tema claro/oscuro) en runtime.
    const colors = chartColors();
    return {
      labels: series.map((point) =>
        new Date(point.date + "T12:00:00").toLocaleDateString("es-MX", { weekday: "short" })
      ),
      datasets: [
        {
          data: series.map((point) => point.revenue),
          borderColor: colors.accent,
          backgroundColor: colors.accentSoft,
          fill: true,
          borderWidth: 2.5,
          tension: 0.38,
          pointRadius: series.length <= 1 ? 3 : 0,
          pointBackgroundColor: colors.accent,
        },
      ],
    };
  }, [series]);

  return (
    <Card className="overflow-hidden p-3.5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">
            Ventas · {PERIOD_LABELS[period]}
          </div>
          <div className="mt-1.5 font-display text-[34px] font-extrabold leading-none tracking-[-.035em] text-tx-hi md:text-5xl">
            {formatMoney(sales.value, false)}
          </div>
        </div>
        <span
          className="rounded-full px-2.5 py-1"
          style={{ background: sales.delta >= 0 ? "var(--ok-soft)" : "var(--err-soft)" }}
        >
          <Delta value={sales.delta} />
        </span>
      </div>
      <div className="mt-3 h-12 md:mt-6 md:h-44">
        <Line
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false } },
          }}
        />
      </div>
    </Card>
  );
}
