"use client";

/**
 * /admin/impresoras — Centro de impresión unificado.
 *
 * Consolida en una sola pantalla con 3 tabs lo que antes vivía disperso en
 * 2 páginas + 3 modales (impresoras, grupos-impresoras, KDSConfigModal,
 * PrinterCategoriesModal, TicketConfigModal):
 *   · Dispositivos  → impresoras físicas + pantallas KDS
 *   · Ruteo         → printer groups (fuente única) + override por producto
 *
 * El formato del ticket/comanda vive ahora en su propia pantalla (/admin/tickets),
 * que es el único editor de formato (antes estaba duplicado aquí como pestaña).
 */

import React, { useEffect, useState } from "react";
import { Monitor, Layers, Printer } from "lucide-react";
import { AdminScreen, AdminHeader, AdminTabs } from "@/components/admin/AdminScreen";
import DevicesTab from "@/components/admin/printing/DevicesTab";
import RoutingTab from "@/components/admin/printing/RoutingTab";

type TabKey = "dispositivos" | "ruteo";

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: "dispositivos", label: "Dispositivos", icon: <Monitor size={16} /> },
  { key: "ruteo", label: "Ruteo", icon: <Layers size={16} /> },
];

export default function ImpresorasPage() {
  const [tab, setTab] = useState<TabKey>("dispositivos");

  // Deep-link opcional (?tab=ruteo) sin useSearchParams (evita Suspense).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || typeof window === "undefined") return;
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t === "ruteo" || t === "dispositivos") setTab(t);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <AdminScreen>
      <AdminHeader
        icon={Printer}
        title="Impresión"
        subtitle="Dispositivos físicos y enrutamiento de impresión. El formato del ticket está en Tickets."
      />

      <AdminTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "dispositivos" && <DevicesTab />}
      {tab === "ruteo" && <RoutingTab />}
    </AdminScreen>
  );
}
