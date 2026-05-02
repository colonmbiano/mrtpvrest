"use client";
import React from "react";
import { Utensils, ShoppingBag, Bike, Car, CalendarClock, Zap, ArrowRight } from "lucide-react";
import type { OrderType } from "@/components/tpv/TicketPanel";

// Expand allowed types for the UI, though the backend might only support 3 for now
export type ExtendedOrderType = OrderType | "DRIVE_THRU" | "RESERVA" | "FAST";

interface OrderTypeSelectorProps {
  onSelect: (type: ExtendedOrderType) => void;
  openOrdersCount?: number;
  onOpenTickets?: () => void;
  onClose?: () => void;
}

const TYPES = [
  {
    id: "DINE_IN",
    title: "Comer Aquí",
    desc: "Asignar mesa o atender en sala",
    icon: Utensils,
    color: "#FF8400", // brand orange
    accent: "bg-brand text-brand-fg",
  },
  {
    id: "TAKEOUT",
    title: "Para Llevar",
    desc: "Cliente recoge el mostrador",
    icon: ShoppingBag,
    color: "#5E6AD2", // brand purple
    accent: "bg-surface-2 text-tx-pri",
  },
  {
    id: "DELIVERY",
    title: "A Domicilio",
    desc: "Preparación y entrega al cliente",
    icon: Bike,
    color: "#10B981", // brand green
    accent: "bg-surface-2 text-tx-pri",
  },
  {
    id: "DRIVE_THRU",
    title: "Drive Thru",
    desc: "Atención en ventanilla auto",
    icon: Car,
    color: "#F59E0B",
    accent: "bg-surface-2 text-tx-pri",
  },
  {
    id: "RESERVA",
    title: "Reserva",
    desc: "Cliente con mesa reservada",
    icon: CalendarClock,
    color: "#EC4899",
    accent: "bg-surface-2 text-tx-pri",
  },
  {
    id: "FAST",
    title: "Pedido Rápido",
    desc: "Venta directa sin asignación",
    icon: Zap,
    color: "#8B5CF6",
    accent: "bg-surface-2 text-tx-pri",
  },
];

const OrderTypeSelector: React.FC<OrderTypeSelectorProps> = ({ 
  onSelect,
  openOrdersCount = 0,
  onOpenTickets,
  onClose 
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-mono overflow-auto" style={{ background: "#0C0C0E" }}>
      {/* Halo Glows */}
      <div 
        className="absolute pointer-events-none"
        style={{
          width: 800, height: 800, top: -200, left: -200,
          background: "radial-gradient(circle, #FF840020 0%, #FF840000 70%)"
        }}
      />
      <div 
        className="absolute pointer-events-none"
        style={{
          width: 900, height: 900, bottom: -150, right: -150,
          background: "radial-gradient(circle, #88D66C15 0%, #88D66C00 70%)"
        }}
      />

      <div className="relative z-10 w-full max-w-4xl p-6 flex flex-col items-center">
        <div className="text-center mb-10">
          <div className="inline-block px-3 py-1 mb-4 rounded-full text-[10px] font-bold uppercase tracking-widest text-brand bg-brand-soft border border-brand/20">
            Nuevo Pedido
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-tx-pri tracking-tight">
            ¿Qué tipo de pedido?
          </h1>
          <p className="mt-3 text-sm text-tx-mut">
            Selecciona el formato con el que se servirá la orden
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 w-full">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const isPrimary = t.id === "DINE_IN";
            return (
              <button
                key={t.id}
                onClick={() => onSelect(t.id as ExtendedOrderType)}
                className={`
                  group relative flex flex-col items-start text-left p-6 rounded-3xl transition-all duration-300
                  hover:scale-[1.02] active:scale-95 border
                  ${isPrimary ? "border-brand bg-brand/10" : "border-border bg-surface-2 hover:border-brand/50"}
                `}
              >
                <div 
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 shadow-lg transition-transform group-hover:scale-110`}
                  style={{ background: isPrimary ? "var(--brand)" : "var(--surface-3)", color: isPrimary ? "var(--brand-fg)" : t.color }}
                >
                  <Icon size={24} />
                </div>
                
                <h3 className="text-xl font-bold text-tx-pri mb-2">{t.title}</h3>
                <p className="text-xs text-tx-mut leading-relaxed max-w-[80%]">
                  {t.desc}
                </p>

                <div className={`absolute bottom-6 right-6 transition-transform group-hover:translate-x-1 ${isPrimary ? "text-brand" : "text-tx-dis"}`}>
                  <ArrowRight size={20} />
                </div>
              </button>
            );
          })}
        </div>

        {(onOpenTickets || onClose) && (
          <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full max-w-md">
            {onOpenTickets && (
              <button
                onClick={onOpenTickets}
                className="flex-1 h-14 rounded-2xl bg-surf-2 hover:bg-surf-3 border border-bd flex items-center justify-center gap-3 transition-all active:scale-95"
              >
                <span className="text-xs font-black uppercase tracking-widest text-tx-pri">
                  Tickets abiertos {openOrdersCount > 0 && `(${openOrdersCount})`}
                </span>
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="flex-1 h-14 rounded-2xl bg-transparent border border-bd hover:bg-surf-2 flex items-center justify-center transition-all active:scale-95 text-xs font-black uppercase tracking-widest text-tx-mut hover:text-tx-pri"
              >
                Cerrar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderTypeSelector;
