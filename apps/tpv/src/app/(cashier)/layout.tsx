"use client";
import React, { useState, useEffect } from "react";
import { Search, Menu, Bell, ShoppingCart, UtensilsCrossed } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import ConfigMenu from "@/components/pos/ConfigMenu";
import LockScreen from "@/components/pos/LockScreen";
import OrdersDrawer from "@/components/pos/OrdersDrawer";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";

import SidebarTicket from "@/components/pos/SidebarTicket";
import { useThemeStore } from "@/store/themeStore";

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [mobileView, setMobileView] = useState<"menu" | "ticket">("menu");

  const { palette, mode, setPalette, toggleMode } = useThemeStore();
  const activeTicket = useTicketStore((s) => s.getActiveTicket());
  const itemCount = activeTicket.items.reduce((acc, i) => acc + i.quantity, 0);

  const {
    isLocked,
    restaurantName,
    locationName,
    isVerifying,
    currentEmployee,
    loginWithPin,
    logout,
  } = useTPVAuth();

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
        orders={[]} // Connect to real orders if needed
        onSelectOrder={(o) => console.log("Select:", o)}
        onConfirmPayment={(o) => console.log("Pay:", o)}
      />

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

            <Badge count={0} variant="brand">
              <Button
                variant="soft"
                size="md"
                className="w-10 px-0"
                onClick={() => setShowOrders(true)}
              >
                <Bell size={18} />
              </Button>
            </Badge>

            <div className="hidden lg:block h-8 w-[1px] bg-bd mx-1" />

            <div className="hidden lg:flex flex-col items-end">
              <span className="text-[12px] font-bold uppercase tracking-tight">CAJERO</span>
              <span className="text-[10px] text-success font-black uppercase tracking-widest">TURNO ACTIVO</span>
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
