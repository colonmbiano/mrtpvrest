"use client";
import React from "react";
import { Map, List, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const employee = useAuthStore((s) => s.employee);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  React.useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router]);

  const tabs = [
    { id: "salon", icon: Map, label: "Salón", href: "/meseros" },
    { id: "mis-mesas", icon: List, label: "Mis mesas", href: "/meseros/mis-mesas" },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-bgApp overflow-hidden font-sans text-tx-pri">
      {/* HEADER MÓVIL */}
      <header className="h-16 px-6 border-b border-bd bg-surf-1 flex items-center justify-between shrink-0">
        <div className="flex flex-col">
          <span className="eyebrow">TERMINAL</span>
          <span className="text-[15px] font-black uppercase tracking-tight">VISTA MESERO</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-surf-2 border border-bd px-3 py-1.5 rounded-full">
            <div className="w-5 h-5 rounded-full bg-iris-500 text-white text-[9px] flex items-center justify-center font-black">
              {employee?.name?.charAt(0) || "W"}
            </div>
            <span className="text-[11px] font-black uppercase tracking-tight">
              {employee?.name || "SIN NOMBRE"}
            </span>
          </div>
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
        
        <button className="flex-[1.2] flex items-center justify-center gap-2 bg-iris-500 text-white rounded-xl mx-1 font-bold text-[11px] uppercase tracking-widest shadow-lg shadow-iris-glow active:scale-95 transition-pos">
          <ShoppingBag size={16} />
          Llevar
        </button>
      </nav>
    </div>
  );
}
