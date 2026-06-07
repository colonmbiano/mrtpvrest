"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTPVAuth } from "@/hooks/useTPVAuth";
import api from "@/lib/api";
import { UtensilsCrossed, ArrowLeft } from "lucide-react";

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
      await api.post("/api/shifts/open", {
        openingFloat: Number(openingFloat),
        employeeId: currentEmployee.id,
        employeeName: currentEmployee.name,
      });
      localStorage.setItem("tpv-shift-open", "true");
      router.replace("/pos/order-type");
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al abrir el turno");
    } finally {
      setLoading(false);
    }
  };

  if (isLocked) {
    return null; // El hook useTPVAuth debería manejar el redirect a /locked
  }

  if (checking) {
    return (
      <div className="min-h-[100dvh] bg-[#0a0a0c] flex items-center justify-center">
        <div className="text-amber-500 animate-pulse font-black uppercase tracking-widest">
          Verificando turno...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0c] flex flex-col font-sans text-white overflow-hidden relative">
      {/* Glow Effects */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute -top-60 -left-60 w-[600px] h-[600px] bg-amber-500/5 blur-[120px] rounded-full" />
        <div className="absolute -bottom-60 -right-60 w-[600px] h-[600px] bg-amber-500/5 blur-[120px] rounded-full" />
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
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <UtensilsCrossed size={16} className="text-black" />
          </div>
          <span className="font-black tracking-tighter text-xl">MRTPVREST</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md bg-[#121316] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl">
          <div className="text-center mb-10">
            <div className="inline-block px-4 py-1.5 mb-6 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-amber-500 bg-amber-500/10 border border-amber-500/20">
              Apertura de Caja
            </div>
            <h1 className="text-4xl font-black tracking-tight mb-4">Iniciar Turno</h1>
            <p className="text-zinc-500 font-bold text-sm leading-relaxed">
              Ingresa el monto inicial con el que comienza el turno hoy.
            </p>
          </div>

          <div className="space-y-8">
            <div className="space-y-3">
              <label className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">
                Fondo de caja inicial
              </label>
              <div className="relative group">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-black text-amber-500 group-focus-within:scale-110 transition-transform">$</span>
                <input
                  type="number"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-24 bg-[#0a0a0c] border border-white/5 rounded-3xl pl-16 pr-8 text-4xl font-black mono tnum text-white focus:outline-none focus:border-amber-500 transition-all placeholder:text-zinc-800"
                />
              </div>
            </div>

            <div className="bg-[#1a1b1f] border border-white/5 rounded-2xl p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                <span className="text-xl font-black">{currentEmployee?.name?.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">Operador</span>
                <span className="text-sm font-black text-white">{currentEmployee?.name}</span>
              </div>
            </div>

            <button
              onClick={handleOpenShift}
              disabled={loading || !openingFloat}
              className="w-full h-20 bg-amber-500 text-black rounded-2xl font-black uppercase tracking-[0.2em] text-sm shadow-[0_10px_40px_-10px_rgba(255,184,77,0.4)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 disabled:grayscale disabled:hover:scale-100"
            >
              {loading ? "Abriendo..." : "Abrir Turno Ahora"}
            </button>

            <button
              onClick={logout}
              className="w-full h-12 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-600 hover:text-white transition-colors"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </main>

      <footer className="h-16 flex items-center justify-center text-[10px] font-black uppercase tracking-[0.2em] text-zinc-700">
        MRTPVREST System · v2.4.0 · diseño operativo UI
      </footer>
    </div>
  );
};

export default ShiftOpenPage;
