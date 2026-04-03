"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

const STATIONS = [
  { value:"KITCHEN", label:"🍳 COCINA",   color:"#ef4444" },
  { value:"BAR",     label:"🍹 BARRA",    color:"#3b82f6" },
  { value:"FRYER",   label:"🍟 FREIDORA", color:"#f97316" },
];

const URGENCY = (mins: number) => {
  if (mins >= 15) return { color:"#ef4444", bg:"rgba(239,68,68,0.15)", label:"URGENTE" };
  if (mins >= 8)  return { color:"#f59e0b", bg:"rgba(245,158,11,0.15)", label:"DEMORADO" };
  return           { color:"#22c55e", bg:"rgba(34,197,94,0.1)",  label:"OK" };
};

const ORDER_TYPES: Record<string,string> = {
  DELIVERY:"🛵 Delivery", DINE_IN:"🪑 Mesa", TAKEOUT:"🥡 Para llevar"
};

export default function KDSPage() {
  const { theme, toggle } = useTheme();
  const [station, setStation]     = useState("KITCHEN");
  const [orders, setOrders]       = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [msgModal, setMsgModal]   = useState<any>(null);
  const [msgText, setMsgText]     = useState("");
  const [sending, setSending]     = useState(false);
  const [now, setNow]             = useState(Date.now());
  const prevOrderIds              = useRef<string[]>([]);
  const audioRef                  = useRef<HTMLAudioElement|null>(null);

  // Actualizar timer cada 30s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/kds/orders/${station}`);
      // Detectar nuevos pedidos y reproducir sonido
      const newIds = data.map((o: any) => o.id);
      const hasNew = newIds.some((id: string) => !prevOrderIds.current.includes(id));
      if (hasNew && prevOrderIds.current.length > 0) {
        playSound();
      }
      prevOrderIds.current = newIds;
      setOrders(data);
    } catch {} finally { setLoading(false); }
  }, [station]);

  useEffect(() => {
    fetchOrders();
    const t = setInterval(fetchOrders, 15000);
    return () => clearInterval(t);
  }, [fetchOrders]);

  function playSound() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch {}
  }

  async function toggleItem(orderId: string, itemId: string, done: boolean) {
    try {
      await api.put(`/api/kds/item/${itemId}/done`, { station, orderId, done: !done });
      setOrders(prev => prev.map(order => {
        if (order.id !== orderId) return order;
        const updatedItems = order.items.map((item: any) =>
          item.id === itemId ? { ...item, done: !done } : item
        );
        return {
          ...order,
          items: updatedItems,
          allDone: updatedItems.every((i: any) => i.done)
        };
      }));
    } catch {}
  }

  async function markOrderReady(orderId: string) {
    try {
      await api.put(`/api/kds/order/${orderId}/ready`);
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch {}
  }

  async function sendMessage() {
    if (!msgText.trim() || !msgModal) return;
    setSending(true);
    try {
      await api.post("/api/kds/message", {
        orderId: msgModal.id,
        station,
        message: msgText.trim()
      });
      setMsgModal(null); setMsgText("");
      alert("✅ Mensaje enviado al TPV");
    } catch { alert("Error al enviar"); }
    finally { setSending(false); }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  }

  const stationInfo = STATIONS.find(s => s.value === station)!;

  return (
    <div className="min-h-screen flex flex-col"
      style={{background:"var(--bg)", fontFamily:"'JetBrains Mono', 'Courier New', monospace"}}>

      {/* Header KDS */}
      <div className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
        style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="font-black text-lg" style={{color:"var(--gold)"}}>
            Master Burger's
          </div>
          <div className="w-px h-6" style={{background:"#333"}} />
          {/* Selector estación */}
          <div className="flex gap-2">
            {STATIONS.map(s => (
              <button key={s.value} onClick={() => setStation(s.value)}
                className="px-4 py-1.5 rounded-xl text-sm font-black transition-all"
                style={{
                  background: station===s.value ? s.color : "var(--surf2)",
                  color: station===s.value ? "#fff" : "var(--muted)",
                  border:`1px solid ${station===s.value ? s.color : "var(--border)"}`
                }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Reloj */}
          <div className="text-sm font-black" style={{color:"#555"}}>
            {new Date(now).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}
          </div>
          {/* Contador */}
          <div className="px-3 py-1.5 rounded-xl text-sm font-black"
            style={{background:"var(--surf2)",color:"var(--gold)",border:"1px solid var(--border)"}}>
            {orders.length} pedidos
          </div>
          {/* Fullscreen */}
          <button onClick={toggleFullscreen}
            className="px-3 py-1.5 rounded-xl text-sm"
            style={{background:"var(--surf2)",color:"var(--muted)",border:"1px solid var(--border)"}}>
            {fullscreen ? "⊡" : "⊞"}
          </button>
          {/* Tema */}
          <button onClick={toggle}
            className="px-3 py-1.5 rounded-xl text-sm"
            style={{background:"var(--surf2)",color:"var(--muted)",border:"1px solid var(--border)"}}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          {/* Actualizar */}
          <button onClick={fetchOrders}
            className="px-3 py-1.5 rounded-xl text-sm font-bold"
            style={{background:"var(--surf2)",color:"var(--muted)",border:"1px solid var(--border)"}}>
            🔄
          </button>
        </div>
      </div>

      {/* Grid de pedidos */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-2xl animate-pulse" style={{color:"var(--muted)"}}>Cargando...</div>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="text-6xl" style={{color:"var(--border)"}}>✓</div>
            <div className="text-xl font-black" style={{color:"var(--muted)"}}>Sin pedidos pendientes</div>
            <div className="text-sm" style={{color:"var(--muted)"}}>La cocina está al día</div>
          </div>
        ) : (
          <div className="grid gap-4"
            style={{gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))"}}>
            {orders
              .sort((a: any, b: any) => b.waitMinutes - a.waitMinutes)
              .map((order: any) => {
                const mins  = Math.floor((now - new Date(order.createdAt).getTime()) / 60000);
                const urg   = URGENCY(mins);
                const allDone = order.items.every((i: any) => i.done);
                return (
                  <div key={order.id}
                    className="rounded-2xl overflow-hidden flex flex-col"
                    style={{
                      background:"var(--surf)",
                      border:`2px solid ${allDone ? "#22c55e" : urg.color}`,
                      boxShadow: allDone ? "0 0 20px rgba(34,197,94,0.2)" : mins>=15 ? "0 0 20px rgba(239,68,68,0.2)" : "none"
                    }}>
                    {/* Header tarjeta */}
                    <div className="px-4 py-3 flex items-center justify-between"
                      style={{background: allDone ? "rgba(34,197,94,0.1)" : urg.bg}}>
                      <div>
                        <div className="font-black text-xl" style={{color: allDone ? "#22c55e" : urg.color}}>
                          {order.orderNumber}
                        </div>
                        <div className="text-xs mt-0.5" style={{color:"#666"}}>
                          {ORDER_TYPES[order.orderType] || order.orderType}
                          {order.tableNumber && ` · Mesa ${order.tableNumber}`}
                          {order.customerName && ` · ${order.customerName}`}
                        </div>
                      </div>
                      <div className="text-right">
                        {/* Timer */}
                        <div className="font-black text-2xl" style={{color: allDone ? "#22c55e" : urg.color}}>
                          {mins}m
                        </div>
                        <div className="text-xs font-bold" style={{color: allDone ? "#22c55e" : urg.color}}>
                          {allDone ? "✓ LISTO" : urg.label}
                        </div>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="flex-1 p-3 flex flex-col gap-2">
                      {order.items.map((item: any) => (
                        <button key={item.id}
                          onClick={() => toggleItem(order.id, item.id, item.done)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-95"
                          style={{
                            background: item.done ? "rgba(34,197,94,0.08)" : "var(--surf2)",
                            border:`1px solid ${item.done ? "#22c55e" : "var(--border)"}`,
                            opacity: item.done ? 0.7 : 1,
                          }}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-black text-sm"
                            style={{
                              background: item.done ? "#22c55e" : "#2a2a2a",
                              color: item.done ? "#000" : "#f5a623"
                            }}>
                            {item.done ? "✓" : item.quantity}
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-sm"
                              style={{color: item.done ? "var(--muted)" : "var(--text)",
                                textDecoration: item.done ? "line-through" : "none"}}>
                              {item.name || item.menuItem?.name}
                            </div>
                            {item.notes && (
                              <div className="text-xs mt-0.5" style={{color:"#f5a623"}}>
                                *** {item.notes} ***
                              </div>
                            )}
                          </div>
                          {!item.done && (
                            <div className="text-xs px-2 py-1 rounded-lg flex-shrink-0"
                              style={{background:"var(--surf2)",color:"var(--muted)"}}>
                              tap
                            </div>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Footer — acciones */}
                    <div className="px-3 pb-3 flex gap-2">
                      <button onClick={() => { setMsgModal(order); setMsgText(""); }}
                        className="flex-1 py-2.5 rounded-xl text-xs font-black"
                        style={{background:"#1a1a1a",color:"#f59e0b",border:"1px solid #333"}}>
                        📢 Avisar TPV
                      </button>
                      {allDone ? (
                        <button onClick={() => markOrderReady(order.id)}
                          className="flex-1 py-2.5 rounded-xl text-xs font-black"
                          style={{background:"#22c55e",color:"#000"}}>
                          ✓ LISTO
                        </button>
                      ) : (
                        <button onClick={() => markOrderReady(order.id)}
                          className="flex-1 py-2.5 rounded-xl text-xs font-bold"
                          style={{background:"var(--surf2)",color:"var(--muted)",border:"1px solid var(--border)"}}>
                          Marcar listo
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Modal mensaje al TPV */}
      {msgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{background:"rgba(0,0,0,0.92)"}}>
          <div className="w-full max-w-md rounded-2xl border overflow-hidden"
            style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <div className="px-6 py-4 border-b flex items-center justify-between"
              style={{borderColor:"var(--border)",background:"var(--surf2)"}}>
              <div>
                <div className="font-black text-lg" style={{color:"#f5a623"}}>📢 Avisar al TPV</div>
                <div className="text-xs" style={{color:"#555"}}>{msgModal.orderNumber} · {stationInfo.label}</div>
              </div>
              <button onClick={() => setMsgModal(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{background:"#1a1a1a",color:"#555"}}>✕</button>
            </div>
            <div className="p-6">
              {/* Mensajes rápidos */}
              <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"#555"}}>
                Mensajes rápidos
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  "Falta ingrediente",
                  "Platillo agotado",
                  "Orden va a tardar",
                  "Error en la orden",
                  "Necesito confirmación",
                  "Pedido listo pronto",
                ].map(msg => (
                  <button key={msg} onClick={() => setMsgText(msg)}
                    className="py-2 px-3 rounded-xl text-xs font-bold text-left"
                    style={{
                      background: msgText===msg ? "rgba(245,166,35,0.15)" : "var(--surf2)",
                      color: msgText===msg ? "var(--gold)" : "var(--muted)",
                      border:`1px solid ${msgText===msg ? "var(--gold)" : "var(--border)"}`
                    }}>
                    {msg}
                  </button>
                ))}
              </div>
              <textarea value={msgText} onChange={e => setMsgText(e.target.value)}
                placeholder="O escribe un mensaje personalizado..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none mb-4"
                style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
              <div className="flex gap-3">
                <button onClick={() => setMsgModal(null)}
                  className="flex-1 py-3 rounded-xl font-bold"
                  style={{background:"var(--surf2)",color:"var(--muted)",border:"1px solid var(--border)"}}>
                  Cancelar
                </button>
                <button onClick={sendMessage} disabled={sending || !msgText.trim()}
                  className="flex-1 py-3 rounded-xl font-black"
                  style={{background: msgText.trim() ? "#f5a623" : "#1a1a1a", color: msgText.trim() ? "#000" : "#555"}}>
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