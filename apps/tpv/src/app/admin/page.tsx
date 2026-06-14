"use client";
import React from "react";
import Link from "next/link";
import {
  BarChart3,
  Settings,
  Printer,
  Users,
  CreditCard,
  ChevronRight,
  Grid3x3,
  Palette,
  MonitorPlay,
} from "lucide-react";
import { AdminScreen, AdminHeader } from "@/components/admin/AdminScreen";

const SECTIONS = [
  {
    href: "/admin/reportes",
    label: "Analítica y Reportes",
    desc: "Ventas, productos top, rendimiento del turno",
    icon: BarChart3,
    accent: "#ffb84d",
  },
  {
    href: "/admin/menu",
    label: "Catálogo de Menú",
    desc: "Productos, categorías, precios e imágenes",
    icon: Settings,
    accent: "#3b82f6",
  },
  {
    href: "/admin/mesas",
    label: "Mesas y Zonas",
    desc: "Capacidad, layout y estado en vivo",
    icon: Grid3x3,
    accent: "#88D66C",
  },
  {
    href: "/admin/impresoras",
    label: "Red e Impresoras",
    desc: "Impresoras de tickets y estaciones KDS",
    icon: Printer,
    accent: "#10b981",
  },
  {
    href: "/admin/apariencia",
    label: "Apariencia",
    desc: "Tipografía, ancho del panel, paleta y modo",
    icon: Palette,
    accent: "#ec4899",
  },
  {
    href: "/admin/pantalla",
    label: "Pantalla de Cliente",
    desc: "Doble pantalla: mensajes, publicidad y ventana de cliente",
    icon: MonitorPlay,
    accent: "#34d399",
  },
  {
    href: "/admin/usuarios",
    label: "Personal y Seguridad",
    desc: "Empleados, roles, PINs y políticas de autorización",
    icon: Users,
    accent: "#f59e0b",
  },
  {
    href: "/admin/pagos",
    label: "Pagos e Impuestos",
    desc: "IVA, propina y métodos de pago",
    icon: CreditCard,
    accent: "#22d3ee",
  },
];

export default function AdminLandingPage() {
  return (
    <AdminScreen>
      <AdminHeader
        back={false}
        eyebrow="Configuración"
        title="Panel Central"
        subtitle="Administra el catálogo, hardware, personal y políticas de tu sucursal."
      />

      {/* Grid de secciones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                prefetch={false}
                className="group relative flex items-center gap-4 p-5 min-h-[64px] rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 active:scale-95 transition-transform duration-150 overflow-hidden"
              >
                {/* Halo del color de acento */}
                <div
                  aria-hidden
                  className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-[60px] opacity-20"
                  style={{ background: s.accent }}
                />

                {/* Icono */}
                <div
                  className="relative w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `${s.accent}1A`,
                    border: `1px solid ${s.accent}40`,
                    color: s.accent,
                  }}
                >
                  <Icon size={22} strokeWidth={2.5} />
                </div>

                {/* Texto */}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-black text-white tracking-tight">
                    {s.label}
                  </span>
                  <span className="text-[11px] font-medium text-white/55 truncate">
                    {s.desc}
                  </span>
                </div>

                <ChevronRight
                  size={18}
                  strokeWidth={3}
                  className="text-white/30 flex-shrink-0"
                />
              </Link>
            );
          })}
      </div>
    </AdminScreen>
  );
}
