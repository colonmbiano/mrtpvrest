"use client";

import React, { useMemo, useState } from "react";
import { Check, Minus, Plus, SplitSquareHorizontal, X } from "lucide-react";

interface SplitItem {
  id: string;
  name: string;
  quantity: number;
  subtotal: number;
  seatNumber?: number | null;
}

export interface SplitSelection {
  id: string;
  quantity: number;
}

interface Props {
  isOpen: boolean;
  orderNumber: string;
  items: SplitItem[];
  onClose: () => void;
  onConfirm: (items: SplitSelection[]) => Promise<void>;
}

export default function SplitOrderModal({
  isOpen,
  orderNumber,
  items,
  onClose,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const selectedCount = useMemo(
    () => items.reduce((sum, item) => sum + (selected[item.id] || 0), 0),
    [items, selected],
  );
  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const selectedTotal = useMemo(
    () => items.reduce((sum, item) =>
      sum + Math.round((item.subtotal * (selected[item.id] || 0) / item.quantity) * 100) / 100, 0),
    [items, selected],
  );

  if (!isOpen) return null;

  const changeQuantity = (item: SplitItem, quantity: number) => {
    setSelected((current) => ({
      ...current,
      [item.id]: Math.max(0, Math.min(item.quantity, quantity)),
    }));
  };

  const invalid = selectedCount === 0 || selectedCount === totalCount;

  const confirmSplit = async () => {
    if (invalid || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(items.filter((item) => (selected[item.id] ?? 0) > 0).map((item) => ({
        id: item.id,
        quantity: selected[item.id] ?? 0,
      })));
      setSelected({});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[var(--bg)] shadow-2xl">
        <header className="flex items-center gap-3 border-b border-white/10 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]">
            <SplitSquareHorizontal size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
              Dividir ticket
            </p>
            <h3 className="truncate text-lg font-black text-white">#{orderNumber}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto p-5">
          <p className="pb-2 text-xs font-bold text-white/50">
            Elige cuántas unidades pasarán al nuevo ticket.
          </p>
          {items.map((item) => {
            const count = selected[item.id] || 0;
            const active = count > 0;
            return (
              <div
                key={item.id}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${
                  active
                    ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
                    active
                      ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-fg)]"
                      : "border-white/20 text-transparent"
                  }`}
                >
                  <Check size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">
                    {item.quantity}x {item.name}
                  </span>
                  {item.seatNumber ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                      Comensal {item.seatNumber}
                    </span>
                  ) : null}
                </span>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-sm font-semibold tabular-nums text-white">
                    ${item.subtotal.toFixed(2)}
                  </span>
                  <div className="flex items-center gap-2" aria-label={`Unidades de ${item.name} para el nuevo ticket`}>
                    <button type="button" onClick={() => changeQuantity(item, count - 1)} disabled={count === 0 || submitting} aria-label={`Quitar una unidad de ${item.name}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 text-white disabled:opacity-30">
                      <Minus size={16} />
                    </button>
                    <span className="w-6 text-center text-sm font-bold tabular-nums text-white">{count}</span>
                    <button type="button" onClick={() => changeQuantity(item, count + 1)} disabled={count === item.quantity || submitting} aria-label={`Agregar una unidad de ${item.name}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 text-white disabled:opacity-30">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="flex items-center gap-3 border-t border-white/10 p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Nuevo ticket · {selectedCount} unidades
            </p>
            <p className="text-xl font-black tabular-nums text-white">
              ${selectedTotal.toFixed(2)}
            </p>
          </div>
          <button
            type="button"
            disabled={invalid || submitting}
            onClick={confirmSplit}
            className="h-14 rounded-2xl bg-[var(--brand)] px-6 text-xs font-black uppercase tracking-wider text-[var(--brand-fg)] disabled:opacity-30"
          >
            {submitting ? "Dividiendo..." : "Crear ticket"}
          </button>
        </footer>
      </div>
    </div>
  );
}
