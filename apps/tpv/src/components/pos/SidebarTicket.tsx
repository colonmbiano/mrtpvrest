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
  printSplitReceipts,
  type PrinterRecord,
  type TicketItem,
} from "@/lib/printer-tcp";

interface Props {
  onOpenShift?: () => void;
  isShiftOpen?: boolean;
  /** Fase 6: cuando un mesero usa la tablet principal en modo préstamo,
   *  el CTA primario cambia de "Cobrar Ticket" a "Enviar a cocina" y se
   *  oculta el flujo de PaymentModal. */
  isLoanMode?: boolean;
}

// Map de presets a px para el ancho del sidebar. El user lo cambia
// desde ConfigMenu (POS); persistido en localStorage.sidebarWidth.
const SIDEBAR_WIDTHS: Record<string, number> = { S: 320, M: 380, L: 440 };
function readSidebarWidth(): number {
  if (typeof window === "undefined") return 380;
  const v = localStorage.getItem("sidebarWidth");
  if (!v) return 380;
  return SIDEBAR_WIDTHS[v] ?? 380;
}

export default function SidebarTicket({ onOpenShift, isShiftOpen = true, isLoanMode = false }: Props) {
  const [showPayment, setShowPayment] = useState(false);
  const [showTables, setShowTables] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [sidebarWidthPx, setSidebarWidthPx] = useState<number>(380);

  // Aplica preset del localStorage al montar y escucha cambios desde
  // ConfigMenu (que dispara `sidebar-width-changed` después de write).
  useEffect(() => {
    setSidebarWidthPx(readSidebarWidth());
    const onChange = () => setSidebarWidthPx(readSidebarWidth());
    window.addEventListener("sidebar-width-changed", onChange);
    return () => window.removeEventListener("sidebar-width-changed", onChange);
  }, []);
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
        // Backend devuelve printerGroups: [{ printerGroup: { id, name } }]
        // y necesitamos derivar printerGroupIds: string[] que es lo que
        // el dispatcher consume para enrutar comandas.
        type RawPrinter = PrinterRecord & {
          printerGroups?: Array<{ printerGroup?: { id: string } }>;
        };
        const { data } = await api.get<RawPrinter[]>("/api/printers");
        if (!Array.isArray(data) || cancelled) {
          if (!cancelled) setPrinters([]);
          return;
        }
        const normalized: PrinterRecord[] = data.map((p) => ({
          ...p,
          printerGroupIds: (p.printerGroups ?? [])
            .map((m) => m.printerGroup?.id)
            .filter((id): id is string => Boolean(id)),
        }));
        setPrinters(normalized);
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
  // Conserva seatNumber para el split por comensal en la impresión y
  // resuelve printerGroupIds — override item-level si existe, default
  // heredado de la categoría si no. El dispatcher usa este array para
  // enrutar la comanda a las impresoras correctas.
  const buildTicketItems = (): TicketItem[] =>
    ticket.items.map((it) => {
      const raw = it as unknown as {
        printerGroups?: Array<{ printerGroup?: { id: string } }>;
        category?: { printerGroups?: Array<{ printerGroup?: { id: string } }> };
      };
      const itemOverride = (raw.printerGroups ?? [])
        .map((m) => m.printerGroup?.id)
        .filter((id): id is string => Boolean(id));
      const categoryDefault = (raw.category?.printerGroups ?? [])
        .map((m) => m.printerGroup?.id)
        .filter((id): id is string => Boolean(id));
      const printerGroupIds = itemOverride.length > 0 ? itemOverride : categoryDefault;
      return {
        name: it.name,
        quantity: it.quantity,
        price: it.price,
        notes: it.notes,
        seatNumber: it.seatNumber ?? null,
        printerGroupIds,
        modifiers: (it.modifiers || []).map((m) => ({ name: m.name, priceAdd: m.priceAdd })),
      };
    });

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
          seatNumber: item.seatNumber ?? null,
          modifiers: (item.modifiers || []).map(m => ({ modifierId: m.id })),
        })),
        tableId: ticket.tableId || null,
        numberOfGuests: ticket.numberOfGuests ?? null,
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
          seatNumber: item.seatNumber ?? null,
          modifiers: (item.modifiers || []).map(m => ({ modifierId: m.id })),
        })),
        tableId: ticket.tableId || null,
        numberOfGuests: ticket.numberOfGuests ?? null,
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

      const guests = ticket.numberOfGuests ?? 0;
      const isDineInSplit = ticket.type === "DINE_IN" && guests >= 2;
      if (isDineInSplit) {
        // N tickets separados, uno por comensal.
        printSplitReceipts(
          printers,
          { ...ticketContext, ...totals, items: printItems },
          guests,
        )
          .then((res) => {
            if (res.tickets === 0) {
              toast.warning("Recibos divididos: ninguna impresora respondió");
            } else {
              toast.success(`Tickets divididos impresos: ${res.tickets}/${guests}`);
            }
          })
          .catch(() => { /* silencio */ });
      } else {
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
      }
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
    <aside
      className="w-full md:shrink-0 border-l border-white/5 bg-[#0a0a0c] flex flex-col h-full min-h-0 relative z-20"
      style={{ width: sidebarWidthPx }}
    >
      {/* TABS DE TICKETS — chip por ticket muestra "Ticket N · MesaX"
          cuando aplica. El icono MapPin a la derecha del chip activo
          abre TablePickerModal sin entrar en conflicto con el tap del
          chip (que solo cambia tab activo). */}
      <div className="flex h-16 bg-[#121316] border-b border-white/5 overflow-hidden shrink-0">
        <div className="flex-1 flex scroll-x scrollbar-hide min-w-0 items-stretch">
          {tickets.map((t, idx) => {
            const isActive = idx === activeIndex;
            const isDineIn = t.type === "DINE_IN";
            const tableLabel = t.tableName || t.table;
            return (
              <div
                key={t.id}
                className={`flex items-stretch border-r border-white/5 relative shrink-0 ${isActive ? "bg-[#0a0a0c]" : ""}`}
              >
                <button
                  onClick={() => setActiveIndex(idx)}
                  className={`px-5 h-full flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all ${isActive ? "text-amber-500" : "text-zinc-500"}`}
                >
                  <span>Ticket {idx + 1}</span>
                  {isDineIn && tableLabel && (
                    <>
                      <span className={isActive ? "text-amber-500/40" : "text-zinc-600"}>·</span>
                      <span className={isActive ? "text-emerald-400" : "text-zinc-400"}>
                        {tableLabel}
                      </span>
                    </>
                  )}
                </button>
                {isActive && isDineIn && (
                  <button
                    type="button"
                    onClick={() => setShowTables(true)}
                    title={tableLabel ? "Cambiar mesa" : "Asignar mesa"}
                    aria-label={tableLabel ? "Cambiar mesa" : "Asignar mesa"}
                    className="px-3 h-full flex items-center justify-center text-emerald-400 active:scale-90 transition-transform"
                  >
                    <MapPin size={16} />
                  </button>
                )}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500 rounded-t-full shadow-[0_0_10px_rgba(255,184,77,0.5)]" />
                )}
              </div>
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

      {/* HEADER DEL TICKET — nombre cliente solo para TAKEOUT/DELIVERY,
          DINE_IN no necesita ese campo (la mesa identifica el ticket). */}
      <div className="p-6 pb-4 flex flex-col gap-4 shrink-0 bg-[#0a0a0c]">
        <div className="flex justify-between items-center">
          <h2 className="text-[11px] font-black text-zinc-500 tracking-[0.2em] uppercase">Orden en curso</h2>
          <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
            ID: {String(ticket.id).slice(-4)}
          </span>
        </div>

        <div className="flex gap-3">
          {ticket.type !== "DINE_IN" ? (
            <div className="flex-1 min-w-0 bg-[#121316] border border-white/5 rounded-2xl h-14 flex items-center px-5 gap-4 focus-within:border-amber-500/50 transition-all">
              <User size={18} className="text-zinc-600" />
              <input
                placeholder="Nombre del cliente..."
                className="bg-transparent border-none outline-none text-sm font-bold text-white w-full placeholder:text-zinc-600 placeholder:font-bold tracking-tight"
                value={ticket.name || ""}
                onChange={(e) => useTicketStore.getState().updateTicket({ name: e.target.value })}
              />
            </div>
          ) : (
            <div className="flex-1 min-w-0 h-14 flex items-center px-2 gap-3 text-zinc-500">
              <MapPin size={18} className="text-emerald-400/70" />
              <span className="text-xs font-black uppercase tracking-[0.2em]">
                {ticket.tableName || ticket.table || "Sin mesa asignada"}
              </span>
              {(ticket.numberOfGuests ?? 0) > 0 && (
                <span className="text-[10px] font-bold text-zinc-500">
                  · {ticket.numberOfGuests} comensal{(ticket.numberOfGuests ?? 0) > 1 ? "es" : ""}
                </span>
              )}
            </div>
          )}
          <button
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border border-white/5 bg-[#121316] text-zinc-600 active:bg-red-500/10 active:text-red-500 active:border-red-500/20 transition-all active:scale-95"
            onClick={clearActiveItems}
            aria-label="Limpiar ticket"
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

      {/* FOOTER DEL TICKET — sin bloque de precio. El total se ve en
          PaymentModal al cobrar. Solo botones de acción. */}
      <div className="p-6 bg-[#121316] border-t border-white/5 mt-auto shrink-0 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/5 blur-[60px] rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-3">
          {isLoanMode ? (
            // Modo préstamo (mesero en tablet de caja): CTA primario manda
            // a cocina sin pasar por el flujo de cobro.
            <button
              onClick={handleSendToKitchen}
              disabled={processing || ticket.items.length === 0}
              className="w-full h-16 rounded-2xl text-sm font-black tracking-[0.15em] uppercase flex items-center justify-center gap-2 transition-all active:scale-[0.97] shadow-xl disabled:opacity-20 disabled:grayscale bg-amber-500 text-black shadow-[0_8px_32px_-10px_rgba(255,184,77,0.4)]"
            >
              <UtensilsCrossed size={16} strokeWidth={2.5} />
              {processing ? "Enviando..." : "Enviar a cocina"}
            </button>
          ) : (
            <button
              onClick={isShiftOpen ? handleOpenPayment : onOpenShift}
              disabled={processing || ticket.items.length === 0}
              className={`w-full h-16 rounded-2xl text-sm font-black tracking-[0.15em] uppercase flex items-center justify-center gap-2 transition-all active:scale-[0.97] shadow-xl disabled:opacity-20 disabled:grayscale ${
                isShiftOpen
                  ? "bg-amber-500 text-black shadow-[0_8px_32px_-10px_rgba(255,184,77,0.4)]"
                  : "bg-red-500 text-white shadow-[0_8px_32px_-10px_rgba(239,68,68,0.4)]"
              }`}
            >
              {processing ? "Cargando..." : isShiftOpen ? "Cobrar Ticket" : "Abrir Turno"}
            </button>
          )}

          <div className="grid grid-cols-3 gap-2">
             <button
               onClick={handleSendToKitchen}
               className="h-12 rounded-xl bg-[#1a1b1f] border border-white/5 text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400 active:text-white active:bg-zinc-800 transition-all active:scale-95 flex flex-col items-center justify-center gap-0.5"
             >
               <UtensilsCrossed size={14} /> Cocina
             </button>
             <button
               className="h-12 rounded-xl bg-[#1a1b1f] border border-white/5 text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400 active:text-white active:bg-zinc-800 transition-all active:scale-95 flex flex-col items-center justify-center gap-0.5"
             >
               <span className="text-sm leading-none font-black">%</span> Descuento
             </button>
             <button
              onClick={() => closeTicket(activeIndex)}
              className="h-12 rounded-xl bg-[#1a1b1f] border border-white/5 text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600 active:text-red-400 active:bg-red-500/5 transition-all active:scale-95 flex flex-col items-center justify-center gap-0.5"
             >
              <X size={14} /> Cerrar
             </button>
          </div>
        </div>

        <PaymentModal
          isOpen={showPayment && !isLoanMode}
          onClose={() => setShowPayment(false)}
          orderNumber={String(ticket.id)}
          total={total}
          discount={ticket.discount}
          items={ticket.items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            subtotal: i.subtotal,
            seatNumber: i.seatNumber ?? null,
          }))}
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
