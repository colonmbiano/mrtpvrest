"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { getUser } from "@/lib/auth";

type TopProduct = { name: string; quantity: number; total: number };
type StaffMember = { id: string; name: string; role: string; tables: string[]; startAt: string };
type InventoryAlert = { id: string; name: string; unit: string; stock: number; minStock: number };

type Order = {
  id: string;
  orderNumber?: number;
  status: "PENDING"|"CONFIRMED"|"PREPARING"|"READY"|"DELIVERING"|"DELIVERED"|"CANCELLED";
  total: number;
  createdAt: string;
  items: { quantity: number; menuItem: { name: string } }[];
  orderType?: string;
  tableNumber?: string;
  customer?: { name: string };
};

function minutesSince(d: string) {
  if (!d) return 0;
  const ms = Date.now() - new Date(d).getTime();
  return isNaN(ms) ? 0 : Math.floor(ms / 60000);
}
function fmtMoney(n: number) {
  return "$" + n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

const CSS = `
@keyframes db-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
.db-scroll::-webkit-scrollbar { width:5px; }
.db-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,.14); border-radius:3px; }
.db-scroll::-webkit-scrollbar-track { background:transparent; }
`;

const V = {
  surf1: "var(--surf, #0f0f1c)",
  surf2: "var(--surf2, #15152a)",
  surf3: "var(--surf3, #1c1c38)",
  bd1:   "var(--border, rgba(255,255,255,.08))",
  tx:    "var(--text, #f4f4fb)",
  txHi:  "#ffffff",
  txMid: "#c4c4de",
  txMut: "var(--muted, #9494b8)",
  txDim: "#6e6e92",
  iris3: "#b89eff",
  iris4: "#9472ff",
  iris5: "#7c3aed",
  irisS: "rgba(124,58,237,.14)",
  ok:    "var(--green, #10b981)",
  warn:  "var(--amber, #f59e0b)",
  err:   "var(--red, #ef4444)",
  info:  "var(--blue, #3b82f6)",
  okS:   "rgba(16,185,129,.14)",
  warnS: "rgba(245,158,11,.14)",
  errS:  "rgba(239,68,68,.14)",
  infoS: "rgba(59,130,246,.14)",
};

type Period = "HOY" | "7D" | "30D" | "AÑO";

const CHAN_COLORS: Record<string, string> = {
  TPV: "#9472ff", WEB: "var(--blue, #3b82f6)", RAPPI: "var(--red, #ef4444)",
  UBER: "#8b5cf6", DELIVERY: "#b89eff", MESA: "#9472ff",
  KIOSK: "#dcd0ff", TAKEOUT: "#7c3aed",
};
const DONUT_DEFAULTS = ["#9472ff", "#7c3aed", "#b89eff", "#dcd0ff"];

function StatusChip({ s }: { s: string }) {
  type Pair = [string, string];
  const MAP: Record<string, Pair> = {
    READY:      ["var(--green, #10b981)",  "rgba(16,185,129,.14)"],
    PREPARING:  ["var(--amber, #f59e0b)",  "rgba(245,158,11,.14)"],
    DELIVERING: ["#b89eff",                "rgba(124,58,237,.14)"],
    PENDING:    ["var(--blue, #3b82f6)",   "rgba(59,130,246,.14)"],
    CONFIRMED:  ["var(--blue, #3b82f6)",   "rgba(59,130,246,.14)"],
  };
  const LABELS: Record<string, string> = {
    READY: "LISTO", PREPARING: "PREP", DELIVERING: "RUTA", PENDING: "NUEVO", CONFIRMED: "CONF",
  };
  const [c, bg] = MAP[s] || ["var(--muted, #9494b8)", "transparent"];
  return (
    <span style={{ padding: "3px 8px", borderRadius: 999, fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", display: "inline-flex", alignItems: "center", gap: 5, background: bg, color: c, whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
      {LABELS[s] || s}
    </span>
  );
}

export default function RestaurantDashboard() {
  const [orders, setOrders]   = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow]         = useState<Date | null>(null);
  const [shift, setShift]     = useState<any>(null);
  const [period, setPeriod]   = useState<Period>("7D");
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [activeStaff, setActiveStaff] = useState<StaffMember[]>([]);
  const [invAlerts,   setInvAlerts]   = useState<InventoryAlert[]>([]);
  const [userName,    setUserName]    = useState("Admin");
  const [locationName, setLocationName] = useState("");
  const [locationsCount, setLocationsCount] = useState<number | null>(null);
  const [salesByDay, setSalesByDay] = useState<{ date: string; revenue: number; orders: number }[]>([]);
  const router = useRouter();

  const prevIds  = useRef<Set<string>>(new Set());
  const audioCtx = useRef<AudioContext | null>(null);

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

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/api/orders/admin");
      const arr: Order[] = Array.isArray(data) ? data : [];
      setOrders(arr);
      const newIds = new Set<string>(arr.map(o => o.id));
      if (arr.some(o => o.status === "PENDING" && !prevIds.current.has(o.id)) && prevIds.current.size > 0) playBeep();
      prevIds.current = newIds;
    } catch {}
    setLoading(false);
  }, []);

  const fetchShift = useCallback(async () => {
    try { const { data } = await api.get("/api/shifts/current"); setShift(data?.id ? data : null); }
    catch { setShift(null); }
  }, []);

  const fetchStaff = useCallback(async () => {
    try { const { data } = await api.get("/api/shifts/staff-active"); setActiveStaff(Array.isArray(data) ? data : []); }
    catch { setActiveStaff([]); }
  }, []);

  const fetchInventoryAlerts = useCallback(async () => {
    try { const { data } = await api.get("/api/inventory/alerts"); setInvAlerts(Array.isArray(data) ? data : []); }
    catch { setInvAlerts([]); }
  }, []);

  const fetchTopProducts = useCallback(async (p: Period) => {
    try {
      const { data } = await api.get("/api/reports/top-products", { params: { period: p, limit: 5 } });
      setTopProducts(Array.isArray(data) ? data : []);
    } catch { setTopProducts([]); }
  }, []);

  const fetchSalesByDay = useCallback(async () => {
    try {
      const { data } = await api.get("/api/reports/by-day", { params: { days: 7 } });
      setSalesByDay(Array.isArray(data) ? data : []);
    } catch { setSalesByDay([]); }
  }, []);

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
        const list = Array.isArray(data) ? data : [];
        setLocationsCount(list.length);
        const activeId = typeof window !== "undefined" ? localStorage.getItem("locationId") : null;
        const active = list.find((l: any) => l.id === activeId) || list[0] || null;
        if (active?.name) setLocationName(active.name);
      } catch {
        setLocationsCount(0);
      }
    })();
  }, []);

  useEffect(() => {
    fetchOrders(); fetchShift(); fetchStaff(); fetchInventoryAlerts(); fetchSalesByDay();
    const t = setInterval(fetchOrders, 15000);
    return () => clearInterval(t);
  }, [fetchOrders, fetchShift, fetchStaff, fetchInventoryAlerts, fetchSalesByDay]);

  useEffect(() => {
    fetchTopProducts(period);
  }, [period, fetchTopProducts]);

  // Derived stats
  const todayStr   = new Date().toDateString();
  const today      = orders.filter(o => new Date(o.createdAt).toDateString() === todayStr);
  const delivered  = today.filter(o => o.status === "DELIVERED");
  const ventas     = delivered.reduce((s, o) => s + (o.total || 0), 0);
  const ticket     = delivered.length ? Math.round(ventas / delivered.length) : 0;
  const active     = orders.filter(o => !["DELIVERED","CANCELLED"].includes(o.status));
  const espera     = active.length ? active.reduce((s, o) => s + minutesSince(o.createdAt), 0) / active.length : 0;
  const espMin     = Math.floor(espera);
  const espSec     = Math.round((espera - espMin) * 60);
  const espStr     = `${espMin}:${String(espSec).padStart(2, "0")}`;

  // Channel breakdown
  const channelMap = orders.reduce((acc: Record<string, number>, o) => {
    const ch = o.orderType || "TPV";
    acc[ch] = (acc[ch] || 0) + (o.total || 0);
    return acc;
  }, {});
  const effectiveChan: Record<string, number> = channelMap;
  const chanKeys = Object.keys(effectiveChan);
  const chanVals = chanKeys.map(k => effectiveChan[k]);
  const chanSum  = chanVals.reduce((a, b) => a + b, 0) || 1;
  const CIRC = 2 * Math.PI * 48;
  let cumOffset = 0;
  const donutSegs = chanKeys.map((k, i) => {
    const pct = chanVals[i] / chanSum;
    const len = pct * CIRC;
    const seg = { key: k, pct: Math.round(pct * 100), len, offset: cumOffset, color: CHAN_COLORS[k] || DONUT_DEFAULTS[i % 4] };
    cumOffset += len;
    return seg;
  });

  // Hourly chart data
  const hourBuckets = (() => {
    const map: Record<number, number> = {};
    orders.filter(o => new Date(o.createdAt).toDateString() === todayStr)
      .forEach(o => { const h = new Date(o.createdAt).getHours(); map[h] = (map[h] || 0) + 1; });
    return Array.from({ length: 12 }, (_, i) => ({ h: i + 10, v: map[i + 10] || 0 }));
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

  const displayOrders = active;

  const card: React.CSSProperties = {
    background: V.surf1,
    border: `1px solid ${V.bd1}`,
    borderRadius: 16,
    padding: 20,
  };

  const KPIS = [
    {
      label: "Ventas de hoy",
      value: ventas > 0 ? fmtMoney(ventas) : "$0", cents: "",
      delta: delivered.length > 0 ? `${delivered.length} entregados` : "Sin entregas", up: true, sub: "hoy",
      spark: "", fill: "", color: "#9472ff",
    },
    {
      label: "Pedidos",
      value: String(today.length), cents: "",
      delta: `${active.length} en vivo`, up: true, sub: active.length ? "activos ahora" : "sin pedidos activos",
      spark: "", fill: "", color: "var(--green, #10b981)",
    },
    {
      label: "Ticket promedio",
      value: ticket > 0 ? fmtMoney(ticket) : "—", cents: "",
      delta: delivered.length ? `${delivered.length} pedidos` : "—", up: true, sub: "hoy",
      spark: "", fill: "", color: "var(--amber, #f59e0b)",
    },
    {
      label: "Tiempo prep. prom.",
      value: active.length > 0 ? espStr : "—", cents: "",
      delta: active.length ? `${active.length} activos` : "—", up: true, sub: "tiempo en espera",
      spark: "", fill: "", color: "#b89eff",
    },
  ];

  // Empty state: sin sucursales → CTA para crear la primera, no renderizar el layout
  if (locationsCount === 0) {
    return (
      <div style={{
        minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, color: V.tx, fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{
          maxWidth: 520, textAlign: "center",
          background: V.surf1, border: `1px solid ${V.bd1}`,
          borderRadius: 24, padding: 48,
        }}>
          <div style={{
            width: 72, height: 72, margin: "0 auto 24px",
            background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)",
            borderRadius: 18, display: "grid", placeItems: "center",
            fontSize: 32,
          }}>🏪</div>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, color: V.txHi, letterSpacing: "-.02em", marginBottom: 8 }}>
            Aún no tienes sucursales
          </h1>
          <p style={{ color: V.txMut, fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
            Para empezar a operar necesitas crear tu primera sucursal. Ahí se registran pedidos, turnos, inventario y empleados.
          </p>
          <button
            onClick={() => router.push("/admin/configurar-negocio")}
            style={{
              padding: "14px 28px", borderRadius: 12,
              background: "var(--brand-primary, #7c3aed)",
              color: "#fff", border: "none",
              fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15,
              cursor: "pointer",
              boxShadow: "0 6px 24px rgba(124,58,237,.35)",
            }}
          >
            Crear mi primera sucursal →
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <div style={{ color: V.tx, fontFamily: "'DM Sans',sans-serif", minHeight: "100vh" }}>

        {/* ── Topbar ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 20, marginBottom: 24, borderBottom: `1px solid ${V.bd1}` }}>
          <div>
            <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 32, color: V.txHi, letterSpacing: "-.02em", lineHeight: 1.1 }}>
              {greeting}, {userName}.
            </h1>
            <div style={{ fontSize: 13, color: V.txMut, marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ textTransform: "capitalize" }}>{dateLabel}</span>
              {locationName && <><span>·</span><span>{locationName}</span></>}
              {shift && <><span>·</span><span style={{ color: "var(--green, #10b981)" }}>● Turno activo</span></>}
              <span style={{ marginLeft: "auto", fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txDim, opacity: 0.7 }}>
                build {(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7)}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ display: "inline-flex", background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 8, padding: 2 }}>
              {(["HOY", "7D", "30D", "AÑO"] as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={{
                  padding: "5px 10px", borderRadius: 6,
                  fontFamily: "'DM Mono',monospace", fontSize: 11,
                  color: period === p ? V.txHi : V.txMut, cursor: "pointer",
                  border: "none", letterSpacing: ".04em",
                  background: period === p ? V.surf1 : "transparent",
                  boxShadow: period === p ? "0 1px 2px rgba(0,0,0,.3)" : "none",
                }}>
                  {p}
                </button>
              ))}
            </div>
            <button style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, background: V.surf1, border: `1px solid ${V.bd1}`, color: V.txMid, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              Exportar
            </button>
            <button style={{ padding: "9px 16px", borderRadius: 10, background: "var(--brand-primary,#7c3aed)", color: "#fff", border: "none", fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", boxShadow: "0 4px 14px rgba(124,58,237,.35)" }}>
              + Nueva venta
            </button>
          </div>
        </div>

        {/* ── KPI Grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
          {KPIS.map((k, i) => (
            <div key={i} style={{ ...card, position: "relative", overflow: "hidden" }}>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txMut, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 8 }}>
                {k.label}
              </div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 38, color: V.txHi, letterSpacing: "-.02em", lineHeight: 1 }}>
                {k.value}
                {k.cents && <span style={{ fontSize: 20, color: V.txMut, fontWeight: 600 }}>{k.cents}</span>}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 600, background: k.up ? V.okS : V.errS, color: k.up ? V.ok : V.err }}>
                  {k.delta}
                </span>
                <span style={{ fontSize: 11, color: V.txMut }}>{k.sub}</span>
              </div>
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
                <path d={k.spark} stroke={k.color} strokeWidth="1.5" fill="none" />
              </svg>
            </div>
          ))}
        </div>

        {/* ── Chart + Live orders ── */}
        <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 14, marginBottom: 14 }}>
          {/* Sales chart — real data from /api/reports/by-day?days=7 */}
          <div style={card}>
            {(() => {
              const total = salesByDay.reduce((s, d) => s + (d.revenue || 0), 0);
              const hasData = salesByDay.some(d => (d.revenue || 0) > 0);
              const max = Math.max(1, ...salesByDay.map(d => d.revenue || 0));
              const DOW = ["DOM","LUN","MAR","MIE","JUE","VIE","SÁB"];
              const n = salesByDay.length;
              const pts: [number, number][] = salesByDay.map((d, i) => {
                const x = 90 + (n > 1 ? i * (660 / (n - 1)) : 330);
                const y = 220 - ((d.revenue || 0) / max) * 170;
                return [x, y];
              });
              const linePath = pts.length
                ? `M ${pts.map(p => `${p[0]},${p[1]}`).join(" L ")}`
                : "";
              const fillPath = pts.length
                ? `${linePath} L ${pts[pts.length - 1]![0]},220 L ${pts[0]![0]},220 Z`
                : "";
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: V.txHi, letterSpacing: "-.01em" }}>Ventas por día</div>
                      <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>Últimos 7 días · {fmtMoney(total)} acumulado</div>
                    </div>
                  </div>
                  <div style={{ position: "relative", height: 260 }}>
                    {!hasData && (
                      <div style={{
                        position: "absolute", inset: 0, display: "grid", placeItems: "center",
                        color: V.txMut, fontSize: 13, textAlign: "center", zIndex: 1,
                      }}>
                        Aún no hay ventas en los últimos 7 días.
                      </div>
                    )}
                    <svg viewBox="0 0 800 260" preserveAspectRatio="none" style={{ width: "100%", height: "100%", opacity: hasData ? 1 : 0.25 }}>
                      <defs>
                        <linearGradient id="ch-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#9472ff" stopOpacity=".35" />
                          <stop offset="100%" stopColor="#9472ff" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <g stroke="rgba(255,255,255,.06)" strokeWidth="1">
                        <line x1="40" y1="50"  x2="780" y2="50"  />
                        <line x1="40" y1="135" x2="780" y2="135" />
                        <line x1="40" y1="220" x2="780" y2="220" />
                      </g>
                      <g fontFamily="DM Mono" fontSize="10" fill="#9494b8">
                        <text x="32" y="54"  textAnchor="end">{fmtMoney(max)}</text>
                        <text x="32" y="139" textAnchor="end">{fmtMoney(Math.round(max / 2))}</text>
                        <text x="32" y="224" textAnchor="end">$0</text>
                      </g>
                      <g fontFamily="DM Mono" fontSize="10" fill="#9494b8">
                        {salesByDay.map((d, i) => {
                          const x = 90 + (n > 1 ? i * (660 / (n - 1)) : 330);
                          const dow = DOW[new Date(d.date + "T00:00:00").getDay()] ?? "";
                          return <text key={d.date} x={x} y="244" textAnchor="middle">{dow}</text>;
                        })}
                      </g>
                      {hasData && fillPath && <path d={fillPath} fill="url(#ch-grad)" />}
                      {hasData && linePath && <path d={linePath} stroke="#9472ff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
                      {hasData && pts.map(([x, y], i) => (
                        <circle key={i} cx={x} cy={y} r="4" fill="#9472ff" />
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
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: V.txHi }}>En vivo</div>
                <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>
                  {loading ? "Cargando…" : `${active.length} ${active.length === 1 ? "pedido activo" : "pedidos activos"}`}
                </div>
              </div>
              <span style={{ padding: "3px 8px", borderRadius: 999, fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", display: "inline-flex", alignItems: "center", gap: 5, background: active.length ? V.okS : V.surf2, color: active.length ? V.ok : V.txMut }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                {active.length ? "OPERANDO" : "SIN ACTIVIDAD"}
              </span>
            </div>
            <div className="db-scroll" style={{ maxHeight: 310, overflowY: "auto" }}>
              {!loading && displayOrders.length === 0 && (
                <div style={{ padding: "32px 0", textAlign: "center", color: V.txMut, fontSize: 12 }}>
                  Los pedidos que se creen en la TPV aparecerán aquí en tiempo real.
                </div>
              )}
              {displayOrders.map((o, i) => (
                <div key={o.id} style={{ display: "grid", gridTemplateColumns: "52px 1fr auto auto", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: i < displayOrders.length - 1 ? `1px solid ${V.bd1}` : "none" }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#b89eff", fontWeight: 600 }}>
                    #{o.orderNumber || o.id.slice(-4)}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, color: V.tx, fontWeight: 500 }}>
                      {o.customer?.name || (o.orderType === "MESA" ? `Mesa ${(o as any).tableNumber || "–"}` : o.orderType || "Cliente")}
                    </div>
                    <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>
                      {o.items?.slice(0, 2).map(it => `${it.quantity}× ${it.menuItem?.name}`).join(", ") || o.orderType}
                    </div>
                  </div>
                  <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: V.txHi }}>
                    {fmtMoney(o.total || 0)}
                  </span>
                  <StatusChip s={o.status} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Top items + Hourly + Staff ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
          {/* Top items */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: V.txHi }}>Top del día</div>
                <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>Más vendidos</div>
              </div>
              <button style={{ display: "inline-flex", alignItems: "center", padding: "8px 12px", borderRadius: 10, background: V.surf1, border: `1px solid ${V.bd1}`, color: V.txMid, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Ver todo →</button>
            </div>
            {topProducts.length === 0 && (
              <div style={{ padding: "24px 0", textAlign: "center", color: V.txMut, fontSize: 12 }}>
                Sin ventas registradas en este período.
              </div>
            )}
            {(() => {
              const maxQty = topProducts.reduce((m, it) => Math.max(m, it.quantity || 0), 0) || 1;
              return topProducts.map((it, i) => {
                const pct = Math.round(((it.quantity || 0) / maxQty) * 100);
                return (
                  <div key={`${it.name}-${i}`} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 12, alignItems: "center", padding: "10px 0", borderTop: i > 0 ? `1px solid ${V.bd1}` : "none" }}>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: V.txDim, textAlign: "center" }}>{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <div style={{ fontSize: 13, color: V.tx, fontWeight: 500 }}>{it.name}</div>
                      <div style={{ height: 3, background: V.surf2, borderRadius: 2, overflow: "hidden", marginTop: 4 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#7c3aed,#b89eff)", borderRadius: 2 }} />
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: V.txHi, fontWeight: 600 }}>{fmtMoney(it.total || 0)}</div>
                      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txMut }}>{it.quantity || 0} ×</div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Hourly distribution */}
          <div style={card}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: V.txHi }}>Distribución por hora</div>
              <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>Hoy · pedidos por hora</div>
            </div>
            <svg viewBox="0 0 400 200" style={{ width: "100%", height: 200, display: "block" }} preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="bar-g" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#6428d0" />
                  <stop offset="100%" stopColor="#b89eff" />
                </linearGradient>
              </defs>
              <g stroke="rgba(255,255,255,.06)" strokeWidth="1">
                <line x1="0" y1="40"  x2="400" y2="40"  />
                <line x1="0" y1="90"  x2="400" y2="90"  />
                <line x1="0" y1="140" x2="400" y2="140" />
              </g>
              {hourBuckets.map((d, i) => {
                const barH = Math.max(4, (d.v / maxHour) * 130);
                const isNow = now && d.h === now.getHours();
                return (
                  <g key={i}>
                    <rect
                      x={10 + i * 32} y={165 - barH} width={24} height={barH} rx="3"
                      fill={isNow ? "#9472ff" : "url(#bar-g)"}
                      stroke={isNow ? "#fff" : undefined}
                      strokeWidth={isNow ? 1.5 : 0}
                      opacity={isNow ? 1 : Math.max(0.3, d.v / maxHour * 0.7 + 0.3)}
                    />
                    <text x={22 + i * 32} y={182} fontFamily="DM Mono" fontSize="9" fill={isNow ? "#b89eff" : "#6e6e92"} textAnchor="middle" fontWeight={isNow ? "700" : "400"}>
                      {d.h}h
                    </text>
                  </g>
                );
              })}
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 12, borderTop: `1px solid ${V.bd1}` }}>
              {(() => {
                const hasData = hourBuckets.some(d => d.v > 0);
                if (!hasData) {
                  return (
                    <div style={{ color: V.txMut, fontSize: 12, fontFamily: "'DM Mono',monospace" }}>
                      Aún no hay pedidos hoy.
                    </div>
                  );
                }
                const sorted = [...hourBuckets].sort((a, b) => b.v - a.v);
                const peak = sorted[0];
                const slowest = [...hourBuckets].filter(d => d.v > 0).sort((a, b) => a.v - b.v)[0] || hourBuckets[0];
                const stats = [
                  { label: "PICO",         val: peak ? `${peak.h}:00` : "—" },
                  { label: "PEDIDOS PICO", val: peak ? String(peak.v) : "—" },
                  { label: "MÁS LENTO",    val: slowest ? `${slowest.h}:00` : "—" },
                ];
                return stats.map(s => (
                  <div key={s.label}>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txDim, letterSpacing: ".1em" }}>{s.label}</div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: V.txHi, marginTop: 2 }}>{s.val}</div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Staff */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: V.txHi }}>Turno actual</div>
                <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>
                  {activeStaff.length > 0
                    ? `${activeStaff.length} ${activeStaff.length === 1 ? "persona" : "personas"} · abierto ${new Date(activeStaff[0].startAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
                    : "Sin personal activo"}
                </div>
              </div>
              <span style={{ padding: "3px 8px", borderRadius: 999, fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", display: "inline-flex", alignItems: "center", gap: 5, background: activeStaff.length > 0 ? V.okS : V.surf2, color: activeStaff.length > 0 ? V.ok : V.txMut }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                {activeStaff.length > 0 ? "ACTIVO" : "SIN TURNO"}
              </span>
            </div>
            {activeStaff.length === 0 && (
              <div style={{ padding: "24px 0", textAlign: "center", color: V.txMut, fontSize: 12 }}>
                Abre un turno en la TPV para ver el personal activo aquí.
              </div>
            )}
            {activeStaff.map((s, i) => {
              const initials = s.name.split(" ").filter(Boolean).map(p => p[0]).slice(0, 2).join("").toUpperCase() || "??";
              const GRAD_BY_ROLE: Record<string, string> = {
                MANAGER:  "135deg,#7c3aed,#ec4899",
                GERENTE:  "135deg,#7c3aed,#ec4899",
                WAITER:   "135deg,#f59e0b,#dc2626",
                MESERA:   "135deg,#f59e0b,#dc2626",
                MESERO:   "135deg,#f59e0b,#dc2626",
                KITCHEN:  "135deg,#10b981,#047857",
                COCINA:   "135deg,#10b981,#047857",
                DELIVERY: "135deg,#3b82f6,#1e40af",
                REPARTO:  "135deg,#3b82f6,#1e40af",
                CASHIER:  "135deg,#a855f7,#6b21a8",
                CAJA:     "135deg,#a855f7,#6b21a8",
              };
              const grad = GRAD_BY_ROLE[s.role?.toUpperCase?.() || ""] || "135deg,#6b7280,#374151";
              const mins = Math.max(0, Math.floor((Date.now() - new Date(s.startAt).getTime()) / 60000));
              const dur = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
              const tables = s.tables?.length ? ` · ${s.tables.join(", ")}` : "";
              return (
                <div key={s.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: i > 0 ? `1px solid ${V.bd1}` : "none" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(${grad})`, color: "#fff", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, display: "grid", placeItems: "center" }}>
                    {initials}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: V.tx, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: V.txMut, fontFamily: "'DM Mono',monospace" }}>{(s.role || "").toUpperCase()} · {dur}{tables}</div>
                  </div>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: V.ok }}>●</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Channels + Inventory ── */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
          {/* Channels & payments */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: V.txHi }}>Canales &amp; pagos</div>
                <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>Cómo llegan y cómo pagan hoy</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 32, alignItems: "center" }}>
              <svg viewBox="0 0 120 120" style={{ width: 180, height: 180 }}>
                <circle cx="60" cy="60" r="48" fill="none" stroke="#15152a" strokeWidth="16" />
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
                  {ventas > 0 ? `$${Math.round(ventas / 1000)}k` : "$0"}
                </text>
              </svg>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 22px" }}>
                {donutSegs.slice(0, 4).map((seg, i) => (
                  <div key={seg.key}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color }} />
                      <span style={{ color: V.txMid, fontSize: 12 }}>{seg.key}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: V.txHi }}>{seg.pct}%</span>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: V.txMut }}>{fmtMoney(chanVals[i] || 0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${V.bd1}`, display: "flex", gap: 16 }}>
              {(() => {
                const pm: Record<string, { total: number; count: number }> = {};
                for (const o of delivered) {
                  const k = (o as any).paymentMethod || "OTRO";
                  pm[k] = pm[k] || { total: 0, count: 0 };
                  pm[k].total += o.total || 0;
                  pm[k].count += 1;
                }
                const group = (labels: string[]) => labels.reduce(
                  (acc, k) => ({ total: acc.total + (pm[k]?.total || 0), count: acc.count + (pm[k]?.count || 0) }),
                  { total: 0, count: 0 }
                );
                const card = group(["CARD", "CARD_PRESENT"]);
                const cash = group(["CASH", "CASH_ON_DELIVERY"]);
                const transfer = group(["TRANSFER", "SPEI", "OXXO"]);
                const totalSum = Math.max(1, ventas);
                const rows = [
                  { label: "TARJETA",   ...card },
                  { label: "EFECTIVO",  ...cash },
                  { label: "TRANSFER.", ...transfer },
                ];
                return rows.map(p => (
                  <div key={p.label} style={{ flex: 1, padding: 12, background: V.surf2, borderRadius: 10 }}>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txMut, letterSpacing: ".12em" }}>{p.label}</div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: V.txHi, marginTop: 4 }}>
                      {p.total > 0 ? fmtMoney(p.total) : "—"}
                    </div>
                    <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>
                      {p.count > 0 ? `${Math.round((p.total / totalSum) * 100)}% · ${p.count} trans.` : "sin ventas"}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Inventory alert */}
          <div style={{ background: `linear-gradient(135deg, ${V.errS}, transparent 60%), ${V.surf1}`, border: "1px solid rgba(239,68,68,.2)", borderRadius: 16, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "var(--red, #ef4444)" }}>⚠ Inventario bajo</div>
                <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>
                  {invAlerts.length > 0
                    ? `${invAlerts.length} ${invAlerts.length === 1 ? "ingrediente crítico" : "ingredientes críticos"}`
                    : "Stock en orden"}
                </div>
              </div>
              <button style={{ display: "inline-flex", alignItems: "center", padding: "8px 12px", borderRadius: 10, background: V.errS, border: "1px solid rgba(239,68,68,.3)", color: "var(--red, #ef4444)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Reponer</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {invAlerts.length === 0 && (
                <div style={{ padding: "24px 0", textAlign: "center", color: V.txMut, fontSize: 12 }}>
                  No hay ingredientes por debajo del mínimo.
                </div>
              )}
              {invAlerts.slice(0, 4).map((item) => {
                const pct = item.minStock > 0 ? Math.min(100, Math.round((item.stock / item.minStock) * 100)) : 0;
                const color = pct < 25 ? "var(--red, #ef4444)" : "var(--amber, #f59e0b)";
                return (
                  <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 60px auto", gap: 10, alignItems: "center", padding: "10px 12px", background: V.surf2, borderRadius: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: V.tx }}>{item.name}</div>
                      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txMut, letterSpacing: ".08em" }}>{pct}% DISPONIBLE</div>
                    </div>
                    <div style={{ height: 4, background: V.surf3, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color }} />
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color }}>{item.stock} {item.unit}</div>
                      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: V.txMut }}>MIN {item.minStock} {item.unit}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button style={{ width: "100%", marginTop: 14, padding: "9px 16px", borderRadius: 10, background: "var(--red, #ef4444)", color: "#fff", border: "none", fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans',sans-serif", cursor: "pointer", boxShadow: "0 4px 14px rgba(239,68,68,.3)" }}>
              Generar orden de compra →
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
