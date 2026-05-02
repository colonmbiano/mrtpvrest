"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useTicketStore } from "@/store/ticketStore";
import OrderTypeSelector from "@/components/pos/OrderTypeSelector";
import type { ExtendedOrderType } from "@/components/pos/OrderTypeSelector";
import { useTPVAuth } from "@/hooks/useTPVAuth";

export default function OrderTypePage() {
  const router = useRouter();

  const handlePickType = (type: ExtendedOrderType) => {
    // Inicializar el estado de la orden
    useTicketStore.getState().updateTicket({ type: type as any });
    
    // Redirigir a la toma de pedidos (POS Menu)
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
      />
    </div>
  );
}
