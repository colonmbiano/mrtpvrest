"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Home, Search, ShoppingCart, UtensilsCrossed } from "lucide-react";
import OrdersDrawer from "@/components/pos/OrdersDrawer";
import ReprintKitchenModal from "@/components/pos/ReprintKitchenModal";
import SplitOrderModal from "@/components/pos/SplitOrderModal";
import PaymentModal from "@/components/pos/PaymentModal";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useTpvConfig } from "@/hooks/useTpvConfig";
import { usePrinters, useReceiptIdentity, useKitchenConfig, useFullTicketConfig, buildReceiptIdentityFields } from "@/hooks/usePrinters";
import { subscribeToEvents, useClientValue, useHydrated } from "@/hooks/useClientValue";
import {
  DEFAULT_SIDEBAR_PRESET,
  SIDEBAR_WIDTH_CHANGED_EVENT,
  readSidebarPreset,
  sidebarPresetToPx,
} from "@/lib/appearance";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";
import { useActiveOrderStore } from "@/store/activeOrderStore";
import { buildOrderItemsPayload } from "@/lib/modifiers";
import api from "@/lib/api";
import {
  readPaidTicketsCache,
  writePaidTicketsCache,
  type PaidTicketLite,
} from "@/lib/paid-tickets-cache";
import { apiOrQueue, syncOfflineQueue } from "@/lib/offline";
import useOfflineStore from "@/store/useOfflineStore";
import {
  printCustomerReceipt,
  printSplitReceipts,
  printEqualSplitReceipts,
  printKitchenTickets,
  openCashDrawer,
  comboKitchenDetail,
  type TicketItem,
  type ReceiptInput,
} from "@/lib/printer-tcp";

import SidebarTicket from "@/components/pos/SidebarTicket";
import TopActionsDropdown from "@/components/pos/TopActionsDropdown";
import { CATALOG_REFRESH_EVENT } from "./page";
import CatalogSettingsSheet from "@/components/modals/CatalogSettingsSheet";
import VoiceOrderDictation from "@/components/pos/VoiceOrderDictation";
import { useUIStore } from "@/store/useUIStore";
import ShiftModal from "@/components/admin/ShiftModal";
import NotificationsPanel from "@/components/pos/NotificationsPanel";
import WebOrdersPanel from "@/components/pos/WebOrdersPanel";
import { useNotifications } from "@/hooks/useNotifications";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import MergeTableModal from "@/components/pos/MergeTableModal";
import AdminPinGuardModal from "@/components/AdminPinGuardModal";
import PurchasesExpensesModal from "@/components/pos/PurchasesExpensesModal";
import ChangeOrderTypeModal from "@/components/pos/ChangeOrderTypeModal";
import { ORDER_TYPE_BADGE as ORDER_TYPE_LABEL } from "@/lib/orderTypes";

const ACTIVE_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OPEN",
  // ON_THE_WAY = pedido asignado a repartidor y en camino. Es el valor real
  // del enum OrderStatus (antes se listaba "OUT_FOR_DELIVERY", un nombre
  // fantasma que nunca coincidía, por lo que el pedido asignado desaparecía
  // de "Tickets abiertos"). Sigue abierto hasta DELIVERED/CANCELLED.
  "ON_THE_WAY",
]);

// Orígenes que cuentan como "pedido web" (tienda en línea). KIOSK queda fuera
// porque tiene su propio flujo de notificación. WHATSAPP entra aquí para que los
// pedidos creados por el bridge de WhatsApp (packages/wa-orders) aparezcan en el
// panel "Pedidos Web" y el cajero los confirme antes de cocina.
const ONLINE_SOURCES = new Set(["ONLINE", "STORE", "WHATSAPP"]);

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const mounted = useHydrated();
  const [askingAdminPin, setAskingAdminPin] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showWebOrders, setShowWebOrders] = useState(false);
  const [acceptingWebId, setAcceptingWebId] = useState<string | null>(null);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showCatalogSettings, setShowCatalogSettings] = useState(false);
  const [mobileView, setMobileView] = useState<"menu" | "ticket">("menu");

  // Sistema de notificaciones en tiempo real vía Socket.io. Le pasamos un
  // callback (vía ref, ver abajo) para auto-imprimir la comanda de los pedidos
  // web al entrar: el backend cloud no alcanza las impresoras LAN, así que la
  // caja es quien imprime.
  const autoPrintWebOrderRef = useRef<((order: any) => void) | null>(null);
  // Lock in-flight para que flushPendingRound no POSTee la misma ronda 2x.
  const flushingRoundRef = useRef(false);
  useNotifications({ onOrderNew: (order) => autoPrintWebOrderRef.current?.(order) });

  // Mantener la pantalla encendida mientras esté abierto el shell de
  // cajero (Capacitor only — no-op en web). Si el cajero está esperando
  // al cliente, evita que la tablet apague la pantalla cada minuto.
  useKeepAwake(true);

  const isOrdersOpen = useUIStore((s) => s.isOrdersOpen);
  const activeTicket = useTicketStore((s) => s.getActiveTicket());
  const updateTicket = useTicketStore((s) => s.updateTicket);
  const editingIndex = useTicketStore((s) => s.editingIndex);

  // Al re-editar un item del carrito en móvil, el configurador vive en el
  // área del catálogo: forzamos la vista "menu" para que sea visible.
  // Diferido a microtask (como el resto de effects del layout) para no
  // disparar set-state sincrónico dentro del effect.
  useEffect(() => {
    if (editingIndex == null) return;
    queueMicrotask(() => setMobileView("menu"));
  }, [editingIndex]);
  const activeOrderId = useActiveOrderStore((s) => s.activeOrderId);
  // Intención agendada desde la pantalla de inicio (Imprimir/Cobrar): el layout
  // la consume una vez al montar con la cuenta ya activa (ver effect abajo).
  const pendingAction = useActiveOrderStore((s) => s.pendingAction);
  const pendingActionFiredRef = useRef(false);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const itemCount = activeTicket.items.reduce((acc, i) => acc + i.quantity, 0);
  const sidebarWidth = useClientValue(
    () => sidebarPresetToPx(readSidebarPreset()),
    sidebarPresetToPx(DEFAULT_SIDEBAR_PRESET),
    subscribeToEvents(SIDEBAR_WIDTH_CHANGED_EVENT, "storage"),
  );

  const [openOrders, setOpenOrders] = useState<any[]>([]);
  // Pestaña Abiertas/Cobradas del drawer de tickets + datos del modo "Cobradas".
  const [ordersMode, setOrdersMode] = useState<"open" | "paid">("open");
  const [paidOrders, setPaidOrders] = useState<PaidTicketLite[]>([]);
  const [paidLoading, setPaidLoading] = useState(false);
  const [deliveryDrivers, setDeliveryDrivers] = useState<
    { id: string; name: string; isAvailable?: boolean }[]
  >([]);
  const [payOrder, setPayOrder] = useState<any | null>(null);
  // Overlay "Preparando cobro…" que cubre el catálogo/ticket entre el tap en
  // "Cobrar" y la apertura del PaymentModal. Arranca ENCENDIDO si entramos desde
  // la pantalla de inicio con la intención "pay", para que el cajero nunca vea
  // el ticket editable antes del cobro — pasa directo de "Cobrar" al modal de
  // pago. Se apaga en cuanto el modal abre (o por seguridad a los segundos).
  const [chargingIntent, setChargingIntent] = useState(
    () => useActiveOrderStore.getState().pendingAction === "pay",
  );
  const [reprintKitchenOrder, setReprintKitchenOrder] = useState<any | null>(null);
  const [changeTypeOrder, setChangeTypeOrder] = useState<any | null>(null);
  const [moveOrder, setMoveOrder] = useState<any | null>(null);
  const [splitOrder, setSplitOrder] = useState<any | null>(null);
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);
  const [showShift, setShowShift] = useState(false);

  const {
    isLocked,
    restaurantName,
    currentEmployee,
    logout,
  } = useTPVAuth();

  // FASE 4: cache de impresoras LAN + datos del recibo. Se carga una vez
  // al montar el layout y se refresca con el evento `printers-changed`.
  const { printers } = usePrinters();
  const { businessName, businessFooter, terminalName } = useReceiptIdentity();
  const { config: ticketConfig } = useFullTicketConfig();
  const { kitchenConfig } = useKitchenConfig();
  const tpvConfig = useTpvConfig();
  const showVoiceOrderDictation =
    tpvConfig.extra?.voiceOrderDictationEnabled === true;

  const fetchOpenOrders = useCallback(async () => {
    try {
      // scope=active → el backend ya filtra a pedidos abiertos (payload chico).
      // Mantenemos el filtro cliente como red de seguridad.
      const { data } = await api.get("/api/orders/admin?scope=active");
      const list = Array.isArray(data) ? data : [];
      setOpenOrders(list.filter((o: any) => ACTIVE_STATUSES.has(o.status)));
    } catch (err) {
      console.error("Error cargando órdenes abiertas:", err);
    }
  }, []);

  // Tickets COBRADOS del último mes (pestaña "Cobradas"). Local-first: pinta el
  // cache al instante (stale-while-revalidate) y revalida contra el backend.
  // El backend (scope=paid) manda payload ligero sin items; el detalle completo
  // para reimprimir el recibo se baja on-demand por id en handleReprintOrder.
  const fetchPaidOrders = useCallback(async () => {
    const cached = readPaidTicketsCache();
    if (cached.length) setPaidOrders(cached);
    setPaidLoading(cached.length === 0);
    try {
      const { data } = await api.get("/api/orders/admin?scope=paid");
      const list = Array.isArray(data) ? data : [];
      const lite: PaidTicketLite[] = list.map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber || `#${String(o.id).slice(-6).toUpperCase()}`,
        customerName:
          o.ticketName || o.customerName || o.user?.name || "Público general",
        orderType: o.orderType || null,
        total: Number(o.total ?? 0),
        paidAt: o.paidAt || null,
        createdAt: o.createdAt || null,
        paymentMethod: o.paymentMethod || null,
      }));
      setPaidOrders(lite);
      writePaidTicketsCache(lite);
    } catch (err) {
      console.error("Error cargando tickets cobrados:", err);
    } finally {
      setPaidLoading(false);
    }
  }, []);

  // Repartidores activos para asignar desde el drawer de tickets abiertos.
  // GET /api/delivery devuelve los empleados DELIVERY activos de la sucursal.
  const fetchDeliveryDrivers = useCallback(async () => {
    try {
      const { data } = await api.get("/api/delivery");
      const list = Array.isArray(data) ? data : [];
      setDeliveryDrivers(
        list
          .filter((d: any) => d.isActive !== false)
          .map((d: any) => ({ id: d.id, name: d.name, isAvailable: d.isAvailable })),
      );
    } catch (err) {
      console.error("Error cargando repartidores:", err);
    }
  }, []);

  useEffect(() => {
    if (!mounted || isLocked) return;
    let cancelled = false;
    // Carga inicial diferida (ver impresoras): evita set-state-in-effect.
    queueMicrotask(() => { if (!cancelled) fetchOpenOrders(); });
    const id = setInterval(fetchOpenOrders, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [mounted, isLocked, fetchOpenOrders]);

  const fetchShift = useCallback(async () => {
    try {
      const { data } = await api.get("/api/shifts/active");
      const isOpen = Boolean(data?.isOpen ?? data?.id);
      if (typeof window !== "undefined") {
        localStorage.setItem("tpv-shift-open", isOpen ? "true" : "false");
      }
      setShiftOpen(isOpen);
    } catch {
      if (typeof window !== "undefined") {
        localStorage.setItem("tpv-shift-open", "false");
      }
      setShiftOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted || isLocked) return;
    let cancelled = false;
    // Carga inicial diferida (ver impresoras): evita set-state-in-effect.
    queueMicrotask(() => { if (!cancelled) fetchShift(); });
    const id = setInterval(fetchShift, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [mounted, isLocked, fetchShift]);

  const handleConfirmDrawerPayment = async (
    method: string,
    _tip?: unknown,
    _driverId?: string | null,
    _printReceipt?: boolean,
    account?: { employeeId: string; discountPct: number | null } | null,
  ) => {
    if (!payOrder) return;

    // Cobro "a cuenta de empleado": no entra a caja; el backend aplica el
    // descuento de empleado y genera el cargo que se descuenta de la raya.
    // Requiere conexión (resolución server-side del descuento + módulo nómina).
    if (method === "EMPLOYEE_ACCOUNT") {
      if (!account?.employeeId) {
        toast.error("Selecciona un empleado");
        return;
      }
      try {
        await api.post(`/api/orders/${payOrder.id}/charge-to-employee`, {
          employeeId: account.employeeId,
          discountPct: account.discountPct,
        });
        toast.success("Cargado a la cuenta del empleado");
      } catch (e: any) {
        toast.error(
          "No se pudo cargar a cuenta: " +
            (e?.response?.data?.error || e?.message || "fallo"),
        );
        return;
      }
      setPayOrder(null);
      useActiveOrderStore.getState().clear();
      useTicketStore.getState().clearActiveItems();
      fetchOpenOrders();
      router.replace("/pos/order-type");
      return;
    }

    const res = await apiOrQueue(
      "payment",
      "PUT",
      `/api/orders/${payOrder.id}/payment`,
      { paymentMethod: method }
    );
    if (!res.ok) {
      toast.error("Error al cobrar: " + (res.error || ""));
      return;
    }
    toast.success(res.queued ? "Cobro en cola · se registrará al volver la red" : "Cobro procesado");
    // La cuenta quedó cerrada (PAID + DELIVERED): no debe seguir como ticket
    // activo. Limpiamos el contexto y volvemos a la pantalla de inicio —
    // mismo patrón que eliminar/mover/fusionar. Sin esto el cajero quedaba
    // parado en el editor con la cuenta recién pagada todavía "abierta", lo
    // que se leía como "no se cobró" (sobre todo al cobrar desde inicio).
    setPayOrder(null);
    useActiveOrderStore.getState().clear();
    useTicketStore.getState().clearActiveItems();
    fetchOpenOrders();
    router.replace("/pos/order-type");
  };

  // FASE 12 · COBRO + IMPRESIÓN DE CUENTA DIVIDIDA (E2E)
  //
  // Lifecycle:
  //   1. Toast loading "Imprimiendo N tickets..."
  //   2. Se construye un ReceiptInput común con items + totales y se
  //      enrutan los N tickets a impresoras CASHIER vía printer-tcp:
  //        - EQUAL  → printEqualSplitReceipts(printers, input, parts)
  //        - BY_SEAT → printSplitReceipts(printers, input, parts)
  //   3. Toast loading "Registrando cobro..."
  //      Se cierra la orden con PUT /:id/payment (single transaction —
  //      el backend actual no expone multi-payment, pero los N tickets
  //      ya quedaron impresos para conciliación física en caja).
  //   4. Toast final con éxito / parcial / fallo según el resultado.
  //
  // Nota: la impresión es CASHIER por construcción (printer-tcp filtra
  // por type='CASHIER' en dispatchToStations). Los printerGroupIds son
  // un concepto KITCHEN — no aplican aquí.
  const handleConfirmSplit = async (
    method: string,
    plan: {
      kind: "EQUAL" | "BY_SEAT";
      parts: number;
      perPart?: number;
      bySeat?: { seatNumber: number | null; subtotal: number }[];
    }
  ) => {
    if (!payOrder) return;

    const partsLabel = `${plan.parts} parte${plan.parts === 1 ? "" : "s"}`;
    const toastId = toast.loading(`Imprimiendo ${partsLabel}...`);

    try {
      // Reusamos el helper existente para mapear items raw → TicketItem.
      // Este flujo no necesita printerGroupIds (esos son para cocina).
      const items: TicketItem[] = orderItemsToTicketItems(payOrder.items || []);

      const subtotalCalc = items.reduce(
        (acc, it) =>
          acc +
          it.price * it.quantity +
          (it.modifiers || []).reduce(
            (m, mod) => m + (mod.priceAdd || 0) * it.quantity,
            0
          ),
        0
      );

      const orderNum =
        payOrder.orderNumber || String(payOrder.id).slice(-6).toUpperCase();
      const receiptInput: ReceiptInput = {
        ...buildReceiptIdentityFields(ticketConfig, { businessName, businessFooter }, restaurantName, orderNum),
        orderNumber: orderNum,
        orderType: payOrder.orderType || null,
        tableNumber: payOrder.table?.name || payOrder.tableNumber || null,
        customerName: payOrder.customerName || payOrder.user?.name || null,
        customerPhone: payOrder.customerPhone || null,
        numberOfGuests: payOrder.numberOfGuests ?? null,
        cashierName: currentEmployee?.name || null,
        terminalName: terminalName || null,
        items,
        subtotal: Number(payOrder.subtotal ?? subtotalCalc),
        discount: Number(payOrder.discount ?? 0),
        promoDiscount: Number(payOrder.promoDiscount ?? 0),
        tax: Number(payOrder.tax ?? 0),
        tip: Number(payOrder.tip ?? 0),
        // Envío (DELIVERY): el backend ya lo sumó al total; aquí se DESGLOSA
        // como renglón "Envío:" para que productos + envío − descuento = TOTAL.
        deliveryFee: Number(payOrder.deliveryFee ?? 0),
        total: Number(payOrder.total ?? subtotalCalc),
        paymentMethod: method,
        paid: true, // se está cobrando ahora → recibo pagado
      };

      // Dispatch a CASHIER printers según el plan.
      const printRes =
        plan.kind === "EQUAL"
          ? await printEqualSplitReceipts(printers, receiptInput, plan.parts)
          : await printSplitReceipts(printers, receiptInput, plan.parts);

      // Cerrar orden en el backend (single PUT — la arquitectura actual
      // no acepta múltiples PaymentTransactions; se documenta para
      // follow-up cuando exista POST /:id/payment-transactions).
      // Si estamos offline, el cobro se encola; los tickets físicos ya
      // se imprimieron arriba, así que el cajero tiene papel para
      // conciliar al volver la red.
      toast.loading("Registrando cobro...", { id: toastId });
      const payRes = await apiOrQueue(
        "payment",
        "PUT",
        `/api/orders/${payOrder.id}/payment`,
        { paymentMethod: method }
      );
      if (!payRes.ok) {
        toast.error(`Error en el cobro: ${payRes.error || "fallo"}`, { id: toastId });
        return;
      }

      // Mensaje final compuesto según el outcome de impresión.
      const ticketsOk = printRes.tickets || 0;
      const ticketsFailed = printRes.failed.length;
      const cobroLabel = payRes.queued ? "Cobro en cola" : "Cobro registrado";

      if (ticketsOk === plan.parts && ticketsFailed === 0) {
        toast.success(
          `${cobroLabel} · ${ticketsOk} ticket${
            ticketsOk === 1 ? "" : "s"
          } impresos en caja`,
          { id: toastId }
        );
      } else if (ticketsOk > 0) {
        toast.warning(
          `${cobroLabel} · ${ticketsOk}/${plan.parts} ticket${
            plan.parts === 1 ? "" : "s"
          } impresos${
            ticketsFailed > 0 ? ` · ${ticketsFailed} fallaron` : ""
          }`,
          { id: toastId }
        );
      } else {
        toast.warning(
          `${cobroLabel} · sin impresoras CASHIER activas (${
            printRes.failed[0]?.error || "sin destinos"
          })`,
          { id: toastId }
        );
      }

      // Igual que el cobro simple: la cuenta quedó cerrada, limpiamos el
      // contexto activo y volvemos a inicio para no dejar al cajero en el
      // editor con la cuenta ya pagada.
      setPayOrder(null);
      useActiveOrderStore.getState().clear();
      useTicketStore.getState().clearActiveItems();
      fetchOpenOrders();
      router.replace("/pos/order-type");
    } catch (err: any) {
      toast.error(
        `Error en el cobro dividido: ${
          err?.response?.data?.error || err?.message || "fallo desconocido"
        }`,
        { id: toastId }
      );
    }
  };

  // Carga la orden completa (con items, descuentos, etc.) para usar en
  // detalle o cobro. Si la red falla, devolvemos lo que ya teníamos del
  // listado para que el usuario al menos vea el header.
  const fetchFullOrder = async (o: any) => {
    try {
      const { data } = await api.get(`/api/orders/${o.id}`);
      return data;
    } catch {
      return o;
    }
  };

  const openOrderInCatalog = useCallback((o: any) => {
    const isDineIn = o.orderType === "DINE_IN";
    const tableName =
      o.table?.name || (o.tableNumber != null ? String(o.tableNumber) : "");

    useTicketStore.getState().updateTicket({
      type: o.orderType || "TAKEOUT",
      tableId: o.tableId || o.table?.id || "",
      tableName,
      table: tableName,
      numberOfGuests: o.numberOfGuests ?? null,
      activeSeat: isDineIn ? 1 : null,
      items: [],
      name: o.customerName || o.user?.name || "",
      phone: o.customerPhone || "",
      address: o.deliveryAddress || "",
      discount: 0,
    });
    useActiveOrderStore.getState().setActiveOrder(
      o.id,
      o.tableId || o.table?.id || "",
      o.orderNumber ?? null,
    );
    setShowOrders(false);
    setShowWebOrders(false);
    setMobileView("menu");
    useUIStore.getState().setIsOrdersOpen(false);
  }, []);

  const handleOpenOrderInCatalog = async (o: any) => {
    const full = await fetchFullOrder(o);
    openOrderInCatalog(full);
    toast.success(
      "Ticket abierto: agrega productos o usa el menú para reimprimir",
    );
  };

  const handleOpenPayment = async (o: any) => {
    // El cobro necesita los datos completos (modificadores y printerGroups
    // para enrutar la comanda a cocina), así que esperamos el detalle —
    // sin apertura optimista, porque es una acción de dinero. Cerramos el
    // drawer al mismo tiempo que abrimos el modal: el drawer es z-[120] y el
    // PaymentModal z-[100], si quedara abierto taparía el cobro.
    // Mientras se baja el detalle mostramos el overlay "Preparando cobro…"
    // para que entre el tap y el modal no se vea el catálogo/ticket editable.
    setChargingIntent(true);
    try {
      const full = await fetchFullOrder(o);
      setShowOrders(false);
      useUIStore.getState().setIsOrdersOpen(false);
      setPayOrder(full);
    } finally {
      setChargingIntent(false);
    }
  };

  // FASE 6 · MODO PRÉSTAMO DE CAJA
  // Cuando un mesero usa la tablet principal, ocultamos las funciones de
  // dinero (Cobrar, abrir cajón implícito por payment flow). El mesero
  // SÍ puede tomar pedidos, ver tickets abiertos y reimprimir comandas
  // — solo el cobro queda gateado al rol de cajero.
  const isLoanMode = currentEmployee?.role === "WAITER";

  // Wrapper que respeta el modo préstamo. Si un WAITER intenta abrir
  // payment (ej. tap accidental antes de que la UI se actualice) lo
  // bloqueamos en el layer de handler para defensa en profundidad.
  // Declarado aquí (antes de handleChargeActiveOrder y del effect que dispara
  // la intención de la pantalla de inicio) para no quedar como forward-ref.
  const handleOpenPaymentGuarded = async (o: any) => {
    if (isLoanMode) {
      setChargingIntent(false);
      toast.error("Cobro no permitido en modo préstamo de caja");
      return;
    }
    await handleOpenPayment(o);
  };

  // Mapea items raw del backend al shape de printer-tcp. Resuelve
  // printerGroupIds (override item-level → fallback categoría) para que
  // las comandas de cocina se enruten igual que en el flow de cobro.
  const orderItemsToTicketItems = (rawItems: any[]): TicketItem[] => {
    return (rawItems || []).map((it: any) => {
      const itemOverride = (it.menuItem?.printerGroups ?? [])
        .map((m: any) => m.printerGroup?.id)
        .filter((id: unknown): id is string => Boolean(id));
      const categoryDefault = (it.menuItem?.category?.printerGroups ?? [])
        .map((m: any) => m.printerGroup?.id)
        .filter((id: unknown): id is string => Boolean(id));
      const printerGroupIds =
        itemOverride.length > 0 ? itemOverride : categoryDefault;
      return {
        name: it.name || it.menuItem?.name || "Producto",
        quantity: Number(it.quantity ?? 1),
        price: Number(it.unitPrice ?? it.price ?? 0),
        notes: it.notes || null,
        seatNumber: typeof it.seatNumber === "number" ? it.seatNumber : null,
        kitchenDetail: comboKitchenDetail(it.menuItem),
        modifiers: (it.modifiers || []).map((m: any) => ({
          name: m.name || m.modifier?.name || "",
          priceAdd: Number(m.priceAdd ?? m.price ?? 0),
        })),
        printerGroupIds,
      };
    });
  };

  // AUTO-IMPRESIÓN DE PEDIDOS WEB (online / WhatsApp / tienda)
  // El cajero "no veía" los pedidos web porque solo llegaba una notificación en
  // pantalla. Aquí, al entrar un order:new de una fuente web, imprimimos la
  // comanda en cocina automáticamente (el backend cloud no alcanza las
  // impresoras LAN, por eso lo hace la tablet). Los pedidos TPV ya imprimen al
  // crearse, así que se filtran por source. Dedupe por id para no reimprimir en
  // reconexión o por el doble order:new (creación + pago) de la tienda.
  const printedWebOrders = useRef<Set<string>>(new Set());
  useEffect(() => {
    autoPrintWebOrderRef.current = async (order: any) => {
      const id: string | undefined = order?.id || order?.orderId;
      if (!id) return;
      const src = String(order?.source || "").toUpperCase();
      // Si viene source y NO es web (p.ej. TPV/WAITER), no imprimir: esos ya
      // imprimieron localmente al crearse. Si no viene source (payload mínimo
      // de la tienda), lo confirmamos con el detalle más abajo.
      if (src && !ONLINE_SOURCES.has(src)) return;
      if (printedWebOrders.current.has(id)) return;
      printedWebOrders.current.add(id);
      try {
        // Siempre pedimos el detalle: el payload del socket no trae los
        // printerGroups/categorías que necesita el ruteo a cocina.
        const full = await fetchFullOrder({ id });
        const fullSrc = String(full?.source || "").toUpperCase();
        if (fullSrc && !ONLINE_SOURCES.has(fullSrc)) {
          printedWebOrders.current.delete(id);
          return;
        }
        const items = orderItemsToTicketItems(full.items || []);
        if (items.length === 0) {
          printedWebOrders.current.delete(id);
          return;
        }
        const res = await printKitchenTickets(printers, {
          orderNumber: full.orderNumber || String(full.id).slice(-6).toUpperCase(),
          orderType: full.orderType || null,
          tableNumber: full.table?.name || full.tableNumber || null,
          customerName: full.customerName || full.user?.name || null,
          items,
          // Banner PAGADO / PENDIENTE DE PAGO en la comanda web: el pago online
          // llega PAID; el contra-entrega/efectivo llega PENDING y hay que cobrar.
          paid: full.paymentStatus === "PAID" || full.cashCollected === true,
          paymentMethod: full.paymentMethod || null,
          config: kitchenConfig ?? undefined,
        });
        const folio = full.orderNumber ? `#${full.orderNumber}` : "";
        if (res.ok > 0) {
          toast.success(`🖨️ Pedido web ${folio} impreso en cocina`);
        } else {
          // Permitir reintento (manual o por re-evento) si la impresora falló.
          printedWebOrders.current.delete(id);
          toast.warning(`Pedido web ${folio} recibido — no se pudo imprimir, revisa la impresora`);
        }
      } catch {
        printedWebOrders.current.delete(id);
      }
    };
  }, [printers, kitchenConfig]);

  // FASE 4 · IMPRESIÓN DUAL — TICKET DE CUENTA (CASHIER)
  // El backend Railway no puede llegar a las impresoras LAN del local,
  // así que re-imprimir el ticket de cuenta tiene que disparar desde la
  // tablet. printCustomerReceipt() filtra por type='CASHIER' (o
  // stations:[CASHIER]) y manda solo a las impresoras de mostrador.
  const handleReprintOrder = async (o: any) => {
    try {
      const full = o.items ? o : await fetchFullOrder(o);
      const items = orderItemsToTicketItems(full.items || []);
      const subtotalCalc = items.reduce(
        (acc, it) =>
          acc +
          it.price * it.quantity +
          (it.modifiers || []).reduce(
            (m, mod) => m + (mod.priceAdd || 0) * it.quantity,
            0
          ),
        0
      );
      const fullOrderNum = full.orderNumber || String(full.id).slice(-6).toUpperCase();
      const res = await printCustomerReceipt(printers, {
        ...buildReceiptIdentityFields(ticketConfig, { businessName, businessFooter }, restaurantName, fullOrderNum),
        orderNumber: fullOrderNum,
        orderType: full.orderType || null,
        tableNumber: full.table?.name || full.tableNumber || null,
        // El nombre que el cajero le puso a la cuenta ("Renombrar" → ticketName)
        // tiene prioridad sobre el nombre del cliente, igual que en el listado
        // de tickets abiertos (drawerOrders). Sin esto la cuenta impresa nunca
        // reflejaba el rename.
        customerName: full.ticketName || full.customerName || full.user?.name || null,
        customerPhone: full.customerPhone || null,
        numberOfGuests: full.numberOfGuests ?? null,
        cashierName: currentEmployee?.name || null,
        terminalName: terminalName || null,
        items,
        subtotal: Number(full.subtotal ?? subtotalCalc),
        discount: Number(full.discount ?? 0),
        promoDiscount: Number(full.promoDiscount ?? 0),
        tax: Number(full.tax ?? 0),
        tip: Number(full.tip ?? 0),
        // Envío (DELIVERY): desglosado como renglón "Envío:" (ya viene en total).
        deliveryFee: Number(full.deliveryFee ?? 0),
        total: Number(full.total ?? subtotalCalc),
        paymentMethod: full.paymentMethod || null,
        // Reimpresión de la cuenta: "Pendiente de cobro" si aún no está pagada.
        paid: full.paymentStatus === "PAID",
      });

      if (res.ok > 0 && res.failed.length === 0) {
        toast.success(
          `Cuenta reimpresa en ${res.ok} impresora${res.ok > 1 ? "s" : ""}`
        );
      } else if (res.ok > 0) {
        toast.warning(
          `Cuenta: ${res.ok} ok / ${res.failed.length} fallaron`
        );
      } else {
        toast.error(
          "No se pudo imprimir: " +
            (res.failed[0]?.error || "sin impresoras CASHIER activas")
        );
      }
    } catch (err: any) {
      toast.error(
        "Error al reimprimir: " + (err?.message || "fallo desconocido")
      );
    }
  };

  // FASE 5 · REIMPRESIÓN INTELIGENTE — COMANDA COCINA
  // Abre un modal donde el usuario elige qué items reimprimir (todos por
  // default, parcial si deselecciona). El ticket impreso lleva un banner
  // "*** REIMPRESION ***" para que cocina no prepare dos veces. La
  // impresión real ocurre dentro del modal usando printKitchenTickets
  // con isReprint:true (y isPartial cuando el subset es menor al total).
  const handleReprintKitchen = async (o: any) => {
    const full = o.items ? o : await fetchFullOrder(o);
    if (!full?.items || full.items.length === 0) {
      toast.error("La orden no tiene items para mandar a cocina");
      return;
    }
    setReprintKitchenOrder(full);
  };

  const getActiveOrderForAction = async () => {
    if (!activeOrderId) {
      toast.warning("Abre un ticket para usar esta acción");
      return null;
    }

    const listedOrder =
      openOrders.find((order: any) => order.id === activeOrderId) || {
        id: activeOrderId,
      };
    return fetchFullOrder(listedOrder);
  };

  // Guarda en el backend los productos pendientes de la "nueva ronda" local
  // (los que el cajero agregó pero aún no envió) como una ronda sobre la cuenta
  // abierta. Devuelve true si no había nada pendiente o si se guardó bien; false
  // si falló (en cuyo caso NO se debe seguir con la impresión). Tras guardar,
  // limpia los items locales y bumpea roundsRevision para que el SidebarTicket
  // recargue su historial y no queden duplicados ni desincronización visual.
  const flushPendingRound = async (): Promise<boolean> => {
    if (!activeOrderId) return true;
    const pending = useTicketStore.getState().getActiveTicket().items;
    if (!pending || pending.length === 0) return true;

    // Guarda de re-entrada: leemos los items pendientes y solo los limpiamos
    // DESPUÉS del await. Sin lock, un doble-tap en "Imprimir cuenta" (o
    // imprimir + cobrar casi a la vez) lee la misma ronda dos veces y la
    // POSTea duplicada antes de que clearActiveItems corra.
    if (flushingRoundRef.current) return true;
    flushingRoundRef.current = true;
    try {
      const res = await apiOrQueue(
        "order",
        "POST",
        `/api/orders/${activeOrderId}/items`,
        { items: buildOrderItemsPayload(pending) },
      );
      if (!res.ok) {
        toast.error("No se pudieron guardar los productos: " + (res.error || ""));
        return false;
      }

      useTicketStore.getState().clearActiveItems();
      useActiveOrderStore.getState().bumpRoundsRevision();
      toast.success(
        res.queued
          ? "Productos en cola · se guardarán al volver la red"
          : "Productos guardados en la cuenta",
      );
      return true;
    } finally {
      flushingRoundRef.current = false;
    }
  };

  const handleReprintActiveKitchen = async () => {
    const order = await getActiveOrderForAction();
    if (order) await handleReprintKitchen(order);
  };

  // "Imprimir cuenta" usa el total vigente. Los descuentos se editan
  // exclusivamente en el paso final de cobro. Antes de imprimir guardamos los
  // productos que el cajero haya agregado en la ronda local: así la cuenta
  // impresa los incluye y quedan persistidos (no se pierden al recargar).
  const handleReprintActiveReceipt = async () => {
    if (!activeOrderId) {
      toast.warning("Abre un ticket para usar esta acción");
      return;
    }
    if (!(await flushPendingRound())) return;
    const order = await getActiveOrderForAction();
    if (order) await handleReprintOrder(order);
  };

  const canApplyDiscount = !!currentEmployee?.permissions?.includes("apply_discount");

  // Persiste el descuento mientras el modal de pago sigue abierto.
  const handleApplyPaymentDiscount = async (
    type: "percent" | "fixed",
    value: number,
  ) => {
    if (!payOrder) return;
    try {
      const { data } = await api.put(`/api/orders/${payOrder.id}/discount`, {
        type,
        value,
      });
      setPayOrder((current: any) =>
        current?.id === payOrder.id ? { ...current, ...data } : current,
      );
      toast.success(
        Number(data?.discount ?? 0) > 0
          ? `Descuento aplicado: $${Number(data.discount).toFixed(2)}`
          : "Descuento eliminado",
      );
    } catch (err: any) {
      toast.error(
        "No se pudo aplicar el descuento: " +
          (err?.response?.data?.error || err?.message || "error")
      );
      throw err;
    }
  };

  const handleRenameActiveOrder = async () => {
    const order = await getActiveOrderForAction();
    if (!order) return;
    const currentName = order.ticketName || "";
    const nextName = window.prompt("Nombre del ticket", currentName);
    if (nextName === null || nextName.trim() === currentName) return;
    try {
      await api.patch(`/api/orders/${order.id}/name`, {
        ticketName: nextName.trim(),
      });
      await fetchOpenOrders();
      // Re-hidrata el panel del ticket activo (SidebarTicket observa
      // roundsRevision) para que el nombre nuevo salga también en el header,
      // no solo en el listado de Tickets abiertos.
      if (order.id === activeOrderId) {
        useActiveOrderStore.getState().bumpRoundsRevision();
      }
      toast.success(
        nextName.trim() ? `Ticket renombrado: ${nextName.trim()}` : "Nombre eliminado",
      );
    } catch (err: any) {
      toast.error(
        "No se pudo renombrar: " +
          (err?.response?.data?.error || err?.message || "fallo desconocido"),
      );
    }
  };

  const handleChangeActiveOrderType = async () => {
    const order = await getActiveOrderForAction();
    if (order) setChangeTypeOrder(order);
  };

  const handleMoveActiveOrder = async () => {
    const order = await getActiveOrderForAction();
    if (order) setMoveOrder(order);
  };

  const handleSplitActiveOrder = async () => {
    const order = await getActiveOrderForAction();
    if (!order) return;
    if (!Array.isArray(order.items) || order.items.length < 2) {
      toast.warning("El ticket necesita al menos dos productos para dividirse");
      return;
    }
    setSplitOrder(order);
  };

  const handleDeleteActiveOrder = async () => {
    const order = await getActiveOrderForAction();
    if (!order) return;
    const label = order.orderNumber || String(order.id).slice(-6).toUpperCase();
    if (!window.confirm(`¿Eliminar el ticket #${label}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await api.put(`/api/orders/${order.id}/status`, { status: "CANCELLED" });
      useActiveOrderStore.getState().clear();
      useTicketStore.getState().clearActiveItems();
      await fetchOpenOrders();
      toast.success("Ticket eliminado");
      router.replace("/pos/order-type");
    } catch (err: any) {
      toast.error(
        "No se pudo eliminar: " +
          (err?.response?.data?.error || err?.message || "fallo desconocido"),
      );
    }
  };

  const handleChargeActiveOrder = async () => {
    // Una sola lectura de red: handleOpenPayment ya baja el detalle completo.
    // Antes pre-cargábamos con getActiveOrderForAction y handleOpenPayment lo
    // volvía a bajar (doble fetch en serie), por lo que el cobro desde la
    // pantalla de inicio se sentía en dos pasos ("abre el ticket y luego
    // cobra"). Pasamos solo el id y dejamos que handleOpenPayment lo resuelva.
    if (!activeOrderId) {
      setChargingIntent(false);
      toast.warning("Abre un ticket para usar esta acción");
      return;
    }
    await handleOpenPaymentGuarded({ id: activeOrderId });
  };

  // Acción agendada desde la pantalla de inicio (OrderTypeSelector): al entrar a
  // una cuenta con "Imprimir" o "Cobrar", el layout la ejecuta una sola vez en
  // cuanto la cuenta está activa. Para "print" esperamos a que las impresoras
  // LAN estén descubiertas (si no, no hay CASHIER a la cual mandar la cuenta).
  // Se consume de forma atómica + ref para no repetirse en cada render/poll.
  useEffect(() => {
    if (pendingActionFiredRef.current) return;
    if (!pendingAction || !activeOrderId) return;
    if (pendingAction === "print" && printers.length === 0) return;
    pendingActionFiredRef.current = true;
    const action = useActiveOrderStore.getState().consumePendingAction();
    // Diferido a microtask: estas acciones disparan setState (PaymentModal /
    // toasts) y no deben correr síncronas dentro del effect.
    queueMicrotask(() => {
      if (action === "pay") void handleChargeActiveOrder();
      else if (action === "print") void handleReprintActiveReceipt();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction, activeOrderId, printers.length]);

  // Seguridad del overlay "Preparando cobro…": normalmente lo apaga el finally
  // de handleOpenPayment al abrir el modal, y el render ya lo oculta cuando hay
  // payOrder. Este timeout es solo el respaldo: si el cobro nunca llega a abrir
  // (id ausente, hidratación rara del store) lo bajamos a los pocos segundos
  // para no dejar al cajero atrapado en un spinner. El setState va diferido
  // dentro del setTimeout (no síncrono en el effect).
  useEffect(() => {
    if (!chargingIntent || payOrder) return;
    const t = setTimeout(() => setChargingIntent(false), 7000);
    return () => clearTimeout(t);
  }, [chargingIntent, payOrder]);

  const handleConfirmActiveSplit = async (itemIds: string[]) => {
    if (!splitOrder) return;
    try {
      const { data } = await api.post(`/api/orders/${splitOrder.id}/split`, {
        itemIds,
      });
      setSplitOrder(null);
      await fetchOpenOrders();
      const newNumber =
        data?.created?.orderNumber ||
        String(data?.created?.id || "").slice(-6).toUpperCase();
      toast.success(`Ticket dividido · nuevo #${newNumber}`);
    } catch (err: any) {
      toast.error(
        "No se pudo dividir: " +
          (err?.response?.data?.error || err?.message || "fallo desconocido"),
      );
      throw err;
    }
  };

  // Tras desbloquear, /pos/order-type ya es la pantalla canónica de elección
  // de tipo. Reabrir el modal aquí causaba un loop infinito al hidratarse
  // Zustand (B3). Mantenemos solo el botón "Tickets abiertos" del drawer.

  useEffect(() => {
    if (!showOrders) return;
    let cancelled = false;
    // Arranque diferido (ver impresoras): evita set-state-in-effect.
    queueMicrotask(() => {
      if (cancelled) return;
      fetchOpenOrders();
      fetchDeliveryDrivers();
    });
    return () => { cancelled = true; };
  }, [showOrders, fetchOpenOrders, fetchDeliveryDrivers]);

  // Al cambiar a la pestaña "Cobradas" (con el drawer abierto) se carga el
  // último mes. No se pollea: es histórico, basta con refrescar al entrar.
  const drawerVisible = isOrdersOpen || showOrders;
  useEffect(() => {
    if (!drawerVisible || ordersMode !== "paid") return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) fetchPaidOrders(); });
    return () => { cancelled = true; };
  }, [drawerVisible, ordersMode, fetchPaidOrders]);

  // Auto-abrir el drawer cuando llegamos desde el atajo "Tickets Abiertos"
  // del Panel de Operación (/pos/order-type → /pos/menu?orders=1). Se lee
  // de window.location para evitar la dependencia de useSearchParams
  // (requiere Suspense en static export).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("orders") !== "1") return;
    let cancelled = false;
    // Diferido a microtask (ver impresoras): setShowOrders ya no corre
    // sincrónicamente en el effect (set-state-in-effect).
    queueMicrotask(() => {
      if (cancelled) return;
      setShowOrders(true);
      // Limpia el query param para que un refresh manual no lo reabra.
      window.history.replaceState({}, "", window.location.pathname);
    });
    return () => { cancelled = true; };
  }, []);

  const drawerOrders = openOrders.map((o: any) => ({
    id: o.id,
    orderNumber: o.orderNumber || `#${String(o.id).slice(-6).toUpperCase()}`,
    customerName: o.ticketName || o.customerName || o.user?.name || "Público general",
    type: ORDER_TYPE_LABEL[o.orderType] || o.orderType || "ORDEN",
    status: o.status,
    total: Number(o.total ?? 0),
    time: timeAgo(o.createdAt),
    createdAt: o.createdAt,
    itemsCount: Array.isArray(o.items) ? o.items.length : 0,
    driver: o.deliveryDriverName || undefined,
    needsDriver: o.orderType === "DELIVERY" && !o.deliveryDriverId,
  }));

  // Tickets cobrados → shape del drawer. El "createdAt" del tile muestra la
  // hora de COBRO (paidAt) para esta pestaña; itemsCount es 0 (payload ligero,
  // sin items) y se sustituye por el chip de método de pago en el drawer.
  const drawerPaidOrders = paidOrders.map((p) => ({
    id: p.id,
    orderNumber: p.orderNumber,
    customerName: p.customerName,
    type: ORDER_TYPE_LABEL[p.orderType || ""] || p.orderType || "ORDEN",
    status: "PAID",
    total: p.total,
    time: timeAgo(p.paidAt || p.createdAt || new Date().toISOString()),
    createdAt: p.paidAt || p.createdAt || undefined,
    itemsCount: 0,
    paymentMethod: p.paymentMethod,
  }));

  // Pedidos de la tienda en línea (source ONLINE/STORE) para la pestaña web.
  // Salen del mismo openOrders ya polleado, así que sobreviven a un reinicio
  // del TPV (el backend es la fuente de verdad, no solo la notificación).
  const webOrders = openOrders.filter((o: any) =>
    ONLINE_SOURCES.has(String(o.source || "").toUpperCase()),
  );
  const webOrdersData = webOrders.map((o: any) => ({
    id: o.id,
    orderNumber: o.orderNumber || `#${String(o.id).slice(-6).toUpperCase()}`,
    customerName: o.customerName || o.user?.name || "Cliente",
    customerPhone: o.customerPhone || null,
    orderType: o.orderType || "TAKEOUT",
    status: o.status,
    total: Number(o.total ?? 0),
    createdAt: o.createdAt,
    itemsCount: Array.isArray(o.items) ? o.items.length : 0,
    address: o.deliveryAddress || o.address?.street || null,
  }));

  const canMergeOpenOrders = currentEmployee?.role
    ? ["ADMIN", "SUPER_ADMIN", "OWNER", "MANAGER", "CASHIER"].includes(
        currentEmployee.role,
      )
    : false;

  // Corregir el método de pago de un ticket YA cobrado (pestaña "Cobradas").
  // Mismo gate que el backend (requirePermission('reopen_table')): roles
  // privilegiados pasan sin permiso explícito, el resto necesita reopen_table.
  const canCorrectPayment =
    (currentEmployee?.role
      ? ["ADMIN", "SUPER_ADMIN", "OWNER", "MANAGER"].includes(
          currentEmployee.role,
        )
      : false) || !!currentEmployee?.permissions?.includes("reopen_table");

  const handleCorrectPaymentMethod = useCallback(
    async (o: { id: string }, method: string) => {
      try {
        const { data } = await api.put(
          `/api/orders/${o.id}/correct-payment-method`,
          { paymentMethod: method },
        );
        // Refleja el cambio en el cache local de cobrados (la fila y el chip de
        // método se actualizan al instante; el picker excluye el nuevo método).
        setPaidOrders((prev) => {
          const next = prev.map((p) =>
            p.id === o.id ? { ...p, paymentMethod: method } : p,
          );
          writePaidTicketsCache(next);
          return next;
        });
        const label =
          method === "CASH"
            ? "Efectivo"
            : method === "TRANSFER"
              ? "Transferencia"
              : method === "CARD"
                ? "Tarjeta"
                : method;
        toast.success(`Método corregido a ${label}`);
        if (data?.cashAdjusted === "locked") {
          toast.warning(
            "El corte del repartidor ya estaba cerrado; la caja no se ajustó automáticamente.",
          );
        }
      } catch (err: any) {
        toast.error(
          err?.response?.data?.error || "No se pudo corregir el método de pago",
        );
        throw err;
      }
    },
    [],
  );

  const handleMergeOpenOrders = useCallback(
    async (
      targetOrder: { id: string; orderNumber: string },
      sourceOrders: { id: string }[],
    ) => {
      let mergedCount = 0;
      try {
        for (const sourceOrder of sourceOrders) {
          await api.post(`/api/orders/${sourceOrder.id}/merge/${targetOrder.id}`);
          mergedCount += 1;
        }
        toast.success(
          `${sourceOrders.length + 1} tickets unidos en #${targetOrder.orderNumber}`,
        );
      } catch (err: any) {
        const detail =
          err?.response?.data?.error || err?.message || "fallo desconocido";
        toast.error(
          mergedCount > 0
            ? `${mergedCount} cuenta${mergedCount === 1 ? "" : "s"} unida${
                mergedCount === 1 ? "" : "s"
              }; no se pudo terminar: ${detail}`
            : `No se pudieron juntar los tickets: ${detail}`,
        );
        throw err;
      } finally {
        await fetchOpenOrders();
      }
    },
    [fetchOpenOrders],
  );

  // Asigna un repartidor a TODOS los tickets seleccionados en el drawer.
  // Reutiliza PUT /api/delivery/assign (un request por pedido), que además
  // mueve cada orden a ON_THE_WAY y notifica al repartidor por socket.
  const handleAssignDriverToOrders = useCallback(
    async (
      ordersToAssign: { id: string }[],
      driverId: string,
    ) => {
      let assigned = 0;
      try {
        for (const order of ordersToAssign) {
          await api.put("/api/delivery/assign", { orderId: order.id, driverId });
          assigned += 1;
        }
        const driverName =
          deliveryDrivers.find((d) => d.id === driverId)?.name || "repartidor";
        toast.success(
          `${assigned} pedido${assigned === 1 ? "" : "s"} enviado${
            assigned === 1 ? "" : "s"
          } a ${driverName}`,
        );
      } catch (err: any) {
        const detail =
          err?.response?.data?.error || err?.message || "fallo desconocido";
        toast.error(
          assigned > 0
            ? `${assigned} asignado${assigned === 1 ? "" : "s"}; no se pudo terminar: ${detail}`
            : `No se pudo asignar repartidor: ${detail}`,
        );
        throw err;
      } finally {
        await fetchOpenOrders();
      }
    },
    [deliveryDrivers, fetchOpenOrders],
  );

  // Enviar (reimprimir) a cocina la comanda de los tickets seleccionados en
  // el drawer, sin abrirlos. Best-effort por pedido; isReprint para que
  // cocina no prepare doble. Reusa orderItemsToTicketItems (printerGroups).
  const handleSendOrdersToKitchen = async (
    ordersToSend: { id: string }[],
  ) => {
    const t = toast.loading(`Enviando ${ordersToSend.length} a cocina...`);
    let sent = 0;
    let failed = 0;
    for (const o of ordersToSend) {
      try {
        const full = await fetchFullOrder(o);
        const items = orderItemsToTicketItems(full.items || []);
        if (items.length === 0) {
          failed += 1;
          continue;
        }
        const res = await printKitchenTickets(printers, {
          orderNumber:
            full.orderNumber || String(full.id).slice(-6).toUpperCase(),
          orderType: full.orderType || null,
          tableNumber: full.table?.name || full.tableNumber || null,
          customerName: full.customerName || full.user?.name || null,
          items,
          isReprint: true,
          config: kitchenConfig ?? undefined,
        });
        if (res.ok > 0) sent += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    if (failed === 0) {
      toast.success(
        `${sent} comanda${sent === 1 ? "" : "s"} enviada${
          sent === 1 ? "" : "s"
        } a cocina`,
        { id: t },
      );
    } else {
      toast.warning(
        `${sent} enviada${sent === 1 ? "" : "s"} - ${failed} fallaron`,
        { id: t },
      );
    }
  };

  // VALIDACIÓN DE ROL
  // FASE 6: WAITER puede acceder en modo "préstamo de caja" (cuando la
  // tablet está configurada como CAJA). El layout oculta funciones de
  // dinero vía isLoanMode. Para tablets MESERO el redirect a /meseros
  // se hace en useTPVAuth antes de llegar aquí.
  useEffect(() => {
    if (mounted && currentEmployee) {
      const allowedRoles = ["CASHIER", "OWNER", "ADMIN", "MANAGER", "WAITER"];
      if (!allowedRoles.includes(currentEmployee.role)) {
        console.warn(
          `[SECURITY] Acceso denegado a /pos/menu: rol ${currentEmployee.role} no autorizado`
        );
        router.replace("/");
      }
    }
  }, [mounted, currentEmployee, router]);

  // Abrir cajón monedero: dispara el pulso ESC/POS a la(s) impresora(s)
  // CASHIER (el cajón va físicamente conectado a la de mostrador).
  const handleOpenCashDrawer = useCallback(async () => {
    const t = toast.loading("Abriendo cajón…");
    try {
      const res = await openCashDrawer(printers);
      if (res.ok > 0) {
        toast.success("Cajón abierto", { id: t });
      } else {
        toast.error(res.failed[0]?.error || "No se pudo abrir el cajón", {
          id: t,
        });
      }
    } catch (err: any) {
      toast.error("Error al abrir cajón: " + (err?.message || "fallo"), {
        id: t,
      });
    }
  }, [printers]);

  // Sincronizar ahora: hace DOS cosas.
  //   1. Refresca el catálogo (re-baja menú/categorías ignorando el TTL) para
  //      que un producto recién dado de alta en /admin/menu se vea al instante
  //      sin esperar la ventana fresca de 5 min.
  //   2. Vacía la cola offline (también corre sola en intervalo) y reporta
  //      cuántas transacciones quedaban pendientes.
  const handleSyncNow = useCallback(async () => {
    // 1. Forzar refresh del catálogo en la página del menú (escucha el evento).
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CATALOG_REFRESH_EVENT));
    }

    // 2. Vaciar la cola offline.
    const pending = useOfflineStore.getState().getUnsyncedTransactions().length;
    if (pending === 0) {
      toast.success("Catálogo actualizado ✓");
      return;
    }
    const t = toast.loading(
      `Sincronizando ${pending} pendiente${pending === 1 ? "" : "s"}…`,
    );
    try {
      await syncOfflineQueue();
      const left = useOfflineStore.getState().getUnsyncedTransactions().length;
      if (left === 0) {
        toast.success("Sincronización completa ✓", { id: t });
      } else {
        toast.warning(`Quedan ${left} sin sincronizar`, { id: t });
      }
    } catch (err: any) {
      toast.error("Error al sincronizar: " + (err?.message || "fallo"), {
        id: t,
      });
    }
  }, []);

  // Aceptar un pedido web: PENDING → CONFIRMED. Tras confirmar, refrescamos el
  // listado para que salga de "nuevos por aceptar" y el badge baje.
  const handleAcceptWebOrder = useCallback(
    async (id: string) => {
      setAcceptingWebId(id);
      try {
        await api.put(`/api/orders/${id}/status`, { status: "CONFIRMED" });
        toast.success("Pedido web aceptado");
        fetchOpenOrders();
      } catch (err: any) {
        toast.error(
          "Error al aceptar: " +
            (err?.response?.data?.error || err?.message || "fallo desconocido"),
        );
      } finally {
        setAcceptingWebId(null);
      }
    },
    [fetchOpenOrders],
  );

  // Los pedidos web también entran directo al catálogo para continuar la
  // cuenta y usar las acciones del ticket activo.
  const handleShowWebDetail = async (id: string) => {
    const o = openOrders.find((x: any) => x.id === id);
    if (!o) return;
    await handleOpenOrderInCatalog(o);
  };

  if (!mounted) return <div className="h-[100dvh] w-full bg-surf-0" />;

  return (
    <div className="flex h-[100dvh] w-full bg-surf-0 overflow-hidden font-sans text-tx-pri">
      {/* SIDE RAIL ELIMINADO */}


      <PurchasesExpensesModal
        isOpen={showExpenses}
        onClose={() => setShowExpenses(false)}
      />

      <AdminPinGuardModal
        isOpen={askingAdminPin}
        onClose={() => setAskingAdminPin(false)}
        onSuccess={() => router.push("/admin")}
      />

      <OrdersDrawer
        isOpen={isOrdersOpen || showOrders}
        onClose={() => {
          setShowOrders(false);
          useUIStore.getState().setIsOrdersOpen(false);
          // Volver a "Abiertas" al cerrar: la próxima apertura arranca en el
          // modo operativo por defecto, no en el histórico de cobrados.
          setOrdersMode("open");
        }}
        mode={ordersMode}
        onModeChange={setOrdersMode}
        paidLoading={paidLoading}
        orders={ordersMode === "paid" ? drawerPaidOrders : drawerOrders}
        onShowDetail={handleOpenOrderInCatalog}
        onConfirmPayment={handleOpenPaymentGuarded}
        onReprintOrder={handleReprintOrder}
        hideMoney={isLoanMode || ordersMode === "paid"}
        canMergeOrders={canMergeOpenOrders && !isLoanMode && ordersMode === "open"}
        onMergeOrders={handleMergeOpenOrders}
        canAssignDriver={canMergeOpenOrders && !isLoanMode && ordersMode === "open"}
        drivers={deliveryDrivers}
        onAssignDriver={handleAssignDriverToOrders}
        canSendToKitchen={ordersMode === "open"}
        onSendToKitchen={handleSendOrdersToKitchen}
        canCorrectPaymentMethod={canCorrectPayment && ordersMode === "paid"}
        onCorrectPaymentMethod={handleCorrectPaymentMethod}
      />

      {reprintKitchenOrder && (
        <ReprintKitchenModal
          isOpen={!!reprintKitchenOrder}
          onClose={() => setReprintKitchenOrder(null)}
          printers={printers}
          config={kitchenConfig}
          orderNumber={
            reprintKitchenOrder.orderNumber ||
            String(reprintKitchenOrder.id).slice(-6).toUpperCase()
          }
          orderType={reprintKitchenOrder.orderType || null}
          tableNumber={
            reprintKitchenOrder.table?.name ||
            reprintKitchenOrder.tableNumber ||
            null
          }
          customerName={
            reprintKitchenOrder.customerName ||
            reprintKitchenOrder.user?.name ||
            null
          }
          items={(reprintKitchenOrder.items || []).map((it: any) => {
            const itemOverride = (it.menuItem?.printerGroups ?? [])
              .map((m: any) => m.printerGroup?.id)
              .filter((id: unknown): id is string => Boolean(id));
            const categoryDefault = (it.menuItem?.category?.printerGroups ?? [])
              .map((m: any) => m.printerGroup?.id)
              .filter((id: unknown): id is string => Boolean(id));
            return {
              id: String(it.id),
              name: it.name || it.menuItem?.name || "Producto",
              quantity: Number(it.quantity ?? 1),
              notes: it.notes || null,
              kitchenDetail: comboKitchenDetail(it.menuItem),
              printerGroupIds:
                itemOverride.length > 0 ? itemOverride : categoryDefault,
              modifiers: (it.modifiers || []).map((m: any) => ({
                name: m.name || m.modifier?.name || "",
                priceAdd: Number(m.priceAdd ?? m.price ?? 0),
              })),
              seatNumber:
                typeof it.seatNumber === "number" ? it.seatNumber : null,
            };
          })}
        />
      )}

      {changeTypeOrder && (
        <ChangeOrderTypeModal
          isOpen={!!changeTypeOrder}
          onClose={() => setChangeTypeOrder(null)}
          orderId={changeTypeOrder.id}
          currentType={changeTypeOrder.orderType ?? null}
          currentAddress={changeTypeOrder.deliveryAddress ?? null}
          onSuccess={() => {
            setChangeTypeOrder(null);
            fetchOpenOrders();
          }}
        />
      )}

      {moveOrder && (
        <MergeTableModal
          isOpen={!!moveOrder}
          onClose={() => setMoveOrder(null)}
          source={{
            id: moveOrder.id,
            orderNumber:
              moveOrder.orderNumber ||
              String(moveOrder.id).slice(-6).toUpperCase(),
            total: Number(moveOrder.total ?? 0),
            customerName:
              moveOrder.customerName ?? moveOrder.user?.name ?? null,
            table: moveOrder.table ?? null,
            tableNumber: moveOrder.tableNumber ?? null,
            itemsCount: Array.isArray(moveOrder.items)
              ? moveOrder.items.length
              : 0,
          }}
          onSuccess={() => {
            setMoveOrder(null);
            useActiveOrderStore.getState().clear();
            fetchOpenOrders();
            router.replace("/pos/order-type");
          }}
        />
      )}

      {splitOrder && (
        <SplitOrderModal
          isOpen={!!splitOrder}
          onClose={() => setSplitOrder(null)}
          orderNumber={
            splitOrder.orderNumber ||
            String(splitOrder.id).slice(-6).toUpperCase()
          }
          items={(splitOrder.items || []).map((item: any) => ({
            id: String(item.id),
            name: item.name || item.menuItem?.name || "Producto",
            quantity: Number(item.quantity ?? 1),
            subtotal: Number(
              item.subtotal ??
                Number(item.unitPrice ?? item.price ?? 0) *
                  Number(item.quantity ?? 1),
            ),
            seatNumber:
              typeof item.seatNumber === "number" ? item.seatNumber : null,
          }))}
          onConfirm={handleConfirmActiveSplit}
        />
      )}

      <NotificationsPanel
        isOpen={showNotifs}
        onClose={() => setShowNotifs(false)}
      />

      <WebOrdersPanel
        isOpen={showWebOrders}
        onClose={() => setShowWebOrders(false)}
        orders={webOrdersData}
        hideMoney={isLoanMode}
        acceptingId={acceptingWebId}
        onAccept={handleAcceptWebOrder}
        onShowDetail={handleShowWebDetail}
      />

      {showCatalogSettings && (
        <CatalogSettingsSheet onClose={() => setShowCatalogSettings(false)} />
      )}

      {/* Overlay "Preparando cobro" — cubre el catálogo/ticket entre el tap en
          "Cobrar" (pantalla de inicio o sidebar) y la apertura del PaymentModal,
          para que el cobro se sienta directo y no se vea el ticket editable.
          z-[98]: sobre catálogo/sidebar, debajo del PaymentModal (z-[100]). */}
      {chargingIntent && !payOrder && (
        <div
          className="fixed inset-0 z-[98] flex flex-col items-center justify-center gap-4 bg-surf-0 font-sans"
          role="status"
          aria-live="polite"
        >
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--brand)] border-t-transparent" />
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-tx-mut">
            Preparando cobro…
          </p>
        </div>
      )}

      {payOrder && !isLoanMode && (
        <PaymentModal
          isOpen={!!payOrder}
          onClose={() => setPayOrder(null)}
          orderNumber={payOrder.orderNumber || String(payOrder.id).slice(-6).toUpperCase()}
          tableName={payOrder.table?.name || payOrder.tableNumber || undefined}
          total={Number(payOrder.total ?? 0)}
          discount={Number(payOrder.discount ?? 0)}
          requiresDiscountOverride={!canApplyDiscount}
          onApplyDiscount={handleApplyPaymentDiscount}
          items={(payOrder.items || []).map((i: any) => ({
            name: i.name || i.menuItem?.name || "Producto",
            quantity: i.quantity ?? 1,
            subtotal: Number(i.subtotal ?? 0),
            seatNumber:
              typeof i.seatNumber === "number" ? i.seatNumber : null,
          }))}
          onConfirm={handleConfirmDrawerPayment}
          onConfirmSplit={handleConfirmSplit}
          employeeAccountEnabled={tpvConfig.employeeAccountEnabled}
        />
      )}

      {/* LAYOUT PRINCIPAL — Grid 75/25 (col-span-3 catálogo, col-span-1 ticket).
          En móvil se colapsa a una sola columna y el toggle FAB alterna vista. */}
      <div
        className="flex h-full w-full flex-1 select-none overflow-hidden bg-surf-0 font-outfit md:grid"
        style={{ gridTemplateColumns: `minmax(0,1fr) ${sidebarWidth}px` }}
      >
        {/* CATALOGO — col-span-3 (75%) */}
        <div
          className={`${mobileView === "menu" ? "flex" : "hidden"} relative min-h-0 min-w-0 w-full flex-col overflow-hidden border-r border-bd bg-surf-0 md:flex`}
        >
          {/* FASE 6 · BANNER MODO PRÉSTAMO */}
          {isLoanMode && (
            <div
              className="shrink-0 px-5 py-2 flex items-center justify-center gap-3 border-b border-[var(--brand)]"
              style={{
                background:
                  "linear-gradient(90deg, var(--brand-glow) 0%, var(--brand-soft) 50%, var(--brand-glow) 100%)",
                fontFamily: "'Outfit', system-ui, sans-serif",
              }}
            >
              <span className="text-[10px] font-semibold tracking-[0.25em] text-[var(--brand)] uppercase">
                Modo préstamo
              </span>
              <span className="text-[11px] font-bold text-white/80 truncate">
                {currentEmployee?.name || "Mesero"} · funciones de pago
                deshabilitadas
              </span>
            </div>
          )}

          {/* TOP BAR: busqueda rapida + cuentas frecuentes. */}
          <header className="z-10 flex h-14 shrink-0 items-center gap-2 border-b border-bd bg-surf-1 px-3">
            <div className="flex shrink-0 items-center gap-2">
              {/* La navegación vive en el Panel de Inicio (menú único). Desde el
                  catálogo solo se regresa al Panel con este botón. */}
              <button
                type="button"
                onClick={() => router.push("/pos/order-type")}
                aria-label="Volver al inicio"
                title="Inicio"
                className="flex h-10 items-center gap-2 rounded-xl border border-bd bg-surf-2 px-3 text-tx-pri transition-all active:scale-95 hover:border-iris-500 hover:text-iris-500"
              >
                <Home size={18} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">Inicio</span>
              </button>
            </div>

            <label className="relative min-w-[220px] flex-1">
              <Search
                size={20}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tx-mut"
              />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar producto..."
                className="h-11 w-full rounded-lg border-2 border-bd bg-surf-2 pl-11 pr-4 text-[16px] font-black text-tx-pri outline-none placeholder:text-tx-mut focus:border-iris-500"
              />
            </label>

            <div className="hidden shrink-0 gap-2 lg:flex">
              {[
                ["Mostrador", "TAKEOUT"],
                ["Mesa", "DINE_IN"],
                ["Domicilio", "DELIVERY"],
              ].map(([label, type]) => {
                const active = activeTicket.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateTicket({ type: type as typeof activeTicket.type })}
                    className={`h-11 min-w-[94px] rounded-lg border-2 px-3 text-[11px] font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-iris-500 ${
                      active
                        ? "border-iris-500 bg-iris-soft text-iris-500"
                        : "border-bd bg-surf-2 text-tx-sec active:bg-surf-3"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {showVoiceOrderDictation && <VoiceOrderDictation />}
              <TopActionsDropdown
                onClearTicket={() => useTicketStore.getState().clearActiveItems()}
                hasItems={itemCount > 0}
                hasActiveOrder={!!activeOrderId}
                onOpenDrawer={handleOpenCashDrawer}
                onReprintKitchen={handleReprintActiveKitchen}
                onReprintReceipt={handleReprintActiveReceipt}
                onRenameOrder={handleRenameActiveOrder}
                onChangeOrderType={handleChangeActiveOrderType}
                onMoveOrder={handleMoveActiveOrder}
                onSplitOrder={handleSplitActiveOrder}
                onDeleteOrder={handleDeleteActiveOrder}
                onChargeOrder={handleChargeActiveOrder}
                onSync={handleSyncNow}
                onOpenCatalogSettings={() => setShowCatalogSettings(true)}
              />
            </div>
          </header>

          {/* PAGE CONTENT — catálogo aprovecha el alto disponible */}
          <main className="flex-1 overflow-hidden flex flex-col min-h-0">
            {children}
          </main>
        </div>

        {/* TICKET LATERAL — col-span-1 (25%) */}
        <div
          className={`${mobileView === "ticket" ? "flex" : "hidden"} relative z-20 min-h-0 w-full md:flex`}
        >
          <SidebarTicket onOpenShift={() => setShowShift(true)} isShiftOpen={!!shiftOpen} isLoanMode={isLoanMode} />
        </div>
      </div>

      {showShift && currentEmployee && (
        <ShiftModal
          employee={currentEmployee}
          onClose={() => {
            setShowShift(false);
            fetchShift();
          }}
          onShiftClosed={() => {
            // Turno cerrado → botar a la pantalla de PIN. El cache queda en
            // false (lo pone ShiftModal), así que al re-loguear el hub manda
            // directo a /pos/shift/open con el botón "Abrir Turno Ahora".
            setShowShift(false);
            logout();
            router.replace("/locked");
          }}
        />
      )}

      {/* MOBILE FAB: TOGGLE MENU/TICKET */}
      <button
        onClick={() => setMobileView(mobileView === "menu" ? "ticket" : "menu")}
        className="fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-lg bg-iris-500 text-iris-fg active:brightness-90 md:hidden"
        aria-label={mobileView === "menu" ? "Ver ticket" : "Ver menú"}
      >
        {mobileView === "menu" ? (
          <div className="relative">
            <ShoppingCart size={24} />
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[20px] h-[20px] px-1 rounded-full bg-surface-0 text-brand text-[10px] font-semibold flex items-center justify-center mono border border-brand/20">
                {itemCount}
              </span>
            )}
          </div>
        ) : (
          <UtensilsCrossed size={24} />
        )}
      </button>
    </div>
  );
}
