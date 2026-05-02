"use client";
import React from "react";
import { Plus, Trash2, Printer, CreditCard, ShoppingCart } from "lucide-react";
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
    <aside className="w-full lg:w-[380px] lg:shrink-0 lg:border-l border-bd bg-surf-1 flex flex-col min-w-0">
      {/* TABS DE TICKETS (Linear Style) */}
      <div className="flex h-12 bg-surf-0 border-b border-bd overflow-hidden">
        <div className="flex-1 flex overflow-x-auto scrollbar-hide min-w-0">
          {tickets.map((t, idx) => (
            <button
              key={t.id}
              onClick={() => setActiveIndex(idx)}
              className={`px-6 h-full flex items-center justify-center text-[11px] font-medium border-r border-bd relative transition-all shrink-0 ${
                idx === activeIndex ? "bg-surf-1 text-tx-pri" : "text-tx-mut hover:bg-surf-2"
              }`}
            >
              ORDEN {idx + 1}
              {idx === activeIndex && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-iris-500" />
              )}
            </button>
          ))}
          <button
            onClick={() => addTicket()}
            className="w-12 h-full flex items-center justify-center text-tx-mut hover:bg-surf-2 border-r border-bd transition-colors shrink-0"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* HEADER DEL TICKET */}
      <div className="p-5 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-[14px] font-bold text-tx-pri">Ticket Actual</h2>
          <span className="text-[10px] font-bold text-tx-mut uppercase tracking-widest">
            ORDEN #{ticket.id.toString().slice(-4)}
          </span>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 min-w-0 bg-surf-2/50 border border-bd rounded-md h-9 flex items-center px-3 gap-2">
            <input
              placeholder="Nombre del cliente..."
              className="bg-transparent border-none outline-none text-[12px] font-medium text-tx-pri w-full"
              value={ticket.name || ""}
              onChange={(e) => useTicketStore.getState().updateTicket({ name: e.target.value })}
            />
          </div>
          <Button variant="ghost" size="sm" className="w-9 h-9 p-0 shrink-0 border-bd" onClick={clearActiveItems}>
            <Trash2 size={14} className="text-tx-mut hover:text-danger transition-colors" />
          </Button>
        </div>
      </div>

      {/* LISTA DE ITEMS */}
      <div className="flex-1 overflow-y-auto px-5 space-y-4">
        {ticket.items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-10 gap-4 py-20">
            <ShoppingCart size={40} />
            <p className="text-[11px] font-medium uppercase tracking-widest text-center">
              Sin productos
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

      {/* FOOTER DEL TICKET (Linear Style) */}
      <div className="p-6 bg-surf-0 border-t border-bd mt-auto">
        <div className="flex flex-col gap-2 mb-6">
           <div className="flex justify-between items-center text-[12px]">
             <span className="text-tx-mut">Subtotal</span>
             <span className="font-medium text-tx-pri mono tnum">${subtotal.toFixed(2)}</span>
           </div>
           {ticket.discount > 0 && (
              <div className="flex justify-between items-center text-[12px] text-success">
                <span className="font-medium">Descuento</span>
                <span className="mono tnum">−${ticket.discount.toFixed(2)}</span>
              </div>
           )}
           <div className="flex justify-between items-baseline mt-2 pt-4 border-t border-bd/30">
             <span className="text-[11px] font-bold text-tx-mut uppercase tracking-widest">Total</span>
             <span className="text-3xl font-medium text-tx-pri mono tnum tracking-tighter">${total.toFixed(2)}</span>
           </div>
        </div>

        <button 
          onClick={handleSendToKitchen}
          disabled={ticket.items.length === 0}
          className="w-full bg-iris-500 hover:bg-iris-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md py-4 text-[13px] font-bold shadow-[0_0_20px_rgba(94,106,210,0.3)] transition-all active:scale-[0.98]"
        >
          Pagar ahora
        </button>

        <div className="grid grid-cols-2 gap-2 mt-4">
           <button className="h-9 rounded-md bg-surf-2 border border-bd text-[10px] font-bold uppercase tracking-wider text-tx-sec hover:bg-surf-3 transition-colors">🍳 Cocina</button>
           <button 
            onClick={() => closeTicket(activeIndex)}
            className="h-9 rounded-md bg-surf-2 border border-bd text-[10px] font-bold uppercase tracking-wider text-tx-sec hover:bg-surf-3 transition-colors"
           >
            ❌ Cerrar
           </button>
        </div>
      </div>
    </aside>
  );
}
