"use client";

import { TrendingUp } from "lucide-react";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { EmptyState } from "@/components/admin/atoms";

export default function VentasPage() {
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <AdminTopbar title="Ventas" subtitle="Monitorea tus ventas y el rendimiento de tu negocio." />
      <EmptyState icon={TrendingUp} title="Ventas — en construcción" hint="Esta sección se implementa en el siguiente paso del rediseño (KPIs, gráficas y tabla de órdenes)." />
    </div>
  );
}
