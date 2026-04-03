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

export default function RestaurantDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date | null>(null);
  const [shift, setShift] = useState<any>(null);
  const [statsHoy, setStatsHoy] = useState({ ventas: 0, pedidos: 0, ticket: 0 });
  const hourChartRef = useRef<HTMLCanvasElement>(null);
  const channelChartRef = useRef<HTMLCanvasElement>(null);
  const hourChartInstance = useRef<any>(null);
  const channelChartInstance = useRef<any>(null);
  const prevOrderIds = useRef<Set<string>>(new Set());
  const audioCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  function playBeep() {
    if (!audioCtx.current) audioCtx.current = new AudioContext();
    const ctx = audioCtx.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/api/orders/admin");
      setOrders(Array.isArray(data) ? data : []);
      const newIds = new Set<string>(data.map((o: Order) => o.id));
      const hayNuevos = data.some((o: Order) =>
        o.status === "PENDING" && !prevOrderIds.current.has(o.id)
      );
      if (hayNuevos && prevOrderIds.current.size > 0) playBeep();
      prevOrderIds.current = newIds;
    } catch {}
    setLoading(false);
  }, []);

  const fetchShift = useCallback(async () => {
    try {
      const { data } = await api.get("/api/shifts/current");
      setShift(data?.id ? data : null);
    } catch {
      setShift(null);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get("/api/orders/admin");
      const hoy = data.filter((o: Order) => {
        const fecha = new Date(o.createdAt);
        const ahora = new Date();
        return fecha.toDateString() === ahora.toDateString();
      });
      const completados = hoy.filter((o: Order) => o.status === "DELIVERED");
      const totalVentas = completados.reduce((sum: number, o: Order) => sum + o.total, 0);
      const ticketProm = completados.length > 0 ? Math.round(totalVentas / completados.length) : 0;
      setStatsHoy({ ventas: totalVentas, pedidos: hoy.length, ticket: ticketProm });
    } catch {}
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchShift();
    fetchStats();
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [fetchOrders, fetchShift, fetchStats]);

  useEffect(() => {
    import("chart.js/auto").then((m) => {
      const Chart = m.default;
      if (hourChartRef.current) {
        hourChartInstance.current?.destroy();
        hourChartInstance.current = new Chart(hourChartRef.current, {
          type: "bar",
          data: {
            labels: ["9h","10h","11h","12h","13h","14h","15h"],
            datasets: [
              { label:"Hoy", data:[320,580,940,1200,860,640,280], backgroundColor:"#1a1916", borderRadius:3, stack:"a" },
              { label:"Ayer", data:[280,510,820,1050,790,580,310], backgroundColor:"#e2e1d9", borderRadius:3, stack:"b" },
            ],
          },
          options: {
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{display:false} },
            scales:{
              x:{ grid:{display:false}, ticks:{color:"#9e9d95",font:{size:10}}, border:{color:"transparent"} },
              y:{ grid:{color:"rgba(0,0,0,.05)"}, ticks:{color:"#9e9d95",font:{size:10},callback:(v:any)=>"$"+Math.round(v/1000)+"k"}, border:{color:"transparent"} },
            },
          },
        });
      }
      if (channelChartRef.current) {
        channelChartInstance.current?.destroy();
        channelChartInstance.current = new Chart(channelChartRef.current, {
          type: "doughnut",
          data: {
            labels:["TPV","Web","Rappi","Uber"],
            datasets:[{ data:[47,29,15,9], backgroundColor:["#f97316","#3b82f6","#ef4444","#8b5cf6"], borderWidth:0 }],
          },
          options: {
            responsive:true, maintainAspectRatio:false, cutout:"68%",
            plugins:{ legend:{display:false} },
          },
        });
      }
    });
    return () => {
      hourChartInstance.current?.destroy();
      channelChartInstance.current?.destroy();
    };
  }, []);

  const activeOrders = orders.filter(o => !["DELIVERED","CANCELLED"].includes(o.status));
  const kanbanCols = [
    { key:"PENDING",    label:"Nuevos",     color:"#f59e0b" },
    { key:"PREPARING",  label:"Preparando", color:"#8b5cf6" },
    { key:"READY",      label:"Listos",     color:"#22c55e" },
    { key:"DELIVERING", label:"En camino",  color:"#f97316" },
  ];

  const kpis = [
    { label:"Ventas hoy",      value: fmtMoney(statsHoy.ventas),  delta:"+12%",       up:true  },
    { label:"Pedidos hoy",     value: String(statsHoy.pedidos),    delta:"+5 vs ayer", up:true  },
    { label:"Ticket prom.",    value: fmtMoney(statsHoy.ticket),   delta:"-3%",        up:false },
    { label:"T. espera prom.", value:"14m",                        delta:"+2m",        up:false },
  ];

  async function advanceOrder(orderId: string, currentStatus: string) {
    const next: Record<string,string> = {
      PENDING:"PREPARING", PREPARING:"READY", READY:"DELIVERING", DELIVERING:"DELIVERED"
    };
    if (!next[currentStatus]) return;
    try {
      await api.put(`/api/orders/${orderId}/status`, { status: next[currentStatus] });
      fetchOrders();
    } catch { alert("Error al actualizar"); }
  }

  const s: Record<string,React.CSSProperties> = {
    shell:      { display:"grid", gridTemplateColumns:"200px 1fr", minHeight:"100vh", background:"#f7f6f3", fontFamily:"Inter,sans-serif", fontSize:14 },
    sidebar:    { background:"#fff", borderRight:"0.5px solid #e2e1d9", display:"flex", flexDirection:"column" },
    main:       { display:"flex", flexDirection:"column", overflow:"auto" },
    topbar:     { background:"#fff", borderBottom:"0.5px solid #e2e1d9", padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" },
    content:    { padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 },
    kpiGrid:    { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 },
    kpiCard:    { background:"#fff", border:"0.5px solid #e2e1d9", borderRadius:10, padding:"14px 16px" },
    kanbanGrid: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 },
    kanbanCol:  { background:"#fff", border:"0.5px solid #e2e1d9", borderRadius:10, padding:12 },
    orderCard:  { background:"#f7f6f3", border:"0.5px solid #e2e1d9", borderRadius:7, padding:"10px 11px", marginTop:8 },
    panel:      { background:"#fff", border:"0.5px solid #e2e1d9", borderRadius:10, padding:"14px 16px" },
    bottomGrid: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 },
  };

  const navItems = [
    { icon:"📊", label:"Dashboard",  href:"/admin/restaurant-dashboard", active:true },
    { icon:"📋", label:"Pedidos",    href:"/admin/pedidos" },
    { icon:"🍔", label:"Menú",       href:"/admin/menu" },
    { icon:"👥", label:"Empleados",  href:"/admin/empleados" },
    { icon:"💰", label:"Turnos",     href:"/admin/turnos" },
    { icon:"📈", label:"Reportes",   href:"/admin/reportes" },
    { icon:"⚙️", label:"Config",     href:"/admin/configuracion" },
  ];

  return (
    <div style={s.shell}>
      {/* SIDEBAR */}
      <div style={s.sidebar}>
        <div style={{ padding:"18px 16px 14px", borderBottom:"0.5px solid #e2e1d9" }}>
          <div style={{ fontSize:13, fontWeight:600 }}>🍔 Master Burger&apos;s</div>
          <div style={{ fontSize:10, color:"#9e9d95", marginTop:2, fontFamily:"monospace" }}>Admin Panel</div>
        </div>
        <div style={{ padding:8, flex:1 }}>
          {navItems.map(item => (
            <a key={item.href} href={item.href} style={{
              display:"flex", alignItems:"center", gap:8, padding:"7px 10px",
              borderRadius:7, fontSize:12, textDecoration:"none",
              color: item.active ? "#fff" : "#6b6a63",
              background: item.active ? "#1a1916" : "transparent",
              marginBottom:1,
            }}>
              <span>{item.icon}</span>{item.label}
            </a>
          ))}
        </div>
        <div style={{ padding:"10px 12px", borderTop:"0.5px solid #e2e1d9", fontSize:11, color:"#9e9d95" }}>
          {shift
            ? `🟢 ${shift.employeeName || shift.employee?.name || "Cajero"} · Turno activo`
            : "⚪ Sin turno activo"
          }
        </div>
      </div>

      {/* MAIN */}
      <div style={s.main}>
        {/* TOPBAR */}
        <div style={s.topbar}>
          <div>
            <div style={{ fontSize:14, fontWeight:600 }}>Dashboard del restaurante</div>
            <div style={{ fontSize:11, color:"#9e9d95" }}>
              {now?.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"})}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ fontFamily:"monospace", fontSize:13, fontWeight:500 }}>
              {now?.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
            </div>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"#16a34a" }} />
            <span style={{ fontSize:11, color:"#16a34a" }}>En vivo</span>
            <button onClick={fetchOrders} style={{ padding:"5px 12px", borderRadius:6, border:"0.5px solid #e2e1d9", background:"#fff", fontSize:11, cursor:"pointer" }}>
              ↻ Actualizar
            </button>
          </div>
        </div>

        <div style={s.content}>
          {/* KPIs */}
          <div style={s.kpiGrid}>
            {kpis.map(k => (
              <div key={k.label} style={s.kpiCard}>
                <div style={{ fontSize:10, color:"#9e9d95", textTransform:"uppercase", letterSpacing:1 }}>{k.label}</div>
                <div style={{ fontSize:22, fontWeight:600, color:"#1a1916", margin:"4px 0" }}>{k.value}</div>
                <div style={{ fontSize:11, color: k.up ? "#16a34a" : "#dc2626" }}>
                  {k.up ? "▲" : "▼"} {k.delta}
                </div>
              </div>
            ))}
          </div>

          {/* KANBAN */}
          <div style={s.kanbanGrid}>
            {kanbanCols.map(col => {
              const colOrders = activeOrders.filter(o => o.status === col.key);
              return (
                <div key={col.key} style={s.kanbanCol}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:col.color, textTransform:"uppercase", letterSpacing:0.5 }}>{col.label}</div>
                    <div style={{ fontSize:11, background:"#f0efe9", borderRadius:20, padding:"1px 8px", color:"#6b6a63" }}>{colOrders.length}</div>
                  </div>
                  {loading && <div style={{ fontSize:11, color:"#9e9d95", padding:"8px 0" }}>Cargando...</div>}
                  {!loading && colOrders.length === 0 && (
                    <div style={{ fontSize:11, color:"#b0afa6", textAlign:"center", padding:"12px 0" }}>Vacío</div>
                  )}
                  {colOrders.map(order => {
                    const mins = minutesSince(order.createdAt);
                    return (
                      <div key={order.id} style={s.orderCard}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:500 }}>#{order.orderNumber || order.id.slice(-4)}</span>
                          <span style={{ fontSize:10, fontWeight:600, color:timerColor(mins), background:timerColor(mins)+"18", padding:"1px 7px", borderRadius:20 }}>{mins}m</span>
                        </div>
                        <div style={{ fontSize:10, color:"#6b6a63", margin:"5px 0 6px", lineHeight:1.5 }}>
                          {order.items.slice(0,2).map((item,i) => (
                            <div key={i}>{item.quantity}× {item.menuItem?.name}</div>
                          ))}
                          {order.items.length > 2 && <div style={{color:"#9e9d95"}}>+{order.items.length-2} más</div>}
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
          <div style={s.bottomGrid}>
            {/* Ventas por hora */}
            <div style={s.panel}>
              <div style={{ fontSize:11, fontWeight:600, marginBottom:10 }}>Ventas por hora</div>
              <div style={{ display:"flex", gap:12, marginBottom:8 }}>
                {[["#1a1916","Hoy"],["#e2e1d9","Ayer"]].map(([color,label]) => (
                  <div key={label} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"#6b6a63" }}>
                    <div style={{ width:8, height:8, borderRadius:2, background:color }} />{label}
                  </div>
                ))}
              </div>
              <div style={{ height:120 }}><canvas ref={hourChartRef} /></div>
            </div>

            {/* Canales */}
            <div style={s.panel}>
              <div style={{ fontSize:11, fontWeight:600, marginBottom:10 }}>Canales de venta</div>
              <div style={{ height:100 }}><canvas ref={channelChartRef} /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:10 }}>
                {[["TPV","47%","#f97316"],["Web","29%","#3b82f6"],["Rappi","15%","#ef4444"],["Uber","9%","#8b5cf6"]].map(([label,pct,color]) => (
                  <div key={label} style={{ display:"flex", alignItems:"center", gap:6, fontSize:10, color:"#6b6a63" }}>
                    <div style={{ width:8, height:8, borderRadius:2, background:color, flexShrink:0 }} />
                    {label} · <span style={{ fontWeight:600, color:"#1a1916" }}>{pct}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Acciones rápidas */}
            <div style={s.panel}>
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
                  color:"#1a1916", textDecoration:"none", border:"0.5px solid #e2e1d9",
                  marginBottom:6,
                }}>
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
