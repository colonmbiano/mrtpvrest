"use client";
import TPVConfigModal from "@/components/admin/TPVConfigModal";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import KDSMessages from "@/components/admin/KDSMessages";
import IngredientShortageModal from "@/components/admin/IngredientShortageModal";
import DeliveryAssignModal from "@/components/admin/DeliveryAssignModal";
import ShiftModal from "@/components/admin/ShiftModal";
import { useRouter } from "next/navigation";

const STATUS_LABELS: Record<string,string> = {
  PENDING:"Pendiente", CONFIRMED:"Confirmado", PREPARING:"Preparando",
  READY:"Listo", DELIVERED:"Entregado", CANCELLED:"Cancelado",
};
const STATUS_COLORS: Record<string,string> = {
  PENDING:"#f59e0b", CONFIRMED:"#3b82f6", PREPARING:"#8b5cf6",
  READY:"#22c55e", DELIVERED:"#6b7280", CANCELLED:"#ef4444",
};
const NEXT_STATUS: Record<string,string> = {
  PENDING:"CONFIRMED", CONFIRMED:"PREPARING", PREPARING:"READY", READY:"DELIVERED",
};
const PAY_METHODS = [
  { value:"CASH",     label:"💵 Efectivo" },
  { value:"CARD",     label:"💳 Tarjeta" },
  { value:"TRANSFER", label:"📲 Transferencia" },
  { value:"COURTESY", label:"🎁 Cortesía" },
];

export default function TPVPage() {
  const router = useRouter();

  // --- ESTADO SAAS ---
  const [restaurantName, setRestaurantName] = useState("MRTPVREST");
  const [locationName, setLocationName] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);

  // --- ESTADOS ORIGINALES ---
  const [categories, setCategories] = useState<any[]>([]);
  const [allItems, setAllItems]     = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState("all");
  const [search, setSearch]         = useState("");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [tickets, setTickets]       = useState<any[]>([{ id:1, name:"", phone:"", type:"TAKEOUT", table:"", address:"", items:[], discount:0, discountType:"percent" }]);
  const [activeTicket, setActiveTicket] = useState(0);
  const [variantModal, setVariantModal] = useState<any>(null);
  const [modifierModal, setModifierModal] = useState<any>(null);
  const [selectedMods, setSelectedMods] = useState<any[]>([]);
  const [orders, setOrders]         = useState<any[]>([]);
  const [pendingCashOrders, setPendingCashOrders] = useState<any[]>([]);
  const [showPanel, setShowPanel]   = useState(true);
  const [panelTab, setPanelTab]     = useState<"active"|"cash">("active");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [payModal, setPayModal]     = useState<any>(null);
  const [payMethod, setPayMethod]   = useState("CASH");
  const [cashReceived, setCashReceived] = useState("");
  const [updatingOrder, setUpdatingOrder] = useState<string|null>(null);
  const [addingToOrder, setAddingToOrder] = useState<any>(null);
  const [printers, setPrinters]         = useState<any[]>([]);
  const [reprintOpen, setReprintOpen]   = useState<string|null>(null);
  const [assignOrder, setAssignOrder]   = useState<any>(null);
  const [shortageOrder, setShortageOrder] = useState<any>(null);
  const [editTypeOrder, setEditTypeOrder] = useState<string|null>(null);
  const [editAddress, setEditAddress]     = useState("");
  const [confirmingCash, setConfirmingCash] = useState<string|null>(null);

  // --- BLOQUEO Y SEGURIDAD ---
  const [isGlobalLocked, setIsGlobalLocked] = useState(true);
  const [currentEmployee, setCurrentEmployee] = useState<any>(null);
  const [pinInput, setPinInput] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // --- MENÚ LATERAL ---
  const [showManagerMenu, setShowManagerMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // --- TURNO ---
  const [activeShift, setActiveShift] = useState<any>(null);

  const ticket = tickets[activeTicket] || tickets[0];

  // --- VERIFICACIÓN SAAS (AL CARGAR) ---
  useEffect(() => {
    const restId = localStorage.getItem("restaurantId");
    const locId = localStorage.getItem("locationId");

    if (!restId || !locId) {
      router.push("/setup");
    } else {
      setIsConfigured(true);
      // Opcional: Obtener info del restaurante para el nombre en pantalla
      api.get('/api/admin/config').then(res => {
        if(res.data.name) setRestaurantName(res.data.name);
      }).catch(() => {});
    }
  }, [router]);

  async function refreshShift() {
    try {
      const { data } = await api.get('/api/shifts/active');
      setActiveShift(data);
    } catch {
      setActiveShift(null);
    }
  }

  const handleVerifyGlobalPin = async (enteredPin: string) => {
    setIsVerifyingPin(true);
    try {
      const { data } = await api.post('/api/employees/login', { pin: enteredPin });
      localStorage.setItem('accessToken', data.token);
      setCurrentEmployee(data.employee);

      // Redirigir según rol
      const role = data.employee?.role;
      if (role === 'WAITER') { router.push('/meseros'); return; }
      if (role === 'KITCHEN') {
        localStorage.setItem('kdsEmployee', JSON.stringify(data.employee));
        router.push('/kds');
        return;
      }

      try {
        const { data: shift } = await api.get('/api/shifts/active');
        setActiveShift(shift);
      } catch { setActiveShift(null); }
      setTimeout(() => { setIsGlobalLocked(false); }, 100);
      setPinInput("");
    } catch {
      alert("PIN Incorrecto ❌");
      setPinInput("");
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/api/orders/admin");
      setOrders(data.filter((o: any) =>
        !["DELIVERED","CANCELLED"].includes(o.status) &&
        (o.source === "TPV" || o.source === "WAITER")
      ));
      setPendingCashOrders(data.filter((o: any) =>
        o.status === "DELIVERED" && o.cashCollected === false && o.paymentMethod === "CASH_ON_DELIVERY"
      ));
    } catch {}
  }, []);

  useEffect(() => {
    if (!isConfigured || isGlobalLocked) return;

    Promise.all([
      api.get("/api/menu/categories"),
      api.get("/api/menu/items"),
      api.get("/api/printers"),
    ]).then(([c, i, p]) => {
      setCategories(c.data);
      setAllItems(i.data);
      setPrinters((p.data || []).filter((pr: any) => pr.type !== "CASHIER" && pr.isActive));
    }).catch((err) => {
      if (err?.response?.status !== 429) console.error(err);
    });

    fetchOrders();
    const t = setInterval(fetchOrders, 15000);
    return () => clearInterval(t);
  }, [fetchOrders, isGlobalLocked, isConfigured]);

  // Si no está configurado, no renderizamos nada (el useEffect redirigirá)
  if (!isConfigured) return null;

  function updateTicket(patch: any) {
    setTickets(ts => ts.map((t, i) => i === activeTicket ? { ...t, ...patch } : t));
  }

  function addNewTicket() {
    setTickets(ts => [...ts, { id: Date.now(), name:"", phone:"", type:"TAKEOUT", table:"", address:"", items:[], discount:0, discountType:"percent" }]);
    setActiveTicket(tickets.length);
  }

  function closeTicket(idx: number) {
    if (tickets.length === 1) {
      setTickets([{ id: Date.now(), name:"", phone:"", type:"TAKEOUT", table:"", address:"", items:[], discount:0, discountType:"percent" }]);
      return;
    }
    const next = tickets.filter((_, i) => i !== idx);
    setTickets(next);
    setActiveTicket(Math.min(activeTicket, next.length - 1));
  }

  function addToTicket(item: any, variant: any, mods: any[]) {
    const price = variant ? variant.price : item.price;
    const modsPrice = mods.reduce((s, m) => s + m.price, 0);
    const totalPrice = price + modsPrice;
    const modNotes = mods.map(m => m.name).join(", ");
    const existing = ticket.items.find((i: any) =>
      i.menuItemId === item.id && i.variantId === (variant?.id || null) && i.notes === modNotes
    );
    if (existing) {
      updateTicket({ items: ticket.items.map((i: any) =>
        i === existing ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * totalPrice } : i
      )});
    } else {
      updateTicket({ items: [...ticket.items, {
        menuItemId: item.id, name: item.name,
        variantId: variant?.id || null, variantName: variant?.name || null,
        price: totalPrice, quantity: 1, subtotal: totalPrice, notes: modNotes, mods,
      }]});
    }
  }

  function handleItemClick(item: any) {
    if (!activeShift) {
      alert("⚠️ Debes abrir un turno antes de agregar productos");
      setShowShiftModal(true);
      return;
    }
    if (addingToOrder) {
      if (item.variants?.length > 0) { setVariantModal({ item, forOrder: addingToOrder }); return; }
      if (item.complements?.length > 0) { setModifierModal({ item, variant: null, forOrder: addingToOrder }); return; }
      addItemToExistingOrder(addingToOrder, item, null, []);
      return;
    }
    if (item.variants?.length > 0) { setVariantModal({ item }); return; }
    if (item.complements?.length > 0) { setModifierModal({ item, variant: null }); return; }
    addToTicket(item, null, []);
  }

  async function addItemToExistingOrder(order: any, item: any, variant: any, mods: any[]) {
    if (!activeShift) { alert("⚠️ Debes abrir un turno para agregar productos"); setShowShiftModal(true); return; }
    try {
      const price = variant ? variant.price : item.price;
      const modsPrice = (mods || []).reduce((s: number, m: any) => s + m.price, 0);
      const finalPrice = price + modsPrice;
      await api.post(`/api/orders/${order.id}/items`, {
        menuItemId: item.id,
        name: item.name + (variant ? ` - ${variant.name}` : ""),
        price: finalPrice, quantity: 1, subtotal: finalPrice,
        notes: (mods || []).map((m: any) => m.name).join(", "),
      });
      setAddingToOrder(null);
      fetchOrders();
      if (selectedOrder?.id === order.id) {
        const { data } = await api.get(`/api/orders/${order.id}`);
        setSelectedOrder(data);
      }
    } catch (err: any) { alert(err.response?.data?.error || "Error al agregar"); }
  }

  function removeFromTicket(idx: number) {
    updateTicket({ items: ticket.items.filter((_: any, i: number) => i !== idx) });
  }

  function changeQty(idx: number, delta: number) {
    const item = ticket.items[idx];
    const newQty = item.quantity + delta;
    if (newQty <= 0) { removeFromTicket(idx); return; }
    updateTicket({ items: ticket.items.map((it: any, i: number) =>
      i === idx ? { ...it, quantity: newQty, subtotal: newQty * it.price } : it
    )});
  }

  const subtotal = ticket.items.reduce((s: number, i: any) => s + i.subtotal, 0);
  const discountAmt = ticket.discountType === "percent" ? subtotal * (ticket.discount / 100) : Number(ticket.discount);
  const total = Math.max(0, subtotal - discountAmt);

  async function sendToKitchen() {
    if (ticket.items.length === 0) { alert("Agrega productos al ticket"); return; }
    if (!activeShift) { alert("⚠️ Debes abrir un turno antes de enviar pedidos"); setShowShiftModal(true); return; }
    try {
      const { data: order } = await api.post("/api/orders/tpv", {
        items: ticket.items.map((i: any) => ({ menuItemId: i.menuItemId, quantity: i.quantity, notes: i.notes })),
        orderType: ticket.type, tableNumber: ticket.table ? Number(ticket.table) : null,
        paymentMethod: "PENDING", subtotal, discount: discountAmt, total,
        customerName: ticket.name || null, customerPhone: ticket.phone || null,
        deliveryAddress: ticket.type === "DELIVERY" ? (ticket.address || null) : null,
        source: "TPV", status: "PREPARING",
      });
      closeTicket(activeTicket);
      fetchOrders();
      alert(`✅ Pedido enviado a cocina: ${order.orderNumber}`);
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
  }

  async function chargeTicket(paymentMethod: string) {
    if (ticket.items.length === 0) { alert("Agrega productos"); return; }
    if (!activeShift) { alert("⚠️ Debes abrir un turno antes de cobrar"); setShowShiftModal(true); return; }
    try {
      await api.post("/api/orders/tpv", {
        items: ticket.items.map((i: any) => ({ menuItemId: i.menuItemId, quantity: i.quantity, notes: i.notes })),
        orderType: ticket.type, tableNumber: ticket.table ? Number(ticket.table) : null,
        paymentMethod, subtotal, discount: discountAmt, total,
        customerName: ticket.name || null, customerPhone: ticket.phone || null,
        deliveryAddress: ticket.type === "DELIVERY" ? (ticket.address || null) : null,
        source: "TPV", status: "DELIVERED",
      });
      closeTicket(activeTicket);
      fetchOrders();
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
  }

  async function chargeExistingOrder(orderId: string, method: string) {
    if (!activeShift) { alert("⚠️ Debes abrir un turno antes de cobrar"); setShowShiftModal(true); return; }
    setUpdatingOrder(orderId);
    try {
      await api.put(`/api/orders/${orderId}/payment`, { paymentMethod: method });
      setPayModal(null); setSelectedOrder(null);
      fetchOrders();
    } catch (err: any) { alert(err.response?.data?.error || "Error al cobrar"); }
    finally { setUpdatingOrder(null); }
  }

  async function updateOrderStatus(orderId: string, status: string) {
    if (!activeShift) { alert("⚠️ Debes abrir un turno para cambiar estados"); setShowShiftModal(true); return; }
    setUpdatingOrder(orderId);
    try {
      await api.put(`/api/orders/${orderId}/status`, { status });
      fetchOrders();
      if (selectedOrder?.id === orderId) setSelectedOrder((p: any) => ({ ...p, status }));
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setUpdatingOrder(null); }
  }

  async function changeOrderType(orderId: string, orderType: string, address?: string) {
    try {
      await api.put(`/api/orders/${orderId}/type`, { orderType, deliveryAddress: address || null });
      fetchOrders();
      setEditTypeOrder(null);
      setEditAddress("");
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
  }

  async function reprintOrder(order: any, printerId?: string) {
    try {
      await api.post(`/api/orders/${order.id}/reprint`, printerId ? { printerId } : {});
      setReprintOpen(null);
      alert("🖨️ Reimprimiendo en " + (printerId ? printers.find((p: any) => p.id === printerId)?.name || "estación" : "todas las estaciones"));
    } catch { alert("Error al reimprimir"); }
  }

  async function printBill(order: any) {
    try {
      await api.post(`/api/orders/${order.id}/print-bill`);
      alert("🖨️ Cuenta enviada a imprimir");
    } catch { alert("Error al imprimir"); }
  }

  async function confirmCash(order: any) {
    if (!activeShift) { alert("⚠️ Debes abrir un turno para confirmar cobros"); setShowShiftModal(true); return; }
    if (!confirm(`¿Confirmar recepción de $${Number(order.total).toFixed(0)} en efectivo de ${order.orderNumber}?`)) return;
    setConfirmingCash(order.id);
    try {
      await api.put(`/api/orders/${order.id}/confirm-cash`, { collectedBy: "TPV" });
      fetchOrders();
      alert(`✅ Cobro confirmado: ${order.orderNumber}`);
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al confirmar cobro");
    } finally { setConfirmingCash(null); }
  }

  async function confirmAllCash() {
    if (!activeShift) { alert("⚠️ Debes abrir un turno para confirmar cobros"); setShowShiftModal(true); return; }
    if (pendingCashOrders.length === 0) return;
    const total = pendingCashOrders.reduce((s, o) => s + Number(o.total), 0);
    if (!confirm(`¿Confirmar TODOS los cobros pendientes?\n${pendingCashOrders.length} pedidos · $${total.toFixed(0)} total`)) return;
    for (const order of pendingCashOrders) {
      await api.put(`/api/orders/${order.id}/confirm-cash`, { collectedBy: "TPV" }).catch(() => {});
    }
    fetchOrders();
    alert(`✅ ${pendingCashOrders.length} cobros confirmados`);
  }

  const filteredItems = allItems.filter((i: any) => {
    const matchCat = selectedCat === "all" || i.categoryId === selectedCat;
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch && i.isAvailable !== false;
  });

  const filteredSettingsItems = allItems.filter((p: any) =>
    p.name.toLowerCase().includes(settingsSearch.toLowerCase())
  );

  // ── PANTALLA DE BLOQUEO ──
  if (isGlobalLocked) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)] flex-col px-4">
        <h1 className="text-5xl font-syne font-black text-[var(--gold)] mb-2 text-center uppercase tracking-tighter">
          {restaurantName}
        </h1>
        <p className="text-[var(--muted)] mb-10 text-center font-medium">Terminal de Punto de Venta (SaaS)</p>
        <div className="bg-[var(--surf)] border border-[var(--border)] p-8 rounded-[2rem] w-full max-w-sm shadow-2xl">
          <h2 className="text-xl font-bold text-white text-center mb-6">Ingresa tu PIN</h2>
          <div className="flex justify-center gap-3 mb-8">
            {[0,1,2,3].map((i) => (
              <div key={i} className={`w-4 h-4 rounded-full transition-all ${pinInput.length > i ? 'bg-[var(--gold)] scale-110' : 'bg-[var(--surf2)]'}`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-2">
            {[1,2,3,4,5,6,7,8,9].map((num) => (
              <button key={num} disabled={isVerifyingPin}
                onClick={() => {
                  const newPin = pinInput + num;
                  if (newPin.length <= 4) setPinInput(newPin);
                  if (newPin.length === 4) handleVerifyGlobalPin(newPin);
                }}
                className="py-5 text-2xl font-bold rounded-2xl bg-[var(--surf2)] text-white hover:bg-[var(--gold)] hover:text-black transition-colors disabled:opacity-50">
                {num}
              </button>
            ))}
            <div className="col-span-1" />
            <button disabled={isVerifyingPin}
              onClick={() => {
                const newPin = pinInput + "0";
                if (newPin.length <= 4) setPinInput(newPin);
                if (newPin.length === 4) handleVerifyGlobalPin(newPin);
              }}
              className="py-5 text-2xl font-bold rounded-2xl bg-[var(--surf2)] text-white hover:bg-[var(--gold)] hover:text-black transition-colors disabled:opacity-50">
              0
            </button>
            <button disabled={isVerifyingPin}
              onClick={() => setPinInput(pinInput.slice(0,-1))}
              className="py-5 text-xl font-bold rounded-2xl bg-[var(--surf2)] text-red-500 disabled:opacity-50 hover:bg-red-500/10 transition-colors">
              ⌫
            </button>
          </div>
          {isVerifyingPin && <p className="text-center text-xs mt-4" style={{color:"var(--muted)"}}>Verificando...</p>}
          <button
            onClick={() => router.push("/setup")}
            className="w-full mt-6 text-xs text-gray-500 hover:text-gray-300 underline"
          >
            Configurar dispositivo
          </button>
        </div>
      </div>
    );
  }

  // ── TPV PRINCIPAL ──
  return (
    <div className="flex h-screen overflow-hidden" style={{background:"var(--bg)"}}>

      {/* ── MENÚ IZQUIERDA ── */}
      <div className="flex flex-col flex-1 overflow-hidden" style={{minWidth:0}}>
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex flex-col mr-2">
               <span className="text-[var(--gold)] font-black text-lg tracking-tight leading-none">{restaurantName}</span>
               <span className="text-[var(--muted)] text-[10px] font-bold uppercase tracking-widest leading-none mt-1">SaaS POS System</span>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
              style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
            <KDSMessages />

            <button
              onClick={() => setShowShiftModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0"
              style={{
                background: activeShift ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                color: activeShift ? "#22c55e" : "#ef4444",
                border: `1px solid ${activeShift ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
              }}>
              {activeShift ? "🟢 Turno" : "🔴 Sin turno"}
            </button>

            {(currentEmployee?.role === 'ADMIN' || currentEmployee?.role === 'MANAGER' || currentEmployee?.role === 'OWNER') && (
              <button onClick={() => setShowManagerMenu(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-colors hover:bg-[var(--gold)] hover:text-black"
                style={{background:"var(--surf2)",color:"var(--muted)",border:"1px solid var(--border)"}}>
                ⚙️ Ajustes
              </button>
            )}
            <div className="flex items-center gap-3 pl-2 border-l border-[var(--border)] ml-1">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-bold">Atendiendo</span>
                <span className="text-xs font-black text-[var(--gold)]">{currentEmployee?.name?.split(' ')[0] || "Cajero"}</span>
              </div>
              <button
                onClick={() => {
                  localStorage.removeItem('accessToken');
                  setIsGlobalLocked(true);
                  setCurrentEmployee(null);
                  setActiveShift(null);
                  setShowManagerMenu(false);
                  setOrders([]);
                  setAllItems([]);
                  setCategories([]);
                }}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-red-500 hover:bg-red-500/10 hover:text-white transition-colors bg-[var(--surf2)] border border-[var(--border)]"
                title="Bloquear Caja">
                🔒
              </button>
            </div>
          </div>
          {/* Categorías... */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button onClick={() => setSelectedCat("all")}
              className="px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
              style={{background:selectedCat==="all"?"var(--gold)":"var(--surf)",color:selectedCat==="all"?"#000":"var(--muted)",border:"1px solid var(--border)"}}>
              Todo
            </button>
            {categories.map((cat: any) => (
              <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
                style={{background:selectedCat===cat.id?"var(--gold)":"var(--surf)",color:selectedCat===cat.id?"#000":"var(--muted)",border:"1px solid var(--border)"}}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Productos... */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {allItems.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center" style={{color:"var(--muted)"}}>
                <div className="text-4xl mb-3 animate-spin">🍔</div>
                <div className="text-sm">Cargando menú...</div>
              </div>
            </div>
          ) : (
            <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))"}}>
              {filteredItems.map((item: any) => (
                <button key={item.id} onClick={() => handleItemClick(item)}
                  className="rounded-xl p-3 text-left border transition-all hover:scale-105 active:scale-95"
                  style={{background:"var(--surf)", borderColor:"var(--border)", opacity: activeShift ? 1 : 0.5}}>
                  {item.imageUrl && <img src={item.imageUrl} alt="" className="w-full h-20 object-cover rounded-lg mb-2" />}
                  <div className="text-xs font-bold leading-tight mb-1">{item.name}</div>
                  <div className="text-xs font-black" style={{color:"var(--gold)"}}>${item.price}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ticket... */}
        <div className="flex-shrink-0 border-t" style={{borderColor:"var(--border)",background:"var(--surf)",maxHeight:"55vh",display:"flex",flexDirection:"column"}}>
          <div className="flex items-center gap-1 px-3 pt-2 overflow-x-auto flex-shrink-0">
            {tickets.map((t: any, idx: number) => (
              <div key={t.id} className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setActiveTicket(idx)}
                  className="px-3 py-1.5 rounded-t-xl text-xs font-bold"
                  style={{background:activeTicket===idx?"var(--gold)":"var(--surf2)",color:activeTicket===idx?"#000":"var(--muted)"}}>
                  {t.name || `Ticket ${idx+1}`}
                </button>
                <button onClick={() => closeTicket(idx)} className="text-xs px-1" style={{color:"var(--muted)"}}>✕</button>
              </div>
            ))}
            <button onClick={addNewTicket} className="px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
              style={{background:"var(--surf2)",color:"var(--muted)"}}>+ Nuevo</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex gap-2 mb-2">
              <input value={ticket.name} onChange={e => updateTicket({name:e.target.value})} placeholder="Nombre cliente"
                className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
                style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
              <input value={ticket.phone} onChange={e => updateTicket({phone:e.target.value})} placeholder="Teléfono"
                className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
                style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
            </div>

            <div className="flex gap-2 mb-2">
              <button onClick={() => updateTicket({type:"TAKEOUT"})}
                className="flex-1 py-2 rounded-xl text-xs font-bold"
                style={{background:ticket.type==="TAKEOUT"?"var(--gold)":"var(--surf2)",color:ticket.type==="TAKEOUT"?"#000":"var(--muted)"}}>
                🥡 Llevar
              </button>
              <button onClick={() => updateTicket({type:"DINE_IN"})}
                className="flex-1 py-2 rounded-xl text-xs font-bold"
                style={{background:ticket.type==="DINE_IN"?"var(--gold)":"var(--surf2)",color:ticket.type==="DINE_IN"?"#000":"var(--muted)"}}>
                🪑 Mesa
              </button>
              <button onClick={() => updateTicket({type:"DELIVERY"})}
                className="flex-1 py-2 rounded-xl text-xs font-bold"
                style={{background:ticket.type==="DELIVERY"?"#f97316":"var(--surf2)",color:ticket.type==="DELIVERY"?"#fff":"var(--muted)"}}>
                🛵 Domicilio
              </button>
            </div>
            {ticket.type === "DINE_IN" && (
              <input value={ticket.table} onChange={e => updateTicket({table:e.target.value})}
                placeholder="# Mesa" type="number"
                className="w-full px-3 py-2 rounded-xl text-xs outline-none text-center mb-2"
                style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
            )}
            {ticket.type === "DELIVERY" && (
              <input value={ticket.address} onChange={e => updateTicket({address:e.target.value})}
                placeholder="📍 Dirección de entrega"
                className="w-full px-3 py-2 rounded-xl text-xs outline-none mb-2"
                style={{background:"var(--surf2)",border:"1px solid rgba(249,115,22,0.4)",color:"var(--text)"}} />
            )}

            {!activeShift && (
              <div className="rounded-xl p-3 mb-2 text-center"
                style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)"}}>
                <div className="text-xs font-bold mb-1" style={{color:"#ef4444"}}>🔴 No hay turno abierto</div>
                <button onClick={() => setShowShiftModal(true)}
                  className="text-xs font-black px-4 py-1.5 rounded-xl"
                  style={{background:"#ef4444",color:"#fff"}}>
                  Abrir turno ahora
                </button>
              </div>
            )}

            {ticket.items.length === 0 ? (
              <div className="text-center py-4 text-xs" style={{color:"var(--muted)"}}>Sin productos</div>
            ) : ticket.items.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center gap-2 py-1.5 border-b" style={{borderColor:"var(--border)"}}>
                <div className="flex-1 text-xs">
                  <span className="font-medium">{item.name}</span>
                  {item.variantName && <span className="ml-1" style={{color:"var(--gold)"}}>({item.variantName})</span>}
                  {item.notes && <div className="text-xs" style={{color:"var(--muted)"}}>{item.notes}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => changeQty(idx,-1)} className="w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center" style={{background:"var(--surf2)"}}>-</button>
                  <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                  <button onClick={() => changeQty(idx,1)} className="w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center" style={{background:"var(--surf2)"}}>+</button>
                </div>
                <div className="text-xs font-bold w-14 text-right" style={{color:"var(--gold)"}}>${item.subtotal.toFixed(0)}</div>
                <button onClick={() => removeFromTicket(idx)} className="w-6 h-6 rounded-lg text-xs flex items-center justify-center" style={{color:"#ef4444"}}>✕</button>
              </div>
            ))}
            {ticket.items.length > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-xs mb-1" style={{color:"var(--muted)"}}>
                  <span>Subtotal</span><span>${subtotal.toFixed(0)}</span>
                </div>
                <div className="flex justify-between font-syne font-black mb-3">
                  <span>Total</span><span style={{color:"var(--gold)"}}>${total.toFixed(0)}</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <button onClick={sendToKitchen}
                    className="flex-1 py-2 rounded-xl text-xs font-bold border"
                    style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                    🍳 A cocina
                  </button>
                  {PAY_METHODS.map((m: any) => (
                    <button key={m.value} onClick={() => chargeTicket(m.value)}
                      className="flex-1 py-2 rounded-xl text-xs font-black"
                      style={{background: activeShift ? "var(--gold)" : "var(--surf2)", color: activeShift ? "#000" : "var(--muted)"}}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PANEL LATERAL (PEDIDOS) ── */}
      <div className="flex-shrink-0 border-l flex flex-col"
        style={{width:showPanel?"300px":"44px",borderColor:"var(--border)",background:"var(--surf)",transition:"width 0.2s"}}>
        <button onClick={() => setShowPanel(p => !p)}
          className="w-full py-3 flex items-center justify-center gap-2 border-b flex-shrink-0 text-xs font-bold"
          style={{borderColor:"var(--border)",color:"var(--muted)"}}>
          {showPanel ? (
            <><span>Pedidos</span>
            <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-black mr-2" style={{background:"var(--gold)",color:"#000"}}>{orders.length}</span>
            <span>›</span></>
          ) : <span style={{writingMode:"vertical-rl",transform:"rotate(180deg)"}}>📋 {orders.length}</span>}
        </button>

        {showPanel && (
          <div className="flex-1 overflow-y-auto p-2">
            {orders.length === 0 ? (
              <div className="text-center py-12 text-xs" style={{color:"var(--muted)"}}>Sin pedidos activos</div>
            ) : orders.map((order: any) => {
              const sc = STATUS_COLORS[order.status] || "#888";
              const isSelected = selectedOrder?.id === order.id;
              return (
                <div key={order.id} className="rounded-xl border mb-2 overflow-hidden"
                  style={{borderColor:isSelected?"var(--gold)":"var(--border)",background:isSelected?"rgba(245,166,35,0.05)":"var(--surf2)"}}>
                  <button className="w-full px-3 py-2 flex items-center justify-between text-left"
                    onClick={() => setSelectedOrder(isSelected ? null : order)}>
                    <div>
                      <div className="text-xs font-bold">{order.customerName||order.user?.name||"Sin nombre"}{order.tableNumber&&<span style={{color:"#8b5cf6"}}> · Mesa {order.tableNumber}</span>}</div>
                      <div className="text-xs font-syne" style={{color:"var(--muted)"}}>{order.orderNumber}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs px-2 py-0.5 rounded-full font-bold mb-1" style={{background:sc+"18",color:sc}}>{STATUS_LABELS[order.status]}</div>
                      <div className="text-xs font-black" style={{color:"var(--gold)"}}>${Number(order.total).toFixed(0)}</div>
                    </div>
                  </button>
                  {isSelected && (
                    <div className="px-3 pb-3 border-t" style={{borderColor:"var(--border)"}}>
                      <div className="my-2 text-xs">
                        {(order.items||[]).map((item: any, i: number) => (
                          <div key={i} className="flex justify-between py-0.5">
                            <span>{item.quantity}x {item.name}</span>
                            <span>${Number(item.subtotal).toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {NEXT_STATUS[order.status] && (
                          <button onClick={() => updateOrderStatus(order.id,NEXT_STATUS[order.status])} disabled={updatingOrder===order.id}
                            className="w-full py-2 rounded-xl text-xs font-bold" style={{background:"var(--gold)",color:"#000"}}>
                            {updatingOrder===order.id?"...":`→ ${STATUS_LABELS[NEXT_STATUS[order.status]]}`}
                          </button>
                        )}
                        <button onClick={() => {setPayModal(order);setPayMethod("CASH");setCashReceived("");}}
                          className="w-full py-2 rounded-xl text-xs font-bold"
                          style={{background:"rgba(34,197,94,0.1)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.2)"}}>
                          💵 Cobrar ticket
                        </button>
                        <button onClick={() => updateOrderStatus(order.id,"CANCELLED")}
                          className="w-full py-2 rounded-xl text-xs font-bold" style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>
                          Cancelar pedido
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODALES ── */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.85)"}}>
          <div className="w-full max-w-sm rounded-2xl border p-6" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <h3 className="font-syne font-black text-lg mb-1">💵 Cobrar {payModal.orderNumber}</h3>
            <p className="text-2xl font-black mb-4" style={{color:"var(--gold)"}}>${Number(payModal.total).toFixed(0)}</p>
            <div className="flex gap-3">
              <button onClick={() => setPayModal(null)}
                className="flex-1 py-3 rounded-xl font-bold border" style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
              <button onClick={() => chargeExistingOrder(payModal.id,payMethod)} disabled={updatingOrder===payModal.id}
                className="flex-1 py-3 rounded-xl font-syne font-black" style={{background:"var(--gold)",color:"#000"}}>
                ✅ Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {showShiftModal && (
        <ShiftModal
          employee={{ id: currentEmployee?.id || "", name: currentEmployee?.name || "Cajero" }}
          onClose={() => { setShowShiftModal(false); refreshShift(); }}
        />
      )}

      {showManagerMenu && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowManagerMenu(false)} />
          <div className="relative w-80 h-full bg-[var(--surf)] border-l border-[var(--border)] shadow-2xl flex flex-col">
            <div className="p-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg)]">
              <div>
                <h2 className="text-xl font-syne font-black text-white">{currentEmployee?.name}</h2>
                <p className="text-xs text-[var(--gold)] font-bold">{currentEmployee?.role==='OWNER'?'Propietario':'Gerente'}</p>
              </div>
              <button onClick={() => setShowManagerMenu(false)} className="text-[var(--muted)] hover:text-white text-2xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <button onClick={() => {setShowManagerMenu(false);setShowShiftModal(true);}} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[var(--surf2)] transition-colors text-left border-b border-[var(--border)]/50">
                <span className="text-2xl">🕒</span>
                <div>
                  <div className="font-bold text-sm text-white">Turno de Caja</div>
                  <div className="text-xs" style={{color: activeShift ? "#22c55e" : "#ef4444"}}>
                    {activeShift ? "🟢 Turno abierto" : "🔴 Sin turno abierto"}
                  </div>
                </div>
              </button>
              <button onClick={() => router.push("/setup")} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[var(--surf2)] transition-colors text-left border-b border-[var(--border)]/50">
                <span className="text-2xl">🔧</span>
                <div><div className="font-bold text-sm text-white">Re-configurar</div><div className="text-xs text-[var(--muted)]">Cambiar ID de sucursal</div></div>
              </button>
            </div>
            <div className="p-4 border-t border-[var(--border)] bg-[var(--bg)]">
              <button onClick={() => {
                localStorage.removeItem('accessToken');
                setIsGlobalLocked(true);
                setCurrentEmployee(null);
                setActiveShift(null);
                setShowManagerMenu(false);
              }}
                className="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors">
                🔒 Bloquear sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
