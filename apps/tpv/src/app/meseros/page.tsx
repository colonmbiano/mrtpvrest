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
        <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-400">Meseros bloqueado</p>
        <h1 className="mt-4 text-3xl font-black">Sesion requerida</h1>
        <p className="mt-4 text-sm leading-6 text-white/60">{guardMessage}</p>
        <button
          onClick={() => router.replace("/")}
          className="mt-8 w-full rounded-2xl bg-orange-500 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white"
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
            <h1 className="text-5xl font-black text-orange-500 leading-none">
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
                    <span className="text-2xl font-black text-orange-500">{it.quantity}×</span>
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

      <div className="flex-1 flex overflow-hidden">
        {/* Categorías */}
        <aside className="w-52 bg-[#0a0a0a] border-r border-white/5 p-4 overflow-y-auto">
          <button
            onClick={() => setSelectedCat("all")}
            className={`w-full text-left px-4 py-3 rounded-xl mb-2 text-xs font-black uppercase tracking-wider transition-all ${
              selectedCat === "all" ? "bg-orange-500 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"
            }`}
          >
            Todos
          </button>
          {categories.map((c: any) => (
            <button
              key={c.id}
              onClick={() => setSelectedCat(c.id)}
              className={`w-full text-left px-4 py-3 rounded-xl mb-2 text-xs font-black uppercase tracking-wider transition-all ${
                selectedCat === c.id ? "bg-orange-500 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"
              }`}
            >
              {c.name}
            </button>
          ))}
        </aside>

        {/* Menú */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredItems.map((item: any) => (
              <button
                key={item.id}
                onClick={() => pickItem(item)}
                className="bg-[#111] border border-white/5 rounded-2xl p-5 text-left hover:border-orange-500 transition-all active:scale-95"
              >
                <div className="text-sm font-black text-white mb-2 leading-tight">{item.name}</div>
                <div className="text-xs text-gray-500 mb-3 line-clamp-2">{item.description}</div>
                <div className="text-lg font-black text-orange-500">
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
              <div className="col-span-full py-20 text-center text-gray-600 uppercase font-black tracking-widest text-xs opacity-30">
                Sin productos en esta categoría
              </div>
            )}
          </div>
        </main>

        {/* Ticket */}
        <aside className="w-80 bg-[#0a0a0a] border-l border-white/5 flex flex-col">
          <div className="p-5 border-b border-white/5 space-y-3">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">
                Mesa
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={ticket.table}
                onChange={(e) => updateTicket({ table: e.target.value })}
                placeholder="#"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-black text-lg outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">
                Cliente (opcional)
              </label>
              <input
                value={ticket.name}
                onChange={(e) => updateTicket({ name: e.target.value })}
                placeholder="Nombre"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {ticket.items.length === 0 ? (
              <div className="text-center text-gray-600 uppercase font-black tracking-widest text-[10px] opacity-30 py-12">
                Agrega productos
              </div>
            ) : (
              <div className="space-y-2">
                {ticket.items.map((it: any, idx: number) => (
                  <div key={idx} className="bg-[#111] border border-white/5 rounded-xl p-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-black text-white truncate">{it.name}</div>
                        {it.variantName && (
                          <div className="text-[10px] text-orange-400 font-bold">{it.variantName}</div>
                        )}
                        {it.notes && (
                          <div className="text-[10px] text-gray-500 italic mt-0.5">{it.notes}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-black text-white">${it.subtotal.toFixed(2)}</div>
                        <button
                          onClick={() => removeItem(idx)}
                          className="text-[10px] text-red-500 hover:text-red-400 font-bold uppercase"
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

          <div className="p-5 border-t border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Total</span>
              <span className="text-2xl font-black text-white">${ticketTotal.toFixed(2)}</span>
            </div>
            <button
              onClick={sendToKitchen}
              disabled={sending || ticket.items.length === 0 || !ticket.table}
              className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black uppercase tracking-wider text-sm shadow-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? "Enviando…" : "Enviar a cocina"}
            </button>
          </div>
        </aside>
      </div>

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
                  className="w-full flex justify-between items-center bg-white/5 hover:bg-orange-500 rounded-2xl p-4 transition-all"
                >
                  <span className="font-black text-white">{v.name}</span>
                  <span className="font-black text-orange-400">${Number(v.price).toFixed(2)}</span>
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
                      checked ? "bg-orange-500/20 border border-orange-500" : "bg-white/5 border border-transparent"
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
                    <span className="font-black text-orange-400">+${Number(m.price).toFixed(2)}</span>
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
              className="w-full mt-5 py-4 rounded-2xl bg-orange-500 text-white font-black uppercase tracking-wider"
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
