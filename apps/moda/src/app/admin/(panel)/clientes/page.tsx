"use client";

import { Users } from "lucide-react";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { EmptyState } from "@/components/admin/atoms";

export default function ClientesPage() {
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <AdminTopbar title="Clientes" subtitle="Gestiona tu base de clientes y analiza su comportamiento." />
      <EmptyState icon={Users} title="Clientes — en construcción" hint="Esta sección se implementa en el siguiente paso del rediseño (KPIs, tabla, segmentos y retención)." />
    </div>
  );
}
