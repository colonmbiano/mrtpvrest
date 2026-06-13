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

  useTPVAuth();
  const logout   = useAuthStore((s) => s.logout);
  const employee = useAuthStore((s) => s.employee);

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

  useEffect(() => {
    let cancelled = false;
    // Diferido a microtask (patrón del resto del TPV): evita set-state-in-effect.
    queueMicrotask(() => { if (!cancelled) fetchOpenOrders(); });
    const id = setInterval(fetchOpenOrders, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [fetchOpenOrders]);

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

  // Tap sobre una cuenta abierta → entrar directo (set ticket + activeOrder +
  // navegar al menú para agregar ronda o cobrar). Mismo patrón que
  // openOrderInCatalog del layout del menú.
  const handleOpenAccount = (id: string) => {
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
    router.push("/pos/menu");
  };

  const handlePickType = (type: ExtendedOrderType) => {
    if (type === "DINE_IN") {
      // No reseteamos tableId aquí: si el cajero ya tiene una mesa
      // asignada con orden activa (activeOrderStore), el picker la
      // mostrará como OCCUPIED y podrá re-entrar directamente.
      // Venta nueva: arrancar el ticket en limpio (sin items/datos de la
      // venta anterior). El activeOrder se resuelve al elegir mesa
      // (ocupada → re-entra; libre → clear()).
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
        openAccounts={openAccounts}
        onShiftClose={goShiftClose}
        onExpenses={goExpenses}
        onConfig={goConfig}
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

