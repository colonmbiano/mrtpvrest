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
    { id: "DINE_IN",  label: "Mesa",      icon: Armchair },
    { id: "TAKEOUT",  label: "Llevar",    icon: ShoppingBag },
    { id: "DELIVERY", label: "Domicilio", icon: Truck },
  ].filter(opt => allowedTypes.includes(opt.id as OrderType));

  return (
    <div className="flex p-1 bg-surf-2 rounded-lg border border-bd w-full">
      {options.map((opt) => {
        const isActive = active === opt.id;
        const Icon = opt.icon;
        
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id as OrderType)}
            className={`
              flex-1 h-9 flex items-center justify-center gap-2 rounded-md
              text-[12px] font-bold transition-pos
              ${isActive 
                ? "bg-iris-500 text-white shadow-sm" 
                : "text-tx-sec hover:text-tx-pri hover:bg-surf-3"}
            `}
          >
            <Icon size={14} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default OrderTypeToggle;
