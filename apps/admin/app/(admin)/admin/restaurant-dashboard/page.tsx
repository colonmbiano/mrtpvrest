// /admin/restaurant-dashboard
//
// Home del dueño/admin — espejo fiel del mockup en
// Design System/export/src/admin-dashboard.html.
// Conecta con /api/dashboard/* (stats, sales-by-day, live-orders,
// top-items, channels-payments, hourly-distribution, active-shift,
// low-inventory) y respeta selección de sucursal + período.
"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { getUser } from "@/lib/auth";

// ── Tipos ───────────────────────────────────────────────────────────────────
type TopProduct      = { name: string; quantity: number; total: number };
type StaffMember     = { id: string; name: string; role: string; tables: string[]; startAt: string };
type InventoryAlert  = { id: string; name: string; unit: string; stock: number; minStock: number };
type LocationOption  = { id: string; name: string };

type OrderStatus =
  | "PENDING" | "CONFIRMED" | "PREPARING" | "READY"
  | "ON_THE_WAY" | "DELIVERED" | "CANCELLED" | "OPEN";

type Order = {
  id: string;
  orderNumber?: number;
  status: OrderStatus;
  total: number;
  createdAt: string;
  items: { quantity: number; menuItem: { name: string } }[];
  orderType?: string;
  tableNumber?: string;
  customer?: { name: string };
};

type DashboardStats = {
  period: string;
  sales:         { value: number; prev: number; delta: number };
  orders:        { value: number; prev: number; delta: number };
  averageTicket: { value: number; prev: number; delta: number };
  prepMinutes:   { value: number; activeCount: number };
};

type SalesByDay = {
  days: number;
  series: { date: string; revenue: number; orders: number }[];
  totals: {
    current:  { revenue: number; orders: number };
    previous: { revenue: number; orders: number };
    delta: number;
  };
};

type ChannelsPayments = {
  period: string;
  total: number;
  totalOrders: number;
  channels: { key: string; total: number; count: number; pct: number }[];
  payments: { key: string; total: number; count: number; pct: number }[];
};

type HourlyDistribution = {
  period: string;
  total: number;
  buckets: { hour: number; count: number }[];
};

type ActiveShiftResp = { shift: any; staff: StaffMember[] };
type Period = "HOY" | "7D" | "30D" | "AÑO";

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtMoney(n: number) {
  return "$" + n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
}
function toCsv(rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(esc).join(",")).join("\n");
}
function downloadFile(name: string, content: string, mime = "text/csv;charset=utf-8") {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Ancho del sparkline en la KPI — el path se deriva de salesByDay para que
// cada tarjeta muestre tendencia real. Si no hay datos aún, se dibuja plano.
function buildSpark(values: number[], width = 300, height = 30) {
  if (!values.length) return { line: "", fill: "" };
  const max = Math.max(1, ...values);
  const n   = values.length;
  const pts: [number, number][] = values.map((v, i) => {
    const x = n > 1 ? (i / (n - 1)) * width : width / 2;
    const y = height - (v / max) * (height - 4) - 2;
    return [x, y];
  });
  const line = `M ${pts.map(p => `${p[0]},${p[1]}`).join(" L ")}`;
  const fill = `${line} L ${pts[pts.length - 1]![0]},${height} L ${pts[0]![0]},${height} Z`;
  return { line, fill };
}

// ── Paleta: variables CSS canónicas del Design System. Evitamos hardcodes ──
const DS = {
  bg:    "var(--bg)",
  surf1: "var(--surf-1)",
  surf2: "var(--surf-2)",
  surf3: "var(--surf-3)",
  bd1:   "var(--bd-1)",
  bd2:   "var(--bd-2)",
  tx:    "var(--tx)",
  txHi:  "var(--tx-hi)",
  txMid: "var(--tx-mid)",
  txMut: "var(--tx-mut)",
  txDim: "var(--tx-dim)",
  iris2: "var(--iris-200)",
  iris3: "var(--iris-300)",
  iris4: "var(--iris-400)",
  iris5: "var(--iris-500)",
  iris6: "var(--iris-600)",
  irisSoft: "var(--iris-soft)",
  irisGlow: "var(--iris-glow)",
  ok:    "var(--ok)",
  warn:  "var(--warn)",
  err:   "var(--err)",
  info:  "var(--info)",
  okS:   "var(--ok-soft)",
  warnS: "var(--warn-soft)",
  errS:  "var(--err-soft)",
  infoS: "var(--info-soft)",
  fD:    "var(--f-d)",
  fB:    "var(--f-b)",
  fM:    "var(--f-m)",
};

const CSS = `
@keyframes db-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
.db-scroll::-webkit-scrollbar { width:6px; height:6px; }
.db-scroll::-webkit-scrollbar-thumb { background: var(--bd-2); border-radius: 3px; }
.db-scroll::-webkit-scrollbar-track { background: transparent; }
`;

const CHAN_COLORS: Record<string, string> = {
  MESA: "var(--iris-400)", TPV: "var(--iris-400)",
  DELIVERY: "var(--iris-500)", WEB: "var(--iris-500)",
  TAKEOUT: "var(--iris-300)", PICKUP: "var(--iris-300)",
  KIOSK: "var(--iris-200)", KIOSKO: "var(--iris-200)",
  RAPPI: "var(--err)", UBER: "#8b5cf6",
};
const DONUT_FALLBACK = ["var(--iris-400)", "var(--iris-500)", "var(--iris-300)", "var(--iris-200)"];

function StatusChip({ s }: { s: OrderStatus | string }) {
  type Pair = [color: string, bg: string];
  const MAP: Record<string, Pair> = {
    READY:      [DS.ok,    DS.okS],
    PREPARING:  [DS.warn,  DS.warnS],
    ON_THE_WAY: [DS.iris3, DS.irisSoft],
    DELIVERED:  [DS.txMut, DS.surf2],
    PENDING:    [DS.info,  DS.infoS],
    CONFIRMED:  [DS.info,  DS.infoS],
    OPEN:       [DS.iris3, DS.irisSoft],
    CANCELLED:  [DS.err,   DS.errS],
  };
  const LABELS: Record<string, string> = {
    READY: "LISTO", PREPARING: "PREP", ON_THE_WAY: "RUTA",
    DELIVERED: "ENTR.", PENDING: "NUEVO", CONFIRMED: "CONF",
    OPEN: "ABIERTO", CANCELLED: "CANC.",
  };
  const [c, bg] = MAP[s] || [DS.txMut, "transparent"];
  return (
    <span style={{
      padding: "3px 8px", borderRadius: 999,
      fontFamily: DS.fM, fontSize: 10, fontWeight: 700, letterSpacing: ".06em",
      display: "inline-flex", alignItems: "center", gap: 5,
      background: bg, color: c, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
      {LABELS[s] || s}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function RestaurantDashboard() {
  const [orders, setOrders]             = useState<Order[]>([]);
  const [loading, setLoading]           = useState(true);
  const [now, setNow]                   = useState<Date | null>(null);
  const [period, setPeriod]             = useState<Period>("HOY");
  const [topProducts, setTopProducts]   = useState<TopProduct[]>([]);
  const [activeStaff, setActiveStaff]   = useState<StaffMember[]>([]);
  const [shift, setShift]               = useState<any>(null);
  const [invAlerts, setInvAlerts]       = useState<InventoryAlert[]>([]);
  const [userName, setUserName]         = useState("Admin");
  const [locations, setLocations]       = useState<LocationOption[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string>("");
  const [locationsLoaded, setLocationsLoaded]   = useState(false);
  const [stats, setStats]               = useState<DashboardStats | null>(null);
  const [salesByDay, setSalesByDay]     = useState<SalesByDay | null>(null);
  const [channelsData, setChannelsData] = useState<ChannelsPayments | null>(null);
  const [hourlyData, setHourlyData]     = useState<HourlyDistribution | null>(null);
  const router = useRouter();

  const prevIds  = useRef<Set<string>>(new Set());
  const audioCtx = useRef<AudioContext | null>(null);

  const locationName   = locations.find(l => l.id === activeLocationId)?.name || "";
  const locationsCount = locationsLoaded ? locations.length : null;

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  function playBeep() {
    if (typeof window === "undefined") return;
    if (!audioCtx.current) audioCtx.current = new AudioContext();
    const ctx = audioCtx.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(); osc.stop(ctx.currentTime + 0.4);
  }

  const fetchLiveOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/api/dashboard/live-orders");
      const arr: Order[] = Array.isArray(data) ? data : [];
      setOrders(arr);
      const newIds = new Set<string>(arr.map(o => o.id));
      if (arr.some(o => o.status === "PENDING" && !prevIds.current.has(o.id)) && prevIds.current.size > 0) playBeep();
      prevIds.current = newIds;
    } catch {}
    setLoading(false);
  }, []);

  const fetchStats = useCallback(async (p: Period) => {
    try {
      const { data } = await api.get("/api/dashboard/stats", { params: { period: p } });
      setStats(data || null);
    } catch { setStats(null); }
  }, []);

  const fetchSalesByDay = useCallback(async () => {
    try {
      const { data } = await api.get("/api/dashboard/sales-by-day", { params: { days: 7 } });
      setSalesByDay(data && Array.isArray(data.series) ? data : null);
    } catch { setSalesByDay(null); }
  }, []);

  const fetchTopProducts = useCallback(async (p: Period) => {
    try {
      const { data } = await api.get("/api/dashboard/top-items", { params: { period: p, limit: 5 } });
      setTopProducts(Array.isArray(data) ? data : []);
    } catch { setTopProducts([]); }
  }, []);

  const fetchActiveShift = useCallback(async () => {
    try {
      const { data } = await api.get<ActiveShiftResp>("/api/dashboard/active-shift");
      setShift(data?.shift?.id ? data.shift : null);
      setActiveStaff(Array.isArray(data?.staff) ? data.staff : []);
    } catch {
      setShift(null); setActiveStaff([]);
    }
  }, []);

  const fetchInventoryAlerts = useCallback(async () => {
    try {
      const { data } = await api.get("/api/dashboard/low-inventory");
      setInvAlerts(Array.isArray(data) ? data : []);
    } catch { setInvAlerts([]); }
  }, []);

  const fetchChannelsPayments = useCallback(async (p: Period) => {
    try {
      const { data } = await api.get("/api/dashboard/channels-payments", { params: { period: p } });
      setChannelsData(data || null);
    } catch { setChannelsData(null); }
  }, []);

  const fetchHourly = useCallback(async (p: Period) => {
    try {
      const { data } = await api.get("/api/dashboard/hourly-distribution", { params: { period: p } });
      setHourlyData(data || null);
    } catch { setHourlyData(null); }
  }, []);

  // Bootstrap: usuario + sucursales + activa
  useEffect(() => {
    const u = getUser();
    const display = u?.name
      ? String(u.name).split(" ")[0]
      : u?.email
        ? String(u.email).split("@")[0]
        : null;
    if (display) setUserName(display);

    (async () => {
      try {
        const { data } = await api.get("/api/admin/locations");
        const list: LocationOption[] = Array.isArray(data) ? data : [];
        setLocations(list);
        const saved = typeof window !== "undefined" ? localStorage.getItem("locationId") : null;
        const valid = saved && list.some(l => l.id === saved) ? saved : (list[0]?.id || "");
        if (valid && valid !== saved && typeof window !== "undefined") {
          localStorage.setItem("locationId", valid);
        }
        setActiveLocationId(valid);
      } catch {
        setLocations([]);
        setActiveLocationId("");
      } finally {
        setLocationsLoaded(true);
      }
    })();
  }, []);

  const handleLocationChange = useCallback((id: string) => {
    if (!id || id === activeLocationId) return;
    if (typeof window !== "undefined") localStorage.setItem("locationId", id);
    setActiveLocationId(id);
  }, [activeLocationId]);

  useEffect(() => {
    if (!activeLocationId) return;
    fetchLiveOrders();
    fetchActiveShift();
    fetchInventoryAlerts();
    fetchSalesByDay();
    const t = setInterval(fetchLiveOrders, 15000);
    return () => clearInterval(t);
  }, [activeLocationId, fetchLiveOrders, fetchActiveShift, fetchInventoryAlerts, fetchSalesByDay]);

  useEffect(() => {
    if (!activeLocationId) return;
    fetchStats(period);
    fetchTopProducts(period);
    fetchChannelsPayments(period);
    fetchHourly(period);
  }, [activeLocationId, period, fetchStats, fetchTopProducts, fetchChannelsPayments, fetchHourly]);

  // ── Derivados ─────────────────────────────────────────────────────────────
  const ventas      = stats?.sales.value ?? 0;
  const ventasDelta = stats?.sales.delta ?? 0;
  const ventasPrev  = stats?.sales.prev ?? 0;
  const ordersCount = stats?.orders.value ?? 0;
  const ordersDelta = stats?.orders.delta ?? 0;
  const ticket      = stats?.averageTicket.value ?? 0;
  const ticketDelta = stats?.averageTicket.delta ?? 0;
  const prepMin     = stats?.prepMinutes.value ?? 0;
  const activeCount = stats?.prepMinutes.activeCount ?? 0;
  const prepMinInt  = Math.floor(prepMin);
  const prepSec     = Math.round((prepMin - prepMinInt) * 60);
  const espStr      = `${prepMinInt}:${String(prepSec).padStart(2, "0")}`;
  const active      = orders;

  // Sparks derivados de la serie semanal (caen en "plano" si aún no hay datos)
  const daySeries   = salesByDay?.series ?? [];
  const sparkSales  = buildSpark(daySeries.map(d => d.revenue || 0));
  const sparkOrders = buildSpark(daySeries.map(d => d.orders || 0));
  const sparkTicket = buildSpark(daySeries.map(d => (d.orders ? (d.revenue || 0) / d.orders : 0)));

  // Donut de canales
  const CIRC = 2 * Math.PI * 48;
  const chanEntries = channelsData?.channels ?? [];
  const chanSum = chanEntries.reduce((s, c) => s + c.total, 0) || 1;
  let cumOffset = 0;
  const donutSegs = chanEntries.map((c, i) => {
    const len = (c.total / chanSum) * CIRC;
    const seg = {
      key: c.key,
      pct: c.pct,
      total: c.total,
      count: c.count,
      len,
      offset: cumOffset,
      color: CHAN_COLORS[c.key] || DONUT_FALLBACK[i % DONUT_FALLBACK.length],
    };
    cumOffset += len;
    return seg;
  });

  // Distribución por hora — 12 horas 10h..21h
  const hourBuckets = (() => {
    const raw = hourlyData?.buckets ?? [];
    const byHour: Record<number, number> = {};
    for (const b of raw) byHour[b.hour] = b.count;
    return Array.from({ length: 12 }, (_, i) => ({ h: i + 10, v: byHour[i + 10] || 0 }));
  })();
  const maxHour = Math.max(...hourBuckets.map(d => d.v), 1);

  const greeting = (() => {
    if (!now) return "Buenos días";
    const h = now.getHours();
    if (h < 12) return "Buenos días";
    if (h < 19) return "Buenas tardes";
    return "Buenas noches";
  })();
  const dateLabel = now?.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) ?? "";

  const card: React.CSSProperties = {
    background: DS.surf1,
    border: `1px solid ${DS.bd1}`,
    borderRadius: 16,
    padding: 20,
  };

  const periodSub: Record<Period, string> = {
    "HOY": "hoy",
    "7D":  "últimos 7 días",
    "30D": "últimos 30 días",
    "AÑO": "este año",
  };
  const deltaLabel = (d: number, prev: number) => {
    if (!stats) return "—";
    if (prev === 0 && d === 0) return "Sin datos previos";
    const sign = d > 0 ? "↑" : d < 0 ? "↓" : "";
    return `${sign} ${Math.abs(d)}% vs ant.`;
  };

  // KPIs — sin IconBadge. El HTML canónico no lo tiene: son puro texto + spark.
  const KPIS = [
    {
      label: period === "HOY" ? "Ventas de hoy" : `Ventas (${period})`,
      value: ventas > 0 ? fmtMoney(ventas) : "$0",
      delta: deltaLabel(ventasDelta, ventasPrev),
      up: ventasDelta >= 0,
      sub: periodSub[period],
      line: sparkSales.line,  fill: sparkSales.fill,
      color: "var(--iris-400)",
      href: "/admin/reportes",
    },
    {
      label: "Pedidos",
      value: String(ordersCount),
      delta: deltaLabel(ordersDelta, stats?.orders.prev ?? 0),
      up: ordersDelta >= 0,
      sub: activeCount ? `${activeCount} activos ahora` : periodSub[period],
      line: sparkOrders.line, fill: "",
      color: "var(--ok)",
      href: "/admin/pedidos",
    },
    {
      label: "Ticket promedio",
      value: ticket > 0 ? fmtMoney(ticket) : "—",
      delta: deltaLabel(ticketDelta, stats?.averageTicket.prev ?? 0),
      up: ticketDelta >= 0,
      sub: periodSub[period],
      line: sparkTicket.line, fill: "",
      color: "var(--warn)",
      href: "/admin/reportes",
    },
    {
      label: "Tiempo prep. prom.",
      value: activeCount > 0 ? espStr : "—",
      delta: activeCount ? `${activeCount} activos` : "—",
      up: true,
      sub: "tiempo en espera",
      line: "", fill: "",
      color: "var(--iris-300)",
      href: "/admin/pedidos",
    },
  ];

  // Empty state: sin sucursales
  if (locationsCount === 0) {
    return (
      <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: DS.tx, fontFamily: DS.fB }}>
        <div style={{ maxWidth: 520, textAlign: "center", background: DS.surf1, border: `1px solid ${DS.bd1}`, borderRadius: 24, padding: 48 }}>
          <div style={{ width: 72, height: 72, margin: "0 auto 24px", background: DS.irisSoft, border: `1px solid ${DS.iris5}`, borderRadius: 18, display: "grid", placeItems: "center", fontSize: 32 }}>🏪</div>
          <h1 style={{ fontFamily: DS.fD, fontWeight: 800, fontSize: 26, color: DS.txHi, letterSpacing: "-.02em", marginBottom: 8 }}>
            Aún no tienes sucursales
          </h1>
          <p style={{ color: DS.txMut, fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
            Para empezar a operar necesitas crear tu primera sucursal. Ahí se registran pedidos, turnos, inventario y empleados.
          </p>
          <button
            onClick={() => router.push("/admin/configurar-negocio")}
            style={{ padding: "14px 28px", borderRadius: 12, background: DS.iris5, color: "#fff", border: "none", fontFamily: DS.fD, fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: `0 6px 24px ${DS.irisGlow}` }}
          >
            Crear mi primera sucursal →
          </button>
        </div>
      </div>
    );
  }

  // ── UI ───────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div style={{ color: DS.tx, fontFamily: DS.fB, minHeight: "100vh" }}>

        {/* ═══ TOPBAR ═══ */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 20, marginBottom: 24, borderBottom: `1px solid ${DS.bd1}`, gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: DS.fD, fontWeight: 800, fontSize: 32, color: DS.txHi, letterSpacing: "-.02em", lineHeight: 1.1 }}>
              {greeting}, {userName}.
            </h1>
            <div style={{ fontSize: 13, color: DS.txMut, marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ textTransform: "capitalize" }}>{dateLabel}</span>
              {locationName && <><span>·</span><span>{locationName}</span></>}
              {shift && <><span>·</span><span style={{ color: DS.ok }}>● Turno activo</span></>}
              <span style={{ marginLeft: 12, fontFamily: DS.fM, fontSize: 10, color: DS.txDim, opacity: 0.7 }}>
                build {(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7)}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {locations.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontFamily: DS.fM, fontSize: 9, color: DS.txDim, letterSpacing: ".14em" }}>SUCURSAL ACTIVA</span>
                <div style={{ position: "relative" }}>
                  <select
                    value={activeLocationId}
                    onChange={e => handleLocationChange(e.target.value)}
                    style={{
                      appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
                      padding: "7px 28px 7px 12px", borderRadius: 10,
                      background: DS.surf2, border: `1px solid ${DS.bd1}`, color: DS.txHi,
                      fontFamily: DS.fB, fontSize: 12, fontWeight: 600, cursor: "pointer", minWidth: 150,
                    }}
                  >
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: DS.txMut, fontSize: 8, pointerEvents: "none" }}>▼</span>
                </div>
              </div>
            )}
            {/* Segmented control (HOY/7D/30D/AÑO) */}
            <div style={{ display: "inline-flex", background: DS.surf2, border: `1px solid ${DS.bd1}`, borderRadius: 8, padding: 2 }}>
              {(["HOY", "7D", "30D", "AÑO"] as Period[]).map(p => {
                const on = period === p;
                return (
                  <button key={p} onClick={() => setPeriod(p)} style={{
                    padding: "5px 10px", borderRadius: 6,
                    fontFamily: DS.fM, fontSize: 11,
                    color: on ? DS.txHi : DS.txMut, cursor: "pointer",
                    border: "none", letterSpacing: ".04em",
                    background: on ? DS.surf1 : "transparent",
                    boxShadow: on ? "0 1px 2px rgba(0,0,0,.3)" : "none",
                  }}>{p}</button>
                );
              })}
            </div>
            <button
              onClick={() => {
                const rows: (string | number)[][] = [];
                rows.push(["Dashboard — export", new Date().toISOString()]);
                rows.push(["Sucursal", locationName || "—"]);
                rows.push(["Periodo", period]);
                rows.push([]);
                rows.push(["KPI", "Valor", "Periodo anterior", "Delta %"]);
                if (stats) {
                  rows.push(["Ventas",           stats.sales.value,         stats.sales.prev,         stats.sales.delta]);
                  rows.push(["Pedidos",          stats.orders.value,        stats.orders.prev,        stats.orders.delta]);
                  rows.push(["Ticket promedio",  stats.averageTicket.value, stats.averageTicket.prev, stats.averageTicket.delta]);
                  rows.push(["Tiempo prep (min)", stats.prepMinutes.value, "", ""]);
                }
                if (salesByDay?.series?.length) {
                  rows.push([]);
                  rows.push(["Fecha", "Ventas", "Pedidos"]);
                  for (const d of salesByDay.series) rows.push([d.date, d.revenue, d.orders]);
                }
                if (channelsData?.channels?.length) {
                  rows.push([]);
                  rows.push(["Canal", "Total", "Pedidos", "%"]);
                  for (const c of channelsData.channels) rows.push([c.key, c.total, c.count, c.pct]);
                }
                const stamp = new Date().toISOString().slice(0, 10);
                downloadFile(`dashboard-${period.toLowerCase()}-${stamp}.csv`, toCsv(rows));
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, background: DS.surf1, border: `1px solid ${DS.bd1}`, color: DS.txMid, fontSize: 12, fontWeight: 500, cursor: "pointer" }}
            >
              Exportar
            </button>
            <button
              onClick={() => router.push("/admin/pedidos?new=1")}
              style={{ padding: "9px 16px", borderRadius: 10, background: DS.iris5, color: "#fff", border: "none", fontWeight: 600, fontSize: 13, fontFamily: DS.fB, cursor: "pointer", boxShadow: `0 4px 14px ${DS.irisGlow}` }}
            >
              + Nueva venta
            </button>
          </div>
        </div>

        {/* ═══ KPI GRID ═══ */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
          {KPIS.map((k, i) => (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => router.push(k.href)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(k.href); } }}
              style={{ ...card, position: "relative", overflow: "hidden", cursor: "pointer", padding: "18px 20px" }}
            >
              <div style={{ fontFamily: DS.fM, fontSize: 10, color: DS.txMut, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>
                {k.label}
              </div>
              <div style={{ fontFamily: DS.fD, fontWeight: 800, fontSize: 38, color: DS.txHi, letterSpacing: "-.02em", lineHeight: 1 }}>
                {k.value}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, fontFamily: DS.fM, fontSize: 11, fontWeight: 600, background: k.up ? DS.okS : DS.errS, color: k.up ? DS.ok : DS.err }}>
                  {k.delta}
                </span>
                <span style={{ fontSize: 11, color: DS.txMut }}>{k.sub}</span>
              </div>
              {(k.line || k.fill) && (
                <svg viewBox="0 0 300 30" preserveAspectRatio="none" style={{ height: 30, marginTop: 10, width: "100%", display: "block" }}>
                  {k.fill && (
                    <>
                      <defs>
                        <linearGradient id={`sp${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={k.color} stopOpacity=".4" />
                          <stop offset="100%" stopColor={k.color} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={k.fill} fill={`url(#sp${i})`} />
                    </>
                  )}
                  {k.line && <path d={k.line} stroke={k.color} strokeWidth="1.5" fill="none" />}
                </svg>
              )}
            </div>
          ))}
        </div>

        {/* ═══ CHART + LIVE ORDERS (row-chart 2.2fr/1fr) ═══ */}
        <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 14, marginBottom: 14 }}>
          {/* Sales chart */}
          <div style={card}>
            {(() => {
              const series = salesByDay?.series ?? [];
              const total  = salesByDay?.totals.current.revenue ?? 0;
              const prev   = salesByDay?.totals.previous.revenue ?? 0;
              const delta  = salesByDay?.totals.delta ?? 0;
              const hasData = series.some(d => (d.revenue || 0) > 0);
              const max = Math.max(1, ...series.map(d => d.revenue || 0));
              const DOW = ["DOM","LUN","MAR","MIE","JUE","VIE","SÁB"];
              const n = series.length;
              const pts: [number, number][] = series.map((d, i) => {
                const x = 90 + (n > 1 ? i * (660 / (n - 1)) : 330);
                const y = 220 - ((d.revenue || 0) / max) * 170;
                return [x, y];
              });
              const linePath = pts.length ? `M ${pts.map(p => `${p[0]},${p[1]}`).join(" L ")}` : "";
              const fillPath = pts.length ? `${linePath} L ${pts[pts.length - 1]![0]},220 L ${pts[0]![0]},220 Z` : "";
              const deltaSign  = delta > 0 ? "↑" : delta < 0 ? "↓" : "";
              const deltaColor = delta >= 0 ? DS.ok : DS.err;
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontFamily: DS.fD, fontWeight: 700, fontSize: 15, color: DS.txHi, letterSpacing: "-.01em" }}>Ventas por día</div>
                      <div style={{ fontSize: 11, color: DS.txMut, marginTop: 2 }}>
                        Últimos 7 días · {fmtMoney(total)} acumulado
                        {prev > 0 && (
                          <span style={{ color: deltaColor, marginLeft: 8, fontFamily: DS.fM }}>
                            {deltaSign} {Math.abs(delta)}% vs 7 días previos
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 18 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: DS.txMid }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--iris-400)" }} />Esta semana
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: DS.txMid }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: DS.txDim }} />Semana ant.
                      </div>
                    </div>
                  </div>
                  <div style={{ position: "relative", height: 260 }}>
                    {!hasData && (
                      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: DS.txMut, fontSize: 13, textAlign: "center", zIndex: 1 }}>
                        Aún no hay ventas en los últimos 7 días.
                      </div>
                    )}
                    <svg viewBox="0 0 800 260" preserveAspectRatio="none" style={{ width: "100%", height: "100%", opacity: hasData ? 1 : 0.25 }}>
                      <defs>
                        <linearGradient id="ch-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--iris-400)" stopOpacity=".35" />
                          <stop offset="100%" stopColor="var(--iris-400)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <g stroke="rgba(255,255,255,.06)" strokeWidth="1">
                        <line x1="40" y1="50"  x2="780" y2="50" />
                        <line x1="40" y1="135" x2="780" y2="135" />
                        <line x1="40" y1="220" x2="780" y2="220" />
                      </g>
                      <g fontFamily="DM Mono" fontSize="10" fill="#9494b8">
                        <text x="32" y="54"  textAnchor="end">{fmtMoney(max)}</text>
                        <text x="32" y="139" textAnchor="end">{fmtMoney(Math.round(max / 2))}</text>
                        <text x="32" y="224" textAnchor="end">$0</text>
                      </g>
                      <g fontFamily="DM Mono" fontSize="10" fill="#9494b8">
                        {series.map((d, i) => {
                          const x = 90 + (n > 1 ? i * (660 / (n - 1)) : 330);
                          const dow = DOW[new Date(d.date + "T00:00:00").getDay()] ?? "";
                          return <text key={d.date} x={x} y="244" textAnchor="middle">{dow}</text>;
                        })}
                      </g>
                      {hasData && fillPath && <path d={fillPath} fill="url(#ch-grad)" />}
                      {hasData && linePath && <path d={linePath} stroke="var(--iris-400)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
                      {hasData && pts.map(([x, y], i) => (
                        <circle key={i} cx={x} cy={y} r="4" fill="var(--iris-400)" />
                      ))}
                    </svg>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Live orders */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: DS.fD, fontWeight: 700, fontSize: 15, color: DS.txHi }}>En vivo</div>
                <div style={{ fontSize: 11, color: DS.txMut, marginTop: 2 }}>
                  {loading ? "Cargando…" : `${active.length} ${active.length === 1 ? "pedido activo" : "pedidos activos"}`}
                </div>
              </div>
              <span style={{ padding: "3px 8px", borderRadius: 999, fontFamily: DS.fM, fontSize: 10, fontWeight: 700, letterSpacing: ".06em", display: "inline-flex", alignItems: "center", gap: 5, background: active.length ? DS.okS : DS.surf2, color: active.length ? DS.ok : DS.txMut }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                {active.length ? "OPERANDO" : "SIN ACTIVIDAD"}
              </span>
            </div>
            <div className="db-scroll" style={{ maxHeight: 290, overflowY: "auto", margin: "-4px -4px 0" }}>
              <div style={{ padding: "0 4px" }}>
                {!loading && active.length === 0 && (
                  <div style={{ padding: "32px 0", textAlign: "center", color: DS.txMut, fontSize: 12 }}>
                    Los pedidos que se creen en la TPV aparecerán aquí en tiempo real.
                  </div>
                )}
                {active.map((o, i) => (
                  <div
                    key={o.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/admin/pedidos?id=${o.id}`)}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/admin/pedidos?id=${o.id}`); } }}
                    style={{ display: "grid", gridTemplateColumns: "56px 1fr auto auto", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < active.length - 1 ? `1px solid ${DS.bd1}` : "none", cursor: "pointer" }}
                  >
                    <span style={{ fontFamily: DS.fM, fontSize: 12, color: DS.iris3, fontWeight: 600 }}>
                      #{o.orderNumber || o.id.slice(-4)}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, color: DS.tx, fontWeight: 500 }}>
                        {o.customer?.name || (o.orderType === "MESA" ? `Mesa ${(o as any).tableNumber || "–"}` : o.orderType || "Cliente")}
                      </div>
                      <div style={{ fontSize: 11, color: DS.txMut, marginTop: 2 }}>
                        {o.items?.slice(0, 2).map(it => `${it.quantity}× ${it.menuItem?.name}`).join(", ") || o.orderType}
                      </div>
                    </div>
                    <span style={{ fontFamily: DS.fD, fontWeight: 700, fontSize: 14, color: DS.txHi }}>
                      {fmtMoney(o.total || 0)}
                    </span>
                    <StatusChip s={o.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ TOP + HOURLY + STAFF (row-3) ═══ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
          {/* Top items */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: DS.fD, fontWeight: 700, fontSize: 15, color: DS.txHi }}>
                  {period === "HOY" ? "Top del día" : `Top · ${period}`}
                </div>
                <div style={{ fontSize: 11, color: DS.txMut, marginTop: 2 }}>Más vendidos · {periodSub[period]}</div>
              </div>
              <button
                onClick={() => router.push("/admin/reportes")}
                style={{ display: "inline-flex", alignItems: "center", padding: "8px 12px", borderRadius: 10, background: DS.surf1, border: `1px solid ${DS.bd1}`, color: DS.txMid, fontSize: 12, fontWeight: 500, cursor: "pointer" }}
              >Ver todo →</button>
            </div>
            {topProducts.length === 0 && (
              <div style={{ padding: "24px 0", textAlign: "center", color: DS.txMut, fontSize: 12 }}>
                Sin ventas registradas en este período.
              </div>
            )}
            {(() => {
              const maxQty = topProducts.reduce((m, it) => Math.max(m, it.quantity || 0), 0) || 1;
              return topProducts.map((it, i) => {
                const pct = Math.round(((it.quantity || 0) / maxQty) * 100);
                return (
                  <div key={`${it.name}-${i}`} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 12, alignItems: "center", padding: "10px 0", borderTop: i > 0 ? `1px solid ${DS.bd1}` : "none" }}>
                    <span style={{ fontFamily: DS.fD, fontWeight: 800, fontSize: 14, color: DS.txDim, textAlign: "center" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, color: DS.tx, fontWeight: 500 }}>{it.name}</div>
                      <div style={{ height: 3, background: DS.surf2, borderRadius: 2, overflow: "hidden", marginTop: 4 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,var(--iris-500),var(--iris-300))", borderRadius: 2 }} />
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: DS.fM, fontSize: 12, color: DS.txHi, fontWeight: 600 }}>{fmtMoney(it.total || 0)}</div>
                      <div style={{ fontFamily: DS.fM, fontSize: 10, color: DS.txMut }}>{it.quantity || 0} ×</div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Hourly */}
          <div style={card}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: DS.fD, fontWeight: 700, fontSize: 15, color: DS.txHi }}>Distribución por hora</div>
              <div style={{ fontSize: 11, color: DS.txMut, marginTop: 2 }}>
                {periodSub[period]} · {hourlyData?.total ?? 0} pedidos
              </div>
            </div>
            <svg viewBox="0 0 400 200" style={{ width: "100%", height: 200, display: "block" }} preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="bar-g" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="var(--iris-600)" />
                  <stop offset="100%" stopColor="var(--iris-300)" />
                </linearGradient>
              </defs>
              <g stroke="rgba(255,255,255,.06)" strokeWidth="1">
                <line x1="0" y1="40"  x2="400" y2="40"  />
                <line x1="0" y1="90"  x2="400" y2="90"  />
                <line x1="0" y1="140" x2="400" y2="140" />
              </g>
              {hourBuckets.map((d, i) => {
                const barH  = Math.max(4, (d.v / maxHour) * 130);
                const isNow = now && d.h === now.getHours();
                return (
                  <g key={i}>
                    <rect
                      x={10 + i * 32} y={165 - barH} width={24} height={barH} rx="3"
                      fill={isNow ? "var(--iris-400)" : "url(#bar-g)"}
                      stroke={isNow ? "#fff" : undefined}
                      strokeWidth={isNow ? 1.5 : 0}
                      opacity={isNow ? 1 : Math.max(0.3, d.v / maxHour * 0.7 + 0.3)}
                    />
                    <text x={22 + i * 32} y={182} fontFamily="DM Mono" fontSize="9" fill={isNow ? "var(--iris-300)" : "var(--tx-dim)"} textAnchor="middle" fontWeight={isNow ? "700" : "400"}>
                      {d.h}h
                    </text>
                  </g>
                );
              })}
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 12, borderTop: `1px solid ${DS.bd1}` }}>
              {(() => {
                const hasData = hourBuckets.some(d => d.v > 0);
                if (!hasData) {
                  return (
                    <div style={{ color: DS.txMut, fontSize: 12, fontFamily: DS.fM }}>
                      Sin pedidos · {periodSub[period]}.
                    </div>
                  );
                }
                const sorted  = [...hourBuckets].sort((a, b) => b.v - a.v);
                const peak    = sorted[0];
                const slowest = [...hourBuckets].filter(d => d.v > 0).sort((a, b) => a.v - b.v)[0] || hourBuckets[0];
                const items = [
                  { label: "PICO",         val: peak    ? `${peak.h}:00`    : "—" },
                  { label: "PEDIDOS PICO", val: peak    ? String(peak.v)    : "—" },
                  { label: "MÁS LENTO",    val: slowest ? `${slowest.h}:00` : "—" },
                ];
                return items.map(s => (
                  <div key={s.label}>
                    <div style={{ fontFamily: DS.fM, fontSize: 10, color: DS.txDim, letterSpacing: ".1em" }}>{s.label}</div>
                    <div style={{ fontFamily: DS.fD, fontSize: 18, fontWeight: 800, color: DS.txHi, marginTop: 2 }}>{s.val}</div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Staff */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: DS.fD, fontWeight: 700, fontSize: 15, color: DS.txHi }}>Turno actual</div>
                <div style={{ fontSize: 11, color: DS.txMut, marginTop: 2 }}>
                  {activeStaff[0]
                    ? `${activeStaff.length} ${activeStaff.length === 1 ? "persona" : "personas"} · abierto ${new Date(activeStaff[0].startAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
                    : "Sin personal activo"}
                </div>
              </div>
              <span style={{ padding: "3px 8px", borderRadius: 999, fontFamily: DS.fM, fontSize: 10, fontWeight: 700, letterSpacing: ".06em", display: "inline-flex", alignItems: "center", gap: 5, background: activeStaff.length > 0 ? DS.okS : DS.surf2, color: activeStaff.length > 0 ? DS.ok : DS.txMut }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                {activeStaff.length > 0 ? "ACTIVO" : "SIN TURNO"}
              </span>
            </div>
            {activeStaff.length === 0 && (
              <div style={{ padding: "24px 0", textAlign: "center", color: DS.txMut, fontSize: 12 }}>
                Abre un turno en la TPV para ver el personal activo aquí.
              </div>
            )}
            {activeStaff.map((s, i) => {
              const initials = s.name.split(" ").filter(Boolean).map(p => p[0]).slice(0, 2).join("").toUpperCase() || "??";
              const GRAD_BY_ROLE: Record<string, string> = {
                MANAGER:  "135deg,#7c3aed,#ec4899", GERENTE: "135deg,#7c3aed,#ec4899",
                WAITER:   "135deg,#f59e0b,#dc2626", MESERA:  "135deg,#f59e0b,#dc2626", MESERO: "135deg,#f59e0b,#dc2626",
                KITCHEN:  "135deg,#10b981,#047857", COCINA:  "135deg,#10b981,#047857",
                DELIVERY: "135deg,#3b82f6,#1e40af", REPARTO: "135deg,#3b82f6,#1e40af",
                CASHIER:  "135deg,#a855f7,#6b21a8", CAJA:    "135deg,#a855f7,#6b21a8",
              };
              const grad   = GRAD_BY_ROLE[s.role?.toUpperCase?.() || ""] || "135deg,#6b7280,#374151";
              const mins   = Math.max(0, Math.floor((Date.now() - new Date(s.startAt).getTime()) / 60000));
              const dur    = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
              const tables = s.tables?.length ? ` · ${s.tables.join(", ")}` : "";
              return (
                <div key={s.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: i > 0 ? `1px solid ${DS.bd1}` : "none" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(${grad})`, color: "#fff", fontFamily: DS.fD, fontWeight: 700, fontSize: 12, display: "grid", placeItems: "center" }}>
                    {initials}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: DS.tx, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: DS.txMut, fontFamily: DS.fM }}>{(s.role || "").toUpperCase()} · {dur}{tables}</div>
                  </div>
                  <div style={{ fontFamily: DS.fM, fontSize: 11, color: DS.ok }}>●</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ CHANNELS + INVENTORY (row-2, 2fr/1fr) ═══ */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
          {/* Channels & payments */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: DS.fD, fontWeight: 700, fontSize: 15, color: DS.txHi }}>Canales &amp; pagos</div>
                <div style={{ fontSize: 11, color: DS.txMut, marginTop: 2 }}>Cómo llegan y cómo pagan · {periodSub[period]}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 32, alignItems: "center" }}>
              <svg viewBox="0 0 120 120" style={{ width: 180, height: 180 }}>
                <circle cx="60" cy="60" r="48" fill="none" stroke={DS.surf2} strokeWidth="16" />
                {donutSegs.map(seg => (
                  <circle key={seg.key} cx="60" cy="60" r="48" fill="none"
                    stroke={seg.color} strokeWidth="16"
                    strokeDasharray={`${seg.len} ${CIRC}`}
                    strokeDashoffset={-seg.offset}
                    transform="rotate(-90 60 60)"
                  />
                ))}
                <text x="60" y="56" textAnchor="middle" fontFamily="DM Mono" fontSize="9" fill="#9494b8" letterSpacing=".1em">TOTAL</text>
                <text x="60" y="72" textAnchor="middle" fontFamily="Syne" fontWeight="800" fontSize="16" fill="#fff">
                  {(channelsData?.total ?? 0) > 0 ? `$${Math.round((channelsData?.total ?? 0) / 1000)}k` : "$0"}
                </text>
              </svg>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 22px" }}>
                {donutSegs.length === 0 && (
                  <div style={{ gridColumn: "1 / -1", color: DS.txMut, fontSize: 12 }}>
                    Sin ventas registradas en este período.
                  </div>
                )}
                {donutSegs.slice(0, 4).map(seg => (
                  <div key={seg.key}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color }} />
                      <span style={{ color: DS.txMid, fontSize: 12 }}>{seg.key}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontFamily: DS.fD, fontSize: 22, fontWeight: 800, color: DS.txHi }}>{seg.pct}%</span>
                      <span style={{ fontFamily: DS.fM, fontSize: 11, color: DS.txMut }}>{fmtMoney(seg.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${DS.bd1}`, display: "flex", gap: 16 }}>
              {(() => {
                const pm: Record<string, { total: number; count: number }> = {};
                for (const p of channelsData?.payments ?? []) {
                  pm[p.key] = { total: p.total, count: p.count };
                }
                const group = (labels: string[]) => labels.reduce(
                  (acc, k) => ({ total: acc.total + (pm[k]?.total || 0), count: acc.count + (pm[k]?.count || 0) }),
                  { total: 0, count: 0 }
                );
                const cardPay = group(["CARD", "CARD_PRESENT", "CREDIT_CARD", "DEBIT_CARD"]);
                const cashPay = group(["CASH", "CASH_ON_DELIVERY"]);
                const tranPay = group(["TRANSFER", "SPEI", "OXXO"]);
                const totalSum = Math.max(1, channelsData?.total ?? 0);
                const rows = [
                  { label: "TARJETA",   ...cardPay },
                  { label: "EFECTIVO",  ...cashPay },
                  { label: "TRANSFER.", ...tranPay },
                ];
                return rows.map(p => (
                  <div key={p.label} style={{ flex: 1, padding: 12, background: DS.surf2, borderRadius: 10 }}>
                    <div style={{ fontFamily: DS.fM, fontSize: 10, color: DS.txMut, letterSpacing: ".12em" }}>{p.label}</div>
                    <div style={{ fontFamily: DS.fD, fontSize: 20, fontWeight: 800, color: DS.txHi, marginTop: 4 }}>
                      {p.total > 0 ? fmtMoney(p.total) : "—"}
                    </div>
                    <div style={{ fontSize: 11, color: DS.txMut, marginTop: 2 }}>
                      {p.count > 0 ? `${Math.round((p.total / totalSum) * 100)}% · ${p.count} trans.` : "sin ventas"}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Inventory alert */}
          <div style={{ background: `linear-gradient(135deg, ${DS.errS}, transparent 60%), ${DS.surf1}`, border: "1px solid rgba(239,68,68,.2)", borderRadius: 16, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: DS.fD, fontWeight: 700, fontSize: 15, color: DS.err }}>⚠ Inventario bajo</div>
                <div style={{ fontSize: 11, color: DS.txMut, marginTop: 2 }}>
                  {invAlerts.length > 0
                    ? `${invAlerts.length} ${invAlerts.length === 1 ? "ingrediente crítico" : "ingredientes críticos"}`
                    : "Stock en orden"}
                </div>
              </div>
              <button
                onClick={() => router.push("/admin/inventario")}
                style={{ display: "inline-flex", alignItems: "center", padding: "8px 12px", borderRadius: 10, background: DS.errS, border: "1px solid rgba(239,68,68,.3)", color: DS.err, fontSize: 12, fontWeight: 500, cursor: "pointer" }}
              >Reponer</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {invAlerts.length === 0 && (
                <div style={{ padding: "24px 0", textAlign: "center", color: DS.txMut, fontSize: 12 }}>
                  No hay ingredientes por debajo del mínimo.
                </div>
              )}
              {invAlerts.slice(0, 4).map(item => {
                const pct = item.minStock > 0 ? Math.min(100, Math.round((item.stock / item.minStock) * 100)) : 0;
                const color = pct < 25 ? DS.err : DS.warn;
                return (
                  <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 60px auto", gap: 10, alignItems: "center", padding: "10px 12px", background: DS.surf2, borderRadius: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: DS.tx }}>{item.name}</div>
                      <div style={{ fontFamily: DS.fM, fontSize: 10, color: DS.txMut, letterSpacing: ".08em" }}>{pct}% DISPONIBLE</div>
                    </div>
                    <div style={{ height: 4, background: DS.surf3, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color }} />
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: DS.fD, fontSize: 14, fontWeight: 800, color }}>{item.stock} {item.unit}</div>
                      <div style={{ fontFamily: DS.fM, fontSize: 9, color: DS.txMut }}>MIN {item.minStock} {item.unit}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => router.push("/admin/inventario/proveedores")}
              style={{ width: "100%", marginTop: 14, padding: "9px 16px", borderRadius: 10, background: DS.err, color: "#fff", border: "none", fontWeight: 600, fontSize: 13, fontFamily: DS.fB, cursor: "pointer", boxShadow: "0 4px 14px rgba(239,68,68,.3)" }}
            >
              Generar orden de compra →
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
