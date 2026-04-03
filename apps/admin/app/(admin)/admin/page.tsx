"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import OnboardingChecklist from "@/components/OnboardingChecklist";

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats]   = useState<any>(null);
  const [live, setLive]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [restaurantName, setRestaurantName] = useState("Cargando...");

  async function fetchAll() {
    try {
      const [s, orders, config] = await Promise.all([
        api.get("/api/reports/dashboard").catch(() => ({ data: {} })),
        api.get("/api/orders/admin").catch(() => ({ data: [] })),
        api.get("/api/admin/config").catch(() => ({ data: {} })),
      ]);

      setStats(s.data);
      setRestaurantName(config.data.name || "Mi Restaurante");

      // Calcular métricas en vivo
      const active = orders.data.filter((o: any) => !["DELIVERED","CANCELLED"].includes(o.status));
      setLive({
        onTheWay:   active.filter((o: any) => o.status === "ON_THE_WAY").length,
        ready:      active.filter((o: any) => o.status === "READY").length,
        preparing:  active.filter((o: any) => o.status === "PREPARING").length,
        pending:    active.filter((o: any) => o.status === "PENDING").length,
        total:      active.length,
      });
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, []);

  const statCards = [
    { label:"Ventas hoy",      value:`$${(stats?.todaySales||0).toFixed(0)}`,   icon:"💰", color:"#22c55e" },
    { label:"Pedidos hoy",     value: stats?.todayOrders||0,                     icon:"📋", color:"#3b82f6" },
    { label:"Ticket promedio", value:`$${(stats?.averageTicket||0).toFixed(0)}`, icon:"🎯", color:"#f59e0b" },
    { label:"Clientes hoy",    value: stats?.todayCustomers||0,                  icon:"👥", color:"#8b5cf6" },
  ];

  const liveCards = [
    { label:"PENDIENTES",   value: live?.pending||0,   icon:"⏳", color:"#f59e0b" },
    { label:"PREPARANDO",   value: live?.preparing||0, icon:"👨‍🍳", color:"#8b5cf6" },
    { label:"LISTOS",       value: live?.ready||0,     icon:"✅", color:"#22c55e" },
    { label:"EN CAMINO",    value: live?.onTheWay||0,  icon:"🛵", color:"#f97316" },
  ];

  if (loading) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center font-syne">
      <div className="w-16 h-16 border-t-2 border-orange-500 rounded-full animate-spin mb-4"></div>
      <p className="text-white font-black tracking-[0.5em] text-[10px] uppercase">Sincronizando Local...</p>
    </div>
  );

  return (
    <div className="pb-12 bg-[#020202] text-white font-syne min-h-screen">

      <OnboardingChecklist />

      {/* Header Pro */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-12 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
            <span className="text-[10px] font-black tracking-[0.3em] text-gray-500 uppercase">Estación de Mando</span>
          </div>
          <h1 className="text-6xl font-black tracking-tighter leading-none uppercase">
            {restaurantName}
          </h1>
          <p className="text-gray-500 text-sm font-bold mt-2 uppercase tracking-widest">
            {new Date().toLocaleDateString("es-MX",{weekday:"long", day:"numeric", month:"long"})}
          </p>
        </div>
        <button onClick={fetchAll}
          className="px-8 py-4 rounded-2xl text-xs font-black bg-white text-black hover:bg-orange-500 hover:text-white transition-all shadow-xl uppercase tracking-widest">
          🔄 Refrescar
        </button>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {statCards.map(c => (
          <div key={c.label} className="bg-[#0a0a0a] border border-white/5 rounded-[2.5rem] p-8 hover:border-white/20 transition-all group overflow-hidden relative">
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-all"></div>
            <div className="flex items-center justify-between mb-6">
              <span className="text-3xl filter grayscale group-hover:grayscale-0 transition-all">{c.icon}</span>
              <span className="text-[9px] font-black px-2 py-1 rounded bg-white/5 text-gray-500 border border-white/5 uppercase tracking-tighter">Live Metric</span>
            </div>
            <div className="text-4xl font-black tracking-tighter mb-1" style={{color:c.color}}>
              {c.value}
            </div>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{c.label}</div>
          </div>
        ))}
      </div>

      {/* LIVE MONITOR */}
      <div className="bg-[#0a0a0a] border border-white/5 rounded-[3rem] overflow-hidden mb-12 shadow-2xl">
        <div className="px-8 py-6 flex items-center justify-between border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]"></div>
            <span className="font-black text-xs uppercase tracking-[0.2em]">Monitor de Operaciones en Vivo</span>
          </div>
          <span className="text-[10px] font-bold text-gray-500">{live?.total||0} PEDIDOS ACTIVOS</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/5">
          {liveCards.map(c => (
            <button key={c.label} onClick={() => router.push("/admin/pedidos")}
              className="p-10 text-center hover:bg-white/5 transition-all flex flex-col items-center">
              <div className="text-3xl mb-4 opacity-50 group-hover:opacity-100">{c.icon}</div>
              <div className="text-4xl font-black tracking-tighter mb-1" style={{color:c.color}}>{c.value}</div>
              <div className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em]">{c.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* QUICK ACCESS SECTIONS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {/* OPERACIONES */}
        <div className="space-y-4">
          <h2 className="text-[10px] font-black text-orange-500 uppercase tracking-[0.4em] ml-4">Operaciones</h2>
          <div className="grid gap-3">
            {[
              { href:"/admin/tpv", icon:"🖥️", label:"Caja TPV", color:"#f59e0b" },
              { href:"/admin/pedidos", icon:"📋", label:"Gestión Pedidos", color:"#3b82f6" },
              { href:"/admin/meseros", icon:"🧑‍🍳", label:"Terminal Mesero", color:"#8b5cf6" },
            ].map(item => (
              <a key={item.href} href={item.href} className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-6 flex items-center gap-4 hover:bg-white/5 hover:border-white/20 transition-all group">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl bg-white/5 group-hover:scale-110 transition-all">{item.icon}</div>
                <span className="font-black text-xs uppercase tracking-widest">{item.label}</span>
              </a>
            ))}
          </div>
        </div>

        {/* LOGÍSTICA */}
        <div className="space-y-4">
          <h2 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] ml-4">Logística</h2>
          <div className="grid gap-3">
            {[
              { href:"/admin/inventario", icon:"📦", label:"Inventario IA" },
              { href:"/admin/impresoras", icon:"🖨️", label:"Impresoras" },
              { href:"/admin/rastreo", icon:"📍", label:"Rastreo GPS" },
            ].map(item => (
              <a key={item.href} href={item.href} className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-6 flex items-center gap-4 hover:bg-white/5 hover:border-white/20 transition-all group">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl bg-white/5 group-hover:scale-110 transition-all">{item.icon}</div>
                <span className="font-black text-xs uppercase tracking-widest">{item.label}</span>
              </a>
            ))}
          </div>
        </div>

        {/* MARKETING */}
        <div className="space-y-4">
          <h2 className="text-[10px] font-black text-purple-500 uppercase tracking-[0.4em] ml-4">Crecimiento</h2>
          <div className="grid gap-3">
            {[
              { href:"/admin/menu", icon:"🍔", label:"Editor de Menú" },
              { href:"/admin/banners", icon:"🖼️", label:"Publicidad" },
              { href:"/admin/clientes", icon:"🏢", label:"Mi Marca" },
            ].map(item => (
              <a key={item.href} href={item.href} className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-6 flex items-center gap-4 hover:bg-white/5 hover:border-white/20 transition-all group">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl bg-white/5 group-hover:scale-110 transition-all">{item.icon}</div>
                <span className="font-black text-xs uppercase tracking-widest">{item.label}</span>
              </a>
            ))}
          </div>
        </div>

      </div>

      {/* FOOTER */}
      <div className="mt-20 border-t border-white/5 pt-8 text-center text-[9px] font-black text-gray-700 uppercase tracking-[0.5em]">
        MRTPVREST v3.0 • Sistema Operativo de Restaurante Seguro
      </div>
    </div>
  );
}
