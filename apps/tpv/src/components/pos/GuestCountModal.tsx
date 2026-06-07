"use client";

/**
 * GuestCountModal — paso 2 del flujo Comer Aquí.
 *
 * Después de elegir mesa, el TPV pregunta cuántos comensales se
 * sentarán. Se usa para:
 *  - Mostrar tabs por comensal en el POS (el mesero asigna cada platillo
 *    al seat correspondiente).
 *  - Permitir split del ticket por comensal al cobrar.
 *
 * Pre-llena con la capacidad de la mesa (default 4) y permite ajustar
 * con stepper +/− o tap directo en cuadrícula 1..max.
 */

import { useState } from "react";
import { X, Users, ArrowRight, MapPin } from "lucide-react";

interface GuestCountModalProps {
  isOpen: boolean;
  /** Capacidad nominal de la mesa, usada como default y máximo razonable. */
  tableCapacity?: number | null;
  /** Nombre de la mesa para feedback visual ("Mesa 3", etc.). */
  tableName?: string | null;
  onClose: () => void;
  onConfirm: (guests: number) => void;
}

const MIN_GUESTS = 1;
const HARD_MAX   = 50;

export default function GuestCountModal({
  isOpen,
  tableCapacity,
  tableName,
  onClose,
  onConfirm,
}: GuestCountModalProps) {
  const defaultGuests = Math.max(MIN_GUESTS, Math.min(HARD_MAX, tableCapacity || 4));
  // Mostramos la cuadrícula hasta capacidad+2 para dar holgura sin
  // saturar la pantalla; nunca más de HARD_MAX.
  const gridMax = Math.max(8, Math.min(HARD_MAX, defaultGuests + 2));

  const [guests, setGuests] = useState(defaultGuests);

  // Render-phase sync (ver CategoryModal): equivalente al efecto de reset
  // pero sin set-state-in-effect.
  const [prevSync, setPrevSync] = useState({ isOpen, defaultGuests });
  if (prevSync.isOpen !== isOpen || prevSync.defaultGuests !== defaultGuests) {
    setPrevSync({ isOpen, defaultGuests });
    if (isOpen) setGuests(defaultGuests);
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-[#0a0a0c]/85 backdrop-blur-sm"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div className="w-full max-w-md rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.5)] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-white/10 bg-white/5">
          <div>
            <span className="text-[10px] font-black tracking-[0.25em] text-[#ffb84d]">COMENSALES</span>
            <h3 className="text-2xl font-black text-white tracking-tight mt-1">
              ¿Cuántos comensales?
            </h3>
            {tableName && (
              <p className="inline-flex items-center gap-1.5 text-xs font-bold text-white/55 mt-2">
                <MapPin size={12} className="text-[#ffb84d]" /> {tableName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 transition-transform text-white/85 flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 py-6 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setGuests((g) => Math.max(MIN_GUESTS, g - 1))}
            disabled={guests <= MIN_GUESTS}
            className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 text-white text-2xl font-black active:scale-90 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
          >
            −
          </button>
          <div className="flex-1 max-w-[160px] text-center">
            <div className="inline-flex items-center justify-center gap-2 text-5xl font-black text-white tracking-tight">
              <Users size={28} className="text-[#ffb84d]" />
              <span>{guests}</span>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mt-2">
              {guests === 1 ? "comensal" : "comensales"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGuests((g) => Math.min(HARD_MAX, g + 1))}
            disabled={guests >= HARD_MAX}
            className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 text-white text-2xl font-black active:scale-90 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>

        {/* Quick grid */}
        <div className="px-6 pb-6">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-3 px-1">
            Selección rápida
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {Array.from({ length: gridMax }, (_, i) => i + 1).map((n) => {
              const active = n === guests;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setGuests(n)}
                  className="h-12 rounded-xl text-base font-black tracking-tight active:scale-90 transition-transform"
                  style={{
                    background: active ? "#ffb84d" : "rgba(255,255,255,0.05)",
                    color: active ? "#0a0a0c" : "rgba(255,255,255,0.85)",
                    border: `1px solid ${active ? "#ffb84d" : "rgba(255,255,255,0.10)"}`,
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        {/* Confirm */}
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={() => onConfirm(guests)}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[64px] py-4 rounded-2xl text-sm font-black uppercase tracking-[0.2em] text-[#0a0a0c] bg-[#ffb84d] active:scale-95 transition-transform shadow-[0_15px_40px_rgba(255,184,77,0.25)]"
          >
            Empezar orden
            <ArrowRight size={16} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
}
