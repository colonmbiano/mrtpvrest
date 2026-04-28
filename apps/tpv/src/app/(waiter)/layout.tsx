"use client";
import React from "react";
import { Map, List, ShoppingBag, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

function getInitials(name: string | undefined): string {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const employee = useAuthStore((s) => s.employee);
  const logout = useAuthStore((s) => s.logout);

  const tabs = [
    { id: "salon", icon: Map, label: "Salón", href: "/meseros" },
    { id: "mis-mesas", icon: List, label: "Mis mesas", href: "/meseros/mis-mesas" },
  ];

  const locationName = typeof window !== "undefined"
    ? localStorage.getItem("locationName") || "Sucursal"
    : "Sucursal";

  function handleLogout() {
    logout();
    router.replace("/");
  }

  return (
    <div className="flex flex-col h-screen w-full bg-surf-0 overflow-hidden font-sans text-tx-pri max-w-[500px] mx-auto border-x border-bd">
      {/* HEADER MÓVIL */}
      <header className="h-16 px-6 border-b border-bd bg-surf-1 flex items-center justify-between shrink-0">
        <div className="flex flex-col">
          <span className="eyebrow">VISTA</span>
          <span className="text-[15px] font-bold">Salón · {locationName}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-surf-2 border border-bd px-3 py-1.5 rounded-full">
            <div className="w-5 h-5 rounded-full bg-iris-500 text-white text-[10px] flex items-center justify-center font-bold">
              {getInitials(employee?.name)}
            </div>
            <span className="text-[11px] font-bold uppercase tracking-tight">
              {employee?.name?.toUpperCase() || "INVITADO"}
            </span>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="w-9 h-9 rounded-full bg-surf-2 border border-bd flex items-center justify-center text-tx-mut hover:text-iris-500 active:scale-95 transition-pos"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* CONTENT */}
      <main className="flex-1 overflow-hidden relative">
        {children}
      </main>

      {/* BOTTOM NAV */}
      <nav className="h-[72px] border-t border-bd bg-surf-1 flex items-stretch p-1.5 shrink-0">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`
                flex-1 flex flex-col items-center justify-center gap-1 rounded-xl transition-pos
                ${isActive ? "text-iris-500 bg-iris-soft" : "text-tx-mut hover:text-tx-sec"}
              `}
            >
              <Icon size={20} />
              <span className="text-[9px] font-bold uppercase tracking-wider">{tab.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          disabled
          title="Próximamente: pedidos para llevar"
          aria-label="Pedido para llevar (próximamente)"
          className="flex-[1.2] flex items-center justify-center gap-2 bg-iris-500/40 text-white/70 rounded-xl mx-1 font-bold text-[11px] uppercase tracking-widest cursor-not-allowed"
        >
          <ShoppingBag size={16} />
          Llevar
        </button>
      </nav>
    </div>
  );
}
