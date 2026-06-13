"use client";
import React, { useEffect, useState } from "react";
import { Scale, X, Delete } from "lucide-react";

interface WeightModalProps {
  isOpen: boolean;
  name: string;
  price: number;
  /** Unidad pesable: "g" | "kg". Se usa para el sufijo y la etiqueta de precio. */
  unit: string;
  /** Peso inicial (para editar una línea existente en modo ABSOLUTO). */
  initialWeight?: number;
  onConfirm: (weight: number) => void;
  onClose: () => void;
}

/**
 * WeightModal — Captura de peso para productos pesables (g/kg) en el TPV.
 *
 * Teclado numérico táctil con el estilo del POS. Muestra precio/unidad, el peso
 * capturado y el TOTAL EN VIVO = price × weight. Confirmar queda deshabilitado
 * mientras weight <= 0. El peso NO se redondea (el subtotal de cobro lo redondea
 * el backend a 2 decimales).
 */
export default function WeightModal({
  isOpen,
  name,
  price,
  unit,
  initialWeight,
  onConfirm,
  onClose,
}: WeightModalProps) {
  const [raw, setRaw] = useState("");

  // Al abrir, prellenar con el peso inicial (edición) o limpiar (alta).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setRaw(initialWeight && initialWeight > 0 ? String(initialWeight) : "");
    });
    return () => { cancelled = true; };
  }, [isOpen, initialWeight]);

  if (!isOpen) return null;

  const weight = parseFloat(raw) || 0;
  const valid = weight > 0;
  const total = price * weight;

  function pushKey(k: string) {
    setRaw((prev) => {
      if (k === ".") {
        if (prev.includes(".")) return prev;
        return prev === "" ? "0." : prev + ".";
      }
      // Evitar ceros a la izquierda redundantes ("00", "01").
      if (prev === "0" && k !== ".") return k;
      // Limitar a 3 decimales.
      const dot = prev.indexOf(".");
      if (dot >= 0 && prev.length - dot > 3) return prev;
      return prev + k;
    });
  }

  function backspace() {
    setRaw((prev) => prev.slice(0, -1));
  }

  function clear() {
    setRaw("");
  }

  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#0C0C0E] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-5 border-b border-white/5 flex items-center gap-3 shrink-0">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#ffb84d]/15 text-[#ffb84d] border border-[#ffb84d]/30 shrink-0">
            <Scale size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
              Cobro por peso
            </span>
            <h3 className="text-lg font-black text-white truncate">{name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* PRECIO / DISPLAY */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
            <div className="flex justify-between items-baseline text-[12px] font-bold text-white/50">
              <span>Precio</span>
              <span className="tabular-nums">${price.toFixed(2)} / {unit}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
                Peso
              </span>
              <span className="tabular-nums text-3xl font-black text-white">
                {raw || "0"} <span className="text-base text-white/40">{unit}</span>
              </span>
            </div>
            <div className="flex justify-between items-baseline pt-2 border-t border-white/10">
              <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
                Total
              </span>
              <span className="tabular-nums text-2xl font-black text-[#ffb84d]">
                ${total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* TECLADO */}
          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => pushKey(k)}
                className="min-h-[56px] h-16 rounded-2xl bg-white/5 border border-white/10 text-2xl font-black text-white active:scale-95 transition-transform"
              >
                {k}
              </button>
            ))}
            <button
              type="button"
              onClick={backspace}
              aria-label="Borrar"
              className="min-h-[56px] h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform"
            >
              <Delete size={22} />
            </button>
          </div>
        </div>

        <div className="p-5 border-t border-white/5 bg-white/[0.02] flex gap-3 shrink-0">
          <button
            type="button"
            onClick={clear}
            className="flex-1 min-h-[56px] h-14 rounded-2xl bg-white/5 border border-white/10 text-white/70 font-black uppercase tracking-[0.15em] text-[11px] active:scale-95 transition-transform"
          >
            Limpiar
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => { onConfirm(weight); onClose(); }}
            className="flex-[2] min-h-[56px] h-14 rounded-2xl bg-[#ffb84d] text-[#0C0C0E] font-black uppercase tracking-[0.15em] text-[12px] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_10px_30px_rgba(255,184,77,0.3)] disabled:opacity-30 disabled:active:scale-100"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
