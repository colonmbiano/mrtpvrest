"use client";
import React, { useEffect, useState } from "react";
import { Map, List, ShoppingBag, LogOut, Lock } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import api from "@/lib/api";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import { useTicketStore } from "@/store/ticketStore";

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentEmployee, isLocked, logout } = useTPVAuth();

  // Turno laboral (EmployeeShift). Clock-in automático al entrar: el mesero
  // metió su PIN en el lock screen, no tiene que "iniciar turno" aparte.
  const [shiftStartAt, setShiftStartAt] = useState<string | null>(null);
  const [confirmEndShift, setConfirmEndShift] = useState(false);
  const [endingShift, setEndingShift] = useState(false);

  useEffect(() => {
    if (!currentEmployee || isLocked) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/api/employees/me/shift");
        if (cancelled) return;
        if (data?.startAt) {
          setShiftStartAt(data.startAt);
        } else {
          const started = await api.post("/api/employees/me/shift/start");
          if (!cancelled) setShiftStartAt(started.data?.startAt ?? new Date().toISOString());
        }
      } catch {
        // Sin red o sesión de User (no Employee): la pantalla sigue usable,
        // solo no se registra el clock-in.
      }
    })();
    return () => { cancelled = true; };
  }, [currentEmployee?.id, isLocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🔒 Bloquear: limpia la sesión y regresa al lock screen. NO toca el
  // turno — al volver a meter el PIN el mesero sigue "trabajando".
  const handleLock = () => {
    logout();
    router.replace("/locked");
  };

  // Terminar turno: cierra el EmployeeShift y luego bloquea la terminal.
  const handleEndShift = async () => {
    if (endingShift) return;
    setEndingShift(true);
    try {
      await api.post("/api/employees/me/shift/end");
      toast.success("Turno cerrado");
    } catch {
      toast.error("No se pudo cerrar el turno (se cerrará la sesión igual)");
    } finally {
      setEndingShift(false);
      setConfirmEndShift(false);
      handleLock();
    }
  };

  const handleTakeout = () => {
    useTicketStore.getState().updateTicket({ type: "TAKEOUT" });
    router.push("/pos/menu");
  };

  useEffect(() => {
    if (currentEmployee && !isLocked) {
      const allowedRoles = ["WAITER", "OWNER", "ADMIN", "MANAGER"];
      if (!allowedRoles.includes(currentEmployee.role)) {
        console.warn(
          `[SECURITY] Acceso denegado a /(waiter): rol ${currentEmployee.role} no autorizado`
        );
        router.replace("/");
      }
    }
  }, [currentEmployee, isLocked, router]);

  const tabs = [
    { id: "salon",     icon: Map,  label: "Salón",     href: "/meseros" },
    { id: "mis-mesas", icon: List, label: "Mis mesas", href: "/meseros/mis-mesas" },
  ];

  return (
    <div
      className="relative flex flex-col h-[100dvh] w-full bg-[#0a0a0c] text-white overflow-hidden"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* Ambient diseño operativo glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full blur-[100px] opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(255,184,77,0.18) 0%, transparent 70%)' }}
      />

      {/* HEADER */}
      <header className="relative z-10 h-16 px-5 bg-white/5 backdrop-blur-md border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex flex-col">
          <span className="text-[10px] font-black tracking-[0.25em] text-white/40">VISTA</span>
          <span className="text-[15px] font-black text-white tracking-tight">Salón · Centro</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 backdrop-blur-md px-3 py-1.5 rounded-full">
            <div className="w-6 h-6 rounded-full bg-[#ffb84d] text-[#0a0a0c] text-[10px] flex items-center justify-center font-black">
              {currentEmployee?.name?.substring(0, 2).toUpperCase() || "SR"}
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[11px] font-bold text-white">
                {currentEmployee?.name?.toUpperCase() || "MESERO"}
              </span>
              {shiftStartAt && (
                <span className="text-[9px] font-bold text-[#88D66C]">
                  Turno desde{" "}
                  {new Date(shiftStartAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleLock}
            aria-label="Bloquear terminal"
            title="Bloquear (conserva tu turno)"
            className="w-10 h-10 min-h-[40px] rounded-full bg-white/5 border border-white/10 backdrop-blur-md flex items-center justify-center text-white/60 active:scale-95 transition-all hover:text-[#ffb84d] hover:border-[#ffb84d]/30"
          >
            <Lock size={16} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => setConfirmEndShift(true)}
            aria-label="Terminar turno"
            title="Terminar turno"
            className="w-10 h-10 min-h-[40px] rounded-full bg-white/5 border border-white/10 backdrop-blur-md flex items-center justify-center text-white/60 active:scale-95 transition-all hover:text-red-400 hover:border-red-400/30"
          >
            <LogOut size={16} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* CONFIRMACIÓN — terminar turno */}
      {confirmEndShift && (
        <div
          className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setConfirmEndShift(false)}
        >
          <div
            className="w-full max-w-sm bg-[#0C0C0E] border border-white/10 rounded-3xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-[16px] font-black">¿Terminar turno?</h3>
              <p className="text-[13px] font-bold text-white/50">
                Tu turno quedará cerrado y la terminal se bloqueará. Si solo
                vas a descansar, usa Bloquear: el turno sigue corriendo.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmEndShift(false)}
                className="flex-1 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-[0.15em] text-white/70 active:scale-95 transition-transform"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEndShift}
                disabled={endingShift}
                className="flex-1 h-12 min-h-[48px] rounded-2xl bg-red-500/90 text-white text-[11px] font-black uppercase tracking-[0.15em] active:scale-95 transition-transform disabled:opacity-50"
              >
                {endingShift ? "Cerrando…" : "Terminar turno"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTENT */}
      <main className="relative z-10 flex-1 overflow-hidden">
        {children}
      </main>

      {/* BOTTOM NAV */}
      <nav className="relative z-10 h-[72px] bg-white/5 backdrop-blur-md border-t border-white/10 flex items-stretch p-1.5 shrink-0">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              prefetch={false}
              className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-2xl active:scale-95 transition-transform ${
                isActive
                  ? "text-[#ffb84d] bg-[#ffb84d]/10 border border-[#ffb84d]/20"
                  : "text-white/45"
              }`}
            >
              <Icon size={20} />
              <span className="text-[9px] font-black uppercase tracking-widest">{tab.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={handleTakeout}
          className="flex-1 flex items-center justify-center gap-2 bg-[#ffb84d] text-[#0a0a0c] rounded-2xl mx-1 font-black text-[11px] uppercase tracking-widest shadow-[0_10px_30px_rgba(255,184,77,0.3)] active:scale-95 transition-transform"
        >
          <ShoppingBag size={16} strokeWidth={2.5} />
          Llevar
        </button>
      </nav>
    </div>
  );
}
