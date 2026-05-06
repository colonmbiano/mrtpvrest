import React from "react";

// Este layout es un wrapper transparente.
// El layout completo (SideRail + SidebarTicket + Header) lo maneja
// apps/tpv/src/app/pos/menu/layout.tsx para no duplicar paneles de cobro.
export default function POSLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
