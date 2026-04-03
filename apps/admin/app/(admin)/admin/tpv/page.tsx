"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import KDSMessages from "@/components/admin/KDSMessages";
import IngredientShortageModal from "@/components/admin/IngredientShortageModal";
import DeliveryAssignModal from "@/components/admin/DeliveryAssignModal";

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
  const [categories, setCategories] = useState<any[]>([]);
  const [allItems, setAllItems]     = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState("all");
  const [search, setSearch]         = useState("");
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

  const ticket = tickets[activeTicket] || tickets[0];

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/api/orders/admin");
      setOrders(data.filter((o: any) =>
        !["DELIVERED","CANCELLED"].includes(o.status) &&
        (o.source === "TPV" || o.source === "WAITER")
      ));
      // Cobros pendientes de efectivo de repartidores
      setPendingCashOrders(data.filter((o: any) =>
        o.status === "DELIVERED" &&
        o.cashCollected === false &&
        o.paymentMethod === "CASH_ON_DELIVERY"
      ));
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([
      api.get("/api/menu/categories"),
      api.get("/api/menu/items"),
      api.get("/api/printers"),
    ]).then(([c, i, p]) => {
      setCategories(c.data);
      setAllItems(i.data);
      setPrinters((p.data || []).filter((pr: any) => pr.type !== "CASHIER" && pr.isActive));
    });
    fetchOrders();
    const t = setInterval(fetchOrders, 15000);
    return () => clearInterval(t);
  }, [fetchOrders]);

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
    setUpdatingOrder(orderId);
    try {
      await api.put(`/api/orders/${orderId}/payment`, { paymentMethod: method });
      setPayModal(null); setSelectedOrder(null);
      fetchOrders();
    } catch (err: any) { alert(err.response?.data?.error || "Error al cobrar"); }
    finally { setUpdatingOrder(null); }
  }

  async function updateOrderStatus(orderId: string, status: string) {
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

  // ── Confirmar cobro en efectivo del repartidor ────────────────────────
  async function confirmCash(order: any) {
    if (!confirm(`¿Confirmar recepción de $${Number(order.total).toFixed(0)} en efectivo de ${order.orderNumber}?`)) return;
    setConfirmingCash(order.id);
    try {
      await api.put(`/api/orders/${order.id}/confirm-cash`, {
        collectedBy: "TPV",
      });
      fetchOrders();
      alert(`✅ Cobro confirmado: ${order.orderNumber}`);
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al confirmar cobro");
    } finally { setConfirmingCash(null); }
  }

  async function confirmAllCash() {
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

  return (
    <div className="flex h-screen overflow-hidden" style={{background:"var(--bg)"}}>

      {/* ── MENÚ IZQUIERDA ── */}
      <div className="flex flex-col flex-1 overflow-hidden" style={{minWidth:0}}>
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
              style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
            <KDSMessages />
            {addingToOrder && (
              <div className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2"
                style={{background:"rgba(139,92,246,0.15)",color:"#8b5cf6",border:"1px solid rgba(139,92,246,0.3)"}}>
                ➕ {addingToOrder.orderNumber}
                <button onClick={() => setAddingToOrder(null)} className="font-black">✕</button>
              </div>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button onClick={() => setSelectedCat("all")}
              className="px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
              style={{background: selectedCat==="all" ? "var(--gold)" : "var(--surf)", color: selectedCat==="all" ? "#000" : "var(--muted)", border:"1px solid var(--border)"}}>
              Todo
            </button>
            {categories.map((cat: any) => (
              <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
                style={{background: selectedCat===cat.id ? "var(--gold)" : "var(--surf)", color: selectedCat===cat.id ? "#000" : "var(--muted)", border:"1px solid var(--border)"}}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))"}}>
            {filteredItems.map((item: any) => (
              <button key={item.id} onClick={() => handleItemClick(item)}
                className="rounded-xl p-3 text-left border transition-all hover:scale-105 active:scale-95"
                style={{background:"var(--surf)",borderColor:"var(--border)"}}>
                {item.imageUrl && <img src={item.imageUrl} alt="" className="w-full h-20 object-cover rounded-lg mb-2" />}
                <div className="text-xs font-bold leading-tight mb-1">{item.name}</div>
                <div className="text-xs font-black" style={{color:"var(--gold)"}}>${item.price}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── TICKET ── */}
        <div className="flex-shrink-0 border-t" style={{borderColor:"var(--border)",background:"var(--surf)",maxHeight:"55vh",display:"flex",flexDirection:"column"}}>
          <div className="flex items-center gap-1 px-3 pt-2 overflow-x-auto flex-shrink-0">
            {tickets.map((t: any, idx: number) => (
              <div key={t.id} className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setActiveTicket(idx)}
                  className="px-3 py-1.5 rounded-t-xl text-xs font-bold"
                  style={{background: activeTicket===idx ? "var(--gold)" : "var(--surf2)", color: activeTicket===idx ? "#000" : "var(--muted)"}}>
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
              <input value={ticket.name} onChange={e => updateTicket({name:e.target.value})}
                placeholder="Nombre cliente"
                className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
                style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
              <input value={ticket.phone} onChange={e => updateTicket({phone:e.target.value})}
                placeholder="Teléfono"
                className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
                style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
            </div>
            <div className="flex gap-2 mb-2">
              <button onClick={() => updateTicket({type:"TAKEOUT"})}
                className="flex-1 py-2 rounded-xl text-xs font-bold"
                style={{background: ticket.type==="TAKEOUT" ? "var(--gold)" : "var(--surf2)", color: ticket.type==="TAKEOUT" ? "#000" : "var(--muted)"}}>
                🥡 Para llevar
              </button>
              <button onClick={() => updateTicket({type:"DINE_IN"})}
                className="flex-1 py-2 rounded-xl text-xs font-bold"
                style={{background: ticket.type==="DINE_IN" ? "var(--gold)" : "var(--surf2)", color: ticket.type==="DINE_IN" ? "#000" : "var(--muted)"}}>
                🪑 En mesa
              </button>
              {ticket.type === "DINE_IN" && (
                <input value={ticket.table} onChange={e => updateTicket({table:e.target.value})}
                  placeholder="# Mesa" type="number"
                  className="w-20 px-3 py-2 rounded-xl text-xs outline-none text-center"
                  style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
              )}
            </div>

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
                <div className="flex gap-2 mb-2">
                  <input type="number" value={ticket.discount || ""} onChange={e => updateTicket({discount:Number(e.target.value)})}
                    placeholder="Descuento"
                    className="flex-1 px-3 py-1.5 rounded-xl text-xs outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                  <button onClick={() => updateTicket({discountType: ticket.discountType==="percent" ? "fixed" : "percent"})}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold"
                    style={{background:"var(--surf2)",color:"var(--muted)"}}>
                    {ticket.discountType === "percent" ? "%" : "$"}
                  </button>
                </div>
                <div className="flex justify-between text-xs mb-1" style={{color:"var(--muted)"}}>
                  <span>Subtotal</span><span>${subtotal.toFixed(0)}</span>
                </div>
                {discountAmt > 0 && (
                  <div className="flex justify-between text-xs mb-1" style={{color:"#ef4444"}}>
                    <span>Descuento</span><span>-${discountAmt.toFixed(0)}</span>
                  </div>
                )}
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
                      style={{background:"var(--gold)",color:"#000"}}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PANEL LATERAL ── */}
      <div className="flex-shrink-0 border-l flex flex-col"
        style={{width: showPanel ? "300px" : "44px", borderColor:"var(--border)", background:"var(--surf)", transition:"width 0.2s"}}>
        <button onClick={() => setShowPanel(p => !p)}
          className="w-full py-3 flex items-center justify-center gap-2 border-b flex-shrink-0 text-xs font-bold"
          style={{borderColor:"var(--border)",color:"var(--muted)"}}>
          {showPanel ? (
            <><span>Pedidos</span>
            {pendingCashOrders.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-black" style={{background:"#ef4444",color:"#fff"}}>
                💵 {pendingCashOrders.length}
              </span>
            )}
            <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-black mr-2" style={{background:"var(--gold)",color:"#000"}}>{orders.length}</span>
            <span>›</span></>
          ) : <span style={{writingMode:"vertical-rl",transform:"rotate(180deg)"}}>📋 {orders.length}</span>}
        </button>

        {showPanel && (
          <>
            {/* Tabs */}
            <div className="flex border-b flex-shrink-0" style={{borderColor:"var(--border)"}}>
              <button onClick={() => setPanelTab("active")}
                className="flex-1 py-2 text-xs font-bold"
                style={{background: panelTab==="active" ? "var(--surf)" : "var(--surf2)",
                  color: panelTab==="active" ? "var(--gold)" : "var(--muted)",
                  borderBottom: panelTab==="active" ? "2px solid var(--gold)" : "2px solid transparent"}}>
                Activos ({orders.length})
              </button>
              <button onClick={() => setPanelTab("cash")}
                className="flex-1 py-2 text-xs font-bold relative"
                style={{background: panelTab==="cash" ? "var(--surf)" : "var(--surf2)",
                  color: panelTab==="cash" ? "#22c55e" : "var(--muted)",
                  borderBottom: panelTab==="cash" ? "2px solid #22c55e" : "2px solid transparent"}}>
                💵 Efectivo
                {pendingCashOrders.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-black"
                    style={{background:"#ef4444",color:"#fff"}}>
                    {pendingCashOrders.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab: Pedidos Activos */}
            {panelTab === "active" && (
              <div className="flex-1 overflow-y-auto p-2">
                {orders.length === 0 ? (
                  <div className="text-center py-12 text-xs" style={{color:"var(--muted)"}}>Sin pedidos activos</div>
                ) : orders.map((order: any) => {
                  const sc = STATUS_COLORS[order.status] || "#888";
                  const isSelected = selectedOrder?.id === order.id;
                  return (
                    <div key={order.id} className="rounded-xl border mb-2 overflow-hidden"
                      style={{borderColor: isSelected ? "var(--gold)" : "var(--border)", background: isSelected ? "rgba(245,166,35,0.05)" : "var(--surf2)"}}>
                      <button className="w-full px-3 py-2 flex items-center justify-between text-left"
                        onClick={() => setSelectedOrder(isSelected ? null : order)}>
                        <div>
                          <div className="text-xs font-bold">{order.customerName || order.user?.name || "Sin nombre"}{order.tableNumber && <span style={{color:"#8b5cf6"}}> · Mesa {order.tableNumber}</span>}</div>
                          <div className="text-xs font-syne" style={{color:"var(--muted)"}}>{order.orderNumber}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs px-2 py-0.5 rounded-full font-bold mb-1"
                            style={{background:sc+"18",color:sc}}>{STATUS_LABELS[order.status]}</div>
                          <div className="text-xs font-black" style={{color:"var(--gold)"}}>${Number(order.total).toFixed(0)}</div>
                        </div>
                      </button>

                      {isSelected && (
                        <div className="px-3 pb-3 border-t" style={{borderColor:"var(--border)"}}>
                          <div className="my-2">
                            {(order.items || []).map((item: any, i: number) => (
                              <div key={i} className="flex justify-between text-xs py-0.5">
                                <span>{item.quantity}x {item.name || item.menuItem?.name}
                                  {item.notes && <span style={{color:"var(--gold)"}}> ({item.notes})</span>}
                                </span>
                                <span style={{color:"var(--gold)"}}>${Number(item.subtotal).toFixed(0)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {NEXT_STATUS[order.status] && (
                              <button onClick={() => updateOrderStatus(order.id, NEXT_STATUS[order.status])}
                                disabled={updatingOrder === order.id}
                                className="w-full py-2 rounded-xl text-xs font-bold"
                                style={{background:"var(--gold)",color:"#000"}}>
                                {updatingOrder === order.id ? "..." : `→ ${STATUS_LABELS[NEXT_STATUS[order.status]]}`}
                              </button>
                            )}
                            <button onClick={() => { setPayModal(order); setPayMethod("CASH"); setCashReceived(""); }}
                              className="w-full py-2 rounded-xl text-xs font-bold"
                              style={{background:"rgba(34,197,94,0.1)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.2)"}}>
                              💵 Cobrar ticket
                            </button>
                            <button onClick={() => printBill(order)}
                              className="w-full py-2 rounded-xl text-xs font-bold border"
                              style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                              🖨️ Imprimir cuenta
                            </button>
                            <div className="relative">
                              <button onClick={() => setReprintOpen(reprintOpen === order.id ? null : order.id)}
                                className="w-full py-2 rounded-xl text-xs font-bold border flex items-center justify-between px-3"
                                style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                                <span>🔄 Reimprimir</span>
                                <span>{reprintOpen === order.id ? "▲" : "▼"}</span>
                              </button>
                              {reprintOpen === order.id && (
                                <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border overflow-hidden z-10"
                                  style={{background:"var(--surf)",borderColor:"var(--border)"}}>
                                  <button onClick={() => reprintOrder(order)}
                                    className="w-full px-3 py-2 text-xs font-bold text-left hover:opacity-80"
                                    style={{color:"var(--muted)",borderBottom:"1px solid var(--border)"}}>
                                    📋 Todas las estaciones
                                  </button>
                                  {printers.map((pr: any) => (
                                    <button key={pr.id} onClick={() => reprintOrder(order, pr.id)}
                                      className="w-full px-3 py-2 text-xs font-bold text-left hover:opacity-80"
                                      style={{color:"var(--text)",borderBottom:"1px solid var(--border)"}}>
                                      🖨️ {pr.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button onClick={() => { setAddingToOrder(order); setSelectedOrder(null); }}
                              className="w-full py-2 rounded-xl text-xs font-bold"
                              style={{background:"rgba(139,92,246,0.05)",color:"#8b5cf6",border:"1px solid rgba(139,92,246,0.3)"}}>
                              ➕ Agregar productos
                            </button>
                            {editTypeOrder === order.id ? (
                              <div className="rounded-xl border p-2" style={{borderColor:"var(--border)"}}>
                                <div className="text-xs font-bold mb-2" style={{color:"var(--muted)"}}>Tipo de pedido</div>
                                <div className="flex gap-1 mb-2">
                                  {["TAKEOUT","DINE_IN","DELIVERY"].map(t => (
                                    <button key={t} onClick={() => changeOrderType(order.id, t, t==="DELIVERY" ? editAddress : undefined)}
                                      className="flex-1 py-1.5 rounded-lg text-xs font-bold"
                                      style={{background: order.orderType===t ? (t==="DELIVERY" ? "#f97316" : "var(--gold)") : "var(--surf2)", color: order.orderType===t ? "#000" : "var(--muted)"}}>
                                      {t==="TAKEOUT" ? "🥡" : t==="DINE_IN" ? "🪑" : "🛵"}
                                    </button>
                                  ))}
                                </div>
                                <input value={editAddress} onChange={e => setEditAddress(e.target.value)}
                                  placeholder="📍 Dirección (si es domicilio)"
                                  className="w-full px-2 py-1.5 rounded-lg text-xs outline-none mb-2"
                                  style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                                <div className="flex gap-1">
                                  <button onClick={() => { setEditTypeOrder(null); setEditAddress(""); }}
                                    className="flex-1 py-1.5 rounded-lg text-xs font-bold"
                                    style={{background:"var(--surf2)",color:"var(--muted)"}}>Cancelar</button>
                                  <button onClick={() => changeOrderType(order.id, "DELIVERY", editAddress)}
                                    className="flex-1 py-1.5 rounded-lg text-xs font-bold"
                                    style={{background:"#f97316",color:"#fff"}}>
                                    🛵 Guardar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => { setEditTypeOrder(order.id); setEditAddress(order.deliveryAddress||""); }}
                                className="w-full py-2 rounded-xl text-xs font-bold border"
                                style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                                📦 Cambiar tipo de pedido
                              </button>
                            )}
                            <button onClick={() => setShortageOrder(order)}
                              className="w-full py-2 rounded-xl text-xs font-bold"
                              style={{background:"rgba(245,158,11,0.1)",color:"#f59e0b",border:"1px solid rgba(245,158,11,0.2)"}}>
                              ⚠️ Falta ingrediente
                            </button>
                            <button onClick={() => updateOrderStatus(order.id, "CANCELLED")}
                              className="w-full py-2 rounded-xl text-xs font-bold"
                              style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>
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

            {/* Tab: Efectivo pendiente */}
            {panelTab === "cash" && (
              <div className="flex-1 overflow-y-auto p-2">
                {pendingCashOrders.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-3xl mb-2">✅</div>
                    <div className="text-xs font-bold" style={{color:"var(--muted)"}}>Sin cobros pendientes</div>
                  </div>
                ) : (
                  <>
                    {/* Resumen total */}
                    <div className="rounded-xl p-3 mb-3" style={{background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)"}}>
                      <div className="text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Total pendiente de cobro</div>
                      <div className="text-2xl font-black" style={{color:"#22c55e"}}>
                        ${pendingCashOrders.reduce((s, o) => s + Number(o.total), 0).toFixed(0)}
                      </div>
                      <div className="text-xs mt-0.5" style={{color:"var(--muted)"}}>
                        {pendingCashOrders.length} pedido(s) de repartidores
                      </div>
                    </div>

                    {/* Confirmar todos */}
                    <button onClick={confirmAllCash}
                      className="w-full py-2.5 rounded-xl text-xs font-black mb-3"
                      style={{background:"#22c55e",color:"#fff"}}>
                      ✅ Confirmar todos los cobros
                    </button>

                    {/* Lista de pedidos pendientes */}
                    {pendingCashOrders.map((order: any) => (
                      <div key={order.id} className="rounded-xl border mb-2 p-3"
                        style={{background:"var(--surf2)",borderColor:"rgba(34,197,94,0.3)"}}>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="text-xs font-black">{order.orderNumber}</div>
                            <div className="text-xs" style={{color:"var(--muted)"}}>{order.customerName || "Cliente"}</div>
                            {order.deliveryDriverId && (
                              <div className="text-xs mt-0.5" style={{color:"#8b5cf6"}}>🛵 Repartidor</div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-black text-lg" style={{color:"#22c55e"}}>${Number(order.total).toFixed(0)}</div>
                            <div className="text-xs" style={{color:"var(--muted)"}}>
                              {new Date(order.createdAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => confirmCash(order)}
                          disabled={confirmingCash === order.id}
                          className="w-full py-2 rounded-xl text-xs font-black"
                          style={{background:"rgba(34,197,94,0.15)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.3)"}}>
                          {confirmingCash === order.id ? "Confirmando..." : "✅ Confirmar cobro recibido"}
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── MODAL COBRAR ── */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.85)"}}>
          <div className="w-full max-w-sm rounded-2xl border p-6" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <h3 className="font-syne font-black text-lg mb-1">💵 Cobrar {payModal.orderNumber}</h3>
            <p className="text-2xl font-black mb-4" style={{color:"var(--gold)"}}>${Number(payModal.total).toFixed(0)}</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {PAY_METHODS.map((m: any) => (
                <button key={m.value} onClick={() => setPayMethod(m.value)}
                  className="py-2.5 rounded-xl text-sm font-bold"
                  style={{background: payMethod===m.value ? "var(--gold)" : "var(--surf2)", color: payMethod===m.value ? "#000" : "var(--muted)", border:`1px solid ${payMethod===m.value ? "var(--gold)" : "var(--border)"}`}}>
                  {m.label}
                </button>
              ))}
            </div>
            {payMethod === "CASH" && (
              <div className="mb-4">
                <input type="number" value={cashReceived} onChange={e => setCashReceived(e.target.value)}
                  placeholder="Efectivo recibido"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-2"
                  style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                {cashReceived && Number(cashReceived) >= Number(payModal.total) && (
                  <div className="text-center font-black" style={{color:"#22c55e"}}>
                    Cambio: ${(Number(cashReceived) - Number(payModal.total)).toFixed(0)}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setPayModal(null)}
                className="flex-1 py-3 rounded-xl font-bold border"
                style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
              <button onClick={() => chargeExistingOrder(payModal.id, payMethod)}
                disabled={updatingOrder === payModal.id}
                className="flex-1 py-3 rounded-xl font-syne font-black"
                style={{background:"var(--gold)",color:"#000"}}>
                {updatingOrder === payModal.id ? "..." : "✅ Cobrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL VARIANTES ── */}
      {variantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.85)"}}>
          <div className="w-full max-w-sm rounded-2xl border p-6" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <h3 className="font-syne font-black text-lg mb-4">{variantModal.item.name}</h3>
            <div className="flex flex-col gap-2">
              {variantModal.item.variants.map((v: any) => (
                <button key={v.id} onClick={() => {
                  if (variantModal.item.complements?.length > 0) {
                    setModifierModal({ item: variantModal.item, variant: v, forOrder: variantModal.forOrder });
                    setVariantModal(null);
                  } else {
                    if (variantModal.forOrder) addItemToExistingOrder(variantModal.forOrder, variantModal.item, v, []);
                    else addToTicket(variantModal.item, v, []);
                    setVariantModal(null);
                  }
                }}
                  className="py-3 px-4 rounded-xl text-sm font-bold flex justify-between"
                  style={{background:"var(--surf2)",border:"1px solid var(--border)"}}>
                  <span>{v.name}</span><span style={{color:"var(--gold)"}}>${v.price}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setVariantModal(null)} className="w-full mt-4 py-2 rounded-xl text-sm font-bold border"
              style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── MODAL MODIFICADORES ── */}
      {modifierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.85)"}}>
          <div className="w-full max-w-sm rounded-2xl border p-6" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <h3 className="font-syne font-black text-lg mb-1">{modifierModal.item.name}</h3>
            {modifierModal.variant && <p className="text-sm mb-3" style={{color:"var(--gold)"}}>{modifierModal.variant.name}</p>}
            <p className="text-xs mb-3" style={{color:"var(--muted)"}}>Extras (opcional)</p>
            <div className="flex flex-col gap-2 mb-4">
              {modifierModal.item.complements.map((mod: any) => (
                <label key={mod.id} className="flex items-center justify-between py-2 px-3 rounded-xl cursor-pointer"
                  style={{background:"var(--surf2)"}}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={selectedMods.some((m: any) => m.id===mod.id)}
                      onChange={() => setSelectedMods(p => p.some((m: any) => m.id===mod.id) ? p.filter((m: any) => m.id!==mod.id) : [...p,mod])} />
                    <span className="text-sm">{mod.name}</span>
                  </div>
                  {mod.price > 0 && <span className="text-xs font-bold" style={{color:"var(--gold)"}}>+${mod.price}</span>}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setModifierModal(null); setSelectedMods([]); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border"
                style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
              <button onClick={() => {
                if (modifierModal.forOrder) addItemToExistingOrder(modifierModal.forOrder, modifierModal.item, modifierModal.variant, selectedMods);
                else addToTicket(modifierModal.item, modifierModal.variant, selectedMods);
                setModifierModal(null); setSelectedMods([]);
              }}
                className="flex-1 py-2.5 rounded-xl text-sm font-black"
                style={{background:"var(--gold)",color:"#000"}}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      {shortageOrder && (
        <IngredientShortageModal order={shortageOrder} onClose={() => setShortageOrder(null)} />
      )}
      {assignOrder && (
        <DeliveryAssignModal order={assignOrder} onClose={() => setAssignOrder(null)}
          onAssigned={() => { fetchOrders(); setAssignOrder(null); }} />
      )}
    </div>
  );
}