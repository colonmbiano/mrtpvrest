"use client";
import { useEffect, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";

export interface MonthPoint { label: string; revenue: number; month?: string }

// Gráfica de evolución de ingresos (desktop). Datos REALES: facturas de
// suscripción pagadas por mes (últimos 6), provenientes de /api/saas/mrr.
export default function MrrChart({ monthly = [] }: { monthly?: MonthPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const { theme } = useTheme();

  const hasData = monthly.some((m) => m.revenue > 0);

  useEffect(() => {
    if (!canvasRef.current || !hasData) return;

    import("chart.js/auto").then(({ default: Chart }) => {
      if (chartRef.current) chartRef.current.destroy();

      const isDark = theme === "dark";
      const gridColor = isDark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.06)";
      const tickColor = isDark ? "#555568" : "#999894";
      const tooltipBg = isDark ? "#18181c" : "#ffffff";
      const tooltipTitle = isDark ? "#f0f0f2" : "#111110";
      const tooltipBody = isDark ? "#8888a0" : "#5c5b56";

      chartRef.current = new Chart(canvasRef.current!, {
        type: "bar",
        data: {
          labels: monthly.map((m) => m.label),
          datasets: [
            {
              label: "Ingresos",
              data: monthly.map((m) => m.revenue),
              backgroundColor: "#7c3aed",
              borderRadius: 5,
              maxBarThickness: 46,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: tooltipBg,
              borderColor: "#2a2a32",
              borderWidth: 1,
              titleColor: tooltipTitle,
              bodyColor: tooltipBody,
              padding: 10,
              callbacks: {
                label: (ctx: any) => "$" + Number(ctx.parsed.y).toLocaleString("en-US"),
              },
            },
          },
          scales: {
            x: {
              grid: { color: gridColor },
              ticks: { color: tickColor, font: { size: 11 } },
              border: { color: "transparent" },
            },
            y: {
              grid: { color: gridColor },
              ticks: { color: tickColor, font: { size: 11 }, callback: (v: any) => "$" + v },
              border: { color: "transparent" },
              beginAtZero: true,
            },
          },
          animation: { duration: 600 },
        },
      });
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [theme, monthly, hasData]);

  return (
    <div className="db-card" style={{ marginTop: 16 }}>
      <div className="db-card-header">
        <div>
          <div className="db-card-title">Evolución de ingresos</div>
          <div className="db-card-sub">Últimos 6 meses — facturas pagadas</div>
        </div>
      </div>
      <div className="db-chart-area">
        {hasData ? (
          <div style={{ position: "relative", height: 180 }}>
            <canvas ref={canvasRef} />
          </div>
        ) : (
          <div style={{
            height: 180, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center",
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text2)" }}>Sin ingresos registrados aún</div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>Los pagos de suscripción aparecerán aquí por mes</div>
          </div>
        )}
      </div>
    </div>
  );
}
