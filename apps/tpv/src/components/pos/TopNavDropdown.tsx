"use client";
import React, { useState, useRef, useEffect } from "react";
import {
  Menu,
  ShoppingCart,
  Receipt,
  LayoutGrid,
  BarChart3,
  Bell,
  Wallet,
  Bike
} from "lucide-react";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useRouter, usePathname } from "next/navigation";
import DriversPanel from "@/components/admin/DriversPanel";

interface Props {
  onOpenMenu: () => void;
  onOpenOrders: () => void;
  onOpenNotifs: () => void;
  onOpenExpenses?: () => void;
  hasOpenOrders: boolean;
  unreadNotifs?: number;
}

export default function TopNavDropdown({
  onOpenMenu,
  onOpenOrders,
  onOpenNotifs,
  onOpenExpenses,
  unreadNotifs = 0,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const { currentEmployee } = useTPVAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [showDrivers, setShowDrivers] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const getActive = (path: string) => pathname?.startsWith(path) ?? false;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      id: "drivers", 
      icon: Bike, 
      label: "Repartidores",
      active: showDrivers,
      onClick: () => setShowDrivers(true),
    },
    { 
      id: "hub", 
      icon: LayoutGrid, 
      label: "Sucursal",
      active: getActive("/hub"),
      onClick: () => router.push("/hub?force=true"),
    },
    {
      id: "cierre",
      icon: BarChart3,
      label: "Cierre",
      active: getActive("/cierre"),
      onClick: () => router.push("/cierre"),
    },
    {
      id: "expenses",
      icon: Wallet,
      label: "Gastos",
      active: false,
      onClick: () => onOpenExpenses?.(),
      hidden: !onOpenExpenses,
    },
  ].filter((i: any) => !i.hidden);

  return (
    <>
      <div className="relative z-50" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#6b5641] bg-[#1e1b18] text-[#f8e8d0] shadow-[0_4px_12px_rgba(44,31,19,0.22)] transition-all active:scale-95 hover:border-[#ff8400]/60 hover:text-[#ffb84d]"
        >
          <Menu size={20} />
          {unreadNotifs > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(255,184,77,0.6)]" />
          )}
        </button>

        {isOpen && (
          <div className="absolute top-12 left-0 w-64 bg-[#121316] border border-white/10 rounded-2xl shadow-2xl p-2 flex flex-col gap-1 overflow-hidden origin-top-left animate-in fade-in zoom-in-95 duration-200">
            {/* Header del Menú */}
            <div className="px-3 py-3 border-b border-white/5 mb-2 flex items-center gap-3">
              <button
                onClick={() => { setIsOpen(false); onOpenMenu(); }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black bg-[#1a1b1f] border border-white/10 text-amber-500 shrink-0"
              >
                {currentEmployee?.name?.charAt(0).toUpperCase() || "E"}
              </button>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-white truncate">{currentEmployee?.name || "Sin sesión"}</span>
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">{currentEmployee?.role || "—"}</span>
              </div>
            </div>

            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setIsOpen(false);
                  item.onClick();
                }}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all active:scale-95 ${
                  item.active
                    ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon size={18} />
                <span className="text-sm font-bold">{item.label}</span>
              </button>
            ))}

            <button
              onClick={() => {
                setIsOpen(false);
                onOpenNotifs();
              }}
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all active:scale-95"
            >
              <div className="relative">
                <Bell size={18} />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(255,184,77,0.6)]" />
                )}
              </div>
              <span className="text-sm font-bold">Notificaciones</span>
              {unreadNotifs > 0 && (
                <span className="ml-auto bg-amber-500 text-black px-1.5 py-0.5 rounded-md text-[10px] font-black">
                  {unreadNotifs}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      <DriversPanel isOpen={showDrivers} onClose={() => setShowDrivers(false)} accent="#ffb84d" />
    </>
  );
}
