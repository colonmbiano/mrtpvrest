"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";
import { useActiveOrderStore } from "@/store/activeOrderStore";
import OrderTypeSelector from "@/components/pos/OrderTypeSelector";
import type { ExtendedOrderType, OpenAccount } from "@/components/pos/OrderTypeSelector";
import OrdersDrawer, { type DrawerOrder } from "@/components/pos/OrdersDrawer";
import TablePickerModal, { type TableLite } from "@/components/pos/TablePickerModal";
import PurchasesExpensesModal from "@/components/pos/PurchasesExpensesModal";
import NotificationsPanel from "@/components/pos/NotificationsPanel";
import WebOrdersPanel from "@/components/pos/WebOrdersPanel";
import DriversPanel from "@/components/admin/DriversPanel";
import AdminPinGuardModal from "@/components/AdminPinGuardModal";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useTpvConfig } from "@/hooks/useTpvConfig";
import { useNotifications, useNotifStore } from "@/hooks/useNotifications";
import {
  usePrinters,
  useReceiptIdentity,
  useFullTicketConfig,
  useKitchenConfig,
  buildReceiptIdentityFields,
} from "@/hooks/usePrinters";
import {
  printCustomerReceipt,
  printKitchenTickets,
  comboKitchenDetail,
  type TicketItem,
} from "@/lib/printer-tcp";
import { comboPartsFromOrderItem } from "@/lib/modifiers";
import {
  readPaidTicketsCache,
  writePaidTicketsCache,
  type PaidTicketLite,
} from "@/lib/paid-tickets-cache";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { ORDER_TYPE_BADGE } from "@/lib/orderTypes";
import { toast } from "sonner";

/**
 * Flujo Comer Aquí (DINE_IN):
 *   1. Tap "Comer Aquí" → abre TablePickerModal.
 *   2a. Pick mesa LIBRE  → entra DIRECTO a /pos/menu con numberOfGuests=1 y
 *                           activeSeat=1 (sin modal de comensales). El conteo
 *                           se ajusta dentro del ticket ("Comensales" en
 *                           SidebarTicket) solo si se va a dividir por asiento.
 *   2b. Pick mesa OCUPADA → busca orden abierta, setea activeOrderStore,
 *                           va directo a /pos/menu.
 *
 * TAKEOUT y DELIVERY van directo a /pos/menu sin modales.
 */

// Estados que cuentan como "cuenta abierta" (mismo set que el layout del menú).
const ACTIVE_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OPEN",
  "ON_THE_WAY",
]);

const ORDER_TYPE_OF = (t: unknown): ExtendedOrderType =>
  t === "DINE_IN" || t === "TAKEOUT" || t === "DELIVERY" ? t : "TAKEOUT";

// Orígenes que cuentan como "pedido web" (tienda en línea / WhatsApp), igual
// que el layout del menú. Se marcan con color distinto en la lista.
const ONLINE_SOURCES = new Set(["ONLINE", "STORE", "WHATSAPP"]);

// Etiqueta de tipo y "hace X" para el shape DrawerOrder del cajón (igual que
// el layout del menú). Fuente única: lib/orderTypes.
const ORDER_TYPE_LABEL = ORDER_TYPE_BADGE;
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

export default function OrderTypePage() {
  const router = useRouter();

  const { restaurantName, currentEmployee } = useTPVAuth();
  const logout   = useAuthStore((s) => s.logout);
  const employee = useAuthStore((s) => s.employee);

  // Impresoras LAN + identidad del recibo para reimprimir un ticket cobrado
  // directamente desde esta pantalla (sin navegar al catálogo).
  const { printers } = usePrinters();
  const { businessName, businessFooter, terminalName } = useReceiptIdentity();
  const { config: ticketConfig } = useFullTicketConfig();
  const { kitchenConfig } = useKitchenConfig();

  // Notificaciones en tiempo real (socket) también en la pantalla principal.
  // El store es global (zustand+localStorage) así que el badge se comparte con
  // /pos/menu; el socket se monta solo aquí mientras esta pantalla esté viva
  // (order-type y menu nunca coexisten). De paso auto-imprime los pedidos web
  // entrantes: antes solo imprimían si el cajero estaba en /pos/menu.
  const autoPrintWebOrderRef = useRef<((order: any) => void) | null>(null);
  useNotifications({ onOrderNew: (order) => autoPrintWebOrderRef.current?.(order) });
  const unreadCount = useNotifStore((s) => s.unreadCount);

  // Config remota de la sucursal: define qué tipos de orden acepta. Un bar
  // con allowedOrderTypes=["DINE_IN"] oculta las tarjetas Para Llevar/Delivery.
  const tpvConfig = useTpvConfig();

  const [pickingTable, setPickingTable] = useState(false);
  const [askingAdminPin, setAskingAdminPin] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  // Paneles en vivo traídos desde /pos/menu a la pantalla principal.
  const [showNotifs, setShowNotifs] = useState(false);
  const [showWebOrders, setShowWebOrders] = useState(false);
  const [showDrivers, setShowDrivers] = useState(false);
  const [acceptingWebId, setAcceptingWebId] = useState<string | null>(null);
  // Cajón completo de tickets (juntar / repartidor / cocina) + config modal.
  const [showOrders, setShowOrders] = useState(false);
  const [deliveryDrivers, setDeliveryDrivers] = useState<
    { id: string; name: string; isAvailable?: boolean }[]
  >([]);

  // Cuentas abiertas mostradas en la pantalla de inicio para retomar sin
  // pasar por el drawer. Guardamos las órdenes crudas para entrar directo.
  const [openOrders, setOpenOrders] = useState<any[]>([]);

  // Pestaña Abiertas/Cobradas de la lista + tickets cobrados del último mes.
  const [ordersMode, setOrdersMode] = useState<"open" | "paid">("open");
  const [paidOrders, setPaidOrders] = useState<PaidTicketLite[]>([]);
  const [paidLoading, setPaidLoading] = useState(false);

  const fetchOpenOrders = useCallback(async () => {
    try {
      // scope=active → el backend ya filtra a pedidos abiertos (payload chico).
      const { data } = await api.get("/api/orders/admin?scope=active");
      const list = Array.isArray(data) ? data : [];
      setOpenOrders(list.filter((o: any) => ACTIVE_STATUSES.has(o.status)));
    } catch (err) {
      console.error("Error cargando cuentas abiertas:", err);
    }
  }, []);

  // Tickets COBRADOS del último mes (pestaña "Cobradas"). Local-first: pinta
  // el cache al instante y revalida contra el backend (scope=paid, payload
  // ligero). El detalle para reimprimir se baja on-demand en reprintReceiptById.
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

  // Repartidores activos para asignar desde el cajón de tickets.
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
    let cancelled = false;
    // Diferido a microtask (patrón del resto del TPV): evita set-state-in-effect.
    // Cargamos repartidores en el montaje (no solo al abrir el cajón) porque la
    // selección inline del panel también ofrece "Asignar repartidor" y usa esta
    // misma lista; sin esto el picker inline salía "No hay repartidores activos".
    queueMicrotask(() => { if (!cancelled) { fetchOpenOrders(); fetchDeliveryDrivers(); } });
    const id = setInterval(fetchOpenOrders, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [fetchOpenOrders, fetchDeliveryDrivers]);

  // Al abrir el cajón, refrescamos órdenes y cargamos repartidores (para el
  // selector de asignación). La carga de "Cobradas" ya la dispara el efecto por
  // ordersMode (misma pestaña que la lista inline).
  useEffect(() => {
    if (!showOrders) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      fetchOpenOrders();
      fetchDeliveryDrivers();
    });
    return () => { cancelled = true; };
  }, [showOrders, fetchOpenOrders, fetchDeliveryDrivers]);

  // Al entrar a la pestaña "Cobradas" se carga el último mes (no se pollea:
  // es histórico, basta refrescar al cambiar de pestaña).
  useEffect(() => {
    if (ordersMode !== "paid") return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) fetchPaidOrders(); });
    return () => { cancelled = true; };
  }, [ordersMode, fetchPaidOrders]);

  // Mapea items crudos del backend al shape de printer-tcp para la comanda de
  // cocina (resuelve printerGroups item → categoría), igual que en /pos/menu.
  const orderItemsToTicketItems = (rawItems: any[]): TicketItem[] =>
    (rawItems || []).map((it: any) => {
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
        comboParts: comboPartsFromOrderItem(it),
        modifiers: (it.modifiers || []).map((m: any) => ({
          name: m.name || m.modifier?.name || "",
          priceAdd: Number(m.priceAdd ?? m.price ?? 0),
        })),
        printerGroupIds,
      };
    });

  // Auto-impresión de pedidos web entrantes (online / WhatsApp / tienda), con
  // dedupe por id. Mismo patrón que /pos/menu: el backend cloud no alcanza las
  // impresoras LAN, así que la tablet imprime la comanda al entrar el pedido.
  const printedWebOrders = useRef<Set<string>>(new Set());
  useEffect(() => {
    autoPrintWebOrderRef.current = async (order: any) => {
      const id: string | undefined = order?.id || order?.orderId;
      if (!id) return;
      const src = String(order?.source || "").toUpperCase();
      if (src && !ONLINE_SOURCES.has(src)) return;
      if (printedWebOrders.current.has(id)) return;
      printedWebOrders.current.add(id);
      try {
        let full: any = null;
        try {
          const { data } = await api.get(`/api/orders/${id}`);
          full = data;
        } catch {
          full = null;
        }
        if (!full) { printedWebOrders.current.delete(id); return; }
        const fullSrc = String(full?.source || "").toUpperCase();
        if (fullSrc && !ONLINE_SOURCES.has(fullSrc)) {
          printedWebOrders.current.delete(id);
          return;
        }
        const items = orderItemsToTicketItems(full.items || []);
        if (items.length === 0) { printedWebOrders.current.delete(id); return; }
        const res = await printKitchenTickets(printers, {
          orderNumber: full.orderNumber || String(full.id).slice(-6).toUpperCase(),
          orderType: full.orderType || null,
          tableNumber: full.table?.name || full.tableNumber || null,
          customerName: full.customerName || full.user?.name || null,
          items,
          paid: full.paymentStatus === "PAID" || full.cashCollected === true,
          paymentMethod: full.paymentMethod || null,
          config: kitchenConfig ?? undefined,
        });
        const folio = full.orderNumber ? `#${full.orderNumber}` : "";
        if (res.ok > 0) {
          toast.success(`🖨️ Pedido web ${folio} impreso en cocina`);
          fetchOpenOrders();
        } else {
          printedWebOrders.current.delete(id);
          toast.warning(`Pedido web ${folio} recibido — no se pudo imprimir, revisa la impresora`);
        }
      } catch {
        printedWebOrders.current.delete(id);
      }
    };
  }, [printers, kitchenConfig, fetchOpenOrders]);

  // Mapeo a la forma de tarjeta/fila que consume OrderTypeSelector.
  const openAccounts = useMemo<OpenAccount[]>(
    () =>
      openOrders.map((o: any) => {
        const rawType = ORDER_TYPE_OF(o.orderType);
        const tableName =
          o.table?.name || (o.tableNumber != null ? String(o.tableNumber) : null);
        return {
          id: String(o.id),
          orderNumber: o.orderNumber || String(o.id).slice(-6).toUpperCase(),
          customerName:
            o.ticketName || o.customerName || o.user?.name || "Público general",
          rawType,
          tableName,
          phone: o.customerPhone || null,
          numberOfGuests: o.numberOfGuests ?? null,
          itemsCount: Array.isArray(o.items) ? o.items.length : 0,
          total: Number(o.total ?? 0),
          status: o.status,
          createdAt: o.createdAt,
          driver: o.deliveryDriverName || null,
          takenBy: o.createdByName || null,
          isWeb: ONLINE_SOURCES.has(String(o.source || "").toUpperCase()),
        };
      }),
    [openOrders],
  );

  // Tickets cobrados → mismas filas (OpenAccount) en modo "Cobradas". La hora
  // mostrada es la de cobro (paidAt); itemsCount 0 (payload ligero) y se
  // sustituye por el chip de método de pago en la fila.
  const paidAccounts = useMemo<OpenAccount[]>(
    () =>
      paidOrders.map((p) => ({
        id: p.id,
        orderNumber: p.orderNumber,
        customerName: p.customerName,
        rawType: ORDER_TYPE_OF(p.orderType),
        tableName: null,
        phone: null,
        numberOfGuests: null,
        itemsCount: 0,
        total: p.total,
        status: "PAID",
        createdAt: p.paidAt || p.createdAt || undefined,
        driver: null,
        isWeb: false,
        paymentMethod: p.paymentMethod,
      })),
    [paidOrders],
  );

  // Pedidos web (tienda en línea / WhatsApp) para el panel "Pedidos web".
  // Salen del mismo openOrders ya polleado.
  const webOrders = useMemo(
    () =>
      openOrders.filter((o: any) =>
        ONLINE_SOURCES.has(String(o.source || "").toUpperCase()),
      ),
    [openOrders],
  );
  const webOrdersData = useMemo(
    () =>
      webOrders.map((o: any) => ({
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
      })),
    [webOrders],
  );
  // Solo los PENDING requieren acción del cajero → ese es el número del badge.
  const pendingWebCount = useMemo(
    () => webOrders.filter((o: any) => o.status === "PENDING").length,
    [webOrders],
  );

  // Entra a una cuenta abierta (set ticket + activeOrder + navegar al menú).
  // `pendingAction` deja agendada una acción que el layout del menú ejecuta al
  // montar: "print" reimprime la cuenta, "pay" abre el cobro. Mismo patrón que
  // openOrderInCatalog del layout del menú.
  const enterAccount = (id: string, pendingAction: "pay" | "print" | null = null) => {
    const o = openOrders.find((x: any) => String(x.id) === id);
    if (!o) return;
    const rawType = ORDER_TYPE_OF(o.orderType);
    const tableName =
      o.table?.name || (o.tableNumber != null ? String(o.tableNumber) : "");
    useTicketStore.getState().updateTicket({
      type: rawType,
      tableId: o.tableId || o.table?.id || "",
      tableName,
      table: tableName,
      numberOfGuests: o.numberOfGuests ?? null,
      activeSeat: rawType === "DINE_IN" ? 1 : null,
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
    useActiveOrderStore.getState().setPendingAction(pendingAction);
    router.push("/pos/menu");
  };

  // Editar → abre la cuenta para agregar productos.
  const handleOpenAccount = (id: string) => enterAccount(id, null);
  // Cobrar → entra a la cuenta y el menú dispara el cobro al montar.
  const handleChargeAccount = (id: string) => enterAccount(id, "pay");

  // Reimprime el ticket de una orden por id, DIRECTAMENTE desde la pantalla
  // principal (sin navegar al catálogo ni reactivar la orden). Baja el detalle
  // on-demand y lo manda a las impresoras CASHIER. El título lo decide el estado
  // real: "RECIBO" si ya está pagada, "CUENTA · pendiente de cobro" si no.
  // Sirve tanto al botón "Reimprimir recibo" (cobradas) como al cajón.
  const reprintReceiptById = async (id: string) => {
    const t = toast.loading("Imprimiendo…");
    try {
      let full: any = null;
      try {
        const { data } = await api.get(`/api/orders/${id}`);
        full = data;
      } catch {
        full = null;
      }
      if (!full) {
        toast.error("No se pudo cargar el ticket", { id: t });
        return;
      }
      const paid = full.paymentStatus === "PAID";
      const label = paid ? "Recibo" : "Cuenta";
      const items: TicketItem[] = (full.items || []).map((it: any) => ({
        name: it.name || it.menuItem?.name || "Producto",
        quantity: Number(it.quantity ?? 1),
        price: Number(it.unitPrice ?? it.price ?? 0),
        notes: it.notes || null,
        seatNumber: typeof it.seatNumber === "number" ? it.seatNumber : null,
        modifiers: (it.modifiers || []).map((m: any) => ({
          name: m.name || m.modifier?.name || "",
          priceAdd: Number(m.priceAdd ?? m.price ?? 0),
        })),
      }));
      const subtotalCalc = items.reduce(
        (acc, it) =>
          acc +
          it.price * it.quantity +
          (it.modifiers || []).reduce(
            (m, mod) => m + (mod.priceAdd || 0) * it.quantity,
            0,
          ),
        0,
      );
      const num = full.orderNumber || String(full.id).slice(-6).toUpperCase();
      const res = await printCustomerReceipt(printers, {
        ...buildReceiptIdentityFields(
          ticketConfig,
          { businessName, businessFooter },
          restaurantName,
          num,
        ),
        orderNumber: num,
        orderType: full.orderType || null,
        tableNumber: full.table?.name || full.tableNumber || null,
        customerName:
          full.ticketName || full.customerName || full.user?.name || null,
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
        total: Number(full.total ?? subtotalCalc),
        paymentMethod: full.paymentMethod || null,
        paid,
      });
      if (res.ok > 0 && res.failed.length === 0) {
        toast.success(
          `${label} reimpres${paid ? "o" : "a"} en ${res.ok} impresora${res.ok > 1 ? "s" : ""}`,
          { id: t },
        );
      } else if (res.ok > 0) {
        toast.warning(`${label}: ${res.ok} ok / ${res.failed.length} fallaron`, {
          id: t,
        });
      } else {
        toast.error(
          "No se pudo imprimir: " +
            (res.failed[0]?.error || "sin impresoras CASHIER activas"),
          { id: t },
        );
      }
    } catch (err: any) {
      toast.error("Error al reimprimir: " + (err?.message || "fallo"), {
        id: t,
      });
    }
  };

  // Imprimir cuenta → impresión DIRECTA a la CASHIER (reprintReceiptById), sin
  // navegar al catálogo. Antes entraba a /pos/menu con pendingAction "print",
  // así que "Imprimir" abría el ticket en el editor en lugar de imprimir al
  // instante. Mismo flujo directo que la pestaña "Cobradas" y el cajón.
  const handleReprintAccount = (id: string) => reprintReceiptById(id);

  // Meseros (WAITER) operan en modo préstamo: sin cobro directo (igual que el
  // hideMoney del drawer de tickets en el menú).
  const hideMoney = employee?.role === "WAITER";

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

  // Ver detalle del pedido web → entra a la cuenta en el catálogo (igual que el
  // resto de cuentas). enterAccount lo resuelve desde openOrders.
  const handleShowWebDetail = (id: string) => {
    setShowWebOrders(false);
    enterAccount(id, null);
  };

  // ── CAJÓN COMPLETO DE TICKETS (juntar / repartidor / cocina) ──
  // Roles que pueden juntar cuentas / asignar repartidor (no WAITER/cocina).
  const canMergeOpenOrders = currentEmployee?.role
    ? ["ADMIN", "SUPER_ADMIN", "OWNER", "MANAGER", "CASHIER"].includes(
        currentEmployee.role,
      )
    : false;

  // Corregir el método de pago / reembolsar un ticket YA cobrado (pestaña
  // "Cobradas"). Mismo gate que el backend (requirePermission('reopen_table')):
  // roles privilegiados pasan sin permiso explícito, el resto necesita
  // reopen_table. Espejo del cajón de tickets en /pos/menu.
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

  // Reembolsar un ticket YA cobrado (pestaña "Cobradas"), total o parcial, por
  // un error de cobro. El backend valida el monto server-side y cuadra la caja
  // (gasto REFUND en el turno / caja del repartidor).
  const handleRefund = useCallback(
    async (
      o: { id: string; total?: number },
      payload: { amount?: number; reason: string },
    ) => {
      try {
        const { data } = await api.post(`/api/orders/${o.id}/refund`, {
          amount: payload.amount,
          reason: payload.reason,
        });
        const type = data?.refund?.type;
        const amt = data?.refund?.amount;
        const amtLabel = amt != null ? `: $${Number(amt).toFixed(2)}` : "";
        // Reembolso TOTAL ⇒ ya no es una venta cobrada, sale de la lista.
        // Parcial ⇒ se conserva (sigue cobrada por el saldo restante).
        setPaidOrders((prev) => {
          const next =
            type === "FULL" ? prev.filter((p) => p.id !== o.id) : prev;
          writePaidTicketsCache(next);
          return next;
        });
        toast.success(
          `Reembolso ${type === "PARTIAL" ? "parcial" : "total"} procesado${amtLabel}`,
        );
        if (data?.shiftAdjusted === "no_open_shift") {
          toast.warning(
            "No hay turno de caja abierto; el efectivo del reembolso no se descontó del corte automáticamente.",
          );
        }
      } catch (err: any) {
        toast.error(
          err?.response?.data?.error || "No se pudo procesar el reembolso",
        );
        throw err;
      }
    },
    [],
  );

  // Detalle / cobro desde el cajón reusan el flujo de la lista (navegan al
  // catálogo). La reimpresión imprime directo (sin navegar ni reactivar).
  const handleDrawerShowDetail = (o: DrawerOrder) => {
    setShowOrders(false);
    enterAccount(o.id, null);
  };
  const handleDrawerConfirmPayment = (o: DrawerOrder) => {
    setShowOrders(false);
    handleChargeAccount(o.id);
  };
  const handleDrawerReprint = (o: DrawerOrder) => reprintReceiptById(o.id);

  // Juntar cuentas: POST /api/orders/:source/merge/:target por cada origen.
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
            ? `${mergedCount} cuenta${mergedCount === 1 ? "" : "s"} unida${mergedCount === 1 ? "" : "s"}; no se pudo terminar: ${detail}`
            : `No se pudieron juntar los tickets: ${detail}`,
        );
        throw err;
      } finally {
        await fetchOpenOrders();
      }
    },
    [fetchOpenOrders],
  );

  // Asignar repartidor: PUT /api/delivery/assign por cada pedido seleccionado.
  const handleAssignDriverToOrders = useCallback(
    async (ordersToAssign: { id: string }[], driverId: string) => {
      let assigned = 0;
      try {
        for (const order of ordersToAssign) {
          await api.put("/api/delivery/assign", { orderId: order.id, driverId });
          assigned += 1;
        }
        const driverName =
          deliveryDrivers.find((d) => d.id === driverId)?.name || "repartidor";
        toast.success(
          `${assigned} pedido${assigned === 1 ? "" : "s"} enviado${assigned === 1 ? "" : "s"} a ${driverName}`,
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

  // Enviar (reimprimir) a cocina la comanda de los seleccionados, sin abrirlos.
  const handleSendOrdersToKitchen = async (ordersToSend: { id: string }[]) => {
    const t = toast.loading(`Enviando ${ordersToSend.length} a cocina...`);
    let sent = 0;
    let failed = 0;
    for (const o of ordersToSend) {
      try {
        let full: any = null;
        try {
          const { data } = await api.get(`/api/orders/${o.id}`);
          full = data;
        } catch {
          full = null;
        }
        const items = orderItemsToTicketItems(full?.items || []);
        if (items.length === 0) { failed += 1; continue; }
        const res = await printKitchenTickets(printers, {
          orderNumber: full.orderNumber || String(full.id).slice(-6).toUpperCase(),
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
        `${sent} comanda${sent === 1 ? "" : "s"} enviada${sent === 1 ? "" : "s"} a cocina`,
        { id: t },
      );
    } else {
      toast.warning(
        `${sent} enviada${sent === 1 ? "" : "s"} - ${failed} fallaron`,
        { id: t },
      );
    }
  };

  // Shape DrawerOrder para el cajón (abiertas y cobradas), igual que el menú.
  const drawerOrders: DrawerOrder[] = openOrders.map((o: any) => ({
    id: o.id,
    orderNumber: o.orderNumber || `#${String(o.id).slice(-6).toUpperCase()}`,
    customerName:
      o.ticketName || o.customerName || o.user?.name || "Público general",
    type: ORDER_TYPE_LABEL[o.orderType] || o.orderType || "ORDEN",
    status: o.status,
    total: Number(o.total ?? 0),
    time: timeAgo(o.createdAt),
    createdAt: o.createdAt,
    itemsCount: Array.isArray(o.items) ? o.items.length : 0,
    driver: o.deliveryDriverName || undefined,
    needsDriver: o.orderType === "DELIVERY" && !o.deliveryDriverId,
  }));
  const drawerPaidOrders: DrawerOrder[] = paidOrders.map((p) => ({
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

  const handlePickType = (type: ExtendedOrderType) => {
    // RETOMAR VENTA SIN TERMINAR (auto-resume). Si el ticket activo ya trae
    // productos, el cajero NO está empezando: está volviendo a una venta que
    // dejó a medias (se salió por error, se bloqueó la pantalla, recargó la
    // app…). El borrador vive en localStorage (tpv-tickets-draft) pero hasta
    // ahora tocar un tipo de orden lo vaciaba (updateTicket({ items: [] })),
    // y eso se vivía como "metí la orden y al salirme no se guardó". En ese
    // caso lo dejamos justo donde iba, sin tocar items/cliente/type ni la
    // orden activa (para no romper una ronda en curso sobre una cuenta ya
    // abierta). Para una venta NUEVA real, primero se vacía el carrito (botón
    // existente con confirmación) → items=[] → cae al flujo limpio de abajo.
    const active = useTicketStore.getState().getActiveTicket();
    if (active.items.length > 0) {
      router.replace("/pos/menu");
      return;
    }

    if (type === "DINE_IN") {
      // Venta nueva: arrancar el ticket en limpio (sin items/datos de la
      // venta anterior) Y soltar cualquier orden activa heredada. Antes NO se
      // limpiaba activeOrderStore aquí; un activeOrderId rezagado de la mesa
      // anterior hacía que el catálogo agregara la ronda a ESA orden en vez de
      // a la mesa recién elegida → productos encimados en otra cuenta. La
      // ocupación de la mesa la pinta el servidor (table.status), y al elegir
      // una mesa ocupada handlePickTable re-resuelve su orden vía
      // /table/:id/open, así que limpiar aquí no rompe el re-ingreso.
      useActiveOrderStore.getState().clear();
      useTicketStore.getState().updateTicket({
        type: "DINE_IN",
        tableId: "",
        tableName: "",
        table: "",
        numberOfGuests: null,
        activeSeat: null,
        items: [],
        name: "",
        phone: "",
        address: "",
        discount: 0,
      });
      setPickingTable(true);
      return;
    }
    // TAKEOUT / DELIVERY: limpiar contexto de mesa, active order Y el ticket
    // (items + datos del cliente) para que la venta nueva no herede la anterior.
    useActiveOrderStore.getState().clear();
    useTicketStore.getState().updateTicket({
      type,
      tableId: "",
      tableName: "",
      table: "",
      numberOfGuests: null,
      activeSeat: null,
      items: [],
      name: "",
      phone: "",
      address: "",
      discount: 0,
    });
    router.replace("/pos/menu");
  };

  const handlePickTable = async (t: TableLite) => {
    useTicketStore.getState().updateTicket({
      tableId: t.id,
      tableName: t.name,
      table: t.name,
    });

    // SIEMPRE buscamos si la mesa ya tiene cuenta abierta — NO confiamos en
    // `t.status === "OCCUPIED"`. Esa columna (table.status) es denormalizada y
    // se queda desfasada (AVAILABLE/DIRTY aunque la cuenta siga abierta: la
    // cocina avanza la orden, una sync vieja, etc., ver project_open_account_
    // statuses). Si gateábamos el lookup tras OCCUPIED, una mesa con cuenta
    // abierta pero status stale se trataba como LIBRE → se construía un ticket
    // nuevo encima y la cuenta existente quedaba encimada/huérfana (bug
    // reportado: "puse Mesa 1 y me borró la cuenta que ya tenía"). El endpoint
    // /table/:id/open resuelve por el status de la ORDEN, no de la mesa, así
    // que es la fuente de verdad correcta.
    try {
      const { data: orders } = await api.get<{ id: string; orderNumber: string; status: string }[]>(
        `/api/orders/table/${t.id}/open`
      );
      const openOrder = Array.isArray(orders) ? orders[0] : null;
      if (openOrder?.id) {
        // La mesa ya tiene cuenta → entramos a ESA cuenta a agregar ronda.
        // No pedimos comensales: la cuenta ya existe con sus datos originales.
        useActiveOrderStore.getState().setActiveOrder(
          openOrder.id,
          t.id,
          openOrder.orderNumber ?? null,
        );
        setPickingTable(false);
        toast.success(`Mesa ${t.name} — agregando ronda al Ticket ${openOrder.orderNumber ?? openOrder.id.slice(-4)}`);
        router.replace("/pos/menu");
        return;
      }
    } catch {
      // Si falla el lookup (p.ej. sin red), caemos al flujo de mesa libre
      // (entra al menú con 1 comensal). El backend es la red de seguridad: al
      // crear la orden responde 409 TABLE_HAS_OPEN_TAB si la mesa ya tenía
      // cuenta, así que no se enciman ventas aunque el lookup haya fallado aquí.
    }

    // Mesa libre (sin cuenta abierta) → entra DIRECTO al menú con 1 comensal.
    // Antes se pedía el conteo en un modal aquí (1 tap/modal extra por cada
    // mesa); ahora la mesa entra de inmediato y el nº de comensales se ajusta
    // dentro del ticket SOLO si se va a dividir por asiento (control
    // "Comensales" en SidebarTicket, que reusa este mismo GuestCountModal).
    useActiveOrderStore.getState().clear();
    useTicketStore.getState().updateTicket({ numberOfGuests: 1, activeSeat: 1 });
    setPickingTable(false);
    router.replace("/pos/menu");
  };

  const handleLogout = () => {
    logout();
    router.replace("/locked");
  };

  const goShiftClose  = () => router.push("/cierre");
  const goExpenses    = () => setShowExpenses(true);
  const goConfig     = () => {
    // Solo ADMIN/OWNER entran sin segundo factor. Cualquier otro rol
    // (MANAGER, CASHIER, WAITER…) debe ingresar un PIN admin para
    // escalar privilegios. Bug QA: BUG-3 — Panel Central sin guard.
    const role = employee?.role;
    if (role === "ADMIN" || role === "OWNER") {
      router.push("/admin");
      return;
    }
    setAskingAdminPin(true);
  };
  // "Configuración" → pestaña General de Ajustes (sesión, letra, ancho ticket,
  // paleta, modo). Antes abría un modal flotante; ahora vive en Ajustes.
  const goGeneral = () => {
    const role = employee?.role;
    if (role === "ADMIN" || role === "OWNER") {
      router.push("/admin/apariencia");
      return;
    }
    setAskingAdminPin(true);
  };

  return (
    <div className="flex h-[100dvh] w-full bg-[var(--bg)] overflow-auto">
      <OrderTypeSelector
        onSelect={handlePickType}
        onClose={handleLogout}
        onOpenAccount={handleOpenAccount}
        onReprintAccount={handleReprintAccount}
        onChargeAccount={handleChargeAccount}
        onReprintPaid={reprintReceiptById}
        hideMoney={hideMoney}
        mode={ordersMode}
        onModeChange={setOrdersMode}
        paidLoading={paidLoading}
        canCorrectPaymentMethod={canCorrectPayment && ordersMode === "paid"}
        onCorrectPaymentMethod={handleCorrectPaymentMethod}
        canRefund={canCorrectPayment && ordersMode === "paid"}
        onRefund={handleRefund}
        openAccounts={ordersMode === "paid" ? paidAccounts : openAccounts}
        onShiftClose={goShiftClose}
        onExpenses={goExpenses}
        onConfig={goConfig}
        onWhatsapp={() => router.push("/pos/whatsapp")}
        onSales={() => router.push("/pos/menu")}
        onHub={() => router.push("/hub?force=true")}
        onWebOrders={() => setShowWebOrders(true)}
        onDrivers={() => setShowDrivers(true)}
        onNotifs={() => setShowNotifs(true)}
        onManageTickets={() => setShowOrders(true)}
        onConfigMenu={goGeneral}
        onSwitchEmployee={handleLogout}
        canMerge={canMergeOpenOrders && !hideMoney}
        onMergeOrders={handleMergeOpenOrders}
        onAssignDriver={canMergeOpenOrders ? handleAssignDriverToOrders : undefined}
        drivers={deliveryDrivers}
        logoUrl={ticketConfig?.logoUrl || null}
        webOrdersCount={pendingWebCount}
        unreadNotifs={unreadCount}
        allowedTypes={tpvConfig.allowedOrderTypes}
      />

      <TablePickerModal
        isOpen={pickingTable}
        onClose={() => setPickingTable(false)}
        onPick={handlePickTable}
      />


      <PurchasesExpensesModal
        isOpen={showExpenses}
        onClose={() => setShowExpenses(false)}
      />

      <AdminPinGuardModal
        isOpen={askingAdminPin}
        onClose={() => setAskingAdminPin(false)}
        onSuccess={() => router.push("/admin")}
      />

      {/* PANELES EN VIVO — traídos desde /pos/menu a la pantalla principal. */}
      <WebOrdersPanel
        isOpen={showWebOrders}
        onClose={() => setShowWebOrders(false)}
        orders={webOrdersData}
        onShowDetail={handleShowWebDetail}
        onAccept={handleAcceptWebOrder}
        acceptingId={acceptingWebId}
        hideMoney={hideMoney}
      />

      <NotificationsPanel
        isOpen={showNotifs}
        onClose={() => setShowNotifs(false)}
      />

      <DriversPanel
        isOpen={showDrivers}
        onClose={() => setShowDrivers(false)}
        accent="#E0A22A"
        currentRole={currentEmployee?.role}
      />

      {/* CAJÓN COMPLETO DE TICKETS — toggle Abiertas/Cobradas + multiselección
          para juntar cuentas, asignar repartidor y enviar a cocina. */}
      <OrdersDrawer
        isOpen={showOrders}
        onClose={() => {
          setShowOrders(false);
          setOrdersMode("open");
        }}
        mode={ordersMode}
        onModeChange={setOrdersMode}
        paidLoading={paidLoading}
        orders={ordersMode === "paid" ? drawerPaidOrders : drawerOrders}
        onShowDetail={handleDrawerShowDetail}
        onConfirmPayment={handleDrawerConfirmPayment}
        onReprintOrder={handleDrawerReprint}
        hideMoney={hideMoney || ordersMode === "paid"}
        canMergeOrders={canMergeOpenOrders && !hideMoney && ordersMode === "open"}
        onMergeOrders={handleMergeOpenOrders}
        canAssignDriver={canMergeOpenOrders && !hideMoney && ordersMode === "open"}
        drivers={deliveryDrivers}
        onAssignDriver={handleAssignDriverToOrders}
        canSendToKitchen={ordersMode === "open"}
        onSendToKitchen={handleSendOrdersToKitchen}
        canCorrectPaymentMethod={canCorrectPayment && ordersMode === "paid"}
        onCorrectPaymentMethod={handleCorrectPaymentMethod}
        canRefund={canCorrectPayment && ordersMode === "paid"}
        onRefund={handleRefund}
      />

    </div>
  );
}

