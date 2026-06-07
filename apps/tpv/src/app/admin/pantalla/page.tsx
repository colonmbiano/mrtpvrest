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
import BackButton from "@/components/BackButton";
import DualScreenSettings from "@/components/settings/DualScreenSettings";

export default function PantallaPage() {
  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto font-sans bg-[#0a0a0c] min-h-full">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-12">
        <div className="flex items-start gap-4">
          <BackButton ariaLabel="Volver al panel admin" />
          <div className="space-y-1.5">
            <span className="text-[10px] font-black tracking-[0.25em] text-amber-500/80 uppercase">
              Configuración
            </span>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-none flex items-center gap-3">
              <Monitor size={28} className="text-amber-500" />
              Pantalla de Cliente
            </h1>
            <p className="text-zinc-500 font-bold text-sm">
              Doble pantalla: mensajes, publicidad en reposo y ventana de cliente.
            </p>
          </div>
        </div>
      </div>

      <section className="bg-[#121316] rounded-3xl border border-white/5 p-6">
        <DualScreenSettings />
      </section>
    </div>
  );
}
