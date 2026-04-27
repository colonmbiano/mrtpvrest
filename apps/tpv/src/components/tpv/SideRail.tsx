"use client";
import { LayoutGrid, Coffee, BarChart3, Receipt, Settings, Palette, LogOut } from "lucide-react";
import { useState } from "react";
import { usePOSStore } from "@/store/usePOSStore";
import { useRouter } from "next/navigation";
import PaletteSwitcher from "@/components/PaletteSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

export type RailSection = "catalog" | "shift" | "reports" | "receipts" | "config";

export default function SideRail({
  section = "catalog",
  onSection,
  onLogout,
}: {
  section?: RailSection;
  onSection?: (s: RailSection) => void;
  onLogout?: () => void;
}) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const logout = usePOSStore((s) => s.logout);

  const items: { id: RailSection; icon: typeof LayoutGrid; label: string }[] = [
    { id: "catalog",  icon: LayoutGrid, label: "Catálogo" },
    { id: "shift",    icon: Coffee,     label: "Turno" },
    { id: "reports",  icon: BarChart3,  label: "Reportes" },
    { id: "receipts", icon: Receipt,    label: "Recibos" },
    { id: "config",   icon: Settings,   label: "Configuración" },
  ];

  return (
    <nav className="h-full flex flex-col items-center py-4 gap-2">
      {items.map((it) => (
        <RailButton
          key={it.id}
          Icon={it.icon}
          label={it.label}
          active={section === it.id}
          onClick={() => onSection?.(it.id)}
        />
      ))}

      <div className="flex-1" />

      <div className="relative">
        <RailButton
          Icon={Palette}
          label="Paleta"
          active={paletteOpen}
          onClick={() => setPaletteOpen((v) => !v)}
        />
        {paletteOpen && (
          <div
            className="absolute left-full ml-3 top-0 z-50 p-3 rounded-2xl"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <PaletteSwitcher layout="row" size="md" />
          </div>
        )}
      </div>

      <ThemeToggle size="md" />

      <RailButton
        Icon={LogOut}
        label="Salir"
        danger
        onClick={() => {
          if (confirm("¿Cerrar sesión?")) {
            onLogout?.();
            logout();
            router.replace("/");
          }
        }}
      />
    </nav>
  );
}

function RailButton({
  Icon,
  label,
  active,
  danger,
  onClick,
}: {
  Icon: typeof LayoutGrid;
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
      style={{
        background: active ? "var(--surface-3)" : "transparent",
        color: danger
          ? "var(--danger)"
          : active
          ? "var(--text-primary)"
          : "var(--text-secondary)",
      }}
      onMouseEnter={(e) => {
        if (!active && !danger) e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon size={20} />
    </button>
  );
}
