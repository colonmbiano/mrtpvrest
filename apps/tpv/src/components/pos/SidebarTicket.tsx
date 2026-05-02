"use client";
import React from "react";
import { Plus, Trash2, CreditCard, ShoppingCart } from "lucide-react";
import Button from "@/components/ui/Button";
import TicketLine from "@/components/pos/TicketLine";
import { useTicketStore } from "@/store/ticketStore";
import api from "@/lib/api";
import { toast } from "sonner";

export default function SidebarTicket() {
  const { 
    tickets,
    activeIndex,
    getActiveTicket, 
    addTicket,
    setActiveIndex,
    closeTicket,
    changeItemQty, 
    clearActiveItems 
  } = useTicketStore();
  
  const ticket = getActiveTicket();
  
  const subtotal = ticket.items.reduce((acc, item) => acc + item.subtotal, 0);
  const total = subtotal - ticket.discount;

  const handleSendToKitchen = async () => {
    if (ticket.items.length === 0) {
      toast.error("El ticket está vacío");
      return;
    }
    
    try {
      const orderData = {
        orderType: ticket.type,
        items: ticket.items.map(item => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          notes: item.notes || "",
          modifiers: (item.modifiers || []).map(m => ({ modifierId: m.id })),
        })),
        tableId: ticket.tableId || null,
        customerName: ticket.name || "Publico General",
        customerPhone: ticket.phone || null,
        subtotal: subtotal,
        discount: ticket.discount,
        total: total,
      };

      await api.post("/api/orders/tpv", orderData);
      toast.success("Pedido enviado a cocina");
      clearActiveItems();
    } catch (error: any) {
      toast.error("Error al enviar pedido: " + (error.response?.data?.error || error.message));
    }
  };

  return (
    <aside className="w-full lg:w-[420px] lg:shrink-0 lg:border-l border-bd bg-surf-1 flex flex-col min-w-0">
      {/* TABS DE TICKETS */}
      <div className="flex h-12 bg-surf-0 border-b border-bd">
        <div className="flex-1 flex overflow-x-auto scrollbar-hide min-w-0">
          {tickets.map((t, idx) => (
            <button
              key={t.id}
              onClick={() => setActiveIndex(idx)}
              className={`px-4 sm:px-6 h-full flex items-center justify-center text-[12px] font-bold border-r border-bd relative transition-colors shrink-0 ${
                idx === activeIndex ? "bg-surf-1 text-iris-500" : "text-tx-mut hover:bg-surf-2"
              }`}
            >
              TICKET {idx + 1}
              {idx === activeIndex && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-iris-500" />
              )}
            </button>
          ))}
          <button
            onClick={() => addTicket()}
            className="w-12 h-full flex items-center justify-center text-tx-mut hover:bg-surf-2 transition-colors shrink-0"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* HEADER DEL TICKET */}
      <div className="p-3 sm:p-4 lg:p-5 flex flex-col gap-3 sm:gap-4">
        <div className="flex justify-between items-center gap-2">
          <span className="eyebrow truncate">ORDEN #{ticket.id} · BORRADOR</span>
          <span className="text-[11px] font-bold text-tx-mut mono tnum shrink-0">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="flex gap-2 min-w-0">
          <div className="flex-1 min-w-0 bg-surf-2 border border-bd rounded-md h-[38px] flex items-center px-3 gap-2">
            <span className="text-[13px] text-tx-dis shrink-0">Cliente:</span>
            <input
              className="bg-transparent border-none outline-none text-[13px] font-semibold text-tx-pri w-full min-w-0"
              value={ticket.name || "Publico General"}
              onChange={(e) => useTicketStore.getState().updateTicket({ name: e.target.value })}
            />
          </div>
          <Button variant="ghost" size="sm" className="w-[38px] h-[38px] p-0 shrink-0" onClick={clearActiveItems}>
            <Trash2 size={16} className="text-danger opacity-50 hover:opacity-100 transition-opacity" />
          </Button>
        </div>
      </div>

      {/* LISTA DE ITEMS */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-5 space-y-1">
        {ticket.items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4 py-12 sm:py-20">
            <ShoppingCart size={48} />
            <p className="text-[12px] font-bold uppercase tracking-widest text-center">
              El ticket está vacío<br/>
              <span className="text-[10px] font-medium capitalize tracking-normal">Agrega productos del menú</span>
            </p>
          </div>
        ) : (
          ticket.items.map((item, idx) => (
            <TicketLine
              key={`${item.id}-${idx}`}
              name={item.name}
              quantity={item.quantity}
              price={item.price}
              modifiers={item.modifiers?.map(m => ({ name: m.name, priceAdd: m.priceAdd }))}
              onIncrease={() => changeItemQty(idx, 1)}
              onDecrease={() => changeItemQty(idx, -1)}
            />
          ))
        )}
      </div>

      {/* FOOTER DEL TICKET */}
      <div className="p-3 sm:p-4 lg:p-5 border-t border-bd bg-surf-2/50">
        <div className="flex flex-col gap-2 mb-4 sm:mb-5">
           <div className="flex justify-between items-center gap-2">
             <span className="text-[13px] text-tx-sec">Subtotal</span>
             <span className="text-[14px] font-bold text-tx-pri mono tnum">${subtotal.toFixed(2)}</span>
           </div>
           {ticket.discount > 0 && (
              <div className="flex justify-between items-center text-success gap-2">
                <span className="text-[13px] font-bold">Descuento</span>
                <span className="text-[14px] font-bold mono tnum">−${ticket.discount.toFixed(2)}</span>
              </div>
           )}
           <div className="flex justify-between items-center text-iris-500 pt-2 border-t border-bd/10 gap-2">
             <span className="text-[13px] font-black uppercase tracking-widest">Total</span>
             <span className="text-2xl sm:text-3xl font-black mono tnum tracking-tighter truncate">${total.toFixed(2)}</span>
           </div>
        </div>

        <Button variant="primary" size="xl" fullWidth className="h-12 sm:h-14 text-xs sm:text-sm tracking-[0.15em] sm:tracking-[0.2em] font-black uppercase shadow-glow">
          <CreditCard size={18} className="mr-2" />
          Procesar cobro
        </Button>

        <div className="grid grid-cols-3 gap-2 mt-3">
           <Button variant="soft" size="md" className="text-[10px] font-black uppercase" onClick={handleSendToKitchen}>🍳 Cocina</Button>
           <Button variant="soft" size="md" className="text-[10px] font-black uppercase">🏷 Desc.</Button>
           <Button variant="soft" size="md" className="text-[10px] font-black uppercase" onClick={() => closeTicket(activeIndex)}>❌ Cerrar</Button>
        </div>
      </div>
    </aside>
  );
}
