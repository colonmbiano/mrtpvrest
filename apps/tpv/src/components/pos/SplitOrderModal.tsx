"use client";

import React, { useMemo, useState } from "react";
import { Check, SplitSquareHorizontal, X } from "lucide-react";

interface SplitItem {
  id: string;
  name: string;
  quantity: number;
  subtotal: number;
  seatNumber?: number | null;
}

interface Props {
  isOpen: boolean;
  orderNumber: string;
  items: SplitItem[];
  onClose: () => void;
  onConfirm: (itemIds: string[]) => Promise<void>;
}

export default function SplitOrderModal({
  isOpen,
  orderNumber,
  items,
  onClose,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const selectedTotal = useMemo(
    () =>
      items
        .filter((item) => selected.has(item.id))
        .reduce((sum, item) => sum + item.subtotal, 0),
    [items, selected],
  );

  if (!isOpen) return null;

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const invalid = selected.size === 0 || selected.size === items.length;

  const confirmSplit = async () => {
    if (invalid || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(Array.from(selected));
      setSelected(new Set());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0C0C0E] shadow-2xl">
        <header className="flex items-center gap-3 border-b border-white/10 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
            <SplitSquareHorizontal size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">
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
            Selecciona los productos que pasarán al nuevo ticket.
          </p>
          {items.map((item) => {
            const active = selected.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${
                  active
                    ? "border-amber-400/50 bg-amber-400/10"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
                    active
                      ? "border-amber-300 bg-amber-300 text-black"
                      : "border-white/20 text-transparent"
                  }`}
                >
                  <Check size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-white">
                    {item.quantity}x {item.name}
                  </span>
                  {item.seatNumber ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                      Comensal {item.seatNumber}
                    </span>
                  ) : null}
                </span>
                <span className="text-sm font-black tabular-nums text-white">
                  ${item.subtotal.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>

        <footer className="flex items-center gap-3 border-t border-white/10 p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-white/40">
              Nuevo ticket · {selected.size} productos
            </p>
            <p className="text-xl font-black tabular-nums text-white">
              ${selectedTotal.toFixed(2)}
            </p>
          </div>
          <button
            type="button"
            disabled={invalid || submitting}
            onClick={confirmSplit}
            className="h-14 rounded-2xl bg-amber-300 px-6 text-xs font-black uppercase tracking-wider text-black disabled:opacity-30"
          >
            {submitting ? "Dividiendo..." : "Crear ticket"}
          </button>
        </footer>
      </div>
    </div>
  );
}
