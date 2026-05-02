/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import api from "@/lib/api";
import { getApiUrl } from "@/lib/config";
import GPSTracker from "@/components/delivery/GPSTracker";
import { useOfflineStore } from "@/store/useOfflineStore";
import { initBackgroundSync } from "@/lib/offline";
import { useDeliveryStore } from "@/store/useDeliveryStore";

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

    // Iniciar sincronización en background
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
  }, [screen, selectedOrder, fetchMessages]);

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
      const { data: updated } = await api.put(`/api/delivery/${driver.id}/orders/${order.id}/status`, data);
      setSelectedOrder(updated);
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-black font-syne">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8"><span className="text-5xl">🚀</span><h1 className="text-2xl font-black text-white mt-4 tracking-tighter">CONFIGURAR APP</h1></div>
        {setupStep === "auth" ? (
          <form onSubmit={handleSetupLogin} className="space-y-4 bg-[#111] p-8 rounded-[2.5rem] border border-white/5">
            <input type="email" value={setupEmail} onChange={e=>setSetupEmail(e.target.value)} placeholder="Email Dueño" className="w-full bg-black border border-white/10 rounded-xl p-4 text-white" />
            <input type="password" value={setupPassword} onChange={e=>setSetupPassword(e.target.value)} placeholder="Password de Marca" className="w-full bg-black border border-white/10 rounded-xl p-4 text-white" />
            <button className="w-full py-4 bg-white text-black font-black rounded-xl active:scale-95 transition-all">SIGUIENTE →</button>
          </form>
        ) : (
          <div className="bg-[#111] p-8 rounded-[2.5rem] space-y-3 border border-white/5">
            <p className="text-xs text-center text-gray-500 mb-4 uppercase font-black tracking-widest">¿Qué sucursal es esta?</p>
            {locations.map(loc => (
              <button key={loc.id} onClick={()=>finishSetup(loc)} className="w-full py-4 bg-white/5 border border-white/5 rounded-xl font-bold hover:bg-orange-500 transition-all uppercase text-xs">📍 {loc.name}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── VISTA LOGIN PIN ──
  if (screen === "login") return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-black font-syne">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter">Delivery</h1>
        <p className="text-gray-500 text-[9px] font-black uppercase tracking-[0.3em] mb-10 opacity-50">{localStorage.getItem("locationName")}</p>
        <div className="bg-[#111] border border-white/5 p-8 rounded-[2.5rem] space-y-6 shadow-2xl">
          <div className="text-center text-4xl font-black tracking-[0.5em] text-orange-500 h-12 flex items-center justify-center">
            {"●".repeat(pin.length) || <span className="text-gray-800 text-xs tracking-normal">INGRESA TU PIN</span>}
          </div>
          {loginError && <p className="text-xs text-red-500 font-bold">{loginError}</p>}
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k, i) => (
              <button key={i} onClick={() => { if(k==="⌫") setPin(p=>p.slice(0,-1)); else if(k!=="") setPin(p=>p.length < 6 ? p+k : p); }}
                className="py-5 rounded-2xl text-xl font-black bg-white/5 hover:bg-orange-500 transition-all">{k}</button>
            ))}
          </div>
          <button onClick={() => handlePinLogin()} disabled={pin.length < 4} className="w-full py-5 bg-orange-500 text-white font-black rounded-2xl text-lg active:scale-95 transition-all">ENTRAR</button>
        </div>
        <button onClick={()=>{localStorage.clear(); window.location.reload();}} className="mt-8 text-[9px] text-gray-600 font-black uppercase underline tracking-[0.2em] opacity-40">Re-configurar terminal</button>
      </div>
    </div>
  );

  // ── VISTA HOME ──
  if (screen === "home") return (
    <div className="min-h-screen bg-[#020202] text-white flex flex-col font-syne uppercase">
      <div className="px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#0a0a0a]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-xl border border-orange-500/20"></div>
          <div><h1 className="font-black text-sm">{driver?.name}</h1><p className="text-[9px] text-green-500 font-black">● En Línea</p></div>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>{fetchHistory(); setScreen("weekly");}} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">📊</button>
          <button onClick={()=>setScreen("caja")} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-green-500">💵</button>
          <button onClick={()=>{setDriver(null); setScreen("login");}} className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">🔒</button>
        </div>
      </div>

      <div className="pt-4">
        <GPSTracker driverId={driver?.id} activeOrderId={orders.find(o => o.status === "ON_THE_WAY")?.id} />
      </div>

      <div className="p-6">
        <h2 className="text-[10px] font-black text-gray-500 tracking-widest mb-6">Pedidos por Entregar ({orders.length})</h2>
        <div className="space-y-4">
          {orders.map(order => (
            <div key={order.id} className="bg-[#111] border border-white/5 rounded-[2.5rem] p-6 shadow-xl">
              <div className="flex justify-between items-start mb-4">
                <div><h3 className="text-xl font-black text-orange-500 leading-none">{order.orderNumber}</h3><p className="text-xs text-gray-400 mt-1">{order.customerName}</p></div>
                <span className="text-[9px] font-black uppercase px-2 py-1 bg-white/5 rounded border border-white/5">{STATUS_LABELS[order.status]}</span>
              </div>
              <div className="bg-black/40 p-3 rounded-xl mb-4 text-[11px] text-gray-400 border border-white/5 italic">📍 {order.deliveryAddress}</div>
              <div className="flex gap-2">
                <button onClick={()=>{setSelectedOrder(order); fetchOrderDetail(order.id); setScreen("detail");}} className="flex-1 py-3 bg-white/5 rounded-xl text-[10px] font-black">DETALLE</button>
                <button onClick={()=>{setSelectedOrder(order); setScreen("chat");}} className="px-4 py-3 bg-blue-500/10 text-blue-400 rounded-xl">💬</button>
                {order.status === "READY" && <button onClick={()=>changeStatus(order, "ON_THE_WAY")} className="flex-1 py-3 bg-orange-500 text-white font-black rounded-xl text-[10px]">📦 SALIR</button>}
                {order.status === "ON_THE_WAY" && <button onClick={()=>{setSelectedOrder(order); setScreen("cobrar");}} className="flex-1 py-3 bg-green-500 text-white font-black rounded-xl text-[10px]">💵 COBRAR</button>}
              </div>
            </div>
          ))}
          {orders.length === 0 && <div className="py-20 text-center text-gray-600 text-[10px] font-black uppercase tracking-[0.3em] opacity-30 italic">No hay entregas pendientes</div>}
        </div>
      </div>
    </div>
  );

  // ── VISTA CHAT ──
  if (screen === "chat" && selectedOrder) return (
    <div className="min-h-screen bg-black flex flex-col font-syne">
      <div className="px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#0a0a0a]">
        <div className="flex items-center gap-3">
          <button onClick={()=>setScreen("home")} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-500">←</button>
          <div><h1 className="font-black text-sm">{selectedOrder.customerName}</h1><p className="text-[9px] text-gray-500">{selectedOrder.orderNumber}</p></div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.fromDriver ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 rounded-2xl text-xs font-bold ${msg.fromDriver ? 'bg-orange-500 text-black' : 'bg-white/5 text-white'}`}>
              {msg.message}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-6 bg-[#0a0a0a] border-t border-white/5 flex gap-2">
        <input value={newMsg} onChange={e=>setNewMsg(e.target.value)} placeholder="Escribe un mensaje..." className="flex-1 bg-black border border-white/10 rounded-xl p-4 text-xs font-bold" />
        <button onClick={sendMessage} className="w-14 h-14 bg-orange-500 text-black rounded-xl flex items-center justify-center font-black">➤</button>
      </div>
    </div>
  );

  // ── VISTA CAJA ──
  if (screen === "caja") return (
    <div className="min-h-screen bg-[#020202] text-white flex flex-col font-syne uppercase">
      <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center">
        <button onClick={()=>setScreen("home")} className="text-xs font-black text-gray-500">← VOLVER</button>
        <h2 className="text-xs font-black">MI CAJA CHICA</h2>
        <button onClick={()=>setScreen("gasto")} className="text-xs font-black text-orange-500">+ GASTO</button>
      </div>
      <div className="p-6">
        <div className="bg-white/5 border border-white/5 rounded-3xl p-8 text-center mb-8">
          <p className="text-[9px] font-black text-gray-500 mb-2">BALANCE ACTUAL</p>
          <p className="text-5xl font-black text-green-500">${(cashSummary?.balance || 0).toFixed(0)}</p>
        </div>
        <div className="space-y-3">
          {movements.map(m => (
            <div key={m.id} className="bg-[#111] p-4 rounded-2xl flex justify-between items-center border border-white/5">
              <div><p className="text-[10px] font-black">{m.description || m.category}</p><p className="text-[8px] text-gray-600">{new Date(m.createdAt).toLocaleTimeString()}</p></div>
              <p className={`font-black ${m.type === "INCOME" ? 'text-green-500' : 'text-red-500'}`}>{m.type === "INCOME" ? '+' : '-'}${m.amount}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── VISTA GASTO ──
  if (screen === "gasto") return (
    <div className="min-h-screen bg-[#020202] text-white flex flex-col font-syne uppercase">
      <div className="px-6 py-4 border-b border-white/5 flex items-center">
        <button onClick={()=>setScreen("caja")} className="text-xs font-black text-gray-500 mr-4">← VOLVER</button>
        <h2 className="text-xs font-black">REGISTRAR GASTO</h2>
      </div>
      <div className="p-6 space-y-4">
        <div>
          <label className="text-[10px] font-black text-gray-500 mb-2 block">CATEGORÍA</label>
          <div className="grid grid-cols-1 gap-2">
            {EXPENSE_CATS.map(c => (
              <button key={c.value} onClick={()=>setExpenseCat(c.value)} className={`p-4 rounded-xl text-xs font-black border ${expenseCat === c.value ? 'bg-orange-500/10 border-orange-500 text-orange-500' : 'bg-[#111] border-white/5 text-gray-400'}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-500 mb-2 block">MONTO ($)</label>
          <input type="number" value={expenseAmt} onChange={e=>setExpenseAmt(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-xl font-black" placeholder="0.00" />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-500 mb-2 block">DESCRIPCIÓN</label>
          <input type="text" value={expenseDesc} onChange={e=>setExpenseDesc(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-xs" placeholder="Ej. Gasolina moto" />
        </div>
        <button onClick={saveExpense} disabled={savingExpense || !expenseAmt} className="w-full py-4 bg-orange-500 text-black font-black rounded-xl active:scale-95 transition-all mt-4 disabled:opacity-50">
          {savingExpense ? 'GUARDANDO...' : 'GUARDAR GASTO'}
        </button>
      </div>
    </div>
  );

  // ── VISTA COBRAR ──
  if (screen === "cobrar" && selectedOrder) return (
    <div className="min-h-screen bg-[#020202] text-white flex flex-col font-syne uppercase">
      <div className="px-6 py-4 border-b border-white/5 flex items-center">
        <button onClick={()=>setScreen("home")} className="text-xs font-black text-gray-500 mr-4">← CANCELAR</button>
        <h2 className="text-xs font-black">COBRAR PEDIDO</h2>
      </div>
      <div className="p-6 space-y-6">
        <div className="bg-white/5 border border-white/5 rounded-3xl p-8 text-center">
          <p className="text-[10px] font-black text-gray-500 mb-2">TOTAL A COBRAR</p>
          <p className="text-5xl font-black text-white">${(selectedOrder.total || 0).toFixed(2)}</p>
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-500 mb-2 block">MÉTODO DE PAGO</label>
          <div className="flex gap-2">
            <button onClick={()=>setPayMethod("CASH")} className={`flex-1 py-4 rounded-xl font-black text-xs border ${payMethod === "CASH" ? 'bg-orange-500/10 border-orange-500 text-orange-500' : 'bg-[#111] border-white/5 text-gray-400'}`}>💵 EFECTIVO</button>
            <button onClick={()=>setPayMethod("TRANSFER")} className={`flex-1 py-4 rounded-xl font-black text-xs border ${payMethod === "TRANSFER" ? 'bg-orange-500/10 border-orange-500 text-orange-500' : 'bg-[#111] border-white/5 text-gray-400'}`}>💳 TRANSFER</button>
          </div>
        </div>
        {payMethod === "CASH" && (
          <div>
            <label className="text-[10px] font-black text-gray-500 mb-2 block">EFECTIVO RECIBIDO</label>
            <input type="number" value={cashReceived} onChange={e=>setCashReceived(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl p-4 text-white text-xl font-black" placeholder="0.00" />
            {Number(cashReceived) > selectedOrder.total && (
              <p className="text-xs text-green-500 font-bold mt-2">Cambio a entregar: ${(Number(cashReceived) - selectedOrder.total).toFixed(2)}</p>
            )}
          </div>
        )}
        <button onClick={()=>changeStatus(selectedOrder, "DELIVERED", payMethod)} className="w-full py-4 bg-green-500 text-black font-black rounded-xl mt-4">CONFIRMAR PAGO</button>
      </div>
    </div>
  );

  // ── VISTA DETALLE ──
  if (screen === "detail" && selectedOrder) return (
    <div className="min-h-screen bg-[#020202] text-white flex flex-col font-syne uppercase">
      <div className="px-6 py-4 border-b border-white/5 flex items-center">
        <button onClick={()=>setScreen("home")} className="text-xs font-black text-gray-500 mr-4">← VOLVER</button>
        <h2 className="text-xs font-black">PEDIDO {selectedOrder.orderNumber}</h2>
      </div>
      <div className="p-6 space-y-4">
        <div className="bg-[#111] border border-white/5 rounded-2xl p-4">
          <p className="text-xs text-gray-400">CLIENTE</p>
          <p className="text-sm font-black">{selectedOrder.customerName}</p>
          {selectedOrder.customerPhone && <p className="text-xs text-blue-400 mt-1">📞 {selectedOrder.customerPhone}</p>}
        </div>
        <div className="bg-[#111] border border-white/5 rounded-2xl p-4">
          <p className="text-xs text-gray-400">DIRECCIÓN</p>
          <p className="text-sm font-black normal-case">{selectedOrder.deliveryAddress}</p>
        </div>
        <div className="bg-[#111] border border-white/5 rounded-2xl p-4">
          <p className="text-xs text-gray-400 mb-2">PRODUCTOS</p>
          {(orderDetail?.items || []).map((item: any, i: number) => (
            <div key={i} className="flex justify-between text-xs mb-2">
              <span>{item.quantity}x {item.productName}</span>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t border-white/10 mt-2 pt-2 flex justify-between font-black">
            <span>TOTAL</span>
            <span className="text-orange-500">${(selectedOrder.total || 0).toFixed(2)}</span>
          </div>
        </div>
        <button onClick={()=>setScreen("home")} className="w-full py-4 bg-white/5 border border-white/5 rounded-xl font-black">CERRAR</button>
      </div>
    </div>
  );

  // ── VISTA HISTORIAL SEMANAL ──
  if (screen === "weekly") return (
    <div className="min-h-screen bg-[#020202] text-white flex flex-col font-syne uppercase">
      <div className="px-6 py-4 border-b border-white/5 flex items-center">
        <button onClick={()=>setScreen("home")} className="text-xs font-black text-gray-500 mr-4">← VOLVER</button>
        <h2 className="text-xs font-black">HISTORIAL ENTREGAS</h2>
      </div>
      <div className="p-6">
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-3xl p-6 text-center mb-6">
          <p className="text-[10px] font-black text-orange-500 mb-1">TOTAL ENTREGADOS (HOY)</p>
          <p className="text-4xl font-black text-white">{history.filter(h=>new Date(h.updatedAt).toDateString() === new Date().toDateString()).length}</p>
        </div>
        <div className="space-y-3">
          {history.map(h => (
            <div key={h.id} className="bg-[#111] border border-white/5 rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="font-black text-xs">{h.orderNumber}</p>
                <p className="text-[9px] text-gray-500">{new Date(h.updatedAt).toLocaleTimeString()}</p>
              </div>
              <span className="text-[9px] font-black bg-white/5 px-2 py-1 rounded text-green-500">ENTREGADO</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return null;
}
