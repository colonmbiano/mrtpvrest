"use client";

import React from "react";
import { usePathname } from "next/navigation";
import OrderPanel from "@/components/pos/OrderPanel";

export default function POSLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // El selector de tipo de orden ocupa toda la pantalla — no necesita el panel
  const hidePanel = pathname?.startsWith("/pos/order-type");

  if (hidePanel) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: "#0C0C0E" }}>
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">{children}</main>
      <div className="hidden lg:flex w-[400px] shrink-0">
        <OrderPanel />
      </div>
    </div>
  );
}
