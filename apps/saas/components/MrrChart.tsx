"use client";
import { useEffect, useRef } from "react";
import { useTheme } from "./ThemeProvider";

export default function MrrChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!canvasRef.current) return;

    import("chart.js/auto").then(({ default: Chart }) => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }

      const isDark = theme === "dark";
      const gridColor = isDark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.06)";
      const tickColor = isDark ? "#555568" : "#999894";
      const basicColor = isDark ? "#2a2a32" : "#e0dfd8";
      const tooltipBg = isDark ? "#18181c" : "#ffffff";
      const tooltipTitle = isDark ? "#f0f0f2" : "#111110";
      const tooltipBody = isDark ? "#8888a0" : "#5c5b56";

      chartRef.current = new Chart(canvasRef.current!, {
        type: "bar",
        data: {
          labels: ["Oct", "Nov", "Dic", "Ene", "Feb", "Mar"],
          datasets: [
            {
              label: "Unlimited",
              data: [60, 80, 100, 120, 140, 140],
              backgroundColor: "#ff6b35",
              borderRadius: 4,
              stack: "s",
            },
            {
              label: "Pro",
              data: [80, 95, 110, 130, 155, 155],
              backgroundColor: "#3b82f6",
              borderRadius: 4,
              stack: "s",
            },
            {
              label: "Basic",
              data: [30, 35, 40, 45, 48, 48],
              backgroundColor: basicColor,
              borderRadius: 4,
              stack: "s",
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
              ticks: {
                color: tickColor,
                font: { size: 11 },
                callback: (v: any) => "$" + v,
              },
              border: { color: "transparent" },
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
  }, [theme]);

  return (
    <div className="db-card" style={{ marginTop: 16 }}>
      <div className="db-card-header">
        <div>
          <div className="db-card-title">Evolución MRR</div>
          <div className="db-card-sub">Últimos 6 meses — por plan</div>
        </div>
        <div className="db-legend">
          <div className="db-legend-item">
            <div className="db-legend-dot" style={{ background: "var(--orange)" }} />
            Unlimited
          </div>
          <div className="db-legend-item">
            <div className="db-legend-dot" style={{ background: "var(--blue)" }} />
            Pro
          </div>
          <div className="db-legend-item">
            <div className="db-legend-dot" style={{ background: "var(--text3)" }} />
            Basic
          </div>
        </div>
      </div>
      <div className="db-chart-area">
        <div style={{ position: "relative", height: 180 }}>
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  );
}
