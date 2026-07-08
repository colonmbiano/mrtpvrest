"use client";

import { Box, PackagePlus, ReceiptText, Sparkles, TrendingUp } from "lucide-react";
import { ActionTile, SectionHead } from "@/components/ds";

const ACTIONS = [
  { href: "/admin/pedidos", icon: ReceiptText, label: "Ver pedidos" },
  { href: "/admin/inventario", icon: Box, label: "Inventario" },
  { href: "/admin/promociones", icon: Sparkles, label: "Crear promo" },
  { href: "/admin/turnos", icon: TrendingUp, label: "Corte de caja" },
] as const;

/* Accesos rápidos a las secciones más usadas del panel. */
export default function QuickActions() {
  return (
    <div>
      <SectionHead title="Acciones rápidas" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
        {ACTIONS.map((action) => (
          <ActionTile key={action.href} href={action.href} icon={action.icon} label={action.label} />
        ))}
        <div className="col-span-2 md:col-span-1">
          <ActionTile href="/admin/menu" icon={PackagePlus} label="Administrar platillos" />
        </div>
      </div>
    </div>
  );
}
