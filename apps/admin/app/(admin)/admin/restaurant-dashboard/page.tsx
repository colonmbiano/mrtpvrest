"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";

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

const TOP_ITEMS = [
  { rank: "01", name: "Tacos al pastor",     pct: "100%", val: "$2,880", cnt: "36 ×" },
  { rank: "02", name: "Horchata 500ml",       pct: "68%",  val: "$1,960", cnt: "49 ×" },
  { rank: "03", name: "Sopa de tortilla",     pct: "54%",  val: "$1,520", cnt: "16 ×" },
  { rank: "04", name: "Quesadilla champiñón", pct: "42%",  val: "$1,200", cnt: "16 ×" },
  { rank: "05", name: "Flan casero",          pct: "28%",  val: "$820",   cnt: "14 ×" },
];

const STAFF = [
  { init: "CR", grad: "135deg,#7c3aed,#ec4899", name: "Carlos Ruiz",   meta: "GERENTE · 6h 18m",           dot: "var(--green, #10b981)" },
  { init: "MG", grad: "135deg,#f59e0b,#dc2626", name: "María García",  meta: "MESERA · 4h 02m · M2, M6",   dot: "var(--green, #10b981)" },
  { init: "JT", grad: "135deg,#10b981,#047857", name: "José Torres",   meta: "COCINA · 6h 18m",            dot: "var(--green, #10b981)" },
  { init: "JL", grad: "135deg,#3b82f6,#1e40af", name: "Juan López",    meta: "REPARTO · 2h 40m · En ruta", dot: "#b89eff" },
  { init: "PS", grad: "135deg,#a855f7,#6b21a8", name: "Pedro Sánchez", meta: "CAJA · 6h 18m · $18,420",   dot: "var(--green, #10b981)" },
];

const INV_ALERTS = [
  { name: "Trompo pastor",    sku: "SKU-0184", pct: 12, val: "1.2 kg", min: "MIN 10kg", color: "var(--red, #ef4444)"  },
  { name: "Tortilla de maíz", sku: "SKU-0091", pct: 22, val: "220 pz", min: "MIN 1000", color: "var(--red, #ef4444)"  },
  { name: "Piña",             sku: "SKU-0203", pct: 35, val: "3.5 kg", min: "MIN 10kg", color: "var(--amber, #f59e0b)" },
  { name: "Queso panela",     sku: "SKU-0047", pct: 42, val: "2.1 kg", min: "MIN 5kg",  color: "var(--amber, #f59e0b)" },
];

const MOCK_ORDERS: Order[] = [
  { id: "5821", orderNumber: 5821, status: "READY" as Order["status"],      total: 260, createdAt: new Date().toISOString(), items: [{ quantity: 2, menuItem: { name: "Pastor" } }], orderType: "MESA", tableNumber: "2" },
  { id: "5822", orderNumber: 5822, status: "PREPARING" as Order["status"],  total: 420, createdAt: new Date().toISOString(), items: [{ quantity: 3, menuItem: { name: "items" } }],  orderType: "DELIVERY" },
  { id: "5823", orderNumber: 5823, status: "DELIVERING" as Order["status"], total: 340, createdAt: new Date().toISOString(), items: [],                                               orderType: "DELIVERY" },
  { id: "5824", orderNumber: 5824, status: "PENDING" as Order["status"],    total: 180, createdAt: new Date().toISOString(), items: [{ quantity: 1, menuItem: { name: "Quesadilla" } }], orderType: "MESA", tableNumber: "8" },
];

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

  useEffect(() => {
    fetchOrders(); fetchShift();
    const t = setInterval(fetchOrders, 15000);
    return () => clearInterval(t);
  }, [fetchOrders, fetchShift]);

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
  const effectiveChan: Record<string, number> = Object.keys(channelMap).length
    ? channelMap
    : { Mesa: 5240, Delivery: 3490, Pickup: 2250, Kiosko: 1500 };
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

  const displayOrders = active.length > 0 ? active : MOCK_ORDERS;

  const card: React.CSSProperties = {
    background: V.surf1,
    border: `1px solid ${V.bd1}`,
    borderRadius: 16,
    padding: 20,
  };

  const KPIS = [
    {
      label: "Ventas de hoy",
      value: ventas > 0 ? fmtMoney(ventas) : "$12,480", cents: ventas > 0 ? "" : ".50",
      delta: "↑ 18.2%", up: true, sub: "vs sábado anterior",
      spark: "M0,24 L25,22 L50,20 L75,14 L100,16 L125,11 L150,9 L175,12 L200,7 L225,5 L250,8 L275,4 L300,2",
      fill:  "M0,24 L25,22 L50,20 L75,14 L100,16 L125,11 L150,9 L175,12 L200,7 L225,5 L250,8 L275,4 L300,2 L300,30 L0,30 Z",
      color: "#9472ff",
    },
    {
      label: "Pedidos",
      value: today.length > 0 ? String(today.length) : "87", cents: "",
      delta: `↑ ${active.length} en vivo`, up: true, sub: "activos ahora",
      spark: "M0,20 L30,22 L60,15 L90,18 L120,12 L150,14 L180,9 L210,11 L240,6 L270,8 L300,4",
      fill: "", color: "var(--green, #10b981)",
    },
    {
      label: "Ticket promedio",
      value: ticket > 0 ? fmtMoney(ticket) : "$143", cents: ticket > 0 ? "" : ".45",
      delta: "↑ 2.1%", up: true, sub: "vs periodo ant.",
      spark: "M0,10 L30,8 L60,12 L90,9 L120,14 L150,11 L180,16 L210,13 L240,18 L270,15 L300,20",
      fill: "", color: "var(--amber, #f59e0b)",
    },
    {
      label: "Tiempo prep. prom.",
      value: active.length > 0 ? espStr : "6:42", cents: "",
      delta: "↑ 8s mejor", up: true, sub: "meta: < 7:00",
      spark: "M0,12 L30,14 L60,11 L90,13 L120,10 L150,15 L180,9 L210,11 L240,8 L270,10 L300,7",
      fill: "", color: "#b89eff",
    },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div style={{ color: V.tx, fontFamily: "'DM Sans',sans-serif", minHeight: "100vh" }}>

        {/* ── Topbar ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 20, marginBottom: 24, borderBottom: `1px solid ${V.bd1}` }}>
          <div>
            <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 32, color: V.txHi, letterSpacing: "-.02em", lineHeight: 1.1 }}>
              {greeting}, Carlos.
            </h1>
            <div style={{ fontSize: 13, color: V.txMut, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ textTransform: "capitalize" }}>{dateLabel}</span>
              <span>·</span>
              <span>Cantina del Valle · Polanco</span>
              {shift && <><span>·</span><span style={{ color: "var(--green, #10b981)" }}>● Turno activo</span></>}
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
          {/* Sales chart */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: V.txHi, letterSpacing: "-.01em" }}>Ventas por día</div>
                <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>Últimos 7 días · $72,840 acumulado</div>
              </div>
              <div style={{ display: "flex", gap: 18 }}>
                {[["#9472ff","Esta semana"],["#6e6e92","Semana ant."]].map(([c, l]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: V.txMid }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                    {l}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ position: "relative", height: 260 }}>
              <svg viewBox="0 0 800 260" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
                <defs>
                  <linearGradient id="ch-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9472ff" stopOpacity=".35" />
                    <stop offset="100%" stopColor="#9472ff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g stroke="rgba(255,255,255,.06)" strokeWidth="1">
                  <line x1="40" y1="40"  x2="780" y2="40"  />
                  <line x1="40" y1="100" x2="780" y2="100" />
                  <line x1="40" y1="160" x2="780" y2="160" />
                  <line x1="40" y1="220" x2="780" y2="220" />
                </g>
                <g fontFamily="DM Mono" fontSize="10" fill="#9494b8">
                  <text x="32" y="44"  textAnchor="end">$15k</text>
                  <text x="32" y="104" textAnchor="end">$10k</text>
                  <text x="32" y="164" textAnchor="end">$5k</text>
                  <text x="32" y="224" textAnchor="end">$0</text>
                </g>
                <g fontFamily="DM Mono" fontSize="10" fill="#9494b8">
                  {["LUN","MAR","MIE","JUE","VIE","SÁB","DOM"].map((d, i) => (
                    <text key={d} x={90 + i * 110} y="244" textAnchor="middle">{d}</text>
                  ))}
                </g>
                <path d="M 90,168 L 200,158 L 310,148 L 420,132 L 530,108 L 640,88 L 750,128" stroke="#6e6e92" strokeWidth="1.5" fill="none" strokeDasharray="4 4" />
                {([[90,168],[200,158],[310,148],[420,132],[530,108],[640,88],[750,128]] as [number,number][]).map(([x,y], i) => (
                  <circle key={i} cx={x} cy={y} r="2.5" fill="#6e6e92" />
                ))}
                <path d="M 90,152 L 200,140 L 310,120 L 420,108 L 530,82 L 640,58 L 750,74 L 750,220 L 90,220 Z" fill="url(#ch-grad)" />
                <path d="M 90,152 L 200,140 L 310,120 L 420,108 L 530,82 L 640,58 L 750,74" stroke="#9472ff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                {([[90,152],[200,140],[310,120],[420,108],[530,82],[750,74]] as [number,number][]).map(([x,y], i) => (
                  <circle key={i} cx={x} cy={y} r="4" fill="#9472ff" />
                ))}
                <circle cx="640" cy="58" r="5" fill="#fff" stroke="#9472ff" strokeWidth="2.5" />
                <g transform="translate(580, 20)">
                  <rect width="130" height="44" rx="8" fill="#15152a" stroke="rgba(124,58,237,.3)" />
                  <text x="12" y="18" fontFamily="DM Mono" fontSize="10" fill="#9494b8" letterSpacing=".1em">SÁB · HOY</text>
                  <text x="12" y="36" fontFamily="Syne" fontSize="15" fontWeight="800" fill="#fff">
                    {ventas > 0 ? fmtMoney(ventas) : "$12,480"}
                  </text>
                </g>
              </svg>
            </div>
          </div>

          {/* Live orders */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: V.txHi }}>En vivo</div>
                <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>
                  {loading ? "Cargando…" : `${active.length || MOCK_ORDERS.length} pedidos activos`}
                </div>
              </div>
              <span style={{ padding: "3px 8px", borderRadius: 999, fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", display: "inline-flex", alignItems: "center", gap: 5, background: V.okS, color: V.ok }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                OPERANDO
              </span>
            </div>
            <div className="db-scroll" style={{ maxHeight: 310, overflowY: "auto" }}>
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
            {TOP_ITEMS.map((it, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 12, alignItems: "center", padding: "10px 0", borderTop: i > 0 ? `1px solid ${V.bd1}` : "none" }}>
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: V.txDim, textAlign: "center" }}>{it.rank}</span>
                <div>
                  <div style={{ fontSize: 13, color: V.tx, fontWeight: 500 }}>{it.name}</div>
                  <div style={{ height: 3, background: V.surf2, borderRadius: 2, overflow: "hidden", marginTop: 4 }}>
                    <div style={{ height: "100%", width: it.pct, background: "linear-gradient(90deg,#7c3aed,#b89eff)", borderRadius: 2 }} />
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: V.txHi, fontWeight: 600 }}>{it.val}</div>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txMut }}>{it.cnt}</div>
                </div>
              </div>
            ))}
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
              {[
                { label: "PICO",         val: "19:00" },
                { label: "PEDIDOS PICO", val: "18" },
                { label: "MÁS LENTO",    val: "16:00" },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txDim, letterSpacing: ".1em" }}>{s.label}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: V.txHi, marginTop: 2 }}>{s.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Staff */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: V.txHi }}>Turno actual</div>
                <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>5 personas · abierto 11:00</div>
              </div>
              <span style={{ padding: "3px 8px", borderRadius: 999, fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", display: "inline-flex", alignItems: "center", gap: 5, background: V.okS, color: V.ok }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                ACTIVO
              </span>
            </div>
            {STAFF.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: i > 0 ? `1px solid ${V.bd1}` : "none" }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(${s.grad})`, color: "#fff", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, display: "grid", placeItems: "center" }}>
                  {s.init}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: V.tx, fontWeight: 500 }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: V.txMut, fontFamily: "'DM Mono',monospace" }}>{s.meta}</div>
                </div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: s.dot }}>●</div>
              </div>
            ))}
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
                  {ventas > 0 ? `$${Math.round(ventas / 1000)}k` : "$12.4k"}
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
              {[
                { label: "TARJETA",   val: "$8,120", sub: "65% · 58 trans." },
                { label: "EFECTIVO",  val: "$3,240", sub: "26% · 22 trans." },
                { label: "TRANSFER.", val: "$1,120", sub: "9% · 7 trans." },
              ].map(p => (
                <div key={p.label} style={{ flex: 1, padding: 12, background: V.surf2, borderRadius: 10 }}>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txMut, letterSpacing: ".12em" }}>{p.label}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: V.txHi, marginTop: 4 }}>{p.val}</div>
                  <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>{p.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Inventory alert */}
          <div style={{ background: `linear-gradient(135deg, ${V.errS}, transparent 60%), ${V.surf1}`, border: "1px solid rgba(239,68,68,.2)", borderRadius: 16, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "var(--red, #ef4444)" }}>⚠ Inventario bajo</div>
                <div style={{ fontSize: 11, color: V.txMut, marginTop: 2 }}>4 ingredientes críticos</div>
              </div>
              <button style={{ display: "inline-flex", alignItems: "center", padding: "8px 12px", borderRadius: 10, background: V.errS, border: "1px solid rgba(239,68,68,.3)", color: "var(--red, #ef4444)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Reponer</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {INV_ALERTS.map((item, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px auto", gap: 10, alignItems: "center", padding: "10px 12px", background: V.surf2, borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: V.tx }}>{item.name}</div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txMut, letterSpacing: ".08em" }}>{item.sku}</div>
                  </div>
                  <div style={{ height: 4, background: V.surf3, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${item.pct}%`, background: item.color }} />
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: item.color }}>{item.val}</div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: V.txMut }}>{item.min}</div>
                  </div>
                </div>
              ))}
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
