"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Heart, Loader2, Plus, Printer, RefreshCw, Search, Settings, ShoppingBag, Sparkles, Unlink, User, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import EmployeePinModal from "../components/EmployeePinModal";
import PaymentModal, { type TokkiPaymentMethod } from "../components/PaymentModal";
import PrinterSettingsModal from "../components/PrinterSettingsModal";
import ProductOptionsModal from "../components/ProductOptionsModal";
import SettingsPanel from "../components/SettingsPanel";
import OpenOrdersModal from "../components/OpenOrdersModal";
import { usePrinters } from "../hooks/usePrinters";
import { useOnlineOrders } from "../hooks/useOnlineOrders";
import { apiOrQueue, initBackgroundSync, stopBackgroundSync } from "../lib/offline";
import { printCustomerReceipt } from "../lib/printer-tcp";
import { printTokkiOrder } from "../lib/tokki-printers";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";
import { accessMessage, canPerform, roleLabels, type PosAction } from "../lib/access";
import { protectedStorage } from "../lib/protected-storage";
import { includedTaxTotals } from "../lib/totals";
import { clearLinkedDeviceCookie, hasLinkedDevice } from "../lib/device-link";

type ModifierSelection = { id: string; groupId: string; name: string; priceAdd: number };
type Variant = { id: string; name?: string; price?: number; isAvailable?: boolean };
type Modifier = { id: string; name: string; priceAdd?: number; isAvailable?: boolean };
type ModifierGroup = { id: string; name: string; required?: boolean; multiSelect?: boolean; min?: number; max?: number; modifiers?: Modifier[] };
type Product = { id: string; menuItemId?: string; categoryId: string; name: string; description?: string; imageUrl?: string; imageFit?: string; price: number; promoPrice?: number; isAvailable?: boolean; variants?: Variant[]; modifierGroups?: ModifierGroup[] };
type CartItem = Product & { uid: string; quantity: number; variantId?: string | null; notes?: string; modifiers?: ModifierSelection[]; options?: { variant?: string; toppings?: string[]; notes?: string } };
type Category = { id: string; name: string };
type PendingAction = PosAction | null;

function clearDeviceCookie() {
  clearLinkedDeviceCookie();
}

const previewCategories: Category[] = [{ id: "bebidas-toki", name: "BEBIDAS TOKI" }, { id: "frappes", name: "Toki Favorites" }, { id: "fruit-tea", name: "Toki Refreshers" }, { id: "soft-serve", name: "Panda Frozen" }];
const previewProducts: Product[] = [
  { id: "baby-panda", categoryId: "bebidas-toki", name: "Baby Panda", description: "Crea tu bebida ideal en seis pasos.", price: 70, isAvailable: true },
  { id: "panda", categoryId: "bebidas-toki", name: "Panda", description: "Crea tu bebida ideal en seis pasos.", price: 80, isAvailable: true },
  { id: "king-panda", categoryId: "bebidas-toki", name: "King Panda", description: "Crea tu bebida ideal en seis pasos.", price: 90, isAvailable: true },
];

export default function TokkiPOS() {
  const router = useRouter();
  const employee = useAuthStore((state) => state.employee);
  const logout = useAuthStore((state) => state.logout);
  const lineSequence = useRef(0);
  const orderInFlight = useRef(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [query, setQuery] = useState("");
  const [takeawayName, setTakeawayName] = useState("");
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [menuError, setMenuError] = useState<{ stale: boolean; message: string } | null>(null);
  const [showPrinters, setShowPrinters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [saving, setSaving] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const { printers } = usePrinters();
  const settings = useSettingsStore();
  const isPreview = useCallback(() => typeof window !== "undefined" && process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).get("preview") === "1", []);
  const preview = isPreview();

  useOnlineOrders({ printers, enabled: sessionReady && Boolean(employee) && !preview, soundEnabled: settings.soundEnabled });
  const loadMenu = useCallback(async () => {
    if (isPreview()) { setCategories(previewCategories); setProducts(previewProducts); setActiveCategory(previewCategories[0]!.id); setLoadingMenu(false); return; }
    if (!hasLinkedDevice()) { router.replace("/setup"); return; }
    setLoadingMenu(true); setMenuError(null);
    try {
      const api = (await import("../lib/api")).default;
      const [categoryResponse, productResponse] = await Promise.all([api.get("/api/menu/categories"), api.get("/api/menu/items?admin=true")]);
      const nextCategories = categoryResponse.data || [];
      setCategories(nextCategories); setProducts(productResponse.data || []); setActiveCategory((current) => current || nextCategories[0]?.id || "");
    } catch (cause: unknown) {
      const status = Number((cause as { response?: { status?: number } })?.response?.status || 0);
      setMenuError({ stale: status === 404, message: status === 404 ? "La vinculación guardada ya no corresponde a este negocio." : "No pudimos cargar el menú. Revisa la conexión e inténtalo otra vez." });
    } finally { setLoadingMenu(false); }
  }, [isPreview, router]);

  useEffect(() => { queueMicrotask(() => void loadMenu()); initBackgroundSync(); return () => stopBackgroundSync(); }, [loadMenu]);

  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      await useAuthStore.persist.rehydrate();
      if (!useAuthStore.persist.hasHydrated()) toast.error("No se pudo recuperar el acceso guardado. Ingresa tu PIN nuevamente.");
      await useAuthStore.getState().hydrateFromStorage();
      if (mounted) setSessionReady(true);
    };
    void restore();
    void Promise.resolve(protectedStorage.getItem("deviceToken")).catch(() => toast.error("No se pudo proteger la vinculación. Reinicia la app."));
    const expired = () => {
      setIsPaying(false); setShowSettings(false); setShowPrinters(false); setShowOrders(false);
      setPendingAction("login");
      toast.error("Tu sesión venció. Ingresa tu PIN; tu pedido sigue aquí.");
    };
    const storageError = () => toast.error("No se pudo guardar el acceso seguro. Reinicia la app antes de cerrar la sesión.");
    window.addEventListener("tokki-session-expired", expired);
    window.addEventListener("tokki-storage-error", storageError);
    return () => { mounted = false; window.removeEventListener("tokki-session-expired", expired); window.removeEventListener("tokki-storage-error", storageError); };
  }, []);

  const relink = async () => {
    if (!canPerform(useAuthStore.getState().employee, "relink")) {
      setPendingAction("relink"); return;
    }
    if (!window.confirm("Se cerrará la sesión y tendrás que vincular esta tablet nuevamente. ¿Continuar?")) return;
    try { await protectedStorage.removeItem("deviceToken"); }
    catch { toast.error("No se pudo quitar la vinculación de forma segura."); return; }
    logout();
    useAuthStore.getState().setEmployees([]);
    [
      "restaurantId", "restaurantName", "locationId", "locationName",
      "activeRestaurantId", "activeLocationId", "deviceId", "deviceToken",
      "deviceName", "deviceRole", "remoteConfig", "tpvRemoteConfig",
      "tpvRemoteConfigFetchedAt", "apiBaseUrl",
    ].forEach((key) => localStorage.removeItem(key));
    clearDeviceCookie();
    router.replace("/setup");
  };
  const addToCart = (raw: Record<string, unknown> | Product) => {
    const item = raw as Product & Partial<CartItem>;
    lineSequence.current += 1;
    setCart((current) => [...current, { ...item, menuItemId: item.menuItemId || item.id, uid: `${item.id}-${lineSequence.current}`, quantity: 1 } as CartItem]);
    if (settings.soundEnabled && typeof window !== "undefined") {
      try {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 620; gain.gain.value = 0.035;
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.06);
        oscillator.addEventListener("ended", () => void context.close());
      } catch { /* El sonido es una ayuda opcional. */ }
    }
    toast.success(`${item.name} agregado`);
  };
  const buildItems = () => cart.map((item) => ({ menuItemId: item.menuItemId || item.id, variantId: item.variantId || null, quantity: item.quantity, notes: item.notes || item.options?.notes || "", modifierIds: (item.modifiers || []).map((modifier) => modifier.id) }));
  const printItems = () => cart.map((item) => ({ name: item.name, quantity: item.quantity, price: item.price, notes: item.notes || null, modifiers: (item.modifiers || []).map((modifier) => ({ name: modifier.name, priceAdd: modifier.priceAdd })) }));
  const menuTotal = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const { subtotal, tax: iva, total } = includedTaxTotals(menuTotal, settings.taxEnabled ? settings.taxRate : 0);

  const createOrder = async (paymentMethod: TokkiPaymentMethod | "PENDING") => {
    if (orderInFlight.current) throw new Error("El pedido se está guardando. Espera un momento.");
    if (!takeawayName.trim()) throw new Error("Escribe el nombre para llevar.");
    const action = paymentMethod === "PENDING" ? "send" : "pay";
    if (!canPerform(useAuthStore.getState().employee, action)) throw new Error(accessMessage(action));
    if (isPreview()) throw new Error("La vista previa no registra ventas. Usa la app vinculada.");
    orderInFlight.current = true;
    setSaving(true);
    try {
      const paid = paymentMethod !== "PENDING";
      const result = await apiOrQueue<Record<string, unknown>>("order", "POST", "/api/orders/tpv", { orderType: "TAKEOUT", items: buildItems(), customerName: takeawayName.trim(), customerPhone: null, subtotal, discount: 0, total, paymentMethod, status: paid ? "DELIVERED" : "CONFIRMED" });
      if (!result.ok) throw new Error(result.error?.includes("turno") ? "No hay un turno abierto. Ábrelo en el TPV principal y vuelve a intentar." : result.error || "No se pudo guardar el pedido.");
      const order = result.data as { orderNumber?: string } | null;
      void printTokkiOrder(printers, { orderNumber: order?.orderNumber || (result.queued ? "OFFLINE" : null), orderType: "TAKEOUT", tableNumber: null, customerName: takeawayName.trim(), items: printItems(), paid, paymentMethod }).catch((error) => toast.warning(`Pedido guardado. No se imprimió: ${error.message}. Puedes reimprimir desde Órdenes abiertas.`, { duration: 12000 }));
      toast.success(result.queued ? "Pedido guardado; se enviará al volver la conexión." : paid ? "Cobro y pedido guardados." : "Pedido enviado a cocina.");
      return { orderNumber: order?.orderNumber || "TOKKI", queued: result.queued };
    } finally { orderInFlight.current = false; setSaving(false); }
  };
  const finishOrder = () => { setCart([]); setTakeawayName(""); };
  const completePayment = async (method: TokkiPaymentMethod) => {
    const receipt = { orderType: "TAKEOUT" as const, tableNumber: null, customerName: takeawayName.trim(), items: printItems(), subtotal, tax: iva, total, paymentMethod: method, paid: true };
    const order = await createOrder(method);
    // Una venta guardada se termina aunque la impresora falle: reintentar no debe cobrar dos veces.
    setIsPaying(false); finishOrder();
    if (settings.autoPrintReceipt) {
      try {
        for (let copy = 0; copy < settings.receiptCopies; copy += 1) {
          const print = await printCustomerReceipt(printers, { ...receipt, orderNumber: order.orderNumber });
          if (print.failed.length || !print.ok) { toast.warning("Cobro guardado. Revisa la impresora de recibos."); break; }
        }
      } catch { toast.warning("Cobro guardado, pero el recibo no se imprimió."); }
    }
  };
  const requestAction = (action: Exclude<PendingAction, null>) => {
    if (!sessionReady) { toast.info("Estamos recuperando la sesión. Intenta de nuevo en un momento."); return; }
    if ((action === "pay" || action === "send") && !takeawayName.trim()) { toast.error("Escribe el nombre para llevar."); return; }
    if (!canPerform(useAuthStore.getState().employee, action) && !isPreview()) { setPendingAction(action); return; }
    if (action === "pay") setIsPaying(true);
    else if (action === "settings") setShowSettings(true);
    else if (action === "printers") setShowPrinters(true);
    else if (action === "orders") setShowOrders(true);
    else if (action === "relink") void relink();
    else if (action === "send") void createOrder("PENDING").then(finishOrder).catch((error) => toast.error(error.message));
  };
  const afterPin = () => { const action = pendingAction; setPendingAction(null); if (action) requestAction(action); };
  const visibleProducts = products.filter((product) => (!activeCategory || product.categoryId === activeCategory) && product.name.toLowerCase().includes(query.trim().toLowerCase()) && product.isAvailable !== false);
  const isTokiBuilderProduct = (product: Product) => /panda/i.test(product.name) || categories.find((category) => category.id === product.categoryId)?.name.toLowerCase().includes("bebidas toki");

  return (
    <div className="tokki-shell">
      <main className="tokki-catalog">
        <header className="tokki-header">
          <div className="tokki-wordmark"><div className="tokki-logo"><Image src="/assets/tokki-mascot.png" alt="Mascota de Tokki Boba" fill className="object-contain" priority /></div><div><h1><span>TOKKI</span> BOBA</h1><p>Bubble tea · buenos días</p></div></div>
          <label className="tokki-search"><Search size={18} /><span className="sr-only">Buscar productos</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar productos…" /></label>
          <div className="tokki-user"><button onClick={() => requestAction("printers")} disabled={saving} aria-label="Configurar impresoras"><Printer size={19} /></button><button onClick={() => requestAction("settings")} disabled={saving} aria-label="Abrir configuración"><Settings size={19} /></button><button className="employee-switch" disabled={saving} onClick={() => { logout(); setPendingAction("login"); }} aria-label={employee ? "Cambiar empleado" : "Iniciar sesión"}><User size={19} /><span><b>{employee?.name || "Iniciar sesión"}</b><small>{employee ? roleLabels[employee.role] || employee.role : "PIN de empleado"}</small></span></button></div>
        </header>
        <div className="catalog-tools"><button onClick={() => requestAction("orders")} disabled={saving} className="tokki-secondary"><ShoppingBag size={18} /> Órdenes abiertas</button></div>
        <nav className="tokki-categories" aria-label="Categorías">{categories.map((category, index) => <button key={category.id} onClick={() => setActiveCategory(category.id)} aria-pressed={activeCategory === category.id} className={activeCategory === category.id ? "active" : `tone-${index % 4}`}><Sparkles size={15} />{category.name}</button>)}</nav>
        <section className={`tokki-grid density-${settings.density}`} aria-busy={loadingMenu} inert={saving}>
          {loadingMenu && <div className="tokki-state"><Loader2 className="animate-spin" /><b>Cargando menú…</b></div>}
          {!loadingMenu && menuError && <div className="tokki-state tokki-error"><AlertTriangle size={30} /><h2>{menuError.stale ? "Vinculación vencida" : "Menú no disponible"}</h2><p>{menuError.message}</p><div><button onClick={() => void loadMenu()} className="tokki-secondary"><RefreshCw size={17} /> Reintentar</button>{menuError.stale && <button onClick={() => requestAction("relink")} className="tokki-primary"><Unlink size={17} /> Volver a vincular</button>}</div></div>}
          {!loadingMenu && !menuError && visibleProducts.map((product) => <button key={product.id} onClick={() => isTokiBuilderProduct(product) || product.variants?.length || product.modifierGroups?.length ? setActiveProduct(product) : addToCart(product)} className="tokki-product-card"><div>{product.imageUrl ? <Image src={product.imageUrl} alt={product.name} fill className={product.imageFit === "contain" ? "object-contain p-2" : "object-cover"} /> : <Image src="/assets/tokki-mascot.png" alt="" fill className="object-contain p-4 opacity-70" />}<Heart size={15} fill="currentColor" /></div><footer><span><b>{product.name}</b><strong>${Number(product.promoPrice || product.price).toFixed(0)}</strong></span><i><Plus size={17} /></i></footer></button>)}
          {!loadingMenu && !menuError && visibleProducts.length === 0 && <div className="tokki-state"><Image src="/assets/tokki-mascot.png" alt="" width={70} height={70} /><b>No encontramos productos</b><small>Prueba otra categoría o búsqueda.</small></div>}
        </section>
      </main>
      <aside className="tokki-ticket" inert={saving} aria-busy={saving}>
        <header><ShoppingBag size={19} /><span><b>Nuevo pedido</b><small>Tokki Boba · para llevar</small></span><strong>Para llevar</strong></header>
        <label className={`takeaway-name ${cart.length > 0 && !takeawayName.trim() ? "required" : ""}`}><User size={17} /><span className="sr-only">Nombre para llevar</span><input value={takeawayName} onChange={(event) => setTakeawayName(event.target.value)} placeholder="Nombre para llevar *" maxLength={60} /></label>
        {cart.length > 0 && !takeawayName.trim() && <p className="name-helper">Necesario para identificar el pedido.</p>}
        <div className="cart-lines">{cart.map((item) => <article key={item.uid}><div className="cart-thumb"><Image src={item.imageUrl || "/assets/tokki-mascot.png"} alt="" fill className="object-contain p-1" /></div><span><b>{item.name}</b><small>{item.options?.variant || item.options?.toppings?.join(", ") || "Para llevar"}</small></span><div className="stepper"><button onClick={() => setCart((current) => current.map((line) => line.uid === item.uid ? { ...line, quantity: Math.max(1, line.quantity - 1) } : line))} aria-label={`Quitar uno de ${item.name}`}>−</button><b>{item.quantity}</b><button onClick={() => setCart((current) => current.map((line) => line.uid === item.uid ? { ...line, quantity: line.quantity + 1 } : line))} aria-label={`Agregar uno de ${item.name}`}>+</button></div><strong>${(item.price * item.quantity).toFixed(0)}</strong><button onClick={() => setCart((current) => current.filter((line) => line.uid !== item.uid))} aria-label={`Eliminar ${item.name}`}><X size={15} /></button></article>)}</div>
        {cart.length === 0 && <div className="empty-cart"><Image src="/assets/tokki-mascot.png" alt="" width={78} height={78} /><b>Tu pedido está listo para llenarse</b><small>Toca un producto para agregarlo.</small></div>}
        <footer className="ticket-totals"><div><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>{settings.taxEnabled && <div><span>IVA incluido ({settings.taxRate}%)</span><span>${iva.toFixed(2)}</span></div>}<div className="grand-total"><b>Total</b><strong>${total.toFixed(2)}</strong></div><button onClick={() => requestAction("pay")} disabled={!cart.length || saving} className="charge"><ShoppingBag size={18} /> Cobrar</button><div className="ticket-actions"><button onClick={() => { setCart([]); setTakeawayName(""); }} disabled={!cart.length || saving}>Cancelar</button><button onClick={() => requestAction("send")} disabled={!cart.length || saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : null} Enviar</button></div></footer>
      </aside>
      {showPrinters && (canPerform(employee, "printers") || preview) && <PrinterSettingsModal onClose={() => setShowPrinters(false)} />}
      {showOrders && (canPerform(employee, "orders") || preview) && <OpenOrdersModal printers={printers} preview={preview} onClose={() => setShowOrders(false)} />}
      {showSettings && (canPerform(employee, "settings") || preview) && <SettingsPanel onClose={() => setShowSettings(false)} onPrinters={() => { setShowSettings(false); requestAction("printers"); }} onRelink={() => requestAction("relink")} />}
      {activeProduct && <ProductOptionsModal product={activeProduct} companions={products.filter((item) => item.categoryId === activeProduct.categoryId && /panda/i.test(item.name) && item.isAvailable !== false)} onClose={() => setActiveProduct(null)} onAdd={addToCart} />}
      {pendingAction && <EmployeePinModal action={pendingAction} onClose={() => setPendingAction(null)} onSuccess={afterPin} />}
      {isPaying && <PaymentModal total={total} enabledMethods={settings.paymentMethods} onClose={() => setIsPaying(false)} onSuccess={completePayment} />}
    </div>
  );
}
