"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, ShoppingCart, User, UtensilsCrossed, X, MapPin, Phone, Home } from "lucide-react";
import TicketLine from "@/components/pos/TicketLine";
import PaymentModal, { type PaymentTip } from "@/components/pos/PaymentModal";
import TablePickerModal, { type TableLite } from "@/components/pos/TablePickerModal";
import DiscountModal from "@/components/pos/DiscountModal";
import { useAuthStore } from "@/store/authStore";
import { useTicketStore } from "@/store/ticketStore";
import { useActiveOrderStore } from "@/store/activeOrderStore";
import { useTpvConfig } from "@/hooks/useTpvConfig";
import { useKitchenConfig } from "@/hooks/usePrinters";
import { useClientValue, subscribeToEvents } from "@/hooks/useClientValue";
import { hapticMedium, hapticSuccess, hapticError } from "@/lib/haptics";
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
  const [showDiscount, setShowDiscount] = useState(false);
  const [processing, setProcessing] = useState(false);
  // Ancho del panel: localStorage como fuente de verdad, SSR-safe vía
  // useSyncExternalStore. Se reajusta con el evento `sidebar-width-changed`
  // que dispara ConfigMenu/apariencia tras escribir.
  const sidebarWidthPx = useClientValue(
    readSidebarWidth,
    380,
    subscribeToEvents("sidebar-width-changed", "storage"),
  );

  // Permiso para aplicar descuento sin PIN. WAITER/CASHIER no tienen
  // `apply_discount` por default; admin/manager sí. Si el rol actual no
  // tiene el permiso, el modal pide autorización vía ManagerOverride.
  const employee = useAuthStore((s) => s.employee);
  const canApplyDiscount =
    !!employee?.permissions?.includes("apply_discount");

  const { activeOrderId, setActiveOrder, clear: clearActiveOrder } = useActiveOrderStore();

  const [previousItems, setPreviousItems] = useState<any[]>([]);
  const [_loadingHistory, setLoadingHistory] = useState(false);

  // Cargar historial de la orden si estamos en modo "extender"
  useEffect(() => {
    if (!activeOrderId) {
      setPreviousItems([]);
      return;
    }

    const fetchHistory = async () => {
      try {
        setLoadingHistory(true);
        const { data } = await api.get(`/api/orders/${activeOrderId}`);
        // Combinamos todos los items de todas las rondas para mostrarlos como historial
        setPreviousItems(data.items || []);
      } catch (err) {
        console.error("Error al cargar historial de orden:", err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [activeOrderId]);

  // Sugerencias de propina vienen de la config remota (tpvConfig.extra) si
  // están presentes; caso contrario default [10,15,20] por consistencia
  // con el printer service y el schema de Restaurant.
  const tpvConfig = useTpvConfig();
  const tipSuggestions = useMemo<number[]>(() => {
    const raw = (tpvConfig?.extra as Record<string, unknown> | undefined)?.tipSuggestions;
    if (Array.isArray(raw)) {
      const nums = raw
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= 50);
      if (nums.length > 0) return nums;
    }
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const nums = parsed
            .map((n: unknown) => Number(n))
            .filter((n: number) => Number.isFinite(n) && n > 0 && n <= 50);
          if (nums.length > 0) return nums;
        }
      } catch { /* ignore */ }
    }
    return [10, 15, 20];
  }, [tpvConfig]);

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
    setItemNotes,
  } = useTicketStore();
  
  const ticket = getActiveTicket();

  const historySubtotal = useMemo(() => 
    previousItems.reduce((acc, item) => acc + (item.price * item.quantity), 0),
  [previousItems]);

  const currentSubtotal = ticket.items.reduce((acc, item) => acc + item.subtotal, 0);
  const subtotal = currentSubtotal + historySubtotal;
  const total = subtotal - ticket.discount;

  // Config de comanda — header/footer/toggles cargados desde admin.
  // Se pasa al builder en cada printKitchenTickets; si aún no terminó
  // de cargar, el builder usa los defaults históricos.
  const { kitchenConfig } = useKitchenConfig();

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
      hapticError();
      return;
    }
    hapticMedium();

    try {
      const itemsPayload = ticket.items.map(item => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        notes: item.notes || "",
        seatNumber: item.seatNumber ?? null,
        modifiers: (item.modifiers || []).map(m => ({ modifierId: m.id })),
      }));

      let order;
      if (activeOrderId) {
        // Mesa ya tiene orden abierta — agregar ronda.
        const { data } = await api.post(`/api/orders/${activeOrderId}/items`, { items: itemsPayload });
        order = data;
        // Sincronizar historial local
        setPreviousItems(data.items || []);
      } else {
        // Orden nueva (o el backend redirigirá si la mesa está OCCUPIED).
        const orderData = {
          orderType: ticket.type,
          items: itemsPayload,
          tableId: ticket.tableId || null,
          numberOfGuests: ticket.numberOfGuests ?? null,
          customerName: ticket.name || "Publico General",
          customerPhone: ticket.phone || null,
          subtotal: currentSubtotal,
          discount: ticket.discount,
          total: currentSubtotal - ticket.discount,
        };
        const { data } = await api.post("/api/orders/tpv", orderData);
        order = data;
        // Guardar el id para que la siguiente ronda ya conozca la orden.
        if (order?.id && ticket.tableId) {
          setActiveOrder(order.id, ticket.tableId, order.orderNumber ?? null);
        }
        setPreviousItems(data.items || []);
      }

      toast.success("Pedido enviado a cocina");
      const printItems = buildTicketItems();
      const ticketContext = {
        orderNumber: order?.orderNumber ?? null,
        orderType:   ticket.type ?? null,
        tableNumber: ticket.tableNumber ?? null,
        customerName: ticket.name ?? null,
      };
      clearActiveItems();
      printKitchenTickets(printers, { ...ticketContext, items: printItems, config: kitchenConfig ?? undefined })
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

  const handleProcessPayment = async (
    method: string,
    tip?: PaymentTip,
    driverId?: string | null,
  ) => {
    if (ticket.items.length === 0 && previousItems.length === 0) return;
    setProcessing(true);
    try {
      const tipAmount = tip?.amount ?? 0;
      const itemsPayload = ticket.items.map(item => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        notes: item.notes || "",
        seatNumber: item.seatNumber ?? null,
        modifiers: (item.modifiers || []).map(m => ({ modifierId: m.id })),
      }));

      let order;
      if (activeOrderId) {
        // 1. Si hay items en la "Nueva ronda", primero los enviamos al backend
        if (itemsPayload.length > 0) {
          const { data } = await api.post(`/api/orders/${activeOrderId}/items`, { items: itemsPayload });
          order = data;
        } else {
          const { data } = await api.get(`/api/orders/${activeOrderId}`);
          order = data;
        }
      } else {
        // 2. Si no hay activeOrderId, creamos la orden completa normalmente
        const orderData = {
          orderType: ticket.type,
          items: itemsPayload,
          tableId: ticket.tableId || null,
          numberOfGuests: ticket.numberOfGuests ?? null,
          customerName: ticket.name || "Publico General",
          customerPhone: ticket.phone || null,
          deliveryAddress: ticket.type === "DELIVERY" ? (ticket.address || null) : null,
          subtotal,
          discount: ticket.discount,
          total: total + tipAmount,
          paymentMethod: method,
          status: "DELIVERED",
          notes: tip && tip.percent > 0
            ? `Propina ${tip.percent}% ($${tipAmount.toFixed(2)})`
            : undefined,
        };
        const { data } = await api.post("/api/orders/tpv", orderData);
        order = data;
      }

      // 3. Procesar el pago de la orden (sea nueva o recuperada)
      await api.put(`/api/orders/${order.id}/payment`, { paymentMethod: method });

      // BUG-24: asignar repartidor inmediatamente después del cobro DELIVERY.
      if (ticket.type === "DELIVERY" && driverId) {
        try {
          await api.put("/api/delivery/assign", { orderId: order.id, driverId });
        } catch (assignErr: any) {
          toast.warning(
            "Cobro OK, pero falló asignar repartidor: " +
            (assignErr?.response?.data?.error || assignErr?.message || "Error desconocido"),
          );
        }
      }

      toast.success("Cobro procesado");
      hapticSuccess();
      
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
        total: total + tipAmount,
        paymentMethod: method,
        tipPercent: tip?.percent ?? 0,
        tipAmount,
      };

      // Limpieza post-pago
      clearActiveItems();
      clearActiveOrder();
      setPreviousItems([]);
      
      if (ticket.type === "DELIVERY") {
        useTicketStore.getState().updateTicket({ name: "", address: "", phone: "" });
      }
      setShowPayment(false);

      // Impresión de comanda (solo si había items nuevos)
      if (printItems.length > 0) {
        printKitchenTickets(printers, { ...ticketContext, items: printItems, config: kitchenConfig ?? undefined })
          .catch(() => { /* silencio */ });
      }

      // Impresión de recibo de cliente (el total completo)
      const guests = ticket.numberOfGuests ?? 0;
      const isDineInSplit = ticket.type === "DINE_IN" && guests >= 2;
      if (isDineInSplit) {
        printSplitReceipts(
          printers,
          { ...ticketContext, ...totals, items: orderItemsToTicketItems(order.items) },
          guests,
        ).catch(() => {});
      } else {
        printCustomerReceipt(printers, {
          ...ticketContext,
          ...totals,
          items: orderItemsToTicketItems(order.items),
        }).catch(() => {});
      }
    } catch (error: any) {
      toast.error("Error al cobrar: " + (error.response?.data?.error || error.message));
    } finally {
      setProcessing(false);
    }
  };

  // Helper para convertir items de la orden del backend al formato de ticket
  const orderItemsToTicketItems = (items: any[]): TicketItem[] => {
    return items.map(it => ({
      name: it.menuItem?.name || it.name,
      quantity: it.quantity,
      price: it.price,
      notes: it.notes,
      seatNumber: it.seatNumber ?? null,
      modifiers: (it.modifiers || []).map((m: any) => ({ name: m.name || m.modifier?.name, priceAdd: m.priceAdd || m.modifier?.priceAdd })),
    }));
  };

  const handleOpenPayment = () => {
    if (ticket.items.length === 0 && previousItems.length === 0) {
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

        {/* BUG-24: campos requeridos para DELIVERY. Sin dirección no hay
            ruta para el repartidor; sin teléfono no puede llamar al cliente
            al llegar. El cajero ve los campos desde el inicio del ticket. */}
        {ticket.type === "DELIVERY" && (
          <div className="flex flex-col gap-3">
            <div className="flex-1 bg-[#121316] border border-white/5 rounded-2xl h-14 flex items-center px-5 gap-4 focus-within:border-amber-500/50 transition-all">
              <Home size={18} className="text-zinc-600" />
              <input
                placeholder="Dirección de entrega..."
                className="bg-transparent border-none outline-none text-sm font-bold text-white w-full placeholder:text-zinc-600 placeholder:font-bold tracking-tight"
                value={ticket.address || ""}
                onChange={(e) => useTicketStore.getState().updateTicket({ address: e.target.value })}
              />
              {/* BUG-26: ocultar badge cuando el campo ya tiene valor (trim).
                  Antes el badge REQ permanecía aunque el cajero llenara el dato. */}
              {!ticket.address?.trim() && (
                <span className="text-[9px] font-black tracking-[0.2em] uppercase text-amber-500/70">
                  Req
                </span>
              )}
            </div>
            <div className="flex-1 bg-[#121316] border border-white/5 rounded-2xl h-14 flex items-center px-5 gap-4 focus-within:border-amber-500/50 transition-all">
              <Phone size={18} className="text-zinc-600" />
              <input
                placeholder="Teléfono del cliente..."
                inputMode="tel"
                className="bg-transparent border-none outline-none text-sm font-bold text-white w-full placeholder:text-zinc-600 placeholder:font-bold tracking-tight tabular-nums"
                value={ticket.phone || ""}
                onChange={(e) => useTicketStore.getState().updateTicket({ phone: e.target.value })}
              />
              {!ticket.phone?.trim() && (
                <span className="text-[9px] font-black tracking-[0.2em] uppercase text-amber-500/70">
                  Req
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* LISTA DE ITEMS */}
      <div className="flex-1 min-h-0 scroll-y px-8 space-y-5 py-4 bg-[#0a0a0c] scrollbar-hide">
        {/* Historial de rondas anteriores si existe activeOrderId */}
        {previousItems.length > 0 && (
          <div className="space-y-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="h-[1px] flex-1 bg-white/5" />
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">
                Rondas anteriores
              </span>
              <div className="h-[1px] flex-1 bg-white/5" />
            </div>
            <div className="opacity-50 pointer-events-none space-y-4">
              {previousItems.map((item, idx) => (
                <TicketLine
                  key={`prev-${item.id}-${idx}`}
                  name={item.menuItem?.name || item.name}
                  quantity={item.quantity}
                  price={item.price}
                  notes={item.notes}
                  modifiers={item.modifiers?.map((m: any) => ({ 
                    name: m.modifier?.name || m.name, 
                    priceAdd: m.modifier?.priceAdd || m.priceAdd 
                  }))}
                  onIncrease={() => {}}
                  onDecrease={() => {}}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="h-[1px] flex-1 bg-amber-500/20" />
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-500/50">
                Nueva ronda
              </span>
              <div className="h-[1px] flex-1 bg-amber-500/20" />
            </div>
          </div>
        )}

        {ticket.items.length === 0 && previousItems.length === 0 ? (
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
              notes={item.notes}
              modifiers={item.modifiers?.map(m => ({ name: m.name, priceAdd: m.priceAdd }))}
              onIncrease={() => changeItemQty(idx, 1)}
              onDecrease={() => changeItemQty(idx, -1)}
              onUpdateNotes={(n) => setItemNotes(idx, n)}
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
              disabled={
                processing ||
                (ticket.items.length === 0 && previousItems.length === 0) ||
                (ticket.type === "DELIVERY" &&
                  isShiftOpen &&
                  (!ticket.address?.trim() || !ticket.phone?.trim())) ||
                // BUG-25: simétrico al fix de Domicilio. EN MESA no debe poder
                // cobrar sin mesa asignada (antes el botón quedaba enabled y
                // el ticket mostraba "SIN MESA ASIGNADA").
                (ticket.type === "DINE_IN" && isShiftOpen && !ticket.tableId)
              }
              title={
                ticket.type === "DELIVERY" && isShiftOpen
                  ? !ticket.address?.trim() && !ticket.phone?.trim()
                    ? "Falta dirección y teléfono del cliente"
                    : !ticket.address?.trim()
                      ? "Falta dirección de entrega"
                      : !ticket.phone?.trim()
                        ? "Falta teléfono del cliente"
                        : undefined
                  : ticket.type === "DINE_IN" && isShiftOpen && !ticket.tableId
                    ? "Asigna una mesa antes de cobrar"
                    : undefined
              }
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
               onClick={() => {
                 if (ticket.items.length === 0) {
                   toast.error("Agrega items antes de aplicar descuento");
                   return;
                 }
                 setShowDiscount(true);
               }}
               className="h-12 rounded-xl bg-[#1a1b1f] border border-white/5 text-[10px] font-black uppercase tracking-[0.15em] text-zinc-400 active:text-white active:bg-zinc-800 transition-all active:scale-95 flex flex-col items-center justify-center gap-0.5"
             >
               <span className="text-sm leading-none font-black">
                 {ticket.discount > 0 ? "✓" : "%"}
               </span>
               {ticket.discount > 0
                 ? `−$${ticket.discount.toFixed(0)}`
                 : "Descuento"}
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
          orderType={ticket.type}
          total={total}
          discount={ticket.discount}
          tipSuggestions={tipSuggestions}
          items={[
            ...previousItems.map((i) => ({
              name: i.menuItem?.name || i.name,
              quantity: i.quantity,
              subtotal: i.price * i.quantity,
              seatNumber: i.seatNumber ?? null,
            })),
            ...ticket.items.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              subtotal: i.subtotal,
              seatNumber: i.seatNumber ?? null,
            })),
          ]}
          onConfirm={handleProcessPayment}
        />

        <TablePickerModal
          isOpen={showTables}
          onClose={() => setShowTables(false)}
          onPick={async (t: TableLite) => {
            updateTicket({ tableId: t.id, tableName: t.name, table: t.name });
            setShowTables(false);

            if (t.status === "OCCUPIED") {
              // Buscar la orden abierta de esta mesa para agregar rondas.
              try {
                const { data: orders } = await api.get<{ id: string; orderNumber: string; status: string }[]>(
                  `/api/orders/table/${t.id}/open`
                );
                const openOrder = Array.isArray(orders) ? orders[0] : null;
                if (openOrder?.id) {
                  setActiveOrder(openOrder.id, t.id, openOrder.orderNumber ?? null);
                  toast.success(`Mesa ${t.name} — añadiendo ronda al Ticket ${openOrder.orderNumber ?? openOrder.id.slice(-4)}`);
                  return;
                }
              } catch {
                // Si falla el lookup, el backend igual lo maneja.
              }
              toast.success(`Mesa ${t.name} asignada (orden en curso)`);
            } else {
              clearActiveOrder();
              toast.success(`Mesa ${t.name} asignada`);
            }
          }}
        />

        <DiscountModal
          isOpen={showDiscount}
          onClose={() => setShowDiscount(false)}
          subtotal={subtotal}
          requiresOverride={!canApplyDiscount}
          onApply={(type, value) => {
            const amount = type === "percent" ? subtotal * (value / 100) : value;
            updateTicket({ discount: amount, discountType: type });
            toast.success(
              `Descuento aplicado: $${amount.toFixed(2)}${
                type === "percent" ? ` (${value}%)` : ""
              }`,
            );
          }}
        />
      </div>
    </aside>
  );
}
