"use client";
import TPVConfigModal from "@/components/admin/TPVConfigModal";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import KDSMessages from "@/components/admin/KDSMessages";
import IngredientShortageModal from "@/components/admin/IngredientShortageModal";
import DeliveryAssignModal from "@/components/admin/DeliveryAssignModal";
import ShiftModal from "@/components/admin/ShiftModal";
import { useRouter } from "next/navigation";

const ACCENT = "#ff5c35";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente", CONFIRMED: "Confirmado", PREPARING: "Preparando",
  READY: "Listo", DELIVERED: "Entregado", CANCELLED: "Cancelado",
};
const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b", CONFIRMED: "#3b82f6", PREPARING: "#8b5cf6",
  READY: "#22c55e", DELIVERED: "#6b7280", CANCELLED: "#ef4444",
};
const NEXT_STATUS: Record<string, string> = {
  PENDING: "CONFIRMED", CONFIRMED: "PREPARING", PREPARING: "READY", READY: "DELIVERED",
};
const PAY_METHODS = [
  { value: "CASH",     label: "💵 Efectivo" },
  { value: "CARD",     label: "💳 Tarjeta" },
  { value: "TRANSFER", label: "📲 Transferencia" },
  { value: "COURTESY", label: "🎁 Cortesía" },
];

type MobileTab = "menu" | "ticket" | "orders";

export default function TPVPage() {
  const router = useRouter();

  // SAAS
  const [restaurantName, setRestaurantName] = useState("MRTPVREST");
  const [locationName, setLocationName]     = useState("");
  const [isConfigured, setIsConfigured]     = useState(false);

  // Menú
  const [categories, setCategories]         = useState<any[]>([]);
  const [allItems, setAllItems]             = useState<any[]>([]);
  const [selectedCat, setSelectedCat]       = useState("all");
  const [search, setSearch]                 = useState("");
  const [settingsSearch, setSettingsSearch] = useState("");

  // Tickets
  const emptyTicket = () => ({ id: Date.now(), name: "", phone: "", type: "TAKEOUT", table: "", address: "", items: [], discount: 0, discountType: "percent" });
  const [tickets, setTickets]           = useState<any[]>([{ id: 1, name: "", phone: "", type: "TAKEOUT", table: "", address: "", items: [], discount: 0, discountType: "percent" }]);
  const [activeTicket, setActiveTicket] = useState(0);
  const [variantModal, setVariantModal]   = useState<any>(null);
  const [modifierModal, setModifierModal] = useState<any>(null);
  const [selectedMods, setSelectedMods]   = useState<any[]>([]);

  // Pedidos
  const [orders, setOrders]                       = useState<any[]>([]);
  const [pendingCashOrders, setPendingCashOrders] = useState<any[]>([]);
  const [showPanel, setShowPanel]                 = useState(true);
  const [panelTab, setPanelTab]                   = useState<"active" | "cash">("active");
  const [selectedOrder, setSelectedOrder]         = useState<any>(null);
  const [payModal, setPayModal]                   = useState<any>(null);
  const [payMethod, setPayMethod]                 = useState("CASH");
  const [cashReceived, setCashReceived]           = useState("");
  const [updatingOrder, setUpdatingOrder]         = useState<string | null>(null);
  const [addingToOrder, setAddingToOrder]         = useState<any>(null);
  const [printers, setPrinters]                   = useState<any[]>([]);
  const [reprintOpen, setReprintOpen]             = useState<string | null>(null);
  const [assignOrder, setAssignOrder]             = useState<any>(null);
  const [shortageOrder, setShortageOrder]         = useState<any>(null);
  const [editTypeOrder, setEditTypeOrder]         = useState<string | null>(null);
  const [editAddress, setEditAddress]             = useState("");
  const [confirmingCash, setConfirmingCash]       = useState<string | null>(null);

  // Bloqueo
  const [isGlobalLocked, setIsGlobalLocked]     = useState(true);
  const [currentEmployee, setCurrentEmployee]   = useState<any>(null);
  const [pinInput, setPinInput]                 = useState("");
  const [isVerifyingPin, setIsVerifyingPin]     = useState(false);

  // Email login (dispositivo no configurado)
  const [isEmailLogin, setIsEmailLogin]         = useState(false);
  const [emailInput, setEmailInput]             = useState("");
  const [passwordInput, setPasswordInput]       = useState("");
  const [loginError, setLoginError]             = useState("");
  const [isLoggingIn, setIsLoggingIn]           = useState(false);
  const [showPassword, setShowPassword]         = useState(false);

  // Modales manager
  const [showManagerMenu, setShowManagerMenu]     = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showShiftModal, setShowShiftModal]       = useState(false);
  const [showConfigModal, setShowConfigModal]     = useState(false);

  // Turno
  const [activeShift, setActiveShift] = useState<any>(null);

  // Mobile nav
  const [mobileTab, setMobileTab] = useState<MobileTab>("menu");

  const ticket  = tickets[activeTicket] || tickets[0];
  const isAdmin = ["ADMIN", "MANAGER", "OWNER"].includes(currentEmployee?.role);

  // ── SAAS INIT ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const restId = localStorage.getItem("restaurantId");
    const locId  = localStorage.getItem("locationId");
    if (!restId || !locId) {
      setIsEmailLogin(true);
    } else {
      setIsConfigured(true);
      api.get("/api/admin/config").then(res => {
        if (res.data.name)           setRestaurantName(res.data.name);
        if (res.data.locationName)   setLocationName(res.data.locationName);
        if (res.data.location?.name) setLocationName(res.data.location.name);
      }).catch(() => {});
    }
  }, [router]);

  async function refreshShift() {
    try { const { data } = await api.get("/api/shifts/active"); setActiveShift(data); }
    catch { setActiveShift(null); }
  }

  const handleVerifyGlobalPin = async (enteredPin: string) => {
    setIsVerifyingPin(true);
    try {
      const { data } = await api.post("/api/employees/login", { pin: enteredPin });
      localStorage.setItem("accessToken", data.token);
      setCurrentEmployee(data.employee);
      const role = data.employee?.role;
      if (role === "WAITER")  { router.push("/meseros"); return; }
      if (role === "KITCHEN") { localStorage.setItem("kdsEmployee", JSON.stringify(data.employee)); router.push("/kds"); return; }
      try { const { data: shift } = await api.get("/api/shifts/active"); setActiveShift(shift); } catch { setActiveShift(null); }
      setTimeout(() => setIsGlobalLocked(false), 100);
      setPinInput("");
    } catch { alert("PIN Incorrecto ❌"); setPinInput(""); }
    finally { setIsVerifyingPin(false); }
  };

  const handleEmailLogin = async () => {
    setIsLoggingIn(true);
    setLoginError("");
    try {
      const { data } = await api.post("/api/auth/login", { email: emailInput, password: passwordInput });
      const token  = data.token;
      const restId = data.restaurant?.id          || data.user?.restaurantId;
      const locId  = data.restaurant?.locationId  || data.user?.locationId;
      if (token)  localStorage.setItem("accessToken",  token);
      if (restId) localStorage.setItem("restaurantId", String(restId));
      if (locId)  localStorage.setItem("locationId",   String(locId));
      if (data.restaurant?.name)           setRestaurantName(data.restaurant.name);
      if (data.restaurant?.location?.name) setLocationName(data.restaurant.location.name);
      setIsConfigured(true);
      setIsEmailLogin(false);
    } catch {
      setLoginError("Credenciales incorrectas");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/api/orders/admin");
      setOrders(data.filter((o: any) => !["DELIVERED", "CANCELLED"].includes(o.status) && (o.source === "TPV" || o.source === "WAITER")));
      setPendingCashOrders(data.filter((o: any) => o.status === "DELIVERED" && o.cashCollected === false && o.paymentMethod === "CASH_ON_DELIVERY"));
    } catch {}
  }, []);

  useEffect(() => {
    if (!isConfigured || isGlobalLocked) return;
    Promise.all([api.get("/api/menu/categories"), api.get("/api/menu/items"), api.get("/api/printers")])
      .then(([c, i, p]) => {
        setCategories(c.data);
        setAllItems(i.data);
        setPrinters((p.data || []).filter((pr: any) => pr.type !== "CASHIER" && pr.isActive));
      }).catch(err => { if (err?.response?.status !== 429) console.error(err); });
    fetchOrders();
    const t = setInterval(fetchOrders, 15000);
    return () => clearInterval(t);
  }, [fetchOrders, isGlobalLocked, isConfigured]);

  if (!isConfigured) return null;

  // ── TICKET HELPERS ─────────────────────────────────────────────────────────
  function updateTicket(patch: any) {
    setTickets(ts => ts.map((t, i) => i === activeTicket ? { ...t, ...patch } : t));
  }
  function addNewTicket() {
    setTickets(ts => [...ts, emptyTicket()]);
    setActiveTicket(tickets.length);
  }
  function closeTicket(idx: number) {
    if (tickets.length === 1) { setTickets([emptyTicket()]); return; }
    const next = tickets.filter((_, i) => i !== idx);
    setTickets(next);
    setActiveTicket(Math.min(activeTicket, next.length - 1));
  }

  function addToTicket(item: any, variant: any, mods: any[]) {
    const activePrice = variant
      ? variant.price
      : (item.isPromo && item.promoPrice ? item.promoPrice : item.price);
    const modsPrice  = mods.reduce((s, m) => s + m.price, 0);
    const totalPrice = activePrice + modsPrice;
    const modNotes   = mods.map(m => m.name).join(", ");
    const existing   = ticket.items.find((i: any) =>
      i.menuItemId === item.id && i.variantId === (variant?.id || null) && i.notes === modNotes
    );
    if (existing) {
      updateTicket({ items: ticket.items.map((i: any) =>
        i === existing ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * totalPrice } : i
      )});
    } else {
      updateTicket({ items: [...ticket.items, {
        menuItemId:    item.id,
        name:          item.name,
        variantId:     variant?.id   || null,
        variantName:   variant?.name || null,
        price:         totalPrice,
        originalPrice: (!variant && item.isPromo && item.promoPrice) ? item.price : null,
        isPromo:       !variant && item.isPromo && !!item.promoPrice,
        quantity:      1,
        subtotal:      totalPrice,
        notes:         modNotes,
        mods,
      }]});
    }
  }

  function handleItemClick(item: any) {
    if (!activeShift) { alert("⚠️ Debes abrir un turno antes de agregar productos"); setShowShiftModal(true); return; }
    if (addingToOrder) {
      if (item.variants?.length > 0)    { setVariantModal({ item, forOrder: addingToOrder }); return; }
      if (item.complements?.length > 0) { setModifierModal({ item, variant: null, forOrder: addingToOrder }); return; }
      addItemToExistingOrder(addingToOrder, item, null, []);
      return;
    }
    if (item.variants?.length > 0)    { setVariantModal({ item }); return; }
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
        menuItemId: item.id, name: item.name + (variant ? ` - ${variant.name}` : ""),
        price: finalPrice, quantity: 1, subtotal: finalPrice,
        notes: (mods || []).map((m: any) => m.name).join(", "),
      });
      setAddingToOrder(null); fetchOrders();
      if (selectedOrder?.id === order.id) { const { data } = await api.get(`/api/orders/${order.id}`); setSelectedOrder(data); }
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

  const subtotal    = ticket.items.reduce((s: number, i: any) => s + i.subtotal, 0);
  const discountAmt = ticket.discountType === "percent" ? subtotal * (ticket.discount / 100) : Number(ticket.discount);
  const total       = Math.max(0, subtotal - discountAmt);

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
      closeTicket(activeTicket); fetchOrders();
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
      closeTicket(activeTicket); fetchOrders();
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
  }

  async function chargeExistingOrder(orderId: string, method: string) {
    if (!activeShift) { alert("⚠️ Debes abrir un turno antes de cobrar"); setShowShiftModal(true); return; }
    setUpdatingOrder(orderId);
    try {
      await api.put(`/api/orders/${orderId}/payment`, { paymentMethod: method });
      setPayModal(null); setSelectedOrder(null); fetchOrders();
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
      fetchOrders(); setEditTypeOrder(null); setEditAddress("");
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
    try { await api.post(`/api/orders/${order.id}/print-bill`); alert("🖨️ Cuenta enviada a imprimir"); }
    catch { alert("Error al imprimir"); }
  }

  async function confirmCash(order: any) {
    if (!activeShift) { alert("⚠️ Debes abrir un turno para confirmar cobros"); setShowShiftModal(true); return; }
    if (!confirm(`¿Confirmar recepción de $${Number(order.total).toFixed(0)} en efectivo de ${order.orderNumber}?`)) return;
    setConfirmingCash(order.id);
    try {
      await api.put(`/api/orders/${order.id}/confirm-cash`, { collectedBy: "TPV" });
      fetchOrders(); alert(`✅ Cobro confirmado: ${order.orderNumber}`);
    } catch (err: any) { alert(err.response?.data?.error || "Error al confirmar cobro"); }
    finally { setConfirmingCash(null); }
  }

  async function confirmAllCash() {
    if (!activeShift) { alert("⚠️ Debes abrir un turno para confirmar cobros"); setShowShiftModal(true); return; }
    if (pendingCashOrders.length === 0) return;
    const totalAmt = pendingCashOrders.reduce((s, o) => s + Number(o.total), 0);
    if (!confirm(`¿Confirmar TODOS los cobros pendientes?\n${pendingCashOrders.length} pedidos · $${totalAmt.toFixed(0)} total`)) return;
    for (const order of pendingCashOrders)
      await api.put(`/api/orders/${order.id}/confirm-cash`, { collectedBy: "TPV" }).catch(() => {});
    fetchOrders(); alert(`✅ ${pendingCashOrders.length} cobros confirmados`);
  }

  const filteredItems = allItems.filter((i: any) => {
    const matchCat    = selectedCat === "all" || i.categoryId === selectedCat;
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch && i.isAvailable !== false;
  });
  const filteredSettingsItems = allItems.filter((p: any) =>
    p.name.toLowerCase().includes(settingsSearch.toLowerCase())
  );

  // ── PANTALLA DE BLOQUEO ────────────────────────────────────────────────────
  if (isEmailLogin) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)] flex-col px-4">
        <h1 className="text-5xl font-syne font-black mb-1 text-center uppercase tracking-tighter"
          style={{ color: ACCENT }}>MRTPVREST</h1>
        <p className="text-[var(--muted)] mb-10 text-center text-sm font-medium">Configura este dispositivo</p>
        <div className="bg-[var(--surf)] border border-[var(--border)] p-8 rounded-[2rem] w-full max-w-sm shadow-2xl flex flex-col gap-4">
          <input
            type="email"
            placeholder="Correo electrónico"
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleEmailLogin()}
            className="w-full px-4 py-3 rounded-2xl text-sm outline-none"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Contraseña"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleEmailLogin()}
              className="w-full px-4 py-3 rounded-2xl text-sm outline-none pr-12"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-sm"
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>
          {loginError && (
            <p className="text-center text-sm text-red-400">{loginError}</p>
          )}
          <button
            onClick={handleEmailLogin}
            disabled={isLoggingIn || !emailInput || !passwordInput}
            className="w-full py-4 rounded-2xl text-base font-black uppercase tracking-wide transition-opacity disabled:opacity-50"
            style={{ background: ACCENT, color: "#000" }}
          >
            {isLoggingIn ? "Ingresando..." : "Ingresar"}
          </button>
        </div>
      </div>
    );
  }

  if (isGlobalLocked) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)] flex-col px-4">
        <h1 className="text-5xl font-syne font-black mb-1 text-center uppercase tracking-tighter"
          style={{ color: ACCENT }}>{restaurantName}</h1>
        {locationName && (
          <p className="text-sm font-bold mb-1 text-center" style={{ color: "var(--muted)" }}>
            Sucursal: {locationName}
          </p>
        )}
        <p className="text-[var(--muted)] mb-10 text-center text-sm font-medium">Terminal de Punto de Venta</p>
        <div className="bg-[var(--surf)] border border-[var(--border)] p-8 rounded-[2rem] w-full max-w-sm shadow-2xl">
          <h2 className="text-xl font-bold text-white text-center mb-6">Ingresa tu PIN</h2>
          <div className="flex justify-center gap-3 mb-8">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full transition-all ${pinInput.length > i ? "scale-110" : "bg-[var(--surf2)]"}`}
                style={{ background: pinInput.length > i ? ACCENT : undefined }} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-2">
            {[1,2,3,4,5,6,7,8,9].map(num => (
              <button key={num} disabled={isVerifyingPin}
                onClick={() => {
                  const p = pinInput + num;
                  if (p.length <= 4) setPinInput(p);
                  if (p.length === 4) handleVerifyGlobalPin(p);
                }}
                className="py-5 text-2xl font-bold rounded-2xl bg-[var(--surf2)] text-white disabled:opacity-50 transition-colors"
                onMouseEnter={e => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = "#000"; }}
                onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = ""; }}>
                {num}
              </button>
            ))}
            <div />
            <button disabled={isVerifyingPin}
              onClick={() => { const p = pinInput + "0"; if (p.length <= 4) setPinInput(p); if (p.length === 4) handleVerifyGlobalPin(p); }}
              className="py-5 text-2xl font-bold rounded-2xl bg-[var(--surf2)] text-white disabled:opacity-50 transition-colors"
              onMouseEnter={e => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = "#000"; }}
              onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = ""; }}>
              0
            </button>
            <button disabled={isVerifyingPin} onClick={() => setPinInput(p => p.slice(0, -1))}
              className="py-5 text-xl font-bold rounded-2xl bg-[var(--surf2)] text-red-500 disabled:opacity-50 hover:bg-red-500/10 transition-colors">
              ⌫
            </button>
          </div>
          {isVerifyingPin && <p className="text-center text-xs mt-4" style={{ color: "var(--muted)" }}>Verificando...</p>}
          <button onClick={() => router.push("/setup")}
            className="w-full mt-6 text-xs text-gray-500 hover:text-gray-300 underline">
            Cambiar sucursal
          </button>
        </div>
      </div>
    );
  }

  // ── TPV PRINCIPAL ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* ── HEADER ── */}
      <header className="flex items-center gap-2 px-3 h-12 flex-shrink-0 border-b"
        style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
        <div className="flex flex-col min-w-0 mr-1 leading-none">
          <span className="text-sm font-black tracking-tight truncate" style={{ color: ACCENT }}>{restaurantName}</span>
          {locationName && <span className="text-[9px] font-bold uppercase tracking-widest truncate mt-0.5" style={{ color: "var(--muted)" }}>{locationName}</span>}
        </div>
        <div className={`flex-1 min-w-0 ${mobileTab !== "menu" ? "hidden md:block" : ""}`}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..."
            className="w-full px-3 py-1.5 rounded-xl text-sm outline-none"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
        </div>
        {mobileTab !== "menu" && <div className="flex-1 md:hidden" />}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <KDSMessages />
          <button onClick={() => setShowShiftModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold"
            style={{ background: activeShift ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: activeShift ? "#22c55e" : "#ef4444", border: `1px solid ${activeShift ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
            {activeShift ? "🟢" : "🔴"}
            <span className="hidden sm:inline ml-0.5">{activeShift ? "Turno" : "Sin turno"}</span>
          </button>
          <div className="hidden sm:flex flex-col items-end leading-none">
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Atendiendo</span>
            <span className="text-xs font-black" style={{ color: ACCENT }}>{currentEmployee?.name?.split(" ")[0] || "Cajero"}</span>
          </div>
          {isAdmin && (
            <button onClick={() => setShowManagerMenu(true)}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
              style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--muted)" }} title="Ajustes">
              ⚙️
            </button>
          )}
          <button
            onClick={() => { localStorage.removeItem("accessToken"); setIsGlobalLocked(true); setCurrentEmployee(null); setActiveShift(null); setShowManagerMenu(false); setOrders([]); setAllItems([]); setCategories([]); }}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-red-500 hover:bg-red-500/10 transition-colors"
            style={{ background: "var(--surf2)", border: "1px solid var(--border)" }} title="Bloquear Caja">
            🔒
          </button>
        </div>
      </header>

      {/* ── MOBILE LAYOUT ── */}
      <div className="flex flex-col flex-1 overflow-hidden min-h-0 md:hidden">

        {/* Menú tab */}
        {mobileTab === "menu" && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Categorías */}
            <div className="flex gap-1.5 overflow-x-auto px-3 py-2 flex-shrink-0 border-b" style={{ borderColor: "var(--border)" }}>
              {[{ id: "all", name: "Todo" }, ...categories].map(cat => (
                <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 transition-colors"
                  style={{ background: selectedCat === cat.id ? ACCENT : "var(--surf)", color: selectedCat === cat.id ? "#000" : "var(--muted)", border: "1px solid var(--border)" }}>
                  {cat.name}
                </button>
              ))}
            </div>
            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-3 pb-20">
              {allItems.length === 0 ? (
                <div className="flex items-center justify-center h-full flex-col gap-3" style={{ color: "var(--muted)" }}>
                  <div className="text-4xl animate-spin">🍔</div>
                  <div className="text-sm">Cargando menú...</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {filteredItems.map((item: any) => (
                    <button key={item.id} onClick={() => handleItemClick(item)}
                      className="relative rounded-xl p-3 text-left border transition-all active:scale-95"
                      style={{ background: "var(--surf)", borderColor: "var(--border)", opacity: activeShift ? 1 : 0.5 }}>
                      {item.isPromo && item.promoPrice && (
                        <span className="absolute top-1.5 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full z-10"
                          style={{ background: ACCENT, color: "#fff" }}>% OFF</span>
                      )}
                      {item.imageUrl && <img src={item.imageUrl} alt="" className="w-full h-20 object-cover rounded-lg mb-2" />}
                      <div className="text-xs font-bold leading-tight mb-1 line-clamp-2">{item.name}</div>
                      {item.isPromo && item.promoPrice ? (
                        <div className="flex items-baseline gap-1 flex-wrap">
                          <span className="text-[10px] line-through" style={{ color: "var(--muted)" }}>${item.price}</span>
                          <span className="text-xs font-black" style={{ color: ACCENT }}>${item.promoPrice}</span>
                        </div>
                      ) : (
                        <div className="text-xs font-black" style={{ color: ACCENT }}>${item.price}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Ticket tab */}
        {mobileTab === "ticket" && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ background: "var(--surf)" }}>
            {/* Tabs de tickets */}
            <div className="flex items-center gap-0.5 px-2 pt-2 overflow-x-auto flex-shrink-0 border-b" style={{ borderColor: "var(--border)" }}>
              {tickets.map((t: any, idx: number) => (
                <div key={t.id} className="flex items-center gap-0.5 flex-shrink-0">
                  <button onClick={() => setActiveTicket(idx)}
                    className="px-3 py-1.5 rounded-t-xl text-xs font-bold transition-colors"
                    style={{ background: activeTicket === idx ? ACCENT : "var(--surf2)", color: activeTicket === idx ? "#000" : "var(--muted)" }}>
                    {t.name || `T${idx + 1}`}
                  </button>
                  <button onClick={() => closeTicket(idx)} className="text-[10px] px-1" style={{ color: "var(--muted)" }}>✕</button>
                </div>
              ))}
              <button onClick={addNewTicket} className="px-2 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 ml-1"
                style={{ background: "var(--surf2)", color: "var(--muted)" }}>+</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 pb-20 space-y-2">
              {!activeShift && (
                <div className="rounded-xl p-3 flex items-center justify-between"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <span className="text-xs font-bold" style={{ color: "#ef4444" }}>🔴 Sin turno abierto</span>
                  <button onClick={() => setShowShiftModal(true)}
                    className="text-xs font-black px-3 py-1.5 rounded-xl min-h-[44px]"
                    style={{ background: "#ef4444", color: "#fff" }}>Abrir turno</button>
                </div>
              )}
              <div className="flex gap-2">
                <input value={ticket.name} onChange={e => updateTicket({ name: e.target.value })}
                  placeholder="Nombre" className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
                  style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                <input value={ticket.phone} onChange={e => updateTicket({ phone: e.target.value })}
                  placeholder="Tel" type="tel" className="w-28 px-3 py-2 rounded-xl text-xs outline-none"
                  style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }} />
              </div>
              <div className="flex gap-1.5">
                {[{ t: "TAKEOUT", l: "🥡 Llevar" }, { t: "DINE_IN", l: "🪑 Mesa" }, { t: "DELIVERY", l: "🛵 Domicilio" }].map(({ t, l }) => (
                  <button key={t} onClick={() => updateTicket({ type: t })}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold min-h-[44px] transition-colors"
                    style={{ background: ticket.type === t ? ACCENT : "var(--surf2)", color: ticket.type === t ? "#fff" : "var(--muted)" }}>
                    {l}
                  </button>
                ))}
              </div>
              {ticket.type === "DINE_IN" && (
                <input value={ticket.table} onChange={e => updateTicket({ table: e.target.value })}
                  placeholder="# Mesa" type="number" className="w-full px-3 py-2 rounded-xl text-xs outline-none text-center"
                  style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }} />
              )}
              {ticket.type === "DELIVERY" && (
                <input value={ticket.address} onChange={e => updateTicket({ address: e.target.value })}
                  placeholder="📍 Dirección de entrega" className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                  style={{ background: "var(--surf2)", border: `1px solid ${ACCENT}55`, color: "var(--text)" }} />
              )}
              {ticket.items.length === 0 ? (
                <div className="text-center py-10 text-xs" style={{ color: "var(--muted)" }}>Sin productos</div>
              ) : ticket.items.map((item: any, idx: number) => (
                <div key={idx} className="flex items-start gap-2 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                  <div className="flex-1 text-xs min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-medium">{item.name}</span>
                      {item.variantName && <span className="font-bold" style={{ color: ACCENT }}>({item.variantName})</span>}
                      {item.isPromo && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: ACCENT + "22", color: ACCENT }}>PROMO</span>}
                    </div>
                    {item.notes && <div className="text-[10px]" style={{ color: "var(--muted)" }}>{item.notes}</div>}
                    {item.isPromo && item.originalPrice && (
                      <div className="text-[10px]" style={{ color: "var(--muted)" }}>Normal: <span className="line-through">${item.originalPrice}</span></div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => changeQty(idx, -1)} className="w-7 h-7 rounded-lg text-sm font-black flex items-center justify-center" style={{ background: "var(--surf2)" }}>−</button>
                    <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                    <button onClick={() => changeQty(idx, 1)} className="w-7 h-7 rounded-lg text-sm font-black flex items-center justify-center" style={{ background: "var(--surf2)" }}>+</button>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0">
                    <span className="text-xs font-black" style={{ color: ACCENT }}>${item.subtotal.toFixed(0)}</span>
                    <button onClick={() => removeFromTicket(idx)} className="text-[10px] mt-0.5" style={{ color: "#ef4444" }}>✕</button>
                  </div>
                </div>
              ))}
              {ticket.items.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs" style={{ color: "var(--muted)" }}><span>Subtotal</span><span>${subtotal.toFixed(0)}</span></div>
                  {discountAmt > 0 && <div className="flex justify-between text-xs" style={{ color: "#22c55e" }}><span>Descuento</span><span>−${discountAmt.toFixed(0)}</span></div>}
                  <div className="flex justify-between font-black text-xl py-1"><span>Total</span><span style={{ color: ACCENT }}>${total.toFixed(0)}</span></div>
                  <button onClick={sendToKitchen} className="w-full py-3 rounded-xl text-xs font-bold border min-h-[44px]"
                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}>🍳 Enviar a cocina</button>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PAY_METHODS.map(m => (
                      <button key={m.value} onClick={() => chargeTicket(m.value)}
                        className="py-3 rounded-xl text-xs font-black min-h-[44px] transition-colors"
                        style={{ background: activeShift ? ACCENT : "var(--surf2)", color: activeShift ? "#fff" : "var(--muted)" }}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pedidos tab */}
        {mobileTab === "orders" && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ background: "var(--surf)" }}>
            <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
              <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: "var(--muted)" }}>Pedidos activos</span>
              {orders.length > 0 && <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: ACCENT, color: "#fff" }}>{orders.length}</span>}
            </div>
            <div className="flex-1 overflow-y-auto p-2 pb-20">
              {orders.length === 0 ? (
                <div className="text-center py-12 text-xs" style={{ color: "var(--muted)" }}>Sin pedidos activos</div>
              ) : orders.map((order: any) => {
                const sc   = STATUS_COLORS[order.status] || "#888";
                const isSel = selectedOrder?.id === order.id;
                return (
                  <div key={order.id} className="rounded-xl border mb-2 overflow-hidden"
                    style={{ borderColor: isSel ? ACCENT : "var(--border)", background: isSel ? ACCENT + "08" : "var(--surf2)" }}>
                    <button className="w-full px-3 py-2.5 flex items-center justify-between text-left"
                      onClick={() => setSelectedOrder(isSel ? null : order)}>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">
                          {order.customerName || order.user?.name || "Sin nombre"}
                          {order.tableNumber && <span style={{ color: "#8b5cf6" }}> · Mesa {order.tableNumber}</span>}
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--muted)" }}>{order.orderNumber}</div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className="text-[10px] px-1.5 py-0.5 rounded-full font-bold mb-1" style={{ background: sc + "18", color: sc }}>{STATUS_LABELS[order.status]}</div>
                        <div className="text-xs font-black" style={{ color: ACCENT }}>${Number(order.total).toFixed(0)}</div>
                      </div>
                    </button>
                    {isSel && (
                      <div className="px-3 pb-3 border-t" style={{ borderColor: "var(--border)" }}>
                        <div className="my-2 space-y-0.5 text-xs">
                          {(order.items || []).map((item: any, i: number) => (
                            <div key={i} className="flex justify-between"><span>{item.quantity}x {item.name}</span><span>${Number(item.subtotal).toFixed(0)}</span></div>
                          ))}
                        </div>
                        <div className="space-y-1.5">
                          {(() => { const nextStatus = NEXT_STATUS[order.status]; return nextStatus && (
                            <button onClick={() => updateOrderStatus(order.id, nextStatus)} disabled={updatingOrder === order.id}
                              className="w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px]"
                              style={{ background: ACCENT, color: "#fff" }}>
                              {updatingOrder === order.id ? "..." : `→ ${STATUS_LABELS[nextStatus]}`}
                            </button>
                          ); })()}
                          <button onClick={() => { setPayModal(order); setPayMethod("CASH"); setCashReceived(""); }}
                            className="w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px]"
                            style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>
                            💵 Cobrar ticket
                          </button>
                          <button onClick={() => updateOrderStatus(order.id, "CANCELLED")}
                            className="w-full py-2.5 rounded-xl text-xs font-bold"
                            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                            Cancelar pedido
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom nav */}
        <nav className="flex-shrink-0 flex border-t" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
          {([
            { tab: "menu"   as MobileTab, icon: "🍔", label: "Menú",    badge: 0 },
            { tab: "ticket" as MobileTab, icon: "🧾", label: "Ticket",  badge: ticket.items.length },
            { tab: "orders" as MobileTab, icon: "📋", label: "Pedidos", badge: orders.length },
          ] as const).map(({ tab, icon, label, badge }) => (
            <button key={tab} onClick={() => setMobileTab(tab)}
              className="flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-bold relative transition-colors"
              style={{ color: mobileTab === tab ? ACCENT : "var(--muted)" }}>
              <span className="text-xl leading-none">{icon}</span>
              <span>{label}{badge > 0 ? ` ${badge}` : ""}</span>
              {mobileTab === tab && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{ background: ACCENT }} />}
            </button>
          ))}
        </nav>
      </div>

      {/* ── DESKTOP LAYOUT ── */}
      <div className="hidden md:flex flex-1 overflow-hidden min-h-0">

        {/* Col 1: Menú */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <div className="flex gap-1.5 overflow-x-auto px-3 py-2 flex-shrink-0 border-b" style={{ borderColor: "var(--border)" }}>
            {[{ id: "all", name: "Todo" }, ...categories].map(cat => (
              <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 transition-colors"
                style={{ background: selectedCat === cat.id ? ACCENT : "var(--surf)", color: selectedCat === cat.id ? "#000" : "var(--muted)", border: "1px solid var(--border)" }}>
                {cat.name}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {allItems.length === 0 ? (
              <div className="flex items-center justify-center h-full flex-col gap-3" style={{ color: "var(--muted)" }}>
                <div className="text-4xl animate-spin">🍔</div>
                <div className="text-sm">Cargando menú...</div>
              </div>
            ) : (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
                {filteredItems.map((item: any) => (
                  <button key={item.id} onClick={() => handleItemClick(item)}
                    className="relative rounded-xl p-2.5 text-left border transition-all active:scale-95 hover:border-[#ff5c35]/40"
                    style={{ background: "var(--surf)", borderColor: "var(--border)", opacity: activeShift ? 1 : 0.5 }}>
                    {item.isPromo && item.promoPrice && (
                      <span className="absolute top-1.5 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full z-10"
                        style={{ background: ACCENT, color: "#fff" }}>% OFF</span>
                    )}
                    {item.imageUrl && <img src={item.imageUrl} alt="" className="w-full h-16 object-cover rounded-lg mb-2" />}
                    <div className="text-xs font-bold leading-tight mb-1 line-clamp-2">{item.name}</div>
                    {item.isPromo && item.promoPrice ? (
                      <div className="flex items-baseline gap-1 flex-wrap">
                        <span className="text-[10px] line-through" style={{ color: "var(--muted)" }}>${item.price}</span>
                        <span className="text-xs font-black" style={{ color: ACCENT }}>${item.promoPrice}</span>
                      </div>
                    ) : (
                      <div className="text-xs font-black" style={{ color: ACCENT }}>${item.price}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Col 2: Ticket */}
        <div className="flex flex-col flex-shrink-0 overflow-hidden border-l" style={{ width: "360px", borderColor: "var(--border)", background: "var(--surf)" }}>
          <div className="flex items-center gap-0.5 px-2 pt-2 overflow-x-auto flex-shrink-0 border-b" style={{ borderColor: "var(--border)" }}>
            {tickets.map((t: any, idx: number) => (
              <div key={t.id} className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={() => setActiveTicket(idx)}
                  className="px-3 py-1.5 rounded-t-xl text-xs font-bold transition-colors"
                  style={{ background: activeTicket === idx ? ACCENT : "var(--surf2)", color: activeTicket === idx ? "#000" : "var(--muted)" }}>
                  {t.name || `T${idx + 1}`}
                </button>
                <button onClick={() => closeTicket(idx)} className="text-[10px] px-1" style={{ color: "var(--muted)" }}>✕</button>
              </div>
            ))}
            <button onClick={addNewTicket} className="px-2 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 ml-1"
              style={{ background: "var(--surf2)", color: "var(--muted)" }}>+</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {!activeShift && (
              <div className="rounded-xl p-3 flex items-center justify-between"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <span className="text-xs font-bold" style={{ color: "#ef4444" }}>🔴 Sin turno abierto</span>
                <button onClick={() => setShowShiftModal(true)}
                  className="text-xs font-black px-3 py-1.5 rounded-xl min-h-[44px]"
                  style={{ background: "#ef4444", color: "#fff" }}>Abrir turno</button>
              </div>
            )}
            <div className="flex gap-2">
              <input value={ticket.name} onChange={e => updateTicket({ name: e.target.value })}
                placeholder="Nombre" className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
                style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }} />
              <input value={ticket.phone} onChange={e => updateTicket({ phone: e.target.value })}
                placeholder="Tel" type="tel" className="w-28 px-3 py-2 rounded-xl text-xs outline-none"
                style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }} />
            </div>
            <div className="flex gap-1.5">
              {[{ t: "TAKEOUT", l: "🥡 Llevar" }, { t: "DINE_IN", l: "🪑 Mesa" }, { t: "DELIVERY", l: "🛵 Domicilio" }].map(({ t, l }) => (
                <button key={t} onClick={() => updateTicket({ type: t })}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold min-h-[44px] transition-colors"
                  style={{ background: ticket.type === t ? ACCENT : "var(--surf2)", color: ticket.type === t ? "#fff" : "var(--muted)" }}>
                  {l}
                </button>
              ))}
            </div>
            {ticket.type === "DINE_IN" && (
              <input value={ticket.table} onChange={e => updateTicket({ table: e.target.value })}
                placeholder="# Mesa" type="number" className="w-full px-3 py-2 rounded-xl text-xs outline-none text-center"
                style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }} />
            )}
            {ticket.type === "DELIVERY" && (
              <input value={ticket.address} onChange={e => updateTicket({ address: e.target.value })}
                placeholder="📍 Dirección de entrega" className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                style={{ background: "var(--surf2)", border: `1px solid ${ACCENT}55`, color: "var(--text)" }} />
            )}
            {ticket.items.length === 0 ? (
              <div className="text-center py-8 text-xs" style={{ color: "var(--muted)" }}>Sin productos</div>
            ) : ticket.items.map((item: any, idx: number) => (
              <div key={idx} className="flex items-start gap-2 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex-1 text-xs min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="font-medium">{item.name}</span>
                    {item.variantName && <span className="font-bold" style={{ color: ACCENT }}>({item.variantName})</span>}
                    {item.isPromo && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: ACCENT + "22", color: ACCENT }}>PROMO</span>}
                  </div>
                  {item.notes && <div className="text-[10px]" style={{ color: "var(--muted)" }}>{item.notes}</div>}
                  {item.isPromo && item.originalPrice && (
                    <div className="text-[10px]" style={{ color: "var(--muted)" }}>Normal: <span className="line-through">${item.originalPrice}</span></div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => changeQty(idx, -1)} className="w-7 h-7 rounded-lg text-sm font-black flex items-center justify-center" style={{ background: "var(--surf2)" }}>−</button>
                  <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                  <button onClick={() => changeQty(idx, 1)} className="w-7 h-7 rounded-lg text-sm font-black flex items-center justify-center" style={{ background: "var(--surf2)" }}>+</button>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-xs font-black" style={{ color: ACCENT }}>${item.subtotal.toFixed(0)}</span>
                  <button onClick={() => removeFromTicket(idx)} className="text-[10px] mt-0.5" style={{ color: "#ef4444" }}>✕</button>
                </div>
              </div>
            ))}
            {ticket.items.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-xs" style={{ color: "var(--muted)" }}><span>Subtotal</span><span>${subtotal.toFixed(0)}</span></div>
                {discountAmt > 0 && <div className="flex justify-between text-xs" style={{ color: "#22c55e" }}><span>Descuento</span><span>−${discountAmt.toFixed(0)}</span></div>}
                <div className="flex justify-between font-black text-xl py-1"><span>Total</span><span style={{ color: ACCENT }}>${total.toFixed(0)}</span></div>
                <button onClick={sendToKitchen} className="w-full py-3 rounded-xl text-xs font-bold border min-h-[44px] hover:bg-white/5 transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}>🍳 Enviar a cocina</button>
                <div className="grid grid-cols-2 gap-1.5">
                  {PAY_METHODS.map(m => (
                    <button key={m.value} onClick={() => chargeTicket(m.value)}
                      className="py-3 rounded-xl text-xs font-black min-h-[44px] transition-colors"
                      style={{ background: activeShift ? ACCENT : "var(--surf2)", color: activeShift ? "#fff" : "var(--muted)" }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Col 3: Pedidos (colapsable) */}
        {showPanel ? (
          <div className="flex flex-col flex-shrink-0 overflow-hidden border-l" style={{ width: "280px", borderColor: "var(--border)", background: "var(--surf)" }}>
            <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
              <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: "var(--muted)" }}>Pedidos activos</span>
              <div className="flex items-center gap-1.5">
                {orders.length > 0 && <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: ACCENT, color: "#fff" }}>{orders.length}</span>}
                <button onClick={() => setShowPanel(false)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-xs"
                  style={{ background: "var(--surf2)", color: "var(--muted)" }}>›</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {orders.length === 0 ? (
                <div className="text-center py-12 text-xs" style={{ color: "var(--muted)" }}>Sin pedidos activos</div>
              ) : orders.map((order: any) => {
                const sc   = STATUS_COLORS[order.status] || "#888";
                const isSel = selectedOrder?.id === order.id;
                return (
                  <div key={order.id} className="rounded-xl border mb-2 overflow-hidden"
                    style={{ borderColor: isSel ? ACCENT : "var(--border)", background: isSel ? ACCENT + "08" : "var(--surf2)" }}>
                    <button className="w-full px-3 py-2.5 flex items-center justify-between text-left"
                      onClick={() => setSelectedOrder(isSel ? null : order)}>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">
                          {order.customerName || order.user?.name || "Sin nombre"}
                          {order.tableNumber && <span style={{ color: "#8b5cf6" }}> · Mesa {order.tableNumber}</span>}
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--muted)" }}>{order.orderNumber}</div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className="text-[10px] px-1.5 py-0.5 rounded-full font-bold mb-1 whitespace-nowrap" style={{ background: sc + "18", color: sc }}>{STATUS_LABELS[order.status]}</div>
                        <div className="text-xs font-black" style={{ color: ACCENT }}>${Number(order.total).toFixed(0)}</div>
                      </div>
                    </button>
                    {isSel && (
                      <div className="px-3 pb-3 border-t" style={{ borderColor: "var(--border)" }}>
                        <div className="my-2 space-y-0.5 text-xs">
                          {(order.items || []).map((item: any, i: number) => (
                            <div key={i} className="flex justify-between"><span>{item.quantity}x {item.name}</span><span>${Number(item.subtotal).toFixed(0)}</span></div>
                          ))}
                        </div>
                        <div className="space-y-1.5">
                          {(() => { const nextStatus = NEXT_STATUS[order.status]; return nextStatus && (
                            <button onClick={() => updateOrderStatus(order.id, nextStatus)} disabled={updatingOrder === order.id}
                              className="w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px]"
                              style={{ background: ACCENT, color: "#fff" }}>
                              {updatingOrder === order.id ? "..." : `→ ${STATUS_LABELS[nextStatus]}`}
                            </button>
                          ); })()}
                          <button onClick={() => { setPayModal(order); setPayMethod("CASH"); setCashReceived(""); }}
                            className="w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px]"
                            style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>
                            💵 Cobrar ticket
                          </button>
                          <button onClick={() => updateOrderStatus(order.id, "CANCELLED")}
                            className="w-full py-2.5 rounded-xl text-xs font-bold"
                            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                            Cancelar pedido
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <button onClick={() => setShowPanel(true)}
            className="flex-shrink-0 flex flex-col items-center justify-center border-l gap-2 hover:bg-white/5 transition-colors"
            style={{ width: "44px", borderColor: "var(--border)", background: "var(--surf)", color: "var(--muted)" }}>
            <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: "11px", fontWeight: "bold" }}>
              📋 {orders.length}
            </span>
          </button>
        )}
      </div>

      {/* ── MODALES ── */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
          <div className="w-full max-w-sm rounded-2xl border p-6" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
            <h3 className="font-syne font-black text-lg mb-1">💵 Cobrar {payModal.orderNumber}</h3>
            <p className="text-2xl font-black mb-4" style={{ color: ACCENT }}>${Number(payModal.total).toFixed(0)}</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {PAY_METHODS.map(m => (
                <button key={m.value} onClick={() => setPayMethod(m.value)}
                  className="py-2 rounded-xl text-xs font-bold"
                  style={{ background: payMethod === m.value ? ACCENT : "var(--surf2)", color: payMethod === m.value ? "#fff" : "var(--muted)", border: "1px solid var(--border)" }}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPayModal(null)}
                className="flex-1 py-3 rounded-xl font-bold border min-h-[44px]"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Cancelar</button>
              <button onClick={() => chargeExistingOrder(payModal.id, payMethod)} disabled={updatingOrder === payModal.id}
                className="flex-1 py-3 rounded-xl font-syne font-black min-h-[44px]"
                style={{ background: ACCENT, color: "#fff" }}>
                {updatingOrder === payModal.id ? "..." : "✅ Confirmar"}
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
                <p className="text-xs font-bold" style={{ color: ACCENT }}>
                  {currentEmployee?.role === "OWNER" ? "Propietario" : "Gerente"}
                </p>
              </div>
              <button onClick={() => setShowManagerMenu(false)} className="text-[var(--muted)] hover:text-white text-2xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <button onClick={() => { setShowManagerMenu(false); setShowShiftModal(true); }}
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[var(--surf2)] transition-colors text-left border-b border-[var(--border)]/50">
                <span className="text-2xl">🕒</span>
                <div>
                  <div className="font-bold text-sm text-white">Turno de Caja</div>
                  <div className="text-xs" style={{ color: activeShift ? "#22c55e" : "#ef4444" }}>
                    {activeShift ? "🟢 Turno abierto" : "🔴 Sin turno abierto"}
                  </div>
                </div>
              </button>
              <button onClick={() => router.push("/setup")}
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[var(--surf2)] transition-colors text-left border-b border-[var(--border)]/50">
                <span className="text-2xl">🔧</span>
                <div>
                  <div className="font-bold text-sm text-white">Re-configurar</div>
                  <div className="text-xs text-[var(--muted)]">Cambiar ID de sucursal</div>
                </div>
              </button>
            </div>
            <div className="p-4 border-t border-[var(--border)] bg-[var(--bg)]">
              <button onClick={() => { localStorage.removeItem("accessToken"); setIsGlobalLocked(true); setCurrentEmployee(null); setActiveShift(null); setShowManagerMenu(false); }}
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
