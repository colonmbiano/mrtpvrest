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

// Presets — el último ("Todo") se resuelve con la fecha del primer pedido
// que devuelve /api/reports/range-bounds. "Custom" abre los date pickers.
type PresetId = "7D" | "30D" | "90D" | "1Y" | "ALL" | "CUSTOM";
const PRESETS: { id: PresetId; label: string; days?: number }[] = [
  { id: "7D",  label: "7 días",  days: 7 },
  { id: "30D", label: "30 días", days: 30 },
  { id: "90D", label: "90 días", days: 90 },
  { id: "1Y",  label: "1 año",   days: 365 },
  { id: "ALL", label: "Histórico" },
  { id: "CUSTOM", label: "Personalizado" },
];

function todayStr() { return new Date().toISOString().split("T")[0]; }
function daysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n + 1);
  return d.toISOString().split("T")[0];
}

interface DayData { date: string; revenue: number; orders: number; bucket?: string }

export default function ReportesPage() {
  const [preset,    setPreset]    = useState<PresetId>("30D");
  const [fromDate,  setFromDate]  = useState<string>(daysAgoStr(30));
  const [toDate,    setToDate]    = useState<string>(todayStr());
  const [historicalFrom, setHistoricalFrom] = useState<string | null>(null);
  const [byDay,     setByDay]     = useState<DayData[]>([]);
  const [stats,     setStats]     = useState<any>(null);
  const [topItems,  setTopItems]  = useState<any[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const [bucketLabel, setBucketLabel] = useState<string>("");

  // Carga el primer pedido al montar para habilitar "Todo el histórico".
  useEffect(() => {
    api.get("/api/reports/range-bounds").then((r) => {
      const f = r?.data?.from ? new Date(r.data.from).toISOString().split("T")[0] : null;
      setHistoricalFrom(f);
    }).catch(() => setHistoricalFrom(null));
  }, []);

  // Cuando cambia el preset, ajustamos las fechas del rango.
  useEffect(() => {
    if (preset === "CUSTOM") return; // el user maneja los inputs
    if (preset === "ALL") {
      if (historicalFrom) { setFromDate(historicalFrom); setToDate(todayStr()); }
      return;
    }
    const p = PRESETS.find((x) => x.id === preset);
    if (p?.days) { setFromDate(daysAgoStr(p.days)); setToDate(todayStr()); }
  }, [preset, historicalFrom]);

  async function fetchAll(from: string, to: string) {
    setLoading(true);
    try {
      const [bd, s, t] = await Promise.all([
        api.get(`/api/reports/by-day?from=${from}&to=${to}`),
        api.get(`/api/reports/sales?from=${from}&to=${to}`),
        api.get("/api/reports/top-items"),
      ]);
      const days = Array.isArray(bd.data) ? bd.data : [];
      setByDay(days);
      setBucketLabel(days[0]?.bucket || "day");
      setStats(s.data || null);
      setTopItems(Array.isArray(t.data) ? t.data : []);
    } catch {
      setByDay([]); setTopItems([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchAll(fromDate, toDate); }, [fromDate, toDate]);

  // Reusable cuando un input de fecha cambia → preset auto pasa a CUSTOM.
  const handleDateChange = (which: "from" | "to", value: string) => {
    if (which === "from") setFromDate(value);
    else setToDate(value);
    setPreset("CUSTOM");
  };

  const rangeLabel = (() => {
    const dayCount = Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86_400_000) + 1;
    if (dayCount <= 31) return `${dayCount} días`;
    if (dayCount <= 365) return `${(dayCount / 30).toFixed(0)} meses`;
    return `${(dayCount / 365).toFixed(1)} años`;
  })();

  /* Chart config */
  // El backend devuelve labels distintos según bucket: 'YYYY-MM-DD' para
  // day/week (week se usa la fecha del lunes) y 'YYYY-MM' para month.
  const labels  = byDay.map(d => {
    const parts = d.date.split("-");
    if (bucketLabel === "month") {
      // YYYY-MM → "may '24"
      const [yy, mm] = parts;
      const monthName = new Date(parseInt(yy), parseInt(mm) - 1).toLocaleDateString("es-MX", { month: "short" });
      return `${monthName} '${yy.slice(2)}`;
    }
    if (bucketLabel === "week") {
      // semana del 03/06
      const [, mm, dd] = parts;
      return `sem ${dd}/${mm}`;
    }
    // day → "DD/MM"
    const [, mm, dd] = parts;
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
      pointRadius: byDay.length <= 30 ? 3 : 1,
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
        ticks: { color: "#666", font: { size: 10 }, maxTicksLimit: byDay.length <= 7 ? 7 : byDay.length <= 30 ? 15 : byDay.length <= 60 ? 20 : 24 },
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
      pointRadius: byDay.length <= 30 ? 3 : 1,
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
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="font-syne text-3xl font-black">Reportes</h1>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {fromDate} → {toDate} · <strong>{rangeLabel}</strong>
            {bucketLabel && <> · agrupado por <strong>{bucketLabel === "day" ? "día" : bucketLabel === "week" ? "semana" : "mes"}</strong></>}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => {
            const disabled = p.id === "ALL" && !historicalFrom;
            return (
              <button key={p.id} onClick={() => setPreset(p.id)} disabled={disabled}
                className="px-3 py-1.5 rounded-xl text-xs font-syne font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: preset === p.id ? "var(--orange)" : "var(--surf)",
                  color:      preset === p.id ? "#000" : "var(--muted)",
                  border: "1px solid var(--border)",
                }}>
                {p.label}
              </button>
            );
          })}

          <div className="flex items-center gap-1.5 ml-auto">
            <input type="date" value={fromDate}
              onChange={(e) => handleDateChange("from", e.target.value)}
              max={toDate}
              className="px-2 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--surf)", color: "var(--fg)", border: "1px solid var(--border)" }} />
            <span style={{ color: "var(--muted)" }} className="text-xs">→</span>
            <input type="date" value={toDate}
              onChange={(e) => handleDateChange("to", e.target.value)}
              min={fromDate} max={todayStr()}
              className="px-2 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--surf)", color: "var(--fg)", border: "1px solid var(--border)" }} />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Ingresos totales",  value: `$${totalRevenue.toFixed(2)}`, sub: rangeLabel, color: "#22c55e" },
          { label: "Total pedidos",     value: totalOrders,                    sub: rangeLabel, color: "#3b82f6" },
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
