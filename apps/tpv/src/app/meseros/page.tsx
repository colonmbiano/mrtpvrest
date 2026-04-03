"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { useRouter } from "next/navigation";

const STATUS_LABELS: Record<string,string> = {
  PENDING:"Pendiente", CONFIRMED:"Confirmado", PREPARING:"Preparando",
  READY:"Listo ✅", DELIVERED:"Entregado", CANCELLED:"Cancelado",
};
const STATUS_COLORS: Record<string,string> = {
  PENDING:"#f59e0b", CONFIRMED:"#3b82f6", PREPARING:"#8b5cf6",
  READY:"#22c55e", DELIVERED:"#6b7280", CANCELLED:"#ef4444",
};

type Screen = "login"|"home"|"tpv"|"orderDetail";

export default function WaiterAppTPV() {
  const router = useRouter();
  const [mounted, setMounted]         = useState(false);
  const [screen, setScreen]           = useState<Screen>("login");
  const [waiter, setWaiter]           = useState<any>(null);
  const [shift, setShift]             = useState<any>(null);
  const [pin, setPin]                 = useState("");
  const [pinError, setPinError]       = useState("");
  const [orders, setOrders]           = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  // Menú / TPV
  const [categories, setCategories]   = useState<any[]>([]);
  const [allItems, setAllItems]       = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState("all");
  const [tickets, setTickets]         = useState<any[]>([{id:1,name:"",phone:"",type:"DINE_IN",table:"",items:[]}]);
  const [activeTicket, setActiveTicket] = useState(0);
  const [variantModal, setVariantModal] = useState<any>(null);
  const [modModal, setModModal]       = useState<any>(null);
  const [selectedMods, setSelectedMods] = useState<any[]>([]);
  const [addingToOrder, setAddingToOrder] = useState<any>(null);
  const [sending, setSending]         = useState(false);

  const ticket = tickets[activeTicket] || tickets[0];

  useEffect(() => {
    setMounted(true);
    // Verificar si el dispositivo está configurado para SaaS
    const restId = localStorage.getItem("restaurantId");
    const locId = localStorage.getItem("locationId");
    if (!restId || !locId) {
      router.push("/setup");
    }
  }, [router]);

  const fetchOrders = useCallback(async (w?: any) => {
    const id = (w || waiter)?.id;
    if (!id) return;
    try {
      const { data } = await api.get(`/api/waiters/${id}/orders`);
      setOrders(data);
    } catch {}
  }, [waiter]);

  useEffect(() => {
    if (waiter) {
      Promise.all([api.get("/api/menu/categories"), api.get("/api/menu/items")])
        .then(([c, i]) => { setCategories(c.data); setAllItems(i.data); });
      fetchOrders();
      const t = setInterval(() => fetchOrders(), 15000);
      return () => clearInterval(t);
    }
  }, [waiter, fetchOrders]);

  // ── LOGIN ──
  async function handleLogin() {
    try {
      const { data } = await api.post("/api/waiters/login", { pin });
      setWaiter(data.waiter);
      try {
        const shiftRes = await api.get(`/api/waiters/${data.waiter.id}/shift`);
        setShift(shiftRes.data);
      } catch { setShift(null); }
      setPinError(""); setPin("");
      setScreen("home");
      fetchOrders(data.waiter);
    } catch { setPinError("PIN incorrecto"); setPin(""); }
  }

  // ── TURNO ──
  async function startShift() {
    try {
      const { data } = await api.post(`/api/waiters/${waiter.id}/shift/start`);
      setShift(data);
    } catch (e: any) { alert(e.response?.data?.error || "Error"); }
  }

  async function endShift() {
    if (!confirm("¿Terminar turno?")) return;
    await api.post(`/api/waiters/${waiter.id}/shift/end`);
    setShift(null); setWaiter(null); setScreen("login"); setPin("");
  }

  // ── TICKET ──
  function updateTicket(patch: any) {
    setTickets(ts => ts.map((t, i) => i === activeTicket ? { ...t, ...patch } : t));
  }

  function addToTicket(item: any, variant: any, mods: any[]) {
    const price = variant ? variant.price : item.price;
    const modsPrice = mods.reduce((s: number, m: any) => s + m.price, 0);
    const total = price + modsPrice;
    const notes = mods.map((m: any) => m.name).join(", ");
    updateTicket({ items: [...ticket.items, {
      menuItemId: item.id, name: item.name,
      variantId: variant?.id || null, variantName: variant?.name,
      price: total, qty: 1, subtotal: total, notes, mods,
    }]});
  }

  async function sendToKitchen() {
    if (ticket.items.length === 0) { alert("Agrega productos"); return; }
    if (!ticket.table) { alert("Indica el número de mesa"); return; }
    setSending(true);
    try {
      const subtotalValue = ticket.items.reduce((s: number, i: any) => s + i.subtotal, 0);
      await api.post("/api/orders/tpv", {
        items: ticket.items.map((i: any) => ({ menuItemId: i.menuItemId, quantity: i.qty, notes: i.notes })),
        orderType: "DINE_IN", tableNumber: Number(ticket.table),
        paymentMethod: "PENDING", subtotal: subtotalValue, discount: 0, total: subtotalValue,
        customerName: ticket.name || null, source: "WAITER", status: "PENDING",
      });
      setTickets([{id:Date.now(),name:"",phone:"",type:"DINE_IN",table:"",items:[]}]);
      setScreen("home");
      fetchOrders();
      alert("✅ Pedido enviado a cocina");
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setSending(false); }
  }

  if (!mounted) return null;

  // ── LOGIN SCREEN ──
  if (screen === "login") return (
    <div className="min-h-screen flex items-center justify-center bg-black p-8 font-syne">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-4xl font-black text-white mb-2 tracking-tighter italic">Waiter <span className="text-orange-500">App</span></h1>
        <p className="text-gray-500 text-xs uppercase font-bold tracking-widest mb-8">Ingreso por Sucursal</p>
        <div className="bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">
          <div className="text-center text-3xl font-black tracking-widest mb-6 h-10 text-orange-500">
            {"●".repeat(pin.length)}
          </div>
          {pinError && <p className="text-xs text-red-500 mb-4">{pinError}</p>}
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k, i) => (
              <button key={i} onClick={() => { if(k==="⌫") setPin(p=>p.slice(0,-1)); else if(k!=="") setPin(p=>p.length < 6 ? p+k : p); }}
                className="py-5 rounded-2xl text-xl font-black bg-white/5 hover:bg-orange-500 transition-all">{k}</button>
            ))}
          </div>
          <button onClick={handleLogin} disabled={pin.length < 4}
            className="w-full mt-6 py-5 rounded-2xl bg-orange-500 text-white font-black text-lg shadow-lg active:scale-95 transition-all">ENTRAR</button>
        </div>
      </div>
    </div>
  );

  // ── HOME SCREEN ──
  if (screen === "home") return (
    <div className="min-h-screen bg-[#020202] text-white font-syne flex flex-col">
      <header className="p-6 bg-[#0a0a0a] border-b border-white/5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-2xl">🧑‍🍳</div>
          <div><h2 className="text-xl font-black">{waiter?.name}</h2><p className="text-[10px] text-gray-500 uppercase font-bold">Mesero en Turno</p></div>
        </div>
        <div className="flex gap-2">
          {shift ? (
            <button onClick={() => setScreen("tpv")} className="bg-orange-500 text-white font-black px-6 py-3 rounded-xl shadow-lg active:scale-95 transition-all">NUEVA ORDEN</button>
          ) : (
            <button onClick={startShift} className="bg-green-500 text-white font-black px-6 py-3 rounded-xl shadow-lg active:scale-95 transition-all">INICIAR TURNO</button>
          )}
          <button onClick={endShift} className="bg-white/5 text-gray-500 font-bold px-4 py-3 rounded-xl border border-white/5">SALIR</button>
        </div>
      </header>

      <div className="flex-1 p-6">
        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6">Mis Pedidos Activos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map(order => (
            <div key={order.id} className="bg-[#111] border border-white/5 rounded-3xl p-6 relative group overflow-hidden shadow-xl">
              <div className="flex justify-between items-start mb-4">
                <div><h4 className="text-2xl font-black text-orange-500 leading-none">Mesa {order.tableNumber}</h4><p className="text-[10px] text-gray-600 mt-1">{order.orderNumber}</p></div>
                <span className="bg-white/5 px-3 py-1 rounded-full text-[9px] font-black uppercase border border-white/5">{STATUS_LABELS[order.status]}</span>
              </div>
              <p className="text-xs text-gray-400 mb-4">{order.items?.length} platillos · ${order.total}</p>
              <button onClick={() => { setSelectedOrder(order); setScreen("orderDetail"); }} className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase hover:bg-white hover:text-black transition-all">Ver Detalle</button>
            </div>
          ))}
          {orders.length === 0 && <div className="col-span-full py-20 text-center text-gray-600 uppercase font-black tracking-widest text-xs opacity-30 italic">Sin mesas activas en este momento</div>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-8 text-white">Próximamente: Interfaz TPV Mesero Independiente</div>
  );
}
