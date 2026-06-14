"use client";

/**
 * /admin/pantalla — configuración de la pantalla de cliente (doble pantalla).
 *
 * Monta `DualScreenSettings`, que antes vivía dentro del difunto
 * `TPVConfigModal` (nunca montado → la config era inalcanzable). Ahora es una
 * ruta admin viva, enlazada desde la grilla del panel.
 */

import React from "react";
import { Monitor } from "lucide-react";
import { AdminScreen, AdminHeader, AdminCard } from "@/components/admin/AdminScreen";
import DualScreenSettings from "@/components/settings/DualScreenSettings";

export default function PantallaPage() {
  return (
    <AdminScreen>
      <AdminHeader
        icon={Monitor}
        title="Pantalla de Cliente"
        subtitle="Doble pantalla: mensajes, publicidad en reposo y ventana de cliente."
      />

      <AdminCard glass={false} className="p-6">
        <DualScreenSettings />
      </AdminCard>
    </AdminScreen>
  );
}
