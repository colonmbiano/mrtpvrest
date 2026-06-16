"use client";
import React from "react";
import { X, Users, Clock } from "lucide-react";

/**
 * Picker rápido para asignar seatNumber + course a un item del carrito.
 *
 * Diseño diseño operativo:
 *  - Fondo `bg-[var(--bg)]`, glassmorphism `bg-white/5 backdrop-blur-md`.
 *  - Color activo `var(--brand)`.
 *  - Botones táctiles `min-h-[64px]` con `active:scale-95`.
 *  - Sin hover.
 *
 * Cancela seat o course tocando "Compartido" / "Sin tiempo" — ambos
 * caen como `null` y la cocina los agrupa en la cuenta común sin
 * etiqueta de comensal/tiempo.
 */

export const COURSE_OPTIONS = [
  { value: "ENTRADA", label: "Entrada" },
  { value: "FUERTE",  label: "Fuerte" },
  { value: "POSTRE",  label: "Postre" },
  { value: "BEBIDA",  label: "Bebida" },
] as const;

export type CourseValue = (typeof COURSE_OPTIONS)[number]["value"];

interface SeatCoursePickerProps {
  open: boolean;
  itemName: string;
  seatNumber: number | null;
  course: string | null;
  /** Cuántos comensales tiene la mesa. Cuando no hay info, default 8
   *  (rango razonable que cubre la mayoría de mesas restauranteras). */
  guestsHint?: number | null;
  onClose: () => void;
  onConfirm: (seatNumber: number | null, course: string | null) => void;
}

const DEFAULT_SEAT_COUNT = 8;

export default function SeatCoursePicker({
  open,
  itemName,
  seatNumber,
  course,
  guestsHint,
  onClose,
  onConfirm,
}: SeatCoursePickerProps) {
  const [seat, setSeat] = React.useState<number | null>(seatNumber);
  const [crs, setCrs] = React.useState<string | null>(course);

  // Re-sync cuando se abre con item distinto. Render-phase (ver
  // CategoryModal): equivalente al efecto pero sin set-state-in-effect.
  const [prevSync, setPrevSync] = React.useState({ open, seatNumber, course });
  if (prevSync.open !== open || prevSync.seatNumber !== seatNumber || prevSync.course !== course) {
    setPrevSync({ open, seatNumber, course });
    if (open) {
      setSeat(seatNumber);
      setCrs(course);
    }
  }

  if (!open) return null;

  const seatCount = Math.max(
    DEFAULT_SEAT_COUNT,
    typeof guestsHint === "number" && guestsHint > 0 ? guestsHint : DEFAULT_SEAT_COUNT
  );

  const handleConfirm = () => {
    onConfirm(seat, crs);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center p-4 sm:p-6"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[460px] max-h-[88vh] flex flex-col bg-[var(--bg)] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Glow */}
        <div
          aria-hidden
          className="absolute pointer-events-none -top-24 -right-24 w-72 h-72 rounded-full opacity-30 blur-[80px]"
          style={{
            background:
              "radial-gradient(circle, var(--brand-glow) 0%, transparent 70%)",
          }}
        />

        {/* HEADER */}
        <div className="relative z-10 p-5 border-b border-white/5 bg-white/5 backdrop-blur-md flex items-center gap-4 shrink-0">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-black tracking-[0.25em] text-[var(--brand)] uppercase">
              Asignar
            </span>
            <h3 className="text-[16px] font-black text-white truncate leading-tight">
              {itemName}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div className="relative z-10 flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
          {/* SEAT */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-[var(--brand)]" />
              <span className="text-[10px] font-black tracking-[0.25em] text-white/60 uppercase">
                Asiento del comensal
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setSeat(null)}
                className={`min-h-[56px] rounded-2xl border text-[11px] font-black uppercase tracking-[0.15em] active:scale-95 transition-transform ${
                  seat == null
                    ? "bg-[var(--brand)] text-[var(--brand-fg)] border-[var(--brand)] shadow-[0_5px_20px_var(--brand-glow)]"
                    : "bg-white/5 border-white/10 text-white/60"
                }`}
              >
                Compartido
              </button>
              {Array.from({ length: seatCount }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSeat(n)}
                  className={`min-h-[56px] rounded-2xl border tabular-nums font-black active:scale-95 transition-transform ${
                    seat === n
                      ? "bg-[var(--brand)] text-[var(--brand-fg)] border-[var(--brand)] shadow-[0_5px_20px_var(--brand-glow)] text-lg"
                      : "bg-white/5 border-white/10 text-white text-[15px]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>

          {/* COURSE */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-[var(--brand)]" />
              <span className="text-[10px] font-black tracking-[0.25em] text-white/60 uppercase">
                Tiempo de servicio
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCrs(null)}
                className={`min-h-[64px] rounded-2xl border text-[11px] font-black uppercase tracking-[0.15em] active:scale-95 transition-transform ${
                  crs == null
                    ? "bg-[var(--brand)] text-[var(--brand-fg)] border-[var(--brand)] shadow-[0_5px_20px_var(--brand-glow)]"
                    : "bg-white/5 border-white/10 text-white/60"
                }`}
              >
                Sin tiempo
              </button>
              {COURSE_OPTIONS.map((opt) => {
                const active = crs === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCrs(opt.value)}
                    className={`min-h-[64px] rounded-2xl border text-[12px] font-black uppercase tracking-[0.15em] active:scale-95 transition-transform ${
                      active
                        ? "bg-[var(--brand)] text-[var(--brand-fg)] border-[var(--brand)] shadow-[0_5px_20px_var(--brand-glow)]"
                        : "bg-white/5 border-white/10 text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* FOOTER */}
        <div className="relative z-10 p-4 border-t border-white/5 bg-[var(--bg)] shrink-0">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full min-h-[64px] h-16 rounded-2xl bg-[var(--brand)] text-[var(--brand-fg)] font-black uppercase tracking-[0.1em] text-[12px] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_10px_30px_var(--brand-glow)]"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
