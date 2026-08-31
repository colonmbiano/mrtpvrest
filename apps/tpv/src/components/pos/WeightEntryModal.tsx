import React, { useState, useRef, useEffect } from "react";
import { X, Delete, Check } from "lucide-react";
import { type Product } from "@/store/ticketStore";

export function WeightEntryModal({
  product,
  onClose,
  onConfirm,
}: {
  product: Product;
  onClose: () => void;
  onConfirm: (kg: number) => void;
}) {
  const pricePerKg = Number(product.promoPrice || product.price || 0);
  const [value, setValue] = useState("");
  const kg = Number(value);
  const valid = Number.isFinite(kg) && kg > 0;
  const total = valid ? pricePerKg * kg : 0;

  const submit = () => {
    if (valid) onConfirm(kg);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-surf-1 p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-lg font-bold text-tx-pri">{product.name}</div>
        <div className="mb-4 text-sm text-tx-mut">
          {`$${pricePerKg.toFixed(2)}`} / kg
        </div>

        <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">
          Peso (kg)
        </label>
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          step="0.001"
          min="0"
          placeholder="1.5"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="mb-3 min-h-14 w-full rounded-2xl bg-surf-2 px-4 text-2xl font-bold text-tx-pri outline-none"
        />

        <div className="mb-4 flex flex-wrap gap-2">
          {[0.25, 0.5, 0.75, 1, 1.5, 2].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setValue(String(q))}
              className="rounded-full bg-surf-2 px-4 py-2 text-sm font-semibold text-tx-pri"
            >
              {q} kg
            </button>
          ))}
        </div>

        <div className="mb-4 flex items-center justify-between text-tx-pri">
          <span className="text-sm text-tx-mut">Total</span>
          <span className="text-2xl font-bold">{`$${total.toFixed(2)}`}</span>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-surf-2 py-3 font-semibold text-tx-pri"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={submit}
            className="flex-1 rounded-2xl bg-brand py-3 font-bold text-black disabled:opacity-40"
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

