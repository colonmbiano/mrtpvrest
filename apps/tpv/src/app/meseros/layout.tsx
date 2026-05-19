"use client";
import React, { useEffect } from "react";
import { Map, List, ShoppingBag, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useTicketStore } from "@/store/ticketStore";

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentEmployee, isLocked, logout } = useTPVAuth();

  const handleLogout = () => {
    logout();
    router.replace("/locked");
  };

  const handleTakeout = () => {
    useTicketStore.getState().updateTicket({ type: "TAKEOUT" });
    router.push("/pos/menu");
  };

  useEffect(() => {
    if (currentEmployee && !isLocked) {
      const allowedRoles = ["WAITER", "OWNER", "ADMIN", "MANAGER"];
      if (!allowedRoles.includes(currentEmployee.role)) {
        console.warn(
          `[SECURITY] Acceso denegado a /(waiter): rol ${currentEmployee.role} no autorizado`
        );
        router.replace("/");
      }
    }
  }, [currentEmployee, isLocked, router]);

  const tabs = [
    { id: "salon",     icon: Map,  label: "Salón",     href: "/meseros" },
    { id: "mis-mesas", icon: List, label: "Mis mesas", href: "/meseros/mis-mesas" },
  ];

  return (
    <div
      className="relative flex flex-col h-screen w-full bg-[#0a0a0c] text-white overflow-hidden"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* Ambient diseño operativo glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full blur-[100px] opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(255,184,77,0.18) 0%, transparent 70%)' }}
      />

      {/* HEADER */}
      <header className="relative z-10 h-16 px-5 bg-white/5 backdrop-blur-md border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex flex-col">
          <span className="text-[10px] font-black tracking-[0.25em] text-white/40">VISTA</span>
          <span className="text-[15px] font-black text-white tracking-tight">Salón · Centro</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 backdrop-blur-md px-3 py-1.5 rounded-full">
            <div className="w-6 h-6 rounded-full bg-[#ffb84d] text-[#0a0a0c] text-[10px] flex items-center justify-center font-black">
              {currentEmployee?.name?.substring(0, 2).toUpperCase() || "SR"}
            </div>
            <span className="text-[11px] font-bold text-white">
              {currentEmployee?.name?.toUpperCase() || "MESERO"}
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Salir"
            className="w-10 h-10 min-h-[40px] rounded-full bg-white/5 border border-white/10 backdrop-blur-md flex items-center justify-center text-white/60 active:scale-95 transition-all hover:text-red-400 hover:border-red-400/30"
          >
            <LogOut size={16} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* CONTENT */}
      <main className="relative z-10 flex-1 overflow-hidden">
        {children}
      </main>

      {/* BOTTOM NAV */}
      <nav className="relative z-10 h-[72px] bg-white/5 backdrop-blur-md border-t border-white/10 flex items-stretch p-1.5 shrink-0">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              prefetch={false}
              className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-2xl active:scale-95 transition-transform ${
                isActive
                  ? "text-[#ffb84d] bg-[#ffb84d]/10 border border-[#ffb84d]/20"
                  : "text-white/45"
              }`}
            >
              <Icon size={20} />
              <span className="text-[9px] font-black uppercase tracking-widest">{tab.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={handleTakeout}
          className="flex-1 flex items-center justify-center gap-2 bg-[#ffb84d] text-[#0a0a0c] rounded-2xl mx-1 font-black text-[11px] uppercase tracking-widest shadow-[0_10px_30px_rgba(255,184,77,0.3)] active:scale-95 transition-transform"
        >
          <ShoppingBag size={16} strokeWidth={2.5} />
          Llevar
        </button>
      </nav>
    </div>
  );
}
