"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import api from "@/lib/api";
import { apiOrQueue } from "@/lib/offline";
import { UtensilsCrossed, ArrowLeft, Users } from "lucide-react";

const ShiftOpenPage = () => {
  const router = useRouter();
  const { currentEmployee, isLocked, logout } = useTPVAuth();
  const [openingFloat, setOpeningFloat] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Cuerpo diferido a microtask (ver impresoras): evita
    // set-state-in-effect. Comportamiento idéntico.
    queueMicrotask(() => {
      if (cancelled) return;
      // No consultar el turno si todavía no hay empleado logueado o si la
      // sesión está bloqueada. Sin token la petición devuelve 401 y mete
      // ruido rojo en la consola sin que el cajero pueda accionar nada.
      if (isLocked || !currentEmployee) {
        setChecking(false);
        return;
      }

      const checkShift = async () => {
        try {
          const { data } = await api.get("/api/shifts/active");
          if (!cancelled && (data?.isOpen || data?.id)) {
            localStorage.setItem("tpv-shift-open", "true");
            router.replace("/pos/order-type");
          } else if (!cancelled) {
            localStorage.setItem("tpv-shift-open", "false");
          }
        } catch (err: any) {
          // 401 acá indica token expirado entre render y request;
          // useTPVAuth ya redirige a /locked. Silenciamos para no alarmar.
          if (err?.response?.status !== 401) {
            console.error("Error checking shift:", err);
          }
        } finally {
          if (!cancelled) setChecking(false);
        }
      };
      checkShift();
    });
    return () => { cancelled = true; };
  }, [router, isLocked, currentEmployee]);

  const handleOpenShift = async () => {
    if (!openingFloat) {
      alert("Por favor, ingresa el fondo de caja inicial.");
      return;
    }
    if (!currentEmployee) return;

    setLoading(true);
    try {
      // apiOrQueue: si hay red abre el turno normal; si no (o cold-start /
      // error de red) lo ENCOLA con Idempotency-Key y entramos optimistamente
      // al POS. El backend asigna req.shiftId a las órdenes al sincronizar, y
      // la idempotencia global garantiza que el replay no cree turnos dobles.
      // Solo los 4xx legítimos (permisos/plan/validación) bloquean la entrada.
      const res = await apiOrQueue("shift", "POST", "/api/shifts/open", {
        openingFloat: Number(openingFloat),
        employeeId: currentEmployee.id,
        employeeName: currentEmployee.name,
      });

      if (res.ok) {
        localStorage.setItem("tpv-shift-open", "true");
        router.replace("/pos/order-type");
        return;
      }

      // Error legítimo del servidor (no se encoló). Mensaje diferenciado para
      // que el cajero sepa si es permisos vs. otra cosa, en vez de la alerta
      // genérica de antes.
      if (res.status === 403) {
        alert(res.error || "No tienes permisos para abrir turno en esta sucursal.");
      } else if (res.status === 400) {
        alert(res.error || "Datos inválidos para abrir el turno.");
      } else {
        alert(res.error || "Error al abrir el turno");
      }
    } finally {
      setLoading(false);
    }
  };

  // Volver al teclado de PIN para que entre otro empleado. Mantiene la
  // responsabilidad: cada cajero abre/maneja su turno con su propio PIN
  // (logout NO borra el cache offline de empleados, así que el siguiente
  // login local sigue funcionando sin red). El nuevo empleado aterriza en
  // /hub tras el PIN y desde ahí vuelve a esta pantalla a abrir su turno.
  const handleSwitchEmployee = () => {
    logout();
    router.replace("/locked");
  };

  if (isLocked) {
    return null; // El hook useTPVAuth debería manejar el redirect a /locked
  }

  if (checking) {
    return (
      <div className="min-h-[100dvh] bg-[var(--bg)] flex items-center justify-center">
        <div className="text-[var(--brand)] animate-pulse font-semibold uppercase tracking-widest">
          Verificando turno...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--bg)] flex flex-col font-sans text-white overflow-hidden relative">
      {/* Glow Effects */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute -top-60 -left-60 w-[600px] h-[600px] bg-[var(--brand-soft)] blur-[120px] rounded-full" />
        <div className="absolute -bottom-60 -right-60 w-[600px] h-[600px] bg-[var(--brand-soft)] blur-[120px] rounded-full" />
      </div>

      <header className="h-20 flex items-center justify-between px-8 relative z-10">
        <button 
          onClick={() => router.replace("/hub")}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors font-bold text-sm uppercase tracking-widest"
        >
          <ArrowLeft size={18} />
          <span>Volver al Hub</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--brand)] flex items-center justify-center">
            <UtensilsCrossed size={16} className="text-[var(--brand-fg)]" />
          </div>
          <span className="font-black tracking-tighter text-xl">MRTPVREST</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md bg-[var(--surface-1)] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl">
          <div className="text-center mb-10">
            <div className="inline-block px-4 py-1.5 mb-6 rounded-full text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--brand)] bg-[var(--brand-soft)] border border-[var(--brand)]">
              Apertura de Caja
            </div>
            <h1 className="text-4xl font-black tracking-tight mb-4">Iniciar Turno</h1>
            <p className="text-zinc-500 font-bold text-sm leading-relaxed">
              Ingresa el monto inicial con el que comienza el turno hoy.
            </p>
          </div>

          <div className="space-y-8">
            <div className="space-y-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 ml-1">
                Fondo de caja inicial
              </label>
              <div className="relative group">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-black text-[var(--brand)] group-focus-within:scale-110 transition-transform">$</span>
                <input
                  type="number"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-24 bg-[var(--bg)] border border-white/5 rounded-3xl pl-16 pr-8 text-4xl font-black mono tnum text-white focus:outline-none focus:border-[var(--brand)] transition-all placeholder:text-zinc-800"
                />
              </div>
            </div>

            <div className="bg-[var(--surface-1)] border border-white/5 rounded-2xl p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--brand-soft)] flex items-center justify-center text-[var(--brand)] shrink-0">
                <span className="text-xl font-semibold">{currentEmployee?.name?.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Operador</span>
                <span className="block text-sm font-semibold text-white truncate">{currentEmployee?.name}</span>
              </div>
              <button
                type="button"
                onClick={handleSwitchEmployee}
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white text-[10px] font-semibold uppercase tracking-[0.14em] active:scale-95 transition-all"
              >
                <Users size={14} />
                Cambiar
              </button>
            </div>

            <button
              onClick={handleOpenShift}
              disabled={loading || !openingFloat}
              className="w-full h-20 bg-[var(--brand)] text-[var(--brand-fg)] rounded-2xl font-black uppercase tracking-[0.2em] text-sm shadow-[0_10px_30px_var(--brand-glow)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 disabled:grayscale disabled:hover:scale-100"
            >
              {loading ? "Abriendo..." : "Abrir Turno Ahora"}
            </button>

            <button
              onClick={() => { logout(); router.replace("/locked"); }}
              className="w-full h-12 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600 hover:text-white transition-colors"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </main>

      <footer className="h-16 flex items-center justify-center text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-700">
        MRTPVREST System · v2.4.0 · diseño operativo UI
      </footer>
    </div>
  );
};

export default ShiftOpenPage;
