"use client";
import React, { useState } from "react";
import { Plus, Trash2, ShoppingCart, User, UtensilsCrossed, X } from "lucide-react";
import TicketLine from "@/components/pos/TicketLine";
import PaymentModal from "@/components/pos/PaymentModal";
import { useTicketStore } from "@/store/ticketStore";
import api from "@/lib/api";
import { toast } from "sonner";

interface Props {
  onOpenShift?: () => void;
  isShiftOpen?: boolean;
}

export default function SidebarTicket({ onOpenShift, isShiftOpen = true }: Props) {
  const [showPayment, setShowPayment] = useState(false);
  const [processing, setProcessing] = useState(false);
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

  const handleProcessPayment = async (method: string) => {
    if (ticket.items.length === 0) return;
    setProcessing(true);
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
        subtotal,
        discount: ticket.discount,
        total,
        paymentMethod: method,
        status: "DELIVERED",
      };

      const { data: order } = await api.post("/api/orders/tpv", orderData);
      await api.put(`/api/orders/${order.id}/payment`, { paymentMethod: method });
      toast.success("Cobro procesado");
      clearActiveItems();
      setShowPayment(false);
      // Opcional: si tienes una función para refrescar órdenes abiertas en el hub, llámala aquí.
    } catch (error: any) {
      toast.error("Error al cobrar: " + (error.response?.data?.error || error.message));
    } finally {
      setProcessing(false);
    }
  };

  const handleOpenPayment = () => {
    if (ticket.items.length === 0) {
      toast.error("El ticket está vacío");
      return;
    }
    setShowPayment(true);
  };

  return (
    <aside className="w-full lg:w-[420px] lg:shrink-0 border-l border-white/5 bg-[#0a0a0c] flex flex-col h-full min-h-0 relative z-20">
      {/* TABS DE TICKETS */}
      <div className="flex h-16 bg-[#121316] border-b border-white/5 overflow-hidden shrink-0">
        <div className="flex-1 flex scroll-x scrollbar-hide min-w-0">
          {tickets.map((t, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={t.id}
                onClick={() => setActiveIndex(idx)}
                className={`
                  px-8 h-full flex items-center justify-center text-[11px] font-black border-r border-white/5 relative transition-all shrink-0 uppercase tracking-[0.2em] active:scale-95
                  ${isActive ? "bg-[#0a0a0c] text-amber-500" : "text-zinc-500"}
                `}
              >
                Ticket {idx + 1}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500 rounded-t-full shadow-[0_0_10px_rgba(255,184,77,0.5)]" />
                )}
              </button>
            );
          })}
          <button
            onClick={() => addTicket()}
            className="w-16 h-full flex items-center justify-center text-zinc-600 active:text-amber-500 border-r border-white/5 transition-colors shrink-0 active:scale-90"
          >
            <Plus size={22} />
          </button>
        </div>
      </div>

      {/* HEADER DEL TICKET */}
      <div className="p-8 pb-6 flex flex-col gap-5 shrink-0 bg-[#0a0a0c]">
        <div className="flex justify-between items-center">
          <h2 className="text-[11px] font-black text-zinc-500 tracking-[0.2em] uppercase">Orden en curso</h2>
          <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
            ID: {String(ticket.id).slice(-4)}
          </span>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 min-w-0 bg-[#121316] border border-white/5 rounded-2xl h-14 flex items-center px-5 gap-4 focus-within:border-amber-500/50 transition-all">
            <User size={18} className="text-zinc-600" />
            <input
              placeholder="Nombre del cliente..."
              className="bg-transparent border-none outline-none text-sm font-bold text-white w-full placeholder:text-zinc-600 placeholder:font-bold tracking-tight"
              value={ticket.name || ""}
              onChange={(e) => useTicketStore.getState().updateTicket({ name: e.target.value })}
            />
          </div>
          <button 
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border border-white/5 bg-[#121316] text-zinc-600 active:bg-red-500/10 active:text-red-500 active:border-red-500/20 transition-all active:scale-95" 
            onClick={clearActiveItems}
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      {/* LISTA DE ITEMS */}
      <div className="flex-1 min-h-0 scroll-y px-8 space-y-5 py-4 bg-[#0a0a0c] scrollbar-hide">
        {ticket.items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 gap-6">
            <ShoppingCart size={64} className="text-zinc-500" />
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-center text-zinc-500">
              Ticket vacío
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
      <div className="p-8 bg-[#121316] border-t border-white/5 mt-auto shrink-0 relative overflow-hidden">
        {/* Glow effect Warm Tech */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/5 blur-[60px] rounded-full pointer-events-none" />

        <div className="flex flex-col gap-4 mb-8 relative z-10">
           <div className="flex justify-between items-center text-sm font-bold">
             <span className="text-zinc-500 tracking-tight">Subtotal</span>
             <span className="text-zinc-300 mono tnum">${subtotal.toFixed(2)}</span>
           </div>
           {ticket.discount > 0 && (
              <div className="flex justify-between items-center text-sm font-bold text-amber-500/80">
                <span className="tracking-tight">Descuento aplicado</span>
                <span className="mono tnum">−${ticket.discount.toFixed(2)}</span>
              </div>
           )}
           <div className="flex justify-between items-end mt-4 pt-6 border-t border-white/5">
             <span className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2">Total a cobrar</span>
             <span className="text-5xl font-black text-white mono tnum tracking-tight shadow-amber-500/20">
               ${total.toFixed(2)}
             </span>
           </div>
        </div>

        <div className="relative z-10 flex flex-col gap-4">
          <button
            onClick={isShiftOpen ? handleOpenPayment : onOpenShift}
            disabled={processing || ticket.items.length === 0}
            className={`w-full h-20 rounded-[1.25rem] text-base font-black tracking-[0.2em] uppercase flex items-center justify-center gap-3 transition-all active:scale-[0.97] shadow-xl disabled:opacity-20 disabled:grayscale ${
              isShiftOpen 
                ? "bg-amber-500 text-black shadow-[0_10px_40px_-10px_rgba(255,184,77,0.4)]" 
                : "bg-red-500 text-white shadow-[0_10px_40px_-10px_rgba(239,68,68,0.4)]"
            }`}
          >
            {processing ? "Cargando..." : isShiftOpen ? "Cobrar Ticket" : "Abrir Turno de Caja"}
          </button>

          <div className="grid grid-cols-3 gap-3">
             <button 
               onClick={handleSendToKitchen} 
               className="h-14 rounded-2xl bg-[#1a1b1f] border border-white/5 text-[10px] font-black uppercase tracking-widest text-zinc-400 active:text-white active:bg-zinc-800 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5"
             >
               <UtensilsCrossed size={18} /> Cocina
             </button>
             <button 
               className="h-14 rounded-2xl bg-[#1a1b1f] border border-white/5 text-[10px] font-black uppercase tracking-widest text-zinc-400 active:text-white active:bg-zinc-800 transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
             >
               <span className="text-xl leading-none font-black">%</span> Descuento
             </button>
             <button
              onClick={() => closeTicket(activeIndex)}
              className="h-14 rounded-2xl bg-[#1a1b1f] border border-white/5 text-[10px] font-black uppercase tracking-widest text-zinc-600 active:text-red-400 active:bg-red-500/5 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5"
             >
              <X size={18} /> Cerrar
             </button>        
          </div>
        </div>

        <PaymentModal
          isOpen={showPayment}
          onClose={() => setShowPayment(false)}
          orderNumber={String(ticket.id)}
          total={total}
          discount={ticket.discount}
          items={ticket.items.map((i) => ({ name: i.name, quantity: i.quantity, subtotal: i.subtotal }))}
          onConfirm={handleProcessPayment}
        />
      </div>
    </aside>
  );
}
