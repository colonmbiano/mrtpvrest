"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useRouter } from "next/navigation";

const EMPLOYEE_TOKEN_KEY = "tpv-employee-token";
const EMPLOYEE_DATA_KEY = "tpv-employee";

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
  const [guardMessage, setGuardMessage] = useState("");
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
  const [ticketDrawerOpen, setTicketDrawerOpen] = useState(false);

  const ticket = tickets[activeTicket] || tickets[0];

  useEffect(() => {
    setMounted(true);
    // Verificar si el dispositivo está configurado para SaaS
    const restId = localStorage.getItem("restaurantId");
    const locId = localStorage.getItem("locationId");
    if (!restId || !locId) {
      router.replace("/setup");
      return;
    }

    const storedToken = localStorage.getItem(EMPLOYEE_TOKEN_KEY) || localStorage.getItem("accessToken");
    const storedEmployee = localStorage.getItem(EMPLOYEE_DATA_KEY);

    if (!storedToken || !storedEmployee) {
      setGuardMessage("Primero desbloquea la terminal en TPV con el PIN del mesero.");
      return;
    }

    try {
      const parsedEmployee = JSON.parse(storedEmployee);
      if (parsedEmployee?.role && parsedEmployee.role !== "WAITER") {
        setGuardMessage("La sesion activa no pertenece a un mesero.");
        return;
      }

      localStorage.setItem("accessToken", storedToken);
      setWaiter(parsedEmployee);
      setScreen("home");

      api.get(`/api/waiters/${parsedEmployee.id}/shift`)
        .then(({ data }) => setShift(data))
        .catch(() => setShift(null));
    } catch {
      setGuardMessage("No pudimos recuperar la sesion del mesero. Vuelve al TPV e intenta otra vez.");
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
    localStorage.removeItem("accessToken");
    localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
    localStorage.removeItem(EMPLOYEE_DATA_KEY);
    setShift(null); setWaiter(null); setScreen("login"); setPin("");
    router.replace("/");
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

  if (guardMessage) return (
    <div className="min-h-screen flex items-center justify-center bg-black p-8 font-syne text-white">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#111] p-8 text-center shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-[#F5C842]">Meseros bloqueado</p>
        <h1 className="mt-4 text-3xl font-black">Sesion requerida</h1>
        <p className="mt-4 text-sm leading-6 text-white/60">{guardMessage}</p>
        <button
          onClick={() => router.replace("/")}
          className="mt-8 w-full rounded-2xl bg-[#F5C842] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white"
        >
          Volver al TPV
        </button>
      </div>
    </div>
  );

  // ── LOGIN SCREEN ──
  if (screen === "login") return (
    <div className="min-h-screen flex items-center justify-center bg-black p-8 font-syne">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-4xl font-black text-white mb-2 tracking-tighter italic">Waiter <span className="text-[#F5C842]">App</span></h1>
        <p className="text-gray-500 text-xs uppercase font-bold tracking-widest mb-8">Ingreso por Sucursal</p>
        <div className="bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">
          <div className="text-center text-3xl font-black tracking-widest mb-6 h-10 text-[#F5C842]">
            {"●".repeat(pin.length)}
          </div>
          {pinError && <p className="text-xs text-red-500 mb-4">{pinError}</p>}
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k, i) => (
              <button key={i} onClick={() => { if(k==="⌫") setPin(p=>p.slice(0,-1)); else if(k!=="") setPin(p=>p.length < 6 ? p+k : p); }}
                className="py-5 rounded-2xl text-xl font-black bg-white/5 hover:bg-[#F5C842] transition-all">{k}</button>
            ))}
          </div>
          <button onClick={handleLogin} disabled={pin.length < 4}
            className="w-full mt-6 py-5 rounded-2xl bg-[#F5C842] text-white font-black text-lg shadow-lg active:scale-95 transition-all">ENTRAR</button>
        </div>
      </div>
    </div>
  );

  // ── HOME SCREEN ──
  if (screen === "home") return (
    <div className="min-h-screen bg-[#020202] text-white font-syne flex flex-col">
      <header className="p-6 bg-[#0a0a0a] border-b border-white/5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#F5C842]/10 rounded-2xl flex items-center justify-center text-2xl">🧑‍🍳</div>
          <div><h2 className="text-xl font-black">{waiter?.name}</h2><p className="text-[10px] text-gray-500 uppercase font-bold">Mesero en Turno</p></div>
        </div>
        <div className="flex gap-2">
          {shift ? (
            <button onClick={() => setScreen("tpv")} className="bg-[#F5C842] text-white font-black px-6 py-3 rounded-xl shadow-lg active:scale-95 transition-all">NUEVA ORDEN</button>
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
                <div><h4 className="text-2xl font-black text-[#F5C842] leading-none">Mesa {order.tableNumber}</h4><p className="text-[10px] text-gray-600 mt-1">{order.orderNumber}</p></div>
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

  // ── ORDER DETAIL SCREEN ──
  if (screen === "orderDetail" && selectedOrder) {
    const status = selectedOrder.status as string;
    return (
      <div className="min-h-screen bg-[#020202] text-white font-syne flex flex-col">
        <header className="p-6 bg-[#0a0a0a] border-b border-white/5 flex justify-between items-center">
          <button
            onClick={() => { setSelectedOrder(null); setScreen("home"); }}
            className="text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white"
          >
            ← Volver
          </button>
          <span
            className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest"
            style={{ background: `${STATUS_COLORS[status]}20`, color: STATUS_COLORS[status] }}
          >
            {STATUS_LABELS[status] || status}
          </span>
        </header>

        <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
          <div className="mb-8">
            <h1 className="text-5xl font-black text-[#F5C842] leading-none">
              Mesa {selectedOrder.tableNumber}
            </h1>
            <p className="text-xs text-gray-500 mt-2 font-bold uppercase tracking-widest">
              {selectedOrder.orderNumber}
              {selectedOrder.customerName ? ` · ${selectedOrder.customerName}` : ""}
            </p>
          </div>

          <div className="space-y-3 mb-8">
            {(selectedOrder.items || []).map((it: any, idx: number) => (
              <div
                key={idx}
                className="bg-[#111] border border-white/5 rounded-2xl p-5 flex justify-between items-center"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-black text-[#F5C842]">{it.quantity}×</span>
                    <span className="font-bold text-lg">{it.menuItem?.name || it.name}</span>
                  </div>
                  {it.notes && (
                    <p className="text-xs text-gray-500 mt-1.5 ml-10 italic">{it.notes}</p>
                  )}
                </div>
                <span className="font-black text-lg text-white">
                  ${(it.subtotal ?? it.price * it.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-6">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest text-gray-500">Total</span>
              <span className="text-4xl font-black text-white">${Number(selectedOrder.total).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── TPV / ORDER BUILDER SCREEN ──
  const filteredItems =
    selectedCat === "all" ? allItems : allItems.filter((i: any) => i.categoryId === selectedCat);
  const ticketTotal = ticket.items.reduce((s: number, i: any) => s + i.subtotal, 0);

  function removeItem(idx: number) {
    updateTicket({ items: ticket.items.filter((_: any, i: number) => i !== idx) });
  }

  function pickItem(item: any) {
    if (item.variants?.length > 0) { setVariantModal({ item }); return; }
    if (item.complements?.length > 0) { setModModal({ item, variant: null }); setSelectedMods([]); return; }
    addToTicket(item, null, []);
  }

  return (
    <div className="min-h-screen bg-[#020202] text-white font-syne flex flex-col">
      <header className="p-5 bg-[#0a0a0a] border-b border-white/5 flex justify-between items-center">
        <button
          onClick={() => setScreen("home")}
          className="text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white"
        >
          ← Volver
        </button>
        <h2 className="text-lg font-black tracking-tight">Nueva orden</h2>
        <div className="w-16" />
      </header>

      {(() => {
        const ticketCount = ticket.items.reduce((s: number, i: any) => s + (i.qty ?? 1), 0);
        const cats = [{ id: "all", name: "Todos" }, ...categories.map((c: any) => ({ id: c.id, name: c.name }))];

        const ticketPane = (
          <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[#0a0a0a]">
            <div className="p-4 border-b border-white/5 space-y-3 flex-shrink-0">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5 select-none">Mesa</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={ticket.table}
                  onChange={(e) => updateTicket({ table: e.target.value })}
                  placeholder="#"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 min-h-[52px] text-white font-black text-lg outline-none focus:border-[#F5C842]"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5 select-none">Cliente (opcional)</label>
                <input
                  value={ticket.name}
                  onChange={(e) => updateTicket({ name: e.target.value })}
                  placeholder="Nombre"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 min-h-[48px] text-white text-sm outline-none focus:border-[#F5C842]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
              {ticket.items.length === 0 ? (
                <div className="text-center text-gray-600 uppercase font-black tracking-widest text-[10px] opacity-30 py-12 select-none">
                  Agrega productos
                </div>
              ) : (
                <div className="space-y-2">
                  {ticket.items.map((it: any, idx: number) => (
                    <div key={idx} className="bg-[#111] border border-white/5 rounded-xl p-3 select-none">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-black text-white truncate">{it.name}</div>
                          {it.variantName && <div className="text-[10px] text-[#F5C842] font-bold">{it.variantName}</div>}
                          {it.notes && <div className="text-[10px] text-gray-500 italic mt-0.5">{it.notes}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-black text-white">${it.subtotal.toFixed(2)}</div>
                          <button
                            onClick={() => removeItem(idx)}
                            className="text-[10px] text-red-500 font-bold uppercase min-h-[32px] px-2 select-none"
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/5 space-y-3 flex-shrink-0">
              <div className="flex justify-between items-center select-none">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Total</span>
                <span className="text-2xl font-black text-white">${ticketTotal.toFixed(2)}</span>
              </div>
              <button
                onClick={sendToKitchen}
                disabled={sending || ticket.items.length === 0 || !ticket.table}
                className="w-full min-h-[56px] rounded-2xl bg-[#F5C842] text-white font-black uppercase tracking-wider text-sm shadow-lg active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed select-none"
              >
                {sending ? "Enviando…" : "Enviar a cocina"}
              </button>
            </div>
          </div>
        );

        return (
          <>
            {/* ── LAYOUT PRINCIPAL RESPONSIVE ── */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">

              {/* Categorías — chips horizontal < lg, sidebar lg+ */}
              <div className="flex gap-2 px-4 py-3 overflow-x-auto whitespace-nowrap scrollbar-hide flex-shrink-0 border-b border-white/5 lg:hidden">
                {cats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCat(c.id)}
                    className="px-4 min-h-[44px] rounded-xl text-xs font-black uppercase tracking-wider flex-shrink-0 select-none"
                    style={{
                      background: selectedCat === c.id ? "#F5C842" : "rgba(255,255,255,0.05)",
                      color: selectedCat === c.id ? "#fff" : "#9ca3af",
                      border: selectedCat === c.id ? "2px solid #F5C842" : "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              <aside className="hidden lg:flex lg:flex-col lg:w-52 xl:w-56 bg-[#0a0a0a] border-r border-white/5 p-4 overflow-y-auto scrollbar-hide flex-shrink-0 gap-2">
                {cats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCat(c.id)}
                    className="w-full text-left px-4 min-h-[48px] rounded-xl text-xs font-black uppercase tracking-wider select-none"
                    style={{
                      background: selectedCat === c.id ? "#F5C842" : "rgba(255,255,255,0.05)",
                      color: selectedCat === c.id ? "#fff" : "#9ca3af",
                      border: selectedCat === c.id ? "2px solid #F5C842" : "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </aside>

              {/* Menú grid */}
              <main className="flex-1 overflow-y-auto p-4 md:p-5 pb-28 md:pb-5 scrollbar-hide">
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                  {filteredItems.map((item: any) => (
                    <button
                      key={item.id}
                      onClick={() => pickItem(item)}
                      className="bg-[#111] border border-white/5 rounded-2xl p-4 text-left active:scale-95 transition-transform select-none min-h-[120px]"
                    >
                      <div className="text-sm font-black text-white mb-2 leading-tight">{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-gray-500 mb-3 line-clamp-2">{item.description}</div>
                      )}
                      <div className="text-lg font-black text-[#F5C842]">
                        ${Number(item.variants?.[0]?.price ?? item.price).toFixed(2)}
                      </div>
                      {item.variants?.length > 0 && (
                        <div className="text-[9px] text-gray-600 uppercase font-bold mt-1">
                          {item.variants.length} variantes
                        </div>
                      )}
                    </button>
                  ))}
                  {filteredItems.length === 0 && (
                    <div className="col-span-full py-20 text-center text-gray-600 uppercase font-black tracking-widest text-xs opacity-30 select-none">
                      Sin productos en esta categoría
                    </div>
                  )}
                </div>
              </main>

              {/* Ticket sidebar md+ */}
              <aside className="hidden md:flex md:flex-col md:w-80 lg:w-96 flex-shrink-0 border-l border-white/5 overflow-hidden">
                {ticketPane}
              </aside>
            </div>

            {/* FAB mobile */}
            <button
              onClick={() => setTicketDrawerOpen(true)}
              disabled={ticket.items.length === 0}
              className="md:hidden fixed bottom-4 left-4 right-4 h-14 rounded-2xl bg-[#F5C842] text-white shadow-2xl flex items-center justify-between px-5 font-black text-sm z-40 select-none active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                <span className="text-lg">🧾</span>
                <span>Ver Orden ({ticketCount})</span>
              </span>
              <span className="text-base font-black">${ticketTotal.toFixed(2)}</span>
            </button>

            {/* Bottom Sheet mobile */}
            {ticketDrawerOpen && (
              <div className="md:hidden fixed inset-0 z-50 flex flex-col" onClick={() => setTicketDrawerOpen(false)}>
                <div className="flex-1 bg-black/65" />
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="sheet-enter rounded-t-3xl shadow-2xl flex flex-col overflow-hidden bg-[#0a0a0a] relative"
                  style={{ height: "88vh", borderTop: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0 relative">
                    <div className="w-10 h-1 rounded-full bg-white/10 absolute left-1/2 -translate-x-1/2 top-2" />
                    <span className="text-xs font-black uppercase tracking-widest text-gray-500 select-none mt-2">Orden</span>
                    <button
                      onClick={() => setTicketDrawerOpen(false)}
                      className="w-10 h-10 rounded-xl bg-white/5 text-gray-400 flex items-center justify-center text-lg select-none"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    {ticketPane}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* Variant modal */}
      {variantModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50"
          onClick={() => setVariantModal(null)}
        >
          <div
            className="bg-[#111] border border-white/10 rounded-3xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-black text-white mb-1">{variantModal.item.name}</h3>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-5">Elige variante</p>
            <div className="space-y-2">
              {variantModal.item.variants.map((v: any) => (
                <button
                  key={v.id}
                  onClick={() => {
                    const item = variantModal.item;
                    setVariantModal(null);
                    if (item.complements?.length > 0) {
                      setModModal({ item, variant: v });
                      setSelectedMods([]);
                    } else {
                      addToTicket(item, v, []);
                    }
                  }}
                  className="w-full flex justify-between items-center bg-white/5 hover:bg-[#F5C842] rounded-2xl p-4 transition-all"
                >
                  <span className="font-black text-white">{v.name}</span>
                  <span className="font-black text-[#F5C842]">${Number(v.price).toFixed(2)}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setVariantModal(null)}
              className="w-full mt-4 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modifier modal */}
      {modModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50"
          onClick={() => setModModal(null)}
        >
          <div
            className="bg-[#111] border border-white/10 rounded-3xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-black text-white mb-1">{modModal.item.name}</h3>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-5">Complementos</p>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {modModal.item.complements.map((m: any) => {
                const checked = selectedMods.some((s) => s.id === m.id);
                return (
                  <label
                    key={m.id}
                    className={`w-full flex justify-between items-center rounded-2xl p-4 cursor-pointer transition-all ${
                      checked ? "bg-[#F5C842]/20 border border-[#F5C842]" : "bg-white/5 border border-transparent"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedMods((prev) =>
                            checked ? prev.filter((s) => s.id !== m.id) : [...prev, m],
                          )
                        }
                      />
                      <span className="font-black text-white">{m.name}</span>
                    </span>
                    <span className="font-black text-[#F5C842]">+${Number(m.price).toFixed(2)}</span>
                  </label>
                );
              })}
            </div>
            <button
              onClick={() => {
                addToTicket(modModal.item, modModal.variant, selectedMods);
                setModModal(null);
                setSelectedMods([]);
              }}
              className="w-full mt-5 py-4 rounded-2xl bg-[#F5C842] text-white font-black uppercase tracking-wider"
            >
              Agregar
            </button>
            <button
              onClick={() => { setModModal(null); setSelectedMods([]); }}
              className="w-full mt-2 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
