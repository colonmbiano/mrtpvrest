"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ORDER_TYPES, STATIONS, getUrgency, type Station } from "./_lib/kds";
import { useKDSAuth } from "./_hooks/useKDSAuth";
import { useKDSOrders, type KDSOrder } from "./_hooks/useKDSOrders";
import MessageModal from "./_components/MessageModal";

export default function KDSPage() {
  const router = useRouter();
  const { employee, authReady, authError, logout } = useKDSAuth();
  const [station, setStation] = useState<string>("KITCHEN");
  const { orders, loading, fetchOrders, toggleItem, markReady } = useKDSOrders(station, authReady);
  const [now, setNow] = useState(Date.now());
  const [msgModal, setMsgModal] = useState<KDSOrder | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const stationInfo: Station = STATIONS.find((s) => s.value === station) ?? STATIONS[0];

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-6 text-white">
        <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#111] p-8 text-center shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-red-400">KDS bloqueado</p>
          <h1 className="mt-4 text-3xl font-black">Sesion no disponible</h1>
          <p className="mt-4 text-sm leading-6 text-white/60">{authError}</p>
          <button
            onClick={() => router.replace("/")}
            className="mt-8 w-full rounded-2xl bg-red-500 px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-white"
          >
            Volver al TPV
          </button>
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-sm font-black uppercase tracking-[0.3em] text-white/40">
          Cargando cocina...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-black text-white font-mono select-none">
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-[#0a0a0a] flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-black text-base tracking-tight" style={{ color: stationInfo.color }}>
            {stationInfo.label}
          </span>
          <span className="text-xs text-white/20 font-black">|</span>
          <div className="flex gap-2">
            {STATIONS.map((s) => (
              <button key={s.value} onClick={() => setStation(s.value)}
                className="px-4 py-1.5 rounded-xl text-xs font-black transition-all"
                style={{
                  background: station === s.value ? s.color : "#111",
                  color: station === s.value ? "#000" : "#555",
                  border: `1px solid ${station === s.value ? s.color : "#222"}`,
                }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-black text-white/20">
            {new Date(now).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <div className="px-3 py-1.5 rounded-xl text-xs font-black bg-white/5 border border-white/5"
            style={{ color: stationInfo.color }}>
            {orders.length} pedidos
          </div>
          <button onClick={fetchOrders}
            className="w-8 h-8 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-sm">
            🔄
          </button>
          {employee && (
            <button onClick={logout}
              className="px-3 py-1.5 rounded-xl text-xs font-black bg-red-500/10 border border-red-500/20 text-red-400">
              🔒 {employee.name?.split(" ")[0]}
            </button>
          )}
        </div>
      </header>

      {/* ── GRID DE PEDIDOS ────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-3xl animate-pulse text-white/20">Cargando...</div>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
            <div className="text-8xl">✓</div>
            <div className="text-2xl font-black text-white/20 uppercase tracking-widest">
              Cocina al día
            </div>
            <div className="text-xs text-white/10 uppercase tracking-[0.3em]">
              Sin pedidos pendientes
            </div>
          </div>
        ) : (
          <div className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {[...orders]
              .sort((a, b) => b.waitMinutes - a.waitMinutes)
              .map((order) => {
                const mins = Math.floor((now - new Date(order.createdAt).getTime()) / 60000);
                const urg = getUrgency(mins);
                const allDone = order.items.every((i) => i.done);
                return (
                  <div key={order.id}
                    className="rounded-2xl overflow-hidden flex flex-col"
                    style={{
                      background: "#111",
                      border: `2px solid ${allDone ? "#22c55e" : urg.color}`,
                      boxShadow: allDone
                        ? "0 0 24px rgba(34,197,94,0.2)"
                        : mins >= 15 ? "0 0 24px rgba(239,68,68,0.25)" : "none",
                    }}>

                    {/* Cabecera tarjeta */}
                    <div className="px-4 py-3 flex items-center justify-between"
                      style={{ background: allDone ? "rgba(34,197,94,0.08)" : urg.bg }}>
                      <div>
                        <div className="font-black text-2xl leading-none"
                          style={{ color: allDone ? "#22c55e" : urg.color }}>
                          {order.orderNumber}
                        </div>
                        <div className="text-xs mt-1 text-white/40">
                          {ORDER_TYPES[order.orderType] || ""}
                          {order.tableNumber ? ` Mesa ${order.tableNumber}` : ""}
                          {order.customerName ? ` · ${order.customerName}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-3xl leading-none"
                          style={{ color: allDone ? "#22c55e" : urg.color }}>
                          {mins}m
                        </div>
                        <div className="text-xs font-black mt-1"
                          style={{ color: allDone ? "#22c55e" : urg.color }}>
                          {allDone ? "✓ LISTO" : urg.label}
                        </div>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="flex-1 p-3 flex flex-col gap-2">
                      {order.items.map((item) => (
                        <button key={item.id}
                          onClick={() => toggleItem(order.id, item.id, item.done)}
                          className="flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all active:scale-95"
                          style={{
                            background: item.done ? "rgba(34,197,94,0.06)" : "#1a1a1a",
                            border: `1px solid ${item.done ? "#22c55e33" : "#2a2a2a"}`,
                            opacity: item.done ? 0.65 : 1,
                          }}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-black text-sm"
                            style={{
                              background: item.done ? "#22c55e" : "#2a2a2a",
                              color: item.done ? "#000" : stationInfo.color,
                            }}>
                            {item.done ? "✓" : item.quantity}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm truncate"
                              style={{
                                color: item.done ? "#555" : "#fff",
                                textDecoration: item.done ? "line-through" : "none",
                              }}>
                              {item.name || item.menuItem?.name}
                            </div>
                            {item.notes && (
                              <div className="text-xs mt-0.5 font-bold" style={{ color: "#f59e0b" }}>
                                ⚠ {item.notes}
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Acciones */}
                    <div className="px-3 pb-3 flex gap-2">
                      <button onClick={() => setMsgModal(order)}
                        className="flex-1 py-3 rounded-xl text-xs font-black border border-yellow-500/20 bg-yellow-500/5 text-yellow-400">
                        📢 Avisar
                      </button>
                      <button onClick={() => markReady(order.id)}
                        className="flex-[2] py-3 rounded-xl text-sm font-black transition-all active:scale-95"
                        style={{
                          background: allDone ? "#22c55e" : "#1a1a1a",
                          color: allDone ? "#000" : "#444",
                          border: `1px solid ${allDone ? "#22c55e" : "#2a2a2a"}`,
                        }}>
                        {allDone ? "✓  LISTO" : "Marcar listo"}
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </main>

      {msgModal && (
        <MessageModal
          order={msgModal}
          stationLabel={stationInfo.label}
          station={station}
          onClose={() => setMsgModal(null)}
        />
      )}
    </div>
  );
}
