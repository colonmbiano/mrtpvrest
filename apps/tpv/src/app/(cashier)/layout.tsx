"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Search, Menu, Receipt, ShoppingCart, UtensilsCrossed, Utensils, ShoppingBag, Bike, ListChecks } from "lucide-react";
import Button from "@/components/ui/Button";
import ConfigMenu from "@/components/pos/ConfigMenu";
import LockScreen from "@/components/pos/LockScreen";
import OrdersDrawer from "@/components/pos/OrdersDrawer";
import PaymentModal from "@/components/pos/PaymentModal";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";
import api from "@/lib/api";

import SidebarTicket from "@/components/pos/SidebarTicket";
import { useThemeStore } from "@/store/themeStore";

const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN: "MESA",
  TAKEOUT: "LLEVAR",
  DELIVERY: "DOMICILIO",
};

const ACTIVE_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OPEN",
  "OUT_FOR_DELIVERY",
]);

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [mobileView, setMobileView] = useState<"menu" | "ticket">("menu");

  const { palette, mode, setPalette, toggleMode } = useThemeStore();
  const activeTicket = useTicketStore((s) => s.getActiveTicket());
  const itemCount = activeTicket.items.reduce((acc, i) => acc + i.quantity, 0);

  const [openOrders, setOpenOrders] = useState<any[]>([]);
  const [payOrder, setPayOrder] = useState<any | null>(null);
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const prevLockedRef = useRef<boolean | null>(null);

  const {
    isLocked,
    restaurantName,
    locationName,
    isVerifying,
    currentEmployee,
    loginWithPin,
    logout,
  } = useTPVAuth();

  const fetchOpenOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/api/orders/admin");
      const list = Array.isArray(data) ? data : [];
      setOpenOrders(list.filter((o: any) => ACTIVE_STATUSES.has(o.status)));
    } catch (err) {
      console.error("Error cargando órdenes abiertas:", err);
    }
  }, []);

  useEffect(() => {
    if (isLocked) return;
    fetchOpenOrders();
    const id = setInterval(fetchOpenOrders, 30000);
    return () => clearInterval(id);
  }, [isLocked, fetchOpenOrders]);

  const fetchShift = useCallback(async () => {
    try {
      const { data } = await api.get("/api/shifts/active");
      setShiftOpen(Boolean(data?.isOpen ?? data?.id));
    } catch {
      setShiftOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isLocked) return;
    fetchShift();
    const id = setInterval(fetchShift, 60000);
    return () => clearInterval(id);
  }, [isLocked, fetchShift]);

  const handleConfirmDrawerPayment = async (method: string) => {
    if (!payOrder) return;
    try {
      await api.put(`/api/orders/${payOrder.id}/payment`, { paymentMethod: method });
      toast.success("Cobro procesado");
      setPayOrder(null);
      fetchOpenOrders();
    } catch (err: any) {
      toast.error("Error al cobrar: " + (err?.response?.data?.error || err?.message || ""));
    }
  };

  const handleSelectOrder = async (o: any) => {
    try {
      const { data } = await api.get(`/api/orders/${o.id}`);
      setPayOrder(data);
    } catch {
      setPayOrder(o);
    }
  };

  useEffect(() => {
    if (prevLockedRef.current === true && !isLocked) {
      setShowStartPicker(true);
    }
    prevLockedRef.current = isLocked;
  }, [isLocked]);

  const handlePickType = (type: "DINE_IN" | "TAKEOUT" | "DELIVERY") => {
    useTicketStore.getState().updateTicket({ type });
    setShowStartPicker(false);
  };

  const handlePickOpenTickets = () => {
    setShowStartPicker(false);
    setShowOrders(true);
  };

  useEffect(() => {
    if (showOrders) fetchOpenOrders();
  }, [showOrders, fetchOpenOrders]);

  const drawerOrders = openOrders.map((o: any) => ({
    id: o.id,
    orderNumber: o.orderNumber || `#${String(o.id).slice(-6).toUpperCase()}`,
    customerName: o.customerName || o.user?.name || "Público general",
    type: ORDER_TYPE_LABEL[o.orderType] || o.orderType || "ORDEN",
    status: o.status,
    total: Number(o.total ?? 0),
    time: timeAgo(o.createdAt),
    itemsCount: Array.isArray(o.items) ? o.items.length : 0,
    needsDriver: o.orderType === "DELIVERY" && !o.deliveryDriverId,
  }));

  // VALIDACIÓN DE ROL: Solo CASHIER, OWNER, ADMIN, MANAGER pueden acceder a /(cashier)
  useEffect(() => {
    if (currentEmployee && !isLocked) {
      const allowedRoles = ["CASHIER", "OWNER", "ADMIN", "MANAGER"];
      if (!allowedRoles.includes(currentEmployee.role)) {
        console.warn(
          `[SECURITY] Acceso denegado a /(cashier): rol ${currentEmployee.role} no autorizado`
        );
        router.replace("/");
      }
    }
  }, [currentEmployee, isLocked, router]);

  const handlePinDigit = (digit: string) => {
    if (pinInput.length < 6) setPinInput(prev => prev + digit);
  };

  const handlePinSubmit = async () => {
    try {
      await loginWithPin(pinInput);
      setPinInput("");
    } catch {
      setPinInput("");
    }
  };

  if (isLocked) {
    return (
      <LockScreen
        restaurantName={restaurantName}
        locationName={locationName}
        pinInput={pinInput}
        onDigit={handlePinDigit}
        onBackspace={() => setPinInput(prev => prev.slice(0, -1))}
        onClear={() => setPinInput("")}
        onSubmit={handlePinSubmit}
        onChangeLocation={() => router.push("/setup")}
        isVerifying={isVerifying}
      />
    );
  }

  return (
    <div className="flex h-screen w-full bg-surf-0 overflow-hidden font-sans text-tx-pri">
      {/* SIDE RAIL (Linear Style) */}
      <aside className="hidden lg:flex w-16 bg-surf-1 border-r border-bd flex-col items-center py-6 gap-8 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-iris-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-iris-glow mb-4">
          M
        </div>
        
        <button className="text-iris-500 hover:text-tx-pri transition-colors">
          <Menu size={20} />
        </button>
        
        <button 
          onClick={() => setShowOrders(true)}
          className="text-tx-mut hover:text-tx-pri transition-colors relative"
        >
          <Receipt size={20} />
          {openOrders.length > 0 && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-iris-500" />
          )}
        </button>

        <div className="flex-1" />

        <button 
          onClick={() => setShowMenu(true)}
          className="text-tx-mut hover:text-tx-pri transition-colors"
        >
          <UtensilsCrossed size={20} />
        </button>
      </aside>

      <ConfigMenu
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        onLogout={logout}
        currentTheme={palette}
        onThemeChange={setPalette}
        isDark={mode === "dark"}
        onToggleMode={toggleMode}
      />

      <OrdersDrawer
        isOpen={showOrders}
        onClose={() => setShowOrders(false)}
        orders={drawerOrders}
        onSelectOrder={handleSelectOrder}
        onConfirmPayment={handleSelectOrder}
      />

      {showStartPicker && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setShowStartPicker(false)} />
          <div className="relative w-full max-w-2xl bg-surf-1 border border-bd rounded-3xl shadow-2xl p-8 sm:p-10 animate-in zoom-in-95 duration-200">
            <div className="space-y-2 mb-8">
              <span className="eyebrow">¡HOLA, {(currentEmployee?.name || "").toUpperCase().split(" ")[0]}!</span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">¿Qué vas a hacer?</h2>
              <p className="text-sm text-tx-sec">Elige el tipo de pedido o continúa con un ticket abierto.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              {[
                { id: "DINE_IN", label: "Mesa", desc: "Cuenta abierta", Icon: Utensils },
                { id: "TAKEOUT", label: "Llevar", desc: "Para retirar", Icon: ShoppingBag },
                { id: "DELIVERY", label: "Domicilio", desc: "A domicilio", Icon: Bike },
              ].map(({ id, label, desc, Icon }) => (
                <button
                  key={id}
                  onClick={() => handlePickType(id as "DINE_IN" | "TAKEOUT" | "DELIVERY")}
                  className="group h-32 sm:h-36 rounded-2xl bg-surf-2 hover:bg-iris-soft hover:border-iris-500 border border-bd flex flex-col items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Icon size={28} className="text-tx-sec group-hover:text-iris-500 transition-colors" />
                  <span className="text-base font-black uppercase tracking-widest">{label}</span>
                  <span className="text-[10px] font-bold text-tx-dis uppercase tracking-wider">{desc}</span>
                </button>
              ))}
            </div>

            <button
              onClick={handlePickOpenTickets}
              className="w-full h-14 rounded-2xl bg-surf-2 hover:bg-surf-3 border border-bd flex items-center justify-center gap-3 transition-pos"
            >
              <ListChecks size={18} className="text-iris-500" />
              <span className="text-xs font-black uppercase tracking-widest">
                Tickets abiertos {openOrders.length > 0 && `(${openOrders.length})`}
              </span>
            </button>

            <button
              onClick={() => setShowStartPicker(false)}
              className="w-full mt-4 h-9 text-[11px] font-black uppercase tracking-widest text-tx-dis hover:text-tx-mut transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {payOrder && (
        <PaymentModal
          isOpen={!!payOrder}
          onClose={() => setPayOrder(null)}
          orderNumber={payOrder.orderNumber || String(payOrder.id).slice(-6).toUpperCase()}
          tableName={payOrder.table?.name || payOrder.tableNumber || undefined}
          total={Number(payOrder.total ?? 0)}
          items={(payOrder.items || []).map((i: any) => ({
            name: i.name || i.menuItem?.name || "Producto",
            quantity: i.quantity ?? 1,
            subtotal: Number(i.subtotal ?? 0),
          }))}
          onConfirm={handleConfirmDrawerPayment}
        />
      )}

      {/* MAIN CONTENT AREA */}
      <div className={`flex-1 flex flex-col min-w-0 ${mobileView === "menu" ? "flex" : "hidden"} lg:flex`}>
        {/* TOP HEADER (Linear Style) */}
        <header className="h-14 sm:h-16 border-b border-bd bg-surf-0 flex items-center px-4 sm:px-6 gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-[13px] font-black tracking-widest uppercase truncate max-w-[150px]">
              {restaurantName || "MRTPVREST"}
            </h1>
            <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-surf-2 border border-bd text-[10px] font-bold text-tx-mut">
              {locationName?.toUpperCase() || "SUCURSAL"}
            </span>
          </div>

          <div className="hidden md:flex flex-1 max-w-md mx-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-mut" size={14} />
            <input
              placeholder="Buscar platillo o categoría..."
              className="w-full h-9 bg-surf-1/50 border border-bd rounded-md pl-9 pr-4 text-[13px] focus:outline-none focus:border-iris-500 transition-all placeholder:text-tx-disabled"
            />
          </div>

          <div className="flex-1 md:hidden" />

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-[12px] font-bold tracking-tight">
                {currentEmployee?.name || "Sin sesión"}
              </span>
              <span
                className={`text-[10px] font-black uppercase tracking-widest ${
                  shiftOpen === false ? "text-danger" : "text-iris-500"
                }`}
              >
                {shiftOpen === false ? "TURNO CERRADO" : shiftOpen ? "TURNO ACTIVO" : (currentEmployee?.role || "—")}
              </span>
            </div>
            
            <div className="w-8 h-8 rounded-full bg-surf-2 border border-bd flex items-center justify-center text-[10px] font-black text-tx-mut">
              {currentEmployee?.name?.charAt(0).toUpperCase() || "E"}
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>

      <div className={`${mobileView === "ticket" ? "flex" : "hidden"} lg:flex w-full lg:w-auto`}>
        <SidebarTicket />
      </div>

      {/* MOBILE FAB: TOGGLE MENU/TICKET */}
      <button
        onClick={() => setMobileView(mobileView === "menu" ? "ticket" : "menu")}
        className="lg:hidden fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full bg-iris-500 text-white shadow-2xl shadow-iris-glow flex items-center justify-center active:scale-95 transition-pos"
        aria-label={mobileView === "menu" ? "Ver ticket" : "Ver menú"}
      >
        {mobileView === "menu" ? (
          <div className="relative">
            <ShoppingCart size={22} />
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-success text-surf-0 text-[10px] font-black flex items-center justify-center mono">
                {itemCount}
              </span>
            )}
          </div>
        ) : (
          <UtensilsCrossed size={22} />
        )}
      </button>
    </div>
  );
}
