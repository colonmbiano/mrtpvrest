"use client";
import React from "react";
import { Map, List, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { id: "salon", icon: Map, label: "Salón", href: "/meseros" },
    { id: "mis-mesas", icon: List, label: "Mis mesas", href: "/meseros/mis-mesas" },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-surf-0 overflow-hidden font-sans text-tx-pri max-w-[500px] mx-auto border-x border-bd">
      {/* HEADER MÓVIL */}
      <header className="h-16 px-6 border-b border-bd bg-surf-1 flex items-center justify-between shrink-0">
        <div className="flex flex-col">
          <span className="eyebrow">VISTA</span>
          <span className="text-[15px] font-bold">Salón · Centro</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-surf-2 border border-bd px-3 py-1.5 rounded-full">
            <div className="w-5 h-5 rounded-full bg-iris-500 text-white text-[10px] flex items-center justify-center font-bold">SR</div>
            <span className="text-[11px] font-bold">SARA R.</span>
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
