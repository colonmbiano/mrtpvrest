"use client";
import React from "react";
import { X, Plus, Minus } from "lucide-react";

interface TicketLineProps {
  id?: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  modifiers?: { name: string; priceAdd: number }[];
  onUpdateQty?: (qty: number) => void;
  onIncrease?: () => void;
  onDecrease?: () => void;
  onRemove?: () => void;
  currency?: string;
}

const TicketLine: React.FC<TicketLineProps> = ({
  name,
  price,
  quantity,
  notes,
  modifiers,
  onUpdateQty,
  onIncrease,
  onDecrease,
  onRemove,
  currency = "$",
}) => {
  const inc = () => (onIncrease ? onIncrease() : onUpdateQty?.(quantity + 1));
  const dec = () =>
    onDecrease ? onDecrease() : onUpdateQty?.(Math.max(0, quantity - 1));
    
  return (
    <div className="group flex items-start gap-4 py-4 border-b border-white/5 last:border-0">
      {/* STEPPER VERTICAL - TOUCH OPTIMIZED */}
      <div className="flex flex-col items-center w-10 bg-[#121316] rounded-xl border border-white/5 overflow-hidden shrink-0">
        <button
          onClick={inc}
          className="w-full h-10 flex items-center justify-center text-zinc-500 active:text-amber-500 active:bg-white/5 transition-all active:scale-90"
        >
          <Plus size={16} strokeWidth={3} />
        </button>
        <span className="text-[13px] font-black text-white mono tnum py-1">
          {quantity}
        </span>
        <button
          onClick={dec}
          className="w-full h-10 flex items-center justify-center text-zinc-500 active:text-red-500 active:bg-white/5 transition-all active:scale-90"
        >
          <Minus size={16} strokeWidth={3} />
        </button>
      </div>

      {/* INFO PRODUCTO */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex justify-between items-start gap-2">
          <span className="text-sm font-black text-white leading-tight tracking-tight line-clamp-2">
            {name}
          </span>
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-zinc-700 active:text-red-500 transition-all p-1 active:scale-90"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {modifiers && modifiers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {modifiers.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#1a1b1f] border border-white/5 text-[9px] text-zinc-400 font-black uppercase tracking-wider"
              >
                {m.name}
                {m.priceAdd > 0 && (
                  <span className="text-amber-500/80 mono">+{currency}{m.priceAdd.toFixed(2)}</span>
                )}
              </span>
            ))}
          </div>
        )}

        {notes && (
          <p className="text-[10px] text-zinc-600 font-bold italic line-clamp-1 mt-0.5">
            "{notes}"
          </p>
        )}

        <div className="flex justify-between items-baseline mt-2 pt-1">
          <span className="text-[11px] text-zinc-600 font-bold mono">
            {currency}{price.toFixed(2)} / u.
          </span>
          <span className="text-sm font-black text-amber-500 mono">
            {currency}{(price * quantity).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TicketLine;
