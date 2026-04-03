"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const STATUSES = [
  { key: "PENDING",    label: "Pendientes",   icon: "📥", color: "#f59e0b" },
  { key: "CONFIRMED",  label: "Confirmados",  icon: "✅", color: "#3b82f6" },
  { key: "PREPARING",  label: "Preparando",   icon: "👨‍🍳", color: "#8b5cf6" },
  { key: "READY",      label: "Listos",       icon: "🎉", color: "#06b6d4" },
  { key: "ON_THE_WAY", label: "En camino",    icon: "🛵", color: "#f97316" },
  { key: "DELIVERED",  label: "Entregados",   icon: "🏠", color: "#22c55e" },
];

const NEXT_STATUS: Record<string, string> = {
  PENDING:    "CONFIRMED",
  CONFIRMED:  "PREPARING",
  PREPARING:  "READY",
  READY:      "ON_THE_WAY",
  ON_THE_WAY: "DELIVERED",
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
  const [assigning, setAssigning] = useState(false);
  const statusInfo = STATUSES.find(s => s.key === order.status);
  const nextStatus = NEXT_STATUS[order.status];
  const nextStatusInfo = STATUSES.find(s => s.key === nextStatus);
  const elapsed = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  const urgent = elapsed > 30 && !["DELIVERED", "CANCELLED"].includes(order.status);

  return (
    <div className="rounded-2xl border overflow-hidden transition-all"
      style={{
        background: "var(--surf)",
        borderColor: urgent ? "rgba(239,68,68,0.5)" : "var(--border)",
        boxShadow: urgent ? "0 0 0 1px rgba(239,68,68,0.2)" : "none",
      }}>

      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-syne font-black text-sm">{order.orderNumber}</span>
            {urgent && <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>⚠️ {elapsed}m</span>}
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
              style={{ background: `${statusInfo?.color}15`, color: statusInfo?.color }}>
              {statusInfo?.icon} {statusInfo?.label}
            </span>
          </div>
          <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: "var(--muted)" }}>
            <span>{order.customerName || order.user?.name || "Invitado"}</span>
            {order.customerPhone && <span>· {order.customerPhone}</span>}
            <span>· {timeAgo(order.createdAt)}</span>
            <span>· {SOURCE_LABELS[order.source] || order.source}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-syne font-black text-base" style={{ color: "var(--gold)" }}>${order.total?.toFixed(0)}</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            {order.orderType === "DELIVERY" ? "🛵" : "🏪"} {order.paymentMethod === "CASH_ON_DELIVERY" ? "Efectivo" : "MP"}
          </div>
        </div>
      </div>

      {/* Items preview */}
      <div className="px-4 pb-2">
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          {order.items?.slice(0, 3).map((i: any) => `${i.quantity}x ${i.name}`).join(", ")}
          {order.items?.length > 3 && ` +${order.items.length - 3} más`}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          {order.items?.map((item: any) => (
            <div key={item.id} className="flex justify-between text-xs">
              <span>{item.quantity}x {item.name}{item.notes ? ` (${item.notes})` : ""}</span>
              <span style={{ color: "var(--muted)" }}>${(item.price * item.quantity).toFixed(0)}</span>
            </div>
          ))}
          {order.deliveryAddress && (
            <div className="text-xs mt-1 p-2 rounded-xl" style={{ background: "var(--surf2)", color: "var(--muted)" }}>
              📍 {order.deliveryAddress}
            </div>
          )}
          {order.notes && (
            <div className="text-xs p-2 rounded-xl" style={{ background: "rgba(245,166,35,0.08)", color: "var(--gold)" }}>
              📝 {order.notes}
            </div>
          )}

          {/* Asignar repartidor */}
          {order.orderType === "DELIVERY" && ["READY", "ON_THE_WAY"].includes(order.status) && (
            <div className="mt-1">
              <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>Repartidor</div>
              <select
                value={order.deliveryDriverId || ""}
                onChange={e => { if (e.target.value) onAssignDriver(order.id, e.target.value); }}
                className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }}>
                <option value="">— Seleccionar repartidor —</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ""}</option>
                ))}
              </select>
              {order.deliveryDriverId && (
                <div className="text-xs mt-1 font-bold" style={{ color: "var(--green)" }}>
                  ✓ {drivers.find(d => d.id === order.deliveryDriverId)?.name || "Asignado"}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-3 pb-3 flex gap-2">
        <button onClick={() => setExpanded(e => !e)}
          className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold"
          style={{ background: "var(--surf2)", color: "var(--muted)" }}>
          {expanded ? "▲" : "▼"}
        </button>

        {order.customerPhone && (
          <a href={`https://wa.me/52${order.customerPhone.replace(/\D/g, '')}`}
            target="_blank" rel="noopener noreferrer"
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm"
            style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
            💬
          </a>
        )}

        {nextStatus && (
          <button onClick={() => onStatusChange(order.id, nextStatus)}
            className="flex-1 py-2 rounded-xl font-syne font-black text-xs transition-all active:scale-95"
            style={{ background: nextStatusInfo?.color, color: "#fff" }}>
            {nextStatusInfo?.icon} {nextStatusInfo?.label}
          </button>
        )}

        {order.status === "PENDING" && (
          <button onClick={() => onStatusChange(order.id, "CANCELLED")}
            className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export default function PedidosOnlinePage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [search, setSearch] = useState("");
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
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, deliveryDriverId: driverId, status: "ON_THE_WAY" } : o));
    } catch (e: any) {
      alert(e?.response?.data?.error || "Error al asignar repartidor");
    }
  }

  // Filtros
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

  // Stats rápidas
  const active = orders.filter(o => !["DELIVERED", "CANCELLED"].includes(o.status));
  const todayDelivered = orders.filter(o => o.status === "DELIVERED" && new Date(o.updatedAt).toDateString() === new Date().toDateString());
  const todayRevenue = todayDelivered.reduce((s, o) => s + (o.total || 0), 0);
  const pending = orders.filter(o => o.status === "PENDING").length;

  return (
    <div className="p-4 md:p-6 min-h-screen" style={{ background: "var(--bg)" }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-syne font-black text-2xl">Pedidos Online</h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Actualizado: {lastUpdate.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle animate-pulse" style={{ background: "var(--green)" }} />
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView("kanban")}
            className="px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: view === "kanban" ? "var(--gold)" : "var(--surf)", color: view === "kanban" ? "#000" : "var(--muted)" }}>
            ⊞ Kanban
          </button>
          <button onClick={() => setView("list")}
            className="px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: view === "list" ? "var(--gold)" : "var(--surf)", color: view === "list" ? "#000" : "var(--muted)" }}>
            ☰ Lista
          </button>
          <button onClick={fetchData}
            className="px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: "var(--surf)", color: "var(--muted)" }}>
            🔄
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Activos", value: active.length, color: "var(--gold)", icon: "🔥" },
          { label: "Pendientes", value: pending, color: pending > 0 ? "#ef4444" : "var(--green)", icon: "📥" },
          { label: "Hoy entregados", value: todayDelivered.length, color: "var(--green)", icon: "✅" },
          { label: "Ingresos hoy", value: `$${todayRevenue.toFixed(0)}`, color: "#3b82f6", icon: "💰" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border p-3" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
            <div className="text-lg mb-1">{s.icon}</div>
            <div className="font-syne font-black text-xl" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap mb-5">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar pedido, cliente..."
          className="px-3 py-2 rounded-xl text-sm outline-none"
          style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)", minWidth: "180px" }}
          onFocus={e => e.target.style.borderColor = "var(--gold)"}
          onBlur={e => e.target.style.borderColor = "var(--border)"} />

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm outline-none"
          style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <option value="all">Todos los estados</option>
          {STATUSES.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
        </select>

        <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm outline-none"
          style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <option value="all">Todos los orígenes</option>
          <option value="ONLINE">🌐 Online</option>
          <option value="TPV">🖥️ TPV</option>
          <option value="WAITER">🧑‍🍽️ Mesero</option>
        </select>

        {(filterStatus !== "all" || filterSource !== "all" || search) && (
          <button onClick={() => { setFilterStatus("all"); setFilterSource("all"); setSearch(""); }}
            className="px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
            Limpiar filtros
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-4xl animate-bounce">🍔</div>
      ) : view === "kanban" ? (
        /* ── VISTA KANBAN ── */
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: "thin" }}>
          {STATUSES.map(col => {
            const colOrders = filtered.filter(o => o.status === col.key);
            return (
              <div key={col.key} className="flex-shrink-0 flex flex-col gap-3" style={{ width: "300px" }}>
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2 rounded-xl sticky top-0 z-10"
                  style={{ background: `${col.color}15`, border: `1px solid ${col.color}30` }}>
                  <div className="flex items-center gap-2">
                    <span>{col.icon}</span>
                    <span className="font-syne font-black text-sm" style={{ color: col.color }}>{col.label}</span>
                  </div>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                    style={{ background: col.color, color: "#fff" }}>
                    {colOrders.length}
                  </span>
                </div>
                {/* Cards */}
                {colOrders.length === 0 ? (
                  <div className="text-center py-8 text-xs rounded-2xl border-2 border-dashed"
                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
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
        /* ── VISTA LISTA ── */
        <div className="flex flex-col gap-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-sm" style={{ color: "var(--muted)" }}>Sin pedidos que mostrar</div>
          ) : (
            filtered.map(o => (
              <OrderCard key={o.id} order={o} drivers={drivers}
                onStatusChange={changeStatus} onAssignDriver={assignDriver} />
            ))
          )}
        </div>
      )}
    </div>
  );
}