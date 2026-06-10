"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ShoppingCart, User, UtensilsCrossed, MapPin, Phone, Home, Receipt, Save, Zap } from "lucide-react";
import TicketLine from "@/components/pos/TicketLine";
import PaymentModal, { type PaymentTip } from "@/components/pos/PaymentModal";
import TablePickerModal, { type TableLite } from "@/components/pos/TablePickerModal";
import DiscountModal from "@/components/pos/DiscountModal";
import OrderTypeToggle from "@/components/pos/OrderTypeToggle";
import { COMPLEMENT_MODIFIER_PREFIX, VARIANT_MODIFIER_PREFIX } from "@/lib/modifiers";
import { useAuthStore } from "@/store/authStore";
import { useTicketStore } from "@/store/ticketStore";
import { useActiveOrderStore } from "@/store/activeOrderStore";
import { useTpvConfig } from "@/hooks/useTpvConfig";
import { useKitchenConfig, usePrinters } from "@/hooks/usePrinters";
import { useDualScreen } from "@/hooks/useDualScreen";
import type { CartSnapshot } from "@/lib/dual-screen/channel";
import { hapticMedium, hapticSuccess, hapticError } from "@/lib/haptics";
import api from "@/lib/api";
import { apiOrQueue } from "@/lib/offline";
import { toast } from "sonner";
import {
  printKitchenTickets,
  printCustomerReceipt,
  printSplitReceipts,
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

// IVA estándar MX (16%). Se muestra desglosado del subtotal (precio
// con IVA incluido) para que el cajero/contabilidad vea el componente
// fiscal. No altera el cálculo del total que se cobra.
const IVA_RATE = 0.16;

export default function SidebarTicket({ onOpenShift, isShiftOpen = true, isLoanMode = false }: Props) {
  const router = useRouter();
  const [showPayment, setShowPayment] = useState(false);
  const [showTables, setShowTables] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Permiso para aplicar descuento sin PIN. WAITER/CASHIER no tienen
  // `apply_discount` por default; admin/manager sí. Si el rol actual no
  // tiene el permiso, el modal pide autorización vía ManagerOverride.
  const employee = useAuthStore((s) => s.employee);
  const canApplyDiscount =
    !!employee?.permissions?.includes("apply_discount");

  const { activeOrderId, activeOrderNumber, setActiveOrder, clear: clearActiveOrder } = useActiveOrderStore();

  const [previousItems, setPreviousItems] = useState<any[]>([]);
  const [_loadingHistory, setLoadingHistory] = useState(false);

  // Cargar historial de la orden si estamos en modo "extender". Diferido
  // a microtask (ver impresoras): el setState ya no corre sincrónicamente
  // en el effect (set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!activeOrderId) {
        setPreviousItems([]);
        return;
      }
      (async () => {
        try {
          setLoadingHistory(true);
          const { data } = await api.get(`/api/orders/${activeOrderId}`);
          // Combinamos todos los items de todas las rondas como historial
          if (!cancelled) setPreviousItems(data.items || []);
        } catch (err) {
          console.error("Error al cargar historial de orden:", err);
        } finally {
          if (!cancelled) setLoadingHistory(false);
        }
      })();
    });
    return () => { cancelled = true; };
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
    getActiveTicket,
    changeItemQty,
    clearActiveItems,
    updateTicket,
    setItemNotes,
  } = useTicketStore();
  
  const ticket = getActiveTicket();
  const hasItems = ticket.items.length > 0;

  const historySubtotal = useMemo(() =>
    previousItems.reduce((acc, item) => acc + (item.price * item.quantity), 0),
  [previousItems]);

  const currentSubtotal = ticket.items.reduce((acc, item) => acc + item.subtotal, 0);
  const subtotal = currentSubtotal + historySubtotal;
  const total = subtotal - ticket.discount;
  // Desglose fiscal MX: precios mostrados llevan IVA incluido. Subtotal
  // sin IVA = subtotal / 1.16; IVA = diferencia.
  const subtotalSinIva = subtotal / (1 + IVA_RATE);
  const ivaAmount = subtotal - subtotalSinIva;

  // ── Doble pantalla (pantalla de cliente) ──────────────────────────────
  // Empuja el carrito en vivo al segundo monitor. No-op si está apagado.
  const dualScreen = useDualScreen();
  const justCompletedRef = React.useRef(false);

  const cartSnapshot = useMemo<CartSnapshot>(() => {
    const lines = [
      // Rondas previas (modo extender orden)
      ...previousItems.map((it, idx) => ({
        id: `prev-${it.id ?? idx}`,
        name: it.name as string,
        qty: it.quantity as number,
        unitPrice: it.price as number,
        total: (it.price as number) * (it.quantity as number),
        note: (it.notes as string) || undefined,
      })),
      // Ronda actual
      ...ticket.items.map((it, idx) => ({
        id: `cur-${it.menuItemId}-${idx}`,
        name: it.variantName ? `${it.name} (${it.variantName})` : it.name,
        qty: it.quantity,
        unitPrice: it.quantity > 0 ? it.subtotal / it.quantity : it.price,
        total: it.subtotal,
        note: it.notes || undefined,
      })),
    ];
    return {
      lines,
      subtotal,
      discount: ticket.discount,
      discountLabel: ticket.discount > 0 ? "Descuento" : undefined,
      total,
      currency: "MXN",
    };
  }, [previousItems, ticket.items, ticket.discount, subtotal, total]);

  useEffect(() => {
    if (!dualScreen.enabled) return;
    // Tras un cobro, ignorar el primer "carrito vacío" para que la pantalla
    // de gracias no desaparezca de inmediato (se mantiene hasta la próxima venta).
    if (cartSnapshot.lines.length === 0 && justCompletedRef.current) {
      justCompletedRef.current = false;
      return;
    }
    dualScreen.pushCart(cartSnapshot);
  }, [cartSnapshot, dualScreen]);

  // Config de comanda — header/footer/toggles cargados desde admin.
  // Se pasa al builder en cada printKitchenTickets; si aún no terminó
  // de cargar, el builder usa los defaults históricos.
  const { kitchenConfig } = useKitchenConfig();

  const { printers } = usePrinters();

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

  const buildItemsPayload = () =>
    ticket.items.map((item) => {
      const modifiers = item.modifiers || [];
      const complementIds = modifiers
        .map((m) =>
          m.id.startsWith(COMPLEMENT_MODIFIER_PREFIX)
            ? m.id.slice(COMPLEMENT_MODIFIER_PREFIX.length)
            : null
        )
        .filter((id): id is string => Boolean(id));
      const variantIds = modifiers
        .map((m) =>
          m.id.startsWith(VARIANT_MODIFIER_PREFIX)
            ? m.id.slice(VARIANT_MODIFIER_PREFIX.length)
            : null
        )
        .filter((id): id is string => Boolean(id));
      return {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        notes: item.notes || "",
        seatNumber: item.seatNumber ?? null,
        modifiers: modifiers
          .filter(
            (m) =>
              !m.id.startsWith(COMPLEMENT_MODIFIER_PREFIX) &&
              !m.id.startsWith(VARIANT_MODIFIER_PREFIX),
          )
          .map((m) => ({ modifierId: m.id })),
        complements: complementIds.map((complementId) => ({ complementId })),
        variants: variantIds.map((variantId) => ({ variantId })),
      };
    });

  const handleSendToKitchen = async () => {
    if (ticket.items.length === 0) {
      if (activeOrderId) {
        // Cuenta existente sin productos nuevos: no hay ronda que agregar.
        // Tratamos "Guardar" como "listo, sin cambios" y volvemos a la
        // pantalla de tipo de pedido.
        clearActiveItems();
        clearActiveOrder();
        setPreviousItems([]);
        updateTicket({
          tableId: "",
          tableName: "",
          table: "",
          numberOfGuests: null,
          activeSeat: null,
          name: "",
          address: "",
          phone: "",
          discount: 0,
        });
        router.replace("/pos/order-type");
        return;
      }
      toast.error("El ticket está vacío");
      hapticError();
      return;
    }
    hapticMedium();

    try {
      const itemsPayload = buildItemsPayload();

      let order;
      let queued = false;
      if (activeOrderId) {
        // Mesa ya tiene orden abierta — agregar ronda.
        const res = await apiOrQueue("order", "POST", `/api/orders/${activeOrderId}/items`, { items: itemsPayload });
        if (!res.ok) throw new Error(res.error || "fallo desconocido");
        queued = res.queued;
        order = res.data;
        // Sincronizar historial local
        if (!queued) setPreviousItems(order?.items || []);
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
        const res = await apiOrQueue("order", "POST", "/api/orders/tpv", orderData);
        if (!res.ok) throw new Error(res.error || "fallo desconocido");
        queued = res.queued;
        order = res.data;
        // Guardar el id para que la siguiente ronda ya conozca la orden.
        if (order?.id && ticket.tableId) {
          setActiveOrder(order.id, ticket.tableId, order.orderNumber ?? null);
        }
        if (!queued) setPreviousItems(order?.items || []);
      }

      toast.success(queued ? "Pedido en cola · se enviara al volver la red" : "Pedido enviado a cocina");
      const printItems = buildTicketItems();
      const ticketContext = {
        orderNumber: order?.orderNumber ?? null,
        orderType:   ticket.type ?? null,
        tableNumber: ticket.tableName || ticket.table || null,
        customerName: ticket.name ?? null,
      };

      try {
        const printResult = await printKitchenTickets(printers, {
          ...ticketContext,
          items: printItems,
          config: kitchenConfig ?? undefined,
        });
        if (printResult.failed.length > 0) {
          toast.warning(
            `Pedido guardado, pero la comanda no imprimio: ${
              printResult.failed[0]?.error || "No hay una impresora disponible"
            }`,
          );
        } else {
          toast.success(
            `Comanda impresa en ${printResult.ok} impresora${printResult.ok === 1 ? "" : "s"}`,
          );
        }
      } catch (printError) {
        const message =
          printError instanceof Error ? printError.message : "Error de impresion";
        toast.warning(`Pedido guardado, pero la comanda no imprimio: ${message}`);
      }

      clearActiveItems();
      clearActiveOrder();
      setPreviousItems([]);
      updateTicket({
        tableId: "",
        tableName: "",
        table: "",
        numberOfGuests: null,
        activeSeat: null,
        name: "",
        address: "",
        phone: "",
        discount: 0,
      });

      // Tras guardar, volver a la pantalla de tipo de pedido para arrancar la
      // siguiente venta en limpio (en vez de quedarse en el ticket abierto).
      router.replace("/pos/order-type");
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
      const itemsPayload = buildItemsPayload();
      const printItems = buildTicketItems();

      let order: any = null;
      let queued = false;
      if (activeOrderId) {
        // 1. Si hay items en la "Nueva ronda", primero los enviamos al backend
        if (itemsPayload.length > 0) {
          const addRes = await apiOrQueue<any>(
            "order",
            "POST",
            `/api/orders/${activeOrderId}/items`,
            { items: itemsPayload },
          );
          if (!addRes.ok) {
            toast.error("Error al enviar ronda: " + (addRes.error || ""));
            return;
          }
          queued = queued || addRes.queued;
          order = addRes.data;
        } else if (typeof navigator === "undefined" || navigator.onLine) {
          try {
            const { data } = await api.get(`/api/orders/${activeOrderId}`);
            order = data;
          } catch {
            // Si no se pudo hidratar, igual podemos encolar el cobro por id.
          }
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
        const createRes = await apiOrQueue<any>("order", "POST", "/api/orders/tpv", orderData);
        if (!createRes.ok) {
          toast.error("Error al crear orden: " + (createRes.error || ""));
          return;
        }
        queued = queued || createRes.queued;
        order = createRes.data;
      }

      const payableOrderId = activeOrderId || order?.id;
      if (payableOrderId && !queued) {
        const payRes = await apiOrQueue<any>(
          "payment",
          "PUT",
          `/api/orders/${payableOrderId}/payment`,
          { paymentMethod: method },
        );
        if (!payRes.ok) {
          toast.error("Error al cobrar: " + (payRes.error || ""));
          return;
        }
        queued = queued || payRes.queued;
        if (payRes.data) order = { ...order, ...payRes.data };
      } else if (activeOrderId && queued) {
        const payRes = await apiOrQueue<any>(
          "payment",
          "PUT",
          `/api/orders/${activeOrderId}/payment`,
          { paymentMethod: method },
        );
        if (!payRes.ok) {
          toast.error("Error al encolar cobro: " + (payRes.error || ""));
          return;
        }
      }

      // BUG-24: asignar repartidor inmediatamente después del cobro DELIVERY.
      if (ticket.type === "DELIVERY" && driverId && order?.id && !queued) {
        try {
          await api.put("/api/delivery/assign", { orderId: order.id, driverId });
        } catch (assignErr: any) {
          toast.warning(
            "Cobro OK, pero falló asignar repartidor: " +
            (assignErr?.response?.data?.error || assignErr?.message || "Error desconocido"),
          );
        }
      }

      toast.success(queued ? "Cobro en cola · se registrara al volver la red" : "Cobro procesado");
      hapticSuccess();

      // Doble pantalla: mostrar agradecimiento en la pantalla de cliente.
      justCompletedRef.current = true;
      dualScreen.completeSale({ total: total + tipAmount });
      
      // Capturar contexto antes de limpiar el ticket activo.
      const ticketContext = {
        orderNumber: order?.orderNumber ?? activeOrderNumber ?? null,
        orderType:   ticket.type ?? null,
        tableNumber: ticket.tableName || ticket.table || null,
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

      // Limpieza post-pago — reset completo para que la próxima venta
      // arranque en limpio (items, orden activa, rondas, cliente y descuento).
      clearActiveItems();
      clearActiveOrder();
      setPreviousItems([]);
      updateTicket({ name: "", address: "", phone: "", discount: 0 });
      setShowPayment(false);

      // Impresión de comanda (solo si había items nuevos)
      if (printItems.length > 0) {
        printKitchenTickets(printers, { ...ticketContext, items: printItems, config: kitchenConfig ?? undefined })
          .catch(() => { /* silencio */ });
      }

      // Impresión de recibo de cliente (el total completo)
      const guests = ticket.numberOfGuests ?? 0;
      const isDineInSplit = ticket.type === "DINE_IN" && guests >= 2;
      const receiptItems = order?.items
        ? orderItemsToTicketItems(order.items)
        : [...orderItemsToTicketItems(previousItems), ...printItems];
      if (isDineInSplit) {
        printSplitReceipts(
          printers,
          { ...ticketContext, ...totals, items: receiptItems },
          guests,
        ).catch(() => {});
      } else {
        printCustomerReceipt(printers, {
          ...ticketContext,
          ...totals,
          items: receiptItems,
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

  // Limpiar ticket = empezar de cero. Además de los items, suelta la orden
  // activa (activeOrderId) y las rondas anteriores cargadas; si no, el
  // subtotal "fantasma" y la orden del backend seguían pegados y la próxima
  // venta se metía a la misma orden.
  const handleClearTicket = () => {
    clearActiveItems();
    clearActiveOrder();
    setPreviousItems([]);
    updateTicket({ name: "", phone: "", address: "", discount: 0 });
    hapticMedium();
  };

  // Cobrable cuando hay items en la ronda nueva (ticket.items) O en el
  // historial cargado de una orden abierta (previousItems). Antes el botón
  // "Cobrar" solo miraba ticket.items, así que al cargar un ticket abierto
  // (ronda nueva vacía) quedaba deshabilitado y el tap no abría nada — aunque
  // handleOpenPayment sí permitía cobrar previousItems. Ahora ambos coinciden.
  const cartHasItems = ticket.items.length > 0 || previousItems.length > 0;

  return (
    <aside
      className="w-full h-full min-h-0 bg-[#0c0c0e] flex flex-col relative z-20 overflow-hidden"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* HEADER DEL TICKET */}
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-white/10 bg-[#0a0a0c] p-3">
        <OrderTypeToggle
          active={ticket.type}
          onChange={(type) => updateTicket({ type })}
          allowedTypes={tpvConfig.allowedOrderTypes}
        />
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Orden en curso</h2>
          <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-amber-400">
            ID: {String(ticket.id).slice(-4)}
          </span>
        </div>

        <div className="flex gap-2">
          {ticket.type !== "DINE_IN" ? (
            <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-[#121316] px-3 transition-all focus-within:border-amber-500/50">
              <User size={15} className="text-zinc-600 shrink-0" />
              <input
                placeholder="Nombre del cliente..."
                className="bg-transparent border-none outline-none text-xs font-bold text-white w-full placeholder:text-zinc-600 placeholder:font-bold tracking-tight"
                value={ticket.name || ""}
                onChange={(e) => useTicketStore.getState().updateTicket({ name: e.target.value })}
              />
            </div>
          ) : (
            <div className="flex h-10 min-w-0 flex-1 items-center gap-2 px-1 text-zinc-400">
              <MapPin size={15} className="text-emerald-400/70 shrink-0" />
              <span className="text-[11px] font-black uppercase tracking-[0.18em] truncate">
                {ticket.tableName || ticket.table || "Sin mesa"}
              </span>
              {(ticket.numberOfGuests ?? 0) > 0 && (
                <span className="text-[9px] font-bold text-zinc-500 shrink-0">
                  · {ticket.numberOfGuests} pax
                </span>
              )}
            </div>
          )}
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#121316] text-zinc-500 transition-all active:scale-95 active:border-red-500/20 active:bg-red-500/10 active:text-red-500"
            onClick={handleClearTicket}
            aria-label="Limpiar ticket"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* BUG-24: campos requeridos para DELIVERY. */}
        {ticket.type === "DELIVERY" && (
          <div className="flex flex-col gap-2">
            <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-[#121316] px-3 transition-all focus-within:border-amber-500/50">
              <Home size={15} className="text-zinc-600 shrink-0" />
              <input
                placeholder="Dirección..."
                className="bg-transparent border-none outline-none text-xs font-bold text-white w-full placeholder:text-zinc-600 placeholder:font-bold tracking-tight"
                value={ticket.address || ""}
                onChange={(e) => useTicketStore.getState().updateTicket({ address: e.target.value })}
              />
              {!ticket.address?.trim() && (
                <span className="text-[8px] font-black tracking-[0.2em] uppercase text-amber-500/70 shrink-0">
                  Req
                </span>
              )}
            </div>
            <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-[#121316] px-3 transition-all focus-within:border-amber-500/50">
              <Phone size={15} className="text-zinc-600 shrink-0" />
              <input
                placeholder="Teléfono..."
                inputMode="tel"
                className="bg-transparent border-none outline-none text-xs font-bold text-white w-full placeholder:text-zinc-600 placeholder:font-bold tracking-tight tabular-nums"
                value={ticket.phone || ""}
                onChange={(e) => useTicketStore.getState().updateTicket({ phone: e.target.value })}
              />
              {!ticket.phone?.trim() && (
                <span className="text-[8px] font-black tracking-[0.2em] uppercase text-amber-500/70 shrink-0">
                  Req
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* LISTA DE ITEMS — área scrollable que ocupa lo que sobre entre
          header y bloque de totales/acciones (siempre fijo abajo). */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#0a0a0c] px-3 py-3 scrollbar-hide">
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
            {ticket.items.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="h-[1px] flex-1 bg-amber-500/20" />
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-500/50">
                  Nueva ronda
                </span>
                <div className="h-[1px] flex-1 bg-amber-500/20" />
              </div>
            )}
          </div>
        )}

        {ticket.items.length === 0 && previousItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-500">
              <ShoppingCart size={34} />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500">
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

      {/* FOOTER DEL TICKET — fijo al fondo. Incluye bloque de totales
          (e-commerce style) + CTA primario + acciones secundarias. */}
      <div className="relative mt-auto shrink-0 overflow-hidden border-t border-white/10 bg-[#121316]">
        {/* BLOQUE DE TOTALES — Subtotal, IVA (16%), Descuento, Total.
            Estilo e-commerce: rows alineadas con valores tabulares. */}
        <div className="relative z-10 flex flex-col gap-1.5 border-b border-white/10 bg-[#0d0e11] px-4 py-3">
          <div className="flex justify-between items-baseline text-[11px]">
            <span className="font-bold uppercase tracking-[0.15em] text-zinc-500">
              Subtotal
            </span>
            <span className="font-bold text-zinc-300 mono tabular-nums">
              ${subtotalSinIva.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-baseline text-[11px]">
            <span className="font-bold uppercase tracking-[0.15em] text-zinc-500">
              IVA 16%
            </span>
            <span className="font-bold text-zinc-300 mono tabular-nums">
              ${ivaAmount.toFixed(2)}
            </span>
          </div>
          {ticket.discount > 0 && (
            <div className="flex justify-between items-baseline text-[11px]">
              <span className="font-bold uppercase tracking-[0.15em] text-emerald-400/80">
                Descuento
              </span>
              <span className="font-bold text-emerald-400 mono tabular-nums">
                −${ticket.discount.toFixed(2)}
              </span>
            </div>
          )}
          <div className="mt-0.5 flex items-baseline justify-between border-t border-white/10 pt-1.5">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-300">
              Total
            </span>
            <span className="mono text-2xl font-black leading-none tabular-nums text-amber-400">
              ${total.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-2 p-4 pt-3">
          {/* FOOTER CONDICIONAL — flat, alto contraste.
              · Vacío:        [ Tickets Abiertos ]  ·  [ Cobrar ] (off)
              · Con producto: [ Guardar Orden ]     ·  [ Cobrar ] (verde) */}
          <div className="flex gap-2 h-12">
            {/* BOTÓN IZQUIERDO (secundario) — "Guardar Orden" cuando hay
                productos nuevos O una cuenta activa abierta (para que el
                cajero pueda cerrar/volver aun sin agregar nada). */}
            {hasItems || activeOrderId ? (
              <button
                onClick={handleSendToKitchen}
                disabled={processing}
                className="flex-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] font-black uppercase tracking-widest text-amber-400 active:bg-amber-500/20 transition-transform duration-100 active:scale-[0.97] flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Save size={16} strokeWidth={2.5} /> Guardar Orden
              </button>
            ) : (
              <button
                onClick={() => {
                  import("@/store/useUIStore").then(({ useUIStore }) => {
                    useUIStore.getState().setIsOrdersOpen(true);
                  });
                }}
                className="flex-1 rounded-xl bg-surface-2 border border-border text-[11px] font-black uppercase tracking-widest text-zinc-300 active:text-white active:bg-zinc-800 transition-transform duration-100 active:scale-[0.97] flex items-center justify-center gap-1.5"
              >
                <Receipt size={16} strokeWidth={2.5} /> Tickets Abiertos
              </button>
            )}

            {/* BOTÓN DERECHO (acción principal) */}
            {isLoanMode ? (
              <button
                onClick={handleSendToKitchen}
                disabled={processing || !hasItems}
                className="flex-[2] rounded-xl text-[12px] font-black tracking-[0.15em] uppercase flex items-center justify-center gap-2 transition-transform duration-100 active:scale-[0.97] disabled:opacity-40 disabled:grayscale bg-amber-500 text-black"
              >
                <UtensilsCrossed size={14} strokeWidth={2.5} />
                {processing ? "Enviando..." : "Cocina"}
              </button>
            ) : (
              <button
                onClick={isShiftOpen ? handleOpenPayment : onOpenShift}
                disabled={processing || !cartHasItems}
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
                className={`flex-[2] rounded-xl text-[12px] font-black tracking-[0.15em] uppercase flex items-center justify-center gap-2 transition-transform duration-100 active:scale-[0.97] disabled:opacity-40 disabled:grayscale ${
                  isShiftOpen
                    ? "bg-[#88d66c] text-black active:bg-[#7ac75e]"
                    : "bg-red-500 text-white active:bg-red-600"
                }`}
              >
                {isShiftOpen && <Zap size={15} strokeWidth={2.5} />}
                {processing ? "Cargando..." : isShiftOpen ? "Cobrar" : "Turno"}
              </button>
            )}
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
