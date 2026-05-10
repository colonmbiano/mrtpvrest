/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import api from "@/lib/api";
import { getApiUrl } from "@/lib/config";
import GPSTracker from "@/components/delivery/GPSTracker";
import { useOfflineStore } from "@/store/useOfflineStore";
import { initBackgroundSync } from "@/lib/offline";

const STATUS_LABELS: Record<string, string> = {
  PENDING:"Pendiente", CONFIRMED:"Confirmado", PREPARING:"Preparando",
  READY:"Listo para recoger", ON_THE_WAY:"En camino", DELIVERED:"Entregado", CANCELLED:"Cancelado",
};

const EXPENSE_CATS = [
  { value:"GASOLINE",           label:"⛽ Gasolina",          color:"#FF8400" },
  { value:"EMERGENCY_PURCHASE", label:"🛒 Compra emergencia", color:"#8b5cf6" },
  { value:"OTHER",              label:"📝 Otro gasto",         color:"#6b7280" },
];

type Screen = "setup" | "login" | "home" | "detail" | "chat" | "history" | "cobrar" | "caja" | "gasto" | "weekly";

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

  // --- ESTADOS SAAS ---
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [setupStep, setSetupStep] = useState<"auth" | "location">("auth");

  // --- LOGIN REPARTIDOR ---
  const [pin, setPin]           = useState("");
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
  const [savingExpense, setSavingExpense] = useState(false);
  const [orderDetail, setOrderDetail] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement|null>(null);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);
    window.addEventListener('online',  () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));
    audioRef.current = new Audio('/notification.mp3');

    initBackgroundSync();

    const restId = localStorage.getItem("restaurantId");
    const locId = localStorage.getItem("locationId");
    if (!restId || !locId) setScreen("setup");
  }, []);

  const fetchOrders = useCallback(async (d?: any) => {
    const id = (d || driver)?.id; if (!id) return;
    try {
      const { data } = await api.get(`/api/delivery/${id}/orders`);
      if (data.length > prevOrderCount && prevOrderCount > 0) {
        audioRef.current?.play().catch(() => {});
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

  const selectedOrderIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedOrderIdRef.current = selectedOrder?.id || null;
  }, [selectedOrder]);

  useEffect(() => {
    if (driver) {
      fetchOrders(); fetchHistory();
      
      const socket = io(getApiUrl(), {
        query: { restaurantId: localStorage.getItem("restaurantId"), locationId: localStorage.getItem("locationId") }
      });

      socket.on("connect", () => console.log("Socket connected to Delivery App"));
      socket.on("newOrder", () => fetchOrders());
      socket.on("orderUpdated", () => fetchOrders());
      socket.on("newMessage", (data: any) => {
        if (selectedOrderIdRef.current && data.orderId === selectedOrderIdRef.current) {
          fetchMessages(selectedOrderIdRef.current);
        }
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [driver, fetchOrders, fetchHistory, fetchMessages]);

  useEffect(() => {
    if (screen === "chat" && selectedOrder) {
      fetchMessages(selectedOrder.id);
    }
    if (screen === "caja") {
      fetchCash();
    }
  }, [screen, selectedOrder, fetchMessages, fetchCash]);

  // ── FLUJO DE SETUP (DUEÑO) ──
  async function handleSetupLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    try {
      const { data } = await api.post("/api/auth/login", { email: setupEmail, password: setupPassword });
      localStorage.setItem("accessToken", data.accessToken);
      const locs = await api.get("/api/auth/my-locations");
      setLocations(locs.data);
      localStorage.setItem("restaurantId", data.user.restaurantId);
      setSetupStep("location");
    } catch (err) { alert("Credenciales incorrectas."); }
    finally { setLoggingIn(false); }
  }

  function finishSetup(loc: any) {
    localStorage.setItem("locationId", loc.id);
    localStorage.setItem("locationName", loc.name);
    localStorage.removeItem("accessToken");
    setScreen("login");
  }

  // ── FLUJO LOGIN PIN ──
  async function handlePinLogin(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoggingIn(true);
    try {
      const { data } = await api.post("/api/employees/login", { pin });
      setDriver(data.employee); setLoginError("");
      localStorage.setItem("accessToken", data.token);
      setScreen("home");
      fetchOrders(data.employee);
    } catch { setLoginError("PIN incorrecto"); setPin(""); }
    finally { setLoggingIn(false); }
  }

  async function changeStatus(order: any, status: string, method?: string) {
    const data = {
      orderId: order.id,
      status,
      ...(method ? { paymentMethod: method } : {})
    };

    if (!navigator.onLine) {
      useOfflineStore.getState().addToQueue({ type: 'CONFIRM_DELIVERY', data });
      if (status === "DELIVERED") {
        setOrders(orders.filter(o => o.id !== order.id));
        setScreen("home");
      }
      return;
    }

    try {
      await api.put(`/api/delivery/${driver.id}/orders/${order.id}/status`, data);
      fetchOrders();
      if (status === "DELIVERED") setScreen("home");
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
  }

  async function saveExpense() {
    if (!expenseAmt || Number(expenseAmt) <= 0) return;
    
    const expenseData = {
      type: "EXPENSE",
      category: expenseCat,
      amount: expenseAmt,
      description: expenseDesc,
      driverId: driver.id
    };

    if (!navigator.onLine) {
      useOfflineStore.getState().addToQueue({ type: 'LOG_EXPENSE', data: expenseData });
      setScreen("caja");
      return;
    }

    setSavingExpense(true);
    try {
      const formData = new FormData();
      Object.entries(expenseData).forEach(([k, v]) => formData.append(k, v as string));
      await api.post(`/api/driver-cash/${driver.id}/movements`, formData);
      setScreen("caja");
    } catch {} finally { setSavingExpense(false); }
  }

  async function sendMessage() {
    if (!newMsg.trim() || !selectedOrder) return;
    const msgData = { orderId: selectedOrder.id, message: newMsg, fromDriver: true };

    if (!navigator.onLine) {
      useOfflineStore.getState().addToQueue({ type: 'CHAT_MESSAGE', data: msgData });
      setMessages([...messages, { ...msgData, id: Date.now().toString(), createdAt: new Date() }]);
      setNewMsg("");
      return;
    }

    try {
      setSending(true);
      await api.post(`/api/delivery/orders/${selectedOrder.id}/messages`, msgData);
      setNewMsg("");
      fetchMessages(selectedOrder.id);
    } catch {} finally { setSending(false); }
  }

  if (!mounted) return null;

  // ── VISTA SETUP ──
  if (screen === "setup") return (
    <div className="min-h-screen flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-5xl">🚀</span>
          <h1 className="text-3xl font-bold text-white mt-4 tracking-tight font-mono">CONFIGURAR</h1>
        </div>
        {setupStep === "auth" ? (
          <form onSubmit={handleSetupLogin} className="space-y-4 bg-halo-card p-8 rounded-4xl border border-halo-border shadow-2xl">
            <input type="email" value={setupEmail} onChange={e=>setSetupEmail(e.target.value)} placeholder="Email Dueño" className="w-full bg-black/40 border border-halo-border rounded-2xl p-4 text-white placeholder:text-halo-muted focus:border-halo-primary outline-none transition-all" />
            <input type="password" value={setupPassword} onChange={e=>setSetupPassword(e.target.value)} placeholder="Password de Marca" className="w-full bg-black/40 border border-halo-border rounded-2xl p-4 text-white placeholder:text-halo-muted focus:border-halo-primary outline-none transition-all" />
            <button className="w-full py-4 bg-white text-black font-bold rounded-2xl active:scale-95 transition-all uppercase tracking-widest text-sm">SIGUIENTE →</button>
          </form>
        ) : (
          <div className="bg-halo-card p-8 rounded-4xl border border-halo-border shadow-2xl space-y-3">
            <p className="text-[10px] text-center text-halo-muted mb-4 uppercase font-bold tracking-[0.2em]">Selecciona sucursal</p>
            {locations.map(loc => (
              <button key={loc.id} onClick={()=>finishSetup(loc)} className="w-full py-4 bg-white/[0.03] border border-halo-border rounded-2xl font-bold hover:bg-halo-primary hover:text-black transition-all uppercase text-xs">📍 {loc.name}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── VISTA LOGIN PIN ──
  if (screen === "login") return (
    <div className="min-h-screen flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-5xl font-bold text-white uppercase italic tracking-tighter mb-1 font-mono">DELIVERY</h1>
        <p className="text-halo-muted text-[10px] font-bold uppercase tracking-[0.4em] mb-10 opacity-70">{localStorage.getItem("locationName")}</p>
        
        <div className="bg-halo-card border border-halo-border p-8 rounded-4xl space-y-8 shadow-2xl">
          <div className="text-center text-5xl font-mono font-bold tracking-[0.4em] text-halo-primary h-12 flex items-center justify-center">
            {pin.length > 0 ? "●".repeat(pin.length) : <span className="text-halo-muted/30 text-xs tracking-widest font-sans">INGRESA TU PIN</span>}
          </div>
          
          {loginError && <p className="text-xs text-red-500 font-bold">{loginError}</p>}
          
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k, i) => (
              <button key={i} onClick={() => { if(k==="⌫") setPin(p=>p.slice(0,-1)); else if(k!=="") setPin(p=>p.length < 6 ? p+k : p); }}
                className={`py-6 rounded-3xl text-2xl font-mono font-bold transition-all ${k === "" ? "opacity-0 pointer-events-none" : "bg-white/[0.03] hover:bg-white/[0.08] active:scale-90"}`}>
                {k}
              </button>
            ))}
          </div>
          
          <button onClick={() => handlePinLogin()} disabled={pin.length < 4 || loggingIn} className="w-full py-5 bg-halo-primary text-black font-bold rounded-3xl text-lg active:scale-95 transition-all disabled:opacity-50">
            {loggingIn ? "ACCEDIENDO..." : "ENTRAR"}
          </button>
        </div>
        
        <button onClick={()=>{localStorage.clear(); window.location.reload();}} className="mt-12 text-[10px] text-halo-muted font-bold uppercase underline tracking-[0.2em] opacity-40 hover:opacity-100 transition-opacity">Configuración de Terminal</button>
      </div>
    </div>
  );

  // ── VISTA HOME ──
  if (screen === "home") return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-halo-border bg-halo-bg/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-halo-primary/10 flex items-center justify-center text-2xl border border-halo-primary/20">🛵</div>
          <div>
            <h1 className="font-bold text-base text-white">{driver?.name}</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-halo-success animate-pulse"></span>
              <p className="text-[10px] text-halo-success font-bold uppercase tracking-wider">En Línea</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2.5">
          <button onClick={()=>{fetchHistory(); setScreen("weekly");}} className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-halo-border flex items-center justify-center hover:bg-white/[0.08] transition-all">📊</button>
          <button onClick={()=>setScreen("caja")} className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-halo-border flex items-center justify-center text-halo-success hover:bg-halo-success/10 transition-all">💵</button>
          <button onClick={()=>{setDriver(null); setScreen("login");}} className="w-11 h-11 rounded-2xl bg-red-500/5 border border-red-500/10 flex items-center justify-center text-red-500 hover:bg-red-500/10 transition-all">🔒</button>
        </div>
      </div>

      <div className="flex-1 pb-10">
        {/* Ticker / Info */}
        <div className="px-6 py-3 bg-white/[0.02] border-b border-halo-border overflow-hidden">
          <p className="text-[10px] font-bold text-halo-muted whitespace-nowrap animate-marquee uppercase tracking-widest italic">
            Maneja con precaución • Revisa tus pedidos antes de salir • ¡Buen turno!
          </p>
        </div>

        <div className="mt-4">
          <GPSTracker driverId={driver?.id} activeOrderId={orders.find(o => o.status === "ON_THE_WAY")?.id} />
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[11px] font-bold text-halo-muted tracking-[0.2em] uppercase">Ruta Activa ({orders.length})</h2>
            {!isOnline && <span className="text-[9px] bg-amber-500/10 text-amber-500 px-2 py-1 rounded-full font-bold">MODO OFFLINE</span>}
          </div>

          <div className="grid gap-5">
            {orders.map(order => (
              <div key={order.id} className="bg-halo-card border border-halo-border rounded-4xl p-6 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-halo-primary/40"></div>
                
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <h3 className="text-2xl font-mono font-bold text-halo-primary leading-none">#{order.orderNumber}</h3>
                    <p className="text-sm font-bold text-white/90 mt-1.5">{order.customerName}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded-xl border border-white/5 ${order.status === 'ON_THE_WAY' ? 'bg-halo-primary/10 text-halo-primary' : 'bg-white/5 text-halo-muted'}`}>
                    {STATUS_LABELS[order.status]}
                  </span>
                </div>

                <div className="bg-black/20 p-4 rounded-2xl mb-6 text-xs text-white/80 border border-white/5 font-medium leading-relaxed">
                  <span className="text-halo-muted block text-[10px] uppercase font-bold mb-1 tracking-wider">Dirección de Entrega:</span>
                  {order.deliveryAddress}
                </div>

                <div className="flex gap-3">
                  <button onClick={()=>{setSelectedOrder(order); fetchOrderDetail(order.id); setScreen("detail");}} className="flex-1 py-4 bg-white/[0.03] border border-halo-border rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-white/[0.08] transition-all">Detalle</button>
                  <button onClick={()=>{setSelectedOrder(order); setScreen("chat");}} className="px-5 py-4 bg-blue-500/5 text-blue-400 border border-blue-500/10 rounded-2xl hover:bg-blue-500/10 transition-all text-xl">💬</button>
                  
                  {order.status === "READY" && (
                    <button onClick={()=>changeStatus(order, "ON_THE_WAY")} className="flex-[1.5] py-4 bg-halo-primary text-black font-bold rounded-2xl text-[11px] uppercase tracking-widest shadow-lg shadow-halo-primary/20 active:scale-95 transition-all">
                      Recoger 📦
                    </button>
                  )}
                  {order.status === "ON_THE_WAY" && (
                    <button onClick={()=>{setSelectedOrder(order); setScreen("cobrar");}} className="flex-[1.5] py-4 bg-halo-success text-black font-bold rounded-2xl text-[11px] uppercase tracking-widest shadow-lg shadow-halo-success/20 active:scale-95 transition-all">
                      Entregar 💵
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {orders.length === 0 && (
              <div className="py-24 text-center">
                <p className="text-6xl mb-6 grayscale opacity-20">🥡</p>
                <p className="text-halo-muted text-xs font-bold uppercase tracking-[0.3em] opacity-40 italic">Esperando nuevas órdenes...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ── VISTA CHAT ──
  if (screen === "chat" && selectedOrder) return (
    <div className="min-h-screen flex flex-col font-sans">
      <div className="px-6 py-5 flex items-center gap-4 border-b border-halo-border bg-halo-bg/80 backdrop-blur-md sticky top-0 z-10">
        <button onClick={()=>setScreen("home")} className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-halo-border flex items-center justify-center text-halo-muted hover:text-white transition-all">←</button>
        <div>
          <h1 className="font-bold text-base text-white">{selectedOrder.customerName}</h1>
          <p className="text-[10px] text-halo-primary font-bold font-mono tracking-widest uppercase italic">Orden #{selectedOrder.orderNumber}</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.fromDriver ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-5 rounded-3xl text-sm font-medium leading-relaxed shadow-lg ${msg.fromDriver ? 'bg-halo-primary text-black rounded-tr-none' : 'bg-halo-card text-white border border-halo-border rounded-tl-none'}`}>
              {msg.message}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-6 bg-halo-bg/95 backdrop-blur-md border-t border-halo-border flex gap-3">
        <input value={newMsg} onChange={e=>setNewMsg(e.target.value)} onKeyDown={e=>e.key==='Enter' && sendMessage()} placeholder="Escribe un mensaje..." className="flex-1 bg-black/40 border border-halo-border rounded-2xl p-4 text-sm font-medium focus:border-halo-primary outline-none transition-all" />
        <button onClick={sendMessage} disabled={!newMsg.trim() || sending} className="w-16 h-14 bg-halo-primary text-black rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-halo-primary/20 active:scale-95 transition-all disabled:opacity-50">
          ➤
        </button>
      </div>
    </div>
  );

  // ── VISTA CAJA ──
  if (screen === "caja") return (
    <div className="min-h-screen flex flex-col font-sans">
      <div className="px-6 py-5 border-b border-halo-border flex justify-between items-center bg-halo-bg/80 backdrop-blur-md sticky top-0 z-10">
        <button onClick={()=>setScreen("home")} className="text-[10px] font-bold text-halo-muted hover:text-white transition-all tracking-widest uppercase">← Volver</button>
        <h2 className="text-xs font-bold tracking-[0.2em] uppercase">Control de Caja</h2>
        <button onClick={()=>setScreen("gasto")} className="px-4 py-2 bg-halo-primary/10 text-halo-primary border border-halo-primary/20 rounded-xl text-[10px] font-bold uppercase tracking-wider">+ Gasto</button>
      </div>
      
      <div className="p-6">
        <div className="bg-halo-card border border-halo-border rounded-4xl p-10 text-center mb-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-halo-success"></div>
          <p className="text-[10px] font-bold text-halo-muted mb-3 tracking-[0.3em] uppercase">Efectivo en Mano</p>
          <p className="text-6xl font-mono font-bold text-halo-success tracking-tighter">${(cashSummary?.balance || 0).toFixed(0)}</p>
        </div>
        
        <h3 className="text-[10px] font-bold text-halo-muted mb-4 tracking-widest uppercase">Últimos Movimientos</h3>
        <div className="space-y-3">
          {movements.map(m => (
            <div key={m.id} className="bg-halo-card p-5 rounded-3xl flex justify-between items-center border border-halo-border hover:border-white/10 transition-all">
              <div>
                <p className="text-sm font-bold text-white/90">{m.description || m.category}</p>
                <p className="text-[9px] text-halo-muted uppercase tracking-wider font-mono mt-1">{new Date(m.createdAt).toLocaleTimeString()}</p>
              </div>
              <p className={`text-lg font-mono font-bold ${m.type === "INCOME" ? 'text-halo-success' : 'text-red-500'}`}>
                {m.type === "INCOME" ? '+' : '-'}${m.amount}
              </p>
            </div>
          ))}
          {movements.length === 0 && (
            <div className="py-10 text-center text-halo-muted text-[10px] font-bold uppercase tracking-widest opacity-30 italic">No hay movimientos registrados</div>
          )}
        </div>
      </div>
    </div>
  );

  // ── VISTA GASTO ──
  if (screen === "gasto") return (
    <div className="min-h-screen flex flex-col font-sans">
      <div className="px-6 py-5 border-b border-halo-border flex items-center bg-halo-bg/80 backdrop-blur-md sticky top-0 z-10">
        <button onClick={()=>setScreen("caja")} className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-halo-border flex items-center justify-center text-halo-muted hover:text-white mr-4 transition-all">←</button>
        <h2 className="text-xs font-bold tracking-[0.2em] uppercase">Registrar Gasto</h2>
      </div>
      
      <div className="p-6 space-y-6">
        <div>
          <label className="text-[10px] font-bold text-halo-muted mb-3 block tracking-widest uppercase">Categoría</label>
          <div className="grid gap-2.5">
            {EXPENSE_CATS.map(c => (
              <button key={c.value} onClick={()=>setExpenseCat(c.value)} className={`p-5 rounded-2xl text-xs font-bold border transition-all text-left flex justify-between items-center ${expenseCat === c.value ? 'bg-halo-primary/10 border-halo-primary text-halo-primary' : 'bg-halo-card border-halo-border text-halo-muted hover:border-white/10'}`}>
                {c.label}
                {expenseCat === c.value && <span className="text-lg">✓</span>}
              </button>
            ))}
          </div>
        </div>
        
        <div>
          <label className="text-[10px] font-bold text-halo-muted mb-3 block tracking-widest uppercase">Monto ($)</label>
          <input type="number" value={expenseAmt} onChange={e=>setExpenseAmt(e.target.value)} className="w-full bg-black/40 border border-halo-border rounded-2xl p-5 text-white text-3xl font-mono font-bold focus:border-halo-primary outline-none transition-all" placeholder="0.00" />
        </div>
        
        <div>
          <label className="text-[10px] font-bold text-halo-muted mb-3 block tracking-widest uppercase">Descripción</label>
          <input type="text" value={expenseDesc} onChange={e=>setExpenseDesc(e.target.value)} className="w-full bg-black/40 border border-halo-border rounded-2xl p-5 text-white text-sm font-medium focus:border-halo-primary outline-none transition-all" placeholder="Ej. Combustible para ruta norte" />
        </div>
        
        <button onClick={saveExpense} disabled={savingExpense || !expenseAmt} className="w-full py-5 bg-halo-primary text-black font-bold rounded-3xl active:scale-95 transition-all mt-6 disabled:opacity-50 text-base shadow-lg shadow-halo-primary/20">
          {savingExpense ? 'GUARDANDO...' : 'GUARDAR GASTO'}
        </button>
      </div>
    </div>
  );

  // ── VISTA COBRAR ──
  if (screen === "cobrar" && selectedOrder) return (
    <div className="min-h-screen flex flex-col font-sans">
      <div className="px-6 py-5 border-b border-halo-border flex items-center bg-halo-bg/80 backdrop-blur-md sticky top-0 z-10">
        <button onClick={()=>setScreen("home")} className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-halo-border flex items-center justify-center text-halo-muted hover:text-white mr-4 transition-all">←</button>
        <h2 className="text-xs font-bold tracking-[0.2em] uppercase">Confirmar Cobro</h2>
      </div>
      
      <div className="p-6 space-y-8">
        <div className="bg-halo-card border border-halo-border rounded-4xl p-10 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-halo-primary"></div>
          <p className="text-[10px] font-bold text-halo-muted mb-3 tracking-[0.3em] uppercase">Total del Pedido</p>
          <p className="text-6xl font-mono font-bold text-white tracking-tighter">${(selectedOrder.total || 0).toFixed(2)}</p>
        </div>
        
        <div>
          <label className="text-[10px] font-bold text-halo-muted mb-4 block tracking-widest uppercase text-center">Método de Pago</label>
          <div className="flex gap-4">
            <button onClick={()=>setPayMethod("CASH")} className={`flex-1 py-6 rounded-3xl font-bold text-xs border transition-all flex flex-col items-center gap-3 ${payMethod === "CASH" ? 'bg-halo-primary/10 border-halo-primary text-halo-primary' : 'bg-halo-card border-halo-border text-halo-muted hover:border-white/10'}`}>
              <span className="text-3xl">💵</span>
              EFECTIVO
            </button>
            <button onClick={()=>setPayMethod("TRANSFER")} className={`flex-1 py-6 rounded-3xl font-bold text-xs border transition-all flex flex-col items-center gap-3 ${payMethod === "TRANSFER" ? 'bg-halo-primary/10 border-halo-primary text-halo-primary' : 'bg-halo-card border-halo-border text-halo-muted hover:border-white/10'}`}>
              <span className="text-3xl">💳</span>
              TRANSFERENCIA
            </button>
          </div>
        </div>
        
        {payMethod === "CASH" && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-300">
            <label className="text-[10px] font-bold text-halo-muted mb-3 block tracking-widest uppercase">Efectivo Recibido</label>
            <input type="number" value={cashReceived} onChange={e=>setCashReceived(e.target.value)} className="w-full bg-black/40 border border-halo-border rounded-2xl p-5 text-white text-3xl font-mono font-bold focus:border-halo-primary outline-none transition-all" placeholder="0.00" />
            {Number(cashReceived) > selectedOrder.total && (
              <div className="mt-4 p-4 bg-halo-success/10 border border-halo-success/20 rounded-2xl flex justify-between items-center">
                <span className="text-[10px] font-bold text-halo-success tracking-wider uppercase">Cambio sugerido:</span>
                <span className="text-xl font-mono font-bold text-halo-success">${(Number(cashReceived) - selectedOrder.total).toFixed(2)}</span>
              </div>
            )}
          </div>
        )}
        
        <button onClick={()=>changeStatus(selectedOrder, "DELIVERED", payMethod)} className="w-full py-6 bg-halo-success text-black font-bold rounded-3xl text-lg shadow-lg shadow-halo-success/20 active:scale-95 transition-all">
          CONFIRMAR ENTREGA ✅
        </button>
      </div>
    </div>
  );

  // ── VISTA DETALLE ──
  if (screen === "detail" && selectedOrder) return (
    <div className="min-h-screen flex flex-col font-sans">
      <div className="px-6 py-5 border-b border-halo-border flex items-center bg-halo-bg/80 backdrop-blur-md sticky top-0 z-10">
        <button onClick={()=>setScreen("home")} className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-halo-border flex items-center justify-center text-halo-muted hover:text-white mr-4 transition-all">←</button>
        <h2 className="text-xs font-bold tracking-[0.2em] uppercase font-mono">Orden #{selectedOrder.orderNumber}</h2>
      </div>
      
      <div className="p-6 space-y-5 pb-20">
        <div className="bg-halo-card border border-halo-border rounded-3xl p-6 shadow-xl">
          <p className="text-[10px] font-bold text-halo-muted mb-2 tracking-widest uppercase">Cliente</p>
          <p className="text-lg font-bold text-white">{selectedOrder.customerName}</p>
          {selectedOrder.customerPhone && (
            <a href={`tel:${selectedOrder.customerPhone}`} className="inline-flex items-center gap-2 mt-3 text-sm font-bold text-halo-primary bg-halo-primary/5 px-4 py-2 rounded-xl border border-halo-primary/10">
              📞 {selectedOrder.customerPhone}
            </a>
          )}
        </div>
        
        <div className="bg-halo-card border border-halo-border rounded-3xl p-6 shadow-xl">
          <p className="text-[10px] font-bold text-halo-muted mb-2 tracking-widest uppercase">Dirección de Entrega</p>
          <p className="text-sm font-medium text-white/90 leading-relaxed">{selectedOrder.deliveryAddress}</p>
          <button className="w-full mt-4 py-3 bg-white/[0.03] border border-halo-border rounded-xl text-[10px] font-bold tracking-widest uppercase">Abrir en Maps 🗺️</button>
        </div>
        
        <div className="bg-halo-card border border-halo-border rounded-3xl p-6 shadow-xl">
          <p className="text-[10px] font-bold text-halo-muted mb-4 tracking-widest uppercase">Resumen del Pedido</p>
          <div className="space-y-3">
            {(orderDetail?.items || []).map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <span className="text-white/80"><span className="font-mono font-bold text-halo-primary">{item.quantity}x</span> {item.productName}</span>
                <span className="font-mono text-white/60">${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-halo-border mt-5 pt-5 flex justify-between items-center">
            <span className="text-xs font-bold text-halo-muted tracking-widest uppercase">Total a Cobrar</span>
            <span className="text-3xl font-mono font-bold text-halo-success">${(selectedOrder.total || 0).toFixed(2)}</span>
          </div>
        </div>
        
        <button onClick={()=>setScreen("home")} className="w-full py-4 bg-white/[0.03] border border-halo-border rounded-2xl font-bold text-xs tracking-widest uppercase">Cerrar Detalle</button>
      </div>
    </div>
  );

  // ── VISTA HISTORIAL SEMANAL ──
  if (screen === "weekly") return (
    <div className="min-h-screen flex flex-col font-sans">
      <div className="px-6 py-5 border-b border-halo-border flex items-center bg-halo-bg/80 backdrop-blur-md sticky top-0 z-10">
        <button onClick={()=>setScreen("home")} className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-halo-border flex items-center justify-center text-halo-muted hover:text-white mr-4 transition-all">←</button>
        <h2 className="text-xs font-bold tracking-[0.2em] uppercase">Historial de Ruta</h2>
      </div>
      
      <div className="p-6">
        <div className="bg-halo-primary/5 border border-halo-primary/20 rounded-4xl p-8 text-center mb-8 shadow-xl">
          <p className="text-[10px] font-bold text-halo-primary mb-2 tracking-[0.3em] uppercase">Entregas Hoy</p>
          <p className="text-6xl font-mono font-bold text-white">{history.filter(h=>new Date(h.updatedAt).toDateString() === new Date().toDateString()).length}</p>
        </div>
        
        <h3 className="text-[10px] font-bold text-halo-muted mb-4 tracking-widest uppercase">Registro de Órdenes</h3>
        <div className="grid gap-3">
          {history.map(h => (
            <div key={h.id} className="bg-halo-card border border-halo-border rounded-3xl p-5 flex justify-between items-center hover:border-white/10 transition-all">
              <div>
                <p className="font-mono font-bold text-sm text-white">#{h.orderNumber}</p>
                <p className="text-[9px] text-halo-muted font-mono mt-1 uppercase">{new Date(h.updatedAt).toLocaleTimeString()}</p>
              </div>
              <span className="text-[10px] font-bold bg-halo-success/10 border border-halo-success/20 px-3 py-1.5 rounded-xl text-halo-success uppercase tracking-wider">Entregado</span>
            </div>
          ))}
          {history.length === 0 && (
            <div className="py-16 text-center text-halo-muted text-[10px] font-bold uppercase tracking-widest opacity-30 italic">No hay entregas registradas hoy</div>
          )}
        </div>
      </div>
    </div>
  );

  return null;
}
