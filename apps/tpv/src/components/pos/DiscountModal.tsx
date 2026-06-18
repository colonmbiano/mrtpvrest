"use client";
import React, { useState, useEffect } from "react";
import { Tag, X, Percent, DollarSign } from "lucide-react";
import ManagerOverrideModal from "@/components/ManagerOverrideModal";

interface DiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Subtotal del ticket (antes de descuento) — se usa para preview de %. */
  subtotal: number;
  /** Si el rol actual ya tiene `apply_discount`, no requerimos PIN. */
  requiresOverride: boolean;
  /** Aplica al ticket. type: percent → value es %; fixed → value es $. */
  onApply: (type: "percent" | "fixed", value: number) => void;
  /** Prellenado editable: tipo/valor del descuento actual del pedido. */
  initialType?: "percent" | "fixed";
  initialValue?: number;
  /** Etiqueta del botón primario (default "Aplicar descuento"). */
  primaryLabel?: string;
  /** Acción secundaria opcional (ej. "Imprimir sin cambios"). */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * DiscountModal — Permite al cajero aplicar descuento al ticket activo.
 *
 * Flujo:
 *   1. Selecciona tipo (% o $) y monto.
 *   2. Si el rol no tiene `apply_discount`, abre ManagerOverrideModal
 *      para requerir PIN de supervisor (ADMIN/MANAGER con permiso).
 *   3. Tras autorización, llama onApply y cierra.
 *
 * El descuento se persiste en TicketData.discount/discountType del store
 * y viaja en el payload de la orden al backend (Order.discount). El
 * override queda registrado en useOfflineStore como evento de auditoría.
 */
export default function DiscountModal({
  isOpen,
  onClose,
  subtotal,
  requiresOverride,
  onApply,
  initialType,
  initialValue,
  primaryLabel,
  secondaryLabel,
  onSecondary,
}: DiscountModalProps) {
  const [type, setType] = useState<"percent" | "fixed">(initialType ?? "percent");
  const [valueStr, setValueStr] = useState(
    initialValue && initialValue > 0 ? String(initialValue) : ""
  );
  const [showOverride, setShowOverride] = useState(false);
  const [error, setError] = useState("");

  // Al abrir, prellenar con el descuento vigente del pedido (editable).
  // Diferido a microtask (ver impresoras): evita set-state-in-effect.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setType(initialType ?? "percent");
      setValueStr(initialValue && initialValue > 0 ? String(initialValue) : "");
      setError("");
    });
    return () => { cancelled = true; };
  }, [isOpen, initialType, initialValue]);

  if (!isOpen) return null;

  const value = parseFloat(valueStr);
  // value >= 0: permitir 0 para QUITAR un descuento existente (editable).
  const valid = Number.isFinite(value) && value >= 0 &&
    (type === "percent" ? value <= 100 : value <= subtotal);

  const previewAmount = !valid ? 0 :
    type === "percent" ? subtotal * (value / 100) : value;
  const previewTotal = Math.max(0, subtotal - previewAmount);

  function reset() {
    setType("percent");
    setValueStr("");
    setError("");
  }

  function handlePrimary() {
    if (!valid) {
      setError(type === "percent"
        ? "Ingresa un porcentaje entre 0 y 100"
        : "Ingresa un monto entre 0 y el subtotal");
      return;
    }
    if (requiresOverride) {
      setShowOverride(true);
      return;
    }
    onApply(type, value);
    reset();
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6"
        style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
      >
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-md"
          onClick={onClose}
        />

        <div className="relative w-full max-w-md bg-[var(--bg)] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          <div className="p-5 border-b border-white/5 flex items-center gap-3 shrink-0">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand)] shrink-0">
              <Tag size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
                Aplicar descuento
              </span>
              <h3 className="text-lg font-black text-white truncate">
                Subtotal ${subtotal.toFixed(2)}
              </h3>
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
            {/* TIPO */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("percent")}
                className={`min-h-[56px] h-14 rounded-2xl border flex items-center justify-center gap-2 active:scale-95 transition-transform ${
                  type === "percent"
                    ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-fg)]"
                    : "bg-white/5 border-white/10 text-white/70"
                }`}
              >
                <Percent size={16} />
                <span className="font-semibold text-sm uppercase tracking-widest">
                  Porcentaje
                </span>
              </button>
              <button
                type="button"
                onClick={() => setType("fixed")}
                className={`min-h-[56px] h-14 rounded-2xl border flex items-center justify-center gap-2 active:scale-95 transition-transform ${
                  type === "fixed"
                    ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-fg)]"
                    : "bg-white/5 border-white/10 text-white/70"
                }`}
              >
                <DollarSign size={16} />
                <span className="font-semibold text-sm uppercase tracking-widest">
                  Monto
                </span>
              </button>
            </div>

            {/* INPUT */}
            <div>
              <label className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
                {type === "percent" ? "% Descuento" : "$ Descuento"}
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={type === "percent" ? 1 : 0.01}
                value={valueStr}
                onChange={(e) => {
                  setValueStr(e.target.value);
                  setError("");
                }}
                placeholder={type === "percent" ? "10" : "50.00"}
                className="mt-2 w-full h-14 min-h-[56px] bg-white/5 border border-white/10 rounded-2xl px-4 text-2xl font-black tabular-nums text-white outline-none focus:border-[var(--brand)]"
                autoFocus
              />
              {error && (
                <p className="text-[11px] font-bold text-[var(--danger)] mt-2">
                  {error}
                </p>
              )}
            </div>

            {/* PREVIEW */}
            {valid && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2">
                <div className="flex justify-between items-baseline text-[12px] font-bold text-white/50">
                  <span>Subtotal</span>
                  <span className="tabular-nums">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-baseline text-[12px] font-bold text-[var(--success)]">
                  <span>Descuento</span>
                  <span className="tabular-nums">− ${previewAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-white/10">
                  <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
                    Total
                  </span>
                  <span className="tabular-nums text-2xl font-black text-white">
                    ${previewTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {requiresOverride && (
              <p className="text-[11px] font-bold text-[var(--warning)] leading-relaxed">
                ⚠ Aplicar este descuento requiere autorización con PIN de
                supervisor (ADMIN o MANAGER).
              </p>
            )}
          </div>

          <div className="p-5 border-t border-white/5 bg-white/[0.02] flex flex-col gap-3 shrink-0">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[56px] h-14 rounded-2xl bg-white/5 border border-white/10 text-white/70 font-semibold uppercase tracking-[0.15em] text-[11px] active:scale-95 transition-transform"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!valid}
                onClick={handlePrimary}
                className="flex-[2] min-h-[56px] h-14 rounded-2xl bg-[var(--brand)] text-[var(--brand-fg)] font-black uppercase tracking-[0.15em] text-[12px] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_10px_30px_var(--brand-glow)] disabled:opacity-30 disabled:active:scale-100"
              >
                {requiresOverride ? "Solicitar PIN" : (primaryLabel ?? "Aplicar descuento")}
              </button>
            </div>
            {secondaryLabel && onSecondary && (
              <button
                type="button"
                onClick={() => { onSecondary(); onClose(); }}
                className="w-full min-h-[48px] h-12 rounded-2xl bg-transparent border border-white/10 text-white/50 font-semibold uppercase tracking-[0.15em] text-[11px] active:scale-95 transition-transform"
              >
                {secondaryLabel}
              </button>
            )}
          </div>
        </div>
      </div>

      <ManagerOverrideModal
        isOpen={showOverride}
        onClose={() => setShowOverride(false)}
        permission="apply_discount"
        onSuccess={() => {
          onApply(type, value);
          reset();
          setShowOverride(false);
          onClose();
        }}
      />
    </>
  );
}
