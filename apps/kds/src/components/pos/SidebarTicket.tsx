"use client";
import React, { useState } from "react";
import { Plus, Trash2, ShoppingCart, User, UtensilsCrossed, X } from "lucide-react";
import TicketLine from "@/components/pos/TicketLine";
import PaymentModal from "@/components/pos/PaymentModal";
import { useTicketStore } from "@/store/ticketStore";
import api from "@/lib/api";
import { toast } from "sonner";

export default function SidebarTicket() {
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
    <aside className="w-full lg:w-[400px] lg:shrink-0 border-l border-border bg-surface flex flex-col h-full min-h-0" style={{ background: "var(--surf-1)" }}>
      {/* TABS DE TICKETS */}
      <div className="flex h-14 bg-surface-2 border-b border-border overflow-hidden shrink-0">
        <div className="flex-1 flex scroll-x scrollbar-hide min-w-0">
          {tickets.map((t, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={t.id}
                onClick={() => setActiveIndex(idx)}
                className={`
                  px-6 h-full flex items-center justify-center text-xs font-bold border-r border-border relative transition-all shrink-0 uppercase tracking-widest
                  ${isActive ? "bg-surf-1 text-brand" : "text-tx-mut hover:bg-surf-3 hover:text-tx-pri"}
                `}
              >
                Ticket {idx + 1}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 rounded-t-full" style={{ background: "var(--brand)" }} />
                )}
              </button>
            );
          })}
          <button
            onClick={() => addTicket()}
            className="w-14 h-full flex items-center justify-center text-tx-mut hover:bg-surf-3 hover:text-tx-pri border-r border-border transition-colors shrink-0"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* HEADER DEL TICKET */}
      <div className="p-6 pb-4 flex flex-col gap-4 shrink-0 bg-surf-1">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-bold text-tx-mut tracking-widest uppercase">Orden Actual</h2>
          <span className="text-[10px] font-black text-tx-mut uppercase tracking-widest bg-surf-2 px-2 py-1 rounded-md border border-border">
            #{ticket.id.toString().slice(-4)}
          </span>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 min-w-0 bg-surf-2 border border-border rounded-xl h-12 flex items-center px-4 gap-3 focus-within:border-brand focus-within:ring-1 focus-within:ring-brand/30 transition-all">
            <User size={16} className="text-tx-mut" />
            <input
              placeholder="Nombre del cliente..."
              className="bg-transparent border-none outline-none text-sm font-semibold text-tx-pri w-full placeholder:text-tx-mut placeholder:font-normal"
              value={ticket.name || ""}
              onChange={(e) => useTicketStore.getState().updateTicket({ name: e.target.value })}
            />
          </div>
          <button 
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-border bg-surf-2 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 text-tx-mut transition-all" 
            onClick={clearActiveItems}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* LISTA DE ITEMS */}
      <div className="flex-1 min-h-0 scroll-y px-6 space-y-4 py-2 bg-surf-1 scrollbar-hide">
        {ticket.items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40 gap-4">
            <ShoppingCart size={48} className="text-tx-mut" />
            <p className="text-xs font-bold uppercase tracking-widest text-center text-tx-mut">
              Agrega productos al ticket
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
      <div className="p-6 bg-surf-2 border-t border-border mt-auto shrink-0 relative overflow-hidden">
        {/* Glow effect matching brand */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-brand/10 blur-[50px] rounded-full pointer-events-none" />

        <div className="flex flex-col gap-3 mb-6 relative z-10">
           <div className="flex justify-between items-center text-sm">
             <span className="text-tx-mut font-medium tracking-wide">Subtotal</span>
             <span className="font-bold text-tx-pri mono tnum">${subtotal.toFixed(2)}</span>
           </div>
           {ticket.discount > 0 && (
              <div className="flex justify-between items-center text-sm text-success">
                <span className="font-medium tracking-wide">Descuento</span>
                <span className="font-bold mono tnum">−${ticket.discount.toFixed(2)}</span>
              </div>
           )}
           <div className="flex justify-between items-end mt-3 pt-4 border-t border-border/50">
             <span className="text-[11px] font-black text-tx-mut uppercase tracking-widest mb-1">Total a cobrar</span>
             <span className="text-4xl font-semibold text-tx-pri mono tnum tracking-tighter" style={{ color: "var(--brand)" }}>
               ${total.toFixed(2)}
             </span>
           </div>
        </div>

        <div className="relative z-10">
          <button
            onClick={handleOpenPayment}
            disabled={processing || ticket.items.length === 0}
            className="w-full h-16 bg-brand hover:brightness-110 disabled:opacity-50 disabled:grayscale text-brand-fg rounded-2xl text-base font-bold tracking-wider shadow-[0_0_24px_rgba(255,132,0,0.25)] transition-all active:scale-[0.98] uppercase flex items-center justify-center gap-3"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
          >
            {processing ? "Procesando…" : "Cobrar Ticket"}
          </button>
        </div>

        <PaymentModal
          isOpen={showPayment}
          onClose={() => setShowPayment(false)}
          orderNumber={String(ticket.id)}
          total={total}
          items={ticket.items.map((i) => ({ name: i.name, quantity: i.quantity, subtotal: i.subtotal }))}
          onConfirm={handleProcessPayment}
        />

        <div className="grid grid-cols-3 gap-3 mt-4 relative z-10">
           <button 
             onClick={handleSendToKitchen} 
             className="h-12 rounded-xl bg-surf-3 border border-border text-[10px] font-bold uppercase tracking-widest text-tx-pri hover:bg-surf-4 hover:border-brand/30 transition-all flex flex-col items-center justify-center gap-1"
           >
             <UtensilsCrossed size={16} /> Cocina
           </button>
           <button 
             className="h-12 rounded-xl bg-surf-3 border border-border text-[10px] font-bold uppercase tracking-widest text-tx-pri hover:bg-surf-4 transition-all flex flex-col items-center justify-center gap-1"
           >
             <span className="text-lg leading-none mt-1">%</span> Desc.
           </button>
           <button
            onClick={() => closeTicket(activeIndex)}
            className="h-12 rounded-xl bg-surf-3 border border-border text-[10px] font-bold uppercase tracking-widest text-danger hover:bg-red-500/10 hover:border-red-500/30 transition-all flex flex-col items-center justify-center gap-1"
           >
            <X size={16} /> Cerrar
           </button>        
        </div>
      </div>
    </aside>
  );
}
