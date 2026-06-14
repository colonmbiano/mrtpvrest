"use client";

/**
 * /admin/tickets — Editor COMPLETO del formato de tickets.
 *
 * Único lugar para configurar el recibo del cliente y la comanda de cocina:
 * identidad del negocio, tipografía, opciones POR LÍNEA (precio, modificadores,
 * notas, sangría, separación), datos fiscales/QR y PIN admin. Consolida lo que
 * antes estaba partido entre esta pantalla (incompleta) y la pestaña "Formato"
 * de /admin/impresoras. Toda la UI + previews viven en TicketFormatTab y
 * persisten en /api/printers/ticket-config (modelo TicketConfig por sucursal).
 */

import React from "react";
import BackButton from "@/components/BackButton";
import TicketFormatTab from "@/components/admin/printing/TicketFormatTab";

export default function TicketConfigPage() {
  return (
    <div className="p-8 max-w-6xl mx-auto min-h-[100dvh] font-sans">
      <div className="flex items-start gap-4 mb-8">
        <BackButton ariaLabel="Volver al panel admin" />
        <div>
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-zinc-500 block mb-2">Configuración</span>
          <h1 className="text-3xl font-black text-white tracking-tight mb-1">Tickets</h1>
          <p className="text-sm text-zinc-400 font-medium">
            Formato del recibo del cliente y de la comanda, opciones por línea y PIN admin.
          </p>
        </div>
      </div>
      <TicketFormatTab />
    </div>
  );
}
