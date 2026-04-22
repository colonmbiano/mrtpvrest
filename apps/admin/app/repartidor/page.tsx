"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";
import GPSTracker from "@/components/delivery/GPSTracker";

const STATUS_LABELS: Record<string, string> = {
  PENDING:"Pendiente", CONFIRMED:"Confirmado", PREPARING:"Preparando",
  READY:"Listo para recoger", ON_THE_WAY:"En camino", DELIVERED:"Entregado", CANCELLED:"Cancelado",
};
const STATUS_COLORS: Record<string, string> = {
  PENDING:"#f59e0b", CONFIRMED:"#3b82f6", PREPARING:"#8b5cf6",
  READY:"#22c55e", ON_THE_WAY:"#f97316", DELIVERED:"#6b7280", CANCELLED:"#ef4444",
};
const EXPENSE_CATS = [
  { value:"GASOLINE",           label:"⛽ Gasolina",          color:"#f97316" },
  { value:"EMERGENCY_PURCHASE", label:"🛒 Compra emergencia", color:"#8b5cf6" },
  { value:"OTHER",              label:"📝 Otro gasto",         color:"#6b7280" },
];

type Screen = "login"|"home"|"detail"|"chat"|"history"|"cobrar"|"caja"|"gasto"|"weekly";

async function subscribePush(driverId: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    });
    await api.post("/api/notifications/subscribe", { subscription: sub, driverId, type: "DRIVER" });
  } catch {}
}

export default function DeliveryApp() {
  const [mounted, setMounted]   = useState(false);
  const [screen, setScreen]     = useState<Screen>("login");
  const [driver, setDriver]     = useState<any>(null);
  const [orders, setOrders]     = useState<any[]>([]);
  const [history, setHistory]   = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg]     = useState("");
  const [sending, setSending]   = useState(false);
  const [prevOrderCount, setPrevOrderCount] = useState(0);

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn]   = useState(false);

  const [payMethod, setPayMethod]   = useState<"CASH"|"TRANSFER">("CASH");
  const [cashReceived, setCashReceived] = useState("");

  const [cashSummary, setCashSummary] = useState<any>(null);
  const [movements, setMovements]     = useState<any[]>([]);
  const [loadingCash, setLoadingCash] = useState(false);

  const [expenseCat, setExpenseCat]   = useState("GASOLINE");
  const [expenseAmt, setExpenseAmt]   = useState("");
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expensePhoto, setExpensePhoto] = useState<string|null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [orderDetail, setOrderDetail] = useState<any>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement|null>(null);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);
    window.addEventListener('online',  () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));
    audioRef.current = new Audio('/notification.mp3');
  }, []);

  const fetchOrders = useCallback(async (d?: any) => {
    const id = (d || driver)?.id; if (!id) return;
    try {
      const { data } = await api.get(`/api/delivery/${id}/orders`);
      if (data.length > prevOrderCount && prevOrderCount > 0) {
        audioRef.current?.play().catch(() => {});
        if (Notification.permission === "granted") {
          new Notification("🛵 Nuevo pedido asignado", {
            body: `Tienes ${data.length - prevOrderCount} pedido(s) nuevo(s)`,
            icon: "/logo.png",
          });
        }
      }
      setPrevOrderCount(data.length);
      setOrders(data);
    } catch {}
  }, [driver, prevOrderCount]);

  const fetchHistory = useCallback(async () => {
    if (!driver) return;
    try { const { data } = await api.get(`/api/delivery/${driver.id}/history`); setHistory(data); } catch {}
  }, [driver]);

  const fetchCash = useCallback(async () => {
    if (!driver) return;
    setLoadingCash(true);
    try {
      const { data } = await api.get(`/api/driver-cash/${driver.id}/movements`);
      setMovements(data.movements || []);
      setCashSummary(data.summary || {});
    } catch {} finally { setLoadingCash(false); }
  }, [driver]);

  const fetchMessages = useCallback(async (orderId: string) => {
    try {
      const { data } = await api.get(`/api/delivery/orders/${orderId}/messages`);
      setMessages(data);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior:"smooth" }), 100);
    } catch {}
  }, []);

  const fetchOrderDetail = useCallback(async (orderId: string) => {
    try {
      const { data } = await api.get(`/api/orders/${orderId}`);
      setOrderDetail(data);
    } catch {}
  }, []);

  useEffect(() => {
    if (driver) {
      fetchOrders(); fetchHistory();
      if (Notification.permission === "default") Notification.requestPermission();
      subscribePush(driver.id);
      const t = setInterval(() => fetchOrders(), 15000);
      return () => clearInterval(t);
    }
  }, [driver]);

  useEffect(() => {
    if (screen === "chat" && selectedOrder) {
      fetchMessages(selectedOrder.id);
      const t = setInterval(() => fetchMessages(selectedOrder.id), 5000);
      return () => clearInterval(t);
    }
  }, [screen, selectedOrder]);

  useEffect(() => { if (screen === "caja") fetchCash(); }, [screen]);
  useEffect(() => { if (screen === "weekly") fetchHistory(); }, [screen]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoggingIn(true);
    try {
      const { data } = await api.post("/api/delivery/login", { email, password });
      setDriver(data.driver); setLoginError("");
      fetchOrders(data.driver); setScreen("home");
    } catch { setLoginError("Credenciales incorrectas"); }
    finally { setLoggingIn(false); }
  }

  // ── CAMBIAR ESTADO con flujo de efectivo pendiente ────────────────────
  async function changeStatus(order: any, status: string, method?: string) {
    try {
      const isCash = method === "CASH" || payMethod === "CASH";

      if (status === "DELIVERED" && isCash) {
        // Confirmar entrega sin cerrar cobro — efectivo pendiente al cierre de turno
        const { data } = await api.put(`/api/delivery/${driver.id}/orders/${order.id}/deliver`);
        setSelectedOrder(data);
        // Registrar en caja del repartidor como pendiente
        await api.post(`/api/driver-cash/${driver.id}/collect`, {
          orderId: order.id,
          amount: Number(order.total),
          orderNumber: order.orderNumber,
          pending: true,
        }).catch(() => {}); // no bloquear si falla
        fetchOrders();
        setScreen("home");
        return;
      }

      // Flujo normal (transferencia u otros estados)
      const { data } = await api.put(`/api/delivery/${driver.id}/orders/${order.id}/status`, {
        status, ...(method ? { paymentMethod: method } : {})
      });
      setSelectedOrder(data);
      fetchOrders();
      if (status === "DELIVERED") setScreen("home");
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
  }

  async function sendMessage() {
    if (!newMsg.trim() || !selectedOrder) return;
    setSending(true);
    try {
      await api.post(`/api/delivery/orders/${selectedOrder.id}/messages`, { message: newMsg.trim(), fromDriver: true });
      setNewMsg(""); fetchMessages(selectedOrder.id);
    } catch {} finally { setSending(false); }
  }

  async function saveExpense() {
    if (!expenseAmt || Number(expenseAmt) <= 0) { alert("Ingresa el monto"); return; }
    setSavingExpense(true);
    try {
      const formData = new FormData();
      formData.append("type", "EXPENSE");
      formData.append("category", expenseCat);
      formData.append("amount", expenseAmt);
      formData.append("description", expenseDesc);
      if (expensePhoto) {
        const blob = await fetch(expensePhoto).then(r => r.blob());
        formData.append("photo", blob, "receipt.jpg");
      }
      await api.post(`/api/driver-cash/${driver.id}/movements`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setExpenseAmt(""); setExpenseDesc(""); setExpensePhoto(null); setExpenseCat("GASOLINE");
      alert("✅ Gasto registrado");
      setScreen("caja");
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setSavingExpense(false); }
  }

  function capturePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setExpensePhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  const todayDelivered = history.filter(o => o.status === "DELIVERED").length;
  const todayEarnings  = history.filter(o => o.status === "DELIVERED").reduce((s: number, o: any) => s + Number(o.total), 0);
  const change = cashReceived ? (Number(cashReceived) - (selectedOrder?.total || 0)) : 0;
  const activeOrders = orders.filter(o => !["DELIVERED","CANCELLED"].includes(o.status));

  if (!mounted) return null;

  // ══════════════════════════════════
  // LOGIN
  // ══════════════════════════════════
  if (screen === "login") return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{background:"var(--bg)"}}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🛵</div>
          <h1 className="font-syne text-3xl font-black">App Repartidor</h1>
          <p className="text-sm mt-1" style={{color:"var(--muted)"}}>Master Burger&apos;s</p>
        </div>
        <form onSubmit={handleLogin} className="rounded-2xl border p-6" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
          <div className="mb-4">
            <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>Teléfono</label>
            <input value={email} onChange={e => setEmail(e.target.value)} required placeholder="Tu número"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>PIN</label>
            <input value={password} onChange={e => setPassword(e.target.value)} required type="password" placeholder="••••"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
          </div>
          {loginError && <p className="text-xs mb-3 text-center" style={{color:"#ef4444"}}>{loginError}</p>}
          <button type="submit" disabled={loggingIn}
            className="w-full py-3 rounded-xl font-syne font-black text-lg"
            style={{background:"var(--gold)",color:"#000"}}>
            {loggingIn ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );

  // ══════════════════════════════════
  // HOME
  // ══════════════════════════════════
  if (screen === "home") return (
    <div className="min-h-screen flex flex-col" style={{background:"var(--bg)"}}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <div className="flex items-center gap-3">
          {driver?.photo
            ? <img src={driver.photo} alt="" className="w-10 h-10 rounded-full object-cover border-2" style={{borderColor:"var(--gold)"}} />
            : <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{background:"var(--surf2)"}}>🛵</div>
          }
          <div>
            <h1 className="font-syne font-black">{driver?.name}</h1>
            <p className="text-xs" style={{color: isOnline ? "#22c55e" : "#ef4444"}}>{isOnline ? "● En línea" : "● Sin conexión"}</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => { fetchHistory(); setScreen("weekly"); }}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold border"
            style={{borderColor:"var(--border)",color:"var(--muted)"}}>📊</button>
          <button onClick={() => { fetchHistory(); setScreen("history"); }}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold border"
            style={{borderColor:"var(--border)",color:"var(--muted)"}}>📋</button>
          <button onClick={() => setScreen("caja")}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold"
            style={{background:"rgba(34,197,94,0.1)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.2)"}}>💵</button>
          <button onClick={() => {
            if (activeOrders.length > 0) { alert(`Tienes ${activeOrders.length} pedido(s) pendiente(s).`); return; }
            if (confirm("¿Cerrar sesión?")) {
              setDriver(null); setOrders([]); setHistory([]);
              setScreen("login"); setEmail(""); setPassword("");
            }
          }}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold"
            style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.2)"}}>🔒</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 py-3">
        <div className="rounded-2xl p-3" style={{background:"var(--surf)",border:"1px solid var(--border)"}}>
          <div className="text-xs font-bold mb-0.5" style={{color:"var(--muted)"}}>Entregas hoy</div>
          <div className="text-2xl font-black" style={{color:"var(--gold)"}}>{todayDelivered}</div>
        </div>
        <div className="rounded-2xl p-3" style={{background:"var(--surf)",border:"1px solid var(--border)"}}>
          <div className="text-xs font-bold mb-0.5" style={{color:"var(--muted)"}}>Cobrado hoy</div>
          <div className="text-2xl font-black" style={{color:"#22c55e"}}>${todayEarnings.toFixed(0)}</div>
        </div>
      </div>

      <GPSTracker
        driverId={driver.id}
        activeOrderId={orders.find((o:any) => o.status === "ON_THE_WAY")?.id}
      />

      <div className="px-4 mb-3">
        <button onClick={() => setScreen("gasto")}
          className="w-full py-2.5 rounded-2xl font-bold flex items-center justify-center gap-2 text-sm"
          style={{background:"rgba(249,115,22,0.1)",color:"#f97316",border:"1px solid rgba(249,115,22,0.2)"}}>
          ➕ Registrar gasto
        </button>
      </div>

      <div className="flex-1 px-4 pb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-syne font-bold">Mis pedidos ({orders.length})</h2>
          <button onClick={() => fetchOrders()} className="text-xs px-3 py-1.5 rounded-xl"
            style={{background:"var(--surf)",color:"var(--muted)",border:"1px solid var(--border)"}}>🔄</button>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-16" style={{color:"var(--muted)"}}>
            <div className="text-5xl mb-3">🛵</div>
            <div className="text-sm">Sin pedidos asignados</div>
          </div>
        ) : orders.map((order: any) => {
          const sc = STATUS_COLORS[order.status] || "#888";
          return (
            <div key={order.id} className="rounded-2xl border mb-3 overflow-hidden"
              style={{background:"var(--surf)", borderColor: order.status==="ON_THE_WAY" ? "#f97316" : "var(--border)",
                boxShadow: order.status==="READY" ? "0 0 0 2px #22c55e" : "none"}}>
              <div className="px-4 pt-3 pb-2 flex items-start justify-between">
                <div>
                  <div className="font-syne font-black text-lg">{order.orderNumber}</div>
                  <div className="text-sm font-bold">{order.customerName || "Cliente"}</div>
                  {order.customerPhone && (
                    <div className="flex gap-2 mt-1">
                      <a href={`tel:${order.customerPhone}`}
                        className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg"
                        style={{background:"rgba(34,197,94,0.1)",color:"#22c55e"}}>📞 Llamar</a>
                      <a href={`https://wa.me/${order.customerPhone}`} target="_blank" rel="noreferrer"
                        className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg"
                        style={{background:"rgba(34,197,94,0.1)",color:"#22c55e"}}>💬 WhatsApp</a>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-xs px-2 py-1 rounded-full font-bold" style={{background:sc+"18",color:sc}}>
                    {STATUS_LABELS[order.status]}
                  </span>
                  <div className="font-black text-xl mt-1" style={{color:"var(--gold)"}}>${Number(order.total).toFixed(0)}</div>
                  <div className="text-xs mt-0.5" style={{color:"var(--muted)"}}>
                    {order.paymentMethod === "CASH_ON_DELIVERY" ? "💵 Efectivo" : "💳 Online"}
                  </div>
                </div>
              </div>

              {order.deliveryAddress && (
                <div className="px-4 pb-2">
                  <div className="rounded-xl overflow-hidden border" style={{borderColor:"var(--border)"}}>
                    <div className="px-3 py-2 text-xs" style={{background:"var(--surf2)",color:"var(--muted)"}}>
                      📍 {order.deliveryAddress}
                    </div>
                    <div className="flex border-t" style={{borderColor:"var(--border)"}}>
                      <button onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(order.deliveryAddress)}`, '_blank')}
                        className="flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1"
                        style={{color:"#3b82f6"}}>🗺️ Google Maps</button>
                      <div className="w-px" style={{background:"var(--border)"}} />
                      <button onClick={() => window.open(`https://waze.com/ul?q=${encodeURIComponent(order.deliveryAddress)}`, '_blank')}
                        className="flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1"
                        style={{color:"#00c0f3"}}>🚗 Waze</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="px-3 pb-3 flex gap-2">
                <button onClick={() => { setSelectedOrder(order); fetchOrderDetail(order.id); setScreen("detail"); }}
                  className="flex-1 py-2 rounded-xl text-xs font-bold border"
                  style={{borderColor:"var(--border)",color:"var(--muted)"}}>📋 Detalle</button>
                <button onClick={() => { setSelectedOrder(order); setScreen("chat"); }}
                  className="px-3 py-2 rounded-xl text-xs font-bold"
                  style={{background:"rgba(139,92,246,0.1)",color:"#8b5cf6",border:"1px solid rgba(139,92,246,0.2)"}}>💬</button>
                {order.status === "READY" && (
                  <button onClick={() => changeStatus(order, "ON_THE_WAY")}
                    className="flex-1 py-2 rounded-xl text-xs font-black"
                    style={{background:"#f97316",color:"#fff"}}>🛵 En camino</button>
                )}
                {order.status === "ON_THE_WAY" && (
                  <button onClick={() => { setSelectedOrder(order); setPayMethod("CASH"); setCashReceived(""); setScreen("cobrar"); }}
                    className="flex-1 py-2 rounded-xl text-xs font-black"
                    style={{background:"var(--gold)",color:"#000"}}>💵 Entregar</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ══════════════════════════════════
  // DETALLE
  // ══════════════════════════════════
  if (screen === "detail" && selectedOrder) return (
    <div className="min-h-screen flex flex-col" style={{background:"var(--bg)"}}>
      <div className="px-4 py-3 flex items-center gap-3 border-b" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <button onClick={() => setScreen("home")} className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{background:"var(--surf2)",color:"var(--muted)"}}>←</button>
        <div>
          <h1 className="font-syne font-black">{selectedOrder.orderNumber}</h1>
          <p className="text-xs" style={{color:"var(--muted)"}}>{STATUS_LABELS[selectedOrder.status]}</p>
        </div>
      </div>
      <div className="flex-1 p-4 flex flex-col gap-4">
        <div className="rounded-2xl border p-4" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
          <div className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>Cliente</div>
          <div className="font-bold">{selectedOrder.customerName}</div>
          {selectedOrder.customerPhone && (
            <div className="flex gap-2 mt-2">
              <a href={`tel:${selectedOrder.customerPhone}`}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-center"
                style={{background:"rgba(34,197,94,0.1)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.2)"}}>
                📞 {selectedOrder.customerPhone}
              </a>
              <a href={`https://wa.me/${selectedOrder.customerPhone}`} target="_blank" rel="noreferrer"
                className="flex-1 py-2 rounded-xl text-xs font-bold text-center"
                style={{background:"rgba(37,211,102,0.1)",color:"#25d366",border:"1px solid rgba(37,211,102,0.2)"}}>
                💬 WhatsApp
              </a>
            </div>
          )}
        </div>

        {selectedOrder.deliveryAddress && (
          <div className="rounded-2xl border p-4" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <div className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>Dirección</div>
            <p className="text-sm mb-3">{selectedOrder.deliveryAddress}</p>
            <div className="flex gap-2">
              <button onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(selectedOrder.deliveryAddress)}`, '_blank')}
                className="flex-1 py-2.5 rounded-xl text-xs font-black" style={{background:"#3b82f6",color:"#fff"}}>
                🗺️ Google Maps
              </button>
              <button onClick={() => window.open(`https://waze.com/ul?q=${encodeURIComponent(selectedOrder.deliveryAddress)}`, '_blank')}
                className="flex-1 py-2.5 rounded-xl text-xs font-black" style={{background:"#00c0f3",color:"#fff"}}>
                🚗 Waze
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border p-4" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
          <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--muted)"}}>Productos</div>
          {(orderDetail?.items || selectedOrder.items || []).map((item: any) => (
            <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0"
              style={{borderColor:"var(--border)"}}>
              <div>
                <div className="text-sm font-medium">{item.quantity}x {item.name}</div>
                {item.notes && <div className="text-xs mt-0.5" style={{color:"#f97316"}}>⚠️ {item.notes}</div>}
              </div>
              <div className="font-bold text-sm" style={{color:"var(--gold)"}}>${item.subtotal?.toFixed(0)}</div>
            </div>
          ))}
          <div className="flex justify-between mt-3 pt-2 border-t font-black" style={{borderColor:"var(--border)"}}>
            <span>Total</span>
            <span style={{color:"var(--gold)"}}>${Number(selectedOrder.total).toFixed(0)}</span>
          </div>
        </div>

        {selectedOrder.notes && (
          <div className="rounded-2xl border p-4" style={{background:"rgba(249,115,22,0.06)",borderColor:"rgba(249,115,22,0.2)"}}>
            <div className="text-xs font-black uppercase tracking-wider mb-1" style={{color:"#f97316"}}>Notas del cliente</div>
            <p className="text-sm">{selectedOrder.notes}</p>
          </div>
        )}
      </div>
      <div className="p-4 border-t flex gap-2" style={{borderColor:"var(--border)",background:"var(--surf)"}}>
        {selectedOrder.status === "READY" && (
          <button onClick={() => { changeStatus(selectedOrder, "ON_THE_WAY"); setScreen("home"); }}
            className="flex-1 py-3 rounded-xl font-black" style={{background:"#f97316",color:"#fff"}}>🛵 Salir a entregar</button>
        )}
        {selectedOrder.status === "ON_THE_WAY" && (
          <button onClick={() => { setPayMethod("CASH"); setCashReceived(""); setScreen("cobrar"); }}
            className="flex-1 py-3 rounded-xl font-black" style={{background:"var(--gold)",color:"#000"}}>💵 Confirmar entrega</button>
        )}
      </div>
    </div>
  );

  // ══════════════════════════════════
  // COBRAR — nuevo flujo efectivo pendiente
  // ══════════════════════════════════
  if (screen === "cobrar" && selectedOrder) return (
    <div className="min-h-screen flex flex-col" style={{background:"var(--bg)"}}>
      <div className="px-4 py-3 flex items-center gap-3 border-b" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <button onClick={() => setScreen("home")} className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{background:"var(--surf2)",color:"var(--muted)"}}>←</button>
        <h1 className="font-syne font-black text-xl">Confirmar entrega</h1>
      </div>
      <div className="flex-1 p-5">
        <div className="rounded-2xl p-6 text-center mb-5" style={{background:"var(--surf)",border:"1px solid var(--border)"}}>
          <div className="text-sm font-bold mb-1" style={{color:"var(--muted)"}}>Total del pedido</div>
          <div className="text-5xl font-black" style={{color:"var(--gold)"}}>${Number(selectedOrder.total).toFixed(0)}</div>
          <div className="text-xs mt-1" style={{color:"var(--muted)"}}>{selectedOrder.orderNumber} · {selectedOrder.customerName}</div>
        </div>

        <div className="mb-5">
          <div className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>Método de pago</div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setPayMethod("CASH")}
              className="py-4 rounded-2xl text-sm font-black"
              style={{background: payMethod==="CASH" ? "var(--gold)" : "var(--surf)", color: payMethod==="CASH" ? "#000" : "var(--muted)", border:`2px solid ${payMethod==="CASH" ? "var(--gold)" : "var(--border)"}`}}>
              💵 Efectivo
            </button>
            <button onClick={() => setPayMethod("TRANSFER")}
              className="py-4 rounded-2xl text-sm font-black"
              style={{background: payMethod==="TRANSFER" ? "#3b82f6" : "var(--surf)", color: payMethod==="TRANSFER" ? "#fff" : "var(--muted)", border:`2px solid ${payMethod==="TRANSFER" ? "#3b82f6" : "var(--border)"}`}}>
              📱 Transferencia
            </button>
          </div>
        </div>

        {/* Efectivo — calculadora de cambio (opcional, no bloquea) */}
        {payMethod === "CASH" && (
          <div className="mb-5">
            <div className="rounded-2xl p-4 mb-3" style={{background:"rgba(245,166,35,0.08)",border:"1px solid rgba(245,166,35,0.2)"}}>
              <div className="text-xs font-bold" style={{color:"var(--gold)"}}>
                💡 El cobro se confirmará al cierre de turno en caja
              </div>
              <div className="text-xs mt-1" style={{color:"var(--muted)"}}>
                Entrega el efectivo al administrador al finalizar tu turno
              </div>
            </div>
            <div className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>
              Calculadora de cambio (opcional)
            </div>
            <input value={cashReceived} onChange={e => setCashReceived(e.target.value)} type="number" placeholder="¿Con cuánto paga?"
              className="w-full px-4 py-3 rounded-xl text-2xl font-black outline-none text-center"
              style={{background:"var(--surf)",border:"2px solid var(--border)",color:"var(--text)"}} />
            <div className="flex gap-2 mt-2">
              {[50,100,200,500].map(amt => (
                <button key={amt} onClick={() => setCashReceived(String(amt))}
                  className="flex-1 py-2 rounded-xl text-xs font-bold"
                  style={{background:"var(--surf2)",color:"var(--muted)"}}>
                  ${amt}
                </button>
              ))}
            </div>
            {Number(cashReceived) > 0 && (
              <div className="mt-3 p-4 rounded-2xl text-center"
                style={{background: change>=0 ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)"}}>
                <div className="text-xs font-bold mb-1" style={{color: change>=0 ? "#22c55e" : "#ef4444"}}>
                  {change >= 0 ? "Cambio" : "Falta"}
                </div>
                <div className="text-4xl font-black" style={{color: change>=0 ? "#22c55e" : "#ef4444"}}>
                  ${Math.abs(change).toFixed(0)}
                </div>
              </div>
            )}
          </div>
        )}

        {payMethod === "TRANSFER" && (
          <div className="rounded-2xl p-4 mb-5 text-center" style={{background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.2)"}}>
            <div className="text-xs font-bold" style={{color:"#3b82f6"}}>Confirma que recibiste la transferencia antes de continuar</div>
          </div>
        )}
      </div>

      <div className="p-5 border-t" style={{borderColor:"var(--border)",background:"var(--surf)"}}>
        <button
          onClick={() => changeStatus(selectedOrder, "DELIVERED", payMethod)}
          className="w-full py-4 rounded-2xl font-syne font-black text-xl"
          style={{background:"var(--gold)", color:"#000"}}>
          {payMethod === "CASH" ? "✅ Entregado — cobro pendiente" : "✅ Confirmar entrega"}
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════
  // CAJA
  // ══════════════════════════════════
  if (screen === "caja") return (
    <div className="min-h-screen flex flex-col" style={{background:"var(--bg)"}}>
      <div className="px-4 py-3 flex items-center gap-3 border-b" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <button onClick={() => setScreen("home")} className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{background:"var(--surf2)",color:"var(--muted)"}}>←</button>
        <div className="flex-1">
          <h1 className="font-syne font-black text-xl">Mi Caja</h1>
          <p className="text-xs" style={{color:"var(--muted)"}}>Movimientos de hoy</p>
        </div>
        <button onClick={() => setScreen("gasto")} className="px-3 py-2 rounded-xl text-xs font-bold"
          style={{background:"rgba(249,115,22,0.1)",color:"#f97316",border:"1px solid rgba(249,115,22,0.2)"}}>
          ➕ Gasto
        </button>
      </div>
      {loadingCash ? (
        <div className="text-center py-20" style={{color:"var(--muted)"}}>Cargando...</div>
      ) : (
        <div className="p-4">
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-2xl p-3 text-center" style={{background:"var(--surf)",border:"1px solid var(--border)"}}>
              <div className="text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Cobrado</div>
              <div className="text-xl font-black" style={{color:"#22c55e"}}>${(cashSummary?.income || 0).toFixed(0)}</div>
            </div>
            <div className="rounded-2xl p-3 text-center" style={{background:"var(--surf)",border:"1px solid var(--border)"}}>
              <div className="text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Gastos</div>
              <div className="text-xl font-black" style={{color:"#ef4444"}}>${(cashSummary?.expense || 0).toFixed(0)}</div>
            </div>
            <div className="rounded-2xl p-3 text-center" style={{background:"var(--surf)",border:"2px solid var(--gold)"}}>
              <div className="text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Balance</div>
              <div className="text-xl font-black" style={{color:"var(--gold)"}}>${(cashSummary?.balance || 0).toFixed(0)}</div>
            </div>
          </div>
          <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--muted)"}}>Movimientos</div>
          {movements.length === 0 ? (
            <div className="text-center py-10 text-sm" style={{color:"var(--muted)"}}>Sin movimientos hoy</div>
          ) : movements.map((m: any) => (
            <div key={m.id} className="rounded-xl border mb-2 p-3 flex items-center gap-3"
              style={{background:"var(--surf)",borderColor:"var(--border)"}}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                style={{background: m.type==="INCOME" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)"}}>
                {m.category === "DELIVERY" ? "🛵" : m.category === "GASOLINE" ? "⛽" : m.category === "EMERGENCY_PURCHASE" ? "🛒" : "📝"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.description || m.category}</div>
                <div className="text-xs" style={{color:"var(--muted)"}}>{new Date(m.createdAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</div>
              </div>
              {m.photoUrl && (
                <a href={m.photoUrl} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                  <img src={m.photoUrl} alt="" className="w-full h-full object-cover" />
                </a>
              )}
              <div className="font-black flex-shrink-0" style={{color: m.type==="INCOME" ? "#22c55e" : "#ef4444"}}>
                {m.type === "INCOME" ? "+" : "-"}${m.amount.toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ══════════════════════════════════
  // RESUMEN SEMANAL
  // ══════════════════════════════════
  if (screen === "weekly") return (
    <div className="min-h-screen flex flex-col" style={{background:"var(--bg)"}}>
      <div className="px-4 py-3 flex items-center gap-3 border-b" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <button onClick={() => setScreen("home")} className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{background:"var(--surf2)",color:"var(--muted)"}}>←</button>
        <h1 className="font-syne font-black text-xl">Resumen semanal</h1>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-2xl p-4 text-center" style={{background:"var(--surf)",border:"1px solid var(--border)"}}>
            <div className="text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Entregas esta semana</div>
            <div className="text-3xl font-black" style={{color:"var(--gold)"}}>
              {history.filter(o => o.status === "DELIVERED").length}
            </div>
          </div>
          <div className="rounded-2xl p-4 text-center" style={{background:"var(--surf)",border:"1px solid var(--border)"}}>
            <div className="text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Total cobrado</div>
            <div className="text-3xl font-black" style={{color:"#22c55e"}}>
              ${history.filter(o => o.status === "DELIVERED").reduce((s: number, o: any) => s + Number(o.total), 0).toFixed(0)}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border p-4 mb-4" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
          <div className="text-xs font-black uppercase tracking-wider mb-4" style={{color:"var(--muted)"}}>Entregas por día</div>
          {(() => {
            const days: Record<string, number> = {};
            const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
            for (let i = 6; i >= 0; i--) {
              const d = new Date(); d.setDate(d.getDate() - i);
              const dayKey = dayNames[d.getDay()];
              if (dayKey) days[dayKey] = 0;
            }
            history.filter(o => o.status === "DELIVERED").forEach((o: any) => {
              const key = dayNames[new Date(o.createdAt).getDay()];
              if (key && days[key] !== undefined) days[key]++;
            });
            const max = Math.max(...Object.values(days), 1);
            return (
              <div className="flex items-end gap-2 h-24">
                {Object.entries(days).map(([day, count]) => (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs font-black" style={{color:"var(--gold)"}}>{count > 0 ? count : ""}</div>
                    <div className="w-full rounded-t-lg"
                      style={{height:`${(count/max)*64}px`, minHeight: count > 0 ? "4px" : "2px",
                        background: count > 0 ? "var(--gold)" : "var(--surf2)"}} />
                    <div className="text-xs" style={{color:"var(--muted)"}}>{day}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        <div className="text-xs font-black uppercase tracking-wider mb-3" style={{color:"var(--muted)"}}>
          Todos los pedidos ({history.length})
        </div>
        {history.map((order: any) => {
          const sc = STATUS_COLORS[order.status] || "#888";
          return (
            <div key={order.id} className="rounded-xl border p-3 mb-2 flex items-center gap-3"
              style={{background:"var(--surf)",borderColor:"var(--border)"}}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{background:sc+"18"}}>
                {order.status === "DELIVERED" ? "✅" : "🔄"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{order.orderNumber}</div>
                <div className="text-xs truncate" style={{color:"var(--muted)"}}>{order.customerName}</div>
              </div>
              <div className="text-right">
                <div className="font-black text-sm" style={{color:"var(--gold)"}}>${Number(order.total).toFixed(0)}</div>
                <div className="text-xs" style={{color:"var(--muted)"}}>
                  {new Date(order.createdAt).toLocaleDateString('es-MX',{weekday:'short', day:'numeric'})}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ══════════════════════════════════
  // GASTO
  // ══════════════════════════════════
  if (screen === "gasto") return (
    <div className="min-h-screen flex flex-col" style={{background:"var(--bg)"}}>
      <div className="px-4 py-3 flex items-center gap-3 border-b" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <button onClick={() => setScreen("home")} className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{background:"var(--surf2)",color:"var(--muted)"}}>←</button>
        <h1 className="font-syne font-black text-xl">Registrar gasto</h1>
      </div>
      <div className="flex-1 p-4 flex flex-col gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>Tipo de gasto</div>
          <div className="flex flex-col gap-2">
            {EXPENSE_CATS.map(cat => (
              <button key={cat.value} onClick={() => setExpenseCat(cat.value)}
                className="py-3 px-4 rounded-xl text-sm font-bold text-left"
                style={{background: expenseCat===cat.value ? `${cat.color}18` : "var(--surf)",
                  border:`2px solid ${expenseCat===cat.value ? cat.color : "var(--border)"}`,
                  color: expenseCat===cat.value ? cat.color : "var(--muted)"}}>
                {cat.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>Monto ($)</div>
          <input value={expenseAmt} onChange={e => setExpenseAmt(e.target.value)} type="number" placeholder="0"
            className="w-full px-4 py-3 rounded-xl text-2xl font-black outline-none text-center"
            style={{background:"var(--surf)",border:"2px solid var(--border)",color:"var(--text)"}} />
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>Descripción (opcional)</div>
          <input value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)} placeholder="Ej: Tanque lleno Pemex"
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>Foto del ticket</div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={capturePhoto} />
          {expensePhoto ? (
            <div className="relative">
              <img src={expensePhoto} alt="ticket" className="w-full rounded-xl object-cover" style={{maxHeight:"200px"}} />
              <button onClick={() => setExpensePhoto(null)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                style={{background:"rgba(0,0,0,0.6)",color:"white"}}>✕</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              className="w-full py-8 rounded-xl border-2 border-dashed flex flex-col items-center gap-2"
              style={{borderColor:"var(--border)",color:"var(--muted)"}}>
              <span className="text-3xl">📸</span>
              <span className="text-sm font-bold">Tomar foto o seleccionar</span>
            </button>
          )}
        </div>
      </div>
      <div className="p-4 border-t" style={{borderColor:"var(--border)",background:"var(--surf)"}}>
        <button onClick={saveExpense} disabled={savingExpense || !expenseAmt}
          className="w-full py-4 rounded-2xl font-syne font-black text-lg"
          style={{background: (!expenseAmt || savingExpense) ? "var(--muted)" : "#f97316", color:"#fff"}}>
          {savingExpense ? "Guardando..." : "✅ Registrar gasto"}
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════
  // CHAT
  // ══════════════════════════════════
  if (screen === "chat" && selectedOrder) return (
    <div className="min-h-screen flex flex-col" style={{background:"var(--bg)"}}>
      <div className="px-4 py-3 flex items-center gap-3 border-b flex-shrink-0" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <button onClick={() => setScreen("home")} className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{background:"var(--surf2)",color:"var(--muted)"}}>←</button>
        <div>
          <h1 className="font-syne font-black">{selectedOrder.customerName || "Cliente"}</h1>
          <p className="text-xs" style={{color:"var(--muted)"}}>{selectedOrder.orderNumber}</p>
        </div>
        {selectedOrder.customerPhone && (
          <a href={`tel:${selectedOrder.customerPhone}`} className="ml-auto w-10 h-10 rounded-xl flex items-center justify-center"
            style={{background:"rgba(34,197,94,0.1)",color:"#22c55e"}}>📞</a>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {messages.length === 0 && <div className="text-center py-10 text-sm" style={{color:"var(--muted)"}}>Sin mensajes</div>}
        {messages.map((msg: any) => (
          <div key={msg.id} className={`flex ${msg.fromDriver ? "justify-end" : "justify-start"}`}>
            <div className="max-w-xs px-4 py-2.5 rounded-2xl text-sm"
              style={{background: msg.fromDriver ? "var(--gold)" : "var(--surf)", color: msg.fromDriver ? "#000" : "var(--text)",
                border: msg.fromDriver ? "none" : "1px solid var(--border)"}}>
              <div>{msg.message}</div>
              <div className="text-xs mt-1 opacity-60">
                {new Date(msg.createdAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t flex gap-2" style={{borderColor:"var(--border)",background:"var(--surf)"}}>
        <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
          onKeyDown={e => e.key==="Enter" && sendMessage()}
          placeholder="Escribe un mensaje..." maxLength={300}
          className="flex-1 px-4 py-3 rounded-2xl text-sm outline-none"
          style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
        <button onClick={sendMessage} disabled={sending || !newMsg.trim()}
          className="px-4 py-3 rounded-2xl font-black"
          style={{background: newMsg.trim() ? "var(--gold)" : "var(--surf2)", color: newMsg.trim() ? "#000" : "var(--muted)"}}>➤</button>
      </div>
    </div>
  );

  // ══════════════════════════════════
  // HISTORIAL
  // ══════════════════════════════════
  if (screen === "history") return (
    <div className="min-h-screen flex flex-col" style={{background:"var(--bg)"}}>
      <div className="px-4 py-3 flex items-center gap-3 border-b" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
        <button onClick={() => setScreen("home")} className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{background:"var(--surf2)",color:"var(--muted)"}}>←</button>
        <div>
          <h1 className="font-syne font-black text-xl">Historial del día</h1>
          <p className="text-xs" style={{color:"var(--muted)"}}>
            {history.length} pedidos · ${history.filter(o => o.status==="DELIVERED").reduce((s:number,o:any) => s+Number(o.total),0).toFixed(0)} cobrados
          </p>
        </div>
      </div>
      <div className="flex-1 p-4">
        {history.length === 0 ? (
          <div className="text-center py-20" style={{color:"var(--muted)"}}>
            <div className="text-5xl mb-3">📋</div><div className="text-sm">Sin entregas hoy</div>
          </div>
        ) : history.map((order: any) => {
          const sc = STATUS_COLORS[order.status] || "#888";
          return (
            <div key={order.id} className="rounded-2xl border p-4 mb-3 flex items-center gap-4"
              style={{background:"var(--surf)",borderColor:"var(--border)"}}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{background:sc+"18"}}>
                {order.status === "DELIVERED" ? "✅" : "🔄"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-syne font-black text-sm">{order.orderNumber}</div>
                <div className="text-xs truncate" style={{color:"var(--muted)"}}>{order.customerName || "Cliente"}</div>
                <div className="text-xs" style={{color:"var(--muted)"}}>
                  {new Date(order.createdAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-black" style={{color:"var(--gold)"}}>${Number(order.total).toFixed(0)}</div>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{background:sc+"18",color:sc}}>
                  {STATUS_LABELS[order.status]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return null;
}