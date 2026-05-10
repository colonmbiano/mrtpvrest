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
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-halo-primary rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-halo-primary/20">
            <span className="text-4xl text-white">⚙️</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-6 tracking-tight font-mono uppercase">Configuración</h1>
          <p className="text-halo-muted text-sm mt-2">Vincula esta aplicación con tu sucursal</p>
        </div>
        
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[32px] shadow-2xl">
          {setupStep === "auth" ? (
            <form onSubmit={handleSetupLogin} className="space-y-6">
              <p className="text-[10px] font-bold text-halo-primary tracking-[0.2em] uppercase text-center mb-2">Paso 1: Autenticación Admin</p>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-halo-muted mb-2 block uppercase tracking-wider">Email del Administrador</label>
                  <input type="email" value={setupEmail} onChange={e=>setSetupEmail(e.target.value)} placeholder="dueño@ejemplo.com" className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white placeholder:text-halo-muted/50 focus:border-halo-primary outline-none transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-halo-muted mb-2 block uppercase tracking-wider">Contraseña</label>
                  <input type="password" value={setupPassword} onChange={e=>setSetupPassword(e.target.value)} placeholder="••••••••" className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white placeholder:text-halo-muted/50 focus:border-halo-primary outline-none transition-all" />
                </div>
              </div>
              <button className="w-full py-4 bg-[#2563EB] text-white font-bold rounded-2xl active:scale-95 transition-all uppercase tracking-widest text-xs shadow-lg shadow-blue-500/20">
                {loggingIn ? "AUTENTICANDO..." : "CONTINUAR"}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <p className="text-[10px] font-bold text-halo-primary tracking-[0.2em] uppercase text-center mb-2">Paso 2: Selecciona Sucursal</p>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {locations.map(loc => (
                  <button key={loc.id} onClick={()=>finishSetup(loc)} className="w-full py-4 bg-white/5 border border-white/5 rounded-2xl font-bold hover:bg-halo-primary hover:text-black transition-all uppercase text-xs flex items-center justify-center gap-2">
                    <span className="text-base">📍</span> {loc.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── VISTA LOGIN PIN ──
  if (screen === "login") return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="w-20 h-20 bg-halo-primary rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-halo-primary/20">
          <span className="text-4xl text-white">🛵</span>
        </div>
        
        <h1 className="text-3xl font-bold text-white uppercase tracking-tight mb-1 font-mono">MRTPV Delivery</h1>
        <p className="text-halo-muted text-[10px] font-bold uppercase tracking-[0.4em] mb-10 opacity-70 italic">{localStorage.getItem("locationName")}</p>
        
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[32px] space-y-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-halo-primary/30"></div>
          
          <div className="text-center text-4xl font-mono font-bold tracking-[0.4em] text-halo-primary h-12 flex items-center justify-center">
            {pin.length > 0 ? "●".repeat(pin.length) : <span className="text-halo-muted/30 text-[10px] tracking-[0.2em] font-sans font-bold uppercase">Ingresa tu PIN</span>}
          </div>
          
          {loginError && <p className="text-xs text-red-500 font-bold bg-red-500/10 py-2 rounded-xl border border-red-500/20">{loginError}</p>}
          
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k, i) => (
              <button key={i} onClick={() => { if(k==="⌫") setPin(p=>p.slice(0,-1)); else if(k!=="") setPin(p=>p.length < 6 ? p+k : p); }}
                className={`py-5 rounded-2xl text-2xl font-mono font-bold transition-all ${k === "" ? "opacity-0 pointer-events-none" : "bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 active:scale-90"}`}>
                {k}
              </button>
            ))}
          </div>
          
          <button onClick={() => handlePinLogin()} disabled={pin.length < 4 || loggingIn} className="w-full py-5 bg-halo-primary text-black font-bold rounded-2xl text-sm tracking-widest uppercase active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-halo-primary/20">
            {loggingIn ? "ACCEDIENDO..." : "ACCEDER"}
          </button>
        </div>
        
        <button onClick={()=>{localStorage.clear(); window.location.reload();}} className="mt-12 text-[10px] text-halo-muted font-bold uppercase underline tracking-[0.2em] opacity-40 hover:opacity-100 transition-opacity">Configuración de Terminal</button>
      </div>
    </div>
  );

  // ── VISTA HOME ──
  if (screen === "home") return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-white/5 bg-halo-bg/60 backdrop-blur-xl sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-halo-primary/10 flex items-center justify-center text-2xl border border-halo-primary/20 shadow-lg shadow-halo-primary/10">🛵</div>
          <div>
            <h1 className="font-bold text-base text-white tracking-tight">{driver?.name}</h1>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-halo-success animate-pulse shadow-[0_0_8px_rgba(136,214,108,0.5)]"></span>
              <p className="text-[10px] text-halo-success font-bold uppercase tracking-widest">En Línea</p>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={()=>{fetchHistory(); setScreen("weekly");}} className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all shadow-lg">📊</button>
          <button onClick={()=>setScreen("caja")} className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-halo-success hover:bg-halo-success/10 transition-all shadow-lg">💵</button>
          <button onClick={()=>{setDriver(null); setScreen("login");}} className="w-11 h-11 rounded-2xl bg-red-500/5 border border-red-500/10 flex items-center justify-center text-red-500 hover:bg-red-500/10 transition-all shadow-lg">🔒</button>
        </div>
      </div>

      <div className="flex-1 pb-10">
        {/* Ticker Dinámico */}
        <div className="px-6 py-3 bg-white/[0.02] border-b border-white/5 overflow-hidden">
          <p className="text-[10px] font-bold text-[#B8B9B6] whitespace-nowrap animate-marquee uppercase tracking-[0.2em] italic">
            Maneja con precaución • Hay reporte de lluvia en tu ruta • ¡Buen turno repartidor!
          </p>
        </div>

        <div className="mt-6 px-6">
          <GPSTracker driverId={driver?.id} activeOrderId={orders.find(o => o.status === "ON_THE_WAY")?.id} />
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-[11px] font-bold text-halo-muted tracking-[0.3em] uppercase">Ruta Activa</h2>
              <p className="text-2xl font-bold text-white font-mono">{orders.length} <span className="text-xs font-sans text-halo-muted uppercase tracking-widest">Pedidos</span></p>
            </div>
            {!isOnline && <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider animate-pulse">Offline</span>}
          </div>

          <div className="grid gap-6">
            {orders.map(order => (
              <div key={order.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[32px] p-6 shadow-2xl relative overflow-hidden group transition-all hover:bg-white/10">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-halo-primary/50"></div>
                
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-2xl font-mono font-bold text-halo-primary tracking-tighter leading-none">#{order.orderNumber}</h3>
                    <p className="text-sm font-bold text-white mt-2 tracking-tight">{order.customerName}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded-xl border ${order.status === 'ON_THE_WAY' ? 'bg-halo-primary/20 border-halo-primary/30 text-halo-primary' : 'bg-white/5 border-white/5 text-halo-muted'}`}>
                    {STATUS_LABELS[order.status]}
                  </span>
                </div>

                <div className="bg-black/40 p-5 rounded-2xl mb-6 text-sm text-white/90 border border-white/5 leading-relaxed font-medium">
                  <span className="text-halo-muted block text-[10px] uppercase font-bold mb-2 tracking-[0.15em]">📍 Dirección de Entrega</span>
                  {order.deliveryAddress}
                </div>

                <div className="flex gap-4">
                  <button onClick={()=>{setSelectedOrder(order); fetchOrderDetail(order.id); setScreen("detail");}} className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-white/10 transition-all">Detalle</button>
                  <button onClick={()=>{setSelectedOrder(order); setScreen("chat");}} className="w-14 h-14 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-2xl hover:bg-blue-500/20 transition-all flex items-center justify-center text-xl shadow-lg shadow-blue-500/10">💬</button>
                  
                  {order.status === "READY" && (
                    <button onClick={()=>changeStatus(order, "ON_THE_WAY")} className="flex-[1.5] py-4 bg-halo-primary text-black font-bold rounded-2xl text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-halo-primary/30 active:scale-95 transition-all">
                      Recoger 📦
                    </button>
                  )}
                  {order.status === "ON_THE_WAY" && (
                    <button onClick={()=>{setSelectedOrder(order); setScreen("cobrar");}} className="flex-[1.5] py-4 bg-halo-success text-black font-bold rounded-2xl text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-halo-success/30 active:scale-95 transition-all">
                      Entregar 💵
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {orders.length === 0 && (
              <div className="py-28 text-center bg-white/5 rounded-[40px] border border-white/5 border-dashed">
                <p className="text-7xl mb-8 grayscale opacity-20 animate-bounce">🥡</p>
                <p className="text-halo-muted text-[11px] font-bold uppercase tracking-[0.4em] opacity-40 italic">Esperando nuevas órdenes...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ── VISTA CHAT ──
  if (screen === "chat" && selectedOrder) return (
    <div className="min-h-screen flex flex-col">
      <div className="px-6 py-5 flex items-center gap-5 border-b border-white/5 bg-halo-bg/60 backdrop-blur-xl sticky top-0 z-20">
        <button onClick={()=>setScreen("home")} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-halo-muted hover:text-white transition-all shadow-lg">←</button>
        <div>
          <h1 className="font-bold text-lg text-white tracking-tight">{selectedOrder.customerName}</h1>
          <p className="text-[10px] text-halo-primary font-bold font-mono tracking-[0.2em] uppercase italic opacity-80">Pedido #{selectedOrder.orderNumber}</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.fromDriver ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-5 rounded-[24px] text-sm font-medium leading-relaxed shadow-xl backdrop-blur-md ${msg.fromDriver ? 'bg-halo-primary text-black rounded-tr-none' : 'bg-white/5 text-white border border-white/10 rounded-tl-none'}`}>
              {msg.message}
              <p className={`text-[9px] mt-2 font-bold uppercase tracking-wider ${msg.fromDriver ? 'text-black/60' : 'text-halo-muted'}`}>
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-6 bg-halo-bg/95 backdrop-blur-2xl border-t border-white/5 flex gap-4">
        <input value={newMsg} onChange={e=>setNewMsg(e.target.value)} onKeyDown={e=>e.key==='Enter' && sendMessage()} placeholder="Escribe un mensaje..." className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-medium focus:border-halo-primary outline-none transition-all placeholder:text-halo-muted/40" />
        <button onClick={sendMessage} disabled={!newMsg.trim() || sending} className="w-16 h-14 bg-halo-primary text-black rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-halo-primary/30 active:scale-95 transition-all disabled:opacity-50">
          ➤
        </button>
      </div>
    </div>
  );

  // ── VISTA CAJA ──
  if (screen === "caja") return (
    <div className="min-h-screen flex flex-col">
      <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-halo-bg/60 backdrop-blur-xl sticky top-0 z-20">
        <button onClick={()=>setScreen("home")} className="text-[10px] font-bold text-halo-muted hover:text-white transition-all tracking-[0.2em] uppercase">← Volver</button>
        <h2 className="text-xs font-bold tracking-[0.3em] uppercase opacity-80">Mi Caja</h2>
        <button onClick={()=>setScreen("gasto")} className="px-4 py-2 bg-halo-primary text-black rounded-xl text-[10px] font-bold uppercase tracking-[0.15em] shadow-lg shadow-halo-primary/20">Registrar Gasto</button>
      </div>
      
      <div className="p-6">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[40px] p-12 text-center mb-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-halo-success/40"></div>
          <p className="text-[10px] font-bold text-halo-muted mb-4 tracking-[0.4em] uppercase">Efectivo en Mano</p>
          <p className="text-7xl font-mono font-bold text-halo-success tracking-tighter drop-shadow-[0_0_20px_rgba(136,214,108,0.3)]">${(cashSummary?.balance || 0).toFixed(0)}</p>
        </div>
        
        <h3 className="text-[10px] font-bold text-halo-muted mb-5 tracking-[0.3em] uppercase ml-2">Historial Reciente</h3>
        <div className="space-y-4">
          {movements.map(m => (
            <div key={m.id} className="bg-white/5 backdrop-blur-md p-6 rounded-[24px] flex justify-between items-center border border-white/5 hover:border-white/20 transition-all shadow-lg">
              <div>
                <p className="text-sm font-bold text-white tracking-tight">{m.description || m.category}</p>
                <p className="text-[10px] text-halo-muted uppercase tracking-wider font-mono mt-1.5 opacity-60">{new Date(m.createdAt).toLocaleTimeString()}</p>
              </div>
              <p className={`text-xl font-mono font-bold ${m.type === "INCOME" ? 'text-halo-success' : 'text-red-500'}`}>
                {m.type === "INCOME" ? '+' : '-'}${m.amount}
              </p>
            </div>
          ))}
          {movements.length === 0 && (
            <div className="py-20 text-center text-halo-muted text-[11px] font-bold uppercase tracking-[0.3em] opacity-30 italic">No hay movimientos hoy</div>
          )}
        </div>
      </div>
    </div>
  );

  // ── VISTA GASTO ──
  if (screen === "gasto") return (
    <div className="min-h-screen flex flex-col">
      <div className="px-6 py-5 border-b border-white/5 flex items-center bg-halo-bg/60 backdrop-blur-xl sticky top-0 z-20">
        <button onClick={()=>setScreen("caja")} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-halo-muted hover:text-white mr-4 transition-all shadow-lg">←</button>
        <h2 className="text-xs font-bold tracking-[0.3em] uppercase opacity-80">Registrar Gasto</h2>
      </div>
      
      <div className="p-6 space-y-8">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[32px] shadow-2xl space-y-8">
          <div>
            <label className="text-[10px] font-bold text-halo-muted mb-4 block tracking-[0.2em] uppercase">Selecciona Categoría</label>
            <div className="grid gap-3">
              {EXPENSE_CATS.map(c => (
                <button key={c.value} onClick={()=>setExpenseCat(c.value)} className={`p-5 rounded-2xl text-xs font-bold border transition-all text-left flex justify-between items-center ${expenseCat === c.value ? 'bg-halo-primary/20 border-halo-primary/40 text-halo-primary shadow-lg shadow-halo-primary/10' : 'bg-white/5 border-white/5 text-halo-muted hover:border-white/20'}`}>
                  <span className="flex items-center gap-3">{c.label}</span>
                  {expenseCat === c.value && <span className="text-xl animate-in zoom-in-50">✓</span>}
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="text-[10px] font-bold text-halo-muted mb-4 block tracking-[0.2em] uppercase">Monto a Registrar</label>
            <div className="relative group">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-mono font-bold text-halo-primary opacity-50">$</span>
              <input type="number" value={expenseAmt} onChange={e=>setExpenseAmt(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl p-6 pl-12 text-white text-4xl font-mono font-bold focus:border-halo-primary outline-none transition-all shadow-inner" placeholder="0.00" />
            </div>
          </div>
          
          <div>
            <label className="text-[10px] font-bold text-halo-muted mb-4 block tracking-[0.2em] uppercase">Descripción Detallada</label>
            <textarea value={expenseDesc} onChange={e=>setExpenseDesc(e.target.value as any)} className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-sm font-medium focus:border-halo-primary outline-none transition-all min-h-[120px] resize-none" placeholder="Ej. Recarga de combustible para la ruta del centro..." />
          </div>
          
          <button onClick={saveExpense} disabled={savingExpense || !expenseAmt} className="w-full py-6 bg-halo-primary text-black font-bold rounded-2xl active:scale-95 transition-all disabled:opacity-50 text-base tracking-[0.2em] uppercase shadow-xl shadow-halo-primary/30">
            {savingExpense ? 'GUARDANDO...' : 'GUARDAR MOVIMIENTO'}
          </button>
        </div>
      </div>
    </div>
  );

  // ── VISTA COBRAR ──
  if (screen === "cobrar" && selectedOrder) return (
    <div className="min-h-screen flex flex-col">
      <div className="px-6 py-5 border-b border-white/5 flex items-center bg-halo-bg/60 backdrop-blur-xl sticky top-0 z-20">
        <button onClick={()=>setScreen("home")} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-halo-muted hover:text-white mr-4 transition-all shadow-lg">←</button>
        <h2 className="text-xs font-bold tracking-[0.3em] uppercase opacity-80">Finalizar Entrega</h2>
      </div>
      
      <div className="p-6 space-y-10">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[40px] p-12 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-halo-primary/40"></div>
          <p className="text-[10px] font-bold text-halo-muted mb-4 tracking-[0.4em] uppercase">Total a Cobrar</p>
          <p className="text-7xl font-mono font-bold text-white tracking-tighter drop-shadow-[0_0_20px_rgba(255,132,0,0.2)]">${(selectedOrder.total || 0).toFixed(2)}</p>
        </div>
        
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[32px] shadow-2xl space-y-10">
          <div>
            <label className="text-[10px] font-bold text-halo-muted mb-6 block tracking-[0.3em] uppercase text-center">Método de Pago Seleccionado</label>
            <div className="flex gap-4">
              <button onClick={()=>setPayMethod("CASH")} className={`flex-1 py-8 rounded-[28px] font-bold text-[10px] border transition-all flex flex-col items-center gap-4 tracking-[0.2em] shadow-lg ${payMethod === "CASH" ? 'bg-halo-primary/20 border-halo-primary/40 text-halo-primary shadow-halo-primary/10' : 'bg-black/40 border-white/5 text-halo-muted hover:border-white/20'}`}>
                <span className="text-4xl">💵</span>
                EFECTIVO
              </button>
              <button onClick={()=>setPayMethod("TRANSFER")} className={`flex-1 py-8 rounded-[28px] font-bold text-[10px] border transition-all flex flex-col items-center gap-4 tracking-[0.2em] shadow-lg ${payMethod === "TRANSFER" ? 'bg-halo-primary/20 border-halo-primary/40 text-halo-primary shadow-halo-primary/10' : 'bg-black/40 border-white/5 text-halo-muted hover:border-white/20'}`}>
                <span className="text-4xl">💳</span>
                TRANSFERENCIA
              </button>
            </div>
          </div>
          
          {payMethod === "CASH" && (
            <div className="animate-in fade-in slide-in-from-top-6 duration-500">
              <label className="text-[10px] font-bold text-halo-muted mb-4 block tracking-[0.2em] uppercase">¿Cuánto recibiste?</label>
              <div className="relative group">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-mono font-bold text-halo-primary opacity-50">$</span>
                <input type="number" value={cashReceived} onChange={e=>setCashReceived(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl p-6 pl-12 text-white text-4xl font-mono font-bold focus:border-halo-primary outline-none transition-all shadow-inner" placeholder="0.00" />
              </div>
              {Number(cashReceived) > selectedOrder.total && (
                <div className="mt-6 p-6 bg-halo-success/10 border border-halo-success/20 rounded-2xl flex justify-between items-center shadow-lg animate-in zoom-in-95">
                  <span className="text-[10px] font-bold text-halo-success tracking-[0.2em] uppercase">Cambio a Devolver:</span>
                  <span className="text-3xl font-mono font-bold text-halo-success drop-shadow-[0_0_15px_rgba(136,214,108,0.3)]">${(Number(cashReceived) - selectedOrder.total).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
          
          <button onClick={()=>changeStatus(selectedOrder, "DELIVERED", payMethod)} className="w-full py-6 bg-halo-success text-black font-bold rounded-2xl text-base tracking-[0.2em] shadow-xl shadow-halo-success/30 active:scale-95 transition-all uppercase">
            Confirmar Entrega ✅
          </button>
        </div>
      </div>
    </div>
  );

  // ── VISTA DETALLE ──
  if (screen === "detail" && selectedOrder) return (
    <div className="min-h-screen flex flex-col">
      <div className="px-6 py-5 border-b border-white/5 flex items-center bg-halo-bg/60 backdrop-blur-xl sticky top-0 z-20">
        <button onClick={()=>setScreen("home")} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-halo-muted hover:text-white mr-4 transition-all shadow-lg">←</button>
        <h2 className="text-xs font-bold tracking-[0.3em] uppercase font-mono opacity-80">Orden #{selectedOrder.orderNumber}</h2>
      </div>
      
      <div className="p-6 space-y-6 pb-28">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-halo-primary/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
          <p className="text-[10px] font-bold text-halo-muted mb-3 tracking-[0.3em] uppercase">Datos del Cliente</p>
          <p className="text-2xl font-bold text-white tracking-tight">{selectedOrder.customerName}</p>
          {selectedOrder.customerPhone && (
            <a href={`tel:${selectedOrder.customerPhone}`} className="inline-flex items-center gap-3 mt-5 text-sm font-bold text-halo-primary bg-halo-primary/10 px-6 py-3 rounded-2xl border border-halo-primary/20 shadow-lg shadow-halo-primary/5 hover:bg-halo-primary/20 transition-all">
              <span className="text-lg">📞</span> {selectedOrder.customerPhone}
            </a>
          )}
        </div>
        
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 shadow-2xl">
          <p className="text-[10px] font-bold text-halo-muted mb-4 tracking-[0.3em] uppercase">Ubicación de Entrega</p>
          <div className="flex gap-4 items-start">
            <span className="text-2xl mt-1">📍</span>
            <p className="text-base font-medium text-white/90 leading-relaxed tracking-tight">{selectedOrder.deliveryAddress}</p>
          </div>
          <button className="w-full mt-8 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-bold tracking-[0.3em] uppercase hover:bg-white/10 transition-all flex items-center justify-center gap-3 shadow-lg">
            <span>MAPAS</span> 🗺️
          </button>
        </div>
        
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 shadow-2xl">
          <p className="text-[10px] font-bold text-halo-muted mb-6 tracking-[0.3em] uppercase">Contenido del Pedido</p>
          <div className="space-y-4">
            {(orderDetail?.items || []).map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-sm pb-4 border-b border-white/5 last:border-0 last:pb-0">
                <span className="text-white/90"><span className="font-mono font-bold text-halo-primary mr-2">{item.quantity}x</span> {item.productName}</span>
                <span className="font-mono text-white/40 tracking-tighter">${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 mt-8 pt-8 flex justify-between items-center">
            <span className="text-xs font-bold text-halo-muted tracking-[0.2em] uppercase">Total Recaudado</span>
            <span className="text-4xl font-mono font-bold text-halo-success drop-shadow-[0_0_15px_rgba(136,214,108,0.3)]">${(selectedOrder.total || 0).toFixed(2)}</span>
          </div>
        </div>
        
        <button onClick={()=>setScreen("home")} className="w-full py-5 bg-white/5 border border-white/10 rounded-2xl font-bold text-[10px] tracking-[0.4em] uppercase hover:bg-white/10 transition-all shadow-lg">Volver a Ruta</button>
      </div>
    </div>
  );

  // ── VISTA HISTORIAL SEMANAL ──
  if (screen === "weekly") return (
    <div className="min-h-screen flex flex-col">
      <div className="px-6 py-5 border-b border-white/5 flex items-center bg-halo-bg/60 backdrop-blur-xl sticky top-0 z-20">
        <button onClick={()=>setScreen("home")} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-halo-muted hover:text-white mr-4 transition-all shadow-lg">←</button>
        <h2 className="text-xs font-bold tracking-[0.3em] uppercase opacity-80">Mi Desempeño</h2>
      </div>
      
      <div className="p-6">
        <div className="bg-halo-primary/10 backdrop-blur-xl border border-halo-primary/20 rounded-[40px] p-10 text-center mb-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-halo-primary shadow-[0_0_15px_rgba(255,132,0,0.5)]"></div>
          <p className="text-[10px] font-bold text-halo-primary mb-4 tracking-[0.4em] uppercase">Entregas Hoy</p>
          <p className="text-8xl font-mono font-bold text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.2)]">{history.filter(h=>new Date(h.updatedAt).toDateString() === new Date().toDateString()).length}</p>
        </div>
        
        <h3 className="text-[10px] font-bold text-halo-muted mb-6 tracking-[0.3em] uppercase ml-2">Historial de Órdenes</h3>
        <div className="grid gap-4">
          {history.map(h => (
            <div key={h.id} className="bg-white/5 backdrop-blur-md border border-white/5 rounded-[28px] p-6 flex justify-between items-center group hover:bg-white/10 transition-all shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-halo-success/10 flex items-center justify-center text-halo-success text-lg">✓</div>
                <div>
                  <p className="font-mono font-bold text-base text-white tracking-tighter">#{h.orderNumber}</p>
                  <p className="text-[10px] text-halo-muted font-mono mt-1.5 uppercase tracking-wider opacity-60">{new Date(h.updatedAt).toLocaleTimeString()}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono font-bold text-white">${h.total?.toFixed(2)}</p>
                <span className="text-[9px] font-bold text-halo-success uppercase tracking-[0.15em] opacity-80 mt-1 block">Entregado</span>
              </div>
            </div>
          ))}
          {history.length === 0 && (
            <div className="py-24 text-center bg-white/5 rounded-[40px] border border-white/5 border-dashed">
              <p className="text-6xl mb-8 grayscale opacity-20">📭</p>
              <p className="text-halo-muted text-[11px] font-bold uppercase tracking-[0.3em] opacity-40 italic">No hay entregas registradas hoy</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return null;
}
