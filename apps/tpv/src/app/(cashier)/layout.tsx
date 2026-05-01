"use client";
import React, { useState } from "react";
import { Search, Menu, Bell, ShoppingCart } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import ConfigMenu from "@/components/pos/ConfigMenu";
import LockScreen from "@/components/pos/LockScreen";
import OrdersDrawer from "@/components/pos/OrdersDrawer";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useRouter } from "next/navigation";

import SidebarTicket from "@/components/pos/SidebarTicket";
import { useThemeStore } from "@/store/themeStore";
import { useAuthStore } from "@/store/authStore";

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [pinInput, setPinInput] = useState("");

  const { palette, mode, setPalette, toggleMode } = useThemeStore();

  const { 
    isLocked, 
    restaurantName, 
    locationName, 
    isVerifying, 
    loginWithPin,
    logout,
  } = useTPVAuth();

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
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER */}
        <header className="h-16 border-b border-bd bg-surf-1 flex items-center px-6 gap-4 shrink-0">
          <Button 
            variant="ghost" 
            size="md" 
            className="w-10 px-0" 
            onClick={() => setShowMenu(true)}
          >
            <Menu size={20} />
          </Button>
          
          <div className="flex flex-col">
            <span className="text-[14px] font-black tracking-tighter leading-none">
              {restaurantName?.toUpperCase() || "MRTPVREST"}
            </span>
            <span className="eyebrow mt-0.5">{locationName?.toUpperCase() || "SUCURSAL"}</span>
          </div>

          <div className="flex-1 max-w-md mx-auto relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-mut group-focus-within:text-iris-500 transition-colors" size={16} />
            <input 
              placeholder="Buscar platillo o categoría..." 
              className="w-full h-10 bg-surf-2 border border-bd rounded-md pl-10 pr-4 text-[13px] focus:outline-none focus:border-iris-500 transition-pos"
            />
          </div>

          <div className="flex items-center gap-3">
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
            
            <div className="h-8 w-[1px] bg-bd mx-1" />
            
            <div className="flex flex-col items-end">
              <span className="text-[12px] font-bold uppercase tracking-tight">
                {useAuthStore.getState().employee?.name || "Sin sesión"}
              </span>
              <span className="text-[10px] text-success font-black uppercase tracking-widest">
                {useAuthStore.getState().employee?.role || "Desconocido"}
              </span>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>

      <SidebarTicket />
    </div>
  );
}
