"use client";
import React from "react";
import { Armchair, ShoppingBag, Truck } from "lucide-react";

export type OrderType = "DINE_IN" | "TAKEOUT" | "DELIVERY";

interface OrderTypeToggleProps {
  active: OrderType;
  onChange: (type: OrderType) => void;
  allowedTypes?: OrderType[];
}

const OrderTypeToggle: React.FC<OrderTypeToggleProps> = ({
  active,
  onChange,
  allowedTypes = ["DINE_IN", "TAKEOUT", "DELIVERY"],
}) => {
  const options = [
    { id: "DINE_IN",  label: "Mesa",    icon: Armchair },
    { id: "TAKEOUT",  label: "Llevar", icon: ShoppingBag },
    { id: "DELIVERY", label: "Domic.",   icon: Truck },
  ].filter(opt => allowedTypes.includes(opt.id as OrderType));

  return (
    <div className="flex w-full gap-1 rounded-xl border border-white/10 bg-[#121316] p-1 shadow-inner">
      {options.map((opt) => {
        const isActive = active === opt.id;
        const Icon = opt.icon;
        
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id as OrderType)}
            className={`
              min-w-0 flex-1 h-11 flex items-center justify-center gap-1.5 rounded-lg px-2
              text-[10px] font-black uppercase tracking-[0.06em] transition-all active:scale-95
              ${isActive 
                ? "bg-amber-500 text-[#0a0a0c] shadow-[0_5px_15px_rgba(255,184,77,0.25)]"
                : "text-zinc-400 active:bg-white/5 active:text-white"}
            `}
          >
            <Icon size={16} strokeWidth={isActive ? 3 : 2.25} />
            <span className="inline truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default OrderTypeToggle;
