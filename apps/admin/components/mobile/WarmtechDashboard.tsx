"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Filler, Tooltip,
} from "chart.js";
import {
  ArrowRight, Bot, Box, ChevronRight, CircleDollarSign, Clock3,
  PackagePlus, ReceiptText, Sparkles, TrendingUp, UsersRound,
} from "lucide-react";
import api from "@/lib/api";
import { AgentHealthCard, LiveDeliveryMap, PeakHoursHeatmap } from "@/components/dashboard/widgets";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

type Period = "HOY" | "7D" | "30D";
type Stats = {
  sales: { value: number; delta: number };
  orders: { value: number; delta: number };
  averageTicket: { value: number; delta: number };
  prepMinutes: { value: number; activeCount: number };
};
type SalesDay = { date: string; revenue: number; orders: number };
type TopItem = { name: string; quantity: number; revenue: number };
type ActiveShift = { staff: Array<{ id: string; name: string; role: string }> };

const periodLabels: Record<Period, string> = { HOY: "Hoy", "7D": "7 días", "30D": "30 días" };
const periodDays: Record<Period, number> = { HOY: 1, "7D": 7, "30D": 30 };
const money = (value: number) => new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", maximumFractionDigits: 0,
}).format(value || 0);
function Delta({ value }: { value: number }) {
  const up = value >= 0;
  return <span className="font-mono text-[10px] font-semibold" style={{ color: up ? "var(--ok)" : "var(--err)" }}>{up ? "+" : ""}{value.toFixed(1)}%</span>;
}

function StatCard({ icon: Icon, value, label, delta }: {
  icon: typeof ReceiptText; value: string; label: string; delta?: number;
}) {
  return (
    <div className="warmtech-card p-3">
      <div className="flex min-h-6 items-center justify-between">
        <span className="grid h-6 w-6 place-items-center rounded-lg text-primary" style={{ background: "var(--iris-soft)" }}><Icon size={13} /></span>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      <div className="mt-1.5 font-display text-[19px] font-extrabold leading-none text-tx-hi">{value}</div>
      <div className="mt-1 text-[11px] text-tx-mut">{label}</div>
    </div>
  );
}

export default function WarmtechDashboard() {
  const [period, setPeriod] = useState<Period>("HOY");
  const [stats, setStats] = useState<Stats | null>(null);
  const [series, setSeries] = useState<SalesDay[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [staffCount, setStaffCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [statsResponse, salesResponse, topResponse, shiftResponse] = await Promise.all([
        api.get<Stats>(`/api/dashboard/stats?period=${period}`),
        api.get<{ series: SalesDay[] }>(`/api/dashboard/sales-by-day?days=${periodDays[period]}`),
        api.get<TopItem[]>(`/api/dashboard/top-items?period=${period}&limit=4`),
        api.get<ActiveShift>("/api/dashboard/active-shift"),
      ]);
      setStats(statsResponse.data);
      setSeries(salesResponse.data.series || []);
      setTopItems(topResponse.data || []);
      setStaffCount(shiftResponse.data.staff?.length || 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener("locationChanged", refresh);
    return () => window.removeEventListener("locationChanged", refresh);
  }, [load]);

  const chartData = useMemo(() => {
    // El canvas de chart.js no entiende CSS-vars: leemos el acento real
    // (verde por defecto o el del tenant) en runtime, con fallback verde.
    const accent =
      typeof window !== "undefined"
        ? getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim() || "#22c55e"
        : "#22c55e";
    return {
      labels: series.map((point) => new Date(point.date + "T12:00:00").toLocaleDateString("es-MX", { weekday: "short" })),
      datasets: [{
        data: series.map((point) => point.revenue),
        borderColor: accent,
        backgroundColor: "rgba(34,197,94,.14)",
        fill: true,
        borderWidth: 2.5,
        tension: 0.38,
        pointRadius: series.length <= 1 ? 3 : 0,
        pointBackgroundColor: accent,
      }],
    };
  }, [series]);
  const maxQuantity = Math.max(1, ...topItems.map((item) => item.quantity));

  if (loading && !stats) {
    return <div className="warmtech-shell grid grid-cols-2 gap-3 px-[18px] py-4 md:grid-cols-4 md:px-0">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-[18px] bg-surf-2" />)}</div>;
  }

  if (error && !stats) {
    return (
      <div className="warmtech-shell px-[18px] py-5 md:px-0">
        <div className="warmtech-card p-5 text-center">
          <div className="font-display text-lg font-extrabold text-tx-hi">No pudimos cargar el resumen</div>
          <p className="mt-2 text-sm text-tx-mut">Revisa tu conexión e inténtalo de nuevo.</p>
          <button type="button" onClick={load} className="mt-4 min-h-11 rounded-xl px-5 text-sm font-bold text-white" style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))" }}>Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="warmtech-shell warmtech-enter mx-auto max-w-[1380px] px-[18px] pb-6 pt-3 md:px-0 md:pb-12 md:pt-0">
      <div className="mb-6 hidden items-end justify-between md:flex">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[.16em] text-primary">Panel operativo</div>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-.04em] text-tx-hi">Resumen del negocio</h1>
          <p className="mt-2 text-sm text-tx-mut">Ventas, operación y recomendaciones de Mesero en un solo lugar.</p>
        </div>
        <Link href="/admin/reportes/ia" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-white" style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", boxShadow: "0 6px 18px var(--iris-glow)" }}>
          Abrir Reportes IA <ArrowRight size={16} />
        </Link>
      </div>

      <div className="mb-3 flex rounded-[13px] p-1 md:mb-5 md:max-w-[360px]" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
        {(Object.keys(periodLabels) as Period[]).map((key) => (
          <button key={key} type="button" onClick={() => setPeriod(key)} className="min-h-10 flex-1 rounded-[10px] text-xs font-bold transition-colors" style={{ color: period === key ? "#fffaf4" : "var(--tx-mut)", background: period === key ? "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))" : "transparent", boxShadow: period === key ? "0 3px 10px var(--iris-glow)" : "none" }}>{periodLabels[key]}</button>
        ))}
      </div>

      <section className="warmtech-card overflow-hidden p-3.5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Ventas · {periodLabels[period]}</div>
            <div className="mt-1.5 font-display text-[34px] font-extrabold leading-none tracking-[-.035em] text-tx-hi md:text-5xl">{money(stats?.sales.value || 0)}</div>
          </div>
          <span className="rounded-full px-2.5 py-1" style={{ background: (stats?.sales.delta || 0) >= 0 ? "var(--ok-soft)" : "var(--err-soft)" }}><Delta value={stats?.sales.delta || 0} /></span>
        </div>
        <div className="mt-3 h-12 md:mt-6 md:h-44">
          <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }} />
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3 md:mt-5 md:grid-cols-4 md:gap-4">
        <StatCard icon={ReceiptText} value={(stats?.orders.value || 0).toLocaleString("es-MX")} label="Pedidos" delta={stats?.orders.delta} />
        <StatCard icon={CircleDollarSign} value={money(stats?.averageTicket.value || 0)} label="Ticket prom." delta={stats?.averageTicket.delta} />
        <StatCard icon={Clock3} value={`${Math.round(stats?.prepMinutes.value || 0)} min`} label="Prep. prom." />
        <StatCard icon={UsersRound} value={staffCount.toString()} label="Personal en turno" />
      </div>

      <section className="mt-3 overflow-hidden rounded-[20px] p-3.5 text-white md:mt-5 md:flex md:items-center md:justify-between md:gap-8 md:p-6" style={{ background: "linear-gradient(135deg,var(--brand-secondary),var(--brand-primary))", boxShadow: "0 8px 22px var(--iris-glow)" }}>
        <div className="md:max-w-3xl">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/15"><Bot size={17} /></span>
          <div><div className="font-display text-[15px] font-extrabold">Mesero IA</div><div className="font-mono text-[9px] uppercase tracking-[.12em] text-white/65">Insight del día</div></div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-white/90">
          {stats?.orders.value ? `Llevas ${stats.orders.value} pedidos. Tu ticket promedio es ${money(stats.averageTicket.value)} y hay ${stats.prepMinutes.activeCount} órdenes activas.` : "Todavía no hay pedidos en este periodo. Es un buen momento para activar una promoción o revisar tu menú."}
        </p>
        </div>
        <Link href="/admin/reportes/ia" className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold" style={{ color: "var(--brand-secondary)" }}>Ver plan del día <ArrowRight size={15} /></Link>
      </section>

      {/* Operación en vivo: cerebro del agente IA + mapa de entregas + horas pico */}
      <div className="mt-3 grid gap-3 md:mt-5 md:grid-cols-2 md:gap-4">
        <AgentHealthCard />
        <LiveDeliveryMap />
      </div>
      <div className="mt-3 md:mt-4">
        <PeakHoursHeatmap />
      </div>

      <div className="md:grid md:grid-cols-[minmax(0,1.45fr)_minmax(300px,.55fr)] md:gap-5">
        <div>
          <div className="mb-3 mt-6 flex items-center justify-between">
            <h2 className="font-display text-base font-extrabold text-tx-hi md:text-xl">Top platillos</h2>
            <Link href="/admin/menu" className="flex min-h-10 items-center gap-1 text-xs font-bold text-primary">Ver menú <ChevronRight size={14} /></Link>
          </div>
          <section className="warmtech-card overflow-hidden px-4 md:px-5">
        {topItems.length === 0 ? <div className="py-6 text-center text-sm text-tx-mut">Aún no hay ventas de platillos en este periodo.</div> : topItems.map((item, index) => (
          <div key={item.name} className="flex min-h-[70px] items-center gap-3 py-3" style={{ borderBottom: index < topItems.length - 1 ? "1px solid var(--bd-1)" : "none" }}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] font-mono text-xs font-bold text-primary" style={{ background: "var(--iris-soft)" }}>{index + 1}</span>
            <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-tx">{item.name}</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surf-3"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(8, (item.quantity / maxQuantity) * 100)}%` }} /></div></div>
            <div className="text-right"><div className="font-mono text-xs font-semibold text-tx-hi">{money(item.revenue)}</div><div className="mt-1 font-mono text-[10px] text-tx-mut">{item.quantity} ud</div></div>
          </div>
        ))}
          </section>
        </div>

        <div>
          <h2 className="mb-3 mt-6 font-display text-base font-extrabold text-tx-hi md:text-xl">Acciones rápidas</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
        {[
          ["/admin/pedidos", ReceiptText, "Ver pedidos"],
          ["/admin/inventario", Box, "Inventario"],
          ["/admin/promociones", Sparkles, "Crear promo"],
          ["/admin/turnos", TrendingUp, "Corte de caja"],
        ].map(([href, Icon, label]) => {
          const ActionIcon = Icon as typeof ReceiptText;
          return <Link key={href as string} href={href as string} className="warmtech-card flex min-h-[64px] items-center gap-3 p-3 text-left text-xs font-semibold text-tx"><span className="grid h-9 w-9 place-items-center rounded-[10px] text-primary" style={{ background: "var(--iris-soft)" }}><ActionIcon size={17} /></span>{label as string}</Link>;
        })}
            <Link href="/admin/menu" className="warmtech-card col-span-2 flex min-h-[58px] items-center justify-center gap-2 p-3 text-xs font-bold text-primary md:col-span-1"><PackagePlus size={17} /> Administrar platillos</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
