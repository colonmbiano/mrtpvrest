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
  Bike,
  Globe,
  ArrowLeftRight
} from "lucide-react";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useRouter, usePathname } from "next/navigation";
import DriversPanel from "@/components/admin/DriversPanel";

interface Props {
  onOpenMenu: () => void;
  onOpenOrders: () => void;
  onOpenNotifs: () => void;
  onOpenWebOrders?: () => void;
  onOpenExpenses?: () => void;
  /** Cierra sesión y manda al PIN para que entre otro empleado (1 toque). */
  onSwitchEmployee?: () => void;
  hasOpenOrders: boolean;
  unreadNotifs?: number;
  /** Pedidos web PENDING (sin aceptar) — alimenta el badge de la pestaña. */
  webOrdersCount?: number;
}

export default function TopNavDropdown({
  onOpenMenu,
  onOpenOrders,
  onOpenNotifs,
  onOpenWebOrders,
  onOpenExpenses,
  onSwitchEmployee,
  unreadNotifs = 0,
  webOrdersCount = 0,
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
      id: "weborders",
      icon: Globe,
      label: "Pedidos Web",
      active: false,
      onClick: () => onOpenWebOrders?.(),
      badge: webOrdersCount,
      hidden: !onOpenWebOrders,
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
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] shadow-[var(--shadow-sm)] transition-all active:scale-95 hover:border-[var(--brand)] hover:text-[var(--brand)]"
        >
          <Menu size={20} />
          {(unreadNotifs > 0 || webOrdersCount > 0) && (
            <span
              className={`absolute -top-1 -right-1 w-3 h-3 rounded-full shadow-[0_0_8px_var(--brand-glow)] ${
                webOrdersCount > 0 ? "bg-[#5e6ad2]" : "bg-[var(--brand)]"
              }`}
            />
          )}
        </button>

        {isOpen && (
          <div className="absolute top-12 left-0 w-64 bg-[var(--surface-1)] border border-white/10 rounded-2xl shadow-2xl p-2 flex flex-col gap-1 overflow-hidden origin-top-left animate-in fade-in zoom-in-95 duration-200">
            {/* Header del Menú */}
            <div className="px-3 py-3 border-b border-white/5 mb-2 flex items-center gap-3">
              <button
                onClick={() => { setIsOpen(false); onOpenMenu(); }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold bg-[var(--surface-1)] border border-white/10 text-[var(--brand)] shrink-0"
              >
                {currentEmployee?.name?.charAt(0).toUpperCase() || "E"}
              </button>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-white truncate">{currentEmployee?.name || "Sin sesión"}</span>
                <span className="text-[10px] font-semibold text-[var(--brand)] uppercase tracking-widest">{currentEmployee?.role || "—"}</span>
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
                    ? "bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand)]"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon size={18} />
                <span className="text-sm font-bold">{item.label}</span>
                {(item as any).badge > 0 && (
                  <span className="ml-auto bg-[#5e6ad2] text-white px-1.5 py-0.5 rounded-md text-[10px] font-semibold min-w-[20px] text-center">
                    {(item as any).badge}
                  </span>
                )}
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
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[var(--brand)] shadow-[0_0_8px_var(--brand-glow)]" />
                )}
              </div>
              <span className="text-sm font-bold">Notificaciones</span>
              {unreadNotifs > 0 && (
                <span className="ml-auto bg-[var(--brand)] text-[var(--brand-fg)] px-1.5 py-0.5 rounded-md text-[10px] font-semibold">
                  {unreadNotifs}
                </span>
              )}
            </button>

            {onSwitchEmployee && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onSwitchEmployee();
                }}
                className="mt-1 flex items-center gap-3 px-3 py-3 rounded-xl border-t border-white/5 text-[var(--brand)] hover:text-[var(--brand)] hover:bg-[var(--brand-soft)] transition-all active:scale-95"
              >
                <ArrowLeftRight size={18} />
                <span className="text-sm font-bold">Cambiar empleado</span>
              </button>
            )}
          </div>
        )}
      </div>

      <DriversPanel
        isOpen={showDrivers}
        onClose={() => setShowDrivers(false)}
        accent="var(--brand)"
        currentRole={currentEmployee?.role}
      />
    </>
  );
}
