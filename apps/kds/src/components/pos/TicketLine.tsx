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
    <div className="group flex items-start gap-3 py-3 border-b border-bd last:border-0">
      {/* STEPPER VERTICAL */}
      <div className="flex flex-col items-center w-7 bg-surf-2 rounded-md border border-bd overflow-hidden">
        <button
          onClick={inc}
          className="w-full h-7 flex items-center justify-center text-tx-sec hover:text-iris-500 hover:bg-surf-3 transition-colors"
        >
          <Plus size={14} />
        </button>
        <span className="text-[13px] font-bold text-tx-pri mono tnum py-0.5">
          {quantity}
        </span>
        <button
          onClick={dec}
          className="w-full h-7 flex items-center justify-center text-tx-sec hover:text-danger hover:bg-surf-3 transition-colors"
        >
          <Minus size={14} />
        </button>
      </div>

      {/* INFO PRODUCTO */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2">
          <span className="text-[14px] font-semibold text-tx-pri leading-snug line-clamp-2">
            {name}
          </span>
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-tx-mut hover:text-danger opacity-0 group-hover:opacity-100 transition-all p-0.5"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {modifiers && modifiers.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {modifiers.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surf-2 border border-bd text-[10px] text-tx-sec font-bold"
              >
                {m.name}
                {m.priceAdd > 0 && (
                  <span className="text-iris-500 mono tnum">+${m.priceAdd.toFixed(2)}</span>
                )}
              </span>
            ))}
          </div>
        )}

        {notes && (
          <p className="text-[11px] text-tx-mut italic mt-0.5 line-clamp-1">
            {notes}
          </p>
        )}

        <div className="flex justify-between items-baseline mt-2">
          <span className="text-[12px] text-tx-mut mono tnum">
            {currency}{price.toFixed(2)} / un.
          </span>
          <span className="text-[14px] font-bold text-tx-pri mono tnum">
            {currency}{(price * quantity).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TicketLine;
