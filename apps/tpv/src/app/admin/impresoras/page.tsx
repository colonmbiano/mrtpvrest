"use client";

/**
 * /admin/impresoras — Centro de impresión unificado.
 *
 * Consolida en una sola pantalla con 3 tabs lo que antes vivía disperso en
 * 2 páginas + 3 modales (impresoras, grupos-impresoras, KDSConfigModal,
 * PrinterCategoriesModal, TicketConfigModal):
 *   · Dispositivos  → impresoras físicas + pantallas KDS
 *   · Ruteo         → printer groups (fuente única) + override por producto
 *   · Formato       → formato global de ticket/comanda + PIN admin
 */

import React, { useEffect, useState } from "react";
import { Monitor, Layers, Receipt } from "lucide-react";
import BackButton from "@/components/BackButton";
import DevicesTab from "@/components/admin/printing/DevicesTab";
import RoutingTab from "@/components/admin/printing/RoutingTab";
import TicketFormatTab from "@/components/admin/printing/TicketFormatTab";

type TabKey = "dispositivos" | "ruteo" | "formato";

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: "dispositivos", label: "Dispositivos", icon: <Monitor size={16} /> },
  { key: "ruteo", label: "Ruteo", icon: <Layers size={16} /> },
  { key: "formato", label: "Formato", icon: <Receipt size={16} /> },
];

export default function ImpresorasPage() {
  const [tab, setTab] = useState<TabKey>("dispositivos");

  // Deep-link opcional (?tab=ruteo) sin useSearchParams (evita Suspense).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || typeof window === "undefined") return;
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t === "ruteo" || t === "formato" || t === "dispositivos") setTab(t);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto min-h-[100dvh] font-sans">
      <div className="flex items-start gap-4 mb-8">
        <BackButton ariaLabel="Volver al panel admin" />
        <div>
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-zinc-500 block mb-2">Configuración</span>
          <h1 className="text-3xl font-black text-white tracking-tight mb-1">Impresión</h1>
          <p className="text-sm text-zinc-400 font-medium">Dispositivos, enrutamiento y formato de tickets en un solo lugar.</p>
        </div>
      </div>

      <div className="flex gap-2 mb-8 border-b border-white/5 pb-4 overflow-x-auto scrollbar-hide">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shrink-0 ${tab === t.key ? "bg-amber-500 text-[#0a0a0c] shadow-lg shadow-amber-500/20" : "bg-[#121316] text-zinc-400 hover:text-white"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === "dispositivos" && <DevicesTab />}
      {tab === "ruteo" && <RoutingTab />}
      {tab === "formato" && <TicketFormatTab />}
    </div>
  );
}
