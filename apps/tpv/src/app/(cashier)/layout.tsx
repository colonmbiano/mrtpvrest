"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Search, Menu, Receipt, ShoppingCart, UtensilsCrossed } from "lucide-react";
import Button from "@/components/ui/Button";
import ConfigMenu from "@/components/pos/ConfigMenu";
import LockScreen from "@/components/pos/LockScreen";
import OrdersDrawer from "@/components/pos/OrdersDrawer";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";
import api from "@/lib/api";

import SidebarTicket from "@/components/pos/SidebarTicket";
import { useThemeStore } from "@/store/themeStore";
import { useAuthStore } from "@/store/authStore";

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
        onSelectOrder={(o) => console.log("Select:", o)}
        onConfirmPayment={(o) => console.log("Pay:", o)}
      />

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
              <span className="text-[10px] text-iris-500 font-black uppercase tracking-widest">
                {currentEmployee?.role || "TURNO ACTIVO"}
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
