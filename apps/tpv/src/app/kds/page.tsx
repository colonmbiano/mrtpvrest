"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

const EMPLOYEE_TOKEN_KEY = "tpv-employee-token";
const EMPLOYEE_DATA_KEY = "tpv-employee";

const STATIONS = [
  { value: "KITCHEN", label: "🍳 COCINA",   color: "#ef4444" },
  { value: "BAR",     label: "🍹 BARRA",    color: "#3b82f6" },
  { value: "FRYER",   label: "🍟 FREIDORA", color: "#f97316" },
];

const ORDER_TYPES: Record<string, string> = {
  DELIVERY: "🛵", DINE_IN: "🪑", TAKEOUT: "🥡",
};

function getUrgency(mins: number) {
  if (mins >= 15) return { color: "#ef4444", label: "URGENTE",  bg: "rgba(239,68,68,0.18)" };
  if (mins >= 8)  return { color: "#f59e0b", label: "DEMORADO", bg: "rgba(245,158,11,0.15)" };
  return               { color: "#22c55e", label: "OK",        bg: "rgba(34,197,94,0.10)" };
}

export default function KDSPage() {
  const router = useRouter();
  const [station, setStation]   = useState("KITCHEN");
  const [orders, setOrders]     = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [now, setNow]           = useState(Date.now());
  const [msgModal, setMsgModal] = useState<any>(null);
  const [msgText, setMsgText]   = useState("");
  const [sending, setSending]   = useState(false);
  const [employee, setEmployee] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const prevIds = useRef<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Verificar que hay un empleado KITCHEN logueado
  useEffect(() => {
    const token = localStorage.getItem(EMPLOYEE_TOKEN_KEY) || localStorage.getItem("accessToken");
    const restId = localStorage.getItem("restaurantId");
    const locId = localStorage.getItem("locationId");
    if (!restId || !locId) { router.replace("/setup"); return; }

    const empRaw = localStorage.getItem("kdsEmployee") || localStorage.getItem(EMPLOYEE_DATA_KEY);
    if (!token || !empRaw) {
      setAuthError("Esta pantalla necesita una sesion de cocina activa. Vuelve al TPV y desbloquea con el PIN.");
      setLoading(false);
      return;
    }

    try {
      const parsedEmployee = JSON.parse(empRaw);
      if (parsedEmployee?.role && parsedEmployee.role !== "KITCHEN") {
        setAuthError("La sesion activa no corresponde a cocina.");
        setLoading(false);
        return;
      }

      localStorage.setItem("accessToken", token);
      localStorage.setItem("kdsEmployee", JSON.stringify(parsedEmployee));
      setEmployee(parsedEmployee);
      setAuthReady(true);
    } catch {
      setAuthError("No pudimos recuperar la sesion del empleado de cocina.");
      setLoading(false);
      return;
    }

    audioRef.current = new Audio("/notification.mp3");
  }, [router]);

  // Timer cada 30s para actualizar tiempos
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  function playSound() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch {}
  }

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/kds/orders/${station}`);
      const newIds = data.map((o: any) => o.id);
      if (prevIds.current.length > 0 && newIds.some((id: string) => !prevIds.current.includes(id))) {
        playSound();
      }
      prevIds.current = newIds;
      setOrders(data);
    } catch {} finally { setLoading(false); }
  }, [station]);

  useEffect(() => {
    if (!authReady) return;
    setLoading(true);
    fetchOrders();
    const t = setInterval(fetchOrders, 12000);
    return () => clearInterval(t);
  }, [authReady, fetchOrders]);

  async function toggleItem(orderId: string, itemId: string, done: boolean) {
    try {
      await api.put(`/api/kds/item/${itemId}/done`, { station, orderId, done: !done });
      setOrders(prev => prev.map(order => {
        if (order.id !== orderId) return order;
        const items = order.items.map((i: any) =>
          i.id === itemId ? { ...i, done: !done } : i
        );
        return { ...order, items, allDone: items.every((i: any) => i.done) };
      }));
    } catch {}
  }

  async function markReady(orderId: string) {
    try {
      await api.put(`/api/kds/order/${orderId}/ready`);
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch {}
  }

  async function sendMessage() {
    if (!msgText.trim() || !msgModal) return;
    setSending(true);
    try {
      await api.post("/api/kds/message", { orderId: msgModal.id, station, message: msgText.trim() });
      setMsgModal(null); setMsgText("");
    } catch {} finally { setSending(false); }
  }

  function logout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
    localStorage.removeItem(EMPLOYEE_DATA_KEY);
    localStorage.removeItem("kdsEmployee");
    router.replace("/");
  }

  const stationInfo = STATIONS.find(s => s.value === station)!;

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
            {STATIONS.map(s => (
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
              .sort((a: any, b: any) => b.waitMinutes - a.waitMinutes)
              .map((order: any) => {
                const mins = Math.floor((now - new Date(order.createdAt).getTime()) / 60000);
                const urg = getUrgency(mins);
                const allDone = order.items.every((i: any) => i.done);
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
                      {order.items.map((item: any) => (
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
                      <button onClick={() => { setMsgModal(order); setMsgText(""); }}
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

      {/* ── MODAL MENSAJE AL TPV ───────────────────────────────────── */}
      {msgModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/90">
          <div className="w-full max-w-md rounded-2xl border border-white/5 overflow-hidden bg-[#111]">
            <div className="px-6 py-4 border-b border-white/5 bg-[#0a0a0a] flex items-center justify-between">
              <div>
                <div className="font-black text-base text-yellow-400">📢 Avisar al TPV</div>
                <div className="text-xs text-white/30 mt-0.5">{msgModal.orderNumber} · {stationInfo.label}</div>
              </div>
              <button onClick={() => setMsgModal(null)}
                className="w-8 h-8 rounded-xl bg-white/5 text-white/30 flex items-center justify-center">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {["Falta ingrediente", "Platillo agotado", "Orden va a tardar", "Error en la orden", "Necesito confirmación", "Pedido listo pronto"].map(msg => (
                  <button key={msg} onClick={() => setMsgText(msg)}
                    className="py-2.5 px-3 rounded-xl text-xs font-bold text-left transition-all"
                    style={{
                      background: msgText === msg ? "rgba(245,158,11,0.15)" : "#1a1a1a",
                      color: msgText === msg ? "#f59e0b" : "#555",
                      border: `1px solid ${msgText === msg ? "#f59e0b44" : "#222"}`,
                    }}>
                    {msg}
                  </button>
                ))}
              </div>
              <textarea value={msgText} onChange={e => setMsgText(e.target.value)}
                placeholder="O escribe un mensaje..."
                rows={2}
                className="w-full px-4 py-3 rounded-xl text-sm bg-black border border-white/5 text-white outline-none resize-none" />
              <div className="flex gap-3">
                <button onClick={() => setMsgModal(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-white/5 text-white/30">
                  Cancelar
                </button>
                <button onClick={sendMessage} disabled={sending || !msgText.trim()}
                  className="flex-[2] py-3 rounded-xl font-black text-sm transition-all"
                  style={{
                    background: msgText.trim() ? "#f59e0b" : "#1a1a1a",
                    color: msgText.trim() ? "#000" : "#333",
                  }}>
                  {sending ? "Enviando..." : "📢 Enviar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
