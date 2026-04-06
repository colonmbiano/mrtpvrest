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

function minutesSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}
function timerColor(mins: number) {
  if (mins < 8) return "#16a34a";
  if (mins < 15) return "#b45309";
  return "#dc2626";
}
function fmtMoney(n: number) {
  return "$" + n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
}
function buildHourData(orders: Order[]) {
  const todayStr = new Date().toDateString();
  const hoyMap: Record<number, number> = {};
  orders
    .filter(o => new Date(o.createdAt).toDateString() === todayStr)
    .forEach(o => {
      const h = new Date(o.createdAt).getHours();
      hoyMap[h] = (hoyMap[h] || 0) + o.total;
    });
  const hours = [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];
  return hours.map(h => ({ label: `${h}h`, value: hoyMap[h] || 0 }));
}

export default function RestaurantDashboard() {
  const [tab, setTab] = useState<Tab>("ops");

  // ── Ops state ──────────────────────────────────────────────
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date | null>(null);
  const [shift, setShift] = useState<any>(null);
  const [statsHoy, setStatsHoy] = useState({ ventas: 0, pedidos: 0, ticket: 0, espera: 0 });
  const prevOrderIds = useRef<Set<string>>(new Set());
  const audioCtx = useRef<AudioContext | null>(null);

  // ── Chart refs ─────────────────────────────────────────────
  const hourChartRef = useRef<HTMLCanvasElement>(null);
  const channelChartRef = useRef<HTMLCanvasElement>(null);
  const hourChartInst = useRef<any>(null);
  const channelChartInst = useRef<any>(null);

  // ── GPS/Map state ──────────────────────────────────────────
  const [liveData, setLiveData] = useState<any>(null);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef      = useRef<any>(null);
  const leafletRef  = useRef<any>(null);
  const markersRef  = useRef<any[]>([]);
  const originMarkRef = useRef<any>(null);

  // ── Clock ──────────────────────────────────────────────────
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

  // ── Fetch orders ───────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/api/orders/admin");
      const arr: Order[] = Array.isArray(data) ? data : [];
      setOrders(arr);

      const newIds = new Set<string>(arr.map(o => o.id));
      const hayNuevos = arr.some(o => o.status === "PENDING" && !prevOrderIds.current.has(o.id));
      if (hayNuevos && prevOrderIds.current.size > 0) playBeep();
      prevOrderIds.current = newIds;

      const hoy = arr.filter(o => new Date(o.createdAt).toDateString() === new Date().toDateString());
      const delivered = hoy.filter(o => o.status === "DELIVERED");
      const totalVentas = delivered.reduce((s, o) => s + o.total, 0);
      const ticket = delivered.length > 0 ? Math.round(totalVentas / delivered.length) : 0;
      const active = arr.filter(o => !["DELIVERED","CANCELLED"].includes(o.status));
      const avgEspera = active.length > 0
        ? Math.round(active.reduce((s, o) => s + minutesSince(o.createdAt), 0) / active.length)
        : 0;
      setStatsHoy({ ventas: totalVentas, pedidos: hoy.length, ticket, espera: avgEspera });
    } catch {}
    setLoading(false);
  }, []);

  const fetchShift = useCallback(async () => {
    try {
      const { data } = await api.get("/api/shifts/current");
      setShift(data?.id ? data : null);
    } catch { setShift(null); }
  }, []);

  useEffect(() => {
    fetchOrders(); fetchShift();
    const t = setInterval(fetchOrders, 15000);
    return () => clearInterval(t);
  }, [fetchOrders, fetchShift]);

  // ── Charts ─────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== "ops") return;
    import("chart.js/auto").then(m => {
      const Chart = m.default;

      if (hourChartRef.current) {
        hourChartInst.current?.destroy();
        const hd = buildHourData(orders);
        hourChartInst.current = new Chart(hourChartRef.current, {
          type: "bar",
          data: {
            labels: hd.map(x => x.label),
            datasets: [{ label:"Hoy", data: hd.map(x => x.value), backgroundColor:"#1a1916", borderRadius:3 }],
          },
          options: {
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{display:false} },
            scales:{
              x:{ grid:{display:false}, ticks:{color:"#9e9d95",font:{size:10}}, border:{color:"transparent"} },
              y:{ grid:{color:"rgba(0,0,0,.05)"}, ticks:{color:"#9e9d95",font:{size:10},callback:(v:any)=>v>=1000?"$"+Math.round(v/1000)+"k":"$"+v}, border:{color:"transparent"} },
            },
          },
        });
      }

      if (channelChartRef.current) {
        channelChartInst.current?.destroy();
        const channels = orders.reduce((acc: Record<string,number>, o) => {
          const ch = o.orderType || "TPV";
          acc[ch] = (acc[ch] || 0) + 1;
          return acc;
        }, {});
        const keys = Object.keys(channels);
        const COLORS: Record<string,string> = { TPV:"#f97316", WEB:"#3b82f6", RAPPI:"#ef4444", UBER:"#8b5cf6", DELIVERY:"#8b5cf6" };
        channelChartInst.current = new Chart(channelChartRef.current, {
          type: "doughnut",
          data: {
            labels: keys.length ? keys : ["Sin datos"],
            datasets:[{ data: keys.length ? keys.map(k => channels[k]) : [1],
              backgroundColor: keys.length ? keys.map(k => COLORS[k]||"#64748b") : ["#e2e1d9"],
              borderWidth:0 }],
          },
          options: { responsive:true, maintainAspectRatio:false, cutout:"68%", plugins:{legend:{display:false}} },
        });
      }
    });
    return () => { hourChartInst.current?.destroy(); channelChartInst.current?.destroy(); };
  }, [tab, orders]);

  // ── GPS live ───────────────────────────────────────────────
  const fetchLive = useCallback(async () => {
    try {
      const { data } = await api.get("/api/gps/live");
      setLiveData(data);
    } catch {}
  }, []);

  useEffect(() => {
    if (tab !== "drivers") return;
    fetchLive();
    const t = setInterval(fetchLive, 30000);
    return () => clearInterval(t);
  }, [tab, fetchLive]);

  // ── Init Leaflet (lazy, solo cuando entra al tab) ──────────
  useEffect(() => {
    if (tab !== "drivers" || mapRef.current) return;
    if (typeof window === "undefined") return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(link);

    import("leaflet").then(L_module => {
      const L = L_module.default;
      leafletRef.current = L;
      const el = document.getElementById("gps-map");
      if (!el || mapRef.current) return;
      const map = L.map("gps-map").setView([19.2826, -99.6557], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
      }).addTo(map);
      mapRef.current = map;
      setMapReady(true);
    });
    return () => { mapRef.current?.remove(); mapRef.current = null; setMapReady(false); };
  }, [tab]);

  // ── Actualizar marcadores ──────────────────────────────────
  useEffect(() => {
    if (!mapReady || !liveData || !mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (originMarkRef.current) { originMarkRef.current.remove(); originMarkRef.current = null; }

    if (liveData.origin) {
      const icon = L.divIcon({
        html:`<div style="background:#f5a623;border:3px solid #000;border-radius:8px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.5)">🏠</div>`,
        className:"", iconSize:[28,28], iconAnchor:[14,14]
      });
      originMarkRef.current = L.marker([liveData.origin.lat, liveData.origin.lng], { icon })
        .addTo(mapRef.current).bindPopup("<b>🏠 Restaurante</b>");
    }

    liveData.drivers?.forEach((d: any) => {
      if (!d.location) return;
      const color = d.online ? "#22c55e" : "#6b7280";
      const icon = L.divIcon({
        html:`<div style="background:${color};border:3px solid white;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,.4)">🛵</div>`,
        className:"", iconSize:[34,34], iconAnchor:[17,17]
      });
      const age = Math.round((Date.now() - new Date(d.location.createdAt).getTime()) / 60000);
      const mk = L.marker([d.location.lat, d.location.lng], { icon })
        .addTo(mapRef.current)
        .bindPopup(`<b>${d.driver.name}</b><br/>${d.online?"🟢 En línea":"⚫ Sin señal"}<br/>Hace ${age}m${d.activeRoute?"<br/>📍 Ruta activa":""}`);
      markersRef.current.push(mk);
    });
  }, [liveData, mapReady]);

  // ── Kanban ─────────────────────────────────────────────────
  const activeOrders = orders.filter(o => !["DELIVERED","CANCELLED"].includes(o.status));
  const kanbanCols = [
    { key:"PENDING",    label:"Nuevos",     color:"#f59e0b" },
    { key:"PREPARING",  label:"Preparando", color:"#8b5cf6" },
    { key:"READY",      label:"Listos",     color:"#22c55e" },
    { key:"DELIVERING", label:"En camino",  color:"#f97316" },
  ];

  async function advanceOrder(orderId: string, currentStatus: string) {
    const next: Record<string,string> = { PENDING:"PREPARING", PREPARING:"READY", READY:"DELIVERING", DELIVERING:"DELIVERED" };
    if (!next[currentStatus]) return;
    try { await api.put(`/api/orders/${orderId}/status`, { status: next[currentStatus] }); fetchOrders(); }
    catch { alert("Error al actualizar"); }
  }

  const kpis = [
    { label:"Ventas hoy",      value: fmtMoney(statsHoy.ventas),                              delta: statsHoy.ventas > 0 ? "+en vivo" : "—",         up:true  },
    { label:"Pedidos hoy",     value: String(statsHoy.pedidos),                                delta: `${activeOrders.length} activos`,                up:true  },
    { label:"Ticket prom.",    value: statsHoy.ticket > 0 ? fmtMoney(statsHoy.ticket) : "—",  delta: "entregados",                                   up:true  },
    { label:"T. espera prom.", value: statsHoy.espera > 0 ? `${statsHoy.espera}m` : "—",      delta: "pedidos activos",                              up: statsHoy.espera < 15 },
  ];

  const channelMap = orders.reduce((acc: Record<string,number>, o) => {
    const ch = o.orderType || "TPV";
    acc[ch] = (acc[ch] || 0) + 1;
    return acc;
  }, {});
  const totalCh = Object.values(channelMap).reduce((a,b) => a+b, 0) || 1;
  const CHAN_COLORS: Record<string,string> = { TPV:"#f97316", WEB:"#3b82f6", RAPPI:"#ef4444", UBER:"#8b5cf6", DELIVERY:"#8b5cf6" };

  const onlineDrivers = liveData?.drivers?.filter((d: any) => d.online).length || 0;

  return (
    <div style={{ fontFamily:"Inter,sans-serif", fontSize:14, color:"#1a1916" }}>

      {/* ── TOP BAR ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>Dashboard</div>
          <div style={{ fontSize:11, color:"#9e9d95" }}>
            {now?.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"})}
            {shift ? " · 🟢 Turno activo" : " · ⚪ Sin turno"}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontFamily:"monospace", fontSize:12, color:"#6b6a63" }}>
            {now?.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
          </span>
          <span style={{ width:7, height:7, borderRadius:"50%", background:"#16a34a", display:"inline-block" }} />
          <button onClick={fetchOrders} style={{ padding:"5px 12px", borderRadius:6, border:"0.5px solid #e2e1d9", background:"#fff", fontSize:11, cursor:"pointer" }}>
            ↻ Actualizar
          </button>
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:"0.5px solid #e2e1d9" }}>
        {([["ops","📋 Operaciones"],["drivers","🛵 Repartidores"]] as [Tab,string][]).map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding:"8px 18px", border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
              background:"transparent",
              borderBottom: tab===key ? "2px solid #1a1916" : "2px solid transparent",
              color: tab===key ? "#1a1916" : "#9e9d95",
              marginBottom:-1,
            }}>
            {label}
            {key==="drivers" && onlineDrivers > 0 && (
              <span style={{ marginLeft:6, background:"#22c55e", color:"#fff", borderRadius:20, padding:"1px 6px", fontSize:10 }}>
                {onlineDrivers}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════ TAB 1: OPERACIONES ══════════════ */}
      {tab === "ops" && (
        <>
          {/* KPIs */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
            {kpis.map(k => (
              <div key={k.label} style={{ background:"#fff", border:"0.5px solid #e2e1d9", borderRadius:10, padding:"14px 16px" }}>
                <div style={{ fontSize:10, color:"#9e9d95", textTransform:"uppercase", letterSpacing:1 }}>{k.label}</div>
                <div style={{ fontSize:22, fontWeight:700, margin:"4px 0" }}>{k.value}</div>
                <div style={{ fontSize:11, color: k.up ? "#16a34a" : "#dc2626" }}>
                  {k.up ? "▲" : "▼"} {k.delta}
                </div>
              </div>
            ))}
          </div>

          {/* KANBAN */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
            {kanbanCols.map(col => {
              const colOrders = activeOrders.filter(o => o.status === col.key);
              return (
                <div key={col.key} style={{ background:"#fff", border:"0.5px solid #e2e1d9", borderRadius:10, padding:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                    <span style={{ fontSize:11, fontWeight:600, color:col.color, textTransform:"uppercase", letterSpacing:0.5 }}>{col.label}</span>
                    <span style={{ fontSize:11, background:"#f0efe9", borderRadius:20, padding:"1px 8px", color:"#6b6a63" }}>{colOrders.length}</span>
                  </div>
                  {loading && <div style={{ fontSize:11, color:"#9e9d95", padding:"8px 0" }}>Cargando…</div>}
                  {!loading && colOrders.length === 0 && (
                    <div style={{ fontSize:11, color:"#b0afa6", textAlign:"center", padding:"12px 0" }}>Vacío</div>
                  )}
                  {colOrders.map(order => {
                    const mins = minutesSince(order.createdAt);
                    return (
                      <div key={order.id} style={{ background:"#f7f6f3", border:"0.5px solid #e2e1d9", borderRadius:7, padding:"10px 11px", marginTop:8 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:500 }}>#{order.orderNumber || order.id.slice(-4)}</span>
                          <span style={{ fontSize:10, fontWeight:600, color:timerColor(mins), background:timerColor(mins)+"18", padding:"1px 7px", borderRadius:20 }}>{mins}m</span>
                        </div>
                        <div style={{ fontSize:10, color:"#6b6a63", margin:"5px 0 6px", lineHeight:1.5 }}>
                          {order.items.slice(0,2).map((item,i) => (
                            <div key={i}>{item.quantity}× {item.menuItem?.name}</div>
                          ))}
                          {order.items.length > 2 && <div style={{ color:"#9e9d95" }}>+{order.items.length-2} más</div>}
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span style={{ fontSize:12, fontWeight:600 }}>{fmtMoney(order.total)}</span>
                          {col.key !== "DELIVERING" && (
                            <button onClick={() => advanceOrder(order.id, order.status)}
                              style={{ fontSize:9, padding:"3px 8px", borderRadius:5, border:"none", background:"#1a1916", color:"#fff", cursor:"pointer" }}>
                              Avanzar →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* BOTTOM ROW */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            {/* Ventas por hora */}
            <div style={{ background:"#fff", border:"0.5px solid #e2e1d9", borderRadius:10, padding:"14px 16px" }}>
              <div style={{ fontSize:11, fontWeight:600, marginBottom:10 }}>Ventas por hora — Hoy</div>
              <div style={{ height:120 }}><canvas ref={hourChartRef} /></div>
            </div>

            {/* Canales */}
            <div style={{ background:"#fff", border:"0.5px solid #e2e1d9", borderRadius:10, padding:"14px 16px" }}>
              <div style={{ fontSize:11, fontWeight:600, marginBottom:10 }}>Canales de venta</div>
              <div style={{ height:100 }}><canvas ref={channelChartRef} /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:10 }}>
                {Object.entries(channelMap).length > 0
                  ? Object.entries(channelMap).map(([k,v]) => (
                    <div key={k} style={{ display:"flex", alignItems:"center", gap:6, fontSize:10, color:"#6b6a63" }}>
                      <div style={{ width:8, height:8, borderRadius:2, background:CHAN_COLORS[k]||"#64748b", flexShrink:0 }} />
                      {k} · <span style={{ fontWeight:600, color:"#1a1916" }}>{Math.round(v/totalCh*100)}%</span>
                    </div>
                  ))
                  : <div style={{ fontSize:10, color:"#9e9d95" }}>Sin datos aún</div>
                }
              </div>
            </div>

            {/* Acciones rápidas */}
            <div style={{ background:"#fff", border:"0.5px solid #e2e1d9", borderRadius:10, padding:"14px 16px" }}>
              <div style={{ fontSize:11, fontWeight:600, marginBottom:10 }}>Acciones rápidas</div>
              {[
                { label:"🖥️ Ir al TPV",             href:"/admin/tpv" },
                { label:"📋 Ver todos los pedidos", href:"/admin/pedidos" },
                { label:"🍔 Editar menú",           href:"/admin/menu" },
                { label:"💰 Ver turno actual",      href:"/admin/turnos" },
                { label:"📊 Reportes del día",      href:"/admin/reportes" },
              ].map(item => (
                <a key={item.href} href={item.href} style={{
                  display:"block", padding:"8px 10px", borderRadius:7, fontSize:12,
                  color:"#1a1916", textDecoration:"none", border:"0.5px solid #e2e1d9", marginBottom:6,
                }}>
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ══════════════ TAB 2: REPARTIDORES ══════════════ */}
      {tab === "drivers" && (
        <div style={{ display:"flex", gap:12, height:"calc(100vh - 200px)", minHeight:500 }}>
          {/* Panel izquierdo */}
          <div style={{ width:260, flexShrink:0, background:"#fff", border:"0.5px solid #e2e1d9", borderRadius:10, overflow:"auto", padding:12 }}>
            <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:1, color:"#9e9d95", marginBottom:10 }}>
              Repartidores · {onlineDrivers} en línea
            </div>
            <button onClick={fetchLive}
              style={{ width:"100%", marginBottom:10, padding:"6px", borderRadius:6, border:"0.5px solid #e2e1d9", background:"#f7f6f3", fontSize:11, cursor:"pointer" }}>
              🔄 Actualizar
            </button>
            {!liveData?.drivers?.length ? (
              <div style={{ fontSize:11, color:"#9e9d95", textAlign:"center", padding:"20px 0" }}>Sin repartidores</div>
            ) : liveData.drivers.map((d: any) => (
              <button key={d.driver.id}
                onClick={() => {
                  setSelectedDriver(d);
                  if (d.location && mapRef.current) mapRef.current.setView([d.location.lat, d.location.lng], 15);
                }}
                style={{
                  width:"100%", display:"flex", alignItems:"center", gap:8, padding:"9px 10px",
                  borderRadius:8, marginBottom:6, cursor:"pointer", textAlign:"left",
                  border:`0.5px solid ${selectedDriver?.driver?.id===d.driver.id ? "#1a1916" : "#e2e1d9"}`,
                  background: selectedDriver?.driver?.id===d.driver.id ? "#f0efe9" : "#f7f6f3",
                }}>
                <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0, background: d.online ? "#22c55e" : "#6b7280" }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600 }}>{d.driver.name}</div>
                  <div style={{ fontSize:10, color:"#9e9d95" }}>
                    {d.online ? "🟢 En línea" : "⚫ Sin señal"}
                    {d.activeRoute ? " · ruta activa" : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Mapa */}
          <div style={{ flex:1, background:"#fff", border:"0.5px solid #e2e1d9", borderRadius:10, overflow:"hidden", position:"relative" }}>
            <div id="gps-map" style={{ width:"100%", height:"100%" }} />
            {!mapReady && (
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"#f7f6f3", borderRadius:10 }}>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>🗺️</div>
                  <div style={{ fontSize:12, color:"#9e9d95" }}>Cargando mapa…</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
