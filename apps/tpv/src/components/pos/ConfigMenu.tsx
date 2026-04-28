"use client";
import React from "react";
import Link from "next/link";
import { X, User, Clock, Printer, Palette, LogOut, LayoutGrid, Monitor } from "lucide-react";
import Button from "@/components/ui/Button";
import { useAuthStore, type EmployeeRole } from "@/store/authStore";

const ROLE_LABEL: Record<EmployeeRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  CASHIER: "Cajero",
  WAITER: "Mesero",
  KITCHEN: "Cocina",
  COOK: "Cocinero",
  DELIVERY: "Repartidor",
};

interface ConfigMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  currentTheme: string;
  onThemeChange: (theme: string) => void;
  isDark: boolean;
  onToggleMode: () => void;
}

const ConfigMenu: React.FC<ConfigMenuProps> = ({
  isOpen,
  onClose,
  onLogout,
  currentTheme,
  onThemeChange,
  isDark,
  onToggleMode,
}) => {
  const employee = useAuthStore((s) => s.employee);

  if (!isOpen) return null;

  const initials =
    (employee?.name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "??";

  const roleLabel = employee?.role ? ROLE_LABEL[employee.role] : "Sin sesión";

  const themes = [
    { id: "green",  label: "Esmeralda", color: "#10b981" },
    { id: "purple", label: "Índigo",    color: "#6366f1" },
    { id: "orange", label: "Ámbar",     color: "#f97316" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* OVERLAY */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      
      {/* DRAWER CONTENT */}
      <div className="relative w-[360px] h-full bg-surf-1 border-r border-bd shadow-2xl flex flex-col animate-in slide-in-from-left duration-300 ease-out">
        {/* HEADER */}
        <div className="p-6 border-b border-bd flex justify-between items-center">
          <div className="flex flex-col">
            <span className="eyebrow">CONFIGURACIÓN</span>
            <span className="text-[18px] font-black">Menú Principal</span>
          </div>
          <button onClick={onClose} className="text-tx-mut hover:text-tx-pri p-2 rounded-full hover:bg-surf-2">
            <X size={20} />
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
          {/* SESIÓN */}
          <section className="space-y-4">
            <span className="eyebrow">SESIÓN ACTUAL</span>
            <div className="flex items-center gap-4 bg-surf-2 p-4 rounded-xl border border-bd">
              <div className="w-12 h-12 rounded-full bg-iris-soft text-iris-500 flex items-center justify-center font-black text-lg">{initials}</div>
              <div className="flex flex-col">
                <span className="text-[14px] font-bold">{employee?.name ?? "Sin sesión"}</span>
                <span className="text-[11px] text-tx-mut uppercase font-bold tracking-tight">{roleLabel}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="soft" className="justify-start gap-3">
                <User size={16} /> Mi cuenta
              </Button>
              <Button variant="soft" className="justify-start gap-3">
                <Clock size={16} /> Ver reporte de turno
              </Button>
            </div>
          </section>

          {/* OPERACIONES */}
          <section className="space-y-4">
            <span className="eyebrow">OPERACIONES</span>
            <div className="grid grid-cols-1 gap-2">
              <Link href="/kds" onClick={onClose} className="block">
                <Button variant="soft" fullWidth className="justify-start gap-3">
                  <Monitor size={16} /> Monitoreo KDS
                </Button>
              </Link>
              <Link href="/meseros" onClick={onClose} className="block">
                <Button variant="soft" fullWidth className="justify-start gap-3">
                  <LayoutGrid size={16} /> Salones y Mesas
                </Button>
              </Link>
              {/* TODO: ruta /configuracion/impresoras aún no existe en apps/tpv/src/app — habilitar cuando esté lista */}
              <Button
                variant="soft"
                className="justify-start gap-3 opacity-60 cursor-not-allowed"
                disabled
                title="Próximamente"
              >
                <Printer size={16} /> Configurar impresoras
              </Button>
            </div>
          </section>

          {/* APARIENCIA */}
          <section className="space-y-4">
            <span className="eyebrow">APARIENCIA</span>
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-bold text-tx-sec uppercase">Color de acento</span>
                <div className="flex gap-2">
                  {themes.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onThemeChange(t.id)}
                      className={`
                        flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] font-bold transition-pos
                        ${currentTheme === t.id ? "bg-surf-3 border-iris-500 text-tx-pri shadow-sm" : "bg-surf-2 border-bd text-tx-sec hover:bg-surf-hover"}
                      `}
                    >
                      <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: t.color }} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between bg-surf-2 p-3 rounded-xl border border-bd">
                <div className="flex items-center gap-3">
                  <Palette size={16} className="text-tx-mut" />
                  <span className="text-[13px] font-bold">Modo Oscuro</span>
                </div>
                <button 
                  onClick={onToggleMode}
                  className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${isDark ? "bg-iris-500" : "bg-bd"}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 ${isDark ? "left-7" : "left-1"}`} />
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* FOOTER */}
        <div className="p-6 border-t border-bd bg-surf-0">
          <Button 
            variant="danger" 
            fullWidth 
            className="gap-2 h-12 uppercase tracking-widest font-black text-xs"
            onClick={onLogout}
          >
            <LogOut size={16} /> Cerrar Sesión
          </Button>
          <div className="mt-4 text-center">
            <span className="text-[10px] text-tx-dis font-bold uppercase tracking-widest">MRTPVREST v2.4.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigMenu;
