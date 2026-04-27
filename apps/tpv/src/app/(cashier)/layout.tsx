"use client";
import React, { useState } from "react";
import { Search, Menu, Bell, ShoppingCart } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import ConfigMenu from "@/components/pos/ConfigMenu";

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  const [showMenu, setShowMenu] = useState(false);
  
  return (
    <div className="flex h-screen w-full bg-surf-0 overflow-hidden font-sans text-tx-pri">
      <ConfigMenu 
        isOpen={showMenu} 
        onClose={() => setShowMenu(false)}
        onLogout={() => console.log("Logout")}
        currentTheme="green"
        onThemeChange={(t) => console.log("Theme:", t)}
        isDark={true}
        onToggleMode={() => console.log("Toggle Mode")}
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
              MRTPVREST
            </span>
            <span className="eyebrow mt-0.5">SUCURSAL CENTRO</span>
          </div>

          <div className="flex-1 max-w-md mx-auto relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-mut group-focus-within:text-iris-500 transition-colors" size={16} />
            <input 
              placeholder="Buscar platillo o categoría..." 
              className="w-full h-10 bg-surf-2 border border-bd rounded-md pl-10 pr-4 text-[13px] focus:outline-none focus:border-iris-500 transition-pos"
            />
          </div>

          <div className="flex items-center gap-3">
            <Badge count={3} variant="brand">
              <Button variant="soft" size="md" className="w-10 px-0">
                <Bell size={18} />
              </Button>
            </Badge>
            
            <div className="h-8 w-[1px] bg-bd mx-1" />
            
            <div className="flex flex-col items-end">
              <span className="text-[12px] font-bold">LUCÍA P.</span>
              <span className="text-[10px] text-success font-black uppercase tracking-widest">TURNO: 04:32H</span>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT (Product Grid / Categories) */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>

      {/* TICKET SIDEBAR (RIGHT) */}
      <aside className="w-[420px] border-l border-bd bg-surf-1 flex flex-col shrink-0">
        {/* Tabs de Tickets */}
        <div className="flex h-12 bg-surf-0 border-b border-bd">
          <div className="flex-1 flex overflow-x-auto scrollbar-hide">
             <button className="px-6 h-full flex items-center justify-center text-[12px] font-bold border-r border-bd bg-surf-1 text-iris-500 relative">
               TICKET 1
               <div className="absolute bottom-0 left-0 right-0 h-1 bg-iris-500" />
             </button>
             <button className="px-6 h-full flex items-center justify-center text-[12px] font-bold border-r border-bd text-tx-mut hover:bg-surf-2">
               TICKET 2
             </button>
             <button className="w-12 h-full flex items-center justify-center text-tx-mut hover:bg-surf-2">
               +
             </button>
          </div>
        </div>

        {/* Header del Ticket */}
        <div className="p-5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <span className="eyebrow">ORDEN #1042 · BORRADOR</span>
            <span className="text-[11px] font-bold text-tx-mut mono tnum">27 ABR, 20:14</span>
          </div>
          
          <div className="flex gap-2">
            <div className="flex-1 bg-surf-2 border border-bd rounded-md h-[38px] flex items-center px-3 gap-2">
              <span className="text-[13px] text-tx-dis">Cliente:</span>
              <span className="text-[13px] font-semibold text-tx-pri">Publico General</span>
            </div>
          </div>
        </div>

        {/* Lista de Items (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-5">
           {/* Aquí irán las TicketLines */}
           <div className="py-20 text-center opacity-20 flex flex-col items-center gap-3">
             <ShoppingCart size={48} />
             <p className="text-[12px] font-bold uppercase tracking-widest">El ticket está vacío</p>
           </div>
        </div>

        {/* Footer del Ticket */}
        <div className="p-5 border-t border-bd bg-surf-2/50">
          <div className="flex flex-col gap-2 mb-5">
             <div className="flex justify-between items-center">
               <span className="text-[13px] text-tx-sec">Subtotal</span>
               <span className="text-[14px] font-bold text-tx-pri mono tnum">$0.00</span>
             </div>
             <div className="flex justify-between items-center text-iris-500">
               <span className="text-[13px] font-bold">Total</span>
               <span className="text-2xl font-black mono tnum">$0.00</span>
             </div>
          </div>

          <Button variant="primary" size="xl" fullWidth className="text-sm tracking-widest font-black uppercase">
            Procesar cobro
          </Button>
          
          <div className="grid grid-cols-3 gap-2 mt-3">
             <Button variant="soft" size="md" className="text-[10px] font-black uppercase">🍳 Cocina</Button>
             <Button variant="soft" size="md" className="text-[10px] font-black uppercase">🏷 Desc.</Button>
             <Button variant="soft" size="md" className="text-[10px] font-black uppercase text-danger">❌ Limpiar</Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
