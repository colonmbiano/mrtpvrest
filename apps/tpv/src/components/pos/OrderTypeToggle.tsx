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
    { id: "DINE_IN",  label: "En Mesa",    icon: Armchair },
    { id: "TAKEOUT",  label: "Para Llevar", icon: ShoppingBag },
    { id: "DELIVERY", label: "Domicilio",   icon: Truck },
  ].filter(opt => allowedTypes.includes(opt.id as OrderType));

  return (
    <div className="flex p-1.5 bg-[#121316] rounded-2xl border border-white/5 w-full shadow-inner">
      {options.map((opt) => {
        const isActive = active === opt.id;
        const Icon = opt.icon;
        
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id as OrderType)}
            className={`
              flex-1 h-14 flex items-center justify-center gap-3 rounded-[0.875rem]
              text-[11px] font-black uppercase tracking-[0.15em] transition-all active:scale-95
              ${isActive 
                ? "bg-amber-500 text-[#0a0a0c] shadow-[0_5px_15px_rgba(255,184,77,0.3)]" 
                : "text-zinc-600 active:bg-white/5 active:text-white"}
            `}
          >
            <Icon size={18} strokeWidth={isActive ? 3 : 2} />
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default OrderTypeToggle;
