"use client";

import { Settings } from "lucide-react";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { EmptyState } from "@/components/admin/atoms";

export default function ConfiguracionPage() {
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <AdminTopbar title="Configuración" subtitle="Gestiona los ajustes generales de tu tienda y equipo." />
      <EmptyState icon={Settings} title="Configuración — en construcción" hint="Esta sección se implementa en el siguiente paso del rediseño (tienda, usuarios y roles, dispositivos, facturación y notificaciones)." />
    </div>
  );
}
