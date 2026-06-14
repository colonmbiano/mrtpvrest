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
import { Receipt } from "lucide-react";
import { AdminScreen, AdminHeader } from "@/components/admin/AdminScreen";
import TicketFormatTab from "@/components/admin/printing/TicketFormatTab";

export default function TicketConfigPage() {
  return (
    <AdminScreen>
      <AdminHeader
        icon={Receipt}
        title="Tickets"
        subtitle="Formato del recibo del cliente y de la comanda, opciones por línea y PIN admin."
      />
      <TicketFormatTab />
    </AdminScreen>
  );
}
