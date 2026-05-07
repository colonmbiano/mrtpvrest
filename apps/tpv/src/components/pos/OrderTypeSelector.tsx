"use client";
import React from "react";
import { Utensils, ShoppingBag, Bike, LayoutGrid, Wallet, Settings, ArrowRight } from "lucide-react";
import type { OrderType } from "@/components/tpv/TicketPanel";

export type ExtendedOrderType = OrderType;

interface OrderTypeSelectorProps {
  onSelect: (type: ExtendedOrderType) => void;
  openOrdersCount?: number;
  onOpenTickets?: () => void;
  onClose?: () => void;
  onTables?: () => void;
  onShiftClose?: () => void;
  onConfig?: () => void;
}

type OrderTypeCard = {
  id: OrderType;
  title: string;
  desc: string;
  icon: typeof Utensils;
  color: string;
};

const ORDER_TYPES: OrderTypeCard[] = [
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
    desc: "Cliente recoge en mostrador",
    icon: ShoppingBag,
    color: "#3b82f6",
  },
  {
    id: "DELIVERY",
    title: "Delivery",
    desc: "Preparación y entrega al cliente",
    icon: Bike,
    color: "#10b981",
  },
];

const OrderTypeSelector: React.FC<OrderTypeSelectorProps> = ({
  onSelect,
  openOrdersCount = 0,
  onOpenTickets,
  onClose,
  onTables,
  onShiftClose,
  onConfig,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-[#0a0a0c] font-sans">
      {/* Warm Tech ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-60 -left-60 w-[600px] h-[600px] bg-amber-500/5 blur-[120px] rounded-full" />
        <div className="absolute -bottom-60 -right-60 w-[600px] h-[600px] bg-amber-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-5xl p-6 sm:p-8 flex flex-col items-center">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-block px-4 py-1.5 mb-6 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-amber-500 bg-amber-500/10 border border-amber-500/20">
            Panel de Operación
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
            ¿Cómo iniciamos<br />tu turno?
          </h1>
          <p className="mt-4 text-base text-zinc-500 font-bold max-w-lg mx-auto leading-relaxed">
            Elige el tipo de servicio o ejecuta una acción operativa
          </p>
        </div>

        {/* === Grid principal: SOLO 3 tipos operativos === */}
        <div className="w-full mb-10">
          <div className="flex items-center gap-3 mb-4 px-1">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-500">
              Nueva Orden
            </span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {ORDER_TYPES.map((t) => {
              const Icon = t.icon;
              const isPrimary = t.id === "DINE_IN";
              return (
                <button
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  className={`
                    group relative flex flex-col items-start text-left p-7 rounded-[2rem]
                    min-h-[64px] py-4 transition-transform duration-150 active:scale-95
                    border border-white/5 bg-[#121316] shadow-xl overflow-hidden
                    ${isPrimary ? "ring-2 ring-amber-500/50" : ""}
                  `}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-2xl"
                    style={{
                      background: isPrimary ? "#ffb84d" : "#1a1b1f",
                      color: isPrimary ? "#0a0a0c" : t.color,
                    }}
                  >
                    <Icon size={28} strokeWidth={2.5} />
                  </div>

                  <h3 className="text-xl font-black text-white mb-1 tracking-tight">{t.title}</h3>
                  <p className="text-[12px] text-zinc-500 font-bold leading-relaxed max-w-[85%] mb-2">
                    {t.desc}
                  </p>

                  <div
                    className={`absolute bottom-6 right-6 ${
                      isPrimary ? "text-amber-500" : "text-zinc-700"
                    }`}
                  >
                    <ArrowRight size={22} strokeWidth={3} />
                  </div>

                  {isPrimary && (
                    <div className="absolute top-3 right-3">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* === Acciones Rápidas === */}
        {(onTables || onShiftClose || onOpenTickets) && (
          <div className="w-full mb-10">
            <div className="flex items-center gap-3 mb-4 px-1">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">
                Acciones Rápidas
              </span>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {onTables && (
                <button
                  onClick={onTables}
                  className="flex items-center gap-4 px-5 py-4 min-h-[64px] rounded-2xl bg-[#121316] border border-white/5 active:scale-95 transition-transform duration-150"
                >
                  <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0">
                    <LayoutGrid size={22} strokeWidth={2.5} />
                  </div>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-sm font-black text-white tracking-tight">Mapa de Mesas</span>
                    <span className="text-[11px] text-zinc-500 font-bold truncate">Estado del salón en tiempo real</span>
                  </div>
                </button>
              )}

              {onShiftClose && (
                <button
                  onClick={onShiftClose}
                  className="flex items-center gap-4 px-5 py-4 min-h-[64px] rounded-2xl bg-[#121316] border border-white/5 active:scale-95 transition-transform duration-150"
                >
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center flex-shrink-0">
                    <Wallet size={22} strokeWidth={2.5} />
                  </div>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-sm font-black text-white tracking-tight">Corte de Caja</span>
                    <span className="text-[11px] text-zinc-500 font-bold truncate">Cerrar turno y cuadrar dinero</span>
                  </div>
                </button>
              )}

              {onOpenTickets && (
                <button
                  onClick={onOpenTickets}
                  className="flex items-center gap-4 px-5 py-4 min-h-[64px] rounded-2xl bg-[#121316] border border-white/5 active:scale-95 transition-transform duration-150"
                >
                  <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0 relative">
                    <ShoppingBag size={22} strokeWidth={2.5} />
                    {openOrdersCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-[#0a0a0c] text-[10px] font-black flex items-center justify-center">
                        {openOrdersCount}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-sm font-black text-white tracking-tight">Tickets Abiertos</span>
                    <span className="text-[11px] text-zinc-500 font-bold truncate">Continuar pedidos en curso</span>
                  </div>
                </button>
              )}
            </div>
          </div>
        )}

        {/* === Botón Configuración (destacado) === */}
        {onConfig && (
          <button
            onClick={onConfig}
            className="w-full max-w-md flex items-center justify-center gap-3 px-6 py-4 min-h-[64px] rounded-2xl bg-[#ffb84d] text-[#0a0a0c] font-black uppercase tracking-[0.2em] text-xs active:scale-95 transition-transform duration-150 shadow-[0_10px_30px_rgba(255,184,77,0.25)]"
          >
            <Settings size={18} strokeWidth={2.5} />
            <span>Configuración</span>
          </button>
        )}

        {/* Cerrar sesión (secundario) */}
        {onClose && (
          <button
            onClick={onClose}
            className="mt-6 w-full max-w-md min-h-[64px] py-4 rounded-2xl bg-transparent border border-white/5 flex items-center justify-center text-[11px] font-black uppercase tracking-[0.25em] text-zinc-600 active:scale-95 transition-transform duration-150"
          >
            Cerrar Sesión
          </button>
        )}
      </div>
    </div>
  );
};

export default OrderTypeSelector;
