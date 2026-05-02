"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Search, Menu, Receipt, ShoppingCart, UtensilsCrossed } from "lucide-react";
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
      <div className={`flex-1 flex-col min-w-0 ${mobileView === "menu" ? "flex" : "hidden"} lg:flex`}>
        {/* TOP HEADER */}
        <header className="h-14 sm:h-16 border-b border-bd bg-surf-1 flex items-center px-3 sm:px-4 lg:px-6 gap-2 sm:gap-3 lg:gap-4 shrink-0">
          <Button
            variant="ghost"
            size="md"
            className="w-10 px-0 shrink-0"
            onClick={() => setShowMenu(true)}
          >
            <Menu size={20} />
          </Button>

          <div className="flex flex-col min-w-0">
            <span className="text-[12px] sm:text-[14px] font-black tracking-tighter leading-none truncate">
              {restaurantName?.toUpperCase() || "MRTPVREST"}
            </span>
            <span className="eyebrow mt-0.5 truncate">{locationName?.toUpperCase() || "SUCURSAL"}</span>
          </div>

          <div className="hidden md:flex flex-1 max-w-md mx-auto relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-mut group-focus-within:text-iris-500 transition-colors" size={16} />
            <input
              placeholder="Buscar platillo o categoría..."
              className="w-full h-10 bg-surf-2 border border-bd rounded-md pl-10 pr-4 text-[13px] focus:outline-none focus:border-iris-500 transition-pos"
            />
          </div>

          <div className="flex-1 md:hidden" />

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Button
              variant="ghost"
              size="md"
              className="w-10 px-0 md:hidden"
              aria-label="Buscar"
            >
              <Search size={18} />
            </Button>

            <button
              onClick={() => setShowOrders(true)}
              className="relative h-10 px-3 sm:px-4 rounded-md bg-surf-2 hover:bg-surf-3 border border-bd flex items-center gap-2 text-tx-pri transition-pos"
              aria-label="Ver órdenes abiertas"
            >
              <Receipt size={16} className="text-iris-500" />
              <span className="hidden sm:inline text-[11px] font-black uppercase tracking-widest">
                Órdenes
              </span>
              {openOrders.length > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-iris-500 text-white text-[10px] font-black flex items-center justify-center mono tnum">
                  {openOrders.length}
                </span>
              )}
            </button>

            <div className="hidden lg:block h-8 w-[1px] bg-bd mx-1" />

            <div className="hidden lg:flex flex-col items-end">
              <span className="text-[12px] font-bold uppercase tracking-tight">
                {currentEmployee?.name || "Sin sesión"}
              </span>
              <span
                className={`text-[10px] font-black uppercase tracking-widest ${
                  shiftOpen === false ? "text-danger" : "text-success"
                }`}
              >
                {shiftOpen === false ? "TURNO CERRADO" : shiftOpen ? "TURNO ACTIVO" : (currentEmployee?.role || "—")}
              </span>
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
