"use client";
import React from "react";
import { Utensils, ShoppingBag, Bike, Car, CalendarClock, Zap, ArrowRight } from "lucide-react";
import type { OrderType } from "@/components/tpv/TicketPanel";

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
    color: "#ffb84d",
  },
  {
    id: "TAKEOUT",
    title: "Para Llevar",
    desc: "Cliente recoge el mostrador",
    icon: ShoppingBag,
    color: "#3b82f6",
  },
  {
    id: "DELIVERY",
    title: "A Domicilio",
    desc: "Preparación y entrega al cliente",
    icon: Bike,
    color: "#10b981",
  },
  {
    id: "DRIVE_THRU",
    title: "Drive Thru",
    desc: "Atención en ventanilla auto",
    icon: Car,
    color: "#f59e0b",
  },
  {
    id: "RESERVA",
    title: "Reserva",
    desc: "Cliente con mesa reservada",
    icon: CalendarClock,
    color: "#EC4899",
  },
  {
    id: "FAST",
    title: "Venta Rápida",
    desc: "Cobro directo sin asignación",
    icon: Zap,
    color: "#8B5CF6",
  },
];

const OrderTypeSelector: React.FC<OrderTypeSelectorProps> = ({ 
  onSelect,
  openOrdersCount = 0,
  onOpenTickets,
  onClose 
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-[#0a0a0c] font-sans">
      {/* Warm Tech Ambient Glows */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute -top-60 -left-60 w-[600px] h-[600px] bg-amber-500/5 blur-[120px] rounded-full" />
        <div className="absolute -bottom-60 -right-60 w-[600px] h-[600px] bg-amber-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-5xl p-8 flex flex-col items-center">
        <div className="text-center mb-16">
          <div className="inline-block px-4 py-1.5 mb-6 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-amber-500 bg-amber-500/10 border border-amber-500/20">
            Módulo de Ventas
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-tight">
            ¿Cómo se servirá<br />esta orden?
          </h1>
          <p className="mt-4 text-base text-zinc-500 font-bold max-w-lg mx-auto leading-relaxed">
            Selecciona el formato de servicio para iniciar el ticket
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const isPrimary = t.id === "DINE_IN";
            return (
              <button
                key={t.id}
                onClick={() => onSelect(t.id as ExtendedOrderType)}
                className={`
                  group relative flex flex-col items-start text-left p-8 rounded-[2.5rem] transition-all duration-300
                  active:scale-95 border border-white/5 bg-[#121316] shadow-xl overflow-hidden
                  ${isPrimary ? "ring-2 ring-amber-500/50" : ""}
                `}
              >
                <div 
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-8 shadow-2xl transition-transform group-active:scale-90`}
                  style={{ background: isPrimary ? "#ffb84d" : "#1a1b1f", color: isPrimary ? "#0a0a0c" : t.color }}
                >
                  <Icon size={32} strokeWidth={2.5} />
                </div>
                
                <h3 className="text-2xl font-black text-white mb-2 tracking-tight">{t.title}</h3>
                <p className="text-[13px] text-zinc-500 font-bold leading-relaxed max-w-[85%] mb-4">
                  {t.desc}
                </p>

                <div className={`absolute bottom-8 right-8 transition-transform group-active:translate-x-1 ${isPrimary ? "text-amber-500" : "text-zinc-700"}`}>
                  <ArrowRight size={24} strokeWidth={3} />
                </div>
                
                {isPrimary && (
                  <div className="absolute top-0 right-0 p-3">
                     <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {(onOpenTickets || onClose) && (
          <div className="mt-16 flex flex-col sm:flex-row gap-6 w-full max-w-xl">
            {onOpenTickets && (
              <button
                onClick={onOpenTickets}
                className="flex-1 h-16 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 transition-all active:scale-95 shadow-[0_10px_30px_rgba(255,184,77,0.2)]"
              >
                <span>Tickets abiertos</span>
                {openOrdersCount > 0 && (
                  <span className="bg-[#0a0a0c] text-amber-500 px-2.5 py-0.5 rounded-lg text-[10px]">
                    {openOrdersCount}
                  </span>
                )}
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="flex-1 h-16 rounded-2xl bg-[#121316] border border-white/5 flex items-center justify-center transition-all active:scale-95 text-xs font-black uppercase tracking-[0.2em] text-zinc-500 active:text-white"
              >
                Cerrar Panel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderTypeSelector;
