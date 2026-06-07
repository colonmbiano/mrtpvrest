"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Search, ShoppingCart, UtensilsCrossed } from "lucide-react";
import ConfigMenu from "@/components/pos/ConfigMenu";
import OrdersDrawer from "@/components/pos/OrdersDrawer";
import OrderDetailModal from "@/components/pos/OrderDetailModal";
import ReprintKitchenModal from "@/components/pos/ReprintKitchenModal";
import PaymentModal from "@/components/pos/PaymentModal";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useTpvConfig } from "@/hooks/useTpvConfig";
import { usePrinters, useReceiptIdentity, useKitchenConfig, useFullTicketConfig } from "@/hooks/usePrinters";
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
import api from "@/lib/api";
import { apiOrQueue } from "@/lib/offline";
import {
  printCustomerReceipt,
  printSplitReceipts,
  printEqualSplitReceipts,
  type TicketItem,
  type ReceiptInput,
} from "@/lib/printer-tcp";

import SidebarTicket from "@/components/pos/SidebarTicket";
import TopNavDropdown from "@/components/pos/TopNavDropdown";
import TopActionsDropdown from "@/components/pos/TopActionsDropdown";
import CatalogSettingsSheet from "@/components/modals/CatalogSettingsSheet";
import VoiceOrderDictation from "@/components/pos/VoiceOrderDictation";
import { useUIStore } from "@/store/useUIStore";
import ShiftModal from "@/components/admin/ShiftModal";
import { useThemeStore, type Palette } from "@/store/themeStore";
import NotificationsPanel from "@/components/pos/NotificationsPanel";
import { useNotifications, useNotifStore } from "@/hooks/useNotifications";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import MergeTableModal from "@/components/pos/MergeTableModal";
import AdminPinGuardModal from "@/components/AdminPinGuardModal";
import PurchasesExpensesModal from "@/components/pos/PurchasesExpensesModal";
import DeliveryAssignModal from "@/components/admin/DeliveryAssignModal";
import ChangeOrderTypeModal from "@/components/pos/ChangeOrderTypeModal";

const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN: "MESA",
  TAKEOUT: "LLEVAR",
  DELIVERY: "DOMICILIO",
};

const ACTIVE_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OPEN",
  "OUT_FOR_DELIVERY",
]);

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
  const [showMenu, setShowMenu] = useState(false);
  const [askingAdminPin, setAskingAdminPin] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showCatalogSettings, setShowCatalogSettings] = useState(false);
  const [mobileView, setMobileView] = useState<"menu" | "ticket">("menu");

  // Sistema de notificaciones en tiempo real vía Socket.io
  useNotifications();
  const unreadCount = useNotifStore((s) => s.unreadCount);

  // Mantener la pantalla encendida mientras esté abierto el shell de
  // cajero (Capacitor only — no-op en web). Si el cajero está esperando
  // al cliente, evita que la tablet apague la pantalla cada minuto.
  useKeepAwake(true);

  const { palette, mode, setPalette, toggleMode } = useThemeStore();
  const isOrdersOpen = useUIStore((s) => s.isOrdersOpen);
  const activeTicket = useTicketStore((s) => s.getActiveTicket());
  const updateTicket = useTicketStore((s) => s.updateTicket);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const itemCount = activeTicket.items.reduce((acc, i) => acc + i.quantity, 0);
  const sidebarWidth = useClientValue(
    () => sidebarPresetToPx(readSidebarPreset()),
    sidebarPresetToPx(DEFAULT_SIDEBAR_PRESET),
    subscribeToEvents(SIDEBAR_WIDTH_CHANGED_EVENT, "storage"),
  );

  const [openOrders, setOpenOrders] = useState<any[]>([]);
  const [payOrder, setPayOrder] = useState<any | null>(null);
  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [reprintKitchenOrder, setReprintKitchenOrder] = useState<any | null>(null);
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);
  const [showShift, setShowShift] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [mergeSource, setMergeSource] = useState<any | null>(null);
  const [assigningOrder, setAssigningOrder] = useState<any | null>(null);
  const [changeTypeOrder, setChangeTypeOrder] = useState<any | null>(null);

  const {
    isLocked,
    restaurantName,
    currentEmployee,
    logout,
  } = useTPVAuth();

  // FASE 4: cache de impresoras LAN + datos del recibo. Se carga una vez
  // al montar el layout y se refresca con el evento `printers-changed`.
  const { printers } = usePrinters();
  const { businessName, businessFooter } = useReceiptIdentity();
  const { config: ticketConfig } = useFullTicketConfig();
  const { kitchenConfig } = useKitchenConfig();
  const tpvConfig = useTpvConfig();
  const showVoiceOrderDictation =
    tpvConfig.extra?.voiceOrderDictationEnabled === true;

  const fetchOpenOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/api/orders/admin");
      const list = Array.isArray(data) ? data : [];
      setOpenOrders(list.filter((o: any) => ACTIVE_STATUSES.has(o.status)));
    } catch (err) {
      console.error("Error cargando órdenes abiertas:", err);
    }
  }, []);

  // ── Edición/eliminación de items en orden abierta (Feature 11)
  // Sólo expuesto al admin/manager (gateado en el render); el backend además
  // valida tenant + estado de orden. Tras éxito, refrescamos detail + listado.
  const canEditOpenOrderItems = currentEmployee?.role
    ? ["ADMIN", "OWNER", "MANAGER"].includes(currentEmployee.role)
    : false;

  const handleUpdateOrderItem = useCallback(
    async (itemId: string, patch: { quantity?: number; notes?: string }) => {
      setUpdatingItemId(itemId);
      try {
        const { data: updated } = await api.put(`/api/orders/items/${itemId}`, patch);
        setDetailOrder(updated);
        fetchOpenOrders();
      } catch (err: any) {
        toast.error(
          "Error al modificar: " +
            (err?.response?.data?.error || err?.message || "fallo desconocido"),
        );
      } finally {
        setUpdatingItemId(null);
      }
    },
    [fetchOpenOrders],
  );

  const handleDeleteOrderItem = useCallback(
    async (itemId: string) => {
      if (!confirm("¿Eliminar este producto de la orden?")) return;
      setUpdatingItemId(itemId);
      try {
        const { data: updated } = await api.delete(`/api/orders/items/${itemId}`);
        setDetailOrder(updated);
        fetchOpenOrders();
      } catch (err: any) {
        toast.error(
          "Error al eliminar: " +
            (err?.response?.data?.error || err?.message || "fallo desconocido"),
        );
      } finally {
        setUpdatingItemId(null);
      }
    },
    [fetchOpenOrders],
  );

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

  const handleConfirmDrawerPayment = async (method: string) => {
    if (!payOrder) return;
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
    setPayOrder(null);
    fetchOpenOrders();
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

      const receiptInput: ReceiptInput = {
        orderNumber:
          payOrder.orderNumber ||
          String(payOrder.id).slice(-6).toUpperCase(),
        orderType: payOrder.orderType || null,
        tableNumber: payOrder.table?.name || payOrder.tableNumber || null,
        customerName: payOrder.customerName || payOrder.user?.name || null,
        customerPhone: payOrder.customerPhone || null,
        items,
        subtotal: Number(payOrder.subtotal ?? subtotalCalc),
        discount: Number(payOrder.discount ?? 0),
        tax: Number(payOrder.tax ?? 0),
        tip: Number(payOrder.tip ?? 0),
        total: Number(payOrder.total ?? subtotalCalc),
        paymentMethod: method,
        businessName: ticketConfig?.businessName || businessName || restaurantName || null,
        businessFooter: ticketConfig?.footer || businessFooter || null,
        showLogo: ticketConfig?.showLogo,
        logoUrl: ticketConfig?.logoUrl,
        showAddress: ticketConfig?.showAddress,
        address: ticketConfig?.address,
        showPhone: ticketConfig?.showPhone,
        phone: ticketConfig?.phone,
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

      setPayOrder(null);
      fetchOpenOrders();
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

  const handleShowDetail = async (o: any) => {
    setDetailOrder(await fetchFullOrder(o));
  };

  const handleOpenPayment = async (o: any) => {
    setPayOrder(await fetchFullOrder(o));
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
        modifiers: (it.modifiers || []).map((m: any) => ({
          name: m.name || m.modifier?.name || "",
          priceAdd: Number(m.priceAdd ?? m.price ?? 0),
        })),
        printerGroupIds,
      };
    });
  };

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
      const res = await printCustomerReceipt(printers, {
        orderNumber: full.orderNumber || String(full.id).slice(-6).toUpperCase(),
        orderType: full.orderType || null,
        tableNumber: full.table?.name || full.tableNumber || null,
        customerName: full.customerName || full.user?.name || null,
        customerPhone: full.customerPhone || null,
        items,
        subtotal: Number(full.subtotal ?? subtotalCalc),
        discount: Number(full.discount ?? 0),
        tax: Number(full.tax ?? 0),
        tip: Number(full.tip ?? 0),
        total: Number(full.total ?? subtotalCalc),
        paymentMethod: full.paymentMethod || null,
        businessName: ticketConfig?.businessName || businessName || restaurantName || null,
        businessFooter: ticketConfig?.footer || businessFooter || null,
        showLogo: ticketConfig?.showLogo,
        logoUrl: ticketConfig?.logoUrl,
        showAddress: ticketConfig?.showAddress,
        address: ticketConfig?.address,
        showPhone: ticketConfig?.showPhone,
        phone: ticketConfig?.phone,
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

  // Si el usuario está viendo el detalle y decide cobrar, transferimos al
  // modal de pago con la misma orden ya hidratada.
  const handleChargeFromDetail = () => {
    if (!detailOrder) return;
    setPayOrder(detailOrder);
    setDetailOrder(null);
  };

  const handleReprintFromDetail = async () => {
    if (!detailOrder) return;
    await handleReprintOrder(detailOrder);
  };

  const handleReprintKitchenFromDetail = async () => {
    if (!detailOrder) return;
    await handleReprintKitchen(detailOrder);
  };

  const handleCancelOrderFromDetail = useCallback(async () => {
    if (!detailOrder) return;
    if (!confirm(`¿Estás seguro de ELIMINAR el ticket #${detailOrder.orderNumber || detailOrder.id}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.put(`/api/orders/${detailOrder.id}/status`, { status: "CANCELLED" });
      toast.success("Ticket eliminado");
      setDetailOrder(null);
      fetchOpenOrders();
    } catch (err: any) {
      toast.error("Error al eliminar: " + (err?.response?.data?.error || err?.message));
    }
  }, [detailOrder, fetchOpenOrders]);

  const handleAssignDriverFromDetail = useCallback(() => {
    if (!detailOrder) return;
    setAssigningOrder(detailOrder);
    setDetailOrder(null);
  }, [detailOrder]);

  const handleChangeTypeFromDetail = useCallback(() => {
    if (!detailOrder) return;
    setChangeTypeOrder(detailOrder);
    setDetailOrder(null);
  }, [detailOrder]);

  // Tras desbloquear, /pos/order-type ya es la pantalla canónica de elección
  // de tipo. Reabrir el modal aquí causaba un loop infinito al hidratarse
  // Zustand (B3). Mantenemos solo el botón "Tickets abiertos" del drawer.

  useEffect(() => {
    if (!showOrders) return;
    let cancelled = false;
    // Arranque diferido (ver impresoras): evita set-state-in-effect.
    queueMicrotask(() => { if (!cancelled) fetchOpenOrders(); });
    return () => { cancelled = true; };
  }, [showOrders, fetchOpenOrders]);

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
    customerName: o.customerName || o.user?.name || "Público general",
    type: ORDER_TYPE_LABEL[o.orderType] || o.orderType || "ORDEN",
    status: o.status,
    total: Number(o.total ?? 0),
    time: timeAgo(o.createdAt),
    itemsCount: Array.isArray(o.items) ? o.items.length : 0,
    needsDriver: o.orderType === "DELIVERY" && !o.deliveryDriverId,
  }));

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

  // FASE 6 · MODO PRÉSTAMO DE CAJA
  // Cuando un mesero usa la tablet principal, ocultamos las funciones de
  // dinero (Cobrar, abrir cajón implícito por payment flow). El mesero
  // SÍ puede tomar pedidos, ver tickets abiertos y reimprimir comandas
  // — solo el cobro queda gateado al rol de cajero.
  const isLoanMode = currentEmployee?.role === "WAITER";

  // Wrapper que respeta el modo préstamo. Si un WAITER intenta abrir
  // payment (ej. tap accidental antes de que la UI se actualice) lo
  // bloqueamos en el layer de handler para defensa en profundidad.
  const handleOpenPaymentGuarded = async (o: any) => {
    if (isLoanMode) {
      toast.error("Cobro no permitido en modo préstamo de caja");
      return;
    }
    await handleOpenPayment(o);
  };

  const handleChargeFromDetailGuarded = () => {
    if (isLoanMode) {
      toast.error("Cobro no permitido en modo préstamo de caja");
      return;
    }
    handleChargeFromDetail();
  };

  if (!mounted) return <div className="h-[100dvh] w-full bg-surf-0" />;

  return (
    <div className="flex h-[100dvh] w-full bg-surf-0 overflow-hidden font-sans text-tx-pri">
      {/* SIDE RAIL ELIMINADO */}


      <PurchasesExpensesModal
        isOpen={showExpenses}
        onClose={() => setShowExpenses(false)}
      />

      <ConfigMenu
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        onLogout={() => {
          // Bloquear Terminal: cerrar sesión Y mandar al lock screen.
          // Antes solo limpiaba state y el cajero quedaba en /pos/menu sin
          // empleado activo, sin pedirle PIN para volver a entrar.
          logout();
          setShowMenu(false);
          router.replace("/locked");
        }}
        currentTheme={palette}
        onThemeChange={(p) => setPalette(p as Palette)}
        isDark={mode === "dark"}
        onToggleMode={toggleMode}
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
        }}
        orders={drawerOrders}
        onShowDetail={handleShowDetail}
        onConfirmPayment={handleOpenPaymentGuarded}
        onReprintOrder={handleReprintOrder}
        hideMoney={isLoanMode}
      />

      {detailOrder && (
        <OrderDetailModal
          isOpen={!!detailOrder}
          onClose={() => setDetailOrder(null)}
          orderNumber={
            detailOrder.orderNumber ||
            String(detailOrder.id).slice(-6).toUpperCase()
          }
          customerName={
            detailOrder.customerName || detailOrder.user?.name || null
          }
          tableName={
            detailOrder.table?.name || detailOrder.tableNumber || null
          }
          orderType={
            ORDER_TYPE_LABEL[detailOrder.orderType] || detailOrder.orderType || null
          }
          status={detailOrder.status || null}
          createdAt={detailOrder.createdAt || null}
          subtotal={Number(detailOrder.subtotal ?? 0)}
          discount={Number(detailOrder.discount ?? 0)}
          total={Number(detailOrder.total ?? 0)}
          items={(detailOrder.items || []).map((i: any) => ({
            id: String(i.id),
            name: i.name || i.menuItem?.name || "Producto",
            quantity: i.quantity ?? 1,
            subtotal: Number(i.subtotal ?? 0),
            notes: i.notes || null,
          }))}
          onReprint={handleReprintFromDetail}
          onReprintKitchen={handleReprintKitchenFromDetail}
          onCharge={isLoanMode ? undefined : handleChargeFromDetailGuarded}
          onCancelOrder={canEditOpenOrderItems ? handleCancelOrderFromDetail : undefined}
          onAssignDriver={handleAssignDriverFromDetail}
          onUpdateItem={
            canEditOpenOrderItems &&
            !["DELIVERED", "CANCELLED"].includes(detailOrder.status) &&
            detailOrder.paymentStatus !== "PAID"
              ? handleUpdateOrderItem
              : undefined
          }
          onDeleteItem={
            canEditOpenOrderItems &&
            !["DELIVERED", "CANCELLED"].includes(detailOrder.status) &&
            detailOrder.paymentStatus !== "PAID"
              ? handleDeleteOrderItem
              : undefined
          }
          updatingItemId={updatingItemId}
          onMergeOrTransfer={
            canEditOpenOrderItems &&
            !["DELIVERED", "CANCELLED"].includes(detailOrder.status) &&
            detailOrder.paymentStatus !== "PAID"
              ? () => {
                  setMergeSource(detailOrder);
                  setDetailOrder(null);
                }
              : undefined
          }
          onChangeType={
            canEditOpenOrderItems &&
            !["DELIVERED", "CANCELLED"].includes(detailOrder.status) &&
            detailOrder.paymentStatus !== "PAID"
              ? handleChangeTypeFromDetail
              : undefined
          }
        />

      )}

      {mergeSource && (
        <MergeTableModal
          isOpen={!!mergeSource}
          onClose={() => setMergeSource(null)}
          source={{
            id: mergeSource.id,
            orderNumber:
              mergeSource.orderNumber ||
              String(mergeSource.id).slice(-6).toUpperCase(),
            total: Number(mergeSource.total ?? 0),
            customerName: mergeSource.customerName ?? mergeSource.user?.name ?? null,
            table: mergeSource.table ?? null,
            tableNumber: mergeSource.tableNumber ?? null,
            itemsCount: Array.isArray(mergeSource.items)
              ? mergeSource.items.length
              : 0,
          }}
          onSuccess={() => {
            setMergeSource(null);
            fetchOpenOrders();
          }}
        />
      )}

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

      {assigningOrder && (
        <DeliveryAssignModal
          order={assigningOrder}
          onClose={() => setAssigningOrder(null)}
          onAssigned={() => {
            setAssigningOrder(null);
            fetchOpenOrders();
            toast.success("Repartidor asignado");
          }}
        />
      )}

      <NotificationsPanel
        isOpen={showNotifs}
        onClose={() => setShowNotifs(false)}
      />

      {showCatalogSettings && (
        <CatalogSettingsSheet onClose={() => setShowCatalogSettings(false)} />
      )}

      {payOrder && !isLoanMode && (
        <PaymentModal
          isOpen={!!payOrder}
          onClose={() => setPayOrder(null)}
          orderNumber={payOrder.orderNumber || String(payOrder.id).slice(-6).toUpperCase()}
          tableName={payOrder.table?.name || payOrder.tableNumber || undefined}
          total={Number(payOrder.total ?? 0)}
          items={(payOrder.items || []).map((i: any) => ({
            name: i.name || i.menuItem?.name || "Producto",
            quantity: i.quantity ?? 1,
            subtotal: Number(i.subtotal ?? 0),
            seatNumber:
              typeof i.seatNumber === "number" ? i.seatNumber : null,
          }))}
          onConfirm={handleConfirmDrawerPayment}
          onConfirmSplit={handleConfirmSplit}
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
              className="shrink-0 px-5 py-2 flex items-center justify-center gap-3 border-b border-[#ffb84d]/30"
              style={{
                background:
                  "linear-gradient(90deg, rgba(255,184,77,0.14) 0%, rgba(255,184,77,0.08) 50%, rgba(255,184,77,0.14) 100%)",
                fontFamily: "'Outfit', system-ui, sans-serif",
              }}
            >
              <span className="text-[10px] font-black tracking-[0.25em] text-[#ffb84d] uppercase">
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
              <TopNavDropdown
                onOpenMenu={() => setShowMenu(true)}
                onOpenOrders={() => setShowOrders(true)}
                onOpenNotifs={() => setShowNotifs((v) => !v)}
                onOpenExpenses={isLoanMode ? undefined : () => setShowExpenses(true)}
                hasOpenOrders={openOrders.length > 0}
                unreadNotifs={unreadCount}
              />
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
                    className={`h-11 min-w-[94px] rounded-lg border-2 px-3 text-[11px] font-black uppercase focus:outline-none focus:ring-2 focus:ring-iris-500 ${
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
                onOpenDrawer={() => {}}
                onReprintKitchen={() => {}}
                onReprintReceipt={() => {}}
                onSync={() => {}}
                onSplitTicket={() => {}}
                onMoveTicket={() => {}}
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
              <span className="absolute -top-2 -right-2 min-w-[20px] h-[20px] px-1 rounded-full bg-surface-0 text-brand text-[10px] font-black flex items-center justify-center mono border border-brand/20">
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
