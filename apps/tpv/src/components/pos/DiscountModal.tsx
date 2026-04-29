"use client";
import { useState } from "react";
import { Tag, Percent, DollarSign, X } from "lucide-react";

type Mode = "percent" | "fixed";

type Props = {
  subtotal: number;
  initialDiscount: number;
  initialMode: Mode;
  onApply: (resolvedDiscount: number, mode: Mode) => void;
  onClose: () => void;
};

const PRESETS_PERCENT = [5, 10, 15, 20];
const PRESETS_FIXED = [10, 25, 50, 100];

export default function DiscountModal({ subtotal, initialDiscount, initialMode, onApply, onClose }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  // Cuando cambian de modo, el valor se resetea a 0 para evitar números absurdos
  // (ej. si tenían 50% no querrás aplicar $50 fijos automáticamente).
  const [valueStr, setValueStr] = useState(
    initialMode === mode && initialDiscount > 0 ? String(initialDiscount) : "",
  );

  const value = Number(valueStr) || 0;
  const resolved =
    mode === "percent"
      ? Math.max(0, Math.min(100, value)) * subtotal / 100
      : Math.max(0, Math.min(subtotal, value));
  const newTotal = Math.max(0, subtotal - resolved);

  function appendDigit(d: string) {
    if (d === "." && valueStr.includes(".")) return;
    setValueStr((s) => (s + d).slice(0, 6));
  }
  function backspace() {
    setValueStr((s) => s.slice(0, -1));
  }

  function applyPreset(n: number) {
    setValueStr(String(n));
  }

  function apply() {
    onApply(resolved, mode);
    onClose();
  }

  function clear() {
    onApply(0, mode);
    onClose();
  }

  const presets = mode === "percent" ? PRESETS_PERCENT : PRESETS_FIXED;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm bg-surf-1 border border-bd rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[95vh]">
        <header className="flex items-center justify-between px-5 py-4 border-b border-bd">
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-iris-500" />
            <div>
              <span className="eyebrow">DESCUENTO</span>
              <h2 className="text-lg font-black mt-0.5">Subtotal ${subtotal.toFixed(2)}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-surf-2 border border-bd flex items-center justify-center text-tx-mut"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setMode("percent"); setValueStr(""); }}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border transition-pos active:scale-95
                ${mode === "percent" ? "bg-iris-soft border-iris-500 text-iris-500" : "bg-surf-2 border-bd text-tx-sec"}`}
            >
              <Percent size={16} />
              <span className="text-sm font-black">Porcentaje</span>
            </button>
            <button
              onClick={() => { setMode("fixed"); setValueStr(""); }}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border transition-pos active:scale-95
                ${mode === "fixed" ? "bg-iris-soft border-iris-500 text-iris-500" : "bg-surf-2 border-bd text-tx-sec"}`}
            >
              <DollarSign size={16} />
              <span className="text-sm font-black">Monto fijo</span>
            </button>
          </div>

          <div className="px-4 py-3 rounded-xl bg-surf-2 border border-bd font-black text-3xl mono tnum tracking-tight text-right">
            {mode === "percent" ? `${valueStr || "0"}%` : `$${valueStr || "0"}`}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                onClick={() => appendDigit(String(n))}
                className="py-4 rounded-xl text-2xl sm:text-3xl font-black mono bg-surf-2 border border-bd active:scale-95"
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => appendDigit(".")}
              className="py-4 rounded-xl text-2xl font-black mono bg-surf-2 border border-bd active:scale-95"
            >
              .
            </button>
            <button
              onClick={() => appendDigit("0")}
              className="py-4 rounded-xl text-2xl sm:text-3xl font-black mono bg-surf-2 border border-bd active:scale-95"
            >
              0
            </button>
            <button
              onClick={backspace}
              aria-label="Borrar"
              className="py-4 rounded-xl flex items-center justify-center bg-surf-2 border border-bd text-tx-mut active:scale-95"
            >
              ⌫
            </button>
          </div>

          <div className="flex gap-2">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className="flex-1 py-2 rounded-lg text-xs font-bold bg-surf-2 border border-bd text-tx-sec active:scale-95"
              >
                {mode === "percent" ? `${p}%` : `$${p}`}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 px-4 py-3 rounded-xl bg-surf-2 border border-bd">
            <div className="flex justify-between text-xs font-bold text-tx-sec">
              <span>Descuento aplicado</span>
              <span className="mono tnum">−${resolved.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-black text-tx-pri">
              <span>Nuevo total</span>
              <span className="mono tnum text-iris-500">${newTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <footer className="flex gap-2 p-4 border-t border-bd bg-surf-0">
          {initialDiscount > 0 && (
            <button
              onClick={clear}
              className="px-4 py-3 rounded-xl text-sm font-bold bg-danger-soft border border-danger text-danger"
            >
              Quitar
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-surf-2 border border-bd text-tx-sec"
          >
            Cancelar
          </button>
          <button
            onClick={apply}
            disabled={resolved === 0}
            className="flex-[2] py-3 rounded-xl text-sm font-black bg-iris-500 text-white shadow-lg shadow-iris-glow disabled:opacity-40 active:scale-95"
          >
            Aplicar
          </button>
        </footer>
      </div>
    </div>
  );
}
