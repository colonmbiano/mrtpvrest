"use client";
import React, { useState } from "react";
import { Search, Menu, Bell, ShoppingCart } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ConfigMenu from "@/components/pos/ConfigMenu";
import LockScreen from "@/components/pos/LockScreen";
import OrdersDrawer from "@/components/pos/OrdersDrawer";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useTicketStore } from "@/store/ticketStore";
import { useRouter } from "next/navigation";

import SidebarTicket from "@/components/pos/SidebarTicket";
import { useThemeStore } from "@/store/themeStore";

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [pinInput, setPinInput] = useState("");

  // Conteo del ticket activo para el badge del FAB de carrito en móvil.
  const cartCount = useTicketStore((s) => {
    const t = s.tickets[s.activeIndex];
    return t?.items.reduce((acc, it) => acc + it.quantity, 0) ?? 0;
  });

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
        orders={[]}
        onSelectOrder={(o) => console.log("Select:", o)}
        onConfirmPayment={(o) => console.log("Pay:", o)}
      />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER — search en md+, brand reducido en mobile */}
        <header className="h-14 sm:h-16 border-b border-bd bg-surf-1 flex items-center px-3 sm:px-6 gap-2 sm:gap-4 shrink-0">
          <Button
            variant="ghost"
            size="md"
            className="w-10 px-0 shrink-0"
            onClick={() => setShowMenu(true)}
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </Button>

          <div className="flex flex-col min-w-0">
            <span className="text-[12px] sm:text-[14px] font-black tracking-tighter leading-none truncate">
              {restaurantName?.toUpperCase() || "MRTPVREST"}
            </span>
            <span className="eyebrow mt-0.5 truncate">{locationName?.toUpperCase() || "SUCURSAL"}</span>
          </div>

          {/* Search: oculto en móvil para no saturar (catálogo tiene su propia búsqueda) */}
          <div className="hidden md:block flex-1 max-w-md mx-auto relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-mut group-focus-within:text-iris-500 transition-colors" size={16} />
            <input
              placeholder="Buscar platillo o categoría..."
              className="w-full h-10 bg-surf-2 border border-bd rounded-md pl-10 pr-4 text-[13px] focus:outline-none focus:border-iris-500 transition-pos"
            />
          </div>

          {/* Spacer en móvil para empujar acciones a la derecha */}
          <div className="flex-1 md:hidden" />

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Badge count={0} variant="brand">
              <Button
                variant="soft"
                size="md"
                className="w-10 px-0"
                onClick={() => setShowOrders(true)}
                aria-label="Pedidos pendientes"
              >
                <Bell size={18} />
              </Button>
            </Badge>

            {/* Botón carrito visible solo en mobile/tablet — desktop tiene el sidebar inline */}
            <Badge count={cartCount} variant="brand">
              <Button
                variant="soft"
                size="md"
                className="w-10 px-0 lg:hidden"
                onClick={() => setShowCart(true)}
                aria-label="Ver carrito"
              >
                <ShoppingCart size={18} />
              </Button>
            </Badge>

            {/* Resumen de cajero — oculto en pantallas chicas para ahorrar espacio */}
            <div className="hidden sm:flex items-center gap-3">
              <div className="h-8 w-[1px] bg-bd" />
              <div className="flex flex-col items-end">
                <span className="text-[12px] font-bold uppercase tracking-tight">CAJERO</span>
                <span className="text-[10px] text-success font-black uppercase tracking-widest">TURNO ACTIVO</span>
              </div>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>

      {/* SIDEBAR / DRAWER — drawer en mobile, inline en lg+ */}
      <SidebarTicket isOpen={showCart} onClose={() => setShowCart(false)} />

      {/* FAB del carrito en móvil cuando hay items y el drawer no está abierto.
          Útil cuando el cajero hizo scroll en la grilla y quiere volver al carrito. */}
      {cartCount > 0 && !showCart && (
        <button
          onClick={() => setShowCart(true)}
          className="lg:hidden fixed bottom-4 right-4 z-20 w-14 h-14 rounded-full bg-iris-500 text-white shadow-2xl shadow-iris-glow flex items-center justify-center active:scale-95"
          aria-label={`Ver carrito (${cartCount})`}
        >
          <ShoppingCart size={22} />
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-danger text-white text-[10px] font-black flex items-center justify-center">
            {cartCount}
          </span>
        </button>
      )}
    </div>
  );
}
