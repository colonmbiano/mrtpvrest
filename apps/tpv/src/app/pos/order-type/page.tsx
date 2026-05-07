"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";
import OrderTypeSelector from "@/components/pos/OrderTypeSelector";
import type { ExtendedOrderType } from "@/components/pos/OrderTypeSelector";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useAuthStore } from "@/store/authStore";

export default function OrderTypePage() {
  const router = useRouter();

  // Asegura sesión válida y disponibilidad de stores en cliente
  useTPVAuth();
  const logout = useAuthStore((s) => s.logout);

  const handlePickType = (type: ExtendedOrderType) => {
    useTicketStore.getState().updateTicket({ type });
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
    </div>
  );
}
