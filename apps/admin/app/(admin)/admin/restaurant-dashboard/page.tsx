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
};
type Tab = "ops" | "drivers";

function minutesSince(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 60000);
}
function timerColor(m: number) {
  if (m < 8)  return "#22c55e";
  if (m < 15) return "#f59e0b";
  return "#ef4444";
}
function fmtMoney(n: number) {
  return "$" + n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
}
function buildHourData(orders: Order[]) {
  const todayStr = new Date().toDateString();
  const map: Record<number, number> = {};
  orders
    .filter(o => new Date(o.createdAt).toDateString() === todayStr)
    .forEach(o => {
      const h = new Date(o.createdAt).getHours();
      map[h] = (map[h] || 0) + o.total;
    });
  return [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22].map(h => ({
    label: `${h}h`, value: map[h] || 0,
  }));
}

const KANBAN_COLS = [
  { key: "PENDING",    label: "Nuevos",     color: "#f59e0b" },
  { key: "PREPARING",  label: "Preparando", color: "#8b5cf6" },
  { key: "READY",      label: "Listos",     color: "#22c55e" },
  { key: "DELIVERING", label: "En camino",  color: "#f97316" },
];
const CHAN_COLORS: Record<string,string> = {
  TPV: "#f97316", WEB: "#3b82f6", RAPPI: "#ef4444",
  UBER: "#8b5cf6", DELIVERY: "#f97316",
};
const QUICK_ACTIONS = [
  { label: "Ver todos los pedidos", icon: "📋", href: "/admin/pedidos" },
  { label: "Editar menú",          icon: "🍔", href: "/admin/menu" },
  { label: "Empleados",            icon: "👥", href: "/admin/empleados" },
  { label: "Reportes del día",     icon: "📊", href: "/admin/reportes" },
];

export default function RestaurantDashboard() {
  const [tab, setTab]     = useState<Tab>("ops");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow]     = useState<Date | null>(null);
  const [shift, setShift] = useState<any>(null);
  const [stats, setStats] = useState({ ventas: 0, pedidos: 0, ticket: 0, espera: 0 });

  const prevIds   = useRef<Set<string>>(new Set());
  const audioCtx  = useRef<AudioContext | null>(null);
  const hourRef   = useRef<HTMLCanvasElement>(null);
  const donutRef  = useRef<HTMLCanvasElement>(null);
  const hourInst  = useRef<any>(null);
  const donutInst = useRef<any>(null);

  // GPS
  const [liveData, setLiveData]         = useState<any>(null);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [mapReady, setMapReady]         = useState(false);
  const mapRef      = useRef<any>(null);
  const leafletRef  = useRef<any>(null);
  const markersRef  = useRef<any[]>([]);
  const originMark  = useRef<any>(null);

  // Clock
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  function playBeep() {
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
      const hoy = arr.filter(o => new Date(o.createdAt).toDateString() === new Date().toDateString());
      const delivered = hoy.filter(o => o.status === "DELIVERED");
      const ventas = delivered.reduce((s, o) => s + o.total, 0);
      const ticket = delivered.length ? Math.round(ventas / delivered.length) : 0;
      const active = arr.filter(o => !["DELIVERED","CANCELLED"].includes(o.status));
      const espera = active.length ? Math.round(active.reduce((s, o) => s + minutesSince(o.createdAt), 0) / active.length) : 0;
      setStats({ ventas, pedidos: hoy.length, ticket, espera });
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

  // Charts
  useEffect(() => {
    if (tab !== "ops") return;
    import("chart.js/auto").then(m => {
      const Chart = m.default;
      // Hour chart
      if (hourRef.current) {
        hourInst.current?.destroy();
        const hd = buildHourData(orders);
        hourInst.current = new Chart(hourRef.current, {
          type: "bar",
          data: {
            labels: hd.map(x => x.label),
            datasets: [{
              data: hd.map(x => x.value),
              backgroundColor: "#ff5c35",
              borderRadius: 4,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, ticks: { color: "#5a5a6e", font: { size: 9 } }, border: { color: "transparent" } },
              y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#5a5a6e", font: { size: 9 }, callback: (v: any) => v >= 1000 ? "$" + Math.round(v/1000) + "k" : "$" + v }, border: { color: "transparent" } },
            },
          },
        });
      }
      // Donut chart
      if (donutRef.current) {
        donutInst.current?.destroy();
        const channels = orders.reduce((acc: Record<string,number>, o) => {
          const ch = o.orderType || "TPV";
          acc[ch] = (acc[ch] || 0) + 1;
          return acc;
        }, {});
        const keys = Object.keys(channels);
        donutInst.current = new Chart(donutRef.current, {
          type: "doughnut",
          data: {
            labels: keys.length ? keys : ["Sin datos"],
            datasets: [{
              data: keys.length ? keys.map(k => channels[k]) : [1],
              backgroundColor: keys.length ? keys.map(k => CHAN_COLORS[k] || "#64748b") : ["#242430"],
              borderWidth: 0,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            cutout: "70%",
            plugins: { legend: { display: false } },
          },
        });
      }
    });
    return () => { hourInst.current?.destroy(); donutInst.current?.destroy(); };
  }, [tab, orders]);

  // GPS fetch
  const fetchLive = useCallback(async () => {
    try { const { data } = await api.get("/api/gps/live"); setLiveData(data); } catch {}
  }, []);

  useEffect(() => {
    if (tab !== "drivers") return;
    fetchLive();
    const t = setInterval(fetchLive, 30000);
    return () => clearInterval(t);
  }, [tab, fetchLive]);

  // Leaflet init
  useEffect(() => {
    if (tab !== "drivers" || mapRef.current) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(link);
    import("leaflet").then(L_mod => {
      const L = L_mod.default;
      leafletRef.current = L;
      const el = document.getElementById("gps-map");
      if (!el || mapRef.current) return;
      const map = L.map("gps-map").setView([19.2826, -99.6557], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OSM" }).addTo(map);
      mapRef.current = map;
      setMapReady(true);
    });
    return () => { mapRef.current?.remove(); mapRef.current = null; setMapReady(false); };
  }, [tab]);

  // Update markers
  useEffect(() => {
    if (!mapReady || !liveData || !mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (originMark.current) { originMark.current.remove(); originMark.current = null; }
    if (liveData.origin) {
      const icon = L.divIcon({ html:`<div style="background:#ff5c35;border:3px solid white;border-radius:8px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:14px">🏠</div>`, className:"", iconSize:[30,30], iconAnchor:[15,15] });
      originMark.current = L.marker([liveData.origin.lat, liveData.origin.lng], { icon }).addTo(mapRef.current).bindPopup("<b>Restaurante</b>");
    }
    liveData.drivers?.forEach((d: any) => {
      if (!d.location) return;
      const c = d.online ? "#22c55e" : "#6b7280";
      const icon = L.divIcon({ html:`<div style="background:${c};border:3px solid white;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:16px">🛵</div>`, className:"", iconSize:[34,34], iconAnchor:[17,17] });
      const age = Math.round((Date.now() - new Date(d.location.createdAt).getTime()) / 60000);
      const mk = L.marker([d.location.lat, d.location.lng], { icon }).addTo(mapRef.current).bindPopup(`<b>${d.driver.name}</b><br/>${d.online ? "🟢 En línea" : "⚫ Sin señal"}<br/>Hace ${age}m`);
      markersRef.current.push(mk);
    });
  }, [liveData, mapReady]);

  const activeOrders = orders.filter(o => !["DELIVERED","CANCELLED"].includes(o.status));

  async function advanceOrder(orderId: string, status: string) {
    const next: Record<string,string> = { PENDING:"PREPARING", PREPARING:"READY", READY:"DELIVERING", DELIVERING:"DELIVERED" };
    if (!next[status]) return;
    try { await api.put(`/api/orders/${orderId}/status`, { status: next[status] }); fetchOrders(); }
    catch { alert("Error al actualizar"); }
  }

  const channelMap = orders.reduce((acc: Record<string,number>, o) => {
    const ch = o.orderType || "TPV";
    acc[ch] = (acc[ch] || 0) + 1;
    return acc;
  }, {});
  const totalCh = Object.values(channelMap).reduce((a, b) => a + b, 0) || 1;
  const onlineDrivers = liveData?.drivers?.filter((d: any) => d.online).length || 0;

  const KPIS = [
    { label: "Ventas hoy",     value: fmtMoney(stats.ventas),                             color: "#22c55e",  border: "#22c55e" },
    { label: "Pedidos hoy",    value: String(stats.pedidos),                               color: "#3b82f6",  border: "#3b82f6" },
    { label: "Ticket prom.",   value: stats.ticket > 0 ? fmtMoney(stats.ticket) : "—",    color: "#ff5c35",  border: "#ff5c35" },
    { label: "T. espera prom.",value: stats.espera > 0 ? `${stats.espera}m` : "—",        color: stats.espera > 15 ? "#ef4444" : "#f59e0b", border: "#f59e0b" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "DM Sans, sans-serif" }}>

      {/* TOP BAR */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "Syne, sans-serif", letterSpacing: -0.5 }}>Dashboard</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
            <span>{now?.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}</span>
            <span>·</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: shift ? "#22c55e" : "var(--muted)", display: "inline-block" }} />
              {shift ? "Turno activo" : "Sin turno"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--muted)" }}>
            {now?.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} className="animate-pulse" />
          <button
            onClick={fetchOrders}
            style={{ padding: "7px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surf2)", color: "var(--muted)", fontSize: 12, cursor: "pointer", fontWeight: 700 }}
          >
            ↻ Actualizar
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {([["ops", "📋 Operaciones"], ["drivers", "🛵 Repartidores"]] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "8px 18px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
              borderRadius: 10, transition: "all .15s",
              background: tab === key ? "#ff5c35" : "var(--surf)",
              color: tab === key ? "#fff" : "var(--muted)",
            }}
          >
            {label}
            {key === "drivers" && onlineDrivers > 0 && (
              <span style={{ marginLeft: 6, background: "#22c55e", color: "#fff", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>
                {onlineDrivers}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB OPERACIONES */}
      {tab === "ops" && (
        <>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
            {KPIS.map(k => (
              <div key={k.label} style={{
                background: "var(--surf)",
                border: "1px solid var(--border)",
                borderTop: `2px solid ${k.border}`,
                borderRadius: 14, padding: "18px 16px",
              }}>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 8 }}>
                  {k.label}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: k.color, fontFamily: "Syne, sans-serif" }}>
                  {k.value}
                </div>
              </div>
            ))}
          </div>

          {/* KANBAN */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
            {KANBAN_COLS.map(col => {
              const colOrders = activeOrders.filter(o => o.status === col.key);
              return (
                <div key={col.key} style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px",
                    background: `${col.color}10`,
                    borderBottom: `1px solid ${col.color}20`,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: col.color, textTransform: "uppercase", letterSpacing: 1 }}>{col.label}</span>
                    <span style={{ fontSize: 11, background: col.color, color: "#fff", borderRadius: 20, padding: "1px 8px", fontWeight: 800 }}>{colOrders.length}</span>
                  </div>
                  <div style={{ padding: "10px 10px", display: "flex", flexDirection: "column", gap: 8, minHeight: 80 }}>
                    {loading && <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", padding: 8 }}>Cargando…</div>}
                    {!loading && colOrders.length === 0 && (
                      <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", padding: "16px 0" }}>Vacío</div>
                    )}
                    {colOrders.map(order => {
                      const mins = minutesSince(order.createdAt);
                      return (
                        <div key={order.id} style={{
                          background: "var(--surf2)", border: "1px solid var(--border)",
                          borderRadius: 10, padding: "10px 12px",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                              #{order.orderNumber || order.id.slice(-4)}
                            </span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, color: timerColor(mins),
                              background: timerColor(mins) + "18", padding: "2px 8px", borderRadius: 20,
                            }}>
                              {mins}m
                            </span>
                          </div>
                          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8, lineHeight: 1.6 }}>
                            {order.items.slice(0, 2).map((item, i) => (
                              <div key={i}>{item.quantity}× {item.menuItem?.name}</div>
                            ))}
                            {order.items.length > 2 && <div>+{order.items.length - 2} más</div>}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: "#ff5c35", fontFamily: "Syne, sans-serif" }}>
                              {fmtMoney(order.total)}
                            </span>
                            {col.key !== "DELIVERING" && (
                              <button
                                onClick={() => advanceOrder(order.id, order.status)}
                                style={{
                                  fontSize: 10, padding: "4px 10px", borderRadius: 7, border: "none",
                                  background: col.color, color: "#fff", cursor: "pointer", fontWeight: 700,
                                }}
                              >
                                Avanzar →
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* BOTTOM ROW */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {/* Ventas por hora */}
            <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>
                Ventas por hora
              </div>
              <div style={{ height: 110 }}><canvas ref={hourRef} /></div>
            </div>

            {/* Canales */}
            <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>
                Canales de venta
              </div>
              <div style={{ height: 90 }}><canvas ref={donutRef} /></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {Object.entries(channelMap).length > 0
                  ? Object.entries(channelMap).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--muted)" }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: CHAN_COLORS[k] || "#64748b" }} />
                      <span>{k}</span>
                      <span style={{ fontWeight: 800, color: "var(--text)" }}>{Math.round(v / totalCh * 100)}%</span>
                    </div>
                  ))
                  : <div style={{ fontSize: 10, color: "var(--muted)" }}>Sin datos aún</div>
                }
              </div>
            </div>

            {/* Acciones rápidas */}
            <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>
                Acciones rápidas
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {QUICK_ACTIONS.map(item => (
                  <a key={item.href} href={item.href} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", borderRadius: 10,
                    border: "1px solid var(--border)", background: "var(--surf2)",
                    color: "var(--text)", textDecoration: "none",
                    fontSize: 12, fontWeight: 600, transition: "border-color .15s",
                  }}>
                    <span style={{ fontSize: 15 }}>{item.icon}</span>
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* TAB REPARTIDORES */}
      {tab === "drivers" && (
        <div style={{ display: "flex", gap: 12, height: "calc(100vh - 220px)", minHeight: 480 }}>
          {/* Lista */}
          <div style={{
            width: 260, flexShrink: 0,
            background: "var(--surf)", border: "1px solid var(--border)",
            borderRadius: 14, overflow: "auto", padding: 12,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--muted)", marginBottom: 12 }}>
              {onlineDrivers} en línea
            </div>
            <button
              onClick={fetchLive}
              style={{ width: "100%", marginBottom: 10, padding: "8px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surf2)", color: "var(--muted)", fontSize: 11, cursor: "pointer", fontWeight: 700 }}
            >
              🔄 Actualizar
            </button>
            {!liveData?.drivers?.length ? (
              <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", padding: "28px 0" }}>
                Sin repartidores activos
              </div>
            ) : liveData.drivers.map((d: any) => (
              <button
                key={d.driver.id}
                onClick={() => { setSelectedDriver(d); if (d.location && mapRef.current) mapRef.current.setView([d.location.lat, d.location.lng], 15); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 10, marginBottom: 6,
                  cursor: "pointer", textAlign: "left",
                  border: `1px solid ${selectedDriver?.driver?.id === d.driver.id ? "#ff5c35" : "var(--border)"}`,
                  background: selectedDriver?.driver?.id === d.driver.id ? "rgba(255,92,53,0.08)" : "var(--surf2)",
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: d.online ? "rgba(34,197,94,0.15)" : "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                  🛵
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{d.driver.name}</div>
                  <div style={{ fontSize: 10, color: d.online ? "#22c55e" : "var(--muted)", marginTop: 2 }}>
                    {d.online ? "● En línea" : "○ Sin señal"}
                    {d.activeRoute ? " · ruta activa" : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Mapa */}
          <div style={{ flex: 1, background: "var(--surf)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", position: "relative" }}>
            <div id="gps-map" style={{ width: "100%", height: "100%" }} />
            {!mapReady && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surf)", borderRadius: 14 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🗺️</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Cargando mapa…</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}