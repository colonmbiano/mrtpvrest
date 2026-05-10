"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Search, Menu, Receipt, ShoppingCart, UtensilsCrossed } from "lucide-react";
import ConfigMenu from "@/components/pos/ConfigMenu";
import OrdersDrawer from "@/components/pos/OrdersDrawer";
import OrderDetailModal from "@/components/pos/OrderDetailModal";
import ReprintKitchenModal from "@/components/pos/ReprintKitchenModal";
import PaymentModal from "@/components/pos/PaymentModal";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { usePrinters, useReceiptIdentity } from "@/hooks/usePrinters";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";
import api from "@/lib/api";
import {
  printCustomerReceipt,
  printSplitReceipts,
  printEqualSplitReceipts,
  type TicketItem,
  type ReceiptInput,
} from "@/lib/printer-tcp";

import SidebarTicket from "@/components/pos/SidebarTicket";
import MainSidebar from "@/components/pos/MainSidebar";
import ShiftModal from "@/components/admin/ShiftModal";
import { useThemeStore } from "@/store/themeStore";
import NotificationsPanel from "@/components/pos/NotificationsPanel";
import { useNotifications, useNotifStore } from "@/hooks/useNotifications";

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
  const [mounted, setMounted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [mobileView, setMobileView] = useState<"menu" | "ticket">("menu");
  const bellRef = useRef<HTMLButtonElement>(null);

  // Sistema de notificaciones en tiempo real vía Socket.io
  useNotifications();
  const unreadCount = useNotifStore((s) => s.unreadCount);

  const { palette, mode, setPalette, toggleMode } = useThemeStore();
  const activeTicket = useTicketStore((s) => s.getActiveTicket());
  const itemCount = activeTicket.items.reduce((acc, i) => acc + i.quantity, 0);

  const [openOrders, setOpenOrders] = useState<any[]>([]);
  const [payOrder, setPayOrder] = useState<any | null>(null);
  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [reprintKitchenOrder, setReprintKitchenOrder] = useState<any | null>(null);
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);
  const [showShift, setShowShift] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    isLocked,
    restaurantName,
    locationName,
    currentEmployee,
    logout,
  } = useTPVAuth();

  // FASE 4: cache de impresoras LAN + datos del recibo. Se carga una vez
  // al montar el layout y se refresca con el evento `printers-changed`.
  const { printers } = usePrinters();
  const { businessName, businessFooter } = useReceiptIdentity();

  const fetchOpenOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/api/orders/admin");
      const list = Array.isArray(data) ? data : [];
      setOpenOrders(list.filter((o: any) => ACTIVE_STATUSES.has(o.status)));
    } catch (err) {
      console.error("Error cargando órdenes abiertas:", err);
    }
  }, []);

  useEffect(() => {
    if (!mounted || isLocked) return;
    fetchOpenOrders();
    const id = setInterval(fetchOpenOrders, 30000);
    return () => clearInterval(id);
  }, [mounted, isLocked, fetchOpenOrders]);

  const fetchShift = useCallback(async () => {
    try {
      const { data } = await api.get("/api/shifts/active");
      setShiftOpen(Boolean(data?.isOpen ?? data?.id));
    } catch {
      setShiftOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted || isLocked) return;
    fetchShift();
    const id = setInterval(fetchShift, 60000);
    return () => clearInterval(id);
  }, [mounted, isLocked, fetchShift]);

  const handleConfirmDrawerPayment = async (method: string) => {
    if (!payOrder) return;
    try {
      await api.put(`/api/orders/${payOrder.id}/payment`, { paymentMethod: method });
      toast.success("Cobro procesado");
      setPayOrder(null);
      fetchOpenOrders();
    } catch (err: any) {
      toast.error("Error al cobrar: " + (err?.response?.data?.error || err?.message || ""));
    }
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
        businessName: businessName || restaurantName || null,
        businessFooter: businessFooter || null,
      };

      // Dispatch a CASHIER printers según el plan.
      const printRes =
        plan.kind === "EQUAL"
          ? await printEqualSplitReceipts(printers, receiptInput, plan.parts)
          : await printSplitReceipts(printers, receiptInput, plan.parts);

      // Cerrar orden en el backend (single PUT — la arquitectura actual
      // no acepta múltiples PaymentTransactions; se documenta para
      // follow-up cuando exista POST /:id/payment-transactions).
      toast.loading("Registrando cobro...", { id: toastId });
      await api.put(`/api/orders/${payOrder.id}/payment`, {
        paymentMethod: method,
      });

      // Mensaje final compuesto según el outcome de impresión.
      const ticketsOk = printRes.tickets || 0;
      const ticketsFailed = printRes.failed.length;

      if (ticketsOk === plan.parts && ticketsFailed === 0) {
        toast.success(
          `Cobro registrado · ${ticketsOk} ticket${
            ticketsOk === 1 ? "" : "s"
          } impresos en caja`,
          { id: toastId }
        );
      } else if (ticketsOk > 0) {
        toast.warning(
          `Cobro OK · ${ticketsOk}/${plan.parts} ticket${
            plan.parts === 1 ? "" : "s"
          } impresos${
            ticketsFailed > 0 ? ` · ${ticketsFailed} fallaron` : ""
          }`,
          { id: toastId }
        );
      } else {
        toast.warning(
          `Cobro registrado · sin impresoras CASHIER activas (${
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
      const itemOverride = (it.printerGroups ?? [])
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
        businessName: businessName || restaurantName || null,
        businessFooter: businessFooter || null,
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

  // Tras desbloquear, /pos/order-type ya es la pantalla canónica de elección
  // de tipo. Reabrir el modal aquí causaba un loop infinito al hidratarse
  // Zustand (B3). Mantenemos solo el botón "Tickets abiertos" del drawer.

  useEffect(() => {
    if (showOrders) fetchOpenOrders();
  }, [showOrders, fetchOpenOrders]);

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

  if (!mounted) return <div className="h-screen w-full bg-surf-0" />;

  return (
    <div className="flex h-[100dvh] w-full bg-surf-0 overflow-hidden font-sans text-tx-pri">
      {/* SIDE RAIL */}
      <MainSidebar 
        onOpenMenu={() => setShowMenu(true)} 
        onOpenOrders={() => setShowOrders(true)}
        onOpenNotifs={() => setShowNotifs((v) => !v)}
        hasOpenOrders={openOrders.length > 0}
        unreadNotifs={unreadCount}
      />

      <ConfigMenu
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        onLogout={logout}
        currentTheme={palette}
        onThemeChange={setPalette}
        isDark={mode === "dark"}
        onToggleMode={toggleMode}
      />

      <OrdersDrawer
        isOpen={showOrders}
        onClose={() => setShowOrders(false)}
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
            name: i.name || i.menuItem?.name || "Producto",
            quantity: i.quantity ?? 1,
            subtotal: Number(i.subtotal ?? 0),
            notes: i.notes || null,
          }))}
          onReprint={handleReprintFromDetail}
          onReprintKitchen={handleReprintKitchenFromDetail}
          onCharge={isLoanMode ? undefined : handleChargeFromDetailGuarded}
        />
      )}

      {reprintKitchenOrder && (
        <ReprintKitchenModal
          isOpen={!!reprintKitchenOrder}
          onClose={() => setReprintKitchenOrder(null)}
          printers={printers}
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
            const itemOverride = (it.printerGroups ?? [])
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
            };
          })}
        />
      )}

      <NotificationsPanel
        isOpen={showNotifs}
        onClose={() => setShowNotifs(false)}
      />

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

      {/* MAIN CONTENT AREA */}
      <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${mobileView === "menu" ? "flex" : "hidden"} md:flex`}>
        {/* FASE 6 · BANNER MODO PRÉSTAMO */}
        {isLoanMode && (
          <div
            className="shrink-0 px-5 py-2.5 flex items-center justify-center gap-3 border-b border-[#ffb84d]/30"
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

        {/* TOP HEADER */}
        <header className="h-16 sm:h-20 border-b border-border bg-surface-1 flex items-center px-6 gap-6 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-black tracking-widest uppercase truncate max-w-[200px] text-tx-pri">
              {restaurantName || "MRTPVREST"}
            </h1>
            <span className="hidden sm:inline-block px-2.5 py-1 rounded-md bg-surface-2 border border-border text-[10px] font-bold text-tx-mut">
              {locationName?.toUpperCase() || "SUCURSAL"}
            </span>
          </div>

          <div className="hidden md:flex flex-1 max-w-xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-tx-mut" size={16} />
            <input
              placeholder="Buscar platillo o categoría..."
              className="w-full h-12 bg-surface-2 border border-border rounded-xl pl-11 pr-4 text-sm font-medium focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 transition-all placeholder:text-tx-mut"
            />
          </div>

          <div className="flex-1 md:hidden" />

          <div className="flex items-center gap-4 shrink-0">
            <div 
              className={`hidden md:flex flex-col items-end cursor-pointer hover:opacity-80 transition-all`}
              onClick={() => !shiftOpen && setShowShift(true)}
            >
              <span className="text-sm font-bold tracking-tight text-tx-pri">
                {currentEmployee?.name || "Sin sesión"}
              </span>
              <span
                className={`text-[10px] font-black uppercase tracking-widest ${
                  shiftOpen === false ? "text-danger underline decoration-dotted" : ""
                }`}
                style={{ color: shiftOpen !== false ? "var(--brand)" : undefined }}
              >
                {shiftOpen === false ? "TURNO CERRADO" : shiftOpen ? "TURNO ACTIVO" : (currentEmployee?.role || "—")}
              </span>
            </div>
            
            <button
              type="button"
              onClick={() => {
                // Roles administrativos van directo al panel /admin.
                // Cajeros y demás no tienen acceso → ConfigMenu modal.
                const role = currentEmployee?.role;
                if (role === "ADMIN" || role === "OWNER" || role === "MANAGER") {
                  router.push("/admin");
                } else {
                  setShowMenu(true);
                }
              }}
              aria-label="Abrir configuración"
              className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center text-xs font-black text-tx-pri active:scale-95 transition-all hover:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/40"
              style={{ color: "var(--brand)" }}
            >
              {currentEmployee?.name?.charAt(0).toUpperCase() || "E"}
            </button>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-hidden flex flex-col min-h-0">
          {children}
        </main>
      </div>

      <div className={`${mobileView === "ticket" ? "flex" : "hidden"} md:flex w-full md:w-auto min-h-0 relative z-20`}>
        <SidebarTicket onOpenShift={() => setShowShift(true)} isShiftOpen={!!shiftOpen} isLoanMode={isLoanMode} />
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
        className="md:hidden fixed bottom-6 right-6 z-50 h-16 w-16 rounded-full text-brand-fg shadow-[0_0_24px_rgba(255,132,0,0.4)] flex items-center justify-center active:scale-95 transition-all"
        style={{ background: "var(--brand)" }}
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
