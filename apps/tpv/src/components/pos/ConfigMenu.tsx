"use client";
import React from "react";
import { X, Palette, LogOut } from "lucide-react";
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

  // Temas Warm Tech actualizados
  const themes = [
    { id: "amber",  label: "Miel",   color: "#ffb84d" },
    { id: "purple", label: "Cian",   color: "#3b82f6" },
    { id: "green",  label: "Lima",   color: "#10b981" },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex font-sans">
      {/* OVERLAY */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* DRAWER CONTENT - WARM TECH */}
      <div className="relative w-full max-w-[400px] h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300 ease-out overflow-hidden bg-[#0a0a0c] border-r border-white/5">
        {/* Glows */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-amber-500/5 blur-[80px] rounded-full" />
          <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-amber-500/5 blur-[80px] rounded-full" />
        </div>

        {/* HEADER */}
        <div className="relative z-10 p-8 border-b border-white/5 flex justify-between items-center bg-[#0a0a0c]/80 backdrop-blur-xl">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black tracking-[0.2em] uppercase text-zinc-500">Configuración</span>
            <span className="text-2xl font-black tracking-tight text-white">Centro de Control</span>
          </div>
          <button
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-[#121316] text-zinc-400 active:text-white transition-all active:scale-90 border border-white/5"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* CONTENT */}
        <div className="relative z-10 flex-1 overflow-y-auto p-8 space-y-10 scrollbar-hide">
          {/* SESIÓN */}
          <section className="space-y-5">
            <span className="text-[11px] font-black text-zinc-500 tracking-[0.2em] uppercase ml-1">Sesión Activa</span>
            <div className="flex items-center gap-5 bg-[#121316] p-5 rounded-[1.5rem] border border-white/5 shadow-xl">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl bg-amber-500 text-[#0a0a0c] shadow-[0_0_15px_rgba(255,184,77,0.2)]">
                {initials}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-base font-black text-white tracking-tight">{employee?.name ?? "Invitado"}</span>
                <span className="text-[10px] uppercase font-black tracking-[0.15em] text-amber-500/80">{roleLabel}</span>
              </div>
            </div>
          </section>

          {/* APARIENCIA */}
          <section className="space-y-6">
            <span className="text-[11px] font-black text-zinc-500 tracking-[0.2em] uppercase ml-1">Personalización</span>
            <div className="space-y-6">
              <div className="flex flex-col gap-4">
                <span className="text-[11px] font-bold text-zinc-400 tracking-wide ml-1">Paleta de Acento</span>
                <div className="flex gap-3">
                  {themes.map((t) => {
                    const isActive = currentTheme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => onThemeChange(t.id)}
                        className={`
                          flex-1 flex flex-col items-center justify-center gap-3 h-20 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all active:scale-95
                          ${isActive ? "bg-[#1a1b1f] border-amber-500 text-white shadow-[0_0_15px_rgba(255,184,77,0.2)]" : "bg-[#121316] border-white/5 text-zinc-600"}
                        `}
                      >
                        <div className="w-5 h-5 rounded-full shadow-lg" style={{ backgroundColor: t.color }} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between bg-[#121316] p-5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-4">
                  <Palette size={20} className="text-zinc-500" />
                  <span className="text-sm font-bold text-zinc-200">Interfaz Nocturna</span>
                </div>
                <button
                  onClick={onToggleMode}
                  className="w-14 h-7 rounded-full relative transition-all duration-300 shadow-inner"
                  style={{ background: isDark ? "#ffb84d" : "#1a1b1f" }}
                  aria-label="Alternar modo oscuro"
                >
                  <div
                    className={`absolute top-1 w-5 h-5 rounded-full transition-all duration-300 shadow-lg ${isDark ? "left-8 bg-[#0a0a0c]" : "left-1 bg-zinc-600"}`}
                  />
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* FOOTER */}
        <div className="relative z-10 p-8 border-t border-white/5 bg-[#0a0a0c]">
          <button
            className="w-full flex items-center justify-center gap-3 h-16 rounded-[1.25rem] bg-red-500/10 text-red-500 border border-red-500/20 font-black uppercase tracking-[0.2em] text-xs transition-all active:scale-95 active:bg-red-500 active:text-white"
            onClick={onLogout}
          >
            <LogOut size={20} /> Bloquear Terminal
          </button>
          <div className="mt-8 text-center">
            <span className="text-[10px] text-zinc-700 font-black uppercase tracking-[0.3em]">MRTPVREST · WARM TECH ENGINE</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigMenu;
