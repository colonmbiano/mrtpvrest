"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";
import { useActiveOrderStore } from "@/store/activeOrderStore";
import OrderTypeSelector from "@/components/pos/OrderTypeSelector";
import type { ExtendedOrderType, OpenAccount } from "@/components/pos/OrderTypeSelector";
import TablePickerModal, { type TableLite } from "@/components/pos/TablePickerModal";
import GuestCountModal from "@/components/pos/GuestCountModal";
import PurchasesExpensesModal from "@/components/pos/PurchasesExpensesModal";
import AdminPinGuardModal from "@/components/AdminPinGuardModal";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useTpvConfig } from "@/hooks/useTpvConfig";
import {
  usePrinters,
  useReceiptIdentity,
  useFullTicketConfig,
  buildReceiptIdentityFields,
} from "@/hooks/usePrinters";
import { printCustomerReceipt, type TicketItem } from "@/lib/printer-tcp";
import {
  readPaidTicketsCache,
  writePaidTicketsCache,
  type PaidTicketLite,
} from "@/lib/paid-tickets-cache";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { toast } from "sonner";

/**
 * Flujo Comer Aquí (DINE_IN):
 *   1. Tap "Comer Aquí" → abre TablePickerModal.
 *   2a. Pick mesa LIBRE  → guarda tableId/name en ticket activo, abre
 *                           GuestCountModal pre-llenado con capacity.
 *   2b. Pick mesa OCUPADA → busca orden abierta, setea activeOrderStore,
 *                           va directo a /pos/menu sin GuestCountModal.
 *   3. Confirma comensales → numberOfGuests + activeSeat=1 → /pos/menu.
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

  // Config remota de la sucursal: define qué tipos de orden acepta. Un bar
  // con allowedOrderTypes=["DINE_IN"] oculta las tarjetas Para Llevar/Delivery.
  const tpvConfig = useTpvConfig();

  const [pickingTable, setPickingTable] = useState(false);
  const [picked, setPicked]             = useState<TableLite | null>(null);
  const [askingGuests, setAskingGuests] = useState(false);
  const [askingAdminPin, setAskingAdminPin] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);

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
  // ligero). El detalle para reimprimir se baja on-demand en handleReprintPaid.
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

  useEffect(() => {
    let cancelled = false;
    // Diferido a microtask (patrón del resto del TPV): evita set-state-in-effect.
    queueMicrotask(() => { if (!cancelled) fetchOpenOrders(); });
    const id = setInterval(fetchOpenOrders, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [fetchOpenOrders]);

  // Al entrar a la pestaña "Cobradas" se carga el último mes (no se pollea:
  // es histórico, basta refrescar al cambiar de pestaña).
  useEffect(() => {
    if (ordersMode !== "paid") return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) fetchPaidOrders(); });
    return () => { cancelled = true; };
  }, [ordersMode, fetchPaidOrders]);

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
  // Imprimir / Cobrar → entran a la cuenta y el menú dispara la acción al montar.
  const handleReprintAccount = (id: string) => enterAccount(id, "print");
  const handleChargeAccount = (id: string) => enterAccount(id, "pay");

  // Reimprime el RECIBO de un ticket COBRADO directamente desde la pantalla
  // principal (sin navegar al catálogo ni reactivar la orden). Baja el detalle
  // on-demand (los cobrados llegan sin items para mantener el cache chico) y lo
  // manda a las impresoras CASHIER con paid:true (título "RECIBO").
  const handleReprintPaid = async (id: string) => {
    const t = toast.loading("Imprimiendo recibo…");
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
        tax: Number(full.tax ?? 0),
        tip: Number(full.tip ?? 0),
        total: Number(full.total ?? subtotalCalc),
        paymentMethod: full.paymentMethod || null,
        paid: true,
      });
      if (res.ok > 0 && res.failed.length === 0) {
        toast.success(
          `Recibo reimpreso en ${res.ok} impresora${res.ok > 1 ? "s" : ""}`,
          { id: t },
        );
      } else if (res.ok > 0) {
        toast.warning(`Recibo: ${res.ok} ok / ${res.failed.length} fallaron`, {
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

  // Meseros (WAITER) operan en modo préstamo: sin cobro directo (igual que el
  // hideMoney del drawer de tickets en el menú).
  const hideMoney = employee?.role === "WAITER";

  const handlePickType = (type: ExtendedOrderType) => {
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

    if (t.status === "OCCUPIED") {
      // Mesa ocupada → buscar orden abierta existente y saltar directo
      // al catálogo para agregar una nueva ronda. No pedimos comensales
      // porque la cuenta ya existe con sus datos originales.
      try {
        const { data: orders } = await api.get<{ id: string; orderNumber: string; status: string }[]>(
          `/api/orders/table/${t.id}/open`
        );
        const openOrder = Array.isArray(orders) ? orders[0] : null;
        if (openOrder?.id) {
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
        // Si falla el lookup, caemos al flujo normal con GuestCountModal.
        // El backend igualmente redirige a addRoundHandler si la mesa
        // está OCCUPIED al crear la orden.
      }
    }

    // Mesa libre o DIRTY → flujo normal con GuestCountModal.
    useActiveOrderStore.getState().clear();
    setPicked(t);
    setPickingTable(false);
    setAskingGuests(true);
  };

  const handleConfirmGuests = (guests: number) => {
    useTicketStore.getState().updateTicket({
      numberOfGuests: guests,
      activeSeat: 1,
    });
    setAskingGuests(false);
    setPicked(null);
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

  return (
    <div className="flex h-[100dvh] w-full bg-[#0a0a0c] overflow-auto">
      <OrderTypeSelector
        onSelect={handlePickType}
        onClose={handleLogout}
        onOpenAccount={handleOpenAccount}
        onReprintAccount={handleReprintAccount}
        onChargeAccount={handleChargeAccount}
        onReprintPaid={handleReprintPaid}
        hideMoney={hideMoney}
        mode={ordersMode}
        onModeChange={setOrdersMode}
        paidLoading={paidLoading}
        openAccounts={ordersMode === "paid" ? paidAccounts : openAccounts}
        onShiftClose={goShiftClose}
        onExpenses={goExpenses}
        onConfig={goConfig}
        onWhatsapp={() => router.push("/pos/whatsapp")}
        onSales={() => router.push("/pos/menu")}
        onHub={() => router.push("/hub?force=true")}
        allowedTypes={tpvConfig.allowedOrderTypes}
      />

      <TablePickerModal
        isOpen={pickingTable}
        onClose={() => setPickingTable(false)}
        onPick={handlePickTable}
      />

      <GuestCountModal
        isOpen={askingGuests}
        tableCapacity={picked?.capacity ?? null}
        tableName={picked?.name ?? null}
        onClose={() => {
          setAskingGuests(false);
          setPicked(null);
          useTicketStore.getState().updateTicket({
            tableId: "",
            tableName: "",
            table: "",
          });
        }}
        onConfirm={handleConfirmGuests}
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
    </div>
  );
}

