"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const STATUSES = [
  { key: "PENDING",    label: "Pendientes",  icon: "📥", color: "#f59e0b" },
  { key: "CONFIRMED",  label: "Confirmados", icon: "✅", color: "#3b82f6" },
  { key: "PREPARING",  label: "Preparando",  icon: "👨‍🍳", color: "#8b5cf6" },
  { key: "READY",      label: "Listos",      icon: "🎉", color: "#06b6d4" },
  { key: "ON_THE_WAY", label: "En camino",   icon: "🛵", color: "#f97316" },
  { key: "DELIVERED",  label: "Entregados",  icon: "🏠", color: "#22c55e" },
];

const NEXT_STATUS: Record<string, string> = {
  PENDING: "CONFIRMED", CONFIRMED: "PREPARING",
  PREPARING: "READY", READY: "ON_THE_WAY", ON_THE_WAY: "DELIVERED",
};

const SOURCE_LABELS: Record<string, string> = {
  ONLINE: "🌐 Online", TPV: "🖥️ TPV", WAITER: "🧑‍🍽️ Mesero",
};

function timeAgo(date: string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return "ahora";
  if (diff < 60) return `${diff}m`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

function OrderCard({ order, drivers, onStatusChange, onAssignDriver }: {
  order: any; drivers: any[];
  onStatusChange: (id: string, status: string) => void;
  onAssignDriver: (orderId: string, driverId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusInfo   = STATUSES.find(s => s.key === order.status);
  const nextStatus   = NEXT_STATUS[order.status];
  const nextInfo     = STATUSES.find(s => s.key === nextStatus);
  const elapsed      = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  const urgent       = elapsed > 30 && !["DELIVERED", "CANCELLED"].includes(order.status);

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: "var(--surf)",
        border: `1px solid ${urgent ? "rgba(239,68,68,0.4)" : "var(--border)"}`,
        boxShadow: urgent ? "0 0 0 1px rgba(239,68,68,0.1)" : "none",
      }}
    >
      {/* TOP COLOR BAR */}
      <div style={{ height: "2px", background: statusInfo?.color }} />

      {/* HEADER */}
      <div className="px-4 pt-3 pb-2 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-syne font-black text-sm" style={{ color: "var(--text)" }}>
              {order.orderNumber}
            </span>
            {urgent && (
              <span
                className="text-[10px] font-black px-2 py-0.5 rounded-full"
                style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                ⚠ {elapsed}m
              </span>
            )}
            <span
              className="text-[10px] font-black px-2 py-0.5 rounded-full"
              style={{ background: `${statusInfo?.color}15`, color: statusInfo?.color, border: `1px solid ${statusInfo?.color}25` }}
            >
              {statusInfo?.icon} {statusInfo?.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]" style={{ color: "var(--muted)" }}>
            <span>{order.customerName || order.user?.name || "Invitado"}</span>
            {order.customerPhone && <><span>·</span><span>{order.customerPhone}</span></>}
            <span>·</span><span>{timeAgo(order.createdAt)}</span>
            <span>·</span><span>{SOURCE_LABELS[order.source] || order.source}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-syne font-black text-base" style={{ color: "var(--accent)" }}>
            ${order.total?.toFixed(0)}
          </div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>
            {order.orderType === "DELIVERY" ? "🛵" : "🏪"}{" "}
            {order.paymentMethod === "CASH_ON_DELIVERY" ? "Efectivo" : "MP"}
          </div>
        </div>
      </div>

      {/* ITEMS PREVIEW */}
      <div className="px-4 pb-2 text-[11px]" style={{ color: "var(--muted)" }}>
        {order.items?.slice(0, 3).map((i: any) => `${i.quantity}x ${i.name}`).join(" · ")}
        {order.items?.length > 3 && ` +${order.items.length - 3} más`}
      </div>

      {/* EXPANDED */}
      {expanded && (
        <div className="px-4 pb-3 pt-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--border)" }}>
          {order.items?.map((item: any) => (
            <div key={item.id} className="flex justify-between text-xs">
              <span style={{ color: "var(--text)" }}>{item.quantity}x {item.name}{item.notes ? ` (${item.notes})` : ""}</span>
              <span style={{ color: "var(--muted)" }}>${(item.price * item.quantity).toFixed(0)}</span>
            </div>
          ))}
          {order.deliveryAddress && (
            <div
              className="text-xs mt-1 p-2 rounded-xl"
              style={{ background: "var(--surf2)", color: "var(--muted)", border: "1px solid var(--border)" }}
            >
              📍 {order.deliveryAddress}
            </div>
          )}
          {order.notes && (
            <div
              className="text-xs p-2 rounded-xl"
              style={{ background: "rgba(245,158,11,0.08)", color: "var(--yellow)", border: "1px solid rgba(245,158,11,0.15)" }}
            >
              📝 {order.notes}
            </div>
          )}
          {order.orderType === "DELIVERY" && ["READY", "ON_THE_WAY"].includes(order.status) && (
            <div className="mt-1">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--muted)" }}>
                Repartidor
              </div>
              <select
                value={order.deliveryDriverId || ""}
                onChange={e => { if (e.target.value) onAssignDriver(order.id, e.target.value); }}
                className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                <option value="">— Seleccionar repartidor —</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ""}</option>
                ))}
              </select>
              {order.deliveryDriverId && (
                <div className="text-[11px] mt-1 font-bold" style={{ color: "var(--green)" }}>
                  ✓ {drivers.find(d => d.id === order.deliveryDriverId)?.name || "Asignado"}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ACTIONS */}
      <div className="px-3 pb-3 flex gap-2">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black transition-all"
          style={{ background: "var(--surf2)", color: "var(--muted)", border: "1px solid var(--border)" }}
        >
          {expanded ? "▲" : "▼"}
        </button>

        {order.customerPhone && (
          <a
            href={`https://wa.me/52${order.customerPhone.replace(/\D/g, "")}`}
            target="_blank" rel="noopener noreferrer"
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm transition-all"
            style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}
          >
            💬
          </a>
        )}

        {nextStatus && (
          <button
            onClick={() => onStatusChange(order.id, nextStatus)}
            className="flex-1 py-2 rounded-xl font-syne font-black text-xs transition-all active:scale-95"
            style={{ background: nextInfo?.color, color: "#fff" }}
          >
            {nextInfo?.icon} {nextInfo?.label}
          </button>
        )}

        {order.status === "PENDING" && (
          <button
            onClick={() => onStatusChange(order.id, "CANCELLED")}
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black transition-all"
            style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)" }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export default function PedidosPage() {
  const [orders, setOrders]       = useState<any[]>([]);
  const [drivers, setDrivers]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<"kanban" | "list">("kanban");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [search, setSearch]       = useState("");
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [ordersRes, driversRes] = await Promise.all([
        api.get("/api/orders/admin"),
        api.get("/api/delivery"),
      ]);
      setOrders(ordersRes.data);
      setDrivers(driversRes.data);
      setLastUpdate(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 8000);
    return () => clearInterval(t);
  }, [fetchData]);

  async function changeStatus(orderId: string, status: string) {
    try {
      await api.put(`/api/orders/${orderId}/status`, { status });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    } catch (e: any) {
      alert(e?.response?.data?.error || "Error al cambiar estado");
    }
  }

  async function assignDriver(orderId: string, driverId: string) {
    try {
      await api.put("/api/delivery/assign", { orderId, driverId });
      setOrders(prev => prev.map(o =>
        o.id === orderId ? { ...o, deliveryDriverId: driverId, status: "ON_THE_WAY" } : o
      ));
    } catch (e: any) {
      alert(e?.response?.data?.error || "Error al asignar repartidor");
    }
  }

  const filtered = orders.filter(o => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    if (filterSource !== "all" && o.source !== filterSource) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.orderNumber?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerPhone?.includes(q)
      );
    }
    return true;
  });

  const active         = orders.filter(o => !["DELIVERED", "CANCELLED"].includes(o.status));
  const pending        = orders.filter(o => o.status === "PENDING").length;
  const todayDelivered = orders.filter(o =>
    o.status === "DELIVERED" &&
    new Date(o.updatedAt).toDateString() === new Date().toDateString()
  );
  const todayRevenue   = todayDelivered.reduce((s, o) => s + (o.total || 0), 0);

  const STATS = [
    { label: "Activos",        value: active.length,             color: "var(--accent)",  icon: "🔥" },
    { label: "Pendientes",     value: pending,                   color: pending > 0 ? "var(--red)" : "var(--green)", icon: "📥" },
    { label: "Hoy entregados", value: todayDelivered.length,     color: "var(--green)",   icon: "✅" },
    { label: "Ingresos hoy",   value: `$${todayRevenue.toFixed(0)}`, color: "var(--blue)", icon: "💰" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="p-6 max-w-[1600px] mx-auto">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="font-syne font-black text-2xl" style={{ color: "var(--text)" }}>
              Pedidos
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--green)" }} />
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                Actualizado {lastUpdate.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* VIEW TOGGLE */}
            <div
              className="flex rounded-xl p-1"
              style={{ background: "var(--surf)", border: "1px solid var(--border)" }}
            >
              {(["kanban", "list"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="px-3 py-1.5 rounded-lg text-xs font-black transition-all"
                  style={{
                    background: view === v ? "var(--accent)" : "transparent",
                    color: view === v ? "#fff" : "var(--muted)",
                  }}
                >
                  {v === "kanban" ? "⊞ Kanban" : "☰ Lista"}
                </button>
              ))}
            </div>
            <button
              onClick={fetchData}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
              style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--muted)" }}
            >
              🔄
            </button>
          </div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {STATS.map(s => (
            <div
              key={s.label}
              className="rounded-2xl p-4"
              style={{ background: "var(--surf)", border: "1px solid var(--border)" }}
            >
              <div className="text-lg mb-2">{s.icon}</div>
              <div className="font-syne font-black text-2xl mb-0.5" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* FILTERS */}
        <div
          className="flex gap-2 flex-wrap mb-5 p-3 rounded-2xl"
          style={{ background: "var(--surf)", border: "1px solid var(--border)" }}
        >
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar pedido, cliente..."
            className="px-3 py-2 rounded-xl text-sm outline-none flex-1 min-w-[160px]"
            style={{
              background: "var(--surf2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            <option value="all">Todos los estados</option>
            {STATUSES.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
          </select>
          <select
            value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            <option value="all">Todos los orígenes</option>
            <option value="ONLINE">🌐 Online</option>
            <option value="TPV">🖥️ TPV</option>
            <option value="WAITER">🧑‍🍽️ Mesero</option>
          </select>
          {(filterStatus !== "all" || filterSource !== "all" || search) && (
            <button
              onClick={() => { setFilterStatus("all"); setFilterSource("all"); setSearch(""); }}
              className="px-3 py-2 rounded-xl text-xs font-black transition-all"
              style={{ background: "rgba(239,68,68,0.08)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.15)" }}
            >
              ✕ Limpiar
            </button>
          )}
        </div>

        {/* CONTENT */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-4xl animate-bounce">🍔</div>
          </div>
        ) : view === "kanban" ? (
          <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: "thin" }}>
            {STATUSES.map(col => {
              const colOrders = filtered.filter(o => o.status === col.key);
              return (
                <div key={col.key} className="flex-shrink-0 flex flex-col gap-3" style={{ width: "290px" }}>
                  {/* COL HEADER */}
                  <div
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                    style={{
                      background: `${col.color}10`,
                      border: `1px solid ${col.color}25`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{col.icon}</span>
                      <span className="font-syne font-black text-xs uppercase tracking-wider" style={{ color: col.color }}>
                        {col.label}
                      </span>
                    </div>
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                      style={{ background: col.color }}
                    >
                      {colOrders.length}
                    </span>
                  </div>

                  {colOrders.length === 0 ? (
                    <div
                      className="text-center py-10 rounded-2xl text-xs"
                      style={{
                        border: "1px dashed var(--border)",
                        color: "var(--muted)",
                      }}
                    >
                      Sin pedidos
                    </div>
                  ) : (
                    colOrders.map(o => (
                      <OrderCard key={o.id} order={o} drivers={drivers}
                        onStatusChange={changeStatus} onAssignDriver={assignDriver} />
                    ))
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-sm" style={{ color: "var(--muted)" }}>
                Sin pedidos que mostrar
              </div>
            ) : (
              filtered.map(o => (
                <OrderCard key={o.id} order={o} drivers={drivers}
                  onStatusChange={changeStatus} onAssignDriver={assignDriver} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
