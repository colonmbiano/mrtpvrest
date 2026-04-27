"use client";
import React from "react";
import { X, Plus, Minus } from "lucide-react";

interface TicketLineProps {
  id: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  onUpdateQty: (qty: number) => void;
  onRemove: () => void;
  currency?: string;
}

const TicketLine: React.FC<TicketLineProps> = ({
  name,
  price,
  quantity,
  notes,
  onUpdateQty,
  onRemove,
  currency = "$",
}) => {
  return (
    <div className="group flex items-start gap-3 py-3 border-b border-bd last:border-0">
      {/* STEPPER VERTICAL */}
      <div className="flex flex-col items-center w-7 bg-surf-2 rounded-md border border-bd overflow-hidden">
        <button 
          onClick={() => onUpdateQty(quantity + 1)}
          className="w-full h-7 flex items-center justify-center text-tx-sec hover:text-iris-500 hover:bg-surf-3 transition-colors"
        >
          <Plus size={14} />
        </button>
        <span className="text-[13px] font-bold text-tx-pri mono tnum py-0.5">
          {quantity}
        </span>
        <button 
          onClick={() => onUpdateQty(Math.max(0, quantity - 1))}
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
          <button 
            onClick={onRemove}
            className="text-tx-mut hover:text-danger opacity-0 group-hover:opacity-100 transition-all p-0.5"
          >
            <X size={16} />
          </button>
        </div>
        
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
