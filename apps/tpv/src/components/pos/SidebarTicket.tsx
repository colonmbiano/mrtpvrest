"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ShoppingCart, User, UtensilsCrossed, MapPin, Phone, Home, Receipt, Save, Zap } from "lucide-react";
import TicketLine from "@/components/pos/TicketLine";
import PaymentModal, { type PaymentTip } from "@/components/pos/PaymentModal";
import TablePickerModal, { type TableLite } from "@/components/pos/TablePickerModal";
import OrderTypeToggle from "@/components/pos/OrderTypeToggle";
import { buildOrderItemsPayload } from "@/lib/modifiers";
import { useAuthStore } from "@/store/authStore";
import { useTicketStore, type CartItem } from "@/store/ticketStore";
import { useActiveOrderStore } from "@/store/activeOrderStore";
import { useTpvConfig } from "@/hooks/useTpvConfig";
import { useKitchenConfig, usePrinters, useFullTicketConfig, useReceiptIdentity, buildReceiptIdentityFields } from "@/hooks/usePrinters";
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

// Un item es "configurable" (re-editable) si el producto tiene variantes,
// grupos de modificadores o complementos disponibles. Solo en ese caso
// mostramos el lápiz para reabrir el configurador; los productos planos ya
// se ajustan con el stepper y la nota.
const isConfigurableItem = (item: CartItem): boolean =>
  (!!item.hasVariants && (item.variants?.some((v) => v.isAvailable !== false) ?? false)) ||
  (item.modifierGroups?.some((g) => (g.modifiers?.length ?? 0) > 0) ?? false) ||
  (item.complements?.some((c) => c.isAvailable !== false) ?? false);

export default function SidebarTicket({ onOpenShift, isShiftOpen = true, isLoanMode = false }: Props) {
  const router = useRouter();
  const [showPayment, setShowPayment] = useState(false);
  const [showTables, setShowTables] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Permiso para aplicar descuento sin PIN. WAITER/CASHIER no tienen
  // `apply_discount` por default; admin/manager sí. Si el rol actual no
  // tiene el permiso, el modal pide autorización vía ManagerOverride.
  const employee = useAuthStore((s) => s.employee);
  const canApplyDiscount =
    !!employee?.permissions?.includes("apply_discount");

  const { activeOrderId, activeOrderNumber, setActiveOrder, clear: clearActiveOrder } = useActiveOrderStore();
  // Se incrementa cuando una ronda se guarda desde fuera (ej. "Imprimir cuenta"
  // en el layout): recargamos el historial para reflejar los nuevos productos.
  const roundsRevision = useActiveOrderStore((s) => s.roundsRevision);

  const [previousItems, setPreviousItems] = useState<any[]>([]);
  // Nombre/etiqueta de la cuenta ("Renombrar" → Order.ticketName). Se hidrata
  // del pedido activo y se muestra en el header para que el rename sea visible
  // en la pantalla de trabajo (no solo en Tickets abiertos).
  const [activeTicketName, setActiveTicketName] = useState<string | null>(null);
  const [_loadingHistory, setLoadingHistory] = useState(false);

  // Registro de clientes — al teclear el teléfono en DELIVERY buscamos el
  // directorio y autocompletamos nombre/dirección. customerHint muestra el
  // badge "cliente frecuente". lastLookupPhone evita re-buscar el mismo número
  // (el prefill dispara un re-render que volvería a entrar al efecto).
  const [customerHint, setCustomerHint] = useState<{ ordersCount: number } | null>(null);
  const lastLookupPhone = React.useRef<string>("");

  // Cargar historial de la orden si estamos en modo "extender". Diferido
  // a microtask (ver impresoras): el setState ya no corre sincrónicamente
  // en el effect (set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!activeOrderId) {
        setPreviousItems([]);
        setActiveTicketName(null);
        return;
      }
      (async () => {
        try {
          setLoadingHistory(true);
          const { data } = await api.get(`/api/orders/${activeOrderId}`);
          // Combinamos todos los items de todas las rondas como historial
          if (!cancelled) {
            setPreviousItems(data.items || []);
            setActiveTicketName(data.ticketName || null);
          }
        } catch (err) {
          console.error("Error al cargar historial de orden:", err);
        } finally {
          if (!cancelled) setLoadingHistory(false);
        }
      })();
    });
    return () => { cancelled = true; };
  }, [activeOrderId, roundsRevision]);

  // ── Edición de líneas de rondas anteriores (ya guardadas en la orden) ──────
  // El backend permite cambiar nota/cantidad y borrar una línea mientras la
  // orden NO esté pagada ni cerrada (PUT/DELETE /api/orders/items/:id, ver
  // orders.routes.js). Tras cada cambio recargamos `previousItems`: el
  // subtotal/total, el IVA y la pantalla de cliente se recalculan solos porque
  // todos derivan de ese estado. NOTA: agregar extras/modificadores a una línea
  // ya enviada NO está soportado por el backend; para eso se añade como línea
  // nueva en la "Nueva ronda".
  const reloadPreviousItems = React.useCallback(async () => {
    if (!activeOrderId) return;
    try {
      const { data } = await api.get(`/api/orders/${activeOrderId}`);
      setPreviousItems(data.items || []);
    } catch (err) {
      console.error("Error al recargar la orden:", err);
    }
  }, [activeOrderId]);

  const removePreviousItem = async (item: any) => {
    const label = item.menuItem?.name || item.name || "este producto";
    if (!confirm(`¿Anular "${label}"? Se quitará de la cuenta y se imprimirá un ticket de anulación en cocina.`)) return;
    try {
      await api.delete(`/api/orders/items/${item.id}`);
    } catch (err: any) {
      hapticError();
      const code = err?.response?.data?.code;
      const msg =
        code === "PERMISSION_REQUIRED"
          ? "No tienes permiso para anular productos ya enviados a cocina. Pide autorización a un gerente."
          : err?.response?.data?.error || "No se pudo quitar el producto";
      toast.error(msg);
      return;
    }
    // Ticket de anulación a cocina (best-effort): el producto ya no va.
    await printVoidTicket(item);
    await reloadPreviousItems();
    hapticSuccess();
    toast.success(`"${label}" anulado`);
  };

  const changePreviousItemQty = async (item: any, delta: number) => {
    const nextQty = (item.quantity || 1) + delta;
    if (nextQty < 1) { await removePreviousItem(item); return; }
    try {
      await api.put(`/api/orders/items/${item.id}`, { quantity: nextQty });
      await reloadPreviousItems();
      hapticMedium();
    } catch (err: any) {
      hapticError();
      toast.error(err?.response?.data?.error || "No se pudo actualizar la cantidad");
    }
  };

  const updatePreviousItemNotes = async (item: any, notes: string) => {
    try {
      await api.put(`/api/orders/items/${item.id}`, { notes });
      await reloadPreviousItems();
      hapticSuccess();
    } catch (err: any) {
      hapticError();
      toast.error(err?.response?.data?.error || "No se pudo actualizar la nota");
    }
  };

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
    setEditingIndex,
  } = useTicketStore();

  const ticket = getActiveTicket();
  const hasItems = ticket.items.length > 0;

  // Búsqueda del cliente por teléfono (debounce 400ms). Best-effort: si falla
  // la red no rompe el flujo de cobro. Sólo autocompleta campos vacíos para no
  // pisar lo que el cajero ya escribió.
  useEffect(() => {
    // Resets diferidos a microtask (ver impresoras): setCustomerHint síncrono
    // dentro del effect dispara set-state-in-effect en el lint.
    let cancelled = false;
    const clearHint = () => {
      queueMicrotask(() => { if (!cancelled) setCustomerHint(null); });
    };

    // DINE_IN no captura teléfono → no hay nada que buscar.
    if (ticket.type === "DINE_IN") {
      clearHint();
      lastLookupPhone.current = "";
      return () => { cancelled = true; };
    }
    const digits = (ticket.phone || "").replace(/\D/g, "");
    const key = digits.length > 10 ? digits.slice(-10) : digits;
    if (key.length < 7) {
      clearHint();
      lastLookupPhone.current = "";
      return () => { cancelled = true; };
    }
    if (key === lastLookupPhone.current) return () => { cancelled = true; };

    const handle = setTimeout(async () => {
      try {
        const { data } = await api.get("/api/customers/by-phone", { params: { phone: key } });
        lastLookupPhone.current = key;
        if (data?.found && data.customer) {
          const c = data.customer;
          setCustomerHint({ ordersCount: c.ordersCount ?? 0 });
          const cur = useTicketStore.getState().getActiveTicket();
          const patch: { name?: string; address?: string } = {};
          if (!cur.name?.trim() && c.name) patch.name = c.name;
          if (!cur.address?.trim() && c.address) patch.address = c.address;
          if (Object.keys(patch).length) useTicketStore.getState().updateTicket(patch);
        } else {
          setCustomerHint(null);
        }
      } catch {
        /* búsqueda best-effort: ignorar errores de red */
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [ticket.phone, ticket.type, ticket.id]);

  // Badge "cliente frecuente" reutilizado en TAKEOUT y DELIVERY.
  const customerHintBadge = customerHint && customerHint.ordersCount > 0 ? (
    <div className="flex items-center gap-1.5 px-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-400/90">
      <User size={11} className="shrink-0" />
      <span>
        Cliente frecuente · {customerHint.ordersCount}{" "}
        {customerHint.ordersCount === 1 ? "pedido" : "pedidos"}
      </span>
    </div>
  ) : null;

  const historySubtotal = useMemo(() =>
    // Preferimos el subtotal real del backend (correcto para líneas por peso,
    // donde price es por kg y quantity=1); fallback a price×quantity legacy.
    previousItems.reduce((acc, item) => acc + (item.subtotal != null ? Number(item.subtotal) : item.price * item.quantity), 0),
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
        total: it.subtotal != null ? Number(it.subtotal) : (it.price as number) * (it.quantity as number),
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
  // Config del recibo CASHIER (identidad del negocio + tipografía). Antes el
  // checkout imprimía el recibo SIN estos datos (negocio en blanco); ahora se
  // pasan igual que en reimpresión/split.
  const { config: receiptConfig } = useFullTicketConfig();
  const { businessName, businessFooter, terminalName } = useReceiptIdentity();

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
        weightKg: it.weightKg ?? null,
        unit: it.unit ?? null,
        price: it.price,
        notes: it.notes,
        seatNumber: it.seatNumber ?? null,
        printerGroupIds,
        modifiers: (it.modifiers || []).map((m) => ({ name: m.name, priceAdd: m.priceAdd })),
      };
    });

  // Payload de items para POST /tpv y /:id/items. Usa el builder compartido
  // (mismo shape que el guardado automático al imprimir cuenta). La variante
  // single-select (item.variantId) y las variantes/complementos prefijados en
  // los modificadores se separan dentro del helper. El precio nunca se manda:
  // el backend lo re-lee del catálogo.
  const buildItemsPayload = () => buildOrderItemsPayload(ticket.items);

  // Imprime el ticket de cocina de ANULACIÓN para un producto que se quita de
  // una orden ya enviada — avisa a cocina que ese platillo ya no va. Best-effort:
  // si falla la impresión solo se avisa. Resuelve la estación igual que el envío
  // normal (override del item → default de la categoría → fallback KITCHEN/BAR).
  const printVoidTicket = async (item: any) => {
    const itemOverride = (item.menuItem?.printerGroups ?? [])
      .map((m: any) => m.printerGroup?.id)
      .filter((id: unknown): id is string => Boolean(id));
    const categoryDefault = (item.menuItem?.category?.printerGroups ?? [])
      .map((m: any) => m.printerGroup?.id)
      .filter((id: unknown): id is string => Boolean(id));
    const voidItem: TicketItem = {
      name: item.menuItem?.name || item.name || "Producto",
      quantity: item.quantity ?? 1,
      price: item.price ?? 0,
      notes: item.notes || null,
      seatNumber: item.seatNumber ?? null,
      printerGroupIds: itemOverride.length > 0 ? itemOverride : categoryDefault,
      modifiers: (item.modifiers || []).map((m: any) => ({
        name: m.modifier?.name || m.name || "",
        priceAdd: Number(m.modifier?.priceAdd ?? m.priceAdd ?? 0),
      })),
    };
    try {
      await printKitchenTickets(printers, {
        orderNumber: activeOrderNumber ?? (activeOrderId ? String(activeOrderId).slice(-6) : null),
        orderType: ticket.type ?? null,
        tableNumber: ticket.tableName || ticket.table || null,
        customerName: ticket.name ?? null,
        items: [voidItem],
        isCancel: true,
        config: kitchenConfig ?? undefined,
      });
    } catch {
      toast.warning("Artículo anulado, pero no se pudo imprimir el ticket de anulación");
    }
  };

  // Persiste en el backend los datos del cliente editados sobre una orden ya
  // existente (nombre/teléfono/dirección). El POST /:id/items solo manda los
  // productos, así que sin esto las ediciones se quedaban en el store local y
  // se perdían al recargar el ticket. customerName/Phone se mandan siempre
  // (hacen round-trip de lo cargado en DINE_IN); la dirección solo en DELIVERY.
  const persistOrderDetails = (orderId: string) => {
    const payload: Record<string, string | null> = {
      customerName: ticket.name?.trim() ? ticket.name.trim() : null,
      customerPhone: ticket.phone?.trim() ? ticket.phone.trim() : null,
    };
    if (ticket.type === "DELIVERY") {
      payload.deliveryAddress = ticket.address?.trim() ? ticket.address.trim() : null;
    }
    return apiOrQueue("order", "PUT", `/api/orders/${orderId}/details`, payload);
  };

  const handleSendToKitchen = async () => {
    // Guarda de re-entrada: sin esto un doble-tap dispara dos POST de la misma
    // ronda → items duplicados en la cuenta. El botón usa `disabled={processing}`
    // pero este handler nunca prendía la bandera, así que el disabled no servía.
    if (processing) return;
    setProcessing(true);
    try {
    if (ticket.items.length === 0) {
      if (activeOrderId) {
        // Cuenta existente sin productos nuevos: no hay ronda que agregar,
        // pero el cajero pudo haber editado los datos del cliente. Los
        // persistimos antes de cerrar para que "Guardar" sí los guarde.
        const detailsRes = await persistOrderDetails(activeOrderId);
        if (!detailsRes.ok) {
          toast.error("No se pudieron guardar los datos: " + (detailsRes.error || ""));
          hapticError();
          return;
        }
        toast.success(
          detailsRes.queued
            ? "Datos en cola · se guardarán al volver la red"
            : "Datos del ticket guardados",
        );
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
        // Persistir también cualquier edición de los datos del cliente sobre
        // la orden ya existente (el POST de items no los incluye). Best-effort:
        // los productos ya quedaron guardados, así que un fallo aquí solo se
        // avisa sin abortar la ronda.
        const detailsRes = await persistOrderDetails(activeOrderId);
        if (!detailsRes.ok) {
          toast.warning("Ronda guardada, pero no se pudieron actualizar los datos del cliente");
        }
      } else {
        // Orden nueva. Si la mesa resulta tener YA una cuenta abierta que el
        // operador no veía, el backend responde 409 (en vez de encimar en
        // silencio): preguntamos si agregar a esa cuenta o cancelar.
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
        let res = await apiOrQueue("order", "POST", "/api/orders/tpv", orderData);

        if (
          !res.ok &&
          res.status === 409 &&
          res.conflict?.code === "TABLE_HAS_OPEN_TAB"
        ) {
          // La mesa ya tiene una cuenta abierta. NO encimamos: confirmamos.
          const ex = res.conflict.existingOrder || {};
          const mesa = ticket.tableName || ticket.table || "";
          const proceed =
            typeof window !== "undefined" &&
            window.confirm(
              `La mesa ${mesa} ya tiene la cuenta ${ex.orderNumber ?? ""} abierta` +
                (ex.total != null ? ` ($${ex.total})` : "") +
                `.\n\n¿Agregar estos productos a esa cuenta?\n\n` +
                `Cancela para elegir otra mesa o cobrar la cuenta que ya existe.`,
            );
          if (!proceed) {
            toast.info("Operación cancelada — la cuenta existente no se tocó");
            return;
          }
          // Confirmado: agregar la ronda a la cuenta existente.
          res = await apiOrQueue(
            "order",
            "POST",
            `/api/orders/${ex.id}/items`,
            { items: itemsPayload },
          );
          if (!res.ok) throw new Error(res.error || "fallo desconocido");
          queued = res.queued;
          order = res.data;
          setActiveOrder(ex.id, ticket.tableId, ex.orderNumber ?? null);
          if (!queued) setPreviousItems(order?.items || []);
        } else {
          if (!res.ok) throw new Error(res.error || "fallo desconocido");
          queued = res.queued;
          order = res.data;
          // Guardar el id para que la siguiente ronda ya conozca la orden.
          if (order?.id && ticket.tableId) {
            setActiveOrder(order.id, ticket.tableId, order.orderNumber ?? null);
          }
          if (!queued) setPreviousItems(order?.items || []);
        }
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
    } finally {
      setProcessing(false);
    }
  };

  const handleProcessPayment = async (
    method: string,
    tip?: PaymentTip,
    driverId?: string | null,
    printReceipt?: boolean,
  ) => {
    if (ticket.items.length === 0 && previousItems.length === 0) return;
    if (processing) return; // evita doble cobro / ronda duplicada por doble-tap
    setProcessing(true);
    try {
      const tipAmount = tip?.amount ?? 0;
      const itemsPayload = buildItemsPayload();
      const printItems = buildTicketItems();

      let order: any = null;
      let queued = false;
      if (activeOrderId) {
        // VELOCIDAD: antes el cobro encadenaba 4 round-trips secuenciales a la
        // nube (items → detalles → descuento → pago). Los datos del cliente y
        // (si no hay ronda nueva) la hidratación de la orden NO tocan total ni
        // estado, así que arrancan EN PARALELO y se esperan justo antes de
        // cobrar. La ronda nueva y el descuento sí van en orden (el total se
        // recalcula server-side sobre el set completo de items).
        const detailsPromise = persistOrderDetails(activeOrderId).catch(() => null);
        const hydratePromise =
          itemsPayload.length === 0 &&
          (typeof navigator === "undefined" || navigator.onLine)
            ? api
                .get(`/api/orders/${activeOrderId}`)
                .then((r) => r.data)
                .catch(() => null)
            : null;

        // 1. Ronda nueva (si hay) — debe aplicarse antes del descuento/pago.
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
        }

        // 2. Descuento — solo si hay uno (ahorra un round-trip en el caso común
        // de cobro sin descuento). Va después de los items.
        if (ticket.discount > 0) {
          const discountRes = await apiOrQueue<any>(
            "order",
            "PUT",
            `/api/orders/${activeOrderId}/discount`,
            { type: "fixed", value: ticket.discount },
          );
          if (!discountRes.ok) {
            toast.error("No se pudo guardar el descuento: " + (discountRes.error || ""));
            return;
          }
          queued = queued || discountRes.queued;
          if (discountRes.data) order = { ...order, ...discountRes.data };
        }

        // Esperar lo que corrió en paralelo (ya sin costo de latencia extra).
        await detailsPromise;
        if (hydratePromise) {
          const h = await hydratePromise;
          if (h) order = order ? { ...h, ...order } : h;
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

        if (
          !createRes.ok &&
          createRes.status === 409 &&
          createRes.conflict?.code === "TABLE_HAS_OPEN_TAB"
        ) {
          // La mesa ya tenía una cuenta abierta que el operador no veía (status
          // de mesa desfasado / lookup offline). NO la encimamos en silencio ni
          // creamos una 2ª orden: confirmamos y, si acepta, agregamos estos
          // productos a ESA cuenta y cobramos el total junto.
          const ex = createRes.conflict.existingOrder || {};
          const mesa = ticket.tableName || ticket.table || "";
          const proceed =
            typeof window !== "undefined" &&
            window.confirm(
              `La mesa ${mesa} ya tiene la cuenta ${ex.orderNumber ?? ""} abierta` +
                (ex.total != null ? ` ($${ex.total})` : "") +
                `.\n\n¿Agregar estos productos a esa cuenta y cobrarla completa?\n\n` +
                `Cancela para revisar la cuenta existente antes de cobrar.`,
            );
          if (!proceed) {
            toast.info("Cobro cancelado — la cuenta existente no se tocó");
            return;
          }
          const addRes = await apiOrQueue<any>(
            "order",
            "POST",
            `/api/orders/${ex.id}/items`,
            { items: itemsPayload },
          );
          if (!addRes.ok) {
            toast.error("Error al agregar a la cuenta: " + (addRes.error || ""));
            return;
          }
          if (ticket.discount > 0) {
            const discRes = await apiOrQueue<any>(
              "order",
              "PUT",
              `/api/orders/${ex.id}/discount`,
              { type: "fixed", value: ticket.discount },
            );
            if (!discRes.ok) {
              toast.error("No se pudo guardar el descuento: " + (discRes.error || ""));
              return;
            }
          }
          queued = queued || addRes.queued;
          // payableOrderId se resuelve a ex.id vía order?.id → el PUT /payment
          // de abajo cobra la cuenta completa.
          order = addRes.data || { id: ex.id, orderNumber: ex.orderNumber };
          setActiveOrder(ex.id, ticket.tableId, ex.orderNumber ?? null);
        } else {
          if (!createRes.ok) {
            toast.error("Error al crear orden: " + (createRes.error || ""));
            return;
          }
          queued = queued || createRes.queued;
          order = createRes.data;
        }
      }

      const payableOrderId = activeOrderId || order?.id;
      // El create de orden nueva ya marca PAID cuando manda status=DELIVERED +
      // paymentMethod (paidOnCreate). En ese caso el PUT /payment es redundante
      // → lo saltamos para ahorrar un round-trip. Excepción: DINE_IN, donde el
      // PUT /payment también libera la mesa (releaseTableIfDineIn).
      const alreadyPaidOnCreate =
        !activeOrderId && order?.paymentStatus === "PAID" && ticket.type !== "DINE_IN";
      if (payableOrderId && !queued && !alreadyPaidOnCreate) {
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

      hapticSuccess();

      // Doble pantalla: mostrar agradecimiento en la pantalla de cliente.
      justCompletedRef.current = true;
      dualScreen.completeSale({ total: total + tipAmount });

      // Capturar contexto y armar el recibo ANTES de limpiar el ticket activo
      // (el botón "Imprimir ticket" del toast los usa después del reset).
      const ticketContext = {
        orderNumber: order?.orderNumber ?? activeOrderNumber ?? null,
        orderType:   ticket.type ?? null,
        tableNumber: ticket.tableName || ticket.table || null,
        // ticketName (el "Renombrar" de la cuenta) tiene prioridad sobre el
        // nombre del cliente, igual que en el listado de tickets abiertos.
        customerName: order?.ticketName || ticket.name || null,
        customerPhone: ticket.phone ?? null,
      };
      const totals = {
        subtotal,
        discount: ticket.discount,
        total: total + tipAmount,
        paymentMethod: method,
        tipPercent: tip?.percent ?? 0,
        tipAmount,
        paid: true, // el recibo se imprime al cobrar → orden pagada
      };
      const guests = ticket.numberOfGuests ?? 0;
      const isDineInSplit = ticket.type === "DINE_IN" && guests >= 2;
      const receiptItems = order?.items
        ? orderItemsToTicketItems(order.items)
        : [...orderItemsToTicketItems(previousItems), ...printItems];
      const receiptIdentity = buildReceiptIdentityFields(
        receiptConfig,
        { businessName, businessFooter },
        null,
        ticketContext.orderNumber ? String(ticketContext.orderNumber) : null,
      );
      const receiptExtras = {
        numberOfGuests: ticket.numberOfGuests ?? null,
        cashierName: employee?.name || null,
        terminalName: terminalName || null,
      };

      // El recibo de cuenta solo se imprime si el cajero activó el toggle
      // "Imprimir ticket" en la pantalla de cobro (default apagado). La comanda
      // de cocina no depende de esto (va sola más abajo si hay items nuevos).
      if (printReceipt) {
        if (isDineInSplit) {
          printSplitReceipts(
            printers,
            { ...receiptIdentity, ...ticketContext, ...totals, ...receiptExtras, items: receiptItems },
            guests,
          ).catch(() => {});
        } else {
          printCustomerReceipt(printers, {
            ...receiptIdentity,
            ...ticketContext,
            ...totals,
            ...receiptExtras,
            items: receiptItems,
          }).catch(() => {});
        }
      }

      toast.success(
        queued ? "Cobro en cola · se registrara al volver la red" : "Cobro procesado",
      );

      // Limpieza post-pago — reset completo para que la próxima venta
      // arranque en limpio (items, orden activa, rondas, cliente y descuento).
      clearActiveItems();
      clearActiveOrder();
      setPreviousItems([]);
      updateTicket({ name: "", address: "", phone: "", discount: 0 });
      setShowPayment(false);

      // Comanda de cocina (solo si había items nuevos) — sigue automática.
      if (printItems.length > 0) {
        printKitchenTickets(printers, { ...ticketContext, items: printItems, config: kitchenConfig ?? undefined })
          .catch(() => { /* silencio */ });
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
      weightKg: it.weightKg != null ? Number(it.weightKg) : null,
      unit: it.menuItem?.unit ?? it.unit ?? null,
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
    // Vaciar el ticket es destructivo (borra la comanda en construcción).
    // Si hay algo cargado, pedir confirmación para evitar perderlo por un
    // tap accidental en el basurero.
    const hasSomething = ticket.items.length > 0 || previousItems.length > 0;
    if (hasSomething && !window.confirm("¿Vaciar el ticket? Se quitarán todos los productos de esta cuenta.")) {
      return;
    }
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
      className="w-full h-full min-h-0 bg-[var(--bg)] flex flex-col relative z-20 overflow-hidden"
    >
      {/* HEADER DEL TICKET */}
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-white/10 bg-[var(--bg)] p-3">
        <OrderTypeToggle
          active={ticket.type}
          onChange={(type) => updateTicket({ type })}
          allowedTypes={tpvConfig.allowedOrderTypes}
        />
        <div className="flex items-center justify-between">
          <h2 className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            {activeTicketName || "Orden en curso"}
          </h2>
          <span className="rounded-md border border-[var(--brand)] bg-[var(--brand-soft)] px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-[var(--brand)]">
            ID: {String(ticket.id).slice(-4)}
          </span>
        </div>

        <div className="flex gap-2">
          {ticket.type !== "DINE_IN" ? (
            <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-[var(--surface-1)] px-3 transition-all focus-within:border-[var(--brand)]">
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
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] truncate">
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[var(--surface-1)] text-zinc-500 transition-all active:scale-95 active:border-red-500/20 active:bg-red-500/10 active:text-red-500"
            onClick={handleClearTicket}
            aria-label="Limpiar ticket"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* TAKEOUT: teléfono opcional → activa el registro/autocompletado. */}
        {ticket.type === "TAKEOUT" && (
          <div className="flex flex-col gap-2">
            <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-[var(--surface-1)] px-3 transition-all focus-within:border-[var(--brand)]">
              <Phone size={15} className="text-zinc-600 shrink-0" />
              <input
                placeholder="Teléfono (opcional)..."
                inputMode="tel"
                className="bg-transparent border-none outline-none text-xs font-bold text-white w-full placeholder:text-zinc-600 placeholder:font-bold tracking-tight tabular-nums"
                value={ticket.phone || ""}
                onChange={(e) => useTicketStore.getState().updateTicket({ phone: e.target.value })}
              />
            </div>
            {customerHintBadge}
          </div>
        )}

        {/* BUG-24: campos requeridos para DELIVERY. */}
        {ticket.type === "DELIVERY" && (
          <div className="flex flex-col gap-2">
            <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-[var(--surface-1)] px-3 transition-all focus-within:border-[var(--brand)]">
              <Home size={15} className="text-zinc-600 shrink-0" />
              <input
                placeholder="Dirección..."
                className="bg-transparent border-none outline-none text-xs font-bold text-white w-full placeholder:text-zinc-600 placeholder:font-bold tracking-tight"
                value={ticket.address || ""}
                onChange={(e) => useTicketStore.getState().updateTicket({ address: e.target.value })}
              />
              {!ticket.address?.trim() && (
                <span className="text-[8px] font-semibold tracking-[0.14em] uppercase text-[var(--warning)] shrink-0">
                  Req
                </span>
              )}
            </div>
            <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-[var(--surface-1)] px-3 transition-all focus-within:border-[var(--brand)]">
              <Phone size={15} className="text-zinc-600 shrink-0" />
              <input
                placeholder="Teléfono..."
                inputMode="tel"
                className="bg-transparent border-none outline-none text-xs font-bold text-white w-full placeholder:text-zinc-600 placeholder:font-bold tracking-tight tabular-nums"
                value={ticket.phone || ""}
                onChange={(e) => useTicketStore.getState().updateTicket({ phone: e.target.value })}
              />
              {!ticket.phone?.trim() && (
                <span className="text-[8px] font-semibold tracking-[0.14em] uppercase text-[var(--warning)] shrink-0">
                  Req
                </span>
              )}
            </div>
            {customerHintBadge}
          </div>
        )}
      </div>

      {/* LISTA DE ITEMS — área scrollable que ocupa lo que sobre entre
          header y bloque de totales/acciones (siempre fijo abajo). */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)] px-3 py-2 scrollbar-hide">
        {/* Historial de rondas anteriores si existe activeOrderId */}
        {previousItems.length > 0 && (
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-3">
              <div className="h-[1px] flex-1 bg-white/5" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                Rondas anteriores
              </span>
              <div className="h-[1px] flex-1 bg-white/5" />
            </div>
            {/* Rondas anteriores: editables (nota, cantidad, quitar) mientras la
                orden no esté pagada/cerrada. El backend valida ese estado y el
                rol; si rechaza, mostramos el motivo en un toast. Al quitar una
                línea ya enviada se imprime un ticket de anulación en cocina. */}
            <div className="space-y-0">
              {previousItems.map((item, idx) => (
                <TicketLine
                  key={`prev-${item.id}-${idx}`}
                  id={item.id}
                  name={item.menuItem?.name || item.name}
                  quantity={item.quantity}
                  weightKg={item.weightKg != null ? Number(item.weightKg) : null}
                  unit={item.menuItem?.unit ?? item.unit}
                  price={item.price}
                  notes={item.notes}
                  modifiers={item.modifiers?.map((m: any) => ({
                    name: m.modifier?.name || m.name,
                    priceAdd: m.modifier?.priceAdd || m.priceAdd
                  }))}
                  onIncrease={() => changePreviousItemQty(item, 1)}
                  onDecrease={() => changePreviousItemQty(item, -1)}
                  onUpdateNotes={(n) => updatePreviousItemNotes(item, n)}
                  onRemove={() => removePreviousItem(item)}
                />
              ))}
            </div>
            {ticket.items.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="h-[1px] flex-1 bg-[var(--brand-soft)]" />
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--brand)]">
                  Nueva ronda
                </span>
                <div className="h-[1px] flex-1 bg-[var(--brand-soft)]" />
              </div>
            )}
          </div>
        )}

        {ticket.items.length === 0 && previousItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-500">
              <ShoppingCart size={34} />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Ticket vacío
            </p>
          </div>
        ) : (
          ticket.items.map((item, idx) => (
            <TicketLine
              key={`${item.id}-${idx}`}
              name={item.name}
              quantity={item.quantity}
              weightKg={item.weightKg ?? null}
              unit={item.unit}
              price={item.price}
              notes={item.notes}
              modifiers={item.modifiers?.map(m => ({ name: m.name, priceAdd: m.priceAdd }))}
              onIncrease={() => changeItemQty(idx, 1)}
              onDecrease={() => changeItemQty(idx, -1)}
              onUpdateNotes={(n) => setItemNotes(idx, n)}
              onEdit={isConfigurableItem(item) ? () => setEditingIndex(idx) : undefined}
            />
          ))
        )}
      </div>

      {/* FOOTER DEL TICKET — fijo al fondo. Incluye bloque de totales
          (e-commerce style) + CTA primario + acciones secundarias. */}
      <div className="relative mt-auto shrink-0 overflow-hidden border-t border-white/10 bg-[var(--surface-1)]">
        {/* BLOQUE DE TOTALES — Subtotal, IVA (16%), Descuento, Total.
            Estilo e-commerce: rows alineadas con valores tabulares. */}
        <div className="relative z-10 flex flex-col gap-1.5 border-b border-white/10 bg-[var(--surface-2)] px-4 py-3">
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
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Total
            </span>
            <span className="mono text-2xl font-black leading-none tabular-nums text-[var(--brand)]">
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
                className="flex-1 rounded-xl bg-[var(--brand-soft)] border border-[var(--brand)] text-[11px] font-bold uppercase tracking-widest text-[var(--brand)] active:bg-[var(--brand-soft)] transition-transform duration-100 active:scale-[0.97] flex items-center justify-center gap-1.5 disabled:opacity-40"
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
                className="flex-1 rounded-xl bg-surface-2 border border-border text-[11px] font-bold uppercase tracking-widest text-zinc-300 active:text-white active:bg-zinc-800 transition-transform duration-100 active:scale-[0.97] flex items-center justify-center gap-1.5"
              >
                <Receipt size={16} strokeWidth={2.5} /> Tickets Abiertos
              </button>
            )}

            {/* BOTÓN DERECHO (acción principal) */}
            {isLoanMode ? (
              <button
                onClick={handleSendToKitchen}
                disabled={processing || !hasItems}
                className="flex-[2] rounded-xl text-[12px] font-black tracking-[0.15em] uppercase flex items-center justify-center gap-2 transition-transform duration-100 active:scale-[0.97] disabled:opacity-40 disabled:grayscale bg-[var(--brand)] text-[var(--brand-fg)]"
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
                    ? "bg-[var(--brand)] text-[var(--brand-fg)] active:bg-[var(--brand-active)]"
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
          requiresDiscountOverride={!canApplyDiscount}
          onApplyDiscount={(type, value) => {
            const amount = type === "percent" ? subtotal * (value / 100) : value;
            updateTicket({ discount: amount, discountType: type });
            toast.success(
              amount > 0
                ? `Descuento aplicado: $${amount.toFixed(2)}${
                    type === "percent" ? ` (${value}%)` : ""
                  }`
                : "Descuento eliminado",
            );
          }}
          tipSuggestions={tipSuggestions}
          items={[
            ...previousItems.map((i) => ({
              name: i.menuItem?.name || i.name,
              quantity: i.quantity,
              subtotal: i.subtotal != null ? Number(i.subtotal) : i.price * i.quantity,
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
          showReceiptToggle
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

      </div>
    </aside>
  );
}
