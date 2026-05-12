"use client";
import React from "react";
import { 
  UtensilsCrossed, 
  ShoppingCart, 
  Receipt, 
  LayoutGrid, 
  BarChart3,
  Bell
} from "lucide-react";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useRouter, usePathname } from "next/navigation";

interface MainSidebarProps {
  onOpenMenu: () => void;
  onOpenOrders: () => void;
  onOpenNotifs: () => void;
  hasOpenOrders: boolean;
  unreadNotifs?: number;
}

export default function MainSidebar({ 
  onOpenMenu, 
  onOpenOrders,
  onOpenNotifs,
  hasOpenOrders,
  unreadNotifs = 0,
}: MainSidebarProps) {
  const { currentEmployee } = useTPVAuth();
  const router = useRouter();
  const pathname = usePathname();

  const getActive = (path: string) => pathname?.startsWith(path) ?? false;

  const navItems = [
    { 
      id: "pos", 
      icon: ShoppingCart, 
      label: "Ventas",
      active: getActive("/pos"),
      onClick: () => router.push("/pos/menu"),
    },
    { 
      id: "orders", 
      icon: Receipt, 
      label: "Abiertos",
      active: false,
      onClick: onOpenOrders,
    },
    { 
      id: "hub", 
      icon: LayoutGrid, 
      label: "Hub",
      active: getActive("/hub"),
      onClick: () => router.push("/hub"),
    },
    {
      id: "cierre",
      icon: BarChart3, 
      label: "Cierre",
      active: getActive("/cierre"),
      onClick: () => router.push("/cierre"),
    },
  ];

  return (
    <aside className="hidden md:flex w-20 flex-col items-center py-8 gap-10 shrink-0 relative z-30 bg-[#0a0a0c] border-r border-white/5">
      {/* LOGO WARM TECH — BUG-23: convertido a button para que sea
          accesible (rol button, focusable, y feedback visual claro al
          tocar). Antes era un div con onClick: el cajero no entendía que
          era tappable y reportaba que "el sidebar no responde". */}
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/pos/menu")}
          aria-label="Ir al panel de ventas"
          className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-90 hover:scale-105 bg-amber-500 text-[#0a0a0c] shadow-[0_0_20px_rgba(255,184,77,0.3)]"
        >
          <UtensilsCrossed size={28} />
        </button>
        <div className="w-10 h-[1px] bg-white/5" />
      </div>

      {/* TOP NAV - TOUCH OPTIMIZED
          BUG-23: subir contraste de iconos inactivos (zinc-600 → zinc-400)
          y añadir hover visible. Antes los iconos quedaban casi invisibles
          y el cajero pensaba que estaban disabled. */}
      <nav className="flex flex-col items-center gap-3">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick}
            title={item.label}
            aria-label={item.label}
            className={`w-14 h-14 flex items-center justify-center rounded-2xl transition-all active:scale-90 ${
              item.active
                ? "bg-amber-500 text-[#0a0a0c] shadow-[0_10px_20px_-5px_rgba(255,184,77,0.4)]"
                : "text-zinc-400 hover:text-white hover:bg-white/5 active:bg-white/10"
            }`}
          >
            <item.icon size={24} />
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* BOTTOM NAV */}
      <div className="flex flex-col items-center gap-4">
        {/* Notificaciones */}
        <button
          onClick={onOpenNotifs}
          aria-label="Notificaciones"
          className="w-14 h-14 flex items-center justify-center rounded-2xl transition-all relative active:scale-90 text-zinc-400 hover:text-white hover:bg-white/5 active:bg-white/10"
        >
          <Bell size={24} />
          {hasOpenOrders && unreadNotifs === 0 && (
            <span className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(255,184,77,0.6)]" />
          )}
          {unreadNotifs > 0 && (
            <span className="absolute top-3 right-3 min-w-[20px] h-[20px] px-1 rounded-full flex items-center justify-center text-[10px] font-black bg-amber-500 text-[#0a0a0c] shadow-[0_0_12px_rgba(255,184,77,0.5)]">
              {unreadNotifs > 9 ? "9+" : unreadNotifs}
            </span>
          )}
        </button>

        {/* Mi Cuenta (Avatar) */}
        <div className="pt-2">
          <button
            onClick={onOpenMenu}
            className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-black transition-all active:scale-90 bg-[#121316] border border-white/10 text-amber-500 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
          >
            {currentEmployee?.name?.charAt(0).toUpperCase() || "E"}
          </button>
        </div>
      </div>
    </aside>
  );
}
