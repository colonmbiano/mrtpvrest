"use client";
import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const PERIODS = [
  { label: "7 días",  days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
];

interface DayData { date: string; revenue: number; orders: number }

export default function ReportesPage() {
  const [period,   setPeriod]   = useState(30);
  const [byDay,    setByDay]    = useState<DayData[]>([]);
  const [stats,    setStats]    = useState<any>(null);
  const [topItems, setTopItems] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  async function fetchAll(days: number) {
    setLoading(true);
    try {
      const from = (() => { const d = new Date(); d.setDate(d.getDate() - days + 1); return d.toISOString().split("T")[0]; })();
      const to   = new Date().toISOString().split("T")[0];
      const [bd, s, t] = await Promise.all([
        api.get(`/api/reports/by-day?days=${days}`),
        api.get(`/api/reports/sales?from=${from}&to=${to}`),
        api.get("/api/reports/top-items"),
      ]);
      setByDay(Array.isArray(bd.data) ? bd.data : []);
      setStats(s.data || null);
      setTopItems(Array.isArray(t.data) ? t.data : []);
    } catch {
      setByDay([]); setTopItems([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchAll(period); }, [period]);

  /* Chart config */
  const labels  = byDay.map(d => {
    const [, mm, dd] = d.date.split("-");
    return `${dd}/${mm}`;
  });
  const revenueData = byDay.map(d => d.revenue);
  const ordersData  = byDay.map(d => d.orders);

  const chartDataRevenue = {
    labels,
    datasets: [{
      label: "Ingresos ($)",
      data: revenueData,
      backgroundColor: "rgba(255,140,0,0.55)",
      borderColor: "#ff8c00",
      borderWidth: 2,
      borderRadius: 6,
      fill: chartType === "line",
      tension: 0.4,
      pointRadius: period <= 30 ? 3 : 2,
      pointBackgroundColor: "#ff8c00",
    }],
  };

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1a1a1a",
        titleColor: "#fff",
        bodyColor: "#aaa",
        borderColor: "#333",
        borderWidth: 1,
        callbacks: {
          label: (ctx: any) => `$${ctx.parsed.y.toFixed(2)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: { color: "#666", font: { size: 10 }, maxTicksLimit: period <= 7 ? 7 : period <= 30 ? 15 : 20 },
      },
      y: {
        grid: { color: "rgba(255,255,255,0.04)" },
        ticks: { color: "#666", font: { size: 10 }, callback: (v: any) => `$${v}` },
      },
    },
  };

  const ordersChartData = {
    labels,
    datasets: [{
      label: "Pedidos",
      data: ordersData,
      backgroundColor: "rgba(59,130,246,0.5)",
      borderColor: "#3b82f6",
      borderWidth: 2,
      borderRadius: 6,
      fill: false,
      tension: 0.4,
      pointRadius: period <= 30 ? 3 : 2,
      pointBackgroundColor: "#3b82f6",
    }],
  };

  const ordersOptions: any = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      tooltip: {
        ...chartOptions.plugins.tooltip,
        callbacks: { label: (ctx: any) => `${ctx.parsed.y} pedidos` },
      },
    },
    scales: {
      ...chartOptions.scales,
      y: { ...chartOptions.scales.y, ticks: { ...chartOptions.scales.y.ticks, callback: (v: any) => v } },
    },
  };

  const totalRevenue = stats?.totalRevenue ?? 0;
  const totalOrders  = stats?.totalOrders  ?? 0;
  const avgTicket    = stats?.averageTicket ?? 0;
  const maxRevenue   = Math.max(...revenueData, 1);
  const bestDay      = byDay.reduce((a, b) => b.revenue > a.revenue ? b : a, { date: "", revenue: 0 });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-syne text-3xl font-black">Reportes</h1>
        <div className="flex items-center gap-2">
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => setPeriod(p.days)}
              className="px-4 py-2 rounded-xl text-xs font-syne font-bold transition-all"
              style={{
                background: period === p.days ? "var(--orange)" : "var(--surf)",
                color:      period === p.days ? "#000" : "var(--muted)",
                border: "1px solid var(--border)",
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Ingresos totales",  value: `$${totalRevenue.toFixed(2)}`, sub: `últimos ${period}d`, color: "#22c55e" },
          { label: "Total pedidos",     value: totalOrders,                    sub: `últimos ${period}d`, color: "#3b82f6" },
          { label: "Ticket promedio",   value: `$${avgTicket.toFixed(2)}`,    sub: "por pedido",         color: "var(--orange)" },
          { label: "Mejor día",         value: bestDay.revenue > 0 ? `$${bestDay.revenue.toFixed(0)}` : "—",
            sub: bestDay.date || "sin datos", color: "#a855f7" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-5 border" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
            <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>{s.label}</div>
            <div className="font-syne text-2xl font-black mb-1" style={{ color: s.color }}>
              {loading ? "…" : s.value}
            </div>
            <div className="text-xs" style={{ color: "var(--muted)", opacity: 0.6 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Revenue Chart */}
      <div className="rounded-2xl border p-5 mb-6" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-syne font-bold text-sm">Ingresos por día</h2>
          <div className="flex gap-1">
            {(["bar", "line"] as const).map(t => (
              <button key={t} onClick={() => setChartType(t)}
                className="px-3 py-1 rounded-lg text-xs font-syne font-bold transition-all"
                style={{
                  background: chartType === t ? "var(--orange)" : "rgba(255,255,255,0.05)",
                  color:      chartType === t ? "#000" : "var(--muted)",
                }}>
                {t === "bar" ? "Barras" : "Línea"}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: 240 }}>
          {loading ? (
            <div className="h-full flex items-center justify-center" style={{ color: "var(--muted)" }}>Cargando…</div>
          ) : byDay.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2" style={{ color: "var(--muted)" }}>
              <span className="text-3xl">📊</span>
              <p className="text-sm">No hay datos para este período</p>
            </div>
          ) : chartType === "bar" ? (
            <Bar data={chartDataRevenue} options={chartOptions} />
          ) : (
            <Line data={chartDataRevenue} options={chartOptions} />
          )}
        </div>
      </div>

      {/* Orders Chart */}
      <div className="rounded-2xl border p-5 mb-6" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
        <div className="mb-4">
          <h2 className="font-syne font-bold text-sm">Pedidos por día</h2>
        </div>
        <div style={{ height: 180 }}>
          {loading ? (
            <div className="h-full flex items-center justify-center" style={{ color: "var(--muted)" }}>Cargando…</div>
          ) : byDay.length === 0 ? (
            <div className="h-full flex items-center justify-center" style={{ color: "var(--muted)" }}>
              <p className="text-sm">No hay datos para este período</p>
            </div>
          ) : (
            <Bar data={ordersChartData} options={ordersOptions} />
          )}
        </div>
      </div>

      {/* Top Items */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-syne font-bold text-sm">Platillos más vendidos</h2>
        </div>
        <div>
          {topItems.map((item, i) => {
            const pct = item._sum?.quantity ? Math.min(100, (item._sum.quantity / (topItems[0]?._sum?.quantity || 1)) * 100) : 0;
            return (
              <div key={item.name} className="px-6 py-4 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-4 mb-2">
                  <span className="font-syne font-black text-sm w-6" style={{ color: i === 0 ? "#ffc800" : i === 1 ? "#94a3b8" : "#b87333" }}>
                    {i + 1}
                  </span>
                  <div className="flex-1 font-medium text-sm">{item.name}</div>
                  <div className="text-sm font-syne font-black" style={{ color: "var(--orange)" }}>{item._sum?.quantity} uds</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>${(item._sum?.subtotal || 0).toFixed(0)}</div>
                </div>
                <div style={{ marginLeft: 28, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                  <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: i === 0 ? "#ff8c00" : "rgba(255,255,255,0.2)", transition: "width .6s" }} />
                </div>
              </div>
            );
          })}
          {topItems.length === 0 && !loading && (
            <div className="py-12 text-center" style={{ color: "var(--muted)" }}>
              <div className="text-3xl mb-2">📊</div>
              <p className="text-sm">No hay datos de ventas aún</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
