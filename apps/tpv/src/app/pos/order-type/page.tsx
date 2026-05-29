"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";
import { useActiveOrderStore } from "@/store/activeOrderStore";
import OrderTypeSelector from "@/components/pos/OrderTypeSelector";
import type { ExtendedOrderType } from "@/components/pos/OrderTypeSelector";
import TablePickerModal, { type TableLite } from "@/components/pos/TablePickerModal";
import GuestCountModal from "@/components/pos/GuestCountModal";
import PurchasesExpensesModal from "@/components/pos/PurchasesExpensesModal";
import AdminPinGuardModal from "@/components/AdminPinGuardModal";
import { useTPVAuth } from "@/hooks/useTPVAuth";
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
export default function OrderTypePage() {
  const router = useRouter();

  useTPVAuth();
  const logout   = useAuthStore((s) => s.logout);
  const employee = useAuthStore((s) => s.employee);

  const [pickingTable, setPickingTable] = useState(false);
  const [picked, setPicked]             = useState<TableLite | null>(null);
  const [askingGuests, setAskingGuests] = useState(false);
  const [askingAdminPin, setAskingAdminPin] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);

  const handlePickType = (type: ExtendedOrderType) => {
    if (type === "DINE_IN") {
      // No reseteamos tableId aquí: si el cajero ya tiene una mesa
      // asignada con orden activa (activeOrderStore), el picker la
      // mostrará como OCCUPIED y podrá re-entrar directamente.
      useTicketStore.getState().updateTicket({
        type: "DINE_IN",
        tableId: "",
        tableName: "",
        table: "",
        numberOfGuests: null,
        activeSeat: null,
      });
      setPickingTable(true);
      return;
    }
    // TAKEOUT / DELIVERY: limpiar contexto de mesa y active order
    useActiveOrderStore.getState().clear();
    useTicketStore.getState().updateTicket({
      type,
      tableId: "",
      tableName: "",
      table: "",
      numberOfGuests: null,
      activeSeat: null,
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

  const goOpenTickets = () => router.push("/pos/menu?orders=1");
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
    <div className="flex h-screen w-full bg-[#0a0a0c] overflow-auto">
      <OrderTypeSelector
        onSelect={handlePickType}
        onClose={handleLogout}
        onOpenTickets={goOpenTickets}
        onShiftClose={goShiftClose}
        onExpenses={goExpenses}
        onConfig={goConfig}
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

