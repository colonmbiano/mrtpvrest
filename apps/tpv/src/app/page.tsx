"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Settings, Delete, Armchair, ShoppingBag, Bike, Bell, RefreshCcw, Truck, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import KDSMessages from "@/components/admin/KDSMessages";
import DriversPanel from "@/components/admin/DriversPanel";
import { useModals } from "@/contexts/ModalContext";
import ModalStack from "@/components/tpv/ModalStack";
import PaletteSwitcher from "@/components/PaletteSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import POSShell from "@/components/tpv/POSShell";
import SideRail, { type RailSection } from "@/components/tpv/SideRail";
import CategoryTabs from "@/components/tpv/CategoryTabs";
import ProductGrid from "@/components/tpv/ProductGrid";
import TicketPanel, { type OrderType, type OrderTypeOption } from "@/components/tpv/TicketPanel";
import TablesFloorPlan from "@/components/admin/TablesFloorPlan";
import RetailLayout from "@/components/layouts/RetailLayout";
import BarLayout from "@/components/layouts/BarLayout";
import CafeLayout from "@/components/layouts/CafeLayout";
import { useLocation } from "@/hooks/useLocation";
import { useTpvConfig } from "@/hooks/useTpvConfig";
import { useRouter } from "next/navigation";

// Actualizado a tu naranja corporativo por defecto. 
// La variable remota tomará el color del Tenant en Supabase.
const DEFAULT_ACCENT = "#ff5c35"; 
const DISPLAY_CONFIG_KEY = "tpv-display-config";
const EMPLOYEE_TOKEN_KEY = "tpv-employee-token";
const EMPLOYEE_DATA_KEY = "tpv-employee";
const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 6;
const GRID_CLASS_BY_COLS: Record<number, string> = {
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
};
const FONT_CLASS_BY_SIZE: Record<string, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
};

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

const ALL_ORDER_TYPES: { t: string; l: string }[] = [
  { t: "TAKEOUT",  l: "🥡 Llevar" },
  { t: "DINE_IN",  l: "🪑 Mesa" },
  { t: "DELIVERY", l: "🛵 Domicilio" },
];

import { usePOSStore } from "@/store/usePOSStore";

export default function TPVPage() {
  const router = useRouter();
  const themeChosen = usePOSStore((s) => s.themeChosen);
  const hasHydrated = usePOSStore((s) => s._hasHydrated);
  const { openShift, openTpvConfig, openPayment, openDiscount, openConfirm, openOrderDetail, openDeliveryAssign, openChangeOrderType } = useModals();
  const [railSection, setRailSection] = useState<RailSection>("catalog");
  const [showOrdersDrawer, setShowOrdersDrawer] = useState(false);

  // Gate: only after persist has rehydrated, redirect to wizard if no theme chosen
  useEffect(() => {
    if (!hasHydrated) return;
    const linked = !!localStorage.getItem("restaurantId") && !!localStorage.getItem("locationId");
    if (linked && !themeChosen) {
      router.replace("/setup?step=appearance");
    }
  }, [hasHydrated, themeChosen, router]);

  // Cerebro Adaptativo: tipo de negocio por sucursal
  const { businessType, loading: locLoading } = useLocation();

  // TpvRemoteConfig — branding, orderTypes permitidos, idle lock, etc.
  const remoteConfig = useTpvConfig();
  const ACCENT = remoteConfig.accentColor || DEFAULT_ACCENT;
  const orderTypeTabs = ALL_ORDER_TYPES.filter(({ t }) =>
    remoteConfig.allowedOrderTypes.includes(t as any),
  );

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
  const defaultOrderType = orderTypeTabs[0]?.t || "TAKEOUT";
  const emptyTicket = () => ({ id: Date.now(), name: "", phone: "", type: defaultOrderType, table: "", tableId: "", tableName: "", address: "", items: [], discount: 0, discountType: "percent" });
  const [tickets, setTickets]           = useState<any[]>(() => [{ id: 1, name: "", phone: "", type: "TAKEOUT", table: "", tableId: "", tableName: "", address: "", items: [], discount: 0, discountType: "percent" }]);

  useEffect(() => {
    if (orderTypeTabs.length === 0) return;
    setTickets(ts => ts.map(t =>
      remoteConfig.allowedOrderTypes.includes(t.type) ? t : { ...t, type: defaultOrderType }
    ));
  }, [remoteConfig.allowedOrderTypes.join(","), defaultOrderType]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // payment modal: openPayment(order) → <ModalStack/> renders <PaymentModal/>
  const [updatingOrder, setUpdatingOrder]         = useState<string | null>(null);
  const [addingToOrder, setAddingToOrder]         = useState<any>(null);
  const [printers, setPrinters]                   = useState<any[]>([]);
  const [reprintOpen, setReprintOpen]             = useState<string | null>(null);
  const [editTypeOrder, setEditTypeOrder]         = useState<string | null>(null);
  const [editAddress, setEditAddress]             = useState("");
  const [confirmingCash, setConfirmingCash]       = useState<string | null>(null);

  // Turno
  const [activeShift, setActiveShift]             = useState<any>(null);

  // Bloqueo
  const [isGlobalLocked, setIsGlobalLocked]     = useState(true);
  const [currentEmployee, setCurrentEmployee]   = useState<any>(null);
  const [pinInput, setPinInput]                 = useState("");
  const [pinError, setPinError]                 = useState("");
  const [isVerifyingPin, setIsVerifyingPin]     = useState(false);

  // Modales manager y Configuración de Interfaz
  const [showManagerMenu, setShowManagerMenu]     = useState(false);
  const [showDriversPanel, setShowDriversPanel]   = useState(false);
  const [showTablesFloor, setShowTablesFloor]     = useState(false);
  const [showTablePicker, setShowTablePicker]     = useState(false);
  // shift + tpv config modals are now opened via useModals() / rendered by <ModalStack/>

  const [gridCols, setGridCols] = useState(4);
  const [fontSize, setFontSize] = useState<"xs" | "sm" | "md" | "lg" | "xl">("sm");
  const [showImages, setShowImages] = useState(true);

  // Mobile nav
  const [ticketDrawerOpen, setTicketDrawerOpen] = useState(false);
  const [ordersDrawerOpen, setOrdersDrawerOpen] = useState(false);

  const ticket  = tickets[activeTicket] || tickets[0];
  const isAdmin = ["ADMIN", "MANAGER", "OWNER"].includes(currentEmployee?.role);

  const promptShift = useCallback(() => {
    openShift({
      id: currentEmployee?.id ?? "",
      name: currentEmployee?.name ?? "Cajero",
      role: currentEmployee?.role ?? "",
    });
  }, [openShift, currentEmployee]);

  const clearEmployeeSession = useCallback(() => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
    localStorage.removeItem(EMPLOYEE_DATA_KEY);
    localStorage.removeItem("kdsEmployee");
    setIsGlobalLocked(true);
    setCurrentEmployee(null);
    setActiveShift(null);
    setShowManagerMenu(false);
    setOrders([]);
    setPendingCashOrders([]);
    setSelectedOrder(null);
    setAllItems([]);
    setCategories([]);
    setPinInput("");
    setPinError("");
  }, []);

  const handleExpiredSession = useCallback(() => {
    clearEmployeeSession();
    setIsGlobalLocked(true);
  }, [clearEmployeeSession]);

  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      res => res,
      err => {
        const url = String(err?.config?.url || "");
        // Avoid redirect loop if useLocation or config fetches fail while locked
        if (err?.response?.status === 401 && !url.includes("/api/employees/login") && !url.includes("/api/locations/") && !url.includes("/api/tpv/config")) {
          handleExpiredSession();
        }
        return Promise.reject(err);
      },
    );
    return () => api.interceptors.response.eject(interceptorId);
  }, [handleExpiredSession]);

  const applyDisplayConfig = useCallback((cfg: any) => {
    const nextGridCols = Number(cfg?.gridCols ?? cfg?.gridSize);
    if (nextGridCols && GRID_CLASS_BY_COLS[nextGridCols]) setGridCols(nextGridCols);
    if (cfg?.fontSize && FONT_CLASS_BY_SIZE[cfg.fontSize]) setFontSize(cfg.fontSize);
    if (cfg?.showImages !== undefined) setShowImages(Boolean(cfg.showImages));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DISPLAY_CONFIG_KEY);
      if (saved) applyDisplayConfig(JSON.parse(saved));
    } catch {}

    const onDisplayConfigChanged = (event: Event) => {
      applyDisplayConfig((event as CustomEvent).detail || {});
    };

    window.addEventListener("tpv-config-changed", onDisplayConfigChanged);
    return () => window.removeEventListener("tpv-config-changed", onDisplayConfigChanged);
  }, [applyDisplayConfig]);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const timeoutSec = remoteConfig.lockTimeoutSec;
    if (!timeoutSec || timeoutSec <= 0) return;
    if (isGlobalLocked) return;

    const reset = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => clearEmployeeSession(), timeoutSec * 1000);
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    events.forEach(ev => window.addEventListener(ev, reset, { passive: true }));
    reset();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach(ev => window.removeEventListener(ev, reset));
    };
  }, [remoteConfig.lockTimeoutSec, isGlobalLocked, clearEmployeeSession]);

  useEffect(() => {
    const restId = localStorage.getItem("restaurantId");
    const locId  = localStorage.getItem("locationId");
    if (!restId || !locId) {
      router.replace("/setup");
    } else {
      setIsConfigured(true);
      
      const storedRestName = localStorage.getItem("restaurantName");
      const storedLocName = localStorage.getItem("locationName");
      if (storedRestName) setRestaurantName(storedRestName);
      if (storedLocName) setLocationName(storedLocName);

      const storedToken = localStorage.getItem(EMPLOYEE_TOKEN_KEY) || localStorage.getItem("accessToken");
      const storedEmployee = localStorage.getItem(EMPLOYEE_DATA_KEY);

      if (!storedToken || !storedEmployee) return;

      try {
        const parsedEmployee = JSON.parse(storedEmployee);
        localStorage.setItem("accessToken", storedToken);
        setCurrentEmployee(parsedEmployee);
        setPinError("");

        if (parsedEmployee?.role === "WAITER") {
          router.replace("/meseros");
          return;
        }

        if (parsedEmployee?.role === "KITCHEN") {
          localStorage.setItem("kdsEmployee", storedEmployee);
          router.replace("/kds");
          return;
        }

        setIsGlobalLocked(false);
        api.get("/api/shifts/active")
          .then(({ data }) => setActiveShift(data))
          .catch(() => setActiveShift(null));
      } catch {
        clearEmployeeSession();
      }
    }
  }, [clearEmployeeSession, handleExpiredSession, router]);

  async function refreshShift() {
    try { const { data } = await api.get("/api/shifts/active"); setActiveShift(data); }
    catch { setActiveShift(null); }
  }

  const unlockEmployeeSession = useCallback(async (employee: any, token: string) => {
    localStorage.setItem("accessToken", token);
    localStorage.setItem(EMPLOYEE_TOKEN_KEY, token);
    localStorage.setItem(EMPLOYEE_DATA_KEY, JSON.stringify(employee));
    setCurrentEmployee(employee);
    setPinInput("");
    setPinError("");

    if (employee?.role === "WAITER") {
      router.replace("/meseros");
      return;
    }

    if (employee?.role === "KITCHEN") {
      localStorage.setItem("kdsEmployee", JSON.stringify(employee));
      router.replace("/kds");
      return;
    }

    await refreshShift();
    setIsGlobalLocked(false);
  }, [router]);

  const handleVerifyGlobalPin = async (enteredPin: string) => {
    if (enteredPin.length < PIN_MIN_LENGTH) {
      setPinError("Ingresa al menos 4 digitos.");
      return;
    }

    setIsVerifyingPin(true);
    setPinError("");
    try {
      const { data } = await api.post("/api/employees/login", { pin: enteredPin });
      const token = data.token || data.accessToken;
      const employee = data.user || data.employee;
      if (!token || !employee) throw new Error("Sesion incompleta");
      await unlockEmployeeSession(employee, token);
    } catch { alert("PIN Incorrecto ❌"); setPinInput(""); }
    finally { setIsVerifyingPin(false); }
  };

  const appendPinDigit = (digit: string) => {
    if (isVerifyingPin) return;
    setPinError("");
    setPinInput(prev => prev.length >= PIN_MAX_LENGTH ? prev : prev + digit);
  };

  const removeLastPinDigit = () => {
    if (isVerifyingPin) return;
    setPinError("");
    setPinInput(prev => prev.slice(0, -1));
  };

  const clearPin = () => {
    if (isVerifyingPin) return;
    setPinError("");
    setPinInput("");
  };

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/api/orders/admin");
      setOrders(data.filter((o: any) => !["DELIVERED", "CANCELLED"].includes(o.status) && (o.source === "TPV" || o.source === "WAITER" || o.source === "ONLINE")));
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
    if (!activeShift) { alert("⚠️ Debes abrir un turno antes de agregar productos"); promptShift(); return; }

    // Si estamos en MODO EDICIÓN, inyectamos directamente a la orden
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
    if (!activeShift) { alert("⚠️ Debes abrir un turno para agregar productos"); promptShift(); return; }
    try {
      const price = variant ? variant.price : item.price;
      const modsPrice = (mods || []).reduce((s: number, m: any) => s + m.price, 0);
      const finalPrice = price + modsPrice;
      await api.post(`/api/orders/${order.id}/items`, {
        menuItemId: item.id, name: item.name + (variant ? ` - ${variant.name}` : ""),
        price: finalPrice, quantity: 1, subtotal: finalPrice,
        notes: (mods || []).map((m: any) => m.name).join(", "),
      });
      fetchOrders();
      if (selectedOrder?.id === order.id) { const { data } = await api.get(`/api/orders/${order.id}`); setSelectedOrder(data); }
    } catch (err: any) { alert(err.response?.data?.error || "Error al agregar"); }
  }

  function closeProductModals() {
    setVariantModal(null);
    setModifierModal(null);
    setSelectedMods([]);
  }

  function resolveProductSelection(ctx: any, variant: any, mods: any[]) {
    if (!ctx?.item) return;
    if (ctx.forOrder) addItemToExistingOrder(ctx.forOrder, ctx.item, variant, mods);
    else addToTicket(ctx.item, variant, mods);
    closeProductModals();
  }

  function chooseVariant(variant: any) {
    const ctx = variantModal;
    const complements = ctx?.item?.complements || ctx?.item?.modifiers || [];
    setVariantModal(null);
    if (complements.length > 0) {
      setModifierModal({ item: ctx.item, variant, forOrder: ctx.forOrder || null });
      return;
    }
    resolveProductSelection(ctx, variant, []);
  }

  function toggleModifier(mod: any) {
    setSelectedMods(prev =>
      prev.some((m: any) => m.id === mod.id)
        ? prev.filter((m: any) => m.id !== mod.id)
        : [...prev, mod],
    );
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
    if (!activeShift) { alert("⚠️ Debes abrir un turno antes de enviar pedidos"); promptShift(); return; }
    try {
      const { data: order } = await api.post("/api/orders/tpv", {
        items: ticket.items.map((i: any) => ({ menuItemId: i.menuItemId, quantity: i.quantity, notes: i.notes })),
        orderType: ticket.type,
        tableNumber: ticket.table ? Number(ticket.table) : null,
        tableId: ticket.tableId || null,
        paymentMethod: "PENDING", subtotal, discount: discountAmt, total,
        customerName: ticket.name || null, customerPhone: ticket.phone || null,
        deliveryAddress: ticket.type === "DELIVERY" ? (ticket.address || null) : null,
        source: "TPV", status: ticket.tableId ? undefined : "PREPARING",
      });
      closeTicket(activeTicket); fetchOrders();
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
  }

  async function chargeTicket(paymentMethod: string) {
    if (ticket.items.length === 0) { alert("Agrega productos"); return; }
    if (!activeShift) { alert("⚠️ Debes abrir un turno antes de cobrar"); promptShift(); return; }
    try {
      await api.post("/api/orders/tpv", {
        items: ticket.items.map((i: any) => ({ menuItemId: i.menuItemId, quantity: i.quantity, notes: i.notes })),
        orderType: ticket.type,
        tableNumber: ticket.table ? Number(ticket.table) : null,
        tableId: ticket.tableId || null,
        paymentMethod, subtotal, discount: discountAmt, total,
        customerName: ticket.name || null, customerPhone: ticket.phone || null,
        deliveryAddress: ticket.type === "DELIVERY" ? (ticket.address || null) : null,
        source: "TPV", status: "DELIVERED",
      });
      closeTicket(activeTicket); fetchOrders();
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
  }

  async function chargeExistingOrder(orderId: string, method: string) {
    if (!activeShift) { alert("⚠️ Debes abrir un turno antes de cobrar"); promptShift(); return; }
    setUpdatingOrder(orderId);
    try {
      await api.put(`/api/orders/${orderId}/payment`, { paymentMethod: method });
      setSelectedOrder(null); fetchOrders();
    } catch (err: any) { alert(err.response?.data?.error || "Error al cobrar"); }
    finally { setUpdatingOrder(null); }
  }

  async function updateOrderStatus(orderId: string, status: string) {
    if (!activeShift) { alert("⚠️ Debes abrir un turno para cambiar estados"); promptShift(); return; }
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
      alert("🖨️ Reimprimiendo...");
    } catch { alert("Error al reimprimir"); }
  }

  async function printBill(order: any) {
    try { await api.post(`/api/orders/${order.id}/print-bill`); alert("🖨️ Cuenta enviada a imprimir"); }
    catch { alert("Error al imprimir"); }
  }

  async function confirmCash(order: any) {
    if (!activeShift) { alert("⚠️ Debes abrir un turno para confirmar cobros"); promptShift(); return; }
    if (!confirm(`¿Confirmar recepción de $${Number(order.total).toFixed(0)} en efectivo de ${order.orderNumber}?`)) return;
    setConfirmingCash(order.id);
    try {
      await api.put(`/api/orders/${order.id}/confirm-cash`, { collectedBy: "TPV" });
      fetchOrders();
    } catch (err: any) { alert(err.response?.data?.error || "Error al confirmar cobro"); }
    finally { setConfirmingCash(null); }
  }

  async function confirmAllCash() {
    if (!activeShift) { alert("⚠️ Debes abrir un turno para confirmar cobros"); promptShift(); return; }
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
  const gridClass = GRID_CLASS_BY_COLS[gridCols] || GRID_CLASS_BY_COLS[4];
  const productTextClass = FONT_CLASS_BY_SIZE[fontSize] || FONT_CLASS_BY_SIZE.sm;

  if (isConfigured && isGlobalLocked) {
    return (
      <TPVLockScreen
        accent={ACCENT}
        restaurantName={restaurantName}
        locationName={locationName}
        pinInput={pinInput}
        pinError={pinError}
        isVerifyingPin={isVerifyingPin}
        onDigit={appendPinDigit}
        onBackspace={removeLastPinDigit}
        onClear={clearPin}
        onSubmit={() => handleVerifyGlobalPin(pinInput)}
        onChangeLocation={() => router.push("/setup")}
      />
    );
  }

  if (!isConfigured) return null;

  if (!locLoading) {
    if (businessType === "RETAIL") return <RetailLayout />;
    if (businessType === "BAR")    return <BarLayout />;
    if (businessType === "CAFE")   return <CafeLayout />;
  }

  // ── PANELES REUTILIZABLES (Dashboard UI) ──────────────────────────────────
  const ticketPane = (
    <div className="glass-panel flex flex-col h-full min-h-0 overflow-hidden shadow-2xl">
      {/* Pestañas de tickets */}
      <div className="flex items-center gap-1 px-4 pt-4 overflow-x-auto flex-shrink-0 border-b border-white/5 scrollbar-hide">
        {tickets.map((t: any, idx: number) => (
          <div key={t.id} className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={() => setActiveTicket(idx)}
              className="px-4 min-h-[44px] rounded-t-xl text-xs font-bold select-none transition-colors"
              style={{ background: activeTicket === idx ? ACCENT : "rgba(255,255,255,0.05)", color: activeTicket === idx ? "#fff" : "rgba(255,255,255,0.4)" }}>
              {t.name || `T${idx + 1}`}
            </button>
            <button onClick={() => closeTicket(idx)} className="text-xs px-2 min-h-[44px] select-none text-white/40 hover:text-white transition-colors">✕</button>
          </div>
        ))}
        <button onClick={addNewTicket} className="px-3 min-h-[44px] rounded-xl text-base font-black flex-shrink-0 ml-1 select-none text-white/40 hover:bg-white/5 transition-colors">+</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {!activeShift && (
          <div className="rounded-xl p-3 flex items-center justify-between border border-red-500/20 bg-red-500/10">
            <span className="text-xs font-bold text-red-500">🔴 Sin turno abierto</span>
            <button onClick={() => promptShift()} className="text-xs font-black px-4 min-h-[40px] rounded-xl bg-red-500 text-white">Abrir turno</button>
          </div>
        )}
        
        {/* Segmented Control - Tipo de Orden */}
        <div className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
          {orderTypeTabs.map(({ t, l }) => (
            <button key={t} onClick={() => updateTicket({ type: t })}
              className={`flex-1 min-h-[40px] rounded-xl text-xs font-bold transition-all ${ticket.type === t ? 'text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
              style={{ background: ticket.type === t ? ACCENT : "transparent" }}>
              {l}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input value={ticket.name} onChange={e => updateTicket({ name: e.target.value })}
            placeholder="Nombre Cliente" className="flex-1 px-4 py-3 rounded-xl text-sm outline-none bg-white/5 border border-white/10 text-white focus:border-[#ff5c35]/50 transition-colors" />
          <input value={ticket.phone} onChange={e => updateTicket({ phone: e.target.value })}
            placeholder="Teléfono" type="tel" className="w-28 px-4 py-3 rounded-xl text-sm outline-none bg-white/5 border border-white/10 text-white focus:border-[#ff5c35]/50 transition-colors" />
        </div>

        {ticket.type === "DINE_IN" && (
          <button type="button" onClick={() => setShowTablePicker(true)}
            className="glass-button w-full px-4 py-3 rounded-xl text-sm font-bold outline-none text-center flex items-center justify-center gap-2 transition-all text-white"
            style={{ borderColor: ticket.tableId ? ACCENT : undefined, color: ticket.tableId ? ACCENT : undefined }}>
            <span className="table-glyph table-glyph--mini" aria-hidden="true" />
            <span>{ticket.tableName ? `Mesa: ${ticket.tableName}` : "Seleccionar mesa"}</span>
            {ticket.tableId && (
              <span onClick={ev => { ev.stopPropagation(); updateTicket({ tableId: "", tableName: "", table: "" }); }} className="ml-2 text-xs opacity-70 hover:opacity-100">✕</span>
            )}
          </button>
        )}
        {ticket.type === "DELIVERY" && (
          <input value={ticket.address} onChange={e => updateTicket({ address: e.target.value })}
            placeholder="📍 Dirección de entrega" className="w-full px-4 py-3 rounded-xl text-sm outline-none bg-white/5 border border-white/10 text-white focus:border-[#ff5c35]/50 transition-colors" />
        )}

        <div className="w-full h-px bg-white/5 my-2" />

        {ticket.items.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center opacity-20 gap-4">
            <span className="text-5xl">🛒</span>
            <span className="text-xs font-bold uppercase tracking-widest text-white">Orden Vacía</span>
          </div>
        ) : ticket.items.map((item: any, idx: number) => (
          <div key={idx} className="flex items-start gap-3 py-3 border-b border-white/5">
            <div className="flex-1 text-xs min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-syne font-bold text-sm text-white">{item.name}</span>
                {item.variantName && <span className="font-bold" style={{ color: ACCENT }}>({item.variantName})</span>}
                {item.isPromo && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: ACCENT + "22", color: ACCENT }}>PROMO</span>}
              </div>
              {item.notes && <div className="text-[10px] mt-1 text-white/40">{item.notes}</div>}
            </div>
            <div className="flex items-center gap-1 bg-black/20 rounded-lg p-0.5 border border-white/5">
              <button onClick={() => changeQty(idx, -1)} className="w-8 h-8 rounded-md text-base flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-colors">−</button>
              <span className="text-sm font-bold w-6 text-center text-white">{item.quantity}</span>
              <button onClick={() => changeQty(idx, 1)} className="w-8 h-8 rounded-md text-base flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-colors">+</button>
            </div>
            <div className="flex flex-col items-end flex-shrink-0 ml-2">
              <span className="text-sm font-black text-white">${item.subtotal.toFixed(0)}</span>
              <button onClick={() => removeFromTicket(idx)} className="text-[10px] mt-1 px-1 text-red-400 hover:underline">Eliminar</button>
            </div>
          </div>
        ))}
        
        {ticket.items.length > 0 && (
          <div className="space-y-4 pt-4">
            <div className="flex justify-between text-sm text-white/60"><span>Subtotal</span><span>${subtotal.toFixed(0)}</span></div>
            {discountAmt > 0 && <div className="flex justify-between text-sm text-green-400"><span>Descuento</span><span>−${discountAmt.toFixed(0)}</span></div>}
            <div className="flex justify-between font-black text-3xl py-3 border-t border-white/5">
              <span className="font-syne text-white">Total</span>
              <span style={{ color: ACCENT }}>${total.toFixed(0)}</span>
            </div>
            <button onClick={sendToKitchen} className="w-full min-h-[50px] rounded-xl text-sm font-bold border border-white/10 text-white bg-white/5 hover:bg-white/10 transition-all">
              🍳 Enviar a cocina
            </button>
            <div className="grid grid-cols-2 gap-2">
              {PAY_METHODS.map(m => (
                <button key={m.value} onClick={() => chargeTicket(m.value)}
                  className={`min-h-[56px] rounded-xl text-sm font-black transition-all ${activeShift ? 'hover:brightness-110 active:scale-95' : 'opacity-50'}`}
                  style={{
                    background: activeShift ? ACCENT : "rgba(255,255,255,0.05)",
                    color: activeShift ? "#fff" : "rgba(255,255,255,0.4)",
                    border: activeShift ? `1px solid transparent` : "1px solid rgba(255,255,255,0.1)",
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const ordersPane = (
    <div className="glass-panel flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0 bg-white/[0.03]">
        <span className="text-sm font-syne font-black uppercase tracking-widest text-white">Pedidos Activos</span>
        {orders.length > 0 && <span className="text-xs font-black px-2.5 py-0.5 rounded-full text-white" style={{ background: ACCENT }}>{orders.length}</span>}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
        {orders.length === 0 ? (
          <div className="text-center py-16 text-sm text-white/40">Sin pedidos activos</div>
        ) : orders.map((order: any) => {
          const sc = STATUS_COLORS[order.status] || "#888";
          const isSel = selectedOrder?.id === order.id;
          return (
            <div key={order.id} className="glass-card rounded-2xl border transition-all"
              style={{ borderColor: isSel ? ACCENT : "rgba(255,255,255,0.05)" }}>
              <button className="w-full px-5 py-4 flex items-center justify-between text-left min-h-[64px]"
                onClick={() => setSelectedOrder(isSel ? null : order)}>
                <div className="min-w-0">
                  <div className="text-base font-bold truncate text-white font-syne">
                    {order.customerName || order.user?.name || "Sin nombre"}
                    {order.tableNumber && <span className="text-purple-400"> · Mesa {order.tableNumber}</span>}
                  </div>
                  <div className="text-[10px] text-white/40 mt-1">{order.orderNumber}</div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="text-[10px] px-2 py-0.5 rounded-full font-bold mb-1 whitespace-nowrap inline-block" style={{ background: sc + "20", color: sc }}>{STATUS_LABELS[order.status]}</div>
                  <div className="text-base font-black" style={{ color: ACCENT }}>${Number(order.total).toFixed(0)}</div>
                </div>
              </button>
              {isSel && (
                <div className="px-5 pb-4 border-t border-white/5">
                  <div className="my-4 space-y-2 text-xs text-white/60">
                    {(order.items || []).map((item: any, i: number) => (
                      <div key={i} className="flex justify-between"><span>{item.quantity}x {item.name}</span><span className="text-white/90">${Number(item.subtotal).toFixed(0)}</span></div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {/* Botón de Modo Edición */}
                    <button onClick={() => { setAddingToOrder(order); setOrdersDrawerOpen(false); }}
                      className="w-full min-h-[48px] rounded-xl text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all mb-3">
                      ➕ Agregar más productos
                    </button>

                    {(() => { const nextStatus = NEXT_STATUS[order.status]; return nextStatus && (
                      <button onClick={() => updateOrderStatus(order.id, nextStatus)} disabled={updatingOrder === order.id}
                        className="w-full min-h-[48px] rounded-xl text-xs font-bold text-white hover:brightness-110 transition-all"
                        style={{ background: ACCENT }}>
                        {updatingOrder === order.id ? "..." : `→ ${STATUS_LABELS[nextStatus]}`}
                      </button>
                    ); })()}
                    <button onClick={() => openPayment({
                        id: order.id,
                        total: Number(order.total ?? 0),
                        items: (order.items || []).map((it: any) => ({
                          id: it.id,
                          name: it.product?.name || it.name,
                          quantity: Number(it.quantity ?? 1),
                          price: Number(it.price ?? it.product?.price ?? 0),
                        })),
                        customerName: order.customerName,
                        table: order.tableName,
                      })}
                      className="w-full min-h-[48px] rounded-xl text-xs font-bold text-green-400 bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-all">
                      💵 Cobrar ticket
                    </button>
                    <button onClick={() => updateOrderStatus(order.id, "CANCELLED")}
                      className="w-full min-h-[48px] rounded-xl text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all">
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
  );

  const menuPane = (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden relative">
      {/* Categorías: chips horizontal (< lg) */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 flex-shrink-0 border-b border-white/10 scrollbar-hide whitespace-nowrap lg:hidden bg-white/[0.03] backdrop-blur-xl">
        {[{ id: "all", name: "Todo" }, ...categories].map(cat => (
          <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
            className={`px-5 min-h-[44px] rounded-xl text-xs font-syne font-bold flex-shrink-0 transition-all ${selectedCat === cat.id ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/5'}`}
            style={{ borderBottom: selectedCat === cat.id ? `3px solid ${ACCENT}` : '3px solid transparent' }}>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Banner de Modo Edición */}
      {addingToOrder && (
        <div className="mx-6 mt-6 p-4 rounded-2xl flex items-center justify-between shadow-2xl animate-pulse text-white"
          style={{ background: ACCENT }}>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Modo de edición activa</span>
            <span className="text-base font-bold font-syne">
              Agregando a: {addingToOrder.customerName || `Mesa ${addingToOrder.tableNumber}`} ({addingToOrder.orderNumber})
            </span>
          </div>
          <button onClick={() => setAddingToOrder(null)}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-black/20 hover:bg-black/30 transition-colors">
            Terminar
          </button>
        </div>
      )}

      {/* Menu grid */}
      <div className="flex-1 overflow-y-auto p-6 pb-28 md:pb-6 scrollbar-hide">
        {allItems.length === 0 ? (
          <div className="flex items-center justify-center h-full flex-col gap-4 text-white/40">
            <div className="text-5xl animate-spin">🍔</div>
            <div className="text-sm font-syne">Cargando menú...</div>
          </div>
        ) : (
          <div className={`grid gap-4 ${gridClass}`}>
            {filteredItems.map((item: any) => (
              <button key={item.id} onClick={() => handleItemClick(item)}
                className={`glass-card relative rounded-2xl p-5 text-left border active:scale-95 hover:-translate-y-1 transition-all min-h-[120px] ${productTextClass} overflow-hidden group`}
                style={{ opacity: activeShift ? 1 : 0.5 }}>
                {item.isPromo && item.promoPrice && (
                  <span className="absolute top-4 right-4 text-[9px] font-black px-2.5 py-1 rounded-full z-10 shadow-lg text-white"
                    style={{ background: ACCENT }}>% OFF</span>
                )}
                {showImages && item.imageUrl && <img src={item.imageUrl} alt="" className="w-full h-28 object-cover rounded-2xl mb-4 opacity-70 group-hover:opacity-100 transition-opacity" />}
                <div className="font-syne text-sm font-bold leading-tight mb-2 text-white/90">{item.name}</div>
                {item.isPromo && item.promoPrice ? (
                  <div className="flex items-baseline gap-2 flex-wrap mt-auto pt-2">
                    <span className="text-xs line-through text-white/40">${item.price}</span>
                    <span className="font-sans text-base font-black" style={{ color: ACCENT }}>${item.promoPrice}</span>
                  </div>
                ) : (
                  <div className="font-sans text-base font-black mt-auto pt-2" style={{ color: ACCENT }}>${item.price}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const ticketCount = ticket.items.reduce((s: number, i: any) => s + i.quantity, 0);

  // Map allowed order types from remoteConfig to the new TicketPanel option shape
  const orderTypeOptions: OrderTypeOption[] = orderTypeTabs.map(({ t }) => {
    const id = t as OrderType;
    const meta =
      id === "DINE_IN"  ? { label: "Mesa",      Icon: Armchair }    :
      id === "TAKEOUT"  ? { label: "Llevar",    Icon: ShoppingBag } :
                          { label: "Domicilio", Icon: Bike };
    return { id, label: meta.label, icon: <meta.Icon size={12} /> };
  });

  // Lines for TicketPanel — index-based id so qty/remove work via index
  const ticketLines = ticket.items.map((it: any, idx: number) => ({
    id: String(idx),
    name: it.name + (it.variantName ? ` (${it.variantName})` : ""),
    quantity: it.quantity,
    price: it.price,
    notes: it.notes || undefined,
  }));

  // Tabs for TicketPanel
  const ticketTabs = tickets.map((t: any, i: number) => ({
    id: String(i),
    name: t.name?.trim() || `T${i + 1}`,
  }));

  // Filtered + mapped products for ProductGrid
  const productsForGrid = filteredItems.map((p: any) => ({
    id: p.id,
    name: p.name,
    price: Number(p.isPromo && p.promoPrice ? p.promoPrice : p.price ?? 0),
    category: categories.find((c: any) => c.id === p.categoryId)?.name,
    imageUrl: showImages ? (p.imageUrl ?? null) : null,
  }));

  const handleProcessLocalPayment = () => {
    if (ticket.items.length === 0) return;
    if (!activeShift) { alert("⚠️ Debes abrir un turno antes de cobrar"); promptShift(); return; }
    openPayment({
      id: `local-${activeTicket}`,
      total,
      items: ticket.items.map((it: any, idx: number) => ({
        id: String(idx),
        name: it.name + (it.variantName ? ` (${it.variantName})` : ""),
        quantity: it.quantity,
        price: it.price,
      })),
      customerName: ticket.name || undefined,
      table: ticket.tableName || null,
    });
  };

  return (
    <>
      <POSShell
        rail={
          <SideRail
            section={railSection}
            onSection={(s) => {
              setRailSection(s);
              if (s === "receipts") setShowOrdersDrawer((v) => !v);
              if (s === "shift") promptShift();
              if (s === "config") openTpvConfig();
            }}
            onLogout={clearEmployeeSession}
          />
        }
        main={
          <div className="flex flex-col h-full p-4 gap-4 overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <CategoryTabs
                  categories={categories.map((c: any) => ({ id: c.id, name: c.name }))}
                  selected={selectedCat}
                  onSelect={setSelectedCat}
                />
              </div>
              <button
                onClick={() => setShowOrdersDrawer((v) => !v)}
                className="h-10 px-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shrink-0"
                style={{
                  background: showOrdersDrawer ? "var(--brand)" : "var(--surface-2)",
                  color: showOrdersDrawer ? "var(--brand-fg)" : "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  letterSpacing: "0.06em",
                }}
              >
                <Bell size={14} /> {orders.length} activos
              </button>
              {!activeShift && (
                <button
                  onClick={promptShift}
                  className="h-10 px-3 rounded-xl text-xs font-bold uppercase tracking-wider shrink-0"
                  style={{
                    background: "var(--danger-soft)",
                    color: "var(--danger)",
                    border: "1px solid var(--danger)",
                    letterSpacing: "0.06em",
                  }}
                >
                  Sin turno
                </button>
              )}
              <KDSMessages />
            </div>
            <div className="flex-1 overflow-hidden">
              <ProductGrid
                products={productsForGrid}
                onPick={(p) => {
                  const item = allItems.find((it: any) => it.id === p.id);
                  if (item) handleItemClick(item);
                }}
                searchValue={search}
                onSearchChange={setSearch}
                cols={(gridCols >= 4 ? 4 : 3) as 3 | 4}
                currency="$"
              />
            </div>
          </div>
        }
        ticket={
          <TicketPanel
            tabs={ticketTabs}
            activeTabId={String(activeTicket)}
            onTabSelect={(id) => setActiveTicket(parseInt(id))}
            onTabAdd={addNewTicket}
            onTabClose={(id) => closeTicket(parseInt(id))}

            customerName={ticket.name}
            customerPhone={ticket.phone}
            onCustomerNameChange={(v) => updateTicket({ name: v })}
            onCustomerPhoneChange={(v) => updateTicket({ phone: v })}

            orderType={ticket.type as OrderType}
            orderTypeOptions={orderTypeOptions}
            onOrderTypeChange={(t) => updateTicket({ type: t })}

            tableLabel={ticket.tableName || null}
            onPickTable={() => setShowTablePicker(true)}
            onClearTable={() => updateTicket({ tableId: "", tableName: "", table: "" })}
            address={ticket.address}
            onAddressChange={(v) => updateTicket({ address: v })}

            lines={ticketLines}
            onLineQty={(id, delta) => changeQty(parseInt(id), delta)}
            onLineRemove={(id) => removeFromTicket(parseInt(id))}

            onSendToKitchen={sendToKitchen}
            onDiscount={() => openDiscount(`local-${activeTicket}`, total)}
            onClear={() => openConfirm({
              title: "Limpiar ticket",
              message: "Se borrarán los productos y los datos del cliente.",
              confirmLabel: "Sí, limpiar",
              tone: "danger",
              onConfirm: () => updateTicket({ items: [], name: "", phone: "", address: "", tableId: "", tableName: "", table: "" }),
            })}

            subtotal={subtotal}
            total={total}
            currency="$"
            onPrimary={handleProcessLocalPayment}
            onSecondaryLeft={() => openConfirm({ title: "Dividir cuenta", message: "Función próximamente.", confirmLabel: "Entendido", onConfirm: () => {} })}
            onSecondaryRight={sendToKitchen}
            primaryLabel="PROCESAR COBRO"
            secondaryLeftLabel="DIVIDIR"
            secondaryRightLabel="PENDIENTE"
          />
        }
      />

      {showOrdersDrawer && (
        <OrdersDrawer
          orders={orders}
          onClose={() => setShowOrdersDrawer(false)}
          onChargeOrder={(o) => openPayment({
            id: o.id,
            total: Number(o.total ?? 0),
            items: (o.items || []).map((it: any) => ({
              id: it.id, name: it.product?.name || it.name,
              quantity: Number(it.quantity ?? 1),
              price: Number(it.price ?? it.product?.price ?? 0),
            })),
            customerName: o.customerName,
            table: o.tableName,
          })}
          onDetail={(o) => openOrderDetail(o.id)}
          onAssignDriver={(o) => openDeliveryAssign({
            id: o.id,
            customerName: o.customerName || "Cliente",
            address: o.deliveryAddress || "",
            total: Number(o.total ?? 0),
          })}
          onChangeType={(o) => openChangeOrderType({
            orderId: o.id,
            currentType: o.orderType as OrderType,
            customerName: o.customerName,
            total: Number(o.total ?? 0),
            address: o.deliveryAddress,
            tableName: o.tableName,
          })}
        />
      )}

      {/* Variants picker (legacy) */}
      {variantModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
          <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-lg font-black" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                  {variantModal.item?.name}
                </h3>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Selecciona una variante</p>
              </div>
              <button onClick={closeProductModals} className="w-9 h-9 rounded-xl"
                style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>✕</button>
            </div>
            <div className="grid gap-2">
              {(variantModal.item?.variants || []).map((variant: any) => (
                <button key={variant.id} onClick={() => chooseVariant(variant)}
                  className="flex items-center justify-between rounded-xl px-4 py-3 text-left transition-all hover:brightness-110"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  <span className="font-bold" style={{ color: "var(--text-primary)" }}>{variant.name}</span>
                  <span className="font-extrabold" style={{ color: "var(--brand)" }}>${Number(variant.price).toFixed(0)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modifiers picker (legacy) */}
      {modifierModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
          <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-lg font-black" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                  {modifierModal.item?.name}
                </h3>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Agrega complementos opcionales</p>
              </div>
              <button onClick={closeProductModals} className="w-9 h-9 rounded-xl"
                style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>✕</button>
            </div>
            <div className="grid gap-2 mb-5">
              {((modifierModal.item?.complements || modifierModal.item?.modifiers || []) as any[]).map((mod: any) => {
                const selected = selectedMods.some((m: any) => m.id === mod.id);
                return (
                  <button key={mod.id} onClick={() => toggleModifier(mod)}
                    className="flex items-center justify-between rounded-xl px-4 py-3 text-left"
                    style={{
                      background: selected ? "var(--brand-soft)" : "var(--surface-2)",
                      border: `1px solid ${selected ? "var(--brand)" : "var(--border)"}`,
                    }}>
                    <span className="font-bold" style={{ color: "var(--text-primary)" }}>{mod.name}</span>
                    <span className="font-extrabold" style={{ color: selected ? "var(--brand)" : "var(--text-muted)" }}>
                      +${Number(mod.price || 0).toFixed(0)}
                    </span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => resolveProductSelection(modifierModal, modifierModal.variant || null, selectedMods)}
              className="w-full h-12 rounded-xl font-black uppercase tracking-wider"
              style={{ background: "var(--brand)", color: "var(--brand-fg)", boxShadow: "var(--shadow-glow)", letterSpacing: "0.08em" }}>
              Agregar producto
            </button>
          </div>
        </div>
      )}

      {/* Modales globales */}
      <ModalStack
        currency="$"
        tpvConfigSettings={{ gridSize: gridCols, gridCols, fontSize, showImages }}
        onTpvConfigUpdate={(s: any) => applyDisplayConfig(s)}
        onShiftChange={refreshShift}
        onDeliveryAssigned={fetchOrders}
        onPaymentPaid={async ({ method, orderId }) => {
          const backendMethod = method === "card" ? "CARD" : method === "mixed" ? "MIXED" : "CASH";
          if (orderId.startsWith("local-")) {
            await chargeTicket(backendMethod);
          } else {
            await chargeExistingOrder(orderId, backendMethod);
          }
        }}
        onChangeOrderType={async (orderId, patch) => {
          try {
            await api.patch(`/api/orders/${orderId}`, {
              orderType: patch.type,
              deliveryAddress: patch.address ?? null,
              tableName: patch.tableName ?? null,
            });
            fetchOrders();
          } catch (err: any) { alert(err.response?.data?.error || "Error al cambiar tipo"); }
        }}
      />

      {showDriversPanel && <DriversPanel open={showDriversPanel} onClose={() => setShowDriversPanel(false)} accent="var(--brand)" />}
      <TablesFloorPlan open={showTablesFloor} mode="manage" onClose={() => setShowTablesFloor(false)} accent="var(--brand)" />
      <TablesFloorPlan
        open={showTablePicker}
        mode="pick"
        onClose={() => setShowTablePicker(false)}
        accent="var(--brand)"
        onPick={(table: any) => {
          updateTicket({ tableId: table.id, tableName: table.name, table: table.name?.replace(/\D/g, "") || "" });
          setShowTablePicker(false);
        }}
      />
    </>
  );

  /* ── LEGACY UI (pre-shell) — preserved as dead code, removable later ── */
  const _legacyUnused = (
    <div className="tpv-shell flex flex-col h-screen overflow-hidden text-[#e1e1e3] font-dm-sans">

      {/* ── HEADER DASHBOARD ── */}
      <header className="glass-panel h-16 flex items-center px-6 border-b border-white/10 bg-[#0a0a0c]/70 backdrop-blur-2xl z-30 flex-shrink-0">
        <div className="flex flex-col min-w-0 mr-4 leading-none">
          <span className="text-lg font-syne font-black tracking-tight truncate" style={{ color: ACCENT }}>{restaurantName}</span>
          {locationName && <span className="text-[10px] font-bold uppercase tracking-widest truncate mt-1 text-white/40">{locationName}</span>}
        </div>
        <div className="flex-1 min-w-0 max-w-xl">
          <div className="relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm opacity-30 group-focus-within:opacity-100 transition-opacity">🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..."
              className="w-full pl-12 pr-4 py-2.5 rounded-2xl text-sm outline-none bg-white/5 border border-white/10 text-white focus:border-[#ff5c35]/50 transition-all" />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
          <button onClick={() => setOrdersDrawerOpen(true)}
            className="relative flex items-center gap-2 px-4 h-10 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
            <span className="text-sm">📋</span>
            <span className="hidden sm:inline">Pedidos</span>
            {orders.length > 0 && (
              <span className="ml-1 text-[10px] font-black rounded-full min-w-[20px] h-[20px] inline-flex items-center justify-center text-white" style={{ background: ACCENT }}>
                {orders.length}
              </span>
            )}
          </button>
          <KDSMessages />
          {isAdmin && (
            <div className="hidden lg:flex items-center gap-2">
              <button onClick={() => setShowDriversPanel(true)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black bg-white/5 hover:bg-white/10 border border-white/10 transition-colors" title="Repartidores">
                D
              </button>
              <button onClick={() => setShowTablesFloor(true)}
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 transition-colors" title="Mesas">
                <span className="table-glyph table-glyph--mini" aria-hidden="true" />
              </button>
            </div>
          )}
          <button onClick={() => promptShift()}
            className={`flex items-center gap-2 px-4 h-10 rounded-xl text-xs font-bold transition-all ${activeShift ? "bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"}`}>
            {activeShift ? "🟢 Turno" : "🔴 Sin turno"}
          </button>
          <div className="hidden sm:flex flex-col items-end leading-none ml-2 border-l border-white/10 pl-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Atendiendo</span>
            <span className="text-sm font-syne font-black text-white">{currentEmployee?.name?.split(" ")[0] || "Cajero"}</span>
          </div>
          {isAdmin && (
            <button onClick={() => openTpvConfig()}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-sm bg-white/5 hover:bg-white/10 border border-white/10 transition-colors ml-2" title="Ajustes">
              ⚙️
            </button>
          )}
          <button onClick={clearEmployeeSession}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-red-400 bg-white/5 hover:bg-red-500/10 border border-white/10 transition-colors" title="Bloquear Caja">
            🔒
          </button>
        </div>
      </header>

      {/* ── LAYOUT PRINCIPAL ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">

        {/* Sidebar Categorías (Desktop) */}
        <aside className="glass-panel hidden lg:flex lg:flex-col lg:w-64 flex-shrink-0 border-r border-white/10 overflow-y-auto scrollbar-hide py-6 px-4 gap-2 bg-[#0a0a0c]/35">
          <div className="px-4 pb-3 text-[10px] font-bold uppercase tracking-widest text-white/30">Categorías</div>
          {[{ id: "all", name: "Todo" }, ...categories].map(cat => (
            <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
              className={`w-full text-left px-5 py-3.5 rounded-2xl text-sm font-syne font-bold transition-all relative overflow-hidden group ${selectedCat === cat.id ? 'text-white bg-white/5' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
              {selectedCat === cat.id && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-full" style={{ background: ACCENT }} />}
              {cat.name}
            </button>
          ))}

          {/* MARCA DE AGUA SIDEBAR */}
          <div className="mt-auto pt-8 border-t border-white/5 opacity-20 select-none">
            <span className="text-[9px] font-black tracking-widest uppercase">Powered by</span>
            <div className="text-sm font-syne font-black tracking-tighter text-white">MRTPVREST</div>
          </div>
        </aside>

        {/* Menú Central */}
        {menuPane}

        {/* Ticket Panel (Desktop) */}
        <aside className="glass-panel hidden md:flex md:flex-col flex-shrink-0 border-l border-white/10 overflow-hidden md:w-[380px] lg:w-[400px] xl:w-[420px] shadow-2xl z-10">
          {ticketPane}
        </aside>

      </div>

      {/* FAB Mobile */}
      <button onClick={() => setTicketDrawerOpen(true)}
        className="md:hidden fixed bottom-6 left-4 right-4 h-16 rounded-[2rem] shadow-2xl flex items-center justify-between px-8 font-syne font-black text-base z-40 select-none active:scale-95 transition-transform text-white"
        style={{ background: ACCENT }}>
        <span className="flex items-center gap-3">
          <span className="text-2xl">🧾</span>
          <span>Ver Orden ({ticketCount})</span>
        </span>
        <span className="text-xl font-sans font-black">${total.toFixed(0)}</span>
      </button>

      {/* Drawers Móviles */}
      {ticketDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col" onClick={() => setTicketDrawerOpen(false)}>
          <div className="flex-1 bg-black/80 backdrop-blur-sm transition-all" />
          <div onClick={(e) => e.stopPropagation()} className="sheet-enter rounded-t-[3rem] shadow-2xl flex flex-col overflow-hidden relative bg-[#0a0a0c] h-[90vh] border-t border-white/10">
            <div className="flex items-center justify-between px-8 pt-6 pb-4 flex-shrink-0 relative border-b border-white/5">
              <div className="w-16 h-1.5 rounded-full absolute left-1/2 -translate-x-1/2 top-3 bg-white/10" />
              <span className="text-sm font-syne font-black uppercase tracking-widest mt-2 text-white">Orden Actual</span>
              <button onClick={() => setTicketDrawerOpen(false)} className="w-10 h-10 mt-1 rounded-full flex items-center justify-center text-lg bg-white/5 text-white/40 hover:text-white transition-colors">✕</button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">{ticketPane}</div>
          </div>
        </div>
      )}

      {ordersDrawerOpen && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setOrdersDrawerOpen(false)}>
          <div className="flex-1 bg-black/80 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg h-full shadow-2xl flex flex-col overflow-hidden bg-[#0a0a0c] border-l border-white/10">
            <div className="flex items-center justify-between px-8 h-20 flex-shrink-0 border-b border-white/5 bg-[#050507]">
              <span className="text-base font-syne font-black uppercase tracking-widest text-white">📋 Gestor de Pedidos</span>
              <button onClick={() => setOrdersDrawerOpen(false)} className="w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-white/5 text-white/40 hover:text-white transition-colors">✕</button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">{ordersPane}</div>
          </div>
        </div>
      )}

      {false && showManagerMenu && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowManagerMenu(false)} />
          <div className="relative w-80 h-full bg-[#0a0a0c] border-l border-white/10 shadow-2xl flex flex-col">
            <div className="p-8 border-b border-white/5 bg-[#050507]">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-2xl font-syne font-black text-white">{currentEmployee?.name}</h2>
                <button onClick={() => setShowManagerMenu(false)} className="text-white/40 hover:text-white text-2xl transition-colors">✕</button>
              </div>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: ACCENT }}>
                {currentEmployee?.role === "OWNER" ? "Propietario" : "Gerente"}
              </p>
            </div>

            {/* OPCIÓN A APLICADA: Configuración Visual centralizada en el modal */}
            <div className="flex-1 overflow-y-auto py-4">
              <button onClick={() => { setShowManagerMenu(false); promptShift(); }} className="w-full flex items-center gap-4 px-8 py-5 hover:bg-white/5 transition-colors text-left border-b border-white/5 group">
                <span className="text-2xl group-hover:scale-110 transition-transform">🕒</span>
                <div>
                  <div className="font-bold text-sm text-white">Turno de Caja</div>
                  <div className="text-xs mt-1" style={{ color: activeShift ? "#22c55e" : "#ef4444" }}>{activeShift ? "🟢 Turno abierto" : "🔴 Sin turno"}</div>
                </div>
              </button>
              <button onClick={() => { setShowManagerMenu(false); openTpvConfig(); }} className="w-full flex items-center gap-4 px-8 py-5 hover:bg-white/5 transition-colors text-left border-b border-white/5 group">
                <span className="text-2xl group-hover:scale-110 transition-transform">🖨️</span>
                <div>
                  <div className="font-bold text-sm text-white">Configuración TPV</div>
                  <div className="text-xs text-white/40 mt-1">Apariencia, impresoras, display</div>
                </div>
              </button>
              <button onClick={() => { setShowManagerMenu(false); setShowDriversPanel(true); }} className="w-full flex items-center gap-4 px-8 py-5 hover:bg-white/5 transition-colors text-left border-b border-white/5 group">
                <span className="text-2xl group-hover:scale-110 transition-transform">🚴</span>
                <div>
                  <div className="font-bold text-sm text-white">Repartidores activos</div>
                  <div className="text-xs text-white/40 mt-1">Rutas y distancias</div>
                </div>
              </button>
              <button onClick={() => { setShowManagerMenu(false); setShowTablesFloor(true); }} className="w-full flex items-center gap-4 px-8 py-5 hover:bg-white/5 transition-colors text-left border-b border-white/5 group">
                <span className="text-2xl group-hover:scale-110 transition-transform">🪑</span>
                <div>
                  <div className="font-bold text-sm text-white">Mesas (planímetro)</div>
                  <div className="text-xs text-white/40 mt-1">Layout y estados</div>
                </div>
              </button>
              <button onClick={() => router.push("/setup")} className="w-full flex items-center gap-4 px-8 py-5 hover:bg-white/5 transition-colors text-left border-b border-white/5 group">
                <span className="text-2xl group-hover:scale-110 transition-transform">🔧</span>
                <div>
                  <div className="font-bold text-sm text-white">Re-configurar</div>
                  <div className="text-xs text-white/40 mt-1">Cambiar de sucursal</div>
                </div>
              </button>
            </div>
            <div className="p-6 bg-[#050507] border-t border-white/5">
              <button onClick={clearEmployeeSession} className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors">
                🔒 Bloquear sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {variantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md rounded-3xl border border-white/10 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="font-syne font-black text-xl text-white">{variantModal.item?.name}</h3>
                <p className="text-xs text-white/40 mt-1">Selecciona una variante</p>
              </div>
              <button onClick={closeProductModals} className="w-9 h-9 rounded-xl bg-white/5 text-white/50 hover:text-white">x</button>
            </div>
            <div className="grid gap-3">
              {(variantModal.item?.variants || []).map((variant: any) => (
                <button key={variant.id} onClick={() => chooseVariant(variant)}
                  className="glass-button flex items-center justify-between rounded-2xl px-4 py-4 text-left">
                  <span className="font-bold text-white">{variant.name}</span>
                  <span className="font-black" style={{ color: ACCENT }}>${Number(variant.price).toFixed(0)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {modifierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md rounded-3xl border border-white/10 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="font-syne font-black text-xl text-white">{modifierModal.item?.name}</h3>
                <p className="text-xs text-white/40 mt-1">Agrega complementos opcionales</p>
              </div>
              <button onClick={closeProductModals} className="w-9 h-9 rounded-xl bg-white/5 text-white/50 hover:text-white">x</button>
            </div>
            <div className="grid gap-3 mb-5">
              {((modifierModal.item?.complements || modifierModal.item?.modifiers || []) as any[]).map((mod: any) => {
                const selected = selectedMods.some((m: any) => m.id === mod.id);
                return (
                  <button key={mod.id} onClick={() => toggleModifier(mod)}
                    className="glass-button flex items-center justify-between rounded-2xl px-4 py-4 text-left"
                    style={{ borderColor: selected ? ACCENT : undefined }}>
                    <span className="font-bold text-white">{mod.name}</span>
                    <span className="font-black" style={{ color: selected ? ACCENT : "rgba(255,255,255,0.5)" }}>
                      +${Number(mod.price || 0).toFixed(0)}
                    </span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => resolveProductSelection(modifierModal, modifierModal.variant || null, selectedMods)}
              className="w-full min-h-[52px] rounded-2xl font-syne font-black text-white shadow-xl"
              style={{ background: ACCENT }}>
              Agregar producto
            </button>
          </div>
        </div>
      )}

      {/* Modales globales (shift, tpv config, shortage, delivery assign, payment, etc.) */}
      <ModalStack
        currency="$"
        tpvConfigSettings={{ gridSize: gridCols, gridCols, fontSize, showImages }}
        onTpvConfigUpdate={(s: any) => applyDisplayConfig(s)}
        onShiftChange={refreshShift}
        onDeliveryAssigned={fetchOrders}
        onPaymentPaid={async ({ method, orderId }) => {
          const backendMethod = method === "card" ? "CARD" : method === "mixed" ? "MIXED" : "CASH";
          await chargeExistingOrder(orderId, backendMethod);
        }}
      />

      {showDriversPanel && <DriversPanel open={showDriversPanel} onClose={() => setShowDriversPanel(false)} accent={ACCENT} />}
      <TablesFloorPlan open={showTablesFloor} mode="manage" onClose={() => setShowTablesFloor(false)} accent={ACCENT} />
      <TablesFloorPlan
        open={showTablePicker}
        mode="pick"
        onClose={() => setShowTablePicker(false)}
        accent={ACCENT}
        onPick={(table: any) => {
          updateTicket({ tableId: table.id, tableName: table.name, table: table.name?.replace(/\D/g, "") || "" });
          setShowTablePicker(false);
        }}
      />

    </div>
  );
}

// ── ORDERS DRAWER ────────────────────────────────────────────────────────────

const ORDER_TYPE_META: Record<string, { label: string; Icon: typeof Armchair }> = {
  DINE_IN:  { label: "Mesa",      Icon: Armchair },
  TAKEOUT:  { label: "Llevar",    Icon: ShoppingBag },
  DELIVERY: { label: "Domicilio", Icon: Bike },
};

function OrdersDrawer({
  orders, onClose, onChargeOrder, onDetail, onAssignDriver, onChangeType,
}: {
  orders: any[];
  onClose: () => void;
  onChargeOrder: (o: any) => void;
  onDetail: (o: any) => void;
  onAssignDriver: (o: any) => void;
  onChangeType: (o: any) => void;
}) {
  return (
    <div className="fixed inset-0 z-[150] flex" onClick={onClose}>
      <div className="flex-1" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full overflow-y-auto scrollbar-hide flex flex-col"
        style={{
          background: "var(--surface-1)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <header
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Activas
            </p>
            <h2
              className="text-lg font-extrabold"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
            >
              Pedidos · {orders.length}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <ul className="flex-1 flex flex-col gap-2 p-4">
          {orders.length === 0 && (
            <li className="text-sm text-center py-12" style={{ color: "var(--text-muted)" }}>
              No hay pedidos activos
            </li>
          )}
          {orders.map((o) => {
            const type = String(o.orderType || "TAKEOUT");
            const meta = ORDER_TYPE_META[type] ?? ORDER_TYPE_META.TAKEOUT!;
            const Icon = meta.Icon;
            return (
              <li
                key={o.id}
                className="rounded-2xl p-4 flex flex-col gap-3"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                      {o.customerName || `Orden ${(o.orderNumber || o.id).slice(0, 6)}`}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest"
                        style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                      >
                        <Icon size={10} /> {meta.label}
                      </span>
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {o.status}
                      </span>
                    </div>
                  </div>
                  <span
                    className="text-base font-extrabold"
                    style={{ color: "var(--brand)", fontFamily: "var(--font-display)" }}
                  >
                    ${Number(o.total ?? 0).toFixed(2)}
                  </span>
                </div>

                {type === "DELIVERY" && (
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {o.deliveryAddress || "Sin dirección"}
                    {o.driver?.name && (
                      <>
                        {" · "}<span style={{ color: "var(--brand)" }}>Repartidor: {o.driver.name}</span>
                      </>
                    )}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  <DrawerAction Icon={RefreshCcw} label="Cambiar tipo" onClick={() => onChangeType(o)} />
                  {type === "DELIVERY" && (
                    <DrawerAction Icon={Truck} label={o.driver?.name ? "Reasignar" : "Asignar repartidor"} onClick={() => onAssignDriver(o)} tone="brand" />
                  )}
                  <DrawerAction Icon={ChevronRight} label="Detalle" onClick={() => onDetail(o)} />
                  <DrawerAction Icon={ShoppingBag} label="Cobrar" onClick={() => onChargeOrder(o)} tone="brand" />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function DrawerAction({
  Icon, label, onClick, tone,
}: {
  Icon: typeof RefreshCcw;
  label: string;
  onClick: () => void;
  tone?: "brand";
}) {
  const isBrand = tone === "brand";
  return (
    <button
      onClick={onClick}
      className="h-9 rounded-lg flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-all hover:brightness-110"
      style={{
        background: isBrand ? "var(--brand-soft)" : "var(--surface-3)",
        color: isBrand ? "var(--brand)" : "var(--text-secondary)",
        border: `1px solid ${isBrand ? "var(--brand)" : "var(--border)"}`,
        letterSpacing: "0.06em",
      }}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

// ── PANTALLA DE BLOQUEO ──────────────────────────────────────────────────────

function TPVLockScreen({
  restaurantName,
  locationName,
  pinInput,
  pinError,
  isVerifyingPin,
  onDigit,
  onBackspace,
  onClear,
  onSubmit,
  onChangeLocation,
}: any) {
  return (
    <div
      className="fixed inset-0 overflow-auto select-none"
      style={{ background: "var(--bg)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
    >
      {/* Top-right: settings */}
      <button
        onClick={onChangeLocation}
        className="absolute top-4 right-4 z-20 w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
        }}
        aria-label="Cambiar configuración"
      >
        <Settings size={16} />
      </button>

      {/* Top-left: palette + theme controls */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <PaletteSwitcher size="sm" />
        <ThemeToggle size="sm" />
      </div>

      <div className="min-h-full flex items-center justify-center p-6">
        <div className="w-full" style={{ maxWidth: "26rem" }}>
          {/* Wordmark — matches /setup */}
          <div className="text-center mb-6">
            <h1
              className="font-black tracking-tighter"
              style={{
                color: "var(--brand)",
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2rem, 8vw, 2.5rem)",
                lineHeight: 1,
              }}
            >
              MRTPVREST
            </h1>
            <p
              className="mt-1.5 font-bold uppercase"
              style={{
                color: "var(--text-muted)",
                letterSpacing: "0.18em",
                fontSize: "0.625rem",
              }}
            >
              Punto de Venta
            </p>
          </div>

          {/* Card */}
          <div
            className="rounded-3xl flex flex-col gap-6"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-lg)",
              padding: "clamp(1.25rem, 4vw, 1.75rem)",
            }}
          >
            {/* Tenant context */}
            <div className="text-center flex flex-col gap-1">
              <span
                className="font-bold truncate"
                style={{
                  color: "var(--text-primary)",
                  fontSize: "clamp(1rem, 4vw, 1.125rem)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {restaurantName}
              </span>
              <span
                className="font-bold uppercase"
                style={{
                  color: "var(--text-muted)",
                  letterSpacing: "0.16em",
                  fontSize: "0.625rem",
                }}
              >
                {locationName || "Terminal"} · Ingresa tu PIN
              </span>
            </div>

            {/* PIN dots */}
            <div
              className="flex items-center justify-center"
              style={{ gap: "clamp(0.65rem, 2.4vw, 1rem)" }}
            >
              {Array.from({ length: 6 }).map((_, i) => {
                const filled = pinInput.length > i;
                return (
                  <div
                    key={i}
                    className="rounded-full transition-all duration-200"
                    style={{
                      width: "clamp(0.85rem, 2.6vw, 1.1rem)",
                      height: "clamp(0.85rem, 2.6vw, 1.1rem)",
                      background: filled ? "var(--brand)" : "var(--surface-3)",
                      boxShadow: filled ? "var(--shadow-glow)" : "none",
                      transform: filled ? "scale(1.1)" : "scale(1)",
                    }}
                  />
                );
              })}
            </div>

            {/* Error */}
            {pinError && (
              <p
                className="text-center text-sm font-bold"
                style={{ color: "var(--danger)" }}
                role="alert"
              >
                {pinError}
              </p>
            )}

            {/* Keypad */}
            <div
              className="grid grid-cols-3"
              style={{ gap: "clamp(0.6rem, 2vw, 0.9rem)" }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <KeypadButton
                  key={num}
                  onClick={() => onDigit(String(num))}
                  disabled={isVerifyingPin}
                >
                  {num}
                </KeypadButton>
              ))}
              <KeypadButton onClick={onClear} variant="danger" ariaLabel="Limpiar">
                C
              </KeypadButton>
              <KeypadButton onClick={() => onDigit("0")} disabled={isVerifyingPin}>
                0
              </KeypadButton>
              <KeypadButton onClick={onBackspace} variant="ghost" ariaLabel="Borrar">
                <Delete size={22} />
              </KeypadButton>
            </div>

            {/* Submit */}
            <button
              disabled={isVerifyingPin || pinInput.length < 4}
              onClick={onSubmit}
              className="w-full rounded-2xl font-black uppercase transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "var(--brand)",
                color: "var(--brand-fg)",
                fontFamily: "var(--font-display)",
                boxShadow: "var(--shadow-glow)",
                letterSpacing: "0.12em",
                padding: "1rem",
                fontSize: "0.875rem",
                border: "none",
              }}
            >
              {isVerifyingPin ? "Verificando..." : "Ingresar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KeypadButton({
  children,
  onClick,
  disabled,
  variant,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "danger" | "ghost";
  ariaLabel?: string;
}) {
  const isDanger = variant === "danger";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="aspect-square rounded-2xl font-black flex items-center justify-center transition-all hover:brightness-110 active:scale-95 disabled:opacity-40"
      style={{
        background: isDanger ? "var(--danger-soft)" : "var(--surface-2)",
        border: `1px solid ${isDanger ? "var(--danger)" : "var(--border)"}`,
        color: isDanger ? "var(--danger)" : "var(--text-primary)",
        fontFamily: "var(--font-display)",
        fontSize: "clamp(1.5rem, 4.5vw, 2rem)",
      }}
    >
      {children}
    </button>
  );
}
