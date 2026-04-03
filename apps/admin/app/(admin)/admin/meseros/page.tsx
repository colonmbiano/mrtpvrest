"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";

const STATUS_LABELS: Record<string,string> = {
  PENDING:"Pendiente", CONFIRMED:"Confirmado", PREPARING:"Preparando",
  READY:"Listo ✅", DELIVERED:"Entregado", CANCELLED:"Cancelado",
};
const STATUS_COLORS: Record<string,string> = {
  PENDING:"#f59e0b", CONFIRMED:"#3b82f6", PREPARING:"#8b5cf6",
  READY:"#22c55e", DELIVERED:"#6b7280", CANCELLED:"#ef4444",
};
const NEXT_STATUS: Record<string,string> = {
  PENDING:"CONFIRMED", CONFIRMED:"PREPARING", PREPARING:"READY", READY:"DELIVERED",
};

type Screen = "login"|"register_photo"|"home"|"tpv"|"orderDetail";

export default function WaiterApp() {
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
  const [gridCols, setGridCols]       = useState(4);
  const [gridRows, setGridRows]       = useState(4);
  const [showConfig, setShowConfig]   = useState(false);
  const [showPanel, setShowPanel]     = useState(true);

  // Cámara
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream]           = useState<MediaStream|null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string|null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);

  // Admin PIN modal
  const [adminModal, setAdminModal]   = useState<any>(null); // { action, orderId, itemIdx }
  const [adminPin, setAdminPin]       = useState("");
  const [adminPinError, setAdminPinError] = useState("");

  const ticket = tickets[activeTicket] || tickets[0];

  useEffect(() => { setMounted(true); }, []);

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
      const shiftRes = await api.get(`/api/waiters/${data.waiter.id}/shift`);
      setShift(shiftRes.data);
      setPinError(""); setPin("");
      // Si no tiene foto, ir a registro de foto
      if (!data.waiter.photo) { setScreen("register_photo"); startCamera(); }
      else setScreen("home");
      fetchOrders(data.waiter);
    } catch { setPinError("PIN incorrecto"); setPin(""); }
  }

  // ── CÁMARA ──
  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setStream(s);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 300);
    } catch { console.error("No se pudo acceder a la cámara"); }
  }

  function stopCamera() {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    canvasRef.current.width  = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx?.drawImage(videoRef.current, 0, 0);
    setCapturedPhoto(canvasRef.current.toDataURL("image/jpeg", 0.8));
    stopCamera();
  }

  async function savePhoto() {
    if (!capturedPhoto || !waiter) return;
    setSavingPhoto(true);
    try {
      await api.post(`/api/waiters/${waiter.id}/photo`, { photo: capturedPhoto });
      setWaiter((p: any) => ({ ...p, photo: capturedPhoto }));
      setCapturedPhoto(null);
      setScreen("home");
    } catch { alert("Error al guardar foto"); }
    finally { setSavingPhoto(false); }
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

  // ── ADMIN PIN ──
  async function verifyAdminPin(cb: () => void) {
    try {
      const { data } = await api.post("/api/waiters/verify-admin-pin", { pin: adminPin });
      if (data.valid) { cb(); setAdminModal(null); setAdminPin(""); setAdminPinError(""); }
      else { setAdminPinError("PIN incorrecto"); setAdminPin(""); }
    } catch { setAdminPinError("Error"); }
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
    const existing = ticket.items.find((i: any) =>
      i.menuItemId === item.id && i.variantId === (variant?.id || null) && i.notes === notes
    );
    if (existing) {
      updateTicket({ items: ticket.items.map((i: any) => i === existing
        ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * total } : i) });
    } else {
      updateTicket({ items: [...ticket.items, {
        menuItemId: item.id, name: item.name,
        variantId: variant?.id || null, variantName: variant?.name,
        price: total, qty: 1, subtotal: total, notes, mods,
      }]});
    }
  }

  function handleItemClick(item: any) {
    if (addingToOrder) {
      if (item.variants?.length > 0) { setVariantModal({ item, forOrder: addingToOrder }); return; }
      if (item.complements?.length > 0) { setModModal({ item, variant: null, forOrder: addingToOrder }); return; }
      addItemToExistingOrder(addingToOrder, item, null, []);
      return;
    }
    if (item.variants?.length > 0) { setVariantModal({ item }); return; }
    if (item.complements?.length > 0) { setModModal({ item, variant: null }); return; }
    addToTicket(item, null, []);
  }

  async function addItemToExistingOrder(order: any, item: any, variant: any, mods: any[]) {
    const price = variant ? variant.price : item.price;
    const modsPrice = (mods||[]).reduce((s: number, m: any) => s + m.price, 0);
    const finalPrice = price + modsPrice;
    try {
      await api.post(`/api/orders/${order.id}/items`, {
        menuItemId: item.id,
        name: item.name + (variant ? ` - ${variant.name}` : ""),
        price: finalPrice, quantity: 1, subtotal: finalPrice,
        notes: (mods||[]).map((m: any) => m.name).join(", "),
      });
      setAddingToOrder(null); fetchOrders();
      if (selectedOrder?.id === order.id) {
        const { data } = await api.get(`/api/orders/${order.id}`);
        setSelectedOrder(data);
      }
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
  }

  // Eliminar item — requiere PIN admin
  function requestRemoveItem(idx: number) {
    setAdminModal({ action: "remove_item", idx });
    setAdminPin(""); setAdminPinError("");
  }

  function removeFromTicket(idx: number) {
    updateTicket({ items: ticket.items.filter((_: any, i: number) => i !== idx) });
  }

  function changeQty(idx: number, delta: number) {
    const item = ticket.items[idx];
    const newQty = item.qty + delta;
    if (newQty <= 0) { requestRemoveItem(idx); return; }
    updateTicket({ items: ticket.items.map((it: any, i: number) =>
      i === idx ? { ...it, qty: newQty, subtotal: newQty * it.price } : it
    )});
  }

  async function sendToKitchen() {
    if (ticket.items.length === 0) { alert("Agrega productos"); return; }
    if (!ticket.table) { alert("Indica el número de mesa"); return; }
    setSending(true);
    try {
      const subtotal = ticket.items.reduce((s: number, i: any) => s + i.subtotal, 0);
      const { data: order } = await api.post("/api/orders/tpv", {
        items: ticket.items.map((i: any) => ({ menuItemId: i.menuItemId, quantity: i.qty, notes: i.notes })),
        orderType: "DINE_IN", tableNumber: Number(ticket.table),
        paymentMethod: "PENDING", subtotal, discount: 0, total: subtotal,
        customerName: ticket.name || null, source: "WAITER", status: "PENDING",
      });
      setTickets([{id:Date.now(),name:"",phone:"",type:"DINE_IN",table:"",items:[]}]);
      setActiveTicket(0);
      fetchOrders();
      alert(`✅ Pedido ${order.orderNumber} enviado a cocina`);
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setSending(false); }
  }

  async function printBill(order: any) {
    try {
      await api.post(`/api/orders/${order.id}/print-bill`);
      alert("🖨️ Cuenta enviada a imprimir");
    } catch { alert("Error al imprimir"); }
  }

  const subtotal = ticket.items.reduce((s: number, i: any) => s + i.subtotal, 0);
  const filteredItems = allItems.filter((i: any) => {
    const matchCat = selectedCat === "all" || i.categoryId === selectedCat;
    return matchCat && i.isAvailable !== false;
  });
  const myOrders = waiter?.tables?.length > 0
    ? orders.filter((o: any) => waiter.tables.includes(String(o.tableNumber)))
    : orders;

  if (!mounted) return null;

  // ── LOGIN ──
  if (screen === "login") return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{background:"var(--bg)"}}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🧑‍🍳</div>
          <h1 className="font-syne text-3xl font-black">App Meseros</h1>
          <p className="text-sm mt-1" style={{color:"var(--muted)"}}>Master Burger's</p>
        </div>
        <div className="rounded-2xl border p-6" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
          <p className="text-center text-sm mb-4 font-bold" style={{color:"var(--muted)"}}>Ingresa tu PIN</p>
          <div className="text-center text-3xl font-black tracking-widest mb-4 h-10" style={{color:"var(--gold)"}}>
            {"●".repeat(pin.length)}
          </div>
          {pinError && <p className="text-center text-xs mb-3" style={{color:"#ef4444"}}>{pinError}</p>}
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k, i) => (
              <button key={i}
                onClick={() => {
                  if (k==="⌫") setPin(p => p.slice(0,-1));
                  else if (k!=="") setPin(p => p.length < 6 ? p + k : p);
                }}
                className="py-4 rounded-2xl text-xl font-black"
                style={{background: k==="" ? "transparent" : "var(--surf2)", color: k==="⌫" ? "#ef4444" : "var(--text)"}}>
                {k}
              </button>
            ))}
          </div>
          <button onClick={handleLogin} disabled={pin.length < 4}
            className="w-full mt-4 py-4 rounded-2xl font-syne font-black text-lg"
            style={{background: pin.length >= 4 ? "var(--gold)" : "var(--surf2)", color: pin.length >= 4 ? "#000" : "var(--muted)"}}>
            Entrar
          </button>
        </div>
      </div>
    </div>
  );

  // ── REGISTRO FOTO ──
  if (screen === "register_photo") return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{background:"var(--bg)"}}>
      <div className="w-full max-w-sm text-center">
        <h1 className="font-syne text-2xl font-black mb-2">Hola, {waiter?.name}! 👋</h1>
        <p className="text-sm mb-6" style={{color:"var(--muted)"}}>Toma tu foto para identificarte</p>
        <div className="rounded-2xl overflow-hidden mb-4 border" style={{borderColor:"var(--border)"}}>
          {capturedPhoto ? (
            <img src={capturedPhoto} alt="foto" className="w-full" />
          ) : (
            <video ref={videoRef} autoPlay playsInline className="w-full" style={{minHeight:"300px",background:"#000"}} />
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />
        {!capturedPhoto ? (
          <button onClick={capturePhoto}
            className="w-full py-4 rounded-2xl font-syne font-black text-lg mb-3"
            style={{background:"var(--gold)",color:"#000"}}>
            📸 Tomar foto
          </button>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => { setCapturedPhoto(null); startCamera(); }}
              className="flex-1 py-4 rounded-2xl font-bold border"
              style={{borderColor:"var(--border)",color:"var(--muted)"}}>
              🔄 Repetir
            </button>
            <button onClick={savePhoto} disabled={savingPhoto}
              className="flex-1 py-4 rounded-2xl font-syne font-black"
              style={{background:"var(--gold)",color:"#000"}}>
              {savingPhoto ? "..." : "✅ Usar esta"}
            </button>
          </div>
        )}
        <button onClick={() => { stopCamera(); setScreen("home"); }}
          className="w-full py-3 text-sm mt-2" style={{color:"var(--muted)"}}>
          Omitir por ahora
        </button>
      </div>
    </div>
  );

  // ── HOME ──
  if (screen === "home") {
    const readyOrders = myOrders.filter((o: any) => o.status === "READY");
    return (
      <div className="min-h-screen flex flex-col" style={{background:"var(--bg)"}}>
        <div className="px-6 py-4 flex items-center justify-between border-b" style={{borderColor:"var(--border)",background:"var(--surf)"}}>
          <div className="flex items-center gap-3">
            {waiter?.photo && <img src={waiter.photo} alt="" className="w-12 h-12 rounded-full object-cover border-2" style={{borderColor:"var(--gold)"}} />}
            <div>
              <h1 className="font-syne font-black text-xl">Hola, {waiter?.name} 👋</h1>
              <p className="text-xs" style={{color:"var(--muted)"}}>
                {shift ? `Turno activo desde ${new Date(shift.startAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}` : "Sin turno activo"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {!shift ? (
              <button onClick={startShift} className="px-4 py-2 rounded-xl text-sm font-bold" style={{background:"var(--gold)",color:"#000"}}>
                ▶ Iniciar turno
              </button>
            ) : (
              <>
                <button onClick={() => setScreen("tpv")} className="px-4 py-2 rounded-xl text-sm font-black" style={{background:"var(--gold)",color:"#000"}}>
                  🧾 Abrir TPV
                </button>
                <button onClick={endShift} className="px-4 py-2 rounded-xl text-sm font-bold" style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>
                  ⏹ Terminar turno
                </button>
              </>
            )}
          </div>
        </div>
        {readyOrders.length > 0 && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-2xl flex items-center gap-3" style={{background:"rgba(34,197,94,0.15)",border:"1px solid rgba(34,197,94,0.3)"}}>
            <span className="text-2xl">✅</span>
            <div>
              <div className="font-bold text-sm" style={{color:"#22c55e"}}>¡{readyOrders.length} pedido{readyOrders.length>1?"s":""} listo{readyOrders.length>1?"s":""}!</div>
              <div className="text-xs" style={{color:"#22c55e"}}>{readyOrders.map((o: any) => `Mesa ${o.tableNumber}`).join(" · ")}</div>
            </div>
          </div>
        )}
        <div className="flex-1 p-6">
          <h2 className="font-syne font-bold text-lg mb-4">Mis mesas ({myOrders.length})</h2>
          {myOrders.length === 0 ? (
            <div className="text-center py-20" style={{color:"var(--muted)"}}>
              <div className="text-5xl mb-3">🪑</div>
              <div className="text-sm">{shift ? "No hay pedidos activos" : "Inicia tu turno para comenzar"}</div>
            </div>
          ) : (
            <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))"}}>
              {myOrders.map((order: any) => {
                const sc = STATUS_COLORS[order.status] || "#888";
                return (
                  <button key={order.id} onClick={() => { setSelectedOrder(order); setScreen("orderDetail"); }}
                    className="rounded-2xl border p-5 text-left"
                    style={{background:"var(--surf)", borderColor: order.status==="READY" ? "#22c55e" : "var(--border)",
                      boxShadow: order.status==="READY" ? "0 0 0 2px rgba(34,197,94,0.3)" : "none"}}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-syne font-black text-2xl" style={{color:"var(--gold)"}}>Mesa {order.tableNumber || "–"}</div>
                      <span className="text-xs px-2 py-1 rounded-full font-bold" style={{background:sc+"18",color:sc}}>{STATUS_LABELS[order.status]}</span>
                    </div>
                    <div className="text-xs mb-1" style={{color:"var(--muted)"}}>{order.orderNumber}</div>
                    {order.customerName && <div className="text-sm font-medium mb-1">{order.customerName}</div>}
                    <div className="text-xs mb-2" style={{color:"var(--muted)"}}>{order.items?.length} productos</div>
                    <div className="font-black" style={{color:"var(--gold)"}}>${Number(order.total).toFixed(0)}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── TPV MESERO ──
  if (screen === "tpv") return (
    <div className="flex h-screen overflow-hidden" style={{background:"var(--bg)"}}>
      {/* Menú izquierda */}
      <div className="flex flex-col flex-1 overflow-hidden" style={{minWidth:0}}>
        {/* Header TPV */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-3 border-b flex-shrink-0" style={{borderColor:"var(--border)",background:"var(--surf)"}}>
          <button onClick={() => setScreen("home")} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{background:"var(--surf2)",color:"var(--muted)"}}>←</button>
          {waiter?.photo && <img src={waiter.photo} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />}
          <span className="font-syne font-black flex-1">{waiter?.name}</span>
          <button onClick={() => setShowConfig(p => !p)}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{background: showConfig ? "var(--gold)" : "var(--surf2)", color: showConfig ? "#000" : "var(--muted)"}}>⚙</button>
        </div>

        {/* Config grid */}
        {showConfig && (
          <div className="px-4 py-2 border-b flex items-center gap-4 flex-shrink-0" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
            <span className="text-xs font-bold" style={{color:"var(--muted)"}}>Cols:</span>
            {[2,3,4,5,6,7].map(n => (
              <button key={n} onClick={() => setGridCols(n)}
                className="w-8 h-8 rounded-lg text-xs font-black"
                style={{background: gridCols===n ? "var(--gold)" : "var(--surf)", color: gridCols===n ? "#000" : "var(--muted)"}}>
                {n}
              </button>
            ))}
            <span className="text-xs font-bold ml-2" style={{color:"var(--muted)"}}>Filas:</span>
            {[2,3,4,5,6].map(n => (
              <button key={n} onClick={() => setGridRows(n)}
                className="w-8 h-8 rounded-lg text-xs font-black"
                style={{background: gridRows===n ? "var(--gold)" : "var(--surf)", color: gridRows===n ? "#000" : "var(--muted)"}}>
                {n}
              </button>
            ))}
          </div>
        )}

        {/* Categorías */}
        <div className="flex gap-1.5 px-4 py-2 overflow-x-auto flex-shrink-0">
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

        {/* Grid productos */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <div className="grid gap-2" style={{
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
            gridAutoRows: `calc((100vh - 200px) / ${gridRows})`
          }}>
            {filteredItems.map((item: any) => (
              <button key={item.id} onClick={() => handleItemClick(item)}
                className="rounded-xl border p-2 text-left flex flex-col overflow-hidden transition-all hover:scale-105 active:scale-95"
                style={{background:"var(--surf)",borderColor:"var(--border)",height:"100%"}}>
                {item.imageUrl && <img src={item.imageUrl} alt="" className="w-full object-cover rounded-lg mb-1" style={{height:"55%",minHeight:"40px"}} />}
                <div className="text-xs font-bold leading-tight mb-0.5 line-clamp-2 flex-1">{item.name}</div>
                <div className="text-xs font-black" style={{color:"var(--gold)"}}>${item.price}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Ticket */}
        <div className="border-t flex-shrink-0" style={{borderColor:"var(--border)",background:"var(--surf)",maxHeight:"45vh",display:"flex",flexDirection:"column"}}>
          <div className="flex gap-2 p-3 border-b flex-shrink-0" style={{borderColor:"var(--border)"}}>
            <input value={ticket.name} onChange={e => updateTicket({name:e.target.value})}
              placeholder="Nombre cliente" className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
              style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
            <input value={ticket.table} onChange={e => updateTicket({table:e.target.value})} type="number"
              placeholder="Mesa" className="w-20 px-3 py-2 rounded-xl text-xs outline-none text-center font-bold"
              style={{background:"var(--surf2)",border:`2px solid ${ticket.table ? "var(--gold)" : "var(--border)"}`,color:"var(--text)"}} />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
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
                  <span className="text-xs font-bold w-5 text-center">{item.qty}</span>
                  <button onClick={() => changeQty(idx,1)} className="w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center" style={{background:"var(--surf2)"}}>+</button>
                </div>
                <div className="text-xs font-bold w-14 text-right" style={{color:"var(--gold)"}}>${item.subtotal}</div>
                {/* Eliminar requiere PIN admin */}
                <button onClick={() => requestRemoveItem(idx)} className="w-6 h-6 rounded-lg text-xs flex items-center justify-center" style={{color:"#ef4444",background:"rgba(239,68,68,0.1)"}}>✕</button>
              </div>
            ))}
          </div>
          {ticket.items.length > 0 && (
            <div className="p-3 border-t" style={{borderColor:"var(--border)"}}>
              <div className="flex justify-between font-black mb-3">
                <span>Total</span><span style={{color:"var(--gold)"}}>${subtotal}</span>
              </div>
              <button onClick={sendToKitchen} disabled={sending || !ticket.table}
                className="w-full py-3 rounded-xl font-syne font-black"
                style={{background: (!ticket.table || sending) ? "var(--muted)" : "var(--gold)", color:"#000"}}>
                {sending ? "Enviando..." : "🍳 Enviar a cocina"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Panel lateral pedidos activos */}
      <div className="flex-shrink-0 border-l flex flex-col"
        style={{width: showPanel ? "280px" : "44px", borderColor:"var(--border)", background:"var(--surf)", transition:"width 0.2s"}}>
        <button onClick={() => setShowPanel(p => !p)}
          className="w-full py-3 flex items-center justify-center gap-2 border-b flex-shrink-0 text-xs font-bold"
          style={{borderColor:"var(--border)",color:"var(--muted)"}}>
          {showPanel ? (
            <><span>Mis mesas</span>
            <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-black mr-2" style={{background:"var(--gold)",color:"#000"}}>{myOrders.length}</span>
            <span>›</span></>
          ) : <span style={{writingMode:"vertical-rl",transform:"rotate(180deg)"}}>🪑 {myOrders.length}</span>}
        </button>

        {showPanel && (
          <div className="flex-1 overflow-y-auto p-2">
            {myOrders.length === 0 ? (
              <div className="text-center py-8 text-xs" style={{color:"var(--muted)"}}>Sin pedidos</div>
            ) : myOrders.map((order: any) => {
              const sc = STATUS_COLORS[order.status] || "#888";
              const isSelected = selectedOrder?.id === order.id;
              return (
                <div key={order.id} className="rounded-xl border mb-2 overflow-hidden"
                  style={{borderColor: isSelected ? "var(--gold)" : "var(--border)", background: isSelected ? "rgba(245,166,35,0.05)" : "var(--surf2)"}}>
                  <button className="w-full px-3 py-2 flex items-center justify-between text-left"
                    onClick={() => setSelectedOrder(isSelected ? null : order)}>
                    <div>
                      <div className="text-xs font-syne font-black">Mesa {order.tableNumber}</div>
                      <div className="text-xs" style={{color:"var(--muted)"}}>{order.orderNumber}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs px-2 py-0.5 rounded-full font-bold mb-1" style={{background:sc+"18",color:sc}}>{STATUS_LABELS[order.status]}</div>
                      <div className="text-xs font-black" style={{color:"var(--gold)"}}>${Number(order.total).toFixed(0)}</div>
                    </div>
                  </button>

                  {isSelected && (
                    <div className="px-3 pb-3 border-t" style={{borderColor:"var(--border)"}}>
                      <div className="my-2">
                        {(order.items||[]).map((item: any, i: number) => (
                          <div key={i} className="flex justify-between text-xs py-0.5">
                            <span>{item.quantity}x {item.name||item.menuItem?.name}</span>
                            <span style={{color:"var(--gold)"}}>${Number(item.subtotal).toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {/* Agregar productos */}
                        <button onClick={() => setAddingToOrder(order)}
                          className="w-full py-2 rounded-xl text-xs font-bold"
                          style={{background:"rgba(139,92,246,0.05)",color:"#8b5cf6",border:"1px solid rgba(139,92,246,0.3)"}}>
                          ➕ Agregar productos
                        </button>
                        {/* Imprimir cuenta — SÍ puede */}
                        <button onClick={() => printBill(order)}
                          className="w-full py-2 rounded-xl text-xs font-bold border"
                          style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                          🖨️ Imprimir cuenta
                        </button>
                        {/* Cancelar — requiere PIN admin */}
                        <button onClick={() => { setAdminModal({ action:"cancel_order", orderId:order.id }); setAdminPin(""); setAdminPinError(""); }}
                          className="w-full py-2 rounded-xl text-xs font-bold"
                          style={{background:"rgba(239,68,68,0.05)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.2)"}}>
                          🔒 Cancelar pedido
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {addingToOrder && (
          <div className="p-2 border-t" style={{borderColor:"var(--border)"}}>
            <div className="flex items-center justify-between text-xs font-bold px-1 mb-1">
              <span style={{color:"#8b5cf6"}}>Agregando a Mesa {addingToOrder.tableNumber}</span>
              <button onClick={() => setAddingToOrder(null)} style={{color:"var(--muted)"}}>✕</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal variantes */}
      {variantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.85)"}}>
          <div className="w-full max-w-sm rounded-2xl border p-6" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <h3 className="font-syne font-black text-lg mb-4">{variantModal.item.name}</h3>
            <div className="flex flex-col gap-2">
              {variantModal.item.variants.map((v: any) => (
                <button key={v.id} onClick={() => {
                  if (variantModal.item.complements?.length > 0) {
                    setModModal({ item: variantModal.item, variant: v, forOrder: variantModal.forOrder });
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

      {/* Modal modificadores */}
      {modModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.85)"}}>
          <div className="w-full max-w-sm rounded-2xl border p-6" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <h3 className="font-syne font-black text-lg mb-1">{modModal.item.name}</h3>
            {modModal.variant && <p className="text-sm mb-3" style={{color:"var(--gold)"}}>{modModal.variant.name}</p>}
            <div className="flex flex-col gap-2 mb-4">
              {modModal.item.complements.map((mod: any) => (
                <label key={mod.id} className="flex items-center justify-between py-2 px-3 rounded-xl cursor-pointer" style={{background:"var(--surf2)"}}>
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
              <button onClick={() => { setModModal(null); setSelectedMods([]); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border"
                style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
              <button onClick={() => {
                if (modModal.forOrder) addItemToExistingOrder(modModal.forOrder, modModal.item, modModal.variant, selectedMods);
                else addToTicket(modModal.item, modModal.variant, selectedMods);
                setModModal(null); setSelectedMods([]);
              }}
                className="flex-1 py-2.5 rounded-xl text-sm font-black"
                style={{background:"var(--gold)",color:"#000"}}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal PIN Admin */}
      {adminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.92)"}}>
          <div className="w-full max-w-xs rounded-2xl border p-6 text-center" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <div className="text-3xl mb-2">🔒</div>
            <h3 className="font-syne font-black text-lg mb-1">PIN Administrador</h3>
            <p className="text-xs mb-4" style={{color:"var(--muted)"}}>
              {adminModal.action === "remove_item" ? "Para eliminar productos" : "Para cancelar el pedido"}
            </p>
            <div className="text-2xl font-black tracking-widest mb-3 h-8" style={{color:"var(--gold)"}}>
              {"●".repeat(adminPin.length)}
            </div>
            {adminPinError && <p className="text-xs mb-2" style={{color:"#ef4444"}}>{adminPinError}</p>}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k, i) => (
                <button key={i}
                  onClick={() => {
                    if (k==="⌫") setAdminPin(p => p.slice(0,-1));
                    else if (k!=="") setAdminPin(p => p.length < 6 ? p + k : p);
                  }}
                  className="py-3 rounded-xl text-lg font-black"
                  style={{background: k==="" ? "transparent" : "var(--surf2)", color: k==="⌫" ? "#ef4444" : "var(--text)"}}>
                  {k}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setAdminModal(null); setAdminPin(""); setAdminPinError(""); }}
                className="flex-1 py-2.5 rounded-xl font-bold border"
                style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
              <button onClick={() => verifyAdminPin(() => {
                if (adminModal.action === "remove_item") removeFromTicket(adminModal.idx);
                if (adminModal.action === "cancel_order") {
                  api.put(`/api/orders/${adminModal.orderId}/status`, { status: "CANCELLED" })
                    .then(() => { fetchOrders(); setSelectedOrder(null); });
                }
              })}
                disabled={adminPin.length < 4}
                className="flex-1 py-2.5 rounded-xl font-syne font-black"
                style={{background: adminPin.length >= 4 ? "var(--gold)" : "var(--muted)", color:"#000"}}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── DETALLE ORDEN ──
  if (screen === "orderDetail" && selectedOrder) {
    const sc = STATUS_COLORS[selectedOrder.status] || "#888";
    return (
      <div className="min-h-screen flex flex-col" style={{background:"var(--bg)"}}>
        <div className="px-6 py-4 flex items-center gap-4 border-b" style={{borderColor:"var(--border)",background:"var(--surf)"}}>
          <button onClick={() => setScreen("home")} className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{background:"var(--surf2)",color:"var(--muted)"}}>←</button>
          <div className="flex-1">
            <h1 className="font-syne font-black text-xl">{selectedOrder.orderNumber}</h1>
            <p className="text-xs" style={{color:"var(--muted)"}}>Mesa {selectedOrder.tableNumber}</p>
          </div>
          <span className="px-3 py-1.5 rounded-full text-sm font-bold" style={{background:sc+"18",color:sc}}>{STATUS_LABELS[selectedOrder.status]}</span>
        </div>
        <div className="p-6">
          <div className="rounded-2xl border overflow-hidden mb-4" style={{borderColor:"var(--border)"}}>
            {(selectedOrder.items||[]).map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 border-b" style={{borderColor:"var(--border)"}}>
                <div className="font-black text-lg w-8 text-center" style={{color:"var(--gold)"}}>{item.quantity}x</div>
                <div className="flex-1">
                  <div className="font-medium">{item.name||item.menuItem?.name}</div>
                  {item.notes && <div className="text-xs mt-0.5" style={{color:"var(--gold)"}}>{item.notes}</div>}
                </div>
                <div className="font-bold" style={{color:"var(--gold)"}}>${Number(item.subtotal).toFixed(0)}</div>
              </div>
            ))}
            <div className="px-5 py-4 flex justify-between font-syne font-black text-lg" style={{background:"var(--surf2)"}}>
              <span>Total</span><span style={{color:"var(--gold)"}}>${Number(selectedOrder.total).toFixed(0)}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => printBill(selectedOrder)}
              className="flex-1 py-3 rounded-xl font-bold border"
              style={{borderColor:"var(--border)",color:"var(--muted)"}}>
              🖨️ Imprimir cuenta
            </button>
            <button onClick={() => { setScreen("tpv"); setAddingToOrder(selectedOrder); }}
              className="flex-1 py-3 rounded-xl font-bold"
              style={{background:"rgba(139,92,246,0.1)",color:"#8b5cf6",border:"1px solid rgba(139,92,246,0.3)"}}>
              ➕ Agregar productos
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
