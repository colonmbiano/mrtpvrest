"use client";
import React, { useEffect, useState } from "react";
import { Plus, Trash2, ShoppingCart, User, UtensilsCrossed, X, MapPin } from "lucide-react";
import TicketLine from "@/components/pos/TicketLine";
import PaymentModal from "@/components/pos/PaymentModal";
import TablePickerModal, { type TableLite } from "@/components/pos/TablePickerModal";
import { useTicketStore } from "@/store/ticketStore";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  printKitchenTickets,
  printCustomerReceipt,
  type PrinterRecord,
  type TicketItem,
} from "@/lib/printer-tcp";

interface Props {
  onOpenShift?: () => void;
  isShiftOpen?: boolean;
}

export default function SidebarTicket({ onOpenShift, isShiftOpen = true }: Props) {
  const [showPayment, setShowPayment] = useState(false);
  const [showTables, setShowTables] = useState(false);
  const [processing, setProcessing] = useState(false);
  const {
    tickets,
    activeIndex,
    getActiveTicket,
    addTicket,
    setActiveIndex,
    closeTicket,
    changeItemQty,
    clearActiveItems,
    updateTicket,
  } = useTicketStore();
  
  const ticket = getActiveTicket();

  const subtotal = ticket.items.reduce((acc, item) => acc + item.subtotal, 0);
  const total = subtotal - ticket.discount;

  // Cache de impresoras de la sucursal. Se carga una vez al montar y se
  // refresca cuando llega evento `printers-changed` (ej. tras agregar
  // una impresora desde admin). La lista vive en memoria del componente
  // para que el handler de cobro la lea sin esperar fetch de red.
  const [printers, setPrinters] = useState<PrinterRecord[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get<PrinterRecord[]>("/api/printers");
        if (!cancelled) setPrinters(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setPrinters([]);
      }
    };
    load();
    const onRefresh = () => load();
    window.addEventListener("printers-changed", onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener("printers-changed", onRefresh);
    };
  }, []);

  // Convierte CartItem[] del store al shape genérico de printer-tcp.
  const buildTicketItems = (): TicketItem[] =>
    ticket.items.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      price: it.price,
      notes: it.notes,
      modifiers: (it.modifiers || []).map((m) => ({ name: m.name, priceAdd: m.priceAdd })),
    }));

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

      const { data: order } = await api.post("/api/orders/tpv", orderData);
      toast.success("Pedido enviado a cocina");
      // Capturar items ANTES de limpiar el ticket activo.
      const printItems = buildTicketItems();
      const ticketContext = {
        orderNumber: order?.orderNumber ?? null,
        orderType:   ticket.type ?? null,
        tableNumber: ticket.tableNumber ?? null,
        customerName: ticket.name ?? null,
      };
      clearActiveItems();
      // Fire-and-forget: imprimir comanda en KITCHEN/BAR. La impresión
      // NO debe bloquear ni revertir la orden si la impresora falla.
      printKitchenTickets(printers, { ...ticketContext, items: printItems })
        .then((res) => {
          if (res.failed.length > 0) {
            toast.warning(`Comanda: ${res.ok} ok / ${res.failed.length} fallaron`);
          }
        })
        .catch(() => { /* tragar error silenciosamente */ });
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
      // Capturar contexto antes de limpiar el ticket activo.
      const printItems = buildTicketItems();
      const ticketContext = {
        orderNumber: order?.orderNumber ?? null,
        orderType:   ticket.type ?? null,
        tableNumber: ticket.tableNumber ?? null,
        customerName: ticket.name ?? null,
        customerPhone: ticket.phone ?? null,
      };
      const totals = {
        subtotal,
        discount: ticket.discount,
        total,
        paymentMethod: method,
      };
      clearActiveItems();
      setShowPayment(false);

      // Fire-and-forget: comanda en KITCHEN/BAR + recibo en CASHIER.
      // No bloquea cobro si las impresoras fallan.
      printKitchenTickets(printers, { ...ticketContext, items: printItems })
        .catch(() => { /* silencio */ });
      printCustomerReceipt(printers, {
        ...ticketContext,
        ...totals,
        items: printItems,
      })
        .then((res) => {
          if (res.ok === 0 && res.failed.length > 0) {
            toast.warning("Recibo: ninguna impresora respondió");
          }
        })
        .catch(() => { /* silencio */ });
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
    <aside className="w-full md:w-[380px] md:shrink-0 border-l border-white/5 bg-[#0a0a0c] flex flex-col h-full min-h-0 relative z-20">
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

        {/* Asignación de mesa — solo aplica a DINE_IN */}
        {ticket.type === "DINE_IN" && (
          <button
            type="button"
            onClick={() => setShowTables(true)}
            className="flex items-center gap-3 px-4 py-3 min-h-[56px] rounded-2xl bg-[#121316] border border-white/5 active:scale-95 transition-transform text-left"
            style={{
              borderColor: ticket.tableId ? "rgba(136,214,108,0.35)" : "rgba(255,255,255,0.06)",
            }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{
                   background: ticket.tableId ? "rgba(136,214,108,0.15)" : "rgba(255,184,77,0.10)",
                   color: ticket.tableId ? "#88D66C" : "#ffb84d",
                 }}>
              <MapPin size={18} />
            </div>
            <div className="flex flex-col items-start min-w-0 flex-1">
              {ticket.tableId ? (
                <>
                  <span className="text-[10px] font-black tracking-[0.2em] uppercase text-emerald-400">
                    Mesa asignada
                  </span>
                  <span className="text-sm font-black text-white tracking-tight truncate w-full">
                    {ticket.tableName || ticket.table || "Mesa"}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[10px] font-black tracking-[0.2em] uppercase text-amber-500">
                    Sin mesa
                  </span>
                  <span className="text-sm font-bold text-white/85 tracking-tight">
                    Asignar mesa
                  </span>
                </>
              )}
            </div>
            {ticket.tableId && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updateTicket({ tableId: "", tableName: "", table: "" });
                }}
                className="px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest text-zinc-400 bg-white/5 border border-white/10 active:scale-95 transition-transform"
              >
                Cambiar
              </span>
            )}
          </button>
        )}
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

        <TablePickerModal
          isOpen={showTables}
          onClose={() => setShowTables(false)}
          onPick={(t: TableLite) => {
            updateTicket({ tableId: t.id, tableName: t.name, table: t.name });
            setShowTables(false);
            toast.success(`Mesa ${t.name} asignada`);
          }}
        />
      </div>
    </aside>
  );
}
