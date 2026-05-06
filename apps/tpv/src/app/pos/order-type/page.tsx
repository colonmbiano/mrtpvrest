"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";
import OrderTypeSelector from "@/components/pos/OrderTypeSelector";
import type { ExtendedOrderType } from "@/components/pos/OrderTypeSelector";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import api from "@/lib/api";

export default function OrderTypePage() {
  const router = useRouter();
  const [openOrders, setOpenOrders] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ACTIVE = new Set(["OPEN", "PENDING", "PREPARING", "CONFIRMED", "READY", "OUT_FOR_DELIVERY"]);
    api.get("/api/orders/admin")
      .then(({ data }) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setOpenOrders(list.filter((o: any) => ACTIVE.has(o.status)).length);
      })
      .catch(() => { /* silent — endpoint requires admin role */ });
    return () => { cancelled = true; };
  }, []);

  const handlePickType = (type: ExtendedOrderType) => {
    useTicketStore.getState().updateTicket({ type: type as any });
    router.replace("/pos/menu");
  };

  const handleLogout = () => {
    useTPVAuth.getState().logout();
    router.replace("/locked");
  };

  return (
    <div className="flex h-screen w-full bg-[#0C0C0E] overflow-auto">
      <OrderTypeSelector
        onSelect={handlePickType}
        onClose={handleLogout}
        openOrdersCount={openOrders}
        onOpenTickets={openOrders > 0 ? () => router.replace("/pos/menu") : undefined}
      />
    </div>
  );
}
