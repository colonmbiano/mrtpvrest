"use client";
import React from "react";
import Link from "next/link";
import { X, User, Clock, Printer, Palette, LogOut, LayoutGrid, Monitor, Settings } from "lucide-react";
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
    <div className="fixed inset-0 z-[120] flex font-sans">
      {/* OVERLAY */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      
      {/* DRAWER CONTENT */}
      <div className="relative w-full max-w-[400px] h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300 ease-out overflow-hidden" style={{ background: "#0C0C0E" }}>
        {/* Halo Glows */}
        <div 
          className="absolute pointer-events-none"
          style={{
            width: 600, height: 600, top: -100, left: -200,
            background: "radial-gradient(circle, #FF840015 0%, #FF840000 70%)"
          }}
        />
        <div 
          className="absolute pointer-events-none"
          style={{
            width: 600, height: 600, bottom: -100, right: -200,
            background: "radial-gradient(circle, #88D66C10 0%, #88D66C00 70%)"
          }}
        />

        {/* HEADER */}
        <div className="relative z-10 p-6 border-b border-border flex justify-between items-center bg-surf-1/50 backdrop-blur-md">
          <div className="flex flex-col">
            <span className="text-[10px] font-black tracking-widest uppercase text-tx-mut">Configuración</span>
            <span className="text-xl font-bold tracking-tight text-tx-pri">Menú Principal</span>
          </div>
          <button onClick={onClose} className="p-2 w-10 h-10 flex items-center justify-center rounded-full bg-surf-2 text-tx-mut hover:text-tx-pri hover:bg-surf-3 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* CONTENT */}
        <div className="relative z-10 flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
          {/* SESIÓN */}
          <section className="space-y-4">
            <span className="text-[10px] font-bold text-tx-mut tracking-widest uppercase ml-1">Sesión Actual</span>
            <div className="flex items-center gap-4 bg-surf-2/50 backdrop-blur-sm p-4 rounded-2xl border border-border transition-all hover:border-brand/30">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                {initials}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-tx-pri tracking-wide">{employee?.name ?? "Sin sesión"}</span>
                <span className="text-[10px] uppercase font-bold tracking-widest mt-0.5" style={{ color: "var(--brand)" }}>{roleLabel}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="soft" className="justify-start gap-3 h-12 rounded-xl bg-surf-2 border border-border hover:bg-surf-3">
                <User size={18} /> Mi cuenta
              </Button>
              <Button variant="soft" className="justify-start gap-3 h-12 rounded-xl bg-surf-2 border border-border hover:bg-surf-3">
                <Clock size={18} /> Ver reporte de turno
              </Button>
            </div>
          </section>

          {/* OPERACIONES */}
          <section className="space-y-4">
            <span className="text-[10px] font-bold text-tx-mut tracking-widest uppercase ml-1">Operaciones</span>
            <div className="grid grid-cols-1 gap-2">
              <Link href="/kds" onClick={onClose} className="block">
                <Button variant="soft" fullWidth className="justify-start gap-3 h-12 rounded-xl bg-surf-2 border border-border hover:bg-surf-3">
                  <Monitor size={18} /> Monitoreo KDS
                </Button>
              </Link>
              <Link href="/meseros" onClick={onClose} className="block">
                <Button variant="soft" fullWidth className="justify-start gap-3 h-12 rounded-xl bg-surf-2 border border-border hover:bg-surf-3">
                  <LayoutGrid size={18} /> Salones y Mesas
                </Button>
              </Link>
            </div>
          </section>

          {/* ADMIN */}
          {(employee?.role === "ADMIN" || employee?.role === "OWNER") && (
            <section className="space-y-4">
              <span className="text-[10px] font-bold tracking-widest uppercase ml-1" style={{ color: "var(--brand)" }}>Administración</span>
              <div className="grid grid-cols-1 gap-2">
                <Link href="/admin/menu" onClick={onClose} className="block">
                  <Button variant="soft" fullWidth className="justify-start gap-3 h-12 rounded-xl bg-surf-2 hover:bg-surf-3 border-y border-r border-border" style={{ borderLeft: "3px solid var(--brand)" }}>
                    <Settings size={18} style={{ color: "var(--brand)" }} /> Editor de Menú
                  </Button>
                </Link>
                <Link href="/admin/impresoras" onClick={onClose} className="block">
                  <Button variant="soft" fullWidth className="justify-start gap-3 h-12 rounded-xl bg-surf-2 hover:bg-surf-3 border-y border-r border-border" style={{ borderLeft: "3px solid var(--brand)" }}>
                    <Printer size={18} style={{ color: "var(--brand)" }} /> Gestión de Impresoras
                  </Button>
                </Link>
                <Link href="/admin/tickets" onClick={onClose} className="block">
                  <Button variant="soft" fullWidth className="justify-start gap-3 h-12 rounded-xl bg-surf-2 hover:bg-surf-3 border-y border-r border-border" style={{ borderLeft: "3px solid var(--brand)" }}>
                    <Monitor size={18} style={{ color: "var(--brand)" }} /> Configurador de Tickets
                  </Button>
                </Link>
              </div>
            </section>
          )}

          {/* APARIENCIA */}
          <section className="space-y-4">
            <span className="text-[10px] font-bold text-tx-mut tracking-widest uppercase ml-1">Apariencia</span>
            <div className="space-y-4">
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-tx-sec tracking-wide ml-1">Color de acento</span>
                <div className="flex gap-2">
                  {themes.map((t) => {
                    const isActive = currentTheme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => onThemeChange(t.id)}
                        className={`
                          flex-1 flex flex-col items-center justify-center gap-2 py-3 rounded-xl border text-[11px] font-bold transition-all
                          ${isActive ? "bg-surf-3 border-brand text-tx-pri shadow-[0_0_12px_var(--brand-soft)]" : "bg-surf-2 border-border text-tx-sec hover:bg-surf-3 hover:border-brand/30"}
                        `}
                      >
                        <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: t.color }} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between bg-surf-2/50 backdrop-blur-sm p-4 rounded-xl border border-border">
                <div className="flex items-center gap-3">
                  <Palette size={18} className="text-tx-mut" />
                  <span className="text-sm font-bold text-tx-pri tracking-wide">Modo Oscuro</span>
                </div>
                <button 
                  onClick={onToggleMode}
                  className={`w-12 h-6 rounded-full relative transition-colors duration-200`}
                  style={{ background: isDark ? "var(--brand)" : "var(--border)" }}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 shadow-sm ${isDark ? "left-7" : "left-1"}`} />
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* FOOTER */}
        <div className="relative z-10 p-6 border-t border-border bg-surf-1">
          <Button 
            variant="danger" 
            fullWidth 
            className="gap-2 h-14 uppercase tracking-widest font-bold text-xs rounded-2xl bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all"
            onClick={onLogout}
          >
            <LogOut size={18} /> Bloquear / Salir
          </Button>
          <div className="mt-5 text-center">
            <span className="text-[10px] text-tx-dis font-black uppercase tracking-widest opacity-60">MRTPVREST v2.4.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigMenu;
