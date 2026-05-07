"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";
import OrderTypeSelector from "@/components/pos/OrderTypeSelector";
import type { ExtendedOrderType } from "@/components/pos/OrderTypeSelector";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";

export default function OrderTypePage() {
  const router = useRouter();
  const [openOrders, setOpenOrders] = useState(0);

  // Asegura sesión válida y disponibilidad de stores en cliente
  useTPVAuth();
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    let cancelled = false;
    const ACTIVE = new Set(["OPEN", "PENDING", "PREPARING", "CONFIRMED", "READY", "OUT_FOR_DELIVERY"]);
    api.get("/api/orders/admin")
      .then(({ data }) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setOpenOrders(list.filter((o: any) => ACTIVE.has(o.status)).length);
      })
      .catch(() => { /* silent — endpoint puede requerir rol admin */ });
    return () => { cancelled = true; };
  }, []);

  const handlePickType = (type: ExtendedOrderType) => {
    useTicketStore.getState().updateTicket({ type });
    router.replace("/pos/menu");
  };

  const handleLogout = () => {
    logout();
    router.replace("/locked");
  };

  const goTables      = () => router.push("/meseros/mis-mesas");
  const goShiftClose  = () => router.push("/cierre");
  const goConfig      = () => router.push("/admin");
  const openTickets   = openOrders > 0 ? () => router.replace("/pos/menu") : undefined;

  return (
    <div className="flex h-screen w-full bg-[#0a0a0c] overflow-auto">
      <OrderTypeSelector
        onSelect={handlePickType}
        onClose={handleLogout}
        openOrdersCount={openOrders}
        onOpenTickets={openTickets}
        onTables={goTables}
        onShiftClose={goShiftClose}
        onConfig={goConfig}
      />
    </div>
  );
}
