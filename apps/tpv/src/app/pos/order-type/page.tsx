"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";
import OrderTypeSelector from "@/components/pos/OrderTypeSelector";
import type { ExtendedOrderType } from "@/components/pos/OrderTypeSelector";
import TablePickerModal, { type TableLite } from "@/components/pos/TablePickerModal";
import GuestCountModal from "@/components/pos/GuestCountModal";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useAuthStore } from "@/store/authStore";

/**
 * Flujo Comer Aquí (DINE_IN):
 *   1. Tap "Comer Aquí" → abre TablePickerModal.
 *   2. Pick mesa        → guarda tableId/name en ticket activo, abre
 *                          GuestCountModal pre-llenado con capacity.
 *   3. Confirma comensales → numberOfGuests + activeSeat=1 → /pos/menu.
 *
 * TAKEOUT y DELIVERY van directo a /pos/menu sin modales.
 */
export default function OrderTypePage() {
  const router = useRouter();

  useTPVAuth();
  const logout = useAuthStore((s) => s.logout);

  const [pickingTable, setPickingTable] = useState(false);
  const [picked, setPicked]             = useState<TableLite | null>(null);
  const [askingGuests, setAskingGuests] = useState(false);

  const handlePickType = (type: ExtendedOrderType) => {
    if (type === "DINE_IN") {
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

  const handlePickTable = (t: TableLite) => {
    useTicketStore.getState().updateTicket({
      tableId: t.id,
      tableName: t.name,
      table: t.name,
    });
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

  const goTables     = () => router.push("/meseros/mis-mesas");
  const goShiftClose = () => router.push("/cierre");
  const goConfig     = () => router.push("/admin");

  return (
    <div className="flex h-screen w-full bg-[#0a0a0c] overflow-auto">
      <OrderTypeSelector
        onSelect={handlePickType}
        onClose={handleLogout}
        onTables={goTables}
        onShiftClose={goShiftClose}
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
    </div>
  );
}
